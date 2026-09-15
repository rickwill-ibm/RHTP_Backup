/**
 * W2-2 — 835 replay idempotency (safety).
 *
 * The dedupe key is the payer-side business pair `${claimRef}:${remittanceId}`,
 * NEVER the synthetic per-request ids/ts. So two runOrderToCash invocations with
 * DIFFERENT ts + ids but the SAME 835 dedupe to ONE processing: the second appends
 * no second reconciliation/recovery and persists nothing. Distinct remittanceIds
 * are independent.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runOrderToCash, type CashDeps } from '@/lib/goldenThread/orderToCash';
import { createInMemoryEvidenceStore, type EvidenceStore } from '@/lib/evidence/evidenceStore';
import { entriesForStage, latestOfType, type EvidenceRecord } from '@/lib/evidence';
import { resetDefaultIdempotencyStore } from '@/lib/idempotency';
import { loadMockLibrary, type MemberContext } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import {
  getRemittanceGatewayLoader,
  type RemittanceAdvice,
} from '@/lib/dataSources/remittanceGateway';
import { getContractRepositoryLoader } from '@/lib/dataSources/contractRepository';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import type { StageOrder } from '@/lib/goldenThread';

const lib = loadMockLibrary();
const PAYER = 'UnitedHealthcare Community Plan';

afterEach(() => resetDefaultIdempotencyStore());

function inputs(): ThreadInputs {
  const member: MemberContext = { memberId: 'MARIA_SD_001', diagnoses: [] };
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

/** deps with a distinct ts + id namespace per call, and a caller-supplied 835. */
async function deps(opts: {
  store: EvidenceStore;
  ts: string;
  idPrefix: string;
  remittance: RemittanceAdvice;
}): Promise<CashDeps> {
  const feeSchedule = await getContractRepositoryLoader().load(opts.ts);
  const p = opts.idPrefix;
  return {
    library: lib,
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store: opts.store,
    ts: opts.ts,
    remittance: opts.remittance,
    feeSchedule,
    pasDecision: 'approved',
    reviewerAuthId: `auth-${p}`,
    recoveryAgentTier: 'HITL',
    idempotency: true,
    ids: {
      evidence: `${p}-ev`,
      determination: `${p}-det`,
      goldCard: `${p}-gc`,
      propensity: `${p}-prop`,
      eligibility: `${p}-elig`,
      estimation: `${p}-est`,
      pasDecision: `${p}-pas`,
      claim: `${p}-claim`,
      remittance: `${p}-rem`,
      reconciliation: `${p}-recon`,
      underpayment: `${p}-under`,
      recovery: `${p}-recovery`,
    },
  };
}

describe('W2-2 — 835 replay idempotency (payer-side business keys)', () => {
  it('a second run with the SAME 835 but DIFFERENT ts/ids is deduped (no second recovery)', async () => {
    const remittance = await getRemittanceGatewayLoader().load('2026-08-30T00:00:00.000Z');

    // First delivery — full continuation, one persist, a recovery draft.
    const store1 = spyStore();
    const first = await runOrderToCash(
      inputs(),
      await deps({ store: store1, ts: '2026-08-30T00:00:00.000Z', idPrefix: 'run1', remittance })
    );
    expect(first.deduped).toBeUndefined();
    expect(first.reconciliation?.verdict).toBe('underpaid');
    expect(latestOfType(first.evidence, 'recovery')?.status).toBe('draft');
    expect(store1.saves.length).toBe(1);

    // Replay — SAME 835 (same claimRef + remittanceId), DIFFERENT ts + ids.
    const store2 = spyStore();
    const second = await runOrderToCash(
      inputs(),
      await deps({ store: store2, ts: '2026-09-01T12:00:00.000Z', idPrefix: 'run2', remittance })
    );

    // deduped no-op: no second reconciliation/recovery appended, nothing persisted.
    expect(second.deduped).toBe(true);
    expect(second.recovery).toBeUndefined();
    expect(entriesForStage(second.evidence, 'reconciliation')).toEqual([]);
    expect(entriesForStage(second.evidence, 'recovery')).toEqual([]);
    expect(entriesForStage(second.evidence, 'remittance')).toEqual([]);
    expect(store2.saves.length).toBe(0);

    // FINDING 3: a dedupe replay must NOT surface a live verdict/tier/integrity a
    // consumer could mistake for a fresh finding — they are OMITTED entirely.
    expect(second.reconciliation).toBeUndefined();
    expect(second.currentTier).toBeUndefined();
    expect(second.integrity).toBeUndefined();
  });

  it('a DIFFERENT remittanceId is an independent 835 and processes fully', async () => {
    const base = await getRemittanceGatewayLoader().load('2026-08-30T00:00:00.000Z');
    const primary = base.remittances[0];

    // First 835 processed.
    const store1 = spyStore();
    const first = await runOrderToCash(
      inputs(),
      await deps({ store: store1, ts: '2026-08-30T00:00:00.000Z', idPrefix: 'a', remittance: base })
    );
    expect(first.deduped).toBeUndefined();
    expect(store1.saves.length).toBe(1);

    // A DIFFERENT 835 (distinct remittanceId + claimRef) — independent, processes fully.
    const distinct: RemittanceAdvice = {
      ...base,
      remittances: [{ ...primary, remittanceId: 'RA-UHC-72148-0002', claimRef: 'CLM-72148-0002' }],
    };
    const store2 = spyStore();
    const second = await runOrderToCash(
      inputs(),
      await deps({ store: store2, ts: '2026-08-31T00:00:00.000Z', idPrefix: 'b', remittance: distinct })
    );
    expect(second.deduped).toBeUndefined();
    expect(second.reconciliation?.verdict).toBe('underpaid');
    expect(latestOfType(second.evidence, 'recovery')?.status).toBe('draft');
    expect(store2.saves.length).toBe(1);
  });

  // FINDING 2 — mark-before-commit / silent loss. The durable marker is claimed
  // only AFTER a successful save, so a run whose save FAILS leaves NO marker and a
  // replay REPROCESSES (recovers the underpayment) instead of returning a deduped
  // no-op that silently drops it.
  it('a save FAILURE leaves no marker → a replay REPROCESSES (no silent loss)', async () => {
    const remittance = await getRemittanceGatewayLoader().load('2026-08-30T00:00:00.000Z');

    // Run 1: the store's save throws → runOrderToCash rejects, no marker written.
    const throwingStore: EvidenceStore = {
      async save() {
        throw new Error('evidence store unavailable (simulated)');
      },
      async get() {
        return null;
      },
      async list() {
        return [];
      },
    };
    await expect(
      runOrderToCash(
        inputs(),
        await deps({ store: throwingStore, ts: '2026-08-30T00:00:00.000Z', idPrefix: 'fail1', remittance })
      )
    ).rejects.toThrow(/unavailable/);

    // Run 2: SAME 835. Because run 1 never claimed the marker, this is NOT deduped —
    // it reprocesses fully, produces the recovery draft, and persists once.
    const store2 = spyStore();
    const second = await runOrderToCash(
      inputs(),
      await deps({ store: store2, ts: '2026-09-02T00:00:00.000Z', idPrefix: 'recover2', remittance })
    );
    expect(second.deduped).toBeUndefined();
    expect(second.reconciliation?.verdict).toBe('underpaid');
    expect(latestOfType(second.evidence, 'recovery')?.status).toBe('draft');
    expect(store2.saves.length).toBe(1);
  });
});
