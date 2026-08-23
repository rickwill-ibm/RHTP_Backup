// SEAM: workflow-engine
/**
 * The in-memory WorkflowEngine (the fake). Deterministic (injected ManualClock),
 * per-member ordered (memberId partition via a promise-chain lock), and driven by
 * the HITL primitive `proposeAndWait`. A Temporal-class engine drops in at the
 * `// SEAM: workflow-engine` anchor implementing the SAME WorkflowEngine interface;
 * see FAKE_FIDELITY.md for exactly what this fake does NOT model vs real Temporal.
 *
 * Guardrail: the engine has NO API to set an authoritative domain state. Its only
 * mutation path is a proposal + a decision; an HITL proposal resolves ONLY on an
 * external human signal. Autonomy tier is READ from the manifest and mapped to
 * decision behavior through a data lookup (AUTONOMY_BEHAVIOR), never a code branch.
 */
import { buildAgentEvent } from './events';
import { buildProposalWorkItem } from './inbox';
import { getEscalationTier, nextEscalationStep } from './escalation';
import { isAutoApprovable } from '@/lib/agents/governance';
import {
  AUTONOMY_BEHAVIOR,
  defer,
  type Instance,
  type PendingRecord,
  type RuntimeDeps,
  type TimerEntry,
} from './engineSupport';
import type {
  HumanDecision,
  ProposedAction,
  StartOptions,
  TimerSpec,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowEngine,
  WorkflowHandle,
  WorkflowSignal,
  WorkflowSnapshot,
} from './types';

export type { RuntimeDeps } from './engineSupport';

export class InMemoryWorkflowEngine implements WorkflowEngine {
  private readonly instances = new Map<string, Instance>();
  private readonly pending = new Map<string, PendingRecord>();
  private readonly timers = new Map<string, TimerEntry>();
  private readonly memberChains = new Map<string, Promise<void>>();
  private wfCounter = 0;
  private proposalCounter = 0;
  private timerCounter = 0;

  constructor(private readonly deps: RuntimeDeps) {}

  // ── WorkflowEngine ──────────────────────────────────────────────────────────

  start<I, O>(def: WorkflowDefinition<I, O>, opts: StartOptions<I>): WorkflowHandle<O> {
    const workflowId = opts.workflowId ?? `${def.agentId}::${opts.memberId}::${this.wfCounter++}`;
    const correlationId = opts.correlationId ?? `corr::${workflowId}`;
    const now = this.deps.clock.now();
    const done = defer<unknown>();
    const snapshot: WorkflowSnapshot = {
      workflowId,
      memberId: opts.memberId,
      agentId: def.agentId,
      status: 'running',
      startedAtMs: now,
      updatedAtMs: now,
    };
    this.instances.set(workflowId, { snapshot, done });
    const ctx = this.makeContext(def, opts.memberId, workflowId, correlationId);
    Promise.resolve()
      .then(() => def.run(ctx, opts.input))
      .then((result) => {
        this.settle(workflowId, 'completed', result);
      })
      .catch((err: unknown) => {
        this.fail(workflowId, err);
      });
    return { workflowId, memberId: opts.memberId, done: done.promise as Promise<O> };
  }

  async signal(workflowId: string, signal: WorkflowSignal): Promise<void> {
    const inst = this.instances.get(workflowId);
    if (!inst) return;
    await this.runOnMember(inst.snapshot.memberId, async () => {
      const rec = this.pending.get(signal.proposalId);
      if (!rec || rec.workflowId !== workflowId) return; // idempotent / unknown decision
      const decision = signal.name === 'agent.task.approved' ? 'approved' : 'rejected';
      await this.decide(rec, decision, signal.decidedBy);
    });
  }

  query(workflowId: string): WorkflowSnapshot | undefined {
    const inst = this.instances.get(workflowId);
    return inst ? { ...inst.snapshot } : undefined;
  }

  setTimer(workflowId: string, spec: TimerSpec): string {
    const inst = this.instances.get(workflowId);
    const memberId = inst ? inst.snapshot.memberId : 'unknown';
    return this.scheduleTimer(memberId, spec.delayMs, async () => {
      /* bare timer: no-op body; escalation uses its own scheduled callbacks */
    });
  }

  async complete(workflowId: string, result?: unknown): Promise<void> {
    this.settle(workflowId, 'completed', result);
  }

  // ── Test/driver seam: advance virtual time and fire due timers in order ──────

