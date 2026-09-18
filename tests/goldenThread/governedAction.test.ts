/**
 * governedAction.ts — Wave-9 governed analyst ACTIONS + durable ticket lifecycle.
 *
 * Proves the runner COMPOSES (never re-derives): the rung + human requirement via
 * `evaluateInterlock` (NOT hardcoded), the qualified-human gate via
 * `isQualifiedHumanDecision`, the MOCK X12/appeal transmission via the fail-closed
 * `submissionGateway` seam, and the ticket via the Wave-7 `routeEscalation`. Covers the
 * qualified-human gate (no auto-execute of a payer-facing X12 without a qualified human),
 * the exactly-once id-idempotent lifecycle, the interlock-derived rung, the HOTL
 * auto-proceed / veto semantics, PHI-safe ticket routing, and determinism.
 */
import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordRemittance,
  recordRecovery,
  type EvidenceRecord,
  type EvidenceTier,
} from '@/lib/evidence';
import { MASKED_RECORD_REF } from '@/lib/evidence/partyView';
import {
  createMemoryProposalInbox,
  loadEscalationPolicies,
  type HumanDecision,
} from '@/lib/agentRuntime';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import { submitAppealMock, type SubmissionGateway } from '@/lib/dataSources/submissionGateway';
import {
  runGovernedAction,
  applyGovernedAction,
  governedActionId,
  governedActionTerminal,
  isSubmissionAction,
  GovernedActionError,
  type GovernedActionContext,
  type GovernedActionOutcome,
} from '@/lib/goldenThread/governedAction';

const MEMBER = 'MARIA_SD_001';
const REC_ID = `ev-${MEMBER}-72148-1756512000000`;
const NOW = '2026-06-01T00:00:00.000Z';
const GATEWAY: SubmissionGateway = { asOf: NOW, submitAppeal: submitAppealMock };

/** A record with a remittance + a recovery draft carrying the task refs + tier. */
function record(tier: EvidenceTier = 'D3'): EvidenceRecord {
  let r = createEvidenceRecord({
    id: REC_ID,
    memberId: MEMBER,
    order: { code: '72148' },
    createdAt: NOW,
  });
  r = recordRemittance(r, {
    id: `${REC_ID}-rem`,
    ts: NOW,
    remittanceId: 'rem-1',
    paidAmount: 50,
    adjustments: [{ group: 'CO', amount: 50 }],
    carcCodes: ['45'],
    rarcCodes: [],
    carcGroups: ['CO'],
  });
  r = recordRecovery(r, {
    id: `${REC_ID}-recovery`,
    ts: NOW,
    action: 'draft-appeal',
    rung: 'A1',
    remittanceId: 'rem-1',
    priority: 'high',
    taskClaimId: 'claim-1',
    taskAuthId: 'auth-1',
    taskEvidenceTier: tier,
  });
  return r;
}

function human(decision: 'approved' | 'rejected', decidedBy = 'Practitioner/rev-1'): HumanDecision {
  return { decision, decidedBy, proposalId: 'p', decidedAtMs: Date.parse(NOW) };
}

function ctx(over: Partial<GovernedActionContext> = {}): GovernedActionContext {
  return {
    now: NOW,
    manifestTier: 'HITL' as AutonomyTier,
    inbox: createMemoryProposalInbox(),
    policies: loadEscalationPolicies(),
    escalationPolicyRef: 'default',
    gateway: GATEWAY,
    ...over,
  };
}

const countStage = (r: EvidenceRecord, status: string): number =>
  r.entries.filter((e) => e.type === 'governed-action' && e.status === status).length;

describe('isSubmissionAction — the payer-facing X12/appeal class', () => {
  it('X12 + appeal are submission-class; provider-notice + ticket-update are internal', () => {
    for (const t of ['x12-276', 'x12-278', 'x12-275', 'x12-837-corrected', 'appeal'] as const) {
      expect(isSubmissionAction(t)).toBe(true);
    }
    expect(isSubmissionAction('provider-notice')).toBe(false);
    expect(isSubmissionAction('ticket-update')).toBe(false);
  });
});

