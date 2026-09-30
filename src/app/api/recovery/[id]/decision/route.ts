/**
 * BFF: qualified-human decision on a durable recovery-appeal item — the
 * reconstruct-and-signal decision handler (Wave-4).
 *
 * POST /api/recovery/:id/decision → a reviewer APPROVES or REJECTS the durable
 * recovery draft the revenue-cycle agent proposed. The in-memory workflow engine is
 * per-request with NO history/replay (see FAKE_FIDELITY.md): this route does NOT
 * "resume" a suspended workflow. It RE-EXECUTES the deterministic workflow on a FRESH
 * engine to its proposeAndWait suspension, then `engine.signal`s the qualified-human
 * decision so the SAME governed body runs its post-approval SUBMISSION effect exactly
 * once. Durable state is the append-only evidence spine, not a durable engine.
 *
 * Fail-closed throughout: flag → auth → reviewer role → qualified-human decision
 * (decidedBy is ALWAYS the authenticated principal, NEVER the body) → id validation
 * (no IDOR) → verify-before-reseal (tamper-at-rest refused, never re-sealed) → tenancy
 * → exactly-once terminal short-circuit → timely-filing → reconstruct the EXACT task →
 * run + signal → re-read latest + re-apply submission/terminal appends onto the
 * FRESHLY-READ record + re-seal + save. A `system`/`autonomy:*` decider can never
 * reach the submit tool.
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
import {
  sealRecord,
  recordSubmission,
  recordRecoveryTerminal,
  type EvidenceRecord,
  type EvidenceEntry,
} from '@/lib/evidence';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { getSubmissionGatewayLoader } from '@/lib/dataSources/submissionGateway';
import type { HumanDecision } from '@/lib/agentRuntime';
import { REVENUE_CYCLE_AGENT_ID, type RecoveryTask } from '@/lib/agents/revenueCycle';
import { isNonAutomatedDecider } from '@/lib/agents/governance/decisionGate';
import { validateEvidenceId } from '@/lib/goldenThread/validate';
import { governedActionId, governedActionTerminal } from '@/lib/goldenThread/governedAction';
import { terminalOutcome, runReconstructAndSignal } from '../decisionSupport';
import { verifyLedgerAtRead } from '../recoveryGuards';

export const runtime = 'nodejs';

/** Reviewer roles permitted to decide a recovery (mirrors /api/pa/decision). */
const REVIEWER_ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin']);

/** The deterministic suffix a recovery id carries (`${evidenceId}-recovery`). */
const RECOVERY_SUFFIX = '-recovery';
const TAMPER_MSG = 'Recovery record failed integrity verification';
const SIGNER_MSG = 'Ledger signer unavailable';

