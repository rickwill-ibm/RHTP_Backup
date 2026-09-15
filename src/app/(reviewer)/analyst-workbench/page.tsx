/**
 * Analyst Workbench — Wave-10. The IN-APP, LIVE-WIRED analyst surface: a thin client over
 * the REAL backend endpoints proving the workbench runs against the actual engine, not
 * curated front-end data.
 *
 * This server component PERSISTS the seed order→cash thread (mirroring the golden-thread
 * page's `runOrderToCash` wiring, same deterministic ids) so the Evidence Record + the
 * recovery draft exist in the shared runtime store the Wave-8 GET and the Wave-9 action
 * route read. It then hands the client the record id + the REAL analysis registry
 * (`ANALYSES`, mapped to id/label/party) — the client toggles party, picks an analysis,
 * RUNs it against `GET /api/evidence/:id?party=&analysis=`, and APPROVEs via
 * `POST /api/recovery/:id-recovery/action`, rendering whatever those endpoints return.
 *
 * DYNAMIC: `force-dynamic` so `flag('goldenThreadE2E')` is evaluated per-request (not frozen
 * at build) and the orchestrator persists to the RUNTIME evidence singleton the routes read.
 * Behind `goldenThreadE2E` (default OFF → renders the app shell with a "not enabled" notice).
 *
 * PHI DISCIPLINE: the evidence record id embeds a member reference — it is passed to the
 * client ONLY to build request URLs and is NEVER rendered (mirrors the decision panel).
 */
import { flag } from '@/lib/flags/flags';
import type { MemberContext } from '@/lib/policy';
import { loadMockLibrary } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import { getEvidenceStore } from '@/lib/evidence/store';
import { runOrderToCash } from '@/lib/goldenThread/orderToCash';
import type { StageOrder } from '@/lib/goldenThread';
import type { CoverageInfo } from '@/lib/goldenThread/eligibility';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import { getRemittanceGatewayLoader, getContractRepositoryLoader } from '@/lib/dataSources';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { createRuntime, createManualClock } from '@/lib/agentRuntime';
import { createRecoveryWorkflow } from '@/lib/agents/revenueCycle';
import { getAgentManifest } from '@/lib/agents/manifest';
import { ANALYSES } from '@/lib/goldenThread/ledgerAnalytics';
import {
  AnalystWorkbench,
  type WorkbenchAnalysis,
} from '@/components/goldenThread/AnalystWorkbench';
import AppLayout from '@/components/AppLayout';
import { getSessionPatient } from '@/lib/server/smartSession';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import { DEMO_SCENARIO, DEMO_THREAD_TS } from '@/lib/config/demoScenario';

export const dynamic = 'force-dynamic';

// The demo MEMBER is resolved from the session (SMART) or the configured DEMO_MEMBER_ID; the
// order/coverage scenario + the deterministic timestamp come from config — no record literals here.

/** The stable evidence id the client uses to address the endpoints (never rendered). */
function evidenceIdFor(memberId: string): string {
  return `ev-${memberId}-${DEMO_SCENARIO.orderCode}-${Date.parse(DEMO_THREAD_TS)}`;
}

/** Run the REAL orchestrator on the demo order and persist to the shared store. */
async function persistSeedThread(memberId: string, evidenceId: string): Promise<void> {
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

  await runOrderToCash(inputs, {
    library: loadMockLibrary(),
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store: getEvidenceStore(), // shared runtime singleton — the Wave-9 action route reads it
    ts: DEMO_THREAD_TS,
    remittance,
    feeSchedule,
    pasDecision: 'approved',
    reviewerAuthId: `auth-${memberId}-${DEMO_SCENARIO.orderCode}`,
    recoveryAgentTier: getAgentManifest('revenue-cycle-agent').autonomyTier,
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
  });
}

function NotEnabled(): React.ReactElement {
  return (
    <AppLayout
      pageTitle="Analyst Workbench"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Analyst Workbench' }]}
    >
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-carbon-gray-70">The Analyst Workbench is not enabled.</p>
      </div>
    </AppLayout>
  );
}

export default async function AnalystWorkbenchPage(): Promise<React.ReactElement> {
  if (!flag('goldenThreadE2E')) return NotEnabled();

  // Resolve the member from the session (SMART launch) or fall back to the configured demo member.
  const memberId = (await getSessionPatient().catch(() => null)) ?? DEMO_MEMBER_ID;
  const evidenceId = evidenceIdFor(memberId);
  await persistSeedThread(memberId, evidenceId);

  // The REAL registry, mapped to the PHI-safe shape the client needs (id/label/party).
  const analyses: WorkbenchAnalysis[] = ANALYSES.map((a) => ({
    id: a.id,
    label: a.label,
    party: a.party,
  }));

  return (
    <AppLayout
      pageTitle="Analyst Workbench"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Analyst Workbench' }]}
    >
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Analyst Workbench</h1>
          <p className="mt-1 text-sm text-carbon-gray-70">
            Run the real, gated ledger analyses over the party-scoped projection of a persisted
            Evidence Record and trigger the governed analyst action — live against the actual Wave-8
            / Wave-9 endpoints.
          </p>
          <p className="mt-2 rounded border border-carbon-yellow bg-carbon-yellow-light p-2 text-xs text-[#b45309]">
            Prototype on seed data. This page persists the seed order&#8594;cash thread (with a
            recovery draft) before rendering; the analysis RUN and the governed Approve both read
            that SAME persisted, sealed Evidence Record, so the finding you see is the exact basis
            for the action. Any submission shown is a mock, not transmitted end-to-end.
          </p>
        </header>

        <AnalystWorkbench recordId={evidenceId} analyses={analyses} />
      </div>
    </AppLayout>
  );
}