describe('runGovernedAction — qualified-human APPROVE executes the MOCK', () => {
  it('a payer-facing X12-278 with a qualified human → executed, mock ref, not-transmitted', async () => {
    const out = await runGovernedAction(
      record(),
      { actionType: 'x12-278' },
      ctx({ decision: human('approved') })
    );
    expect(out.status).toBe('executed');
    expect(out.isSubmission).toBe(true);
    expect(out.channel).toBe('mock');
    // FIX-1 PHI-safe ref: keyed on the payer remittance id + a non-reversible claim hash —
    // the member-embedding claimId is NEVER rendered raw. Deterministic (replay → same ref).
    expect(out.ref).toBe('appeal-mock::rem-1::c-448444379404');
    expect(out.ref).not.toContain('claim-1'); // no member-embedding claimId in the DOM-bound ref
    expect(out.requiresHuman).toBe(true);
  });

  it('an internal ticket-update executes with NO gateway (no transport) → internal mock ref', async () => {
    const out = await runGovernedAction(
      record(),
      { actionType: 'ticket-update' },
      ctx({ decision: human('approved'), gateway: null })
    );
    expect(out.status).toBe('executed');
    expect(out.isSubmission).toBe(false);
    // FIX-1: the internal handle is minted through the SAME PHI-safe ref helper.
    expect(out.ref).toBe('ticket-update-mock::rem-1::c-448444379404');
    expect(out.ref).not.toContain('claim-1');
  });
});

describe('FIX-1 negative-PHI — a member-embedding claimId never reaches the outcome ref', () => {
  // The seeded demo mints the claim id as the member-embedding evidence id
  // (`ev-<memberId>-…-claim`). The outcome ref crosses the API boundary and is RENDERED, so
  // it must NOT carry the member reference — proved for BOTH the submission and internal paths.
  const memberClaimId = `${REC_ID}-claim`; // ev-MARIA_SD_001-72148-…-claim

  it('a submission-class appeal outcome ref carries no member id', async () => {
    const out = await runGovernedAction(
      record(),
      { actionType: 'appeal', claimId: memberClaimId },
      ctx({ decision: human('approved') })
    );
    expect(out.status).toBe('executed');
    expect(out.ref).toBeTruthy();
    expect(out.ref).not.toContain(MEMBER); // no `MARIA_SD_001` in the DOM-bound ref
    expect(out.ref).not.toContain(memberClaimId); // claim id not embedded raw
  });

  it('an internal action outcome ref carries no member id', async () => {
    const out = await runGovernedAction(
      record(),
      { actionType: 'provider-notice', claimId: memberClaimId },
      ctx({ decision: human('approved'), gateway: null })
    );
    expect(out.status).toBe('executed');
    expect(out.ref).not.toContain(MEMBER);
    expect(out.ref).not.toContain(memberClaimId);
  });
});

describe('runGovernedAction — no auto-execute of a payer-facing X12 without a qualified human', () => {
  it('a system decider on a submission → NOT resolved → surfaced as proposed (never executed)', async () => {
    const out = await runGovernedAction(
      record(),
      { actionType: 'x12-278' },
      ctx({ decision: human('approved', 'system') })
    );
    expect(out.status).toBe('proposed');
    expect(out.ref).toBeUndefined();
  });

  it('an autonomy:* decider on a submission → proposed (blocked), even at the autonomous tier', async () => {
    const out = await runGovernedAction(
      record(),
      { actionType: 'appeal' },
      ctx({
        manifestTier: 'autonomous' as AutonomyTier,
        decision: human('approved', 'autonomy:autonomous'),
      })
    );
    expect(out.status).toBe('proposed');
  });

  it('a submission-class action with unresolvable refs → fail-closed GovernedActionError', async () => {
    const bare = createEvidenceRecord({
      id: REC_ID,
      memberId: MEMBER,
      order: { code: '72148' },
      createdAt: NOW,
    });
    // No remittance/recovery → no claim/remittance refs → a submission cannot execute.
    let r = bare;
    r = recordRecovery(r, {
      id: `${REC_ID}-recovery`,
      ts: NOW,
      action: 'draft-appeal',
      rung: 'A1',
    });
    await expect(
      runGovernedAction(r, { actionType: 'appeal' }, ctx({ decision: human('approved') }))
    ).rejects.toBeInstanceOf(GovernedActionError);
  });

  it('a submission-class action with resolvable refs but NO gateway → fail-closed', async () => {
    await expect(
      runGovernedAction(
        record(),
        { actionType: 'appeal' },
        ctx({ decision: human('approved'), gateway: null })
      )
    ).rejects.toBeInstanceOf(GovernedActionError);
  });
});

