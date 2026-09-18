/**
 * recoveryGuards.ts — shared fail-closed guards for the recovery decision + action routes
 * (Wave-11 remediation). Extracted so BOTH routes reuse ONE definition and stay under the
 * file-size cap (AI-CODING-CONVENTIONS §2/§3) — no duplicated verify-before-reseal logic.
 *
 * `verifyLedgerAtRead` is the verify-before-reseal check: a persisted record is UNTRUSTED
 * on read. A sealed record is verified against its LIVE entries and reported not-ok unless
 * intact && signed (tamper) or the signer seam is unavailable (fail-closed) — never
 * re-sealed. Unsealed (mock/seeded) records pass. The ROUTE maps the result to a 409 +
 * audit. Used at BOTH the base read AND the re-read-latest point (C3), so a tamper landing
 * in the window between the two reads cannot be laundered by the re-seal.
 *
 * Pure of HTTP: returns a verdict; the route owns the response + audit. The signer key is
 * resolved via the injected `signingKey` seam (same seam the routes re-seal with).
 */
import { verifyLedgerIntegrity, type EvidenceRecord } from '@/lib/evidence';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';

/** The verify-before-reseal verdict: ok, or a fail-closed reason the route maps to 409. */
export type LedgerGuardResult = { ok: true } | { ok: false; kind: 'tamper' | 'signer' };

/**
 * Verify a (possibly sealed) record against its live entries. Unsealed → ok (skip). Sealed
 * → ok only if intact && signed; otherwise `kind:'tamper'`. If the signer seam is
 * unavailable, `kind:'signer'` (fail-closed: no verify/re-seal can run → the route refuses).
 */
export async function verifyLedgerAtRead(
  record: EvidenceRecord,
  ts: string
): Promise<LedgerGuardResult> {
  if (!record.seal) return { ok: true };
  try {
    const verifier = await getSigningKeyLoader().load(ts);
    const v = verifyLedgerIntegrity(record, record.seal, verifier);
    return v.intact && v.signed ? { ok: true } : { ok: false, kind: 'tamper' };
  } catch {
    return { ok: false, kind: 'signer' };
  }
}
