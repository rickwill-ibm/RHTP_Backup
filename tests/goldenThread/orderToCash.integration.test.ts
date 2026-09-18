import { describe, it, expect } from 'vitest';
import { runOrderToCash, type CashDeps } from '@/lib/goldenThread/orderToCash';
import { runFinancialClearance } from '@/lib/goldenThread/threadOrchestrator';
import { createInMemoryEvidenceStore, type EvidenceStore } from '@/lib/evidence/evidenceStore';
import {
  latestOfType,
  entriesForStage,
  verifyLedgerIntegrity,
  type EvidenceRecord,
  type SigningKey,
} from '@/lib/evidence';
import { loadMockLibrary, type MemberContext } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import {
  getRemittanceGatewayLoader,
  type Normalized835,
} from '@/lib/dataSources/remittanceGateway';
import {
  getContractRepositoryLoader,
  type FeeSchedule,
} from '@/lib/dataSources/contractRepository';
import type { ReconcilePasDecision } from '@/lib/goldenThread/reconciliation';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import type { StageOrder } from '@/lib/goldenThread';

const lib = loadMockLibrary();
const TS = '2026-08-30T00:00:00.000Z';
const PAYER = 'UnitedHealthcare Community Plan';
const REVIEWER_AUTH = 'auth-MARIA_SD_001-72148';

function inputs(): ThreadInputs {
  const member: MemberContext = { memberId: 'MARIA_SD_001', diagnoses: [] };
  // '1518998765' is NOT gold-carded → PA required → pas-decision 'approved'.
  const order: StageOrder = {
    code: '72148',
    codeSystem: 'CPT',
    display: 'MRI lumbar',
    providerNpi: '1518998765',
    payer: PAYER,
  };
  return { member, order, coverage: { status: 'active', payer: PAYER, plan: 'Texas STAR' } };
}

/** A store that records how many times save() was called (persist-once proof). */
function spyStore(): EvidenceStore & { saves: EvidenceRecord[] } {
  const inner = createInMemoryEvidenceStore();
  const saves: EvidenceRecord[] = [];
  return {
    saves,
    async save(record) {
      saves.push(record);
      await inner.save(record);
    },
    get: inner.get,
    list: inner.list,
  };
}

async function deps(
  store: EvidenceStore,
  recoveryAgentTier: AutonomyTier = 'HITL',
  // 'absent' exercises the fail-safe: no caller-supplied PA decision at all.
  pasDecisionArg: ReconcilePasDecision | 'absent' = 'approved'
): Promise<CashDeps> {
  const [remittance, feeSchedule] = await Promise.all([
    getRemittanceGatewayLoader().load(TS),
    getContractRepositoryLoader().load(TS),
  ]);
  return {
    library: lib,
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store,
    ts: TS,
    remittance,
    feeSchedule,
    pasDecision: pasDecisionArg === 'absent' ? undefined : pasDecisionArg,
    reviewerAuthId: REVIEWER_AUTH,
    recoveryAgentTier,
    ids: {
      evidence: 'ev-otc-1',
      determination: 'det',
      goldCard: 'gc',
      propensity: 'prop',
      eligibility: 'elig',
      estimation: 'est',
      pasDecision: 'pas',
      claim: 'claim-1',
      remittance: 'rem-1',
      reconciliation: 'recon-1',
      underpayment: 'under-1',
      recovery: 'recovery-1',
    },
  };
}

describe('order→cash integration — 72148 / Maria / UHC underpayment', () => {
  it('runs the full thread to a recovery draft, human-gated for submission', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), await deps(store));

    // reconciliation verdict is computed: contracted 1150 − PR 150 = 1000 payerOwed;
    // paid 900 → delta 100 (> tolerance). CO 650 write-off is NOT counted (FIX-2).
    expect(result.reconciliation?.verdict).toBe('underpaid');
    expect(result.reconciliation?.delta).toBe(100);
    expect(result.reconciliation?.contractedAllowed).toBe(1150);

    // FINDING 1: tier is the WEAKEST-LINK over decision-critical inputs (all
    // entries except the consumed raw remittance). The D1 auth basis / eligibility
    // / determination are the weakest link → D1, NOT a constant D2. This HOLDS
    // recovery autonomy back until the underlying auth evidence is stronger.
    expect(result.currentTier).toBe('D1');

    // a recovery DRAFT exists on the spine, status 'draft'
    const recovery = latestOfType(result.evidence, 'recovery');
    expect(recovery?.status).toBe('draft');
    expect(recovery?.action).toBe('draft-appeal');
    expect(result.recovery?.action).toBe('draft-appeal');
    // HITL + D1 → permittedRung(HITL, D1) = A1 (human-gated)
    expect(result.recovery?.rung).toBe('A1');

    // FIX-1: submission is human-gated regardless of rung
    expect(result.recovery?.requiresHumanForSubmission).toBe(true);

    // persisted ONCE (base ran with no store; orderToCash saves the final record)
    expect(store.saves.length).toBe(1);
    expect(store.saves[0].entries.length).toBe(result.evidence.entries.length);
  });

  it('FIX-1: an autonomous recovery agent STILL cannot auto-submit (draft only)', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), await deps(store, 'autonomous'));
    expect(result.reconciliation?.verdict).toBe('underpaid');
    // FINDING 1: autonomous + D1 → permittedRung(autonomous, D1) = A1 (evidence
    // caps A3 down to A1 — the weakest-link auth basis holds recovery back) …
    expect(result.recovery?.rung).toBe('A1');
    // … and a payer-facing submission is STILL human-gated regardless of rung.
    expect(result.recovery?.requiresHumanForSubmission).toBe(true);
    expect(latestOfType(result.evidence, 'recovery')?.status).toBe('draft');
  });

  it('threads orderId / authId / claimId / remittanceId across the continuation entries', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), await deps(store));
    const rec = result.evidence;

    const claim = latestOfType(rec, 'claim-submission');
    expect(claim?.orderId).toBe(rec.id); // order thread id
    expect(claim?.authId).toBe(REVIEWER_AUTH);
    expect(claim?.claimId).toBe('claim-1');

    const remit = latestOfType(rec, 'remittance');
    expect(remit?.claimId).toBe('claim-1');
    expect(remit?.remittanceId).toBe('RA-UHC-72148-0001');

    const recon = latestOfType(rec, 'reconciliation');
    expect(recon?.claimId).toBe('claim-1');
    expect(recon?.remittanceId).toBe('RA-UHC-72148-0001');

    const pas = latestOfType(rec, 'pas-decision');
    expect(pas?.authId).toBe(REVIEWER_AUTH);
    expect(pas?.decision).toBe('approved'); // PA required (not gold-carded) → approved
  });
});