describe('runGovernedAction — REJECT + HOTL veto/auto-proceed', () => {
  it('a qualified-human REJECT → terminal rejected, no execution', async () => {
    const out = await runGovernedAction(
      record(),
      { actionType: 'x12-278' },
      ctx({ decision: human('rejected') })
    );
    expect(out.status).toBe('rejected');
    expect(out.ref).toBeUndefined();
  });

  it('HOTL non-submission with NO decision → auto-proceeds (human may veto) → executed', async () => {
    // D3 evidence + HOTL grant A2 → rung A2 (not low), non-submission, non-adverse → auto-resolves.
    const out = await runGovernedAction(
      record('D3'),
      { actionType: 'ticket-update' },
      ctx({ manifestTier: 'HOTL' as AutonomyTier, decision: null, gateway: null })
    );
    expect(out.status).toBe('executed');
    expect(out.decidedBy).toBe('system');
  });

  it('HOTL non-submission with an explicit reject → the human veto wins (rejected)', async () => {
    const out = await runGovernedAction(
      record('D3'),
      { actionType: 'ticket-update' },
      ctx({ manifestTier: 'HOTL' as AutonomyTier, decision: human('rejected'), gateway: null })
    );
    expect(out.status).toBe('rejected');
  });
});

describe('runGovernedAction — rung comes from the interlock (never hardcoded)', () => {
  it('weak D0 evidence caps the rung at A0 even at HOTL (submission still human-gated)', async () => {
    const out = await runGovernedAction(
      record('D0'),
      { actionType: 'x12-278' },
      ctx({ manifestTier: 'HOTL' as AutonomyTier, decision: human('approved') })
    );
    expect(out.rung).toBe('A0'); // min(A2 grant, A0 ceiling from D0) — weakest link
    expect(out.status).toBe('executed'); // qualified human present
  });

  it('settlement-grade D3 evidence lets the HOTL grant stand at A2', async () => {
    const out = await runGovernedAction(
      record('D3'),
      { actionType: 'ticket-update' },
      ctx({ manifestTier: 'HOTL' as AutonomyTier, decision: human('approved'), gateway: null })
    );
    expect(out.rung).toBe('A2');
  });
});

describe('applyGovernedAction — durable append-only lifecycle (exactly-once)', () => {
  it('an executed outcome appends proposed → approved → executed (id-idempotent)', async () => {
    const rec = record();
    const out = await runGovernedAction(
      rec,
      { actionType: 'x12-278' },
      ctx({ decision: human('approved') })
    );
    let applied = applyGovernedAction(rec, out, NOW);
    expect(countStage(applied, 'proposed')).toBe(1);
    expect(countStage(applied, 'approved')).toBe(1);
    expect(countStage(applied, 'executed')).toBe(1);
    // Re-applying the SAME outcome is a no-op (exactly-once per stage) — lost-update safe.
    applied = applyGovernedAction(applied, out, NOW);
    expect(countStage(applied, 'executed')).toBe(1);
    // The terminal is detectable + carries the mock ref.
    expect(governedActionTerminal(applied, out.actionId)).toEqual({
      status: 'executed',
      ref: out.ref,
    });
  });

  it('a rejected outcome appends proposed → rejected only (no approved/executed)', async () => {
    const rec = record();
    const out = await runGovernedAction(
      rec,
      { actionType: 'appeal' },
      ctx({ decision: human('rejected') })
    );
    const applied = applyGovernedAction(rec, out, NOW);
    expect(countStage(applied, 'proposed')).toBe(1);
    expect(countStage(applied, 'rejected')).toBe(1);
    expect(countStage(applied, 'approved')).toBe(0);
    expect(countStage(applied, 'executed')).toBe(0);
    expect(governedActionTerminal(applied, out.actionId)).toEqual({ status: 'rejected' });
  });

  it('distinct action types on one record keep independent lifecycles', async () => {
    const rec = record();
    const a = await runGovernedAction(
      rec,
      { actionType: 'x12-276' },
      ctx({ decision: human('approved') })
    );
    const b = await runGovernedAction(
      rec,
      { actionType: 'ticket-update' },
      ctx({ decision: human('approved'), gateway: null })
    );
    expect(a.actionId).not.toBe(b.actionId);
    let applied = applyGovernedAction(rec, a, NOW);
    applied = applyGovernedAction(applied, b, NOW);
    expect(countStage(applied, 'executed')).toBe(2); // one per action type
  });
});

