import { describe, it, expect } from 'vitest';
import {
  createPaWorkflow,
  assertAgentPaEventAllowed,
  AgentAuthorityError,
  type PaTask,
} from '@/lib/agents/pa';
import { transition, type PaEvent, type PaState } from '@/lib/workflow/paMachine';
import { createRuntime, waitFor, approve, reject, flush } from './helpers';

const SUBMIT_TASK: PaTask = {
  threadRef: 'Claim/clm-9',
  currentState: 'EvidenceComplete',
  paContext: { priority: 'expedited' },
  priority: 'high',
  advanceEvent: { type: 'submit' }, // human-gated advancement (non-authoritative)
};

const CLAIM_RESPONSE: PaEvent = { type: 'claim-response', decision: 'approved' };
const AUTHORITATIVE: PaState[] = ['Approved', 'Denied'];

describe('PA documentation agent (O-8) — propose docs, human gates, machine decides', () => {
  it('proposes documentation HITL, then advances the PA machine on approval', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createPaWorkflow(), { memberId: 'm1', input: SUBMIT_TASK });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);

    await approve(engine, handle.workflowId, 'reviewer:md-3');
    const result = await handle.done;
    // Advanced to a WORKFLOW state (Submitted), NOT an authoritative payer decision.
    expect(result).toMatchObject({ outcome: 'executed', threadRef: 'Claim/clm-9', state: 'Submitted' });
    expect(AUTHORITATIVE).not.toContain((result as { state: PaState }).state);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(1);
  });

  it('rejects: no advancement, no executed event', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createPaWorkflow(), { memberId: 'm2', input: SUBMIT_TASK });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await reject(engine, handle.workflowId);
    const result = await handle.done;
    expect(result).toMatchObject({ outcome: 'rejected', state: 'EvidenceComplete' });
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
  });

  // ── THE CRITICAL AI GUARDRAIL ────────────────────────────────────────────────

  it('GUARDRAIL: the agent can NEVER set an authoritative PA state (claim-response is refused)', async () => {
    // 1. The guardrail value refuses the authoritative event directly.
    expect(() => assertAgentPaEventAllowed(CLAIM_RESPONSE)).toThrow(AgentAuthorityError);

    // 2. An agent handed a claim-response fails BEFORE proposing — it never reaches HITL.
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createPaWorkflow(), {
      memberId: 'm3',
      input: { ...SUBMIT_TASK, advanceEvent: CLAIM_RESPONSE },
    });
    await flush();
    await expect(handle.done).rejects.toBeInstanceOf(AgentAuthorityError);
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(0);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);

    // 3. Only the STATE MACHINE sets Approved/Denied, and only from a claim-response.
    //    The agent has no path to this transition; the payer/ingestion does.
    expect(transition('Pending', CLAIM_RESPONSE, { priority: 'expedited' }).state).toBe('Approved');
    expect(transition('Pending', { type: 'claim-response', decision: 'denied' }, { priority: 'expedited' }).state).toBe(
      'Denied',
    );
  });

  it('GUARDRAIL: even a full approved run over a denial only advances to appeal, never Approved/Denied', async () => {
    const { engine } = createRuntime();
    const handle = engine.start(createPaWorkflow(), {
      memberId: 'm4',
      input: {
        threadRef: 'Claim/clm-9',
        currentState: 'Denied',
        paContext: { priority: 'expedited' },
        priority: 'high',
        advanceEvent: { type: 'appeal' },
      },
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await approve(engine, handle.workflowId);
    const result = await handle.done;
    // Denied -> AppealOrReview is a non-authoritative advancement; still not the agent
    // re-deciding the claim. The authoritative Denied came from the machine, not the agent.
    expect((result as { state: PaState }).state).toBe('AppealOrReview');
    expect(AUTHORITATIVE).not.toContain((result as { state: PaState }).state);
  });
});
