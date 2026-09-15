/**
 * Right-to-delete over the APPEND-ONLY evidence ledger — done correctly (Wave C).
 *
 * The evidence ledger is immutable: the only write is an append, and a DB-level
 * trigger refuses UPDATE / DELETE. A silent row delete is therefore both
 * impossible and wrong. Erasure is instead a GOVERNED TOMBSTONE: we APPEND a new
 * record version whose entries are reduced to a single PHI-safe tombstone note
 * that records the policy, legal basis, and actor. Consequences:
 *
 *   - the LATEST snapshot (`get`) no longer surfaces the erased entries
 *     (segmentation / right-to-be-forgotten satisfied), while
 *   - every PRIOR version stays readable via `readLedger` (immutability +
 *     auditability preserved — the ledger still proves what happened and when),
 *     and
 *   - a LEGAL HOLD on the subject or the record refuses the tombstone outright
 *     (E9 — a delete must never bypass a hold).
 *
 * We use ONLY the public ledger surface (`get` / `save`, and `readLedger` when
 * present) — the ledger store internals are never touched.
 */
import * as clock from '@/lib/clock';
import { auditRightToDelete, auditRightToDeleteBlocked } from './audit';
import type { LegalHoldRegistry } from './legalHold';
import type { RightToDeleteRequest, RightToDeleteResult } from './types';
import type { EvidenceRecord, EvidenceEntry, EvidenceStage } from '@/lib/evidence';

/** Marker that identifies a tombstone note; machine-checkable and PHI-safe. */
export const TOMBSTONE_MARKER = 'lifecycle:right-to-delete';

/** Stage the tombstone note is filed under (cosmetic; the marker is authoritative). */
const TOMBSTONE_STAGE: EvidenceStage = 'eligibility';

/** The minimal ledger surface right-to-delete needs. EvidenceStore satisfies it. */
export interface LedgerLike {
  get(id: string): Promise<EvidenceRecord | null>;
  save(record: EvidenceRecord): Promise<void>;
  /** Optional: append-only version history, used to count prior versions. */
  readLedger?(id: string): Promise<unknown[]>;
}

/** True when a record's latest snapshot is a lifecycle tombstone. */
export function isTombstoned(record: EvidenceRecord): boolean {
  return record.entries.some(
    (e) => e.type === 'note' && typeof e.text === 'string' && e.text.startsWith(TOMBSTONE_MARKER)
  );
}

/** Build the single tombstone note that replaces the record's entries. PHI-safe. */
function tombstoneNote(
  req: RightToDeleteRequest,
  ts: string,
  erasedEntryCount: number
): EvidenceEntry {
  return {
    id: `tombstone-${req.recordId}`,
    ts,
    stage: TOMBSTONE_STAGE,
    actor: req.actor,
    type: 'note',
    text:
      `${TOMBSTONE_MARKER} policy=${req.policyId} basis=${req.legalBasis} ` +
      `actor=${req.actor} erasedEntries=${erasedEntryCount}`,
  };
}

/** Count the versions already in the ledger for this record (0 when unknown). */
async function priorVersions(ledger: LedgerLike, id: string): Promise<number> {
  if (typeof ledger.readLedger !== 'function') return 0;
  try {
    return (await ledger.readLedger(id)).length;
  } catch {
    return 0;
  }
}

/**
 * Execute a right-to-delete. Order of guards matters for E9: the legal-hold
 * check runs BEFORE any append, so a held subject can never be tombstoned.
 *
 *   - not-found          -> no append; noop audit.
 *   - blocked-legal-hold -> no append; blocked audit (hold on record OR subject).
 *   - already-tombstoned -> no append; noop audit (idempotent).
 *   - tombstoned         -> ONE new version appended; prior versions preserved.
 */
export async function executeRightToDelete(
  ledger: LedgerLike,
  registry: LegalHoldRegistry,
  req: RightToDeleteRequest
): Promise<RightToDeleteResult> {
  const record = await ledger.get(req.recordId);
  const ts = clock.nowIso();

  if (!record) {
    return {
      recordId: req.recordId,
      status: 'not-found',
      audit: auditRightToDeleteBlocked(req, ts, 'not-found'),
    };
  }

  // E9: a legal hold on the record id OR the member blocks erasure. Checked
  // before any write, so the append path is never reached under a hold.
  if (registry.isHeld(req.recordId) || registry.isHeld(record.memberId)) {
    return {
      recordId: req.recordId,
      status: 'blocked-legal-hold',
      audit: auditRightToDeleteBlocked(req, ts, 'blocked-legal-hold'),
    };
  }

  if (isTombstoned(record)) {
    return {
      recordId: req.recordId,
      status: 'already-tombstoned',
      audit: auditRightToDeleteBlocked(req, ts, 'already-tombstoned'),
    };
  }

  const prior = await priorVersions(ledger, req.recordId);
  const tombstone: EvidenceRecord = {
    id: record.id,
    memberId: record.memberId,
    order: record.order,
    createdAt: record.createdAt,
    status: 'closed',
    entries: [tombstoneNote(req, ts, record.entries.length)],
  };

  // Append-only: this is a NEW version, never an update/delete of a row.
  await ledger.save(tombstone);

  return {
    recordId: req.recordId,
    status: 'tombstoned',
    priorVersionCount: prior,
    audit: auditRightToDelete(req, ts, prior),
  };
}
