/**
 * Golden Thread Evidence Record (increment GT-2).
 *
 * The single, append-only, point-in-time object that threads all four stages
 * (Eligibility · Medical Necessity · Prior Auth · Patient Estimation). It IS the
 * Da Vinci Coverage Determination Record and the audit spine: every stage
 * appends a typed entry, nothing is ever mutated in place, and the whole record
 * projects to PHI-safe AuditEvents.
 *
 * Pure + deterministic — callers supply timestamps and ids (same discipline as
 * `audit.ts` and `paMachine.ts`) so the record is testable and reproducible.
 * Stores references, codes, and determinations — never raw PHI payloads.
 */
import type { CoverageDetermination, Deficiency } from '@/lib/policy';
import { computeProcessTier } from './tier';
import type { EvidenceTier } from './tierConfig';
// Type-only import (no runtime cycle): ledgerIntegrity imports the record TYPES
// from here, and this file imports only the LedgerSeal TYPE from there — both are
// erased at compile time.
import type { LedgerSeal } from './ledgerIntegrity';

export type EvidenceStage =
  | 'eligibility'
  | 'medical-necessity'
  | 'prior-auth'
  | 'patient-estimation'
  | 'claim'
  | 'remittance'
  | 'reconciliation'
  | 'recovery';

/**
 * Gold-card exemption evidence. Defined here (not in the policy module) so the
 * Evidence Record has no upward dependency; the gold-carding module (increment
 * GC) produces a value assignable to this shape. A gold card attaches to a
 * provider NPI, per procedure code, per payer, earned by a ≥ threshold approval
 * rate over a look-back window (e.g. Texas HB 3459; voluntary payer programs).
 */
export interface GoldCardEvidence {
  applied: boolean; // true → PA is waived for this order
  providerNpi: string;
  code: string;
  payer: string;
  approvalRate?: number; // 0..1 over the look-back window
  lookbackMonths?: number;
  sampleSize?: number;
  basis?: string; // e.g. "Texas HB 3459" | "payer voluntary program"
  expiresOn?: string | null;
  reason: string;
}

export interface OrderRef {
  code: string;
  display?: string;
  providerNpi?: string;
}

/**
 * The reviewer of record on a PA submission — a resolved, referenceable identity,
 * NEVER a free-text name. Structurally mirrors ApproverIdentity
 * (src/lib/authz/approvalAuthority.ts); kept inline so the audit-spine type has no
 * upward dependency on the authz module. Because the entry carries this shape (not
 * a bare string), a caller cannot stamp the golden thread with an unverified name.
 */
export interface EvidenceApprover {
  reference: string; // e.g. 'Practitioner/rev-1'
  display: string; // human-readable name derived from the reference
}

interface BaseEntry {
  id: string;
  ts: string; // ISO; caller-supplied
  stage: EvidenceStage;
  actor?: string; // e.g. "system" | "reviewer:123"
  // Optional id-threading across the order→cash spine. Caller-supplied (never
  // minted here); each is a reference, not PHI.
  orderId?: string;
  authId?: string;
  claimId?: string;
  remittanceId?: string;
  // Optional tenant/LOB scope stamp (Wave-2 W2-3, defense-in-depth). Caller-supplied
  // reference, never PHI; absent in the non-tenanted (mock) demo.
  tenant?: string;
}