describe('FINDING 1 — weakest-link recovery tier is LIVE (not a hard-wired D2)', () => {
  it('a genuinely weaker decision-critical input (an un-reconciled raw D0 remittance) DROPS currentTier and the rung', async () => {
    const store = spyStore();
    const base = await deps(store);
    // A second raw 835 arrived (a different remittanceId) and has NOT been
    // reconciled. It is a decision-critical D0 input the recovery decision must
    // answer to — it is NOT the remittance our reconciliation consumed, so it is
    // NOT excluded, and it is the weakest link.
    const primary = base.remittance.remittances[0];
    const unreconciledRaw: Normalized835 = {
      ...primary,
      remittanceId: 'RA-OTHER-9999',
      claimRef: 'CLM-OTHER-9999',
    };
    const d: CashDeps = {
      ...base,
      remittance: { ...base.remittance, remittances: [primary, unreconciledRaw] },
    };
    const result = await runOrderToCash(inputs(), d);

    // the primary claim is still a genuine underpayment …
    expect(result.reconciliation?.verdict).toBe('underpaid');
    // … but the un-reconciled raw D0 remittance is the weakest link → D0 …
    expect(result.currentTier).toBe('D0');
    // … which drops permittedRung(HITL, D0) to A0 (the OLD constant-D2 code could
    // never produce this — proving the invariant is live).
    expect(result.recovery?.rung).toBe('A0');
    expect(result.recovery?.requiresHumanForSubmission).toBe(true);
  });
});

describe('FINDING 2 — PA adjudication is a threaded INPUT, never synthesized', () => {
  it("a non-approving decision ('denied') yields NO recovery draft", async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), await deps(store, 'HITL', 'denied'));
    // A real shortfall, but under a denied PA it is not-recoverable (FINDING 4) …
    expect(result.reconciliation?.verdict).toBe('not-recoverable');
    // … so NO recovery is drafted and none is recorded on the spine.
    expect(result.recovery).toBeUndefined();
    expect(latestOfType(result.evidence, 'recovery')).toBeUndefined();
    // the PA decision on the spine is the caller-supplied 'denied' (not fabricated).
    expect(latestOfType(result.evidence, 'pas-decision')?.decision).toBe('denied');
  });

  it('an ABSENT pasDecision fails safe: no fabricated approval, no recovery', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), await deps(store, 'HITL', 'absent'));
    // No PA disposition was supplied → nothing is drafted (never defaults to approved).
    expect(result.recovery).toBeUndefined();
    // and no pas-decision entry is fabricated onto the spine.
    expect(latestOfType(result.evidence, 'pas-decision')).toBeUndefined();
  });
});

describe('FINDING 3 — a missing contracted rate yields indeterminate, no recovery', () => {
  it('feeSchedule.lookup undefined → indeterminate reconciliation, no fabricated overpaid, no recovery', async () => {
    const store = spyStore();
    const base = await deps(store);
    // No contracted rate on file for this code+payer.
    const emptyFeeSchedule: FeeSchedule = {
      asOf: TS,
      rates: [],
      lookup: () => undefined,
    };
    const result = await runOrderToCash(inputs(), { ...base, feeSchedule: emptyFeeSchedule });
    expect(result.reconciliation?.verdict).toBe('indeterminate');
    expect(result.reconciliation?.verdict).not.toBe('overpaid');
    expect(result.recovery).toBeUndefined();
    expect(latestOfType(result.evidence, 'recovery')).toBeUndefined();
  });
});

