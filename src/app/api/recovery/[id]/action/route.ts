/**
 * BFF: a qualified-human-governed analyst ACTION on a durable recovery item (Wave-9).
 *
 * POST /api/recovery/:id/action → a reviewer TRIGGERS an action a Wave-8 finding
 * proposed — an X12 / communication request or a ticket update — and it runs through
 * the SAME governance the recovery DECISION uses. This route MIRRORS the decision route
 * (auth → reviewer role → qualified-human gate → id validation → verify-before-reseal →
 * tenancy → exactly-once terminal short-circuit → run → re-read latest + re-apply the
 * append-only lifecycle + re-seal + save). It reuses the SAME evidence spine, signing
 * seam, tenancy guard, and the fail-closed submissionGateway seam — reimplementing none.
 *
 * The action runner (`runGovernedAction`) is pure/deterministic; this route owns the IO:
 * store load/save, signer resolution + re-seal, the fail-closed X12/appeal gateway seam,
 * and audit. The DURABLE ticket lifecycle is the sequence of append-only `governed-action`
 * entries (proposed → approved → executed | rejected) — not a new queue backend. Exactly-
 * once: id-idempotent lifecycle recorder + a terminal short-circuit + a re-read-latest
 * guard before save (identical to the decision route). Behind `goldenThreadE2E`; flag-off
 * → 404 (byte-identical to a non-existent route). Access is NEVER widened.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { canAccessMemberTenantAware } from '@/lib/security/tenant';
import { audit } from '@/lib/server/audit';
import { nowIso } from '@/lib/clock';
import { flag } from '@/lib/flags/flags';
import { getEvidenceStore } from '@/lib/evidence/store';
import { sealRecord, type EvidenceEntry, type GovernedActionType } from '@/lib/evidence';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { getSubmissionGatewayLoader } from '@/lib/dataSources/submissionGateway';
import type { HumanDecision } from '@/lib/agentRuntime';
import { createMemoryProposalInbox, loadEscalationPolicies } from '@/lib/agentRuntime';
import { getAgentManifest } from '@/lib/agents/manifest';
import { REVENUE_CYCLE_AGENT_ID } from '@/lib/agents/revenueCycle';
import { isQualifiedHumanDecision } from '@/lib/agents/governance/decisionGate';
import { validateEvidenceId } from '@/lib/goldenThread/validate';
import {
  runGovernedAction,
  applyGovernedAction,
  governedActionId,
  governedActionTerminal,
  isSubmissionAction,
  GovernedActionError,
} from '@/lib/goldenThread/governedAction';
import { terminalOutcome } from '../decisionSupport';
import { verifyLedgerAtRead } from '../recoveryGuards';

export const runtime = 'nodejs';

/** Reviewer roles permitted to trigger a governed action (mirrors the decision route). */
const REVIEWER_ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin']);
/** The deterministic suffix a recovery id carries (`${evidenceId}-recovery`). */
const RECOVERY_SUFFIX = '-recovery';
const TAMPER_MSG = 'Recovery record failed integrity verification';
const SIGNER_MSG = 'Ledger signer unavailable';
/** The valid governed action types (untrusted-body validation). */
const ACTION_TYPES = new Set<GovernedActionType>([
  'x12-276',
  'x12-278',
  'x12-275',
  'x12-837-corrected',
  'appeal',
  'provider-notice',
  'integrity-freeze',
  'ticket-update',
]);