type RecoveryEntry = Extract<EvidenceEntry, { type: 'recovery' }>;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const headers = { [CORRELATION_HEADER]: correlationId };
  const decisionTs = nowIso();

  // (a) flag gate — off → 404 (byte-identical to a non-existent route).
  if (!flag('goldenThreadE2E')) {
    return NextResponse.json(ooError('Recovery decision not enabled', 'not-supported'), {
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
    return NextResponse.json(ooError('Deciding a recovery requires a reviewer role', 'forbidden'), {
      status: 403,
      headers,
    });
  }

  const audit1 = (action: string, outcome: 'success' | 'failure', detail: string, ref: string) =>
    audit({
      ts: decisionTs,
      actor: principal.userId,
      action,
      resourceRef: ref,
      correlationId,
      outcome,
      detail,
    });

  // (c) parse the decision (approve/reject). decidedBy is ALWAYS the principal.
  const body = (await req.json().catch(() => null)) as { decision?: unknown } | null;
  const decision = body?.decision;
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json(ooError("decision must be 'approved' or 'rejected'", 'invalid'), {
      status: 400,
      headers,
    });
  }

  // (d) derive recordId from the [id] param (strip the deterministic -recovery suffix);
  // VALIDATE the id shape both ways so a malformed id can never reach the store (no IDOR).
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
  const ref = `Recovery/${recoveryId}`;

  // Fail-closed 409: audit (PHI-safe) + a conflict OperationOutcome. Compresses the many
  // refuse-with-409 sites (tamper / signer / cross-route / untimely / unreconstructable).
  const conflict = async (action: string, detail: string, message: string) => {
    await audit1(action, 'failure', detail, ref);
    return NextResponse.json(ooError(message, 'conflict'), { status: 409, headers });
  };
  // Compact verify-before-reseal 409 (tamper | signer), for the base + the re-read latest.
  const ledger409 = (kind: 'tamper' | 'signer', where: string) =>
    kind === 'tamper'
      ? conflict('recovery.decision.tamper-refused', `${where} integrity failed`, TAMPER_MSG)
      : conflict('recovery.decision.signer-unavailable', 'signer seam unavailable', SIGNER_MSG);

  // Deterministic replay targeting: the fresh engine mints proposalId `${wf}::p0`
  // (recomputed identically in runReconstructAndSignal — single deterministic formula).
  const decidedBy = principal.userId;
  const proposalId = `${recoveryId}::wf::p0`;
  const humanDecision: HumanDecision = {
    decision,
    decidedBy,
    proposalId,
    decidedAtMs: Date.parse(decisionTs),
  };
  // A `system`/`autonomy:*` decider (never a qualified human) is BLOCKED here — there
  // is no auto-submit path at any tier (defense-in-depth with the workflow-body assert).
  if (!isNonAutomatedDecider(humanDecision)) {
    await audit1('recovery.decision.blocked', 'failure', 'decider is not a qualified human', ref);
    return NextResponse.json(
      ooError('A recovery decision requires a qualified-human decider', 'forbidden'),
      { status: 403, headers }
    );
  }

  const store = getEvidenceStore();
  // (d cont.) load the record; 404 if absent or it carries no matching recovery entry.
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

  // (e) verify-before-reseal: a persisted record is UNTRUSTED on read. If it is sealed,
  // verify against the LIVE entries and REFUSE unless intact && signed — re-sealing a
  // tampered record would launder tamper-at-rest. Unsealed (mock/seeded) records skip.
  // Signer unavailable → fail closed (no verify/re-seal can run → the submit is BLOCKED).
  const baseGuard = await verifyLedgerAtRead(record, decisionTs);
  if (!baseGuard.ok) return ledger409(baseGuard.kind, 'ledger');

  // (f) tenancy: a reviewer may only decide within their tenant/LOB scope.
  const access = canAccessMemberTenantAware(principal, session, record.memberId);
  if (!access.allow) {
    await audit1('recovery.decision.tenant-denied', 'failure', access.reason, ref);
    return NextResponse.json(ooError('Recovery is outside the reviewer scope', 'forbidden'), {
      status: 403,
      headers,
    });
  }

  // (g) exactly-once terminal short-circuit: if a recovery-decision marker already
  // exists, this recovery is decided — return the existing outcome idempotently (200),
  // NEVER touch the engine (no second submission).
  const existingTerminal = terminalOutcome(record, recoveryId);
  if (existingTerminal) {
    await audit1(
      'recovery.decision.idempotent',
      'success',
      `already ${existingTerminal.outcome}`,
      ref
    );
    return NextResponse.json(
      { ...existingTerminal, workItemId: recoveryId },
      { status: 200, headers }
    );
  }

  // (g0) C1 cross-route bind: ONE submission-intent per recovery. The action route can also
  // submit the payer appeal (under a governed-action id — a DIFFERENT id scheme this route's
  // terminal marker does not see). If a governed `appeal::executed` marker already exists for
  // THIS recovery, the appeal is already on the ledger — refuse (409), never submit it twice.
  if (
    governedActionTerminal(record, governedActionId(recoveryId, 'appeal'))?.status === 'executed'
  ) {
    return conflict(
      'recovery.decision.cross-route-refused',
      'appeal already executed',
      'Recovery appeal was already submitted'
    );
  }

  // (h) timely-filing gate: an APPROVE past the payer appeal window is refused (409) —
  // never a silent untimely submit. A REJECT is allowed past the deadline.
  if (
    decision === 'approved' &&
    recovery.filingDeadline &&
    Date.parse(decisionTs) > Date.parse(recovery.filingDeadline)
  ) {
    return conflict(
      'recovery.decision.untimely-refused',
      'past timely-filing window',
      'Recovery is past the timely-filing window'
    );
  }

  // (i) reconstruct the RecoveryTask by READING the persisted fields (single-source) —
  // NEVER re-derived from sibling entries. Missing fields → fail-closed (unreconstructable).
  if (
    recovery.taskClaimId === undefined ||
    recovery.taskAuthId === undefined ||
    recovery.taskDelta === undefined ||
    recovery.taskEvidenceTier === undefined ||
    recovery.remittanceId === undefined
  ) {
    return conflict(
      'recovery.decision.unreconstructable',
      'task fields not persisted',
      'Recovery task cannot be reconstructed'
    );
  }
  const task: RecoveryTask = {
    claimId: recovery.taskClaimId,
    remittanceId: recovery.remittanceId,
    authId: recovery.taskAuthId,
    delta: recovery.taskDelta,
    evidenceTier: recovery.taskEvidenceTier,
    priority: recovery.priority ?? 'routine',
  };
  const tenant = recovery.tenant;

  // (j/k) reconstruct-and-signal (extracted to decisionSupport.ts): re-execute the
  // deterministic workflow to its suspension on a FRESH engine, assert the deterministic
  // proposalId, then signal the qualified-human decision so the SAME governed body runs
  // its post-approval submission effect. It captures the mock, not-transmitted receipt;
  // the submission/terminal appends are re-applied onto the FRESHLY-READ latest at save
  // (step l), not this stale base, so a concurrent unrelated append is not lost.
  // Fail-closed: any failure (never suspended, mis-targeted, the qualified-human assert,
  // or the production submission seam) leaves NO terminal entry + NO marker → the request
  // is safely retryable, nothing saved.
  let submissionRef: string | undefined;
  let submissionChannel: 'mock' | undefined;
  try {
    const signalled = await runReconstructAndSignal({
      memberId: record.memberId,
      task,
      decision,
      decidedBy,
      decisionTs,
      recoveryId,
    });
    submissionRef = signalled.submissionRef;
    submissionChannel = signalled.submissionChannel;
  } catch {
    await audit1('recovery.decision.error', 'failure', 'workflow did not complete', ref);
    return NextResponse.json(ooError('Recovery decision failed', 'exception'), {
      status: 500,
      headers,
    });
  }

  // (l) exactly-once + lost-update guard (Findings 2 & 4). RE-READ the LATEST record —
  // NEVER the stale base loaded at (d). (i) if a concurrent decision already wrote the
  // terminal, return its outcome idempotently WITHOUT saving (no clobber); (ii) else
  // re-apply the submission + terminal appends onto the FRESHLY-READ latest so a
  // concurrent UNRELATED append is preserved (id-idempotent recorders no-op on a racing
  // copy of THIS decision).
  const latest = await store.get(recordId);
  if (!latest) {
    await audit1('recovery.decision.error', 'failure', 'record vanished pre-save', ref);
    return NextResponse.json(ooError('Recovery decision failed', 'exception'), {
      status: 500,
      headers,
    });
  }
  const raced = terminalOutcome(latest, recoveryId);
  if (raced) {
    await audit1('recovery.decision.idempotent', 'success', `already ${raced.outcome}`, ref);
    return NextResponse.json({ ...raced, workItemId: recoveryId }, { status: 200, headers });
  }
  // C1 (latest): a concurrent action-route appeal that won the race is terminal — refuse
  // rather than submit a second appeal onto the freshly-read latest.
  if (
    decision === 'approved' &&
    governedActionTerminal(latest, governedActionId(recoveryId, 'appeal'))?.status === 'executed'
  ) {
    return conflict(
      'recovery.decision.cross-route-refused',
      'appeal already executed',
      'Recovery appeal was already submitted'
    );
  }
  // C3 (latest): re-verify the RE-READ record's seal before re-sealing — a tamper landing in
  // the window between the base read and this re-read must not be laundered by the re-seal.
  const latestGuard = await verifyLedgerAtRead(latest, decisionTs);
  if (!latestGuard.ok) return ledger409(latestGuard.kind, 'latest');
  let working: EvidenceRecord = latest;
  if (decision === 'approved' && submissionRef !== undefined) {
    working = recordSubmission(working, {
      recoveryId,
      ts: decisionTs,
      submissionRef,
      submittedAt: decisionTs,
      decidedBy,
      rung: recovery.rung,
      ...(submissionChannel !== undefined ? { channel: submissionChannel } : {}),
      claimId: task.claimId,
      remittanceId: task.remittanceId,
      authId: task.authId,
      actor: REVENUE_CYCLE_AGENT_ID,
      ...(tenant !== undefined ? { tenant } : {}),
    });
  }
  working = recordRecoveryTerminal(working, {
    recoveryId,
    ts: decisionTs,
    status: decision === 'approved' ? 'submitted' : 'rejected',
    decidedBy,
    decidedAt: decisionTs,
    ...(tenant !== undefined ? { tenant } : {}),
  });
  try {
    const signer = await getSigningKeyLoader().load(decisionTs);
    working = { ...working, seal: sealRecord(working, signer, decisionTs) };
  } catch {
    // No signer (production, unwired) → re-seal fails closed → refuse rather than persist
    // an unsealed mutation over a sealed record. Nothing saved durably → retryable.
    await audit1(
      'recovery.decision.signer-unavailable',
      'failure',
      're-seal signer unavailable',
      ref
    );
    return NextResponse.json(ooError('Ledger signer unavailable', 'conflict'), {
      status: 409,
      headers,
    });
  }
  // (m) save the new append-only version. The pg ledger's UNIQUE (record_id,
  // record_version) index REJECTS a simultaneous same-version writer — map that to the
  // idempotent already-done path (a concurrent decision won), never an unhandled 500.
  // Ledger exactly-once = id-idempotent recorders (no-op on the deterministic ids) +
  // terminal short-circuit + this re-read-latest guard — NOT a CAS/two-phase marker
  // (none exists; this route writes no idempotency-store marker). See FAKE_FIDELITY row 6.
  try {
    await store.save(working);
  } catch {
    const afterRace = await store.get(recordId);
    const doneNow = afterRace ? terminalOutcome(afterRace, recoveryId) : null;
    if (doneNow) {
      await audit1('recovery.decision.idempotent', 'success', `already ${doneNow.outcome}`, ref);
      return NextResponse.json({ ...doneNow, workItemId: recoveryId }, { status: 200, headers });
    }
    await audit1('recovery.decision.save-failed', 'failure', 'ledger save failed', ref);
    return NextResponse.json(ooError('Recovery decision failed to persist', 'exception'), {
      status: 500,
      headers,
    });
  }

  // (n) audit the outcome (PHI-safe) + return.
  const outcome: 'submitted' | 'rejected' = decision === 'approved' ? 'submitted' : 'rejected';
  await audit1(
    `recovery.decision.${outcome}`,
    'success',
    `decidedBy=${decidedBy}; channel=mock; not-transmitted${submissionRef ? `; ref=${submissionRef}` : ''}`,
    ref
  );
  return NextResponse.json(
    { outcome, ...(submissionRef ? { submissionRef } : {}), workItemId: recoveryId },
    { status: 200, headers }
  );
}
