/**
 * partyView.ts — party-scoped, PHI-safe projection of the SHARED Evidence Ledger (Wave-6).
 *
 * Proves the dual-party invariants:
 *  - BOTH parties see the SAME append-only trail (shared ledger) — only the `viewer` differs;
 *  - the projection is PHI-safe: NO memberId / member-embedding record or entry id leaks
 *    into any event resourceRef or the header (and the masking is LOAD-BEARING — the raw
 *    record WOULD leak, so the mask is doing real work);
 *  - the header carries the seal ALG + KEY ID only (never the seal's member-embedding
 *    recordId/memberId identity), the recomputed tier, status, and any integrity block.
 */
import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordRemittance,
  recordReconciliation,
  recordRecovery,
  recordGovernedAction,
  sealRecord,
  toAuditEvents,
  type EvidenceRecord,
} from '@/lib/evidence';
import { projectForParty, MASKED_RECORD_REF } from '@/lib/evidence/partyView';

const MEMBER = 'MARIA_SD_001';
const REC_ID = `ev-${MEMBER}-72148-1756512000000`;
const TS = '2026-05-15T14:22:00.000Z';

function recordWithFinancials(): EvidenceRecord {
  let r = createEvidenceRecord({
    id: REC_ID,
    memberId: MEMBER,
    order: { code: '72148' },
    createdAt: TS,
  });
  // Entry ids intentionally embed the record id (== the member id) — the mask must strip them.
  r = recordRemittance(r, {
    id: `${REC_ID}-remit`,
    ts: TS,
    claimId: 'claim-1',
    remittanceId: 'rem-1',
    paidAmount: 100,
    adjustments: [{ group: 'CO', amount: 50 }],
    carcCodes: ['45'],
    rarcCodes: [],
    carcGroups: ['CO'],
  });
  r = recordReconciliation(r, {
    id: `${REC_ID}-recon`,
    ts: TS,
    verdict: 'underpaid',
    contractedAllowed: 150,
    paidAmount: 100,
    delta: 50,
    toleranceApplied: 0,
  });
  r = recordRecovery(r, {
    id: `${REC_ID}-recovery`,
    ts: TS,
    action: 'draft-appeal',
    rung: 'A1',
    remittanceId: 'rem-1',
    taskEvidenceTier: 'D2',
  });
  return r;
}

describe('projectForParty — shared, PHI-safe dual-party projection', () => {
  it('leaks NO member reference in the projected view (events + header)', () => {
    const rec = recordWithFinancials();
    const view = projectForParty(rec, 'payer');
    const json = JSON.stringify(view);
    expect(json).not.toContain(MEMBER);
    expect(json).not.toContain(REC_ID);
    // Every event resourceRef uses the masked, member-free record + positional entry handle.
    for (const ev of view.events) {
      expect(ev.resourceRef).toMatch(/^Evidence\/evidence-record#entry-\d+$/);
    }
  });

  it('confirms the masking is LOAD-BEARING: the raw record WOULD leak the member id', () => {
    const rec = recordWithFinancials();
    // The un-masked projection (what would ship without maskRecord) leaks the member id.
    const raw = JSON.stringify(toAuditEvents(rec, 'party-view'));
    expect(raw).toContain(MEMBER);
  });

  it('gives BOTH parties the SAME append-only trail (shared ledger) — only viewer differs', () => {
    const rec = recordWithFinancials();
    const payer = projectForParty(rec, 'payer');
    const provider = projectForParty(rec, 'provider');
    expect(payer.viewer).toBe('payer');
    expect(provider.viewer).toBe('provider');
    expect(payer.events).toEqual(provider.events);
    expect(payer.header).toEqual(provider.header);
  });

  it('header reports masked ref, status, recomputed tier, and no seal when unsealed', () => {
    const rec = recordWithFinancials();
    const view = projectForParty(rec, 'provider');
    expect(view.header.recordRef).toBe(MASKED_RECORD_REF);
    expect(view.header.status).toBe('open');
    // weakest-link over remittance(D0)+reconciliation(D2)+recovery(D3) → D0.
    expect(view.header.tier).toBe('D0');
    expect(view.header.seal).toBeUndefined();
    expect(view.header.integrity).toBeUndefined();
  });

  it('reduces a seal to alg + keyId only (drops member-embedding identity fields)', () => {
    const rec = { ...recordWithFinancials() };
    const sealed: EvidenceRecord = {
      ...rec,
      seal: sealRecord(rec, { keyId: 'demo-key', secret: 's3cr3t' }, TS),
    };
    const view = projectForParty(sealed, 'payer');
    expect(view.header.seal).toEqual({ alg: 'HMAC-SHA256', keyId: 'demo-key' });
    // The seal's recordId/memberId identity must NOT appear in the projection.
    expect(JSON.stringify(view.header.seal)).not.toContain(MEMBER);
  });

  it('passes through a supplied integrity attestation (PHI-free reasons)', () => {
    const rec = recordWithFinancials();
    const view = projectForParty(rec, 'payer', {
      integrity: { intact: true, signed: true, reasons: [] },
    });
    expect(view.header.integrity).toEqual({ intact: true, signed: true, reasons: [] });
  });

  it('C7: a full governed-action lifecycle projects with NO member / claim / auth substring', () => {
    // The auditProjection DELIBERATELY omits the governed-action ref/claimId/authId fields so
    // the projection stays PHI-safe. This test makes that omission LOAD-BEARING: apply a full
    // lifecycle (proposed → approved → executed) carrying member-adjacent refs, then project.
    const CLAIM = 'claim-SECRET-999';
    const AUTH = 'auth-SECRET-888';
    const REF = 'appeal-mock::claim-SECRET-999::rem-1';
    let r = recordWithFinancials();
    const actionId = `${REC_ID}-recovery-gact-appeal`;
    for (const status of ['proposed', 'approved', 'executed'] as const) {
      r = recordGovernedAction(r, {
        actionId,
        ts: TS,
        actionType: 'appeal',
        status,
        decidedBy: 'Practitioner/rev-1',
        rung: 'A1',
        isSubmission: true,
        claimId: CLAIM,
        authId: AUTH,
        ...(status === 'executed' ? { channel: 'mock' as const, ref: REF } : {}),
      });
    }
    // The raw record DOES carry the refs (so the projection's omission is doing real work).
    expect(JSON.stringify(r)).toContain(CLAIM);

    const view = projectForParty(r, 'payer');
    const json = JSON.stringify(view);
    expect(json).toContain('governed-action=appeal'); // the lifecycle IS surfaced (PHI-safe)
    expect(json).not.toContain(CLAIM);
    expect(json).not.toContain(AUTH);
    expect(json).not.toContain(REF);
    expect(json).not.toContain(MEMBER);
    expect(json).not.toContain(REC_ID);
  });
});
