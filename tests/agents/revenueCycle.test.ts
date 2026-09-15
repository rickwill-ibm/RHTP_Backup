/**
 * Revenue-Cycle agent (Wave-3 draft + Wave-4 governed submission) — the recovery
 * appeal under a human gate, and its post-approval submission.
 *
 * Proves the FIX-1 contract (EVOLVED in Wave-4) against the REAL workflow + runtime:
 *  (i)   the DRAFT is written BY the agent (deps.recordDraft) exactly once, at the
 *        interlock-permitted rung, BEFORE the proposeAndWait suspension;
 *  (ii)  an `agent-proposal` work item lands in the inbox + `agent.task.proposed`
 *        is emitted once;
 *  (iii) no `agent.task.executed`, and the workflow stays SUSPENDED — time never
 *        auto-approves a HITL proposal; AND submitAppeal is NOT invoked pre-decision
 *        (spy count 0 at suspension, even after advanceTime);
 *  (iv)  least-privilege: a variant using the still-forbidden `claim.submit` tool
 *        throws ToolNotAllowedError (only `claim.submit-appeal` is granted — FIX-1);
 *  (v)   buildRecoveryAction is PHI-safe (refs/codes/amounts only, no free-text);
 *  (vi)  the twin-ladder interlock caps the rung consumed by the draft: D1→A1, D0→A0;
 *  (vii) a qualified-human APPROVE → the agent runs `claim.submit-appeal` exactly once
 *        and returns outcome:'submitted' + the submissionRef;
 *  (viii)a `system` / `autonomy:*` decider is BLOCKED — the workflow throws
 *        (isQualifiedHumanDecision) and submitAppeal is NEVER called (no auto-submit
 *        path at any tier).
 */
import { describe, it, expect } from 'vitest';
import type { HumanDecision, WorkflowDefinition } from '@/lib/agentRuntime';
import { ToolNotAllowedError } from '@/lib/agents/manifest';
import {
  buildRecoveryAction,
  createRecoveryWorkflow,
  REVENUE_CYCLE_AGENT_ID,
  type RecoveryDeps,
  type RecoveryTask,
} from '@/lib/agents/revenueCycle';
import type { AuthorityRung } from '@/lib/evidence/tierConfig';
import {
  createRuntime,
  waitFor,
  flush,
  HOUR,
  approve,
  reject,
  registryWithTier,
  runtimeWithRegistry,
} from './helpers';

const TASK: RecoveryTask = {
  claimId: 'claim-7',
  remittanceId: 'rem-7',
  authId: 'auth-7',
  delta: 4250,
  evidenceTier: 'D3',
  priority: 'high',
};

/**
 * A recorder spy: captures every recordDraft call and every submitAppeal call, and
 * returns stub refs. `submitCalls` proves submission is post-approval-only.
 */
function spyDeps(): {
  deps: RecoveryDeps;
  calls: Array<{ task: RecoveryTask; rung: AuthorityRung }>;
  submitCalls: Array<{ task: RecoveryTask; decision: HumanDecision }>;
} {
  const calls: Array<{ task: RecoveryTask; rung: AuthorityRung }> = [];
  const submitCalls: Array<{ task: RecoveryTask; decision: HumanDecision }> = [];
  const deps: RecoveryDeps = {
    async recordDraft(task, rung) {
      calls.push({ task, rung });
      return { recoveryRef: `recovery::${task.remittanceId}` };
    },
    async submitAppeal(task, decision) {
      submitCalls.push({ task, decision });
      return { submissionRef: `appeal::${task.claimId}` };
    },
  };
  return { deps, calls, submitCalls };
}

