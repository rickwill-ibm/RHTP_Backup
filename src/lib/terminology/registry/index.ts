/**
 * Terminology-asset registry — public surface (Iteration 4).
 *
 * The ValueSetRegistry is the FACILITY that manages the currency, versioning, and
 * lifecycle of every governed value set / code system / classification / ontology
 * across families (clinical, risk, quality, behavioral, social, privacy). The
 * registry + seed metadata + currency logic are real-now; live refresh/fetch from
 * external authorities (VSAC/CMS/Gravity/NLM) is the not-configured stub.
 */
export {
  ASSET_FAMILIES,
  ASSET_STATUSES,
  BINDING_STRENGTHS,
  REFRESH_CADENCES,
  CADENCE_DAYS,
} from './assetTypes';
export type {
  AssetFamily,
  AssetStatus,
  BindingStrength,
  RefreshCadence,
  TerminologyAsset,
  BindingSpec,
  ResolvedBinding,
  CurrencyFlag,
  AssetRegistrySeed,
} from './assetTypes';
export {
  createValueSetRegistry,
  valueSetRegistry,
  TerminologyRefreshNotConfiguredError,
  type ValueSetRegistry,
  type RegistryOptions,
  type Clock,
} from './valueSetRegistry';

import type { CodeValidation, TerminologyService, TerminologySystem } from '../types';
import type { CurrencyFlag } from './assetTypes';
import type { ValueSetRegistry } from './valueSetRegistry';

/** A code validation paired with the currency verdict of the version it was checked against. */
export interface CurrencyCheckedValidation {
  validation: CodeValidation;
  currency: CurrencyFlag;
}

/**
 * Validate a code AND flag currency against a SPECIFIC asset version. Use this to
 * detect a code validated against a retired/superseded value-set version: the
 * code may be structurally valid, yet `currency.flagged` is true because the
 * version it was bound to is no longer current. Deterministic via `asOf`.
 */
export function validateAgainstAssetVersion(
  service: TerminologyService,
  registry: ValueSetRegistry,
  assetId: string,
  system: TerminologySystem | string,
  code: string,
  asOf?: Date
): CurrencyCheckedValidation {
  const validation = service.validateCode(system, code);
  const currency = registry.checkCurrency(assetId, asOf);
  return { validation, currency };
}

// ── I8A-ii Wave C (value-set version currency enforcement) — appended block ────
// Turns the registry's currency verdict into an enforcement decision: a bound
// version that is expired / superseded / retired / stale is flagged, and under
// the `enforce` posture it quarantines rather than validating against a stale set.
export {
  CURRENCY_POSTURES,
  CURRENCY_REASONS,
  currencyReasonForFlag,
  decideAssetCurrency,
  decideSystemCurrency,
  decideBindingCurrency,
  type CurrencyPosture,
  type CurrencyReason,
  type CurrencyDecision,
} from './currency';
