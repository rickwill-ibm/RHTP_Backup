/**
 * Financial-stage evidence recorders (increment GT order→cash).
 *
 * These append the order→cash financial entries (PAS decision, claim submission,
 * 835 remittance, reconciliation verdict, recovery draft) to the Evidence Record.
 * Extracted from `evidenceRecord.ts` to keep that audit-spine module under the
 * file-size cap (AI-CODING-CONVENTIONS §2/§3) — same discipline, same public
 * surface: these are re-exported from `@/lib/evidence` unchanged.
 *
 * Pure + deterministic — callers supply timestamps and ids; refs/codes/amounts
 * only, never raw PHI payloads. The `EvidenceRecord`/`EvidenceEntry` types and the
 * `appendEntry` primitive stay owned by `evidenceRecord.ts`; this module imports
 * them (one-way dependency, no cycle).
 */
import { appendEntry } from './evidenceRecord';
import type { EvidenceRecord, GovernedActionType } from './evidenceRecord';
import type { EvidenceTier } from './tierConfig';

/**
 * Record a payer's PAS decision on the spine. `authId` is caller-supplied
 * (deterministic, bound at the decision route) and threaded onto the entry — it
 * is NEVER minted here. `'exempt'` is carried as an evidence value only and is
 * distinct from `'approved'`.
 */
export function recordPasDecision(
  record: EvidenceRecord,
  args: {
    id: string;
    ts: string;
    authId: string;
    decision: 'approved' | 'denied' | 'more-info' | 'exempt';
    reasons?: string[];
    actor?: string;
    tenant?: string;
  }
): EvidenceRecord {
  return appendEntry(record, {
    id: args.id,
    ts: args.ts,
    stage: 'prior-auth',
    actor: args.actor ?? 'system',
    authId: args.authId,
    type: 'pas-decision',
    decision: args.decision,
    ...(args.reasons !== undefined ? { reasons: args.reasons } : {}),
    ...(args.tenant !== undefined ? { tenant: args.tenant } : {}),
  });
}

/** Record a claim submission (stage 'claim'). Refs/amounts only, no PHI. */
export function recordClaimSubmission(
  record: EvidenceRecord,
  args: {
    id: string;
    ts: string;
    orderId?: string;
    authId?: string;
    claimId: string;
    claimRef: string;
    total: number;
    actor?: string;
    tenant?: string;
  }
): EvidenceRecord {
  return appendEntry(record, {
    id: args.id,
    ts: args.ts,
    stage: 'claim',
    actor: args.actor ?? 'system',
    orderId: args.orderId,
    authId: args.authId,
    claimId: args.claimId,
    type: 'claim-submission',
    claimRef: args.claimRef,
    total: args.total,
    ...(args.tenant !== undefined ? { tenant: args.tenant } : {}),
  });
}

/**
 * Record an 835 remittance as received (stage 'remittance', tier D0). Carries
 * explicit per-group adjustment amounts plus code lists — refs/codes/amounts
 * only, never member data.
 */
export function recordRemittance(
  record: EvidenceRecord,
  args: {
    id: string;
    ts: string;
    claimId?: string;
    remittanceId: string;
    paidAmount: number;
    adjustments: Array<{ group: 'CO' | 'PR' | 'OA' | 'PI'; amount: number }>;
    carcCodes: string[];
    rarcCodes: string[];
    carcGroups: string[];
    actor?: string;
    tenant?: string;
  }
): EvidenceRecord {
  return appendEntry(record, {
    id: args.id,
    ts: args.ts,
    stage: 'remittance',
    actor: args.actor ?? 'system',
    claimId: args.claimId,
    remittanceId: args.remittanceId,
    type: 'remittance',
    paidAmount: args.paidAmount,
    adjustments: args.adjustments.map((a) => ({ group: a.group, amount: a.amount })),
    carcCodes: [...args.carcCodes],
    rarcCodes: [...args.rarcCodes],
    carcGroups: [...args.carcGroups],
    ...(args.tenant !== undefined ? { tenant: args.tenant } : {}),
  });
}

/**
 * Record a reconciliation verdict (stage 'reconciliation', tier D2). The verdict,
 * delta and applied tolerance are computed upstream and RECORDED here for audit.
 */
