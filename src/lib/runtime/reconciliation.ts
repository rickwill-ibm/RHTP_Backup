/**
 * Audit-Balance-Control (ABC) reconciliation ledger for the ingest driver.
 *
 * Every whole-bundle load (and every remediation re-processing) emits ONE
 * consolidated, PHI-safe `LoadReconciliationRecord`: counts, refs, and ids only —
 * never a name, DOB, or clinical narrative. It is the driver's balance-control
 * artifact: for a non-held load, `admitted + quarantined + nonProjected` MUST
 * equal `countIn` (every resource lands in exactly one census bucket, none
 * silently dropped); a held bundle is trivially balanced (nothing projected).
 *
 * The store is append-only: a remediation record is a NEW append, never a
 * mutation of the original load record, so the full audit history is preserved.
 * `list()` returns the full history (newest first), filterable by memberRef/kind;
 * `get(loadId)` returns the latest snapshot for one load id.
 */
import { stableHash } from '@/lib/deadLetter/types';

/**
 * One consolidated per-load reconciliation record. PHI-SAFE by construction:
 * every field is a count, a ref, or an id — no names, no narrative.
 */
export interface LoadReconciliationRecord {
  /** Deterministic, kind-scoped: `{load|remed}-${sourceSystem}-${memberRef||'held'}-${hash}`. */
  loadId: string;
  kind: 'load' | 'remediation';
  sourceSystem: string;
  /** Anchored member id, or '' when the bundle was held. */
  memberRef: string;
  /** ISO-8601 from the injected clock. */
  occurredAt: string;
  /** totalResources seen in the bundle. */
  countIn: number;
  admitted: number;
  quarantined: number;
  nonProjected: number;
  /** projection.applied. */
  projected: number;
  held: boolean;
  /** Dead-letter ids created for / cleared by this load (PHI-safe). */
  heldRefs: string[];
  /** held ? true : admitted + quarantined + nonProjected === countIn. */
  balanced: boolean;
}

/** Filter for list(): by memberRef and/or kind. Omit a field to match all. */
export interface ReconciliationFilter {
  memberRef?: string;
  kind?: LoadReconciliationRecord['kind'];
}

/** Append-only reconciliation store seam. No update, no delete. */
export interface ReconciliationStore {
  /** Append one record (a load or a remediation). Returns the stored record. */
  append(rec: LoadReconciliationRecord): Promise<LoadReconciliationRecord>;
  /** Full append history (newest first), filtered by memberRef/kind. */
  list(filter?: ReconciliationFilter): Promise<LoadReconciliationRecord[]>;
  /** Latest snapshot for one loadId, or null. */
  get(loadId: string): Promise<LoadReconciliationRecord | null>;
}

/** The PHI-safe inputs the driver assembles into a reconciliation record. */
export interface ReconciliationInputs {
  kind: 'load' | 'remediation';
  sourceSystem: string;
  /** Anchored member id, or '' when held. */
  memberRef: string;
  /** PHI-safe patient token (drives the deterministic hash), or '' when absent. */
  patientToken: string;
  occurredAt: string;
  countIn: number;
  admitted: number;
  quarantined: number;
  nonProjected: number;
  projected: number;
  held: boolean;
  heldRefs: string[];
}

/**
 * Build one PHI-safe `LoadReconciliationRecord`. Deterministic loadId (so the same
 * source+patient+time collapses to one id); `balanced` proves conservation for a
 * non-held load. Reuses the shared `stableHash` — no new hash primitive.
 */
export function buildLoadReconciliationRecord(i: ReconciliationInputs): LoadReconciliationRecord {
  // `kind` is in BOTH the visible prefix and the hash so a load record and a
  // remediation record for the same (source, patient, time) never collide on loadId
  // (the red-team `get(loadId)`-returns-wrong-kind finding).
  const tag = i.kind === 'remediation' ? 'remed' : 'load';
  const loadId = `${tag}-${i.sourceSystem}-${i.memberRef || 'held'}-${stableHash(
    `${i.kind}:${i.sourceSystem}:${i.patientToken}:${i.occurredAt}`
  )}`;
  // `balanced` is ALWAYS a genuine conservation check — every resource lands in
  // exactly one census bucket. For a held bundle the driver sets nonProjected =
  // countIn (nothing admitted/quarantined/projected), so conservation holds without
  // waiving the check (no `held ? true` fiat that could mask a resource-level gap).
  const balanced = i.admitted + i.quarantined + i.nonProjected === i.countIn;
  return {
    loadId,
    kind: i.kind,
    sourceSystem: i.sourceSystem,
    memberRef: i.memberRef,
    occurredAt: i.occurredAt,
    countIn: i.countIn,
    admitted: i.admitted,
    quarantined: i.quarantined,
    nonProjected: i.nonProjected,
    projected: i.projected,
    held: i.held,
    heldRefs: i.heldRefs,
    balanced,
  };
}

/** In-memory append-only reconciliation store (mock/seeded + test default). */
export function createMemoryReconciliationStore(): ReconciliationStore {
  // Full append history, oldest first.
  const history: LoadReconciliationRecord[] = [];
  return {
    async append(rec: LoadReconciliationRecord): Promise<LoadReconciliationRecord> {
      history.push(rec);
      return rec;
    },
    async list(filter?: ReconciliationFilter): Promise<LoadReconciliationRecord[]> {
      const out = history.filter(
        (r) =>
          (filter?.memberRef === undefined || r.memberRef === filter.memberRef) &&
          (filter?.kind === undefined || r.kind === filter.kind)
      );
      return out.reverse(); // newest first
    },
    async get(loadId: string): Promise<LoadReconciliationRecord | null> {
      for (let idx = history.length - 1; idx >= 0; idx -= 1) {
        if (history[idx].loadId === loadId) return history[idx];
      }
      return null;
    },
  };
}