type RecoveryEntry = Extract<EvidenceEntry, { type: 'recovery' }>;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const headers = { [CORRELATION_HEADER]: correlationId };
  const ts = nowIso();

  // (a) flag gate — off → 404 (byte-identical to a non-existent route).
  if (!flag('goldenThreadE2E')) {
    return NextResponse.json(ooError('Governed action not enabled', 'not-supported'), {
      status: 404,
      headers,
    });
  }

  // (b) auth → 401; principal/session; reviewer-role gate → 403.
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401, headers });
  }
  const session = await getSessionAuthContext().catch(() => null);
  const principal = getPrincipal(session);
  if (!REVIEWER_ROLES.has(principal.role)) {
    return NextResponse.json(
      ooError('Triggering an action requires a reviewer role', 'forbidden'),
      {
        status: 403,
        headers,
      }
    );
  }

  const audit1 = (action: string, outcome: 'success' | 'failure', detail: string, ref: string) =>
    audit({
      ts,
      actor: principal.userId,
      action,
      resourceRef: ref,
      correlationId,
      outcome,
      detail,
    });

  // (c) parse the action type + decision. decidedBy is ALWAYS the principal, never the body.
  const body = (await req.json().catch(() => null)) as {
    actionType?: unknown;
    decision?: unknown;
  } | null;
  const actionType = body?.actionType;
  if (typeof actionType !== 'string' || !ACTION_TYPES.has(actionType as GovernedActionType)) {
    return NextResponse.json(ooError('actionType is not a valid governed action', 'invalid'), {
      status: 400,
      headers,
    });
  }
  const decisionVal = body?.decision;
  if (decisionVal !== 'approved' && decisionVal !== 'rejected') {
    return NextResponse.json(ooError("decision must be 'approved' or 'rejected'", 'invalid'), {
      status: 400,
      headers,
    });
  }

  // (d) derive recordId from [id] (strip the deterministic -recovery suffix); validate
  // both id shapes so a malformed id can never reach the store (no IDOR).
  const { id: recoveryId } = await params;
  if (
    !validateEvidenceId(recoveryId).ok ||
    !recoveryId.endsWith(RECOVERY_SUFFIX) ||
    recoveryId.length <= RECOVERY_SUFFIX.length
  ) {
    return NextResponse.json(ooError('invalid recovery id', 'invalid'), { status: 400, headers });
  }
  const recordId = recoveryId.slice(0, -RECOVERY_SUFFIX.length);
  if (!validateEvidenceId(recordId).ok) {
    return NextResponse.json(ooError('invalid recovery id', 'invalid'), { status: 400, headers });
  }
  const ref = `Recovery/${recoveryId}/action/${actionType}`;

  // Fail-closed 409: audit (PHI-safe) + a conflict OperationOutcome (compresses the refuse
  // sites: tamper / signer / cross-route). `ledger409` maps a verify-before-reseal verdict.
  const conflict = async (action: string, detail: string, message: string) => {
    await audit1(action, 'failure', detail, ref);
    return NextResponse.json(ooError(message, 'conflict'), { status: 409, headers });
  };
  const ledger409 = (kind: 'tamper' | 'signer', where: string) =>
    kind === 'tamper'
      ? conflict('recovery.action.tamper-refused', `${where} integrity failed`, TAMPER_MSG)
      : conflict('recovery.action.signer-unavailable', 'signer seam unavailable', SIGNER_MSG);

  const store = getEvidenceStore();
  const record = await store.get(recordId);
  const recovery = record
    ? (record.entries.find((e) => e.type === 'recovery' && e.id === recoveryId) as
        RecoveryEntry | undefined)
    : undefined;
  if (!record || !recovery) {
    return NextResponse.json(ooError('Recovery record not found', 'not-found'), {
      status: 404,
      headers,
    });
  }

  // (e) verify-before-reseal: a persisted record is UNTRUSTED on read. A sealed record is
  // verified against LIVE entries and REFUSED unless intact && signed — never re-sealing a
  // tampered record. Unsealed (mock/seeded) records skip. Signer unavailable → fail closed.
  const baseGuard = await verifyLedgerAtRead(record, ts);
  if (!baseGuard.ok) return ledger409(baseGuard.kind, 'ledger');

  // (f) tenancy: a reviewer may only act within their tenant/LOB scope.
  const access = canAccessMemberTenantAware(principal, session, record.memberId);
  if (!access.allow) {
    await audit1('recovery.action.tenant-denied', 'failure', access.reason, ref);
    return NextResponse.json(ooError('Recovery is outside the reviewer scope', 'forbidden'), {
      status: 403,
      headers,
    });
  }

  // (g) qualified-human gate: decidedBy is ALWAYS the authenticated principal. A
  // `system`/`autonomy:*` decider is BLOCKED — no auto-execute of a payer-facing X12 at
  // any tier without a qualified human (mirror FIX-1 + the decision route).
  const actionId = governedActionId(recoveryId, actionType as GovernedActionType);
  const decidedBy = principal.userId;
  const humanDecision: HumanDecision = {
    decision: decisionVal,
    decidedBy,
    proposalId: `${actionId}::decision`,
    decidedAtMs: Date.parse(ts),
  };
  if (!isQualifiedHumanDecision(humanDecision)) {
    await audit1('recovery.action.blocked', 'failure', 'decider is not a qualified human', ref);
    return NextResponse.json(
      ooError('A governed action requires a qualified-human decider', 'forbidden'),
      { status: 403, headers }
    );
  }

  // (h0) C1 cross-route bind: ONE submission-intent per recovery. The decision route submits
  // the appeal under `${recoveryId}-submission`; this route would otherwise submit the SAME
  // payer appeal under a governed-action id — a DIFFERENT id scheme, so neither route's
  // terminal short-circuit sees the other and one underpayment could be appealed TWICE.
  // Refuse a submission-class `appeal` here when the decision route already submitted.
  if (
    (actionType as GovernedActionType) === 'appeal' &&
    terminalOutcome(record, recoveryId)?.outcome === 'submitted'
  ) {
    return conflict(
      'recovery.action.cross-route-refused',
      'appeal already submitted',
      'Recovery appeal was already submitted'
    );
  }

  // (h) exactly-once terminal short-circuit: an executed/rejected lifecycle for THIS action
  // is terminal — return its outcome idempotently (200), never touching the store again.
  const existing = governedActionTerminal(record, actionId);
  if (existing) {
    await audit1('recovery.action.idempotent', 'success', `already ${existing.status}`, ref);
    return NextResponse.json(
      {
        outcome: existing.status,
        actionType,
        ...(existing.ref ? { ref: existing.ref } : {}),
        workItemId: recoveryId,
      },
      { status: 200, headers }
    );
  }

  // (i) resolve the MOCK gateway for a submission-class action (fail-closed seam: production
  // throws BEFORE any transmission). Non-submission actions need no transport.
  const isSubmission = isSubmissionAction(actionType as GovernedActionType);
  let gateway = null as Awaited<
    ReturnType<ReturnType<typeof getSubmissionGatewayLoader>['load']>
  > | null;
  if (isSubmission) {
    try {
      gateway = await getSubmissionGatewayLoader().load(ts);
    } catch {
      await audit1(
        'recovery.action.gateway-unavailable',
        'failure',
        'submission seam unavailable',
        ref
      );
      return NextResponse.json(ooError('Submission gateway unavailable', 'conflict'), {
        status: 409,
        headers,
      });
    }
  }

  // (j) run the governed action (pure aside from the injected mock gateway + fresh inbox).
  const manifest = getAgentManifest(REVENUE_CYCLE_AGENT_ID);
  let outcome;
  try {
    outcome = await runGovernedAction(
      record,
      // C2: bind refs / evidence tier / priority / action id to the RESOLVED recovery the
      // URL names (not `latestOfType`), so on a multi-claim record recovery B is not dropped.
      { actionType: actionType as GovernedActionType, recovery, recoveryId },
      {
        now: ts,
        manifestTier: manifest.autonomyTier,
        decision: humanDecision,
        gateway,
        inbox: createMemoryProposalInbox(),
        policies: loadEscalationPolicies(),
        escalationPolicyRef: manifest.escalationPolicyRef,
        agentId: REVENUE_CYCLE_AGENT_ID,
      }
    );
  } catch (e) {
    const status = e instanceof GovernedActionError ? 409 : 500;
    await audit1('recovery.action.error', 'failure', 'governed action did not complete', ref);
    return NextResponse.json(
      ooError('Governed action failed', status === 409 ? 'conflict' : 'exception'),
      {
        status,
        headers,
      }
    );
  }

  // (k) re-read the LATEST record (lost-update guard) — never the stale base. If a
  // concurrent trigger already wrote the terminal, return idempotently WITHOUT saving; else
  // re-apply the lifecycle appends onto the FRESHLY-READ latest (id-idempotent recorder).
  const latest = await store.get(recordId);
  if (!latest) {
    await audit1('recovery.action.error', 'failure', 'record vanished pre-save', ref);
    return NextResponse.json(ooError('Governed action failed', 'exception'), {
      status: 500,
      headers,
    });
  }
  const raced = governedActionTerminal(latest, actionId);
  if (raced) {
    await audit1('recovery.action.idempotent', 'success', `already ${raced.status}`, ref);
    return NextResponse.json(
      {
        outcome: raced.status,
        actionType,
        ...(raced.ref ? { ref: raced.ref } : {}),
        workItemId: recoveryId,
      },
      { status: 200, headers }
    );
  }
  // (k0) C3 verify-before-reseal on the RE-READ latest: the base check (step e) verified the
  // record loaded at (d); a tamper landing in the window between that read and this re-read
  // would otherwise be laundered (re-signed valid). Re-verify `latest.seal` (SAME helper /
  // fail-closed posture) and refuse 409 — never re-seal a record we did not verify.
  const latestGuard = await verifyLedgerAtRead(latest, ts);
  if (!latestGuard.ok) return ledger409(latestGuard.kind, 'latest');
  let working = applyGovernedAction(latest, outcome, ts, {
    actor: REVENUE_CYCLE_AGENT_ID,
    ...(recovery.tenant !== undefined ? { tenant: recovery.tenant } : {}),
  });
  try {
    const signer = await getSigningKeyLoader().load(ts);
    working = { ...working, seal: sealRecord(working, signer, ts) };
  } catch {
    await audit1(
      'recovery.action.signer-unavailable',
      'failure',
      're-seal signer unavailable',
      ref
    );
    return NextResponse.json(ooError('Ledger signer unavailable', 'conflict'), {
      status: 409,
      headers,
    });
  }
  try {
    await store.save(working);
  } catch {
    const afterRace = await store.get(recordId);
    const doneNow = afterRace ? governedActionTerminal(afterRace, actionId) : null;
    if (doneNow) {
      await audit1('recovery.action.idempotent', 'success', `already ${doneNow.status}`, ref);
      return NextResponse.json(
        {
          outcome: doneNow.status,
          actionType,
          ...(doneNow.ref ? { ref: doneNow.ref } : {}),
          workItemId: recoveryId,
        },
        { status: 200, headers }
      );
    }
    await audit1('recovery.action.save-failed', 'failure', 'ledger save failed', ref);
    return NextResponse.json(ooError('Governed action failed to persist', 'exception'), {
      status: 500,
      headers,
    });
  }

  // (l) audit the outcome (PHI-safe) + return.
  await audit1(
    `recovery.action.${outcome.status}`,
    'success',
    `actionType=${actionType}; submission=${isSubmission}; channel=mock; not-transmitted; rung=${outcome.rung}; decidedBy=${decidedBy}`,
    ref
  );
  return NextResponse.json(
    {
      outcome: outcome.status,
      actionType,
      rung: outcome.rung,
      isSubmission,
      ...(outcome.ref ? { ref: outcome.ref } : {}),
      workItemId: recoveryId,
    },
    { status: 200, headers }
  );
}
