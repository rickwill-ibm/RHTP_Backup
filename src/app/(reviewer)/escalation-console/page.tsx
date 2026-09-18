/**
 * Escalation Console — Phase C reviewer surface over the REAL escalation engine. Server
 * page: it PERSISTS the seed order→cash thread (same deterministic wiring as the workbench /
 * golden-thread pages), then routes the record's recovery signals through the EXISTING
 * `routeEscalation` (Wave-6/7 gate + signals + per-party lenses + routed work-queue item +
 * next hop) and renders the `EscalationConsole` over that output — computing no governance
 * of its own. The escalation-policy tier the item keys on is read from the shipped
 * `loadEscalationPolicies()` via the real `getEscalationTier`.
 *
 * DYNAMIC + behind `goldenThreadE2E` (mirrors the sibling reviewer pages).
 * PHI DISCIPLINE: `routeEscalation` masks the member-embedding fields; nothing member-bound
 * reaches the console (the evidence id is used only to persist/route, never rendered).
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
import type { EvidenceEntry } from '@/lib/evidence/evidenceRecord';
import { getRemittanceGatewayLoader, getContractRepositoryLoader } from '@/lib/dataSources';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import {
  createRuntime,
  createManualClock,
  createMemoryProposalInbox,
  loadEscalationPolicies,
  getEscalationTier,
  nextEscalationStep,
  type EscalationPriority,
} from '@/lib/agentRuntime';
import { createRecoveryWorkflow } from '@/lib/agents/revenueCycle';
import { getAgentManifest } from '@/lib/agents/manifest';
import { routeEscalation } from '@/lib/goldenThread/escalationRouter';
import { EscalationConsole } from '@/components/goldenThread/EscalationConsole';
import { EditorialShell } from '@/components/editorial/EditorialShell';
import AppLayout from '@/components/AppLayout';
import { getSessionPatient } from '@/lib/server/smartSession';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import { DEMO_SCENARIO, DEMO_THREAD_TS } from '@/lib/config/demoScenario';

export const dynamic = 'force-dynamic';

const REVENUE_CYCLE_AGENT_ID = 'revenue-cycle-agent';

function evidenceIdFor(memberId: string): string {
  return `ev-${memberId}-${DEMO_SCENARIO.orderCode}-esc-${Date.parse(DEMO_THREAD_TS)}`;
}

/** Run the REAL orchestrator on the demo order and return the CashResult (with the record). */
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

/** The recovery entry's escalation priority (the same value routeEscalation keys the tier on). */
function recoveryPriority(entries: readonly EvidenceEntry[]): EscalationPriority {
  const rec = entries.filter(
    (e): e is Extract<EvidenceEntry, { type: 'recovery' }> => e.type === 'recovery'
  );
  return rec[rec.length - 1]?.priority ?? 'routine';
}

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <AppLayout
      pageTitle="Escalation Console"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Escalation Console' }]}
    >
      {children}
    </AppLayout>
  );
}

export default async function EscalationConsolePage(): Promise<React.ReactElement> {
  if (!flag('goldenThreadE2E')) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-carbon-gray-70">The Escalation Console is not enabled.</p>
        </div>
      </Shell>
    );
  }

  const memberId = (await getSessionPatient().catch(() => null)) ?? DEMO_MEMBER_ID;
  const evidenceId = evidenceIdFor(memberId);
  const cash = await runSeedThread(memberId, evidenceId);

  const manifest = getAgentManifest(REVENUE_CYCLE_AGENT_ID);
  const policies = loadEscalationPolicies();
  const routed = await routeEscalation(cash.evidence, {
    now: DEMO_THREAD_TS,
    inbox: createMemoryProposalInbox(),
    policies,
    escalationPolicyRef: manifest.escalationPolicyRef,
    manifestTier: manifest.autonomyTier,
  });

  // The policy tier the routed item keys on (real getEscalationTier), and the hop that would
  // fire first — shown as the escalation path even while the item is within SLA.
  const tier = routed.queueItem
    ? getEscalationTier(
        policies,
        manifest.escalationPolicyRef,
        recoveryPriority(cash.evidence.entries)
      )
    : null;
  const path = tier ? (routed.escalationStep ?? nextEscalationStep(tier, 0)) : null;

  return (
    <AppLayout
      pageTitle="Escalation Console"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Escalation Console' }]}
      fullBleed
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorialShell
          eyebrow="Governed autonomy · Escalation"
          title="Escalation Console"
          subtitle={
            <>
              The reviewer surface over the real escalation engine: the process gate over the
              authority ladder, the PHI-safe signal set, the per-party notification lenses, the
              routed work-queue item with its SLA, and the escalation path that fires hop-by-hop on
              breach. It renders what <span className="mono">routeEscalation</span> produces — it
              computes nothing.
            </>
          }
          badge="Prototype on seed data · in-memory queue substrate · a durable backend is a production item"
        >
          <EscalationConsole routed={routed} tier={tier} path={path} />
        </EditorialShell>
      </div>
    </AppLayout>
  );
}
