/**
 * G-045 — THE ENGINE'S RESOLUTION PATH VALIDATES ITS DECIDER.
 *
 * WHAT WAS WRONG, measured before this change. `WorkflowEngine.signal()` read `signal.decidedBy` and
 * handed it straight to `decide()`. Nothing validated it: `isQualifiedHumanDecision` — the platform's
 * only reviewer check at the time — was never called on this path at all. `isAutoApprovable`
 * correctly refuses to auto-approve an adverse coverage action and routes it to `'human-required'`,
 * and then ANY string resolved it: `''`, `'system'`, even `'autonomy:autonomous'`. The
 * tier-independent invariant the decision gate declares was enforced by the refusal to auto-approve,
 * and by nothing at all validating the human signal that replaced it.
 *
 * AND IT WAS REACHABLE OVER HTTP. `agents/demo/index.ts` signalled with the literal
 * `'demo-reviewer'`, from `runRealAgentDemo()`, which `/api/ops/agents/actions` calls whenever the
 * agent runtime is in production mode. An HTTP GET drove the real engine and resolved every adverse
 * proposal in the seeded batch on an invented name.
 *
 * WHY IT BINDS AT THE ENGINE AND NOT AT A ROUTE. Eight paths can reach a resolution and only one is
 * `/api/pa/decision`. Wiring the route alone is the G-035 defect with the polarity flipped: there,
 * the control existed and only a self-test called it; here, it would exist at a route the engine
 * does not go through. These cases drive the ENGINE directly, which is the surface that matters.
 */
import { describe, expect, it } from 'vitest';
import { createRuntime, proposingWorkflow, testReviewer, waitFor } from './helpers';
import type { ProposedAction } from '@/lib/agentRuntime';
import { assertSignalDecider } from '@/lib/agentRuntime/engineSupport';
import {
  assertReviewerQualified,
  isMintedProof,
  SEED_EPOCH_MS,
  type QualifiedReviewer,
} from '@/lib/authz/credentialing';

/** An adverse coverage action: forced onto the human-required path at every autonomy tier. */
const DENIAL: ProposedAction = {
  actionType: 'pa-denial',
  priority: 'urgent',
  refs: { claim: 'c-1' },
  needDomain: 'medical',
};

async function suspendOn(action: ProposedAction, memberId: string) {
  const rt = createRuntime();
  const handle = rt.engine.start(proposingWorkflow('outreach-agent', action), {
    memberId,
    input: undefined,
  });
  await waitFor(() => rt.engine.query(handle.workflowId)?.status === 'waiting-decision');
  const proposalId = rt.engine.query(handle.workflowId)!.awaitingProposalId!;
  return { ...rt, handle, proposalId };
}

describe('a human-required proposal demands a QualifiedReviewer PROOF', () => {
  it('REFUSES a signal with no proof — this is the defect, in one assertion', () => {
    return suspendOn(DENIAL, 'm-noproof').then(async ({ engine, handle, proposalId }) => {
      await expect(
        engine.signal(handle.workflowId, {
          name: 'agent.task.approved',
          proposalId,
          decidedBy: 'Practitioner/dev', // a perfectly real reviewer — but no proof is supplied
        })
      ).rejects.toThrow(/reviewer-proof-absent/);
      // A refused signal is a NO-OP on the workflow, not a failure of it: still waiting for a
      // decision that qualifies. That is the safer shape — nothing downstream has to remember.
      expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
    });
  });

  it('REFUSES the exact strings that used to resolve it', async () => {
    for (const decidedBy of ['', 'system', 'autonomy:autonomous', 'demo-reviewer', 'human:bob']) {
      const { engine, handle, proposalId } = await suspendOn(DENIAL, `m-${decidedBy || 'empty'}`);
      await expect(
        engine.signal(handle.workflowId, { name: 'agent.task.approved', proposalId, decidedBy })
      ).rejects.toThrow(/reviewer-proof-absent/);
      expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
    }
  });

  it('REFUSES a proof that does not cover the decider named on the record', async () => {
    // `decidedBy` is what the audit record carries. If it disagrees with the proof, the record
    // attributes the decision to someone the proof does not cover — a forgery by mismatch.
    const { engine, handle, proposalId } = await suspendOn(DENIAL, 'm-mismatch');
    await expect(
      engine.signal(handle.workflowId, {
        name: 'agent.task.approved',
        proposalId,
        decidedBy: 'Practitioner/rev-1',
        reviewer: testReviewer('Practitioner/dev'),
      })
    ).rejects.toThrow(/decider-mismatch/);
    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
  });

  it('ACCEPTS a matching proof, and the workflow resolves — the gate is not refusing everything', async () => {
    const { engine, handle, proposalId } = await suspendOn(DENIAL, 'm-ok');
    await engine.signal(handle.workflowId, {
      name: 'agent.task.approved',
      proposalId,
      decidedBy: 'Practitioner/dev',
      reviewer: testReviewer('Practitioner/dev'),
    });
    expect(await handle.done).toBe('approved');
  });
});

