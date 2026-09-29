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
import { getEscalationTier } from './escalation';
import { scheduleEscalation, type LadderPort } from './escalationLadder';
import { isAutoApprovable } from '@/lib/agents/governance';
import {
  AUTONOMY_BEHAVIOR,
  defer,
  type Instance,
  assertSignalDecider,
  decisionBehavior,
  determinationScope,
  setAwaiting,
  WorkflowTerminatedError,
  type PendingRecord,
  type RuntimeDeps,
} from './engineSupport';
import { MemberTimers } from './memberTimers';
import {
  failInstance,
  settleInstance,
  terminateInstance,
  type TerminalDeps,
} from './instanceTerminal';
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
  private readonly timers: MemberTimers;
  private wfCounter = 0;
  private proposalCounter = 0;

  constructor(private readonly deps: RuntimeDeps) {
    this.timers = new MemberTimers(deps.clock);
  }

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
    this.instances.set(workflowId, {
      snapshot,
      done,
      agentId: def.agentId,
      memberId: opts.memberId,
      correlationId,
    });
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
      assertSignalDecider(rec, signal); // G-045 — THROWS; a refused resolution must be loud
      // A HUMAN is waiting on this one, so a terminated workflow must refuse OUT LOUD rather than
      // return silently. The machine paths (auto-approve, the after-SLA timer) take the same check
      // through `decidable` and simply stop: nobody is waiting, and throwing there landed in a
      // `void`ed promise chain as an unhandled rejection.
      const state = this.decidable(rec);
      if (state === 'terminated')
        throw new WorkflowTerminatedError(rec.proposalId, this.statusOf(rec.workflowId));
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

  /**
   * Advance the injected clock by `ms` and fire every timer now due, in (dueAt, insertion) order,
   * each under its member lock. Not part of WorkflowEngine — a real engine fires on real time.
   */
  async advanceTime(ms: number): Promise<void> {
    await this.timers.advance(ms);
  }

  // ── HITL primitive ───────────────────────────────────────────────────────────

  private makeContext<I, O>(
    def: WorkflowDefinition<I, O>,
    memberId: string,
    workflowId: string,
    correlationId: string
  ): WorkflowContext {
    return {
      workflowId,
      memberId,
      agentId: def.agentId,
      correlationId,
      now: () => this.deps.clock.now(),
      proposeAndWait: (action) =>
        this.proposeAndWait(def.agentId, memberId, workflowId, correlationId, action),
      useTool: async (tool, fn) => {
        this.deps.registry.assertToolAllowed(def.agentId, tool); // least privilege (§10.3)
        return fn();
      },
      setTimer: (spec) => this.setTimer(workflowId, spec),
      autonomyTier: () => this.deps.registry.get(def.agentId).autonomyTier,
    };
  }

  private async proposeAndWait(
    agentId: string,
    memberId: string,
    workflowId: string,
    correlationId: string,
    action: ProposedAction
  ): Promise<HumanDecision> {
    const manifest = this.deps.registry.get(agentId);
    const proposalId = `${workflowId}::p${this.proposalCounter++}`;
    const now = this.deps.clock.now();
    const tier = getEscalationTier(
      this.deps.escalationPolicies,
      manifest.escalationPolicyRef,
      action.priority
    );
    const item = buildProposalWorkItem({ proposalId, memberId, action, submittedAtMs: now });

    await this.emit({
      agentId,
      eventType: 'agent.task.proposed',
      memberId,
      workflowId,
      correlationId,
      occurredAtMs: now,
      proposalId,
      payload: {
        actionType: action.actionType,
        priority: action.priority,
        refs: action.refs ?? {},
        autonomyTier: manifest.autonomyTier,
        escalationPolicyRef: manifest.escalationPolicyRef,
      },
    });
    const scope = determinationScope(action);
    const tierBehavior = AUTONOMY_BEHAVIOR[manifest.autonomyTier].autoApprove;
    const behavior = decisionBehavior(
      isAutoApprovable(action, manifest.autonomyTier),
      tierBehavior
    );
    const decided = defer<HumanDecision>();
    const rec: PendingRecord = {
      proposalId,
      humanRequired: behavior === 'human-required', // read by signal() to demand a reviewer proof
      ...scope, // determinationClass + needDomain, from the ACTION; refuses adverse w/o needDomain
      workflowId,
      memberId,
      agentId,
      action,
      correlationId,
      tier,
      hopsSoFar: 0,
      item,
      resolve: decided.resolve,
    };
    this.pending.set(proposalId, rec);
    await this.deps.inbox.enqueue({
      proposalId,
      workflowId,
      memberId,
      agentId,
      item,
      status: 'pending',
    });
    this.setStatus(workflowId, 'waiting-decision', proposalId, scope);
    const inst0 = this.instances.get(workflowId);
    if (inst0) inst0.lastProposalId = proposalId; // join key for the settle event

    if (behavior === 'immediate') {
      // `.catch` is not optional here. `runOnMember` returns a promise that DOES reject (only the
      // stored chain swallows), `decide` awaits two injected seams — an outbox writer and a durable
      // queue in production, i.e. things that fail — and a `void`ed rejection is an unhandled
      // rejection that, on Node's default, takes the process. Worse, `rec.resolve` is never reached,
      // so the workflow hangs at `waiting-decision` with no timer armed and no signal path: a silent
      // wedge. Failing the instance puts it in a terminal state WITH a record instead.
      void Promise.resolve()
        .then(() =>
          this.runOnMember(memberId, () =>
            this.decide(rec, 'approved', `autonomy:${manifest.autonomyTier}`)
          )
        )
        .catch((err: unknown) => this.fail(workflowId, err));
    } else if (behavior === 'after-sla') {
      rec.timerId = this.scheduleTimer(memberId, tier.slaHours * 3600_000, async () => {
        if (this.pending.get(proposalId) === rec)
          await this.decide(rec, 'approved', `autonomy:${manifest.autonomyTier}`);
      });
    } else {
      // HITL or an adverse coverage action: escalate on SLA breach; resolve ONLY on
      // an external qualified-human signal (never an auto-approve timer).
      scheduleEscalation(this.ladderPort(), rec);
    }
    return decided.promise;
  }

  /**
   * May this proposal still be decided?
   *
   * FAIL-CLOSED ON A MISSING INSTANCE. `!inst` returns `'terminated'`, not `'ok'`. The instance map
   * is never reaped today, so an absent instance is unreachable — but the moment anything evicts
   * (and a Temporal-class engine ages history out by design), an optional-chained `inst?.done.settled`
   * would read `undefined`, fall through as falsy, and resume a body the runtime had abandoned.
   * That is the whole defect this guard exists to prevent, reintroduced by a `?.`.
   */
  private decidable(rec: PendingRecord): 'ok' | 'gone' | 'terminated' {
    if (!this.pending.has(rec.proposalId)) return 'gone';
    const inst = this.instances.get(rec.workflowId);
    if (!inst || inst.done.settled) return 'terminated';
    return 'ok';
  }

  private statusOf(workflowId: string): string {
    return this.instances.get(workflowId)?.snapshot.status ?? 'gone';
  }

  private async decide(
    rec: PendingRecord,
    decision: 'approved' | 'rejected',
    decidedBy: string
  ): Promise<void> {
    if (this.decidable(rec) !== 'ok') return; // signal() raises; the machine paths stay quiet
    this.pending.delete(rec.proposalId);
    if (rec.timerId) this.cancelTimer(rec.timerId);
    const now = this.deps.clock.now();
    const eventType = decision === 'approved' ? 'agent.task.approved' : 'agent.task.rejected';
    await this.emit({
      agentId: rec.agentId,
      eventType,
      memberId: rec.memberId,
      workflowId: rec.workflowId,
      correlationId: rec.correlationId,
      occurredAtMs: now,
      proposalId: rec.proposalId,
      payload: {
        decidedBy,
        actionType: rec.action.actionType,
        ...(decision === 'approved' ? { effectPending: true } : {}),
      },
    });
    // NO `agent.task.executed` HERE (G-002). The engine performs no effects — `useTool` does — so an
    // `executed` emitted at APPROVAL time was the engine asserting an effect it neither performed nor
    // observed, before the body had even resumed to attempt its state transition. The truthful
    // record of "what happened" is `agent.task.settled`, emitted when the workflow actually settles.
    //
    // `effectPending` makes the interval queryable: an `approved` with no matching `settled` is an
    // OPEN item, which is what a crash between the two looks like. Without it, silence after an
    // approval is indistinguishable from a workflow that never existed.
    await this.deps.inbox.resolve(rec.proposalId, decision, decidedBy);
    this.setStatus(rec.workflowId, 'running', undefined);
    rec.resolve({ decision, decidedBy, proposalId: rec.proposalId, decidedAtMs: now });
  }

  // ── Escalation (timer-driven, escalation-as-data) ────────────────────────────

  /**
   * The ladder's view of this engine. Five capabilities and no more; see `escalationLadder.ts` for
   * why the port is narrow rather than a handle on the engine itself.
   */
  private ladderPort(): LadderPort {
    return {
      isCurrent: (rec) => this.pending.get(rec.proposalId) === rec,
      now: () => this.deps.clock.now(),
      scheduleTimer: (memberId, delayMs, fire) => this.scheduleTimer(memberId, delayMs, fire),
      enqueue: (rec) =>
        this.deps.inbox.enqueue({
          proposalId: rec.proposalId,
          workflowId: rec.workflowId,
          memberId: rec.memberId,
          agentId: rec.agentId,
          item: rec.item,
          status: 'pending',
        }),
      emit: (rec, eventType, occurredAtMs, payload) =>
        this.emit({
          agentId: rec.agentId,
          eventType,
          memberId: rec.memberId,
          workflowId: rec.workflowId,
          correlationId: rec.correlationId,
          occurredAtMs,
          proposalId: rec.proposalId,
          payload,
        }),
      terminate: (workflowId) => this.terminate(workflowId),
    };
  }

  private terminate(workflowId: string): void {
    terminateInstance(this.instances.get(workflowId), this.terminalDeps());
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private scheduleTimer(memberId: string, delayMs: number, fire: () => Promise<void>): string {
    return this.timers.schedule(memberId, delayMs, fire);
  }

  private cancelTimer(id: string): void {
    this.timers.cancel(id);
  }

  private runOnMember(memberId: string, fn: () => Promise<void>): Promise<void> {
    return this.timers.runOnMember(memberId, fn);
  }

  /** One event, one object. `buildAgentEvent` asserts the type is pre-allocated and omits an
   *  absent `proposalId` rather than substituting anything for it. */
  private emit(e: Parameters<typeof buildAgentEvent>[0]): Promise<void> {
    return this.deps.eventSink.emit(buildAgentEvent(e));
  }

  private setStatus(
    workflowId: string,
    status: WorkflowSnapshot['status'],
    proposalId?: string,
    scope?: WorkflowSnapshot['awaitingScope']
  ): void {
    const inst = this.instances.get(workflowId);
    if (!inst || inst.done.settled) return; // a terminal status is terminal
    inst.snapshot.status = status;
    inst.snapshot.updatedAtMs = this.deps.clock.now();
    setAwaiting(inst.snapshot, proposalId, scope);
  }

  /** The terminal trio's view of this engine: the clock, and the one event they may emit. */
  private terminalDeps(): TerminalDeps {
    return {
      now: () => this.deps.clock.now(),
      emit: (inst, occurredAtMs, payload) =>
        void this.emit({
          agentId: inst.agentId,
          eventType: 'agent.task.settled',
          memberId: inst.memberId,
          workflowId: inst.snapshot.workflowId,
          correlationId: inst.correlationId,
          occurredAtMs,
          proposalId: inst.lastProposalId,
          payload,
        }),
    };
  }

  private settle(workflowId: string, status: 'completed' | 'failed', result: unknown): void {
    settleInstance(this.instances.get(workflowId), status, result, this.terminalDeps());
  }

  private fail(workflowId: string, err: unknown): void {
    failInstance(this.instances.get(workflowId), err, this.terminalDeps());
  }
}

/** Construct the in-memory runtime engine (the fake). */
export function createInMemoryWorkflowEngine(deps: RuntimeDeps): InMemoryWorkflowEngine {
  return new InMemoryWorkflowEngine(deps);
}
