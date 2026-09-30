// INVARIANT: BFF-only — this route is the sole browser entry for the agentRuntime seam
// SEAM: agentRuntime — resolver is lib/agents/demo/index.ts → getAgentDemoActions()
/**
 * BFF: the agent demo run and the disclosure decisions it produced (WPCO / E14).
 *
 * POST /api/ops/agents/actions → the agent actions for the resolved `agentRuntime`
 * data mode, plus the run's disclosure record (decisions + refusals). Ops/auditor
 * authz, audited on every outcome.
 *
 * WHY POST, NOT GET. In production mode this EXECUTES a real agent run: the
 * dispatcher routes the seeded SDE batch, the workflow engine is signalled, HITL
 * proposals are approved and a disclosure ledger is written. That is not a safe,
 * cacheable, prefetchable read, so it does not sit behind GET. Mock mode is a
 * pure read, but the method is chosen by the strongest behaviour the route has.
 *
 * HONEST LABELLING. `dataMode` is the mode the seam itself reports and `emergent`
 * says whether the actions came out of the real runtime or are the authored demo
 * list. Mock mode is never presented as production.
 *
 * PHI POSTURE — ONE RULE, APPLIED IN EVERY DIRECTION. This ops aggregate applies
 * NO member scoping (there is no member parameter and no `canAccessMember*` call),
 * so it returns no member-identifying FIELD at all: the ledger row's `subjectId`,
 * the refusal's `memberId` AND the permitted action's `memberId` are all dropped.
 * Only codes, counts, reason codes and pseudonymous references survive.
 *
 * Dropping the subject from denials while emitting it on every permitted action —
 * which is what this route did while claiming otherwise — is the worse of the two
 * options, because the permitted set is the larger one. The alternative posture
 * (keep `memberId`, scope the route to one member through
 * `canAccessMemberTenantAware`, as `/api/ops/disclosures` does) was rejected: this
 * surface reports on a WHOLE agent run across every member in the seeded batch, so
 * a single-member scope would not describe what it returns.
 *
 * What a `refs` value may still contain: a pseudonymous scoped id (a touchpoint
 * key, `ServiceRequest/ref-12`), the same posture the ledger's `requestId` has.
 * That is a reference, not a member value — but it is why `refs` is asserted
 * against a no-whitespace reference pattern in the route test rather than trusted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal, type Principal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { log } from '@/lib/server/log';
import * as clock from '@/lib/clock';
import { agentRuntimeMode } from '@/lib/agentRuntime';
import {
  getAgentDemoActions,
  runRealAgentDemo,
  demoDisclosures,
  type AgentDemoAction,
  type DemoDisclosureRecord,
} from '@/lib/agents/demo';

export const runtime = 'nodejs';

type LedgerDecision = DemoDisclosureRecord['decisions'][number];
type LedgerRefusal = DemoDisclosureRecord['refusals'][number];

/** A disclosure decision with the subject reference removed. */
interface DecisionRow {
  requestId: string;
  dataClass: LedgerDecision['dataClass'];
  purposeOfUse: LedgerDecision['purposeOfUse'];
  requestingAgentId: string;
  recipientOrgId: string;
  outcome: LedgerDecision['outcome'];
  legalBasis: string;
  obligations: readonly LedgerDecision['obligations'][number][];
  decidedAtMs: number;
  reasonCode?: NonNullable<LedgerDecision['reason']>;
  basisRef?: string;
}

/** A refused dispatch with the member reference removed. */
interface RefusalRow {
  signalId: string;
  agentId: string;
  reason: LedgerRefusal['reason'];
  decisionOutcome?: LedgerDecision['outcome'];
  decisionReasonCode?: NonNullable<LedgerDecision['reason']>;
}

interface DisclosureReport {
  available: boolean;
  decisionCount: number;
  permitCount: number;
  denyCount: number;
  decisions: DecisionRow[];
  refusalCount: number;
  refusals: RefusalRow[];
  unavailableReason?: 'authored-actions-carry-no-disclosure-ledger';
}

/**
 * An agent action with the subject reference removed — the same drop applied to
 * the ledger's `subjectId` and the refusal's `memberId`. `Omit` is deliberate: add
 * a member-bearing field to `AgentDemoAction` upstream and this type keeps
 * excluding it, so the posture cannot rot by addition.
 */
type ActionRow = Omit<AgentDemoAction, 'memberId'>;

interface ActionsResponse {
  seam: 'agentRuntime';
  dataMode: string;
  emergent: boolean;
  actionCount: number;
  actions: ActionRow[];
  disclosures: DisclosureReport;
}

interface AgentRunView {
  mode: string;
  emergent: boolean;
  actions: AgentDemoAction[];
  record: DemoDisclosureRecord | null;
}

const NO_LEDGER: DisclosureReport = {
  available: false,
  unavailableReason: 'authored-actions-carry-no-disclosure-ledger',
  decisionCount: 0,
  permitCount: 0,
  denyCount: 0,
  decisions: [],
  refusalCount: 0,
  refusals: [],
};

