/**
 * Wave-3 MED-NEW + ROBUSTNESS — materiality-driven recovery priority is DURABLE.
 *
 * Split out of orderToCashRecovery.test.ts to keep that file under the 500-line cap
 * (AI-CODING-CONVENTIONS §2/§3). Proves:
 *  - MED-NEW: the computed recoveryPriority (urgent near-deadline / high-delta) is
 *    persisted on the durable recovery evidence entry AND surfaced on the durable
 *    reviewer work item (buildProposalWorkItem SLA class), no longer a hardcoded
 *    'routine'. A far-deadline low-delta recovery stays routine/standard.
 *  - ROBUSTNESS: a malformed (unparseable) paidDate does NOT 500 the whole run — the
 *    recovery is produced deadline-unknown (no filingDeadline) with priority 'high'.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runOrderToCash, type CashDeps } from '@/lib/goldenThread/orderToCash';
import { createInMemoryEvidenceStore, type EvidenceStore } from '@/lib/evidence/evidenceStore';
import { latestOfType, type EvidenceRecord } from '@/lib/evidence';
import { resetDefaultIdempotencyStore } from '@/lib/idempotency';
import { loadMockLibrary, type MemberContext } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import {
  getRemittanceGatewayLoader,
  type RemittanceAdvice,
} from '@/lib/dataSources/remittanceGateway';
import {
  getContractRepositoryLoader,
  type FeeSchedule,
} from '@/lib/dataSources/contractRepository';
import { createRuntime } from '@/lib/agentRuntime';
import { createRecoveryWorkflow } from '@/lib/agents/revenueCycle';
import { getAgentManifest } from '@/lib/agents/manifest';
import { recoveryReviewItem } from '@/lib/goldenThread/workQueueView';
import {
  RECOVERY_FILING_WINDOW_DAYS,
  RECOVERY_URGENT_WINDOW_DAYS,
  RECOVERY_URGENT_DELTA,
} from '@/lib/goldenThread/recoveryDispatch';
import { clearSessionDataModes } from '@/lib/config/dataMode';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import type { StageOrder } from '@/lib/goldenThread';

const lib = loadMockLibrary();
const TS = '2026-08-30T00:00:00.000Z';
const PAYER = 'UnitedHealthcare Community Plan';
const REVIEWER_AUTH = 'auth-MARIA_SD_001-72148';
const MEMBER = 'MARIA_SD_001';
const RECOVERY_ID = 'recovery-1';

afterEach(() => {
  resetDefaultIdempotencyStore();
  clearSessionDataModes();
});

function inputs(): ThreadInputs {
  const member: MemberContext = { memberId: MEMBER, diagnoses: [] };
  const order: StageOrder = {
    code: '72148',
    codeSystem: 'CPT',
    display: 'MRI lumbar',
    providerNpi: '1518998765',
    payer: PAYER,
  };
  return { member, order, coverage: { status: 'active', payer: PAYER, plan: 'Texas STAR' } };
}

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

function runtime(): NonNullable<CashDeps['recovery']> {
  const rt = createRuntime();
  return { engine: rt.engine, makeWorkflow: createRecoveryWorkflow };
}

async function deps(opts: {
  store: EvidenceStore;
  recovery?: NonNullable<CashDeps['recovery']>;
  feeSchedule?: FeeSchedule;
  remittance?: RemittanceAdvice;
}): Promise<CashDeps> {
  const [remittance, feeSchedule] = await Promise.all([
    opts.remittance ? Promise.resolve(opts.remittance) : getRemittanceGatewayLoader().load(TS),
    opts.feeSchedule ? Promise.resolve(opts.feeSchedule) : getContractRepositoryLoader().load(TS),
  ]);
  return {
    library: lib,
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store: opts.store,
    ts: TS,
    remittance,
    feeSchedule,
    pasDecision: 'approved',
    reviewerAuthId: REVIEWER_AUTH,
    recoveryAgentTier: getAgentManifest('revenue-cycle-agent').autonomyTier,
    ...(opts.recovery ? { recovery: opts.recovery } : {}),
    ids: {
      evidence: 'otc-ev',
      determination: 'otc-det',
      goldCard: 'otc-gc',
      propensity: 'otc-prop',
      eligibility: 'otc-elig',
      estimation: 'otc-est',
      pasDecision: 'otc-pas',
      claim: 'otc-claim',
      remittance: 'otc-rem',
      reconciliation: 'otc-recon',
      underpayment: 'otc-under',
      recovery: RECOVERY_ID,
    },
  };
}

/** Clone the seeded 835 applying `mut` to every remittance line. */
async function remittanceWith(
  mut: (m: RemittanceAdvice['remittances'][number]) => RemittanceAdvice['remittances'][number]
): Promise<RemittanceAdvice> {
  const base = await getRemittanceGatewayLoader().load(TS);
  return { ...base, remittances: base.remittances.map(mut) };
}

