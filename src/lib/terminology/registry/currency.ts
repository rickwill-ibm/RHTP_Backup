/**
 * Value-set version CURRENCY enforcement (Iteration 8A-ii, Wave C).
 *
 * The ValueSetRegistry already answers WHETHER a bound value-set version is
 * current (checkCurrency / getActiveBySystem / listBindings). This module turns
 * that verdict into an ENFORCEMENT DECISION for the semantic pipeline binding:
 * a binding whose bound version is expired / superseded / retired / past its
 * refresh cadence is FLAGGED, and under the strict (production) posture it
 * QUARANTINES rather than validating a code against a stale set.
 *
 * E9 (fail-open sweep): a stale value-set version must NOT silently validate.
 * The `enforce` posture is the fail-closed answer - a not-current binding
 * quarantines; the `flag` posture surfaces the flag but admits (keeps the demo
 * green). The choice is the CALLER's, never assumed.
 *
 * Pure + deterministic: every decision is a function of (registry, id/system,
 * posture, asOf). No clock is read here; the caller injects `asOf`. This REUSES
 * the registry's window/version/cadence math - it does not reimplement it.
 */
import type { CurrencyFlag } from './assetTypes';
import type { ValueSetRegistry } from './valueSetRegistry';

/** How strictly a stale / expired / superseded binding is handled. */
export type CurrencyPosture = 'enforce' | 'flag';
export const CURRENCY_POSTURES = Object.freeze(['enforce', 'flag'] as const);

/** PHI-safe reason codes a currency decision can carry (pipeline quarantine reasons). */
export const CURRENCY_REASONS = Object.freeze({
  expired: 'semantic-valueset-expired',
  superseded: 'semantic-valueset-superseded',
  retired: 'semantic-valueset-retired',
  stale: 'semantic-valueset-stale',
  notEffective: 'semantic-valueset-not-effective',
  unregistered: 'semantic-valueset-unregistered',
  noActiveVersion: 'semantic-valueset-no-active-version',
} as const);
export type CurrencyReason = (typeof CURRENCY_REASONS)[keyof typeof CURRENCY_REASONS];

/** The enforcement decision for one bound version at a point in time. */
export interface CurrencyDecision {
  /** The asset version the decision was made against, or a marker when none resolved. */
  assetId: string;
  /** The registry's raw currency verdict (present when an asset version was resolved). */
  flag?: CurrencyFlag;
  /** true when the bound version is not current or is stale (should be surfaced). */
  flagged: boolean;
  /** true when, under the posture, this must QUARANTINE (never validate a stale set). */
  quarantine: boolean;
  /** PHI-safe reason code when flagged / quarantined. */
  reasonCode?: CurrencyReason;
}

/**
 * Map a registry CurrencyFlag to a PHI-safe currency reason code. Returns
 * undefined only when the version is fully current (in window, active, fresh).
 */
export function currencyReasonForFlag(flag: CurrencyFlag): CurrencyReason | undefined {
  if (flag.current && !flag.stale) return undefined;
  if (flag.reason === 'asset not registered') return CURRENCY_REASONS.unregistered;
  if (flag.status === 'retired') return CURRENCY_REASONS.retired;
  if (flag.status === 'superseded') return CURRENCY_REASONS.superseded;
  if (!flag.current) {
    if (flag.reason && flag.reason.includes('not yet effective'))
      return CURRENCY_REASONS.notEffective;
    return CURRENCY_REASONS.expired;
  }
  // Current + in window, but past its refresh cadence.
  return CURRENCY_REASONS.stale;
}

/**
 * Decide currency for one SPECIFIC asset version (by id). This checks the exact
 * version, so a binding pinned to a superseded / expired version is caught even
 * when a newer active version of the same logical asset exists.
 */
export function decideAssetCurrency(
  registry: ValueSetRegistry,
  assetId: string,
  posture: CurrencyPosture,
  asOf?: Date
): CurrencyDecision {
  const flag = registry.checkCurrency(assetId, asOf);
  const flagged = flag.flagged;
  return {
    assetId,
    flag,
    flagged,
    quarantine: posture === 'enforce' && flagged,
    reasonCode: flagged ? currencyReasonForFlag(flag) : undefined,
  };
}

/**
 * Decide currency for a code SYSTEM (a coding.system URI). Resolves the active
 * in-window version for that system and checks it; when the system has NO active
 * version at `asOf` (every version expired / superseded), the bound set is not
 * current, so the decision is flagged (and quarantines under `enforce`).
 */
export function decideSystemCurrency(
  registry: ValueSetRegistry,
  systemUri: string,
  posture: CurrencyPosture,
  asOf?: Date
): CurrencyDecision {
  const active = registry.getActiveBySystem(systemUri, asOf);
  if (active) return decideAssetCurrency(registry, active.id, posture, asOf);
  return {
    assetId: `(no-active-version:${systemUri})`,
    flagged: true,
    quarantine: posture === 'enforce',
    reasonCode: CURRENCY_REASONS.noActiveVersion,
  };
}

/**
 * Decide currency for a (domain, purpose) BINDING, against the version the
 * binding is PINNED to (BindingSpec.assetId), not a re-resolved active one. This
 * is how a binding "whose bound version is expired / superseded" is detected.
 * Returns undefined when no such binding is registered.
 */
export function decideBindingCurrency(
  registry: ValueSetRegistry,
  domain: string,
  purpose: string,
  posture: CurrencyPosture,
  asOf?: Date
): CurrencyDecision | undefined {
  const spec = registry.listBindings().find((b) => b.domain === domain && b.purpose === purpose);
  if (!spec) return undefined;
  return decideAssetCurrency(registry, spec.assetId, posture, asOf);
}