export type EvidenceEntry =
  | (BaseEntry & { type: 'eligibility'; coverageRef?: string; requiresPA: boolean; note?: string })
  | (BaseEntry & { type: 'coverage-determination'; determination: CoverageDetermination })
  | (BaseEntry & { type: 'gold-card'; exemption: GoldCardEvidence })
  | (BaseEntry & { type: 'dtr-response'; questionnaireRef?: string; itemCount: number })
  | (BaseEntry & { type: 'propensity'; score: number; band: 'low' | 'medium' | 'high' })
  | (BaseEntry & { type: 'pas-submission'; approver: EvidenceApprover })
  | (BaseEntry & {
      type: 'pas-decision';
      // 'exempt' is an EVIDENCE value only (e.g. gold-carded / requiresPA=false):
      // DISTINCT from 'approved' and never fed into a decision state machine.
      decision: 'approved' | 'denied' | 'more-info' | 'exempt';
      reasons?: string[];
    })
  | (BaseEntry & { type: 'note'; text: string })
  | (BaseEntry & { type: 'claim-submission'; claimRef: string; total: number })
  | (BaseEntry & {
      type: 'remittance';
      remittanceId: string;
      paidAmount: number;
      adjustments: Array<{ group: 'CO' | 'PR' | 'OA' | 'PI'; amount: number }>;
      carcCodes: string[];
      rarcCodes: string[];
      carcGroups: string[];
    })
  | (BaseEntry & {
      type: 'reconciliation';
      verdict: 'matched' | 'underpaid' | 'overpaid' | 'indeterminate' | 'not-recoverable';
      contractedAllowed: number;
      paidAmount: number;
      delta: number;
      toleranceApplied: number;
    })
  | (BaseEntry & { type: 'underpayment'; delta: number; basis: string })
  | (BaseEntry & {
      type: 'recovery';
      action: 'draft-appeal' | 'draft-resubmission';
      // Wave-4 must-fix 4 (additive): the recovery lifecycle status. 'draft' at
      // dispatch; a qualified-human decision transitions it to 'submitted' or
      // 'rejected' (recorded via recordRecoveryTerminal + a recovery-decision
      // marker). Pre-Wave-4 entries carry only 'draft' → byte-identical.
      status: 'draft' | 'submitted' | 'rejected';
      rung: string;
      // Wave-3 HIGH-2 (additive, optional): the timely-filing / appeal-window
      // deadline (ISO date) for this recovery, computed from the remittance date
      // plus a configurable filing window. Persisted so a scheduler / reviewer can
      // see when the payer appeal window closes. Absent on entries written before
      // the deadline was computed (byte-identical to pre-Wave-3 when omitted).
      filingDeadline?: string;
      // MED-NEW (additive, optional): the materiality-driven recovery priority
      // (urgent|routine, or the C6 `deadline-unknown` triage sentinel when the appeal-window
      // deadline is unparseable) persisted on the durable entry. Matches EscalationPriority.
      priority?: 'urgent' | 'high' | 'routine' | 'deadline-unknown';
      // Wave-4 must-fix 3 (additive, PHI-safe): the exact RecoveryTask persisted on
      // the DRAFT at dispatch, so the decision route reconstructs the task by READING
      // these fields — never re-deriving from sibling entries (kills divergence +
      // recomputed-tier authority drift). Refs + amounts only, never member free-text.
      taskClaimId?: string;
      taskAuthId?: string;
      taskDelta?: number;
      taskEvidenceTier?: EvidenceTier;
    })
  | (BaseEntry & {
      // Wave-4 must-fix 1: a payer appeal SUBMISSION record on the append-only spine.
      // An ACTION record, NOT evidence strength (tier.ts maps it D3 but the weakest-
      // link min means it can never lift the authority tier). PHI-safe: refs / channel
      // / rung / deciding-reviewer ref only, never member free-text. `channel:'mock'`
      // + not-transmitted end-to-end — a real 837/appeal EDI transmission is an
      // explicit named fail-closed stub (submissionGateway seam).
      type: 'submission';
      submissionRef: string;
      claimId?: string;
      remittanceId?: string;
      authId?: string;
      submittedAt: string;
      channel: 'mock';
      decidedBy: string;
      rung: string;
    })
  | (BaseEntry & {
      // Wave-4 must-fix 4: a terminal lifecycle marker (submitted | rejected) on the
      // append-only spine — WHO decided + WHEN (provenance). PHI-safe: status +
      // reviewer reference only.
      type: 'recovery-decision';
      recoveryId: string;
      status: 'submitted' | 'rejected';
      decidedBy: string;
      decidedAt: string;
    })
  | (BaseEntry & {
      // Wave-9: a GOVERNED analyst ACTION lifecycle entry. The durable ticket lifecycle IS
      // this sequence (proposed → approved → executed | rejected), each with a deterministic
      // id so the recorder is exactly-once per stage. An ACTION record, NOT evidence strength
      // (tier.ts maps it D3 so the weakest-link MIN can never lift the authority tier, like
      // `submission`). PHI-safe: refs/codes/channel/rung/reviewer ref only. `channel:'mock'` +
      // not-transmitted for the X12/appeal variants — real X12 EDI is the submissionGateway seam.
      type: 'governed-action';
      actionType: GovernedActionType;
      status: 'proposed' | 'approved' | 'executed' | 'rejected';
      decidedBy: string;
      rung: string;
      channel: 'mock';
      isSubmission: boolean; // payer-facing SUBMISSION-class (human-gated regardless of rung)?
      ref?: string; // the mock submission/notice reference (PHI-safe), when executed
      // claimId / remittanceId / authId are inherited from BaseEntry.
    });