/**
 * One request, ONE run.
 *
 * Production takes `runRealAgentDemo()` because it is the only call that hands
 * back the actions and the ledger from the SAME run; asking the seam accessor for
 * the actions and then re-running for the ledger would return two runs' data in
 * one payload. Mock/seeded goes through `getAgentDemoActions()` — the resolver the
 * disposition manifest names — which reports its own mode.
 *
 * The mode branch is duplicated from the seam only because the seam's public
 * accessor does not return the disclosure record; see the route's test notes.
 */
async function loadRun(): Promise<AgentRunView> {
  if (agentRuntimeMode() === 'production') {
    const run = await runRealAgentDemo();
    return {
      mode: 'production',
      emergent: true,
      actions: run.actions,
      record: demoDisclosures(run),
    };
  }
  const seam = await getAgentDemoActions();
  return { mode: seam.mode, emergent: false, actions: seam.actions, record: null };
}

function projectDecision(d: LedgerDecision): DecisionRow {
  return {
    requestId: d.requestId,
    dataClass: d.dataClass,
    purposeOfUse: d.purposeOfUse,
    requestingAgentId: d.requestingAgentId,
    recipientOrgId: d.recipientOrgId,
    outcome: d.outcome,
    legalBasis: d.legalBasis,
    obligations: d.obligations.slice(),
    decidedAtMs: d.decidedAtMs,
    ...(d.reason === undefined ? {} : { reasonCode: d.reason }),
    ...(d.basisId === undefined ? {} : { basisRef: d.basisId }),
  };
}

function projectRefusal(r: LedgerRefusal): RefusalRow {
  const decision = r.decision;
  if (decision === undefined) {
    return { signalId: r.signalId, agentId: r.agentId, reason: r.reason };
  }
  return {
    signalId: r.signalId,
    agentId: r.agentId,
    reason: r.reason,
    decisionOutcome: decision.outcome,
    ...(decision.reason === undefined ? {} : { decisionReasonCode: decision.reason }),
  };
}

/** Drop the subject from an action row. Explicit destructure, not a delete. */
function projectAction(action: AgentDemoAction): ActionRow {
  const { memberId: _dropped, ...row } = action;
  return row;
}

function projectDisclosures(record: DemoDisclosureRecord | null): DisclosureReport {
  if (record === null) return NO_LEDGER;
  const decisions = record.decisions.map(projectDecision);
  return {
    available: true,
    decisionCount: decisions.length,
    permitCount: decisions.filter((d) => d.outcome === 'permit').length,
    denyCount: decisions.filter((d) => d.outcome === 'deny').length,
    decisions,
    refusalCount: record.refusals.length,
    refusals: record.refusals.map(projectRefusal),
  };
}

/**
 * The gate's result: the response to send on refusal, or the acting principal — so
 * a handler cannot continue past a deny by forgetting a `return` (same shape as the
 * reasoning and authority routes).
 */
type Gate = { deny: NextResponse } | { deny?: undefined; principal: Principal };

/** One audit shape for every outcome of this run, so nothing is left unaudited. */
function auditRun(
  actor: string,
  correlationId: string,
  outcome: 'success' | 'failure',
  detail: string
): Promise<void> {
  return audit({
    ts: clock.nowIso(),
    actor,
    action: 'agents.demo.run',
    correlationId,
    outcome,
    detail,
  });
}

/** Auth + ops/auditor authz. Returns the refusal to send, or the principal. */
async function opsGate(headers: Record<string, string>): Promise<Gate> {
  // Fail-CLOSED catch (the house idiom, cf. ops/fairness): a session read that
  // throws is treated as unauthenticated, never as authenticated.
  if (!(await isAuthenticated().catch(() => false))) {
    return {
      deny: NextResponse.json(ooError('Not authenticated', 'login'), { status: 401, headers }),
    };
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal) && principal.role !== 'auditor') {
    return {
      deny: NextResponse.json(
        ooError('Agent action review requires an ops/auditor role', 'forbidden'),
        { status: 403, headers }
      ),
    };
  }
  return { principal };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const headers = { [CORRELATION_HEADER]: correlationId };
  const gate = await opsGate(headers);
  if (gate.deny) return gate.deny;
  const { principal } = gate;
  try {
    const view = await loadRun();
    const disclosures = projectDisclosures(view.record);
    const body: ActionsResponse = {
      seam: 'agentRuntime',
      dataMode: view.mode,
      emergent: view.emergent,
      actionCount: view.actions.length,
      actions: view.actions.map(projectAction),
      disclosures,
    };
    await auditRun(
      principal.userId,
      correlationId,
      'success',
      `mode=${view.mode}; emergent=${view.emergent}; actions=${body.actionCount}; ` +
        `decisions=${disclosures.decisionCount}; denies=${disclosures.denyCount}; ` +
        `refusals=${disclosures.refusalCount}`
    );
    return NextResponse.json(body, { status: 200, headers });
  } catch (err) {
    const errorName = err instanceof Error ? err.name : 'unknown';
    log.error('agents.demo.run.failed', { correlationId, errorName });
    await auditRun(principal.userId, correlationId, 'failure', `error=${errorName}`);
    return NextResponse.json(ooError('Agent demo run failed', 'exception'), {
      status: 500,
      headers,
    });
  }
}
