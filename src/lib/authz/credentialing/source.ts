// SEAM: credentialing  (dataMode)
// CONTRACT: C-REVQUAL
/**
 * The `credentialing` data-mode seam — the credentialing system of record, mode-gated.
 *
 * The same fail-closed pattern every sibling seam uses (`identity/provider/directory.ts` is the
 * model): mock/seeded resolve against the in-repo seeded reviewer directory so the demo stays green;
 * production defers to a registered client, and with NONE wired it FAILS CLOSED rather than serving
 * the demo directory dressed up as production data.
 *
 * WHY THE SEAM WRITES `sourceId`, RATHER THAN THE RECORD CARRYING IT. Attestation grade is not a
 * property of a record, it is a property of which resolver produced it. If `sourceId` were a field a
 * caller could set, `'credentialing-system-of-record'` is a string anyone can type — the same
 * self-report hole `api/pa/decision` already confesses for fact provenance, and one that reusing the
 * provenance module would NOT have closed, because `origin` there is also caller-stamped. So the
 * only way to obtain a `CredentialRecord` is to ask this module, and the only way to obtain a
 * `QualifiedReviewer` is to pass one through `assertReviewerQualified`, which mints a token whose
 * brand symbol is not exported.
 *
 * NPPES IS NOT A CREDENTIALING SOURCE, and this is a separate seam for that reason:
 * `identity/provider` answers "does this provider exist and what type are they" from a registry that
 * carries no licence, no expiry, no board certification, no sanction and no exclusion. Overloading
 * `providerIdentity` here would have produced a production gate that checks a taxonomy code and
 * calls it credentialing.
 */
import { getDataMode } from '@/lib/config/dataMode';
import { materializeSeed, SEED_CREDENTIAL_INDEX } from './seedDirectory';
import { CredentialingNotConfiguredError, type CredentialRecord } from './types';

export interface CredentialingSource {
  readonly id: string;
  /**
   * The credentialing record for a reviewer reference, AS AT a point in time, or undefined on a
   * miss. Never invents one.
   *
   * `asOfMs` is not decoration. Point-in-time is the correct credentialing semantics — "what did
   * this reviewer's file say at the moment of the decision" is the question an auditor asks, and a
   * source that can only answer "what does it say now" cannot support a record re-read years later.
   * A real client uses it for a historical read; the seeded one uses it to resolve its offsets.
   */
  lookup(reviewerRef: string, asOfMs: number): CredentialRecord | undefined;
}

/**
 * The seeded source, resolved AS AT the decision time.
 *
 * WHY OFFSETS RATHER THAN FIXED DATES. The seed used absolute timestamps anchored to a constant
 * `SEED_EPOCH_MS` of 2026-06-01, with licences expiring at +365 days and `sourceAsOfMs` at -30 days.
 * The comment claimed this meant the expiries "do not silently become expired as the calendar
 * moves". That was true only of callers pinning `asOfMs` to the epoch — the tests and the demo —
 * and FALSE of every route, which passes `now()`. So on 2027-06-01 every clinical determination on
 * `/api/pa/decision` would have started refusing `licence-expired-at-decision`, and on 2027-06-06
 * every reviewer would have gone `credential-record-stale` on every path. A demo that fails closed
 * on a calendar date, with a 403 saying the reviewer's licence lapsed, and no code change to blame.
 *
 * Resolving offsets against `asOfMs` makes the seed say the same thing in 2026 and in 2030, while
 * the deliberate REFUSAL fixtures keep their negative offsets and go on refusing.
 */
const seededSource: CredentialingSource = Object.freeze({
  id: 'seeded-credentialing-directory',
  lookup(reviewerRef: string, asOfMs: number): CredentialRecord | undefined {
    const rec = SEED_CREDENTIAL_INDEX.get(reviewerRef);
    return rec ? materializeSeed(rec, asOfMs) : undefined;
  },
});

/** Exposed for tests/ops that want the seed directly (never the production path). */
export const seededCredentialingSource: CredentialingSource = seededSource;

let productionSource: CredentialingSource | null = null;

/** Register (or clear, with null) the live credentialing client (composition root / tests). */
export function setProductionCredentialingSource(src: CredentialingSource | null): void {
  productionSource = src;
}

/**
 * Resolve the credentialing source for the configured `credentialing` mode.
 *   mock / seeded -> the seeded synthetic directory (demo stays green, and can walk a refusal).
 *   production    -> the registered client, or throw CredentialingNotConfiguredError (fail closed).
 */
export function getCredentialingSource(): CredentialingSource {
  if (getDataMode('credentialing') === 'production') {
    if (!productionSource) throw new CredentialingNotConfiguredError();
    return productionSource;
  }
  return seededSource;
}