describe('runGovernedAction — PHI-safe ticket routing + determinism', () => {
  it('routes the durable ticket through Wave-7 with a MASKED, member-free queue item', async () => {
    const out = await runGovernedAction(
      record(),
      { actionType: 'x12-278' },
      ctx({ decision: human('approved') })
    );
    expect(out.ticket.queueItem?.recordRef).toBe(MASKED_RECORD_REF);
    const blob = JSON.stringify(out.ticket);
    expect(blob).not.toContain(MEMBER); // notifications + masked queue item carry no memberId
  });

  it('two runs with identical inputs are deep-equal (now + inbox + gateway injected)', async () => {
    const rec = record();
    const a: GovernedActionOutcome = await runGovernedAction(
      rec,
      { actionType: 'x12-278' },
      ctx({ decision: human('approved') })
    );
    const b: GovernedActionOutcome = await runGovernedAction(
      rec,
      { actionType: 'x12-278' },
      ctx({ decision: human('approved') })
    );
    expect(a).toEqual(b);
  });

  it('governedActionId is deterministic per RECOVERY + action type (C2)', () => {
    // C2: keyed on the recoveryId, not the record id, so two recovery drafts on one record
    // yield DISTINCT ids for the same actionType.
    const recA = `${REC_ID}-A-recovery`;
    const recB = `${REC_ID}-B-recovery`;
    expect(governedActionId(recA, 'x12-278')).toBe(`${recA}-gact-x12-278`);
    expect(governedActionId(recB, 'x12-278')).toBe(`${recB}-gact-x12-278`);
    expect(governedActionId(recA, 'x12-278')).not.toBe(governedActionId(recB, 'x12-278'));
  });

  it('C2: distinct recovery drafts on ONE record resolve to distinct action ids + per-recovery refs', async () => {
    // A multi-claim record: two recovery drafts (A, B) with different task refs + tiers.
    let r = createEvidenceRecord({
      id: REC_ID,
      memberId: MEMBER,
      order: { code: '72148' },
      createdAt: NOW,
    });
    const recA = `${REC_ID}-A-recovery`;
    const recB = `${REC_ID}-B-recovery`;
    r = recordRecovery(r, {
      id: recA,
      ts: NOW,
      action: 'draft-appeal',
      rung: 'A1',
      remittanceId: 'remA',
      priority: 'urgent',
      taskClaimId: 'claimA',
      taskAuthId: 'authA',
      taskEvidenceTier: 'D3',
    });
    r = recordRecovery(r, {
      id: recB,
      ts: NOW,
      action: 'draft-appeal',
      rung: 'A1',
      remittanceId: 'remB',
      priority: 'routine',
      taskClaimId: 'claimB',
      taskAuthId: 'authB',
      taskEvidenceTier: 'D0',
    });
    const entryA = r.entries.find((e) => e.id === recA) as Extract<
      EvidenceRecord['entries'][number],
      { type: 'recovery' }
    >;
    const entryB = r.entries.find((e) => e.id === recB) as Extract<
      EvidenceRecord['entries'][number],
      { type: 'recovery' }
    >;
    const outA = await runGovernedAction(
      r,
      { actionType: 'x12-278', recovery: entryA, recoveryId: recA },
      ctx({ decision: human('approved') })
    );
    const outB = await runGovernedAction(
      r,
      { actionType: 'x12-278', recovery: entryB, recoveryId: recB },
      ctx({ decision: human('approved') })
    );
    // Distinct action ids — recovery B is NOT dropped onto recovery A's lifecycle.
    expect(outA.actionId).toBe(`${recA}-gact-x12-278`);
    expect(outB.actionId).toBe(`${recB}-gact-x12-278`);
    expect(outA.actionId).not.toBe(outB.actionId);
    // Refs bind to the RESOLVED recovery named by each call, not latestOfType (which is B).
    expect(outA.refs.claimId).toBe('claimA');
    expect(outB.refs.claimId).toBe('claimB');
    expect(outA.refs.remittanceId).toBe('remA');
    expect(outB.refs.remittanceId).toBe('remB');
  });
});
