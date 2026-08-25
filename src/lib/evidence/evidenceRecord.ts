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
import type { AuditEvent } from '@/lib/server/audit';
import type { CoverageDetermination, Deficiency } from '@/lib/policy';

export type EvidenceStage =
  'eligibility' | 'medical-necessity' | 'prior-auth' | 'patient-estimation';

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
      decision: 'approved' | 'denied' | 'more-info';
      reasons?: string[];
    })
  | (BaseEntry & { type: 'note'; text: string });

export type EvidenceEntryType = EvidenceEntry['type'];

export type EvidenceStatus = 'open' | 'submitted' | 'closed';

export interface EvidenceRecord {
  id: string;
  memberId: string;
  order: OrderRef;
  createdAt: string; // ISO; caller-supplied
  status: EvidenceStatus;
  entries: readonly EvidenceEntry[];
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
  };
}

// ---------- audit projection (PHI-safe) ----------

/**
 * Project the record's entries to PHI-safe AuditEvents (references + codes only,
 * no clinical narrative). Wires the Evidence Record into the existing audit
 * spine without leaking PHI.
 */
export function toAuditEvents(record: EvidenceRecord, correlationId: string): AuditEvent[] {
  return record.entries.map((e) => {
    const base: AuditEvent = {
      ts: e.ts,
      actor: e.actor ?? 'system',
      action: `evidence.${e.type}`,
      resourceRef: `Evidence/${record.id}#${e.id}`,
      correlationId,
      outcome: 'success',
    };
    switch (e.type) {
      case 'coverage-determination':
        return {
          ...base,
          detail: `${record.order.code} → ${e.determination.outcome} (requiresPA=${e.determination.requiresPA}, propensity=${e.determination.propensityToDeny})`,
        };
      case 'gold-card':
        return {
          ...base,
          detail: `${record.order.code} gold-card applied=${e.exemption.applied} basis=${e.exemption.basis ?? 'n/a'}`,
        };
      case 'pas-submission':
        // PHI-safe: the approver reference is a Practitioner id, not member data.
        return { ...base, detail: `${record.order.code} submitted by ${e.approver.reference}` };
      case 'pas-decision':
        return { ...base, detail: `${record.order.code} decision=${e.decision}` };
      default:
        return { ...base, detail: `${record.order.code} ${e.type}` };
    }
  });
}