describe('revenue-cycle agent: governed recovery DRAFT under a human gate', () => {
  it('writes the DRAFT via the agent (once, at the interlock rung) then suspends at the HITL gate, submitting NOTHING pre-decision', async () => {
    const { deps, calls, submitCalls } = spyDeps();
    const { engine, eventSink, inbox } = createRuntime();
    const handle = engine.start(createRecoveryWorkflow(deps), { memberId: 'm1', input: TASK });

    // Suspends at the HITL gate.
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision', 'suspended');

    // (i) the DRAFT was written by the AGENT, exactly once, BEFORE suspension, at
    // the interlock-permitted rung (HITL × D3 -> min(A1, A3) = A1).
    expect(calls).toHaveLength(1);
    expect(calls[0].task).toBe(TASK);
    expect(calls[0].rung).toBe('A1');

    // (ii) the proposal is emitted + an agent-proposal work item is enqueued.
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);
    const pending = await inbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].item.queue).toBe('agent-proposal');

    // (iii) NOT executed, and time alone never approves a HITL proposal — AND no
    // submission is attempted while waiting-decision, even after the SLA elapses.
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
    expect(submitCalls).toHaveLength(0);
    await engine.advanceTime(240 * HOUR);
    await flush();
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
    // The draft is not re-written on escalation, and STILL nothing was submitted.
    expect(calls).toHaveLength(1);
    expect(submitCalls).toHaveLength(0);
  });

  it('Wave-4: a qualified-human APPROVE runs claim.submit-appeal exactly once → outcome submitted', async () => {
    const { deps, submitCalls } = spyDeps();
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createRecoveryWorkflow(deps), { memberId: 'm-ok', input: TASK });

    await waitFor(
      () => engine.query(handle.workflowId)?.status === 'waiting-decision',
      'suspended-before-approve',
    );
    // Not before the decision.
    expect(submitCalls).toHaveLength(0);

    // A qualified human (reviewer:*) approves → the workflow resumes, asserts the
    // qualified-human decision, and runs the governed submit tool once.
    await approve(engine, handle.workflowId, 'reviewer:rn-9');
    const result = await handle.done;

    expect(result.outcome).toBe('submitted');
    if (result.outcome === 'submitted') {
      expect(result.submissionRef).toBe('appeal::claim-7');
      expect(result.decidedBy).toBe('reviewer:rn-9');
      expect(result.rung).toBe('A1');
    }
    expect(submitCalls).toHaveLength(1);
    expect(submitCalls[0].task).toBe(TASK);
    expect(submitCalls[0].decision.decidedBy).toBe('reviewer:rn-9');
    // The runtime approve path fired exactly one execute for the proposal.
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(1);
  });

  it('Wave-4: a REJECT is terminal — no submission, outcome rejected', async () => {
    const { deps, submitCalls } = spyDeps();
    const { engine } = createRuntime();
    const handle = engine.start(createRecoveryWorkflow(deps), { memberId: 'm-rej', input: TASK });

    await waitFor(
      () => engine.query(handle.workflowId)?.status === 'waiting-decision',
      'suspended-before-reject',
    );
    await reject(engine, handle.workflowId, 'reviewer:rn-9');
    const result = await handle.done;

    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') expect(result.decidedBy).toBe('reviewer:rn-9');
    expect(submitCalls).toHaveLength(0);
  });

  it('Wave-4: a system / autonomy:* decider is BLOCKED — the workflow throws, nothing is submitted', async () => {
    for (const decidedBy of ['system', 'autonomy:HOTL', 'autonomy:autonomous']) {
      const { deps, submitCalls } = spyDeps();
      const { engine } = createRuntime();
      const handle = engine.start(createRecoveryWorkflow(deps), {
        memberId: `m-${decidedBy}`,
        input: TASK,
      });
      await waitFor(
        () => engine.query(handle.workflowId)?.status === 'waiting-decision',
        `suspended-${decidedBy}`,
      );
      const proposalId = engine.query(handle.workflowId)?.awaitingProposalId;
      if (!proposalId) throw new Error('no awaiting proposal');
      // Force an unqualified (system/autonomy) approve signal directly onto the engine.
      await engine.signal(handle.workflowId, {
        name: 'agent.task.approved',
        proposalId,
        decidedBy,
      });
      // The workflow body asserts isQualifiedHumanDecision → throws; the submit tool
      // is NEVER reached (no auto-submit path at any tier).
      await expect(handle.done).rejects.toThrow(/qualified-human/);
      expect(engine.query(handle.workflowId)?.status).toBe('failed');
      expect(submitCalls).toHaveLength(0);
    }
  });

  it('MED-3: even with the manifest tier forced to autonomous, the recovery does NOT auto-execute', async () => {
    // Force the revenue-cycle manifest to the most permissive tier (a data change).
    // Because buildRecoveryAction marks the proposal isSubmission:true, the DURABLE
    // runtime auto-approve gate (isAutoApprovable) refuses it regardless of tier —
    // the workflow stays waiting-decision and nothing executes.
    const registry = registryWithTier(REVENUE_CYCLE_AGENT_ID, 'autonomous');
    const { deps } = spyDeps();
    const { engine, eventSink } = runtimeWithRegistry(registry);
    const handle = engine.start(createRecoveryWorkflow(deps), { memberId: 'm-auto', input: TASK });

    await waitFor(
      () => engine.query(handle.workflowId)?.status === 'waiting-decision',
      'suspended-under-autonomous',
    );
    // Give any auto-approve microtask/timer a chance to (wrongly) fire.
    await flush();
    await engine.advanceTime(240 * HOUR);
    await flush();

    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
    expect(eventSink.ofType('agent.task.approved')).toHaveLength(0);
  });

  it('least-privilege (FIX-1): the still-forbidden claim.submit tool call throws ToolNotAllowedError', async () => {
    const badSubmitWorkflow: WorkflowDefinition<RecoveryTask, string> = {
      name: 'recovery-illegal-submit',
      agentId: REVENUE_CYCLE_AGENT_ID,
      async run(ctx) {
        // Only the single, named, governed `claim.submit-appeal` is granted — the raw
        // `claim.submit` transmit tool stays OFF the allowlist (least privilege).
        return ctx.useTool('claim.submit', () => 'transmitted');
      },
    };
    const { engine } = createRuntime();
    const handle = engine.start(badSubmitWorkflow, { memberId: 'm2', input: TASK });
    await expect(handle.done).rejects.toBeInstanceOf(ToolNotAllowedError);
    expect(engine.query(handle.workflowId)?.status).toBe('failed');
  });

  it('buildRecoveryAction is PHI-safe: refs/codes/amounts only, no member free-text', () => {
    const action = buildRecoveryAction(TASK);
    expect(action.actionType).toBe('draft-appeal'); // a DRAFT, never a submission
    expect(action.priority).toBe('high');
    // Every ref value is a code/amount string (ids + a stringified delta) — no PHI payload.
    expect(action.refs).toEqual({
      claim: 'claim-7',
      remittance: 'rem-7',
      auth: 'auth-7',
      delta: '4250',
    });
    for (const v of Object.values(action.refs ?? {})) expect(typeof v).toBe('string');
    // The summary references ids only, never member free-text.
    expect(action.summary).toContain('claim-7');
    expect(action.summary).not.toMatch(/member|patient|name|dob/i);
  });

  it('interlock caps the drafted rung by evidence tier: D1 -> A1, D0 -> A0', async () => {
    for (const [tier, expected] of [
      ['D1', 'A1'],
      ['D0', 'A0'],
    ] as const) {
      const { deps, calls } = spyDeps();
      const { engine } = createRuntime();
      const handle = engine.start(createRecoveryWorkflow(deps), {
        memberId: `m-${tier}`,
        input: { ...TASK, evidenceTier: tier },
      });
      await waitFor(
        () => engine.query(handle.workflowId)?.status === 'waiting-decision',
        `suspended-${tier}`,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].rung).toBe(expected);
    }
  });
});