/**
 * Wave-9: the governed analyst-ACTION types an analyst TRIGGERS from a Wave-8 finding.
 * The payer-facing X12 variants + `appeal` are SUBMISSION-class (human-gated regardless
 * of rung — the decisionGate/interlock rule); `provider-notice`/`ticket-update` are
 * internal. Exported so the recorder, runner and route share ONE definition.
 */
export type GovernedActionType =
  | 'x12-276' // claim status inquiry
  | 'x12-278' // prior-auth (services review) request
  | 'x12-275' // additional information / attachment
  | 'x12-837-corrected' // corrected claim
  | 'appeal' // payer appeal submission
  | 'provider-notice' // internal provider notification
  | 'integrity-freeze' // A6: urgent internal ledger freeze + escalate on a detected tamper
  | 'ticket-update'; // durable ticket lifecycle update

export type EvidenceEntryType = EvidenceEntry['type'];

export type EvidenceStatus = 'open' | 'submitted' | 'closed';

export interface EvidenceRecord {
  id: string;
  memberId: string;
  order: OrderRef;
  createdAt: string; // ISO; caller-supplied
  status: EvidenceStatus;
  entries: readonly EvidenceEntry[];
  /**
   * Optional tamper-evident seal over the append-only entries (Wave-2 W2-1). It is
   * integrity/provenance metadata only — verify it at every use via
   * verifyLedgerIntegrity (the ledger is untrusted on read); it NEVER affects the
   * evidence tier or the authority rung.
   */
  seal?: LedgerSeal;
}

// ---------- construction (immutable) ----------

export function createEvidenceRecord(input: {
  id: string;
  memberId: string;
  order: OrderRef;
  createdAt: string;
}): EvidenceRecord {
  return {
    id: input.id,
    memberId: input.memberId,
    order: input.order,
    createdAt: input.createdAt,
    status: 'open',
    entries: [],
  };
}

/** Append an entry, returning a NEW record. The input record is never mutated. */
export function appendEntry(record: EvidenceRecord, entry: EvidenceEntry): EvidenceRecord {
  return { ...record, entries: [...record.entries, entry] };
}

/** Set status, returning a NEW record. */
export function withStatus(record: EvidenceRecord, status: EvidenceStatus): EvidenceRecord {
  return { ...record, status };
}

// ---------- convenience recorders ----------

export function recordDetermination(
  record: EvidenceRecord,
  args: { id: string; ts: string; determination: CoverageDetermination; actor?: string }
): EvidenceRecord {
  return appendEntry(record, {
    id: args.id,
    ts: args.ts,
    stage: 'medical-necessity',
    actor: args.actor ?? 'system',
    type: 'coverage-determination',
    determination: args.determination,
  });
}

export function recordGoldCard(
  record: EvidenceRecord,
  args: { id: string; ts: string; exemption: GoldCardEvidence; actor?: string }
): EvidenceRecord {
  return appendEntry(record, {
    id: args.id,
    ts: args.ts,
    stage: 'eligibility',
    actor: args.actor ?? 'system',
    type: 'gold-card',
    exemption: args.exemption,
  });
}

/**
 * Record a PAS submission on the evidence spine. The approver MUST be a resolved
 * identity (EvidenceApprover) — there is no string overload — so the reviewer of
 * record on the golden thread is always the authenticated, referenceable reviewer
 * bound at the submit route, never a client-supplied name. The actor defaults to
 * the approver's reference (the accountable identity).
 */