describe('Wave-3 MED-NEW — materiality-driven priority is persisted + surfaced on the durable item', () => {
  it('a near-deadline underpaid recovery persists priority:urgent AND the work item is expedited (not routine)', async () => {
    const store = spyStore();
    // paidDate chosen so the filing deadline lands 5 days after `ts` → daysToDeadline
    // (5) ≤ RECOVERY_URGENT_WINDOW_DAYS → urgent, regardless of the (small) delta.
    const nearPaidDate = new Date(
      Date.parse(TS) - (RECOVERY_FILING_WINDOW_DAYS - 5) * 86_400_000
    ).toISOString();
    const remittance = await remittanceWith((m) => ({ ...m, paidDate: nearPaidDate }));
    const result = await runOrderToCash(
      inputs(),
      await deps({ store, recovery: runtime(), remittance })
    );

    expect(result.reconciliation?.verdict).toBe('underpaid');
    expect(daysToDeadlineOf(result.recovery?.filingDeadline)).toBeLessThanOrEqual(
      RECOVERY_URGENT_WINDOW_DAYS
    );
    // Persisted on the durable recovery entry …
    expect(latestOfType(result.evidence, 'recovery')?.priority).toBe('urgent');
    // … and surfaced on the durable reviewer work item: an 'urgent' entry maps to the
    // 'expedited' SLA class (72h) on the WorkItem — NOT the old hardcoded routine.
    const review = recoveryReviewItem(store.saves[0]);
    expect(review?.priority).toBe('expedited');
    expect(review?.slaHours).toBe(72);
  });

  it('a high-delta (≥ RECOVERY_URGENT_DELTA) underpaid recovery is urgent even with a far deadline', async () => {
    const store = spyStore();
    // Paid far below the contracted allowed so the recoverable delta clears
    // RECOVERY_URGENT_DELTA (materiality path); deadline stays ~120d out (seed paidDate).
    // Keep the seed adjustments (PR present → member liability determinable):
    // delta = contractedAllowed − PR(150) − paid(0) = 9850.
    const bigDelta = await remittanceWith((m) => ({ ...m, paidAmount: 0 }));
    const feeSchedule: FeeSchedule = {
      asOf: TS,
      rates: [],
      lookup: () => ({ code: '72148', payer: PAYER, contractedAllowed: 10_000, effectiveOn: TS }),
    };
    const result = await runOrderToCash(
      inputs(),
      await deps({ store, recovery: runtime(), remittance: bigDelta, feeSchedule })
    );

    expect(result.reconciliation?.verdict).toBe('underpaid');
    expect(Math.abs(result.reconciliation!.delta)).toBeGreaterThanOrEqual(RECOVERY_URGENT_DELTA);
    expect(latestOfType(result.evidence, 'recovery')?.priority).toBe('urgent');
    expect(recoveryReviewItem(store.saves[0])?.priority).toBe('expedited');
  });

  it('a far-deadline low-delta underpaid recovery persists priority:routine → standard work item', async () => {
    const store = spyStore();
    // Seeded scenario: paidDate 2026-08-30, delta 100, deadline ~120 days out → far from
    // the window AND under the delta threshold → routine.
    const result = await runOrderToCash(inputs(), await deps({ store, recovery: runtime() }));

    expect(result.reconciliation?.verdict).toBe('underpaid');
    expect(latestOfType(result.evidence, 'recovery')?.priority).toBe('routine');
    const review = recoveryReviewItem(store.saves[0]);
    expect(review?.priority).toBe('standard');
    expect(review?.slaHours).toBe(24 * 7);
  });
});

describe('Wave-3 ROBUSTNESS — a malformed paidDate degrades gracefully (no 500)', () => {
  it('an unparseable paidDate → the run completes with a deadline-unknown-priority recovery', async () => {
    const store = spyStore();
    const remittance = await remittanceWith((m) => ({ ...m, paidDate: 'not-a-date' }));
    // Does NOT throw (previously `new Date(NaN).toISOString()` → RangeError 500'd the run).
    const result = await runOrderToCash(
      inputs(),
      await deps({ store, recovery: runtime(), remittance })
    );

    expect(result.reconciliation?.verdict).toBe('underpaid');
    const recovery = latestOfType(result.evidence, 'recovery');
    // Deadline-unknown: no filingDeadline persisted on the entry or the outcome …
    expect(recovery?.filingDeadline).toBeUndefined();
    expect(result.recovery?.filingDeadline).toBeUndefined();
    // C6: … and priority is the DISTINCT `deadline-unknown` triage sentinel (an unknown
    // appeal window is NOT routine, and NOT the genuine `high` band it used to overload).
    expect(recovery?.priority).toBe('deadline-unknown');
    // The durable item still renders (a non-urgent priority maps to the 'standard' SLA class).
    expect(recoveryReviewItem(store.saves[0])?.priority).toBe('standard');
    // Persisted exactly once — the flow ran to completion.
    expect(store.saves.length).toBe(1);
  });
});

/** Whole days from TS until an (optional) ISO deadline; -Infinity when absent. */
function daysToDeadlineOf(deadline: string | undefined): number {
  if (!deadline) return -Infinity;
  return Math.floor((Date.parse(deadline) - Date.parse(TS)) / 86_400_000);
}