export function recordReconciliation(
  record: EvidenceRecord,
  args: {
    id: string;
    ts: string;
    verdict: 'matched' | 'underpaid' | 'overpaid' | 'indeterminate' | 'not-recoverable';
    contractedAllowed: number;
    paidAmount: number;
    delta: number;
    toleranceApplied: number;
    authId?: string;
    claimId?: string;
    remittanceId?: string;
    actor?: string;
    tenant?: string;
  }
): EvidenceRecord {
  return appendEntry(record, {
    id: args.id,
    ts: args.ts,
    stage: 'reconciliation',
    actor: args.actor ?? 'system',
    authId: args.authId,
    claimId: args.claimId,
    remittanceId: args.remittanceId,
    type: 'reconciliation',
    verdict: args.verdict,
    contractedAllowed: args.contractedAllowed,
    paidAmount: args.paidAmount,
    delta: args.delta,
    toleranceApplied: args.toleranceApplied,
    ...(args.tenant !== undefined ? { tenant: args.tenant } : {}),
  });
}

/**
 * Record a recovery DRAFT (stage 'recovery', tier D3). Status is always 'draft';
 * a payer-facing/money-moving action is human-gated elsewhere and never executed
 * by recording this entry. `rung` is recorded for audit only.
 */
export function recordRecovery(
  record: EvidenceRecord,
  args: {
    id: string;
    ts: string;
    action: 'draft-appeal' | 'draft-resubmission';
    rung: string;
    remittanceId?: string;
    actor?: string;
    tenant?: string;
    /**
     * Wave-3 HIGH-2 (additive, optional): the timely-filing / appeal-window
     * deadline (ISO date) for this recovery. Persisted for the durable work item
     * + the overdue sweep. Omitted → byte-identical to pre-Wave-3.
     */
    filingDeadline?: string;
    /**
     * MED-NEW (additive, optional): the materiality-driven recovery priority
     * persisted on the durable entry so the reviewer inbox reflects urgency (not a
     * hardcoded 'routine'). Matches the EscalationPriority union. Omitted →
     * unchanged.
     */
    priority?: 'urgent' | 'high' | 'routine' | 'deadline-unknown';
    /**
     * Wave-4 must-fix 3 (additive, PHI-safe): the exact RecoveryTask persisted on the
     * DRAFT at dispatch so the decision route reconstructs the task by READING these
     * fields — never re-deriving from sibling entries. Refs + amounts only. Omitted →
     * byte-identical to pre-Wave-4. (Tree 2 passes these at dispatch; recordRecovery
     * only ACCEPTS + stamps them here.)
     */
    taskClaimId?: string;
    taskAuthId?: string;
    taskDelta?: number;
    taskEvidenceTier?: EvidenceTier;
  }
): EvidenceRecord {
  return appendEntry(record, {
    id: args.id,
    ts: args.ts,
    stage: 'recovery',
    actor: args.actor ?? 'system',
    remittanceId: args.remittanceId,
    type: 'recovery',
    action: args.action,
    status: 'draft',
    rung: args.rung,
    ...(args.tenant !== undefined ? { tenant: args.tenant } : {}),
    ...(args.filingDeadline !== undefined ? { filingDeadline: args.filingDeadline } : {}),
    ...(args.priority !== undefined ? { priority: args.priority } : {}),
    ...(args.taskClaimId !== undefined ? { taskClaimId: args.taskClaimId } : {}),
    ...(args.taskAuthId !== undefined ? { taskAuthId: args.taskAuthId } : {}),
    ...(args.taskDelta !== undefined ? { taskDelta: args.taskDelta } : {}),
    ...(args.taskEvidenceTier !== undefined ? { taskEvidenceTier: args.taskEvidenceTier } : {}),
  });
}

/**
 * True when the record already contains an entry with `id`. The exactly-once /
 * id-idempotency guard for the append-only spine (Wave-4 must-fix 1): a recorder
 * that stamps a deterministic entry id can NO-OP when that id is already present,
 * so a repeated call cannot double-append. Pure — reads, never mutates.
 */
export function hasEntryId(record: EvidenceRecord, id: string): boolean {
  return record.entries.some((e) => e.id === id);
}

/**
 * Record a payer appeal SUBMISSION on the spine (Wave-4 must-fix 1). ID-IDEMPOTENT:
 * the entry id is the deterministic `${recoveryId}-submission`, and this NO-OPS
 * (returns the record unchanged) if that id already exists — so a repeated approve /
 * retried resume can never append a second submission (exactly-once by construction,
 * independent of any route-level marker). PHI-safe: refs / channel / rung / deciding-
 * reviewer reference only. `channel:'mock'` + not-transmitted end-to-end — a real
 * 837/appeal EDI transmission is the fail-closed submissionGateway seam.
 */
