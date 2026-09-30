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

    await approve(engine, handle.workflowId, 'Practitioner/dev');
    const result = await handle.done;
    // Advanced to a WORKFLOW state (Submitted), NOT an authoritative payer decision.
    expect(result).toMatchObject({
      outcome: 'executed',
      threadRef: 'Claim/clm-9',
      state: 'Submitted',
    });
    expect(AUTHORITATIVE).not.toContain((result as { state: PaState }).state);
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(1);
  });

  it('rejects: no advancement, and the settle event records the non-execution', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createPaWorkflow(), { memberId: 'm2', input: SUBMIT_TASK });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await reject(engine, handle.workflowId);
    const result = await handle.done;
    // NO ADVANCEMENT: the thread is still at EvidenceComplete, never Submitted.
    expect(result).toMatchObject({ outcome: 'rejected', state: 'EvidenceComplete' });
    // G-002 IN ONE LINE: the honest `rejected` terminal now reaches the C2 stream an auditor reads,
    // not merely the demo projection. The engine used to emit `agent.task.executed` here.
    const settled = eventSink.ofType('agent.task.settled');
    expect(settled).toHaveLength(1);
    expect(settled[0].payload.outcome).toBe('rejected');
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
    // NEVER REACHED HITL: no proposal, so no human was ever asked to approve an authoritative
    // state the agent has no authority to set. That is the guardrail.
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(0);
    // AND THE REFUSAL IS ON THE RECORD. This asserted total silence, inherited from an era when
    // `fail()` emitted nothing — so a guardrail refusal and a workflow that never existed produced
    // the same empty stream. A refusal an auditor cannot see is not evidence of a control. The
    // error CLASS is carried; the message is not, because it can name a member.
    const settled = eventSink.ofType('agent.task.settled');
    expect(settled).toHaveLength(1);
    expect(settled[0].payload).toMatchObject({
      status: 'failed',
      outcome: 'errored',
      errorClass: 'AgentAuthorityError',
    });
    // A failure BEFORE any proposal carries no proposalId rather than a substituted one.
    expect(settled[0].proposalId).toBeUndefined();

    // 3. Only the STATE MACHINE sets Approved/Denied, and only from a claim-response.
    //    The agent has no path to this transition; the payer/ingestion does.
    expect(transition('Pending', CLAIM_RESPONSE, { priority: 'expedited' }).state).toBe('Approved');
    expect(
      transition(
        'Pending',
        { type: 'claim-response', decision: 'denied' },
        { priority: 'expedited' }
      ).state
    ).toBe('Denied');
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

/**
 * The `not-advanced` terminal. `PaResult` was split so `executed` can no longer carry a
 * `transitionError` — the type used to say "executed, with an error", and `paAgent`
 * returned `executed` whenever `transition()` came back with one. `transition()` fails
 * SOFT (paMachine.ts returns `{ state: current, error }` for an illegal advancement, it
 * does not throw), so a human approved, `evidence.append` fired, the thread stayed put,
 * and the row read `executed`.
 *
 * The split shipped with NO test. That is asserted-not-verified: the producer, the type
 * and the enum member all existed and nothing drove the branch.
 */