const SIGNER: SigningKey = { keyId: 'demo-hmac-v1', secret: 'demo-secret-key' };

describe('W2-1 — ledger integrity is exposed, tamper-evident, and tier-orthogonal', () => {
  it('a sealed run exposes integrity {intact:true, signed:true} and does NOT change the tier', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), { ...(await deps(store)), signer: SIGNER });

    expect(result.integrity).toBeDefined();
    expect(result.integrity?.intact).toBe(true);
    expect(result.integrity?.signed).toBe(true);
    expect(result.integrity?.alg).toBe('HMAC-SHA256');
    expect(result.integrity?.keyId).toBe('demo-hmac-v1');

    // the seal travels on the persisted record …
    expect(result.evidence.seal?.keyId).toBe('demo-hmac-v1');
    // … and it is INTEGRITY-only: the decision-critical tier is unchanged (still D1,
    // exactly as the unsealed run — a seal never lifts the tier).
    expect(result.currentTier).toBe('D1');
    expect(store.saves.length).toBe(1);
    expect(store.saves[0].seal?.keyId).toBe('demo-hmac-v1');
  });

  it('a tampered entry after sealing → verifyLedgerIntegrity reports intact:false', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), { ...(await deps(store)), signer: SIGNER });
    const seal = result.evidence.seal!;

    // Verifying the untouched sealed record passes.
    expect(verifyLedgerIntegrity(result.evidence, seal, SIGNER).intact).toBe(true);

    // Tamper: edit an entry AFTER the seal. The live-recomputed chain no longer
    // matches the sealed chain head → intact:false (and signed cannot verify).
    const tamperedEntries = result.evidence.entries.map((e) =>
      e.type === 'claim-submission' ? { ...e, total: e.total + 1 } : e
    );
    const tampered: EvidenceRecord = { ...result.evidence, entries: tamperedEntries };
    const v = verifyLedgerIntegrity(tampered, seal, SIGNER);
    expect(v.intact).toBe(false);
    expect(v.signed).toBe(false);
  });
});

describe('W2-4 — recordTier (full) vs currentTier (decision-critical) are distinct + lift-gated', () => {
  it('recordTier reflects the raw D0 remittance while currentTier is the decision-critical D1', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), await deps(store));

    // recordTier is the FULL weakest-link over the WHOLE record, including the raw
    // D0 remittance → D0. currentTier excludes the consumed (lifted) remittance →
    // D1. They must never be conflated.
    expect(result.summary.recordTier).toBe('D0');
    expect(result.currentTier).toBe('D1');
    expect(result.summary.recordTier).not.toBe(result.currentTier);
  });

  it('indeterminate reconciliation does NOT exclude the raw remittance → currentTier D0', async () => {
    const store = spyStore();
    const base = await deps(store);
    const emptyFeeSchedule: FeeSchedule = { asOf: TS, rates: [], lookup: () => undefined };
    const result = await runOrderToCash(inputs(), { ...base, feeSchedule: emptyFeeSchedule });

    expect(result.reconciliation?.verdict).toBe('indeterminate');
    expect(result.reconciliation?.liftsTierTo).toBeNull();
    // no lift → raw remittance NOT excluded → its honest D0 holds the tier.
    expect(result.currentTier).toBe('D0');
  });

  it('not-recoverable reconciliation does NOT exclude the raw remittance → currentTier D0', async () => {
    const store = spyStore();
    // A material shortfall under a DENIED PA → not-recoverable (reconciled, but no
    // recoverable finding). The consumed remittance is NOT excluded.
    const result = await runOrderToCash(inputs(), await deps(store, 'HITL', 'denied'));

    expect(result.reconciliation?.verdict).toBe('not-recoverable');
    expect(result.currentTier).toBe('D0');
    expect(result.recovery).toBeUndefined();
  });
});

describe('FLAG-OFF PARITY — the base hot path is unchanged', () => {
  it('runFinancialClearance appends NO order→cash continuation entries', async () => {
    const baseDeps = {
      library: lib,
      goldCardSource: mockGoldCardDataSource,
      denialRates: mockDenialRateProvider,
      store: createInMemoryEvidenceStore(),
      ts: TS,
      ids: {
        evidence: 'ev-otc-1',
        determination: 'det',
        goldCard: 'gc',
        propensity: 'prop',
        eligibility: 'elig',
        estimation: 'est',
      },
    };
    const base = await runFinancialClearance(inputs(), baseDeps);

    const continuationStages = ['claim', 'remittance', 'reconciliation', 'recovery'] as const;
    for (const stage of continuationStages) {
      expect(entriesForStage(base.evidence, stage)).toEqual([]);
    }
    // the E2E run shares the base fields byte-for-byte (hot path untouched)
    const store = spyStore();
    const e2e = await runOrderToCash(inputs(), await deps(store));
    expect(e2e.netRequiresPA).toBe(base.netRequiresPA);
    expect(e2e.eligibility).toEqual(base.eligibility);
    expect(e2e.estimate).toEqual(base.estimate);
    expect(e2e.workItem).toEqual(base.workItem);
  });
});
