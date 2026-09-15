/**
 * NIST AI-RMF — Phase E. A GOVERN/MAP/MEASURE/MANAGE + explainability projection over a real
 * order→cash thread: the page runs the REAL orchestrator (same wiring as the sibling reviewer
 * pages), then projects the sealed evidence record onto the NIST AI Risk Management Framework
 * (buildAiRmfProfile) and renders it. The projection adds no ledger entries and mutates nothing.
 *
 * Behind `goldenThreadE2E`. PHI-safe: the profile emits codes/tiers/reasons only.
 */
import { flag } from '@/lib/flags/flags';
import type { MemberContext } from '@/lib/policy';
import { loadMockLibrary } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import { getEvidenceStore } from '@/lib/evidence/store';
import { runOrderToCash, type CashResult } from '@/lib/goldenThread/orderToCash';
import type { StageOrder } from '@/lib/goldenThread';
import type { CoverageInfo } from '@/lib/goldenThread/eligibility';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import { getRemittanceGatewayLoader, getContractRepositoryLoader } from '@/lib/dataSources';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { createRuntime, createManualClock } from '@/lib/agentRuntime';
import { createRecoveryWorkflow } from '@/lib/agents/revenueCycle';
import { getAgentManifest } from '@/lib/agents/manifest';
import { buildAiRmfProfile } from '@/lib/evidence/nistAiRmf';
import { NistAiRmfPanel } from '@/components/evidence/NistAiRmfPanel';
import { EditorialShell } from '@/components/editorial/EditorialShell';
import AppLayout from '@/components/AppLayout';
import { getSessionPatient } from '@/lib/server/smartSession';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import { DEMO_SCENARIO, DEMO_THREAD_TS } from '@/lib/config/demoScenario';

export const dynamic = 'force-dynamic';

const REVENUE_CYCLE_AGENT_ID = 'revenue-cycle-agent';

function evidenceIdFor(memberId: string): string {
  return `ev-${memberId}-${DEMO_SCENARIO.orderCode}-nist-${Date.parse(DEMO_THREAD_TS)}`;
}

async function runSeedThread(memberId: string, evidenceId: string): Promise<CashResult> {
  const member: MemberContext = { memberId, diagnoses: [] };
  const order: StageOrder = {
    code: DEMO_SCENARIO.orderCode,
    codeSystem: DEMO_SCENARIO.orderCodeSystem,
    display: DEMO_SCENARIO.orderDisplay,
    providerNpi: DEMO_SCENARIO.providerNpi,
    payer: DEMO_SCENARIO.payer,
  };
  const coverage: CoverageInfo = {
    status: 'active',
    payer: DEMO_SCENARIO.payer,
    plan: DEMO_SCENARIO.plan,
    type: DEMO_SCENARIO.coverageType,
  };
  const inputs: ThreadInputs = { member, order, coverage };
  const [remittance, feeSchedule, signer] = await Promise.all([
    getRemittanceGatewayLoader().load(DEMO_THREAD_TS),
    getContractRepositoryLoader().load(DEMO_THREAD_TS),
    getSigningKeyLoader().load(DEMO_THREAD_TS),
  ]);
  const recoveryRuntime = createRuntime({ clock: createManualClock(Date.parse(DEMO_THREAD_TS)) });
  return (await runOrderToCash(inputs, {
    library: loadMockLibrary(),
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store: getEvidenceStore(),
    ts: DEMO_THREAD_TS,
    remittance,
    feeSchedule,
    pasDecision: 'approved',
    reviewerAuthId: `auth-${memberId}-${DEMO_SCENARIO.orderCode}`,
    recoveryAgentTier: getAgentManifest(REVENUE_CYCLE_AGENT_ID).autonomyTier,
    recovery: { engine: recoveryRuntime.engine, makeWorkflow: createRecoveryWorkflow },
    signer,
    sealTs: DEMO_THREAD_TS,
    idempotency: false,
    ids: {
      evidence: evidenceId,
      determination: `${evidenceId}-det`,
      goldCard: `${evidenceId}-gc`,
      propensity: `${evidenceId}-prop`,
      eligibility: `${evidenceId}-elig`,
      estimation: `${evidenceId}-est`,
      pasDecision: `${evidenceId}-pas`,
      claim: `${evidenceId}-claim`,
      remittance: `${evidenceId}-rem`,
      reconciliation: `${evidenceId}-recon`,
      underpayment: `${evidenceId}-under`,
      recovery: `${evidenceId}-recovery`,
    },
  })) as CashResult;
}

export default async function NistAiRmfPage(): Promise<React.ReactElement> {
  if (!flag('goldenThreadE2E')) {
    return (
      <AppLayout
        pageTitle="NIST AI-RMF"
        breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'NIST AI-RMF' }]}
      >
        <div className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-carbon-gray-70">The NIST AI-RMF view is not enabled.</p>
        </div>
      </AppLayout>
    );
  }

  const memberId = (await getSessionPatient().catch(() => null)) ?? DEMO_MEMBER_ID;
  const cash = await runSeedThread(memberId, evidenceIdFor(memberId));
  const profile = buildAiRmfProfile(cash);

  return (
    <AppLayout
      pageTitle="NIST AI-RMF"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'NIST AI-RMF' }]}
      fullBleed
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorialShell
          eyebrow="AI governance · Explainability"
          title="NIST AI Risk-Management Framework"
          subtitle={
            <>
              The order→cash thread projected onto the NIST AI-RMF: the four core functions (GOVERN
              · MAP · MEASURE · MANAGE), the seven trustworthiness characteristics, and a
              per-decision explainability record — what fired, its version, the evidence tier and
              the authority it licenses, and a member-facing reason. An extension <em>over</em> the
              sealed record; it adds no entries and mutates nothing.
            </>
          }
          badge="Projection over real evidence · AI-RMF 1.0 · explainability & appealability"
        >
          <NistAiRmfPanel profile={profile} />
        </EditorialShell>
      </div>
    </AppLayout>
  );
}