describe('a proposal that is NOT human-required still refuses an automation actor', () => {
  /**
   * Driven at the unit rather than through the engine, deliberately and with the reason stated.
   *
   * A proposal only WAITS for an external signal when it is human-required; an auto-approvable one
   * resolves on its own. The single reachable integration case is a HOTL, non-adverse,
   * non-submission proposal signalled by a human BEFORE its SLA timer fires — a race this suite
   * cannot stage deterministically, and staging it with a forced tier override would be testing the
   * override. So the branch is driven directly, and the shipped behaviour of the human-required
   * branch above is what the engine-level cases cover.
   */
  it('refuses `system`, `autonomy:*` and the placeholder identities', () => {
    for (const decidedBy of ['', 'system', 'autonomy:HOTL', 'session-user', 'unknown'])
      expect(() =>
        assertSignalDecider(
          {
            proposalId: 'p',
            humanRequired: false,
            determinationClass: 'administrative',
            needDomain: 'medical',
          },
          { decidedBy }
        )
      ).toThrow(/automated-decider/);
  });

  it('accepts a named person, with no proof required — the two bars are different on purpose', () => {
    // A favorable, non-submission action does not need a credentialed clinical peer. It does need
    // not to be resolved by the automation itself.
    expect(() =>
      assertSignalDecider(
        {
          proposalId: 'p',
          humanRequired: false,
          determinationClass: 'administrative',
          needDomain: 'medical',
        },
        { decidedBy: 'reviewer:rn-7' }
      )
    ).not.toThrow();
  });
});

describe('the proof cannot be forged — at compile time AND at runtime', () => {
  it('a hand-built object does not type-check as a QualifiedReviewer', () => {
    // The compile-time half. The brand symbol is not exported, so a caller literal is rejected.
    // NOTE this assertion binds only under `npm run check:all` (tsconfig includes tests and
    // check:types runs first) — never under the test runner alone, where the directive is erased.
    // @ts-expect-error a caller literal is not a QualifiedReviewer
    const forged: import('@/lib/authz/credentialing').QualifiedReviewer = {
      reviewerRef: 'Practitioner/dev',
      verdict: {
        reviewerRef: 'Practitioner/dev',
        asOfMs: 0,
        licenceVerdict: 'valid-at-decision',
        needDomain: 'medical',
        standardApplied: 'federal:42CFR438.210(b)(3)',
        sourceId: 'credentialing-system-of-record',
        sourceAsOfMs: 0,
        priorInvolvementChecked: false,
        boundTo: { determinationClass: 'clinical', needDomain: 'medical' },
      },
    };
    void forged;
    expect(isMintedProof(forged)).toBe(false);
  });

  it('a CAST object is refused at runtime — the brand is erased, the WeakSet is not', () => {
    // The vector the compile-time half cannot stop, and the one a future HTTP boundary would hand
    // us for free: `as unknown as QualifiedReviewer`. At runtime a proof is an ordinary frozen
    // object with no marker, so the type was the whole control until `isMintedProof` existed.
    const cast = {
      reviewerRef: 'Practitioner/dev',
      verdict: { ...testReviewer().verdict },
    } as unknown as QualifiedReviewer;
    expect(isMintedProof(cast)).toBe(false);
    expect(() =>
      assertSignalDecider(
        {
          proposalId: 'p',
          humanRequired: true,
          determinationClass: 'clinical',
          needDomain: 'medical',
        },
        { decidedBy: 'Practitioner/dev', reviewer: cast }
      )
    ).toThrow(/proof-not-minted/);
  });

  it('a SPREAD of a real proof is refused — copying the fields does not copy the minting', () => {
    const real = testReviewer();
    const copy = { ...real } as QualifiedReviewer;
    expect(isMintedProof(real)).toBe(true);
    expect(isMintedProof(copy)).toBe(false);
  });
});

describe('an adverse action must declare its need domain, at propose time', () => {
  it('REFUSES to propose an adverse action with no needDomain, rather than defaulting one', async () => {
    // Refused at the EARLIEST point, not papered over at the latest. A default here would let a
    // medical attestation satisfy a behavioral-health denial in every proposal that forgot to say —
    // and "forgot to say" is the normal case, which is why it cannot be the permissive one.
    const rt = createRuntime();
    const handle = rt.engine.start(
      proposingWorkflow('outreach-agent', { ...DENIAL, needDomain: undefined }),
      { memberId: 'm-nodomain', input: undefined }
    );
    await expect(handle.done).rejects.toThrow(/must declare needDomain/);
  });
});

describe('the proof must COVER the determination — not merely name the decider', () => {
  /** A proof minted for the administrative path: no licence check, no attestation check. */
  const adminProof = () =>
    assertReviewerQualified(
      'Practitioner/unlicensed',
      {
        kind: 'initial-determination',
        determinationClass: 'administrative',
        needDomain: 'medical',
        licenceJurisdiction: 'NY',
      },
      SEED_EPOCH_MS
    );

  it('REFUSES an administrative proof on a clinical determination', () => {
    // The exploit this closes: `Practitioner/unlicensed` holds no licence and no attestation, and
    // the administrative path checks neither — so before `proofCovers`, an unlicensed coordinator's
    // proof resolved an adverse coverage action and the engine recorded it as human-gated.
    expect(() =>
      assertSignalDecider(
        {
          proposalId: 'p',
          humanRequired: true,
          determinationClass: 'clinical',
          needDomain: 'medical',
        },
        { decidedBy: 'Practitioner/unlicensed', reviewer: adminProof() }
      )
    ).toThrow(/proof-scope-mismatch/);
  });

  it('REFUSES a medical proof on a behavioral-health determination', () => {
    // The substitution 42 CFR 438.210(b)(3) exists to prevent, at the enforcement point this time.
    expect(() =>
      assertSignalDecider(
        {
          proposalId: 'p',
          humanRequired: true,
          determinationClass: 'clinical',
          needDomain: 'behavioral-health',
        },
        { decidedBy: 'Practitioner/dev', reviewer: testReviewer() }
      )
    ).toThrow(/proof-scope-mismatch/);
  });

  it('ACCEPTS a clinical proof on an administrative determination — stronger is fine', () => {
    expect(() =>
      assertSignalDecider(
        {
          proposalId: 'p',
          humanRequired: true,
          determinationClass: 'administrative',
          needDomain: 'medical',
        },
        { decidedBy: 'Practitioner/dev', reviewer: testReviewer() }
      )
    ).not.toThrow();
  });
});
