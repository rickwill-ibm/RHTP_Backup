/**
 * Consent status derivation — the SINGLE source of truth for whether a consent is live.
 *
 * INVARIANT: a consent's status is DERIVED from its lifecycle dates against an injected
 * `now`. It is never stored, never hardcoded, and never read from a literal on a screen.
 * A stored status is a fail-open: it keeps reading ACTIVE after the grant has lapsed, and
 * the surface whose whole job is to prove consent is honoured then authorises a disclosure
 * under a consent that expired months ago.
 *
 * Precedence (highest first) — each rung is fail-CLOSED, i.e. the absence or corruption of
 * positive evidence never yields ACTIVE:
 *   1. revoked        → REVOKED   (a revocation we cannot date is still a revocation)
 *   2. not granted    → PENDING   (absent OR unparseable grant date: no proven grant)
 *   3. expiry passed  → EXPIRED   (boundary: expiry AT `now` is EXPIRED — see below)
 *   4. otherwise      → ACTIVE
 *
 * BOUNDARY: expiry `<= now` is EXPIRED; `now + 1ms` is ACTIVE. This matches the existing
 * repo convention in `part2Consent.ts` (`expiresAt <= nowIso` → not permitted). A consent
 * is live for the whole of its period and lapses the instant the period ends.
 *
 * EXPIRY SEMANTICS:
 *   • absent (null)      → open-ended grant, no end instant to pass → ACTIVE.
 *                          FHIR `Consent.provision.period.end` is genuinely optional, so
 *                          absence means "no end", not "unknown end".
 *   • unparseable        → EXPIRED (fail-closed). A placeholder such as '—' or 'TBD' is
 *                          NOT evidence of an in-force period; it must never badge ACTIVE.
 *
 * Pure: no wall-clock is read here. `nowIso` is supplied by the caller from
 * `@/lib/clock` (`nowIso()`), so tests pin the instant without mocking globals.
 */

export type ConsentStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'PENDING';

/** The statuses a consent surface may filter or tile on, in display order. */
export const CONSENT_STATUSES: readonly ConsentStatus[] = [
  'ACTIVE',
  'REVOKED',
  'EXPIRED',
  'PENDING',
] as const;

/** The dated facts a consent record carries. `null` means the fact is absent. */
export interface ConsentLifecycle {
  grantedDate: string | null;
  expiresDate: string | null;
  revokedDate: string | null;
}

type Instant = { kind: 'absent' } | { kind: 'unparseable' } | { kind: 'at'; ms: number };

/**
 * Classify a date field into absent / unparseable / a definite instant. Deliberately
 * three-valued: "no date" and "a date we cannot read" drive DIFFERENT rungs above, so
 * collapsing them with a `??` default would reintroduce the fail-open.
 */
function parseInstant(value: string | null | undefined): Instant {
  if (value === null || value === undefined) return { kind: 'absent' };
  const trimmed = value.trim();
  if (trimmed === '') return { kind: 'absent' };
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return { kind: 'unparseable' };
  return { kind: 'at', ms };
}

/** True when the record carries a positive, parseable grant instant. */
export function isGranted(lifecycle: ConsentLifecycle): boolean {
  return parseInstant(lifecycle.grantedDate).kind === 'at';
}

/**
 * Derive the consent's status as of `nowIso`. Throws when `nowIso` is not a parseable
 * instant — an unreadable clock must fail loudly, never silently badge everything ACTIVE.
 */
export function deriveConsentStatus(lifecycle: ConsentLifecycle, nowIso: string): ConsentStatus {
  const now = parseInstant(nowIso);
  if (now.kind !== 'at') {
    throw new Error(`deriveConsentStatus: nowIso is not a parseable instant: ${String(nowIso)}`);
  }
  // 1. Revoked beats everything — including an expiry that has not yet passed.
  if (parseInstant(lifecycle.revokedDate).kind !== 'absent') return 'REVOKED';
  // 2. No proven grant → PENDING (absent or unparseable grant date).
  if (!isGranted(lifecycle)) return 'PENDING';
  // 3/4. Expiry against the injected clock.
  const expiry = parseInstant(lifecycle.expiresDate);
  if (expiry.kind === 'unparseable') return 'EXPIRED';
  if (expiry.kind === 'absent') return 'ACTIVE';
  if (expiry.ms <= now.ms) return 'EXPIRED';
  return 'ACTIVE';
}

/** A record with its derived status attached. */
export type WithConsentStatus<T> = T & { status: ConsentStatus };

/** Zero counts for every status — the starting point for a tile strip. */
function emptyCounts(): Record<ConsentStatus, number> {
  return { ACTIVE: 0, REVOKED: 0, EXPIRED: 0, PENDING: 0 };
}

/**
 * The ONE derivation a consent surface calls: every record gains its derived status and the
 * tile counts are tallied from those SAME records. Tiles and table cannot disagree, because
 * there is only one traversal and one clock reading behind both.
 */
export function deriveConsentView<T extends ConsentLifecycle>(
  records: readonly T[],
  nowIso: string
): { records: WithConsentStatus<T>[]; counts: Record<ConsentStatus, number>; asOf: string } {
  const counts = emptyCounts();
  const derived = records.map((record) => {
    const status = deriveConsentStatus(record, nowIso);
    counts[status] += 1;
    return { ...record, status };
  });
  return { records: derived, counts, asOf: nowIso };
}
