/**
 * verifyStored.ts — verify-on-READ for the tamper-evident evidence ledger
 * (Wave-2 W2-1 fix).
 *
 * The seal is written at commit time, but a seal only earns its name if it is
 * re-checked when the record is READ BACK — otherwise a persisted record is
 * trusted blindly and a tampered ledger row goes undetected. `sealRecord` +
 * `verifyLedgerIntegrity` at write time verify the just-sealed object (a
 * tautology); THIS is the independent read-path verifier.
 *
 * `loadVerifiedRecord` loads a record through the EvidenceStore seam and, when the
 * record carries a seal, re-runs `verifyLedgerIntegrity` against the LIVE loaded
 * entries (the ledger is untrusted on read — the chain head + entry count are
 * recomputed, never trusted from a stored flag). It is PURE with respect to key
 * custody: the caller passes the verifier `SigningKey` (obtained via
 * `getSigningKeyLoader()` at the call site), so this helper stays testable and
 * never reaches into a seam itself.
 *
 * Integrity is `null` (not `false`) when the record has NO seal — "unsealed" is a
 * distinct state from "sealed but tampered". Returns `null` when no record exists
 * for the id.
 */
import type { EvidenceStore } from './evidenceStore';
import type { EvidenceRecord } from './evidenceRecord';
import { verifyLedgerIntegrity, type SigningKey } from './ledgerIntegrity';

/** The independent, read-path integrity attestation over a loaded record. */
export interface StoredIntegrity {
  /** True when the recomputed chain head + entry count + bound identity match the seal. */
  intact: boolean;
  /** True when, additionally, the HMAC verifies with the supplied key (constant-time). */
  signed: boolean;
  /** PHI-free reasons for any failure (empty when intact + signed). */
  reasons: string[];
}

export interface VerifiedRecord {
  record: EvidenceRecord;
  /** null when the record carries no seal; otherwise the live verification result. */
  integrity: StoredIntegrity | null;
}

/**
 * Load `id` via `store` and verify its seal on read. Returns `null` when the store
 * has no record for `id`. When the loaded record has a seal, `integrity` is the
 * result of `verifyLedgerIntegrity(record, record.seal, verifier)` recomputed from
 * the live entries; when it has none, `integrity` is `null`.
 */
export async function loadVerifiedRecord(
  store: EvidenceStore,
  id: string,
  verifier: SigningKey
): Promise<VerifiedRecord | null> {
  const record = await store.get(id);
  if (!record) return null;
  if (!record.seal) return { record, integrity: null };
  const v = verifyLedgerIntegrity(record, record.seal, verifier);
  return { record, integrity: { intact: v.intact, signed: v.signed, reasons: v.reasons } };
}