describe('the not-advanced terminal — an advancement the machine refused', () => {
  /** Submitted + appeal is illegal (paMachine has no `appeal` from `Submitted`). */
  const ILLEGAL_TASK: PaTask = {
    threadRef: 'Claim/clm-illegal',
    currentState: 'Submitted',
    paContext: { priority: 'expedited' },
    priority: 'high',
    advanceEvent: { type: 'appeal' },
  };

  it('is a legal PA template but an ILLEGAL transition — the premise of every case below', () => {
    // If this ever becomes legal the cases below stop testing anything, so the premise
    // is asserted rather than assumed.
    const out = transition('Submitted', { type: 'appeal' }, { priority: 'expedited' });
    expect(out.error).toBeTruthy();
    expect(out.state).toBe('Submitted');
  });

  it("returns not-advanced with the machine's reason, and the thread does NOT move", async () => {
    const { engine } = createRuntime();
    const handle = engine.start(createPaWorkflow(), { memberId: 'm-na', input: ILLEGAL_TASK });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');

    await approve(engine, handle.workflowId, 'Practitioner/dev');
    const result = await handle.done;

    expect(result).toMatchObject({
      outcome: 'not-advanced',
      threadRef: 'Claim/clm-illegal',
      state: 'Submitted',
      decidedBy: 'Practitioner/dev',
    });
    expect((result as { transitionError: string }).transitionError).toMatch(/illegal transition/);
  });

  it('and the outcome is NOT executed — the property the type split exists for', async () => {
    const { engine } = createRuntime();
    const handle = engine.start(createPaWorkflow(), { memberId: 'm-na2', input: ILLEGAL_TASK });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await approve(engine, handle.workflowId);

    expect((await handle.done).outcome).not.toBe('executed');
  });

  /**
   * G-002 IS CLOSED HERE. This was the tripwire that carried the gap, and its failure is worth
   * keeping in front of whoever reads this next.
   *
   * WHAT THE TRIPWIRE WAS FOR. It asserted `ofType('agent.task.executed')).toHaveLength(1)` — the
   * WRONG-TODAY value on purpose — so that the day the engine stopped emitting `executed` at
   * approval time, the count went to 0 and this line went RED. That red line was the whole point:
   * the signal that the fix had landed and the register entry could be closed.
   *
   * WHAT ACTUALLY HAPPENED. W8 removed `agent.task.executed` from `AGENT_C2_EVENT_TYPES` and, in the
   * same pass, mechanically renamed every `'agent.task.executed'` in the test suite to
   * `'agent.task.settled'`. This assertion became `ofType('agent.task.settled')).toHaveLength(1)` —
   * which is true of the FIXED engine, for a different reason. It stayed green. The tripwire never
   * fired, the header above it went on describing an emit at approval time that no longer existed,
   * and the register went on listing G-002 as open. A control that survives the fix by being renamed
   * is worse than one that rots, because it keeps reporting.
   *
   * THE GENERAL RULE, for the next wave: WHEN A WAVE CLOSES A DEFECT, THE TRIPWIRE THAT CARRIED IT
   * MUST GO RED BEFORE IT IS REWRITTEN. A tripwire edited in the same change that lands the fix is
   * the thing to review hardest, and a mechanical find-and-replace across the suite is exactly the
   * edit that hides it.
   *
   * WHAT REPLACES IT. Not a count. `settled` firing once is now true for every settling workflow, so
   * a count can no longer distinguish anything. The two properties that actually encode the fix are
   * the OUTCOME (the record says what the workflow reported, not "executed") and the ORDER (the
   * event comes after the approval, not at approval time). Both go red if the emit moves back.
   */
  it('G-002 CLOSED: the settle event reports `not-advanced`, and fires AFTER the approval', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createPaWorkflow(), { memberId: 'm-na3', input: ILLEGAL_TASK });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await approve(engine, handle.workflowId);
    const result = await handle.done;
    await flush();

    // The premise, so this case cannot pass by the workflow having done something else entirely.
    expect(result.outcome).toBe('not-advanced');

    // 1. THE RECORD SAYS WHAT THE WORKFLOW SAID. This is the substance of G-002: the durable C2
    //    event asserted `executed` for a thread that never advanced, while the honest terminal
    //    reached only `PaResult` and its one demo consumer.
    const settled = eventSink.ofType('agent.task.settled');
    expect(settled).toHaveLength(1);
    expect(settled[0].payload.outcome).toBe('not-advanced');

    // 2. AND IT FIRES AFTER THE APPROVAL, not at it. The original defect was one of TIMING — the
    //    emit ran before `rec.resolve` let the body resume, so it asserted an effect the engine had
    //    not observed and could not have. Move the emit back into the approval branch and this
    //    ordering assertion is the one that goes red.
    const types = eventSink.events.map((e) => e.eventType);
    expect(types.indexOf('agent.task.settled')).toBeGreaterThan(
      types.indexOf('agent.task.approved')
    );

    // 3. The approval carries the OPEN-INTERVAL marker that the settle event closes.
    expect(eventSink.ofType('agent.task.approved')[0].payload.effectPending).toBe(true);
  });
});