  /**
   * Advance the injected clock by `ms` and fire every timer now due, in
   * (dueAt, insertion) order, each under its member lock (preserves per-member
   * ordering). Not part of WorkflowEngine — a real engine fires on real time.
   */
  async advanceTime(ms: number): Promise<void> {
    const target = this.deps.clock.advance(ms);
    for (;;) {
      const due = [...this.timers.values()]
        .filter((t) => !t.cancelled && t.dueAtMs <= target)
        .sort((a, b) => a.dueAtMs - b.dueAtMs || a.seq - b.seq);
      if (due.length === 0) break;
      const t = due[0];
      this.timers.delete(t.id);
      await this.runOnMember(t.memberId, () => t.fire());
    }
  }

  // ── HITL primitive ───────────────────────────────────────────────────────────

  private makeContext<I, O>(
    def: WorkflowDefinition<I, O>,
    memberId: string,
    workflowId: string,
    correlationId: string,
  ): WorkflowContext {
    const self = this;
    return {
      workflowId,
      memberId,
      agentId: def.agentId,
      correlationId,
      now: () => self.deps.clock.now(),
      proposeAndWait: (action) => self.proposeAndWait(def.agentId, memberId, workflowId, correlationId, action),
      useTool: async (tool, fn) => {
        self.deps.registry.assertToolAllowed(def.agentId, tool); // least privilege (§10.3)
        return fn();
      },
      setTimer: (spec) => self.setTimer(workflowId, spec),
      autonomyTier: () => self.deps.registry.get(def.agentId).autonomyTier,
    };
  }

  private async proposeAndWait(
    agentId: string,
    memberId: string,
    workflowId: string,
    correlationId: string,
    action: ProposedAction,
  ): Promise<HumanDecision> {
    const manifest = this.deps.registry.get(agentId);
    const proposalId = `${workflowId}::p${this.proposalCounter++}`;
    const now = this.deps.clock.now();
    const tier = getEscalationTier(this.deps.escalationPolicies, manifest.escalationPolicyRef, action.priority);
    const item = buildProposalWorkItem({ proposalId, memberId, action, submittedAtMs: now });

    await this.emit(agentId, 'agent.task.proposed', memberId, workflowId, correlationId, now, proposalId, {
      actionType: action.actionType,
      priority: action.priority,
      refs: action.refs ?? {},
      autonomyTier: manifest.autonomyTier,
      escalationPolicyRef: manifest.escalationPolicyRef,
    });

    const decided = defer<HumanDecision>();
    const rec: PendingRecord = {
      proposalId,
      workflowId,
      memberId,
      agentId,
      action,
      correlationId,
      tier,
      hopsSoFar: 0,
      parked: false,
      item,
      resolve: decided.resolve,
    };
    this.pending.set(proposalId, rec);
    await this.deps.inbox.enqueue({ proposalId, workflowId, memberId, agentId, item, status: 'pending' });
    this.setStatus(workflowId, 'waiting-decision', proposalId);

    // Autonomy tier -> decision behavior via DATA lookup (never a branch on agentId).
    // HW-AI / I16 (C-DEC): the tier-independent invariant. An adverse coverage-
    // affecting action (a denial / termination / reduction) can NEVER auto-resolve,
    // regardless of HITL / HOTL / autonomous — it is forced onto the human path.
    // This kills the HOTL SLA-timeout auto-approve and the autonomous-tier flip for
    // adverse determinations, which qualified humans must make.
    const behavior = isAutoApprovable(action, manifest.autonomyTier)
      ? AUTONOMY_BEHAVIOR[manifest.autonomyTier].autoApprove
      : 'human-required';
    if (behavior === 'immediate') {
      void Promise.resolve().then(() =>
        this.runOnMember(memberId, () => this.decide(rec, 'approved', `autonomy:${manifest.autonomyTier}`)),
      );
    } else if (behavior === 'after-sla') {
      rec.timerId = this.scheduleTimer(memberId, tier.slaHours * 3600_000, async () => {
        if (this.pending.get(proposalId) === rec)
          await this.decide(rec, 'approved', `autonomy:${manifest.autonomyTier}`);
      });
    } else {
      // HITL or an adverse coverage action: escalate on SLA breach; resolve ONLY on
      // an external qualified-human signal (never an auto-approve timer).
      this.scheduleEscalation(rec);
    }
    return decided.promise;
  }

