/**
 * W2-3 — tenant stamping + fail-closed enforcement in the order→cash flow.
 *
 * mock/demo: the demo actor scope matches the single demo tenant, so every
 * financial entry carries tenant 'tenant-demo' and the demo is unchanged.
 *
 * cross-tenant / production-empty-claim: requireTenantScope THROWS before any
 * append or `deps.store.save`, so NO ledger row is written (fail-closed isolation).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runOrderToCash, type CashDeps } from '@/lib/goldenThread/orderToCash';
import { TenantScopeRequiredError } from '@/lib/goldenThread/tenantStamp';
import { createInMemoryEvidenceStore, type EvidenceStore } from '@/lib/evidence/evidenceStore';
import { latestOfType, type EvidenceRecord } from '@/lib/evidence';
import { resolveActorTenantScope, type TenantScope } from '@/lib/security/tenant';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import type { Principal } from '@/lib/authz/principal';
import { loadMockLibrary, type MemberContext } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import { getRemittanceGatewayLoader } from '@/lib/dataSources/remittanceGateway';
import { getContractRepositoryLoader } from '@/lib/dataSources/contractRepository';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import type { StageOrder } from '@/lib/goldenThread';

const lib = loadMockLibrary();
const TS = '2026-08-30T00:00:00.000Z';
const PAYER = 'UnitedHealthcare Community Plan';

const orgReviewer: Principal = {
  userId: 'Practitioner/rev-1',
  role: 'pa-reviewer',
  authorizedMemberScope: { kind: 'org' },
};

afterEach(() => clearSessionDataModes());

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

async function deps(store: EvidenceStore, actorScope?: TenantScope): Promise<CashDeps> {
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
    pasDecision: 'approved',
    reviewerAuthId: 'auth-MARIA_SD_001-72148',
    recoveryAgentTier: 'HITL',
    ...(actorScope ? { actorScope } : {}),
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

describe('W2-3 tenancy — demo (mock) stamps tenant-demo, demo unchanged', () => {
  it('every financial entry carries tenant "tenant-demo"', async () => {
    const store = spyStore();
    // mock mode → resolveActorTenantScope returns the permissive demo scope.
    const actorScope = resolveActorTenantScope(orgReviewer, {});
    expect(actorScope.kind).toBe('demo');

    const result = await runOrderToCash(inputs(), await deps(store, actorScope));

    // the run proceeds normally (unchanged demo verdict + recovery draft) …
    expect(result.reconciliation?.verdict).toBe('underpaid');
    expect(result.recovery?.action).toBe('draft-appeal');
    expect(store.saves.length).toBe(1);

    // … and every financial entry is stamped tenant-demo.
    expect(latestOfType(result.evidence, 'pas-decision')?.tenant).toBe('tenant-demo');
    expect(latestOfType(result.evidence, 'claim-submission')?.tenant).toBe('tenant-demo');
    expect(latestOfType(result.evidence, 'remittance')?.tenant).toBe('tenant-demo');
    expect(latestOfType(result.evidence, 'reconciliation')?.tenant).toBe('tenant-demo');
    expect(latestOfType(result.evidence, 'underpayment')?.tenant).toBe('tenant-demo');
    expect(latestOfType(result.evidence, 'recovery')?.tenant).toBe('tenant-demo');
  });

  it('with NO actorScope the entries carry NO tenant (unchanged, non-tenanted path)', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), await deps(store));
    expect(latestOfType(result.evidence, 'claim-submission')?.tenant).toBeUndefined();
    expect(latestOfType(result.evidence, 'reconciliation')?.tenant).toBeUndefined();
    expect(store.saves.length).toBe(1);
  });
});

describe('W2-3 tenancy — fail-closed: cross-tenant / absent claim writes NO ledger row', () => {
  it('a cross-tenant actor scope throws before save (0 rows written)', async () => {
    const store = spyStore();
    // A single-tenant actor bound to some OTHER tenant; the member resolves to the
    // demo tenant → assertTenantScope denies → requireTenantScope throws.
    const crossTenant: TenantScope = { kind: 'single', tenantIds: ['tenant:some-other-plan'] };
    await expect(runOrderToCash(inputs(), await deps(store, crossTenant))).rejects.toBeInstanceOf(
      TenantScopeRequiredError
    );
    expect(store.saves.length).toBe(0);
  });

  it('production mode + empty tenant claim fails closed (0 rows written)', async () => {
    setSessionDataMode('tenancy', 'production');
    const store = spyStore();
    // Production: the session carries no tenant claim → empty actor scope → deny.
    const emptyScope = resolveActorTenantScope(orgReviewer, { fhirUser: 'Practitioner/rev-1' });
    expect(emptyScope.tenantIds).toEqual([]);
    await expect(runOrderToCash(inputs(), await deps(store, emptyScope))).rejects.toBeInstanceOf(
      TenantScopeRequiredError
    );
    expect(store.saves.length).toBe(0);
  });

  // FINDING 5: a caller that OMITS actorScope entirely must not write unstamped
  // financial entries in production — the boundary is fail-closed on absence too.
  it('production mode + ABSENT actorScope throws before any write (0 rows written)', async () => {
    setSessionDataMode('tenancy', 'production');
    const store = spyStore();
    // deps() with no actorScope → deps.actorScope is undefined.
    await expect(runOrderToCash(inputs(), await deps(store))).rejects.toBeInstanceOf(
      TenantScopeRequiredError
    );
    expect(store.saves.length).toBe(0);
  });
});
