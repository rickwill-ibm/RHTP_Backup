/**
 * ledgerIntegrity.ts — tamper-evident hash-chain + signing seal over the
 * append-only Evidence Record (Wave-2 W2-1). INTEGRITY / PROVENANCE ONLY.
 *
 * A seal proves an entry sequence was not edited/dropped/reordered and (when
 * signed) that a named key attested to it — ORTHOGONAL to evidence strength. It
 * NEVER touches the evidence tier or authority rung (does not import tier.ts); the
 * interlock/tier code does not read it. HMAC-SHA256 is a *tamper-evident*
 * symmetric seal (no non-repudiation); the production signing seam FAILS CLOSED
 * until a real KMS/HSM asymmetric signer is wired.
 *
 * Pure + deterministic: `ts` is caller-supplied (never minted). The ledger is
 * UNTRUSTED on read — verify ALWAYS recomputes the chain + count from the live
 * record, never trusting a stored flag. Node built-ins only — no new dep.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '../util/canonicalJson';
import type { EvidenceEntry, EvidenceRecord } from './evidenceRecord';

/** sha256 hex over the canonical JSON of one entry (stable key order). */
export function entryHash(entry: EvidenceEntry): string {
  return createHash('sha256').update(canonicalJson(entry)).digest('hex');
}

/**
 * The hash chain over the record's append-only entries:
 *   h[i] = sha256hex(entryHash(entries[i]) + (h[i-1] ?? '')).
 * Pure, recomputable, order-sensitive; mutates nothing. Empty record → [].
 */
export function chainOfRecord(record: EvidenceRecord): string[] {
  const chain: string[] = [];
  let prev = '';
  for (const entry of record.entries) {
    const link = createHash('sha256')
      .update(entryHash(entry) + prev)
      .digest('hex');
    chain.push(link);
    prev = link;
  }
  return chain;
}

/** The last chain link ('' when the record has no entries). */
function chainHeadOf(record: EvidenceRecord): string {
  const chain = chainOfRecord(record);
  return chain.length ? chain[chain.length - 1] : '';
}

/**
 * A tamper-evident seal. `alg`/`keyId` are explicit so a production asymmetric
 * signer with named key custody can replace the HMAC demo seal without a shape
 * change. Binds record identity (recordId + memberId) so a seal is not
 * transferable to another record with a coincidentally-equal entry sequence.
 */
export interface LedgerSeal {
  alg: 'HMAC-SHA256';
  recordId: string;
  memberId: string;
  chainHead: string;
  entryCount: number;
  signature: string;
  keyId: string;
  ts: string;
}

/** A demo-grade symmetric signing key (production wires a real KMS/HSM signer). */
export interface SigningKey {
  keyId: string;
  secret: string;
}

/** The exact bytes that are signed — the seal without its signature. */
function signedBytes(fields: Omit<LedgerSeal, 'signature'>): string {
  return canonicalJson(fields);
}

/**
 * Seal a record's current chain head with `signer`. `ts` is caller-supplied
 * (never minted). The signature is an HMAC-SHA256 hex over the canonical
 * signed-bytes (identity + chainHead + entryCount + keyId + ts).
 */
export function sealRecord(record: EvidenceRecord, signer: SigningKey, ts: string): LedgerSeal {
  const fields: Omit<LedgerSeal, 'signature'> = {
    alg: 'HMAC-SHA256',
    recordId: record.id,
    memberId: record.memberId,
    chainHead: chainHeadOf(record),
    entryCount: record.entries.length,
    keyId: signer.keyId,
    ts,
  };
  const signature = createHmac('sha256', signer.secret).update(signedBytes(fields)).digest('hex');
  return { ...fields, signature };
}

/** Constant-time comparison of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Verify a seal against the LIVE record. Recomputes chain head + count from
 * `record.entries` (never trusts a stored value): `intact` requires the recomputed
 * head + count AND the bound identity (recordId, memberId) to match the seal, so
 * any edit/drop/reorder/append breaks it and a seal cannot be transferred to a
 * different record. `signed` additionally requires the HMAC over the rebuilt
 * signed-bytes (with `verifier`'s key) to match in constant time. reasons[] names
 * each failure and is PHI-free.
 */
export function verifyLedgerIntegrity(
  record: EvidenceRecord,
  seal: LedgerSeal,
  verifier: SigningKey
): { intact: boolean; signed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const chainHead = chainHeadOf(record);
  const entryCount = record.entries.length;
  if (seal.recordId !== record.id) reasons.push('recordId does not match the sealed record');
  if (seal.memberId !== record.memberId) reasons.push('memberId does not match the sealed record');
  if (seal.entryCount !== entryCount) {
    reasons.push(`entryCount mismatch (sealed ${seal.entryCount}, live ${entryCount})`);
  }
  if (seal.chainHead !== chainHead)
    reasons.push('chainHead mismatch (entries edited/dropped/reordered)');
  const intact = reasons.length === 0;

  let signed = false;
  if (!intact) {
    reasons.push('signature not verified (record not intact)');
  } else {
    const expected = createHmac('sha256', verifier.secret)
      .update(
        signedBytes({
          alg: seal.alg,
          recordId: record.id,
          memberId: record.memberId,
          chainHead,
          entryCount,
          keyId: verifier.keyId,
          ts: seal.ts,
        })
      )
      .digest('hex');
    signed = timingSafeEqualHex(expected, seal.signature);
    if (!signed) reasons.push('signature does not verify with the provided key');
  }

  return { intact, signed, reasons };
}