export function recordSubmission(
  record: EvidenceRecord,
  args: {
    recoveryId: string;
    ts: string;
    submissionRef: string;
    submittedAt: string;
    decidedBy: string;
    rung: string;
    channel?: 'mock';
    claimId?: string;
    remittanceId?: string;
    authId?: string;
    actor?: string;
    tenant?: string;
  }
): EvidenceRecord {
  const id = `${args.recoveryId}-submission`;
  if (hasEntryId(record, id)) return record; // id-idempotent no-op (exactly-once)
  return appendEntry(record, {
    id,
    ts: args.ts,
    stage: 'recovery',
    actor: args.actor ?? args.decidedBy,
    type: 'submission',
    submissionRef: args.submissionRef,
    submittedAt: args.submittedAt,
    channel: args.channel ?? 'mock',
    decidedBy: args.decidedBy,
    rung: args.rung,
    ...(args.claimId !== undefined ? { claimId: args.claimId } : {}),
    ...(args.remittanceId !== undefined ? { remittanceId: args.remittanceId } : {}),
    ...(args.authId !== undefined ? { authId: args.authId } : {}),
    ...(args.tenant !== undefined ? { tenant: args.tenant } : {}),
  });
}

/**
 * Record the TERMINAL recovery decision (Wave-4 must-fix 4). Appends a distinct
 * `recovery-decision` marker so the lifecycle transition (submitted | rejected) and
 * its provenance (WHO decided + WHEN) live on the append-only spine. ID-IDEMPOTENT:
 * the deterministic id `${recoveryId}-decision` no-ops on a repeat, so a reject (also
 * exactly-once) or a re-driven submit cannot double-mark. PHI-safe: status + reviewer
 * reference only.
 */
export function recordRecoveryTerminal(
  record: EvidenceRecord,
  args: {
    recoveryId: string;
    ts: string;
    status: 'submitted' | 'rejected';
    decidedBy: string;
    decidedAt: string;
    actor?: string;
    tenant?: string;
  }
): EvidenceRecord {
  const id = `${args.recoveryId}-decision`;
  if (hasEntryId(record, id)) return record; // id-idempotent no-op (exactly-once)
  return appendEntry(record, {
    id,
    ts: args.ts,
    stage: 'recovery',
    actor: args.actor ?? args.decidedBy,
    type: 'recovery-decision',
    recoveryId: args.recoveryId,
    status: args.status,
    decidedBy: args.decidedBy,
    decidedAt: args.decidedAt,
    ...(args.tenant !== undefined ? { tenant: args.tenant } : {}),
  });
}

/**
 * Record ONE stage of a GOVERNED analyst-ACTION lifecycle on the append-only spine
 * (Wave-9). The durable ticket lifecycle is the SEQUENCE of these entries
 * (proposed → approved → executed | rejected). ID-IDEMPOTENT: the entry id is the
 * deterministic `${actionId}::${status}`, and this NO-OPS (returns the record
 * unchanged) if that id already exists — so a repeated approve / retried resume can
 * never append a second entry for the same lifecycle stage (exactly-once by
 * construction, exactly like `recordSubmission`/`recordRecoveryTerminal`). PHI-safe:
 * refs / codes / channel / rung / deciding-reviewer reference only. `channel:'mock'`
 * + not-transmitted for the X12/appeal variants — a real X12 EDI send is the
 * fail-closed submissionGateway seam.
 */
export function recordGovernedAction(
  record: EvidenceRecord,
  args: {
    actionId: string;
    ts: string;
    actionType: GovernedActionType;
    status: 'proposed' | 'approved' | 'executed' | 'rejected';
    decidedBy: string;
    rung: string;
    isSubmission: boolean;
    channel?: 'mock';
    ref?: string;
    claimId?: string;
    remittanceId?: string;
    authId?: string;
    actor?: string;
    tenant?: string;
  }
): EvidenceRecord {
  const id = `${args.actionId}::${args.status}`;
  if (hasEntryId(record, id)) return record; // id-idempotent no-op (exactly-once per stage)
  return appendEntry(record, {
    id,
    ts: args.ts,
    stage: 'recovery',
    actor: args.actor ?? args.decidedBy,
    type: 'governed-action',
    actionType: args.actionType,
    status: args.status,
    decidedBy: args.decidedBy,
    rung: args.rung,
    isSubmission: args.isSubmission,
    channel: args.channel ?? 'mock',
    ...(args.ref !== undefined ? { ref: args.ref } : {}),
    ...(args.claimId !== undefined ? { claimId: args.claimId } : {}),
    ...(args.remittanceId !== undefined ? { remittanceId: args.remittanceId } : {}),
    ...(args.authId !== undefined ? { authId: args.authId } : {}),
    ...(args.tenant !== undefined ? { tenant: args.tenant } : {}),
  });
}
