/**
 * Golden Thread — End-to-End (Phase-G). The extended, interactive process-flow experience:
 * CRD/DTR/PAS stretched from the EMR (SMART on FHIR, Epic/Cerner) through payer operations
 * and out to continuous program-integrity surveillance — one swimlane over the shared,
 * append-only evidence ledger, with the operations model (detection → governed ticket →
 * named operator → RCA + recommendation + REAL Twin-Ladder verdict → outbound → forensic
 * log) and party agent-workbenches layered on the same spine.
 *
 * This server component PERSISTS the seed order→cash thread (same deterministic wiring as the
 * analyst-workbench page) so the live Agent-Workbench tab runs against the actual Evidence
 * Record + recovery draft, then hands the client the barrel-free flow spine (STAGES / TICKETS /
 * FORENSIC) as plain props. The swimlane + operations views are driven entirely by that spine;
 * the workbench tab is live-wired to the real endpoints.
 *
 * DYNAMIC: `force-dynamic` so `flag('goldenThreadE2E')` is evaluated per-request and the
 * orchestrator persists to the runtime store the API routes read. Behind `goldenThreadE2E`.
 * PHI DISCIPLINE: the evidence id embeds a member ref — passed only to build request URLs,
 * never rendered. Provider names in the seed are fictional and labelled.
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
import { STAGES, TICKETS, FORENSIC } from '@/lib/goldenThread/e2eFlow';
import { type WorkbenchAnalysis } from '@/components/goldenThread/AnalystWorkbench';
import { FlowBoards } from '@/components/goldenThread/flow/FlowBoards';
import { EditorialShell } from '@/components/editorial/EditorialShell';
import AppLayout from '@/components/AppLayout';
import { getSessionPatient } from '@/lib/server/smartSession';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import { DEMO_SCENARIO, DEMO_THREAD_TS } from '@/lib/config/demoScenario';

export const dynamic = 'force-dynamic';

/** The stable evidence id the client uses to address the endpoints (never rendered). */
function evidenceIdFor(memberId: string): string {
  return `ev-${memberId}-${DEMO_SCENARIO.orderCode}-gtflow-${Date.parse(DEMO_THREAD_TS)}`;
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
    store: getEvidenceStore(),
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
      pageTitle="Golden Thread — End-to-End"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Golden Thread — End-to-End' }]}
    >
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-carbon-gray-70">
          The Golden Thread end-to-end flow is not enabled.
        </p>
      </div>
    </AppLayout>
  );
}

export default async function GoldenThreadFlowPage(): Promise<React.ReactElement> {
  if (!flag('goldenThreadE2E')) return NotEnabled();

  const memberId = (await getSessionPatient().catch(() => null)) ?? DEMO_MEMBER_ID;
  const evidenceId = evidenceIdFor(memberId);
  await persistSeedThread(memberId, evidenceId);

  const analyses: WorkbenchAnalysis[] = ANALYSES.map((a) => ({
    id: a.id,
    label: a.label,
    party: a.party,
  }));

  return (
    <AppLayout
      pageTitle="Golden Thread — End-to-End"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Golden Thread — End-to-End' }]}
      fullBleed
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorialShell
          eyebrow="Governed autonomy · Golden Thread · Phase 1"
          title="Authorization Spine — The Governed Thread, End to End"
          subtitle={
            <>
              <strong>Phase 1</strong> showcases one thread of the Golden Thread program, end to end
              — the authorization-to-recovery spine: eligibility → CRD coverage-requirements →
              gold-card waiver → DTR → PAS → payer utilization management → claim → remittance →
              reconciliation → recovery, with continuous program-integrity surveillance. It rides
              the payer&rsquo;s real connectivity estate, not a single app — SMART on FHIR /
              CDS-Hooks at the EMR, and X12 <span className="mono">270/271</span>,{' '}
              <span className="mono">278</span>, <span className="mono">837</span> and{' '}
              <span className="mono">835</span> across the clearinghouse, acknowledged at the
              interchange (<span className="mono">TA1</span>/<span className="mono">999</span>) with{' '}
              <span className="mono">277CA</span> on the 837 claim — over one swimlane on the
              shared, append-only evidence ledger. Detections become governed{' '}
              <span className="mono">tickets</span> queued to named operators with RCA, a
              recommendation, and the REAL Twin-Ladder verdict; every step writes a forensic,
              NIST-aligned record.{' '}
              <span style={{ color: '#9fc2e0' }}>
                This is <strong>Phase 1</strong> — the prior-authorization spine.{' '}
                <strong>Phase 2</strong> and <strong>Phase 3</strong> add support for the additional
                transaction sets across the estate. <strong>Phase 2</strong> brings the full
                claims-and-payment set — <span className="mono">837</span> P/I/D adjudication,{' '}
                <span className="mono">276/277</span> claim status,{' '}
                <span className="mono">275</span> attachments and <span className="mono">835</span>{' '}
                remittance / ERA posting. <strong>Phase 3</strong> brings the member-and-money and
                pharmacy sets — enrollment (<span className="mono">834</span>), premium / capitation
                (<span className="mono">820</span>), NCPDP pharmacy and cross-payer (payer-to-payer)
                exchange — so the thread starts at member enrollment, not the encounter.
              </span>
            </>
          }
          wideSubtitle
          badge="Prototype on seed data · mock channel, not transmitted"
        >
          <FlowBoards
            stages={STAGES}
            tickets={TICKETS}
            forensic={FORENSIC}
            recordId={evidenceId}
            analyses={analyses}
          />
        </EditorialShell>
      </div>
    </AppLayout>
  );
}