  private async decide(rec: PendingRecord, decision: 'approved' | 'rejected', decidedBy: string): Promise<void> {
    if (!this.pending.has(rec.proposalId)) return;
    this.pending.delete(rec.proposalId);
    if (rec.timerId) this.cancelTimer(rec.timerId);
    const now = this.deps.clock.now();
    const eventType = decision === 'approved' ? 'agent.task.approved' : 'agent.task.rejected';
    await this.emit(rec.agentId, eventType, rec.memberId, rec.workflowId, rec.correlationId, now, rec.proposalId, {
      decidedBy,
      actionType: rec.action.actionType,
    });
    if (decision === 'approved') {
      await this.emit(
        rec.agentId,
        'agent.task.executed',
        rec.memberId,
        rec.workflowId,
        rec.correlationId,
        now,
        rec.proposalId,
        { actionType: rec.action.actionType, decidedBy },
      );
    }
    await this.deps.inbox.resolve(rec.proposalId, decision, decidedBy);
    this.setStatus(rec.workflowId, 'running', undefined);
    rec.resolve({ decision, decidedBy, proposalId: rec.proposalId, decidedAtMs: now });
  }

  // ── Escalation (timer-driven, escalation-as-data) ────────────────────────────

  private scheduleEscalation(rec: PendingRecord): void {
    rec.timerId = this.scheduleTimer(rec.memberId, rec.tier.slaHours * 3600_000, async () => {
      if (this.pending.get(rec.proposalId) !== rec) return; // decided -> cancelled
      const step = nextEscalationStep(rec.tier, rec.hopsSoFar);
      const now = this.deps.clock.now();
      if (step.kind === 'escalate') {
        rec.hopsSoFar += 1;
        rec.item = { ...rec.item, queue: 'escalated' };
        await this.deps.inbox.enqueue({
          proposalId: rec.proposalId,
          workflowId: rec.workflowId,
          memberId: rec.memberId,
          agentId: rec.agentId,
          item: rec.item,
          status: 'pending',
        });
        await this.emit(
          rec.agentId,
          'agent.task.escalated',
          rec.memberId,
          rec.workflowId,
          rec.correlationId,
          now,
          rec.proposalId,
          { hop: 'escalate', level: step.level, target: step.target, priority: rec.action.priority },
        );
        this.scheduleEscalation(rec); // next hop after another SLA window
      } else {
        rec.parked = true; // parked with audit; re-activatable, NEVER silently expired
        await this.emit(
          rec.agentId,
          'agent.task.escalated',
          rec.memberId,
          rec.workflowId,
          rec.correlationId,
          now,
          rec.proposalId,
          { hop: 'park', parked: true, auditedHops: step.auditedHops, priority: rec.action.priority },
        );
      }
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private scheduleTimer(memberId: string, delayMs: number, fire: () => Promise<void>): string {
    const id = `t${this.timerCounter++}`;
    this.timers.set(id, {
      id,
      memberId,
      dueAtMs: this.deps.clock.now() + delayMs,
      seq: this.timerCounter,
      cancelled: false,
      fire,
    });
    return id;
  }

  private cancelTimer(id: string): void {
    const t = this.timers.get(id);
    if (t) t.cancelled = true;
  }

  private runOnMember(memberId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.memberChains.get(memberId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.memberChains.set(
      memberId,
      next.catch(() => undefined),
    );
    return next;
  }

  private emit(
    agentId: string,
    eventType: Parameters<typeof buildAgentEvent>[0]['eventType'],
    memberId: string,
    workflowId: string,
    correlationId: string,
    occurredAtMs: number,
    proposalId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.deps.eventSink.emit(
      buildAgentEvent({ eventType, memberId, workflowId, agentId, occurredAtMs, correlationId, proposalId, payload }),
    );
  }

  private setStatus(workflowId: string, status: WorkflowSnapshot['status'], awaitingProposalId?: string): void {
    const inst = this.instances.get(workflowId);
    if (!inst) return;
    inst.snapshot.status = status;
    inst.snapshot.updatedAtMs = this.deps.clock.now();
    if (awaitingProposalId) inst.snapshot.awaitingProposalId = awaitingProposalId;
    else delete inst.snapshot.awaitingProposalId;
  }

  private settle(workflowId: string, status: 'completed' | 'failed', result: unknown): void {
    const inst = this.instances.get(workflowId);
    if (!inst || inst.done.settled) return;
    inst.done.settled = true;
    inst.snapshot.status = status;
    inst.snapshot.updatedAtMs = this.deps.clock.now();
    inst.snapshot.result = result;
    inst.done.resolve(result);
  }

  private fail(workflowId: string, err: unknown): void {
    const inst = this.instances.get(workflowId);
    if (!inst || inst.done.settled) return;
    inst.done.settled = true;
    inst.snapshot.status = 'failed';
    inst.snapshot.error = err instanceof Error ? err.message : String(err);
    inst.snapshot.updatedAtMs = this.deps.clock.now();
    inst.done.reject(err);
  }
}

/** Construct the in-memory runtime engine (the fake). */
export function createInMemoryWorkflowEngine(deps: RuntimeDeps): InMemoryWorkflowEngine {
  return new InMemoryWorkflowEngine(deps);
}