export function recordPasSubmission(
  record: EvidenceRecord,
  args: { id: string; ts: string; approver: EvidenceApprover; actor?: string }
): EvidenceRecord {
  return appendEntry(record, {
    id: args.id,
    ts: args.ts,
    stage: 'prior-auth',
    actor: args.actor ?? args.approver.reference,
    type: 'pas-submission',
    approver: { reference: args.approver.reference, display: args.approver.display },
  });
}

// The financial-stage recorders (recordPasDecision, recordClaimSubmission,
// recordRemittance, recordReconciliation, recordRecovery) live in
// `./financialRecorders` to keep this audit-spine module under the size cap
// (AI-CODING-CONVENTIONS §2/§3). They are re-exported from `@/lib/evidence`
// (see ./index.ts) so the public import surface is unchanged.

// ---------- queries ----------

export function entriesForStage(record: EvidenceRecord, stage: EvidenceStage): EvidenceEntry[] {
  return record.entries.filter((e) => e.stage === stage);
}

export function latestOfType<T extends EvidenceEntryType>(
  record: EvidenceRecord,
  type: T
): Extract<EvidenceEntry, { type: T }> | undefined {
  for (let i = record.entries.length - 1; i >= 0; i -= 1) {
    const e = record.entries[i];
    if (e.type === type) return e as Extract<EvidenceEntry, { type: T }>;
  }
  return undefined;
}

// ---------- summary (net of gold carding) ----------

export interface EvidenceSummary {
  memberId: string;
  order: OrderRef;
  entryCount: number;
  stagesTouched: EvidenceStage[];
  currentDetermination?: CoverageDetermination;
  goldCardApplied: boolean;
  /** Net requirement: an applied gold card waives PA even if policy requires it. */
  requiresPA: boolean;
  netOutcome: 'pa-exempt-gold-card' | CoverageDetermination['outcome'] | 'undetermined';
  openDeficiencies: Deficiency[];
  /**
   * recordTier = the FULL weakest-link (minimum) process tier over the WHOLE
   * record (every entry, including a raw D0 remittance). DISTINCT from the
   * decision-critical tier orderToCash reports on `CashResult.currentTier`, which
   * is computed over only the decision-critical input set — the two must never be
   * conflated. Additive; recomputed, never cached.
   */
  recordTier?: EvidenceTier;
  /** Latest reconciliation verdict, if any (additive). */
  reconciliationVerdict?:
    'matched' | 'underpaid' | 'overpaid' | 'indeterminate' | 'not-recoverable';
  /** Latest recorded underpayment delta, if any (additive). */
  underpaymentDelta?: number;
}

export function summarize(record: EvidenceRecord): EvidenceSummary {
  const det = latestOfType(record, 'coverage-determination')?.determination;
  const gc = latestOfType(record, 'gold-card')?.exemption;
  const goldCardApplied = !!gc?.applied;
  const stagesTouched = [...new Set(record.entries.map((e) => e.stage))];

  let requiresPA: boolean;
  let netOutcome: EvidenceSummary['netOutcome'];
  if (goldCardApplied) {
    requiresPA = false; // exemption overrides
    netOutcome = 'pa-exempt-gold-card';
  } else if (det) {
    requiresPA = det.requiresPA;
    netOutcome = det.outcome;
  } else {
    requiresPA = false;
    netOutcome = 'undetermined';
  }

  const recon = latestOfType(record, 'reconciliation');
  const under = latestOfType(record, 'underpayment');

  return {
    memberId: record.memberId,
    order: record.order,
    entryCount: record.entries.length,
    stagesTouched,
    currentDetermination: det,
    goldCardApplied,
    requiresPA,
    netOutcome,
    openDeficiencies: goldCardApplied ? [] : (det?.deficiencies ?? []),
    recordTier: computeProcessTier(record),
    ...(recon ? { reconciliationVerdict: recon.verdict } : {}),
    ...(under ? { underpaymentDelta: under.delta } : {}),
  };
}

// The PHI-safe audit projection (toAuditEvents) lives in `./auditProjection` to
// keep this audit-spine module under the file-size cap (AI-CODING-CONVENTIONS
// §2/§3). It is re-exported from `@/lib/evidence` (see ./index.ts) so the public
// import surface is unchanged.
