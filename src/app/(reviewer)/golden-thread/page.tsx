/**
 * Golden Thread — Guided reviewer surface (Phase A). The VISIBLE, guided surface for
 * the order→cash / recovery capability. Server-rendered and SELF-CONTAINED: it runs the
 * REAL `runOrderToCash` orchestrator on the seed member for a chosen SCENARIO under a
 * chosen policy PRESET, and renders the whole thread — stage by stage — through the
 * recovery proposal, the Twin-Ladder interlock, the sealed Evidence Record rail, and a
 * live HITL decision control. No SMART launch required (mirrors the existing
 * financial-clearance page's offline orchestrator run).
 *
 * SCENARIO + PRESET are `?scenario=..&preset=..` query params (fully live): the page
 * re-runs the real pipeline per request. The preset threads through the REAL governance
 * — a manifest-registry override for the recovery agent's autonomy tier (createRuntime),
 * CashDeps.recoveryAgentTier, the reconciliation materiality, and the filing window.
 *
 * DYNAMIC (Finding 1): `force-dynamic` so `flag('goldenThreadE2E')` is evaluated
 * per-request (not frozen at build) and the orchestrator persists to the RUNTIME
 * evidence singleton the decision route reads.
 *
 * Behind `goldenThreadE2E` (default OFF → renders the app shell with a "not enabled" notice).
 *
 * PHI DISCIPLINE: renders codes / amounts / refs only. The evidence record id embeds a
 * member reference, so it is masked to 'evidence-record' before the surface/rail; the
 * real recovery work-item id is forwarded only to the decision panel to address the
 * endpoint, never rendered. The scenario+preset are folded into the evidence id so the
 * decision route's `/api/recovery/{id}/decision` POST reconstructs the right record.
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
import type { RemittanceAdvice } from '@/lib/dataSources/remittanceGateway';
import { getContractRepositoryLoader } from '@/lib/dataSources';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { createRuntime, createManualClock } from '@/lib/agentRuntime';
import { createRecoveryWorkflow } from '@/lib/agents/revenueCycle';
import { buildPresetRegistry } from '@/lib/goldenThread/presetRegistry';
import {
  THREAD_SCENARIOS,
  scenarioList,
  type ThreadScenario,
  type ThreadScenarioId,
} from '@/lib/goldenThread/threadScenarios';
import {
  THREAD_PRESETS,
  presetList,
  type ThreadPreset,
  type ThreadPresetId,
} from '@/lib/goldenThread/threadPresets';
import { GoldenThreadSurface } from '@/components/goldenThread/GoldenThreadSurface';
import AppLayout from '@/components/AppLayout';
import { getSessionPatient } from '@/lib/server/smartSession';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import { DEMO_SCENARIO, DEMO_THREAD_TS } from '@/lib/config/demoScenario';

export const dynamic = 'force-dynamic';

// The demo MEMBER is resolved from the session (SMART) or the configured DEMO_MEMBER_ID; the
// order/coverage context + the deterministic timestamp come from config. The SCENARIO's 835 and
// the PRESET's governance levers are threaded through the REAL orchestrator — no record literals.
async function runThread(
  memberId: string,
  scenarioId: ThreadScenarioId,
  presetId: ThreadPresetId,
  scenario: ThreadScenario,
  preset: ThreadPreset
): Promise<CashResult> {
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

  // Fold scenario+preset into the evidence id so the decision route reconstructs the
  // exact record from `/api/recovery/{id}/decision`.
  const evId = `ev-${memberId}-${scenarioId}-${presetId}-${Date.parse(DEMO_THREAD_TS)}`;

  const [feeSchedule, signer] = await Promise.all([
    getContractRepositoryLoader().load(DEMO_THREAD_TS),
    getSigningKeyLoader().load(DEMO_THREAD_TS),
  ]);
  // The 835 for this run comes from the chosen scenario, wrapped as RemittanceAdvice.
  const remittance: RemittanceAdvice = { asOf: DEMO_THREAD_TS, remittances: [scenario.remit] };

  // The preset promotes the recovery agent's autonomy tier via a manifest registry
  // override threaded into the runtime engine (additive createRuntime shim).
  const presetRegistry = buildPresetRegistry(preset.autonomyTier);
  const recoveryRuntime = createRuntime({
    clock: createManualClock(Date.parse(DEMO_THREAD_TS)),
    registry: presetRegistry,
  });

  return (await runOrderToCash(inputs, {
    library: loadMockLibrary(),
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store: getEvidenceStore(), // shared runtime singleton — the decision route reads it
    ts: DEMO_THREAD_TS,
    remittance,
    feeSchedule,
    pasDecision: scenario.pasDecision, // stipulated scenario fact
    reviewerAuthId: `auth-${memberId}-${scenarioId}`,
    recoveryAgentTier: preset.autonomyTier,
    materiality: preset.materiality,
    filingWindowDays: preset.filingWindowDays,
    recovery: { engine: recoveryRuntime.engine, makeWorkflow: createRecoveryWorkflow },
    signer,
    sealTs: DEMO_THREAD_TS,
    idempotency: false, // a UI demo needs no 835 dedupe; avoids empty-on-refresh
    ids: {
      evidence: evId,
      determination: `${evId}-det`,
      goldCard: `${evId}-gc`,
      propensity: `${evId}-prop`,
      eligibility: `${evId}-elig`,
      estimation: `${evId}-est`,
      pasDecision: `${evId}-pas`,
      claim: `${evId}-claim`,
      remittance: `${evId}-rem`,
      reconciliation: `${evId}-recon`,
      underpayment: `${evId}-under`,
      recovery: `${evId}-recovery`,
    },
  })) as CashResult;
}

function NotEnabled(): React.ReactElement {
  return (
    <AppLayout
      pageTitle="Golden Thread — Order to Cash"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Golden Thread' }]}
    >
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-carbon-gray-70">
          The Golden Thread end-to-end view is not enabled.
        </p>
      </div>
    </AppLayout>
  );
}

export default async function GoldenThreadPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; preset?: string }>;
}): Promise<React.ReactElement> {
  if (!flag('goldenThreadE2E')) return NotEnabled();

  const sp = await searchParams;
  const scenarioId: ThreadScenarioId =
    sp.scenario && sp.scenario in THREAD_SCENARIOS
      ? (sp.scenario as ThreadScenarioId)
      : 'underpayment';
  const presetId: ThreadPresetId =
    sp.preset && sp.preset in THREAD_PRESETS ? (sp.preset as ThreadPresetId) : 'balanced';
  const scenario = THREAD_SCENARIOS[scenarioId];
  const preset = THREAD_PRESETS[presetId];

  // Resolve the member from the session (SMART launch) or fall back to the configured demo member.
  const memberId = (await getSessionPatient().catch(() => null)) ?? DEMO_MEMBER_ID;
  const cash = await runThread(memberId, scenarioId, presetId, scenario, preset);

  // Mask the member-embedding record id before it reaches the surface/rail; forward the
  // real recovery work-item id ONLY to the decision panel (to address the endpoint).
  const maskedCash: CashResult = { ...cash, evidence: { ...cash.evidence, id: 'evidence-record' } };
  const recoveryWorkItemId = cash.recovery?.workItemId;
  const integrity = cash.integrity
    ? { intact: cash.integrity.intact, signed: cash.integrity.signed }
    : undefined;

  return (
    <AppLayout
      pageTitle="Golden Thread — Order to Cash"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Golden Thread' }]}
    >
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Golden Thread — Order to Cash</h1>
          <p className="mt-1 text-sm text-carbon-gray-70">
            One member order threaded from clearance through the cash cycle: adjudication → claim →
            835 remittance → reconciliation → a governed recovery, unified by a tamper-evident
            Evidence Record and gated by the Twin-Ladder interlock. Pick a scenario and a policy
            preset to re-run the real pipeline.
          </p>
          <p className="mt-2 rounded border border-carbon-yellow bg-carbon-yellow-light p-2 text-xs text-[#b45309]">
            Prototype on seed data. Estimates and recovery drafts are decision-support only; the
            payer&apos;s ClaimResponse/adjudication is authoritative. Any appeal submission shown
            here is a mock, not transmitted end-to-end.
          </p>
          <p className="mt-2 text-sm">
            <a
              href="/analyst-workbench"
              className="text-carbon-blue underline hover:text-carbon-blue-hover"
            >
              Open the Analyst Workbench →
            </a>{' '}
            <span className="text-xs text-carbon-gray-50">
              run the real gated analyses + governed actions against this thread.
            </span>
          </p>
        </header>

        <GoldenThreadSurface
          cash={maskedCash}
          {...(recoveryWorkItemId ? { recoveryWorkItemId } : {})}
          scenarioId={scenarioId}
          presetId={presetId}
          scenarios={scenarioList}
          presets={presetList}
          memberLabel={memberId}
          presetAutonomyTier={preset.autonomyTier}
          {...(integrity ? { integrity } : {})}
        />
      </div>
    </AppLayout>
  );
}
