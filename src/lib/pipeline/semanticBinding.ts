/**
 * Stage-4 semantic gate BOUND at transform (Iteration 8A-ii, Wave C).
 *
 * The code-carrying domains (medications, labs/vitals, behavioral-health,
 * procedures, immunizations) run their governed codings through the SAME stage-4
 * semantic gate at TRANSFORM time, so an unverified or RETIRED code is quarantined
 * before it is ever normalized into the record set - not admitted and caught only
 * later, and never silently. This REUSES the semanticValidator (the existing gate
 * built from validateCode / UCUM); it does NOT duplicate any validation logic.
 *
 * It ALSO enforces value-set CURRENCY: a coding whose bound value-set version is
 * expired / superseded / retired / stale is flagged, and under the strict
 * (production) posture it QUARANTINES rather than validating against a stale set
 * (E9: a stale value-set version must NOT silently validate).
 *
 * PHI-safe: every finding is a reason code + field path, never a code display or
 * clinical narrative. Deterministic: the caller injects the clock (asOf via
 * `now`) and may inject the validator / registry / posture (tests pin all three).
 */
import { getDataMode } from '@/lib/config/dataMode';
import {
  SYSTEM_URIS,
  extractGovernedCodings,
  selectSemanticValidator,
  valueSetRegistry,
  type SemanticValidator,
  type ValueSetRegistry,
} from '@/lib/terminology';
import { decideSystemCurrency, type CurrencyPosture } from '@/lib/terminology/registry/currency';
import type { NormalizedRecord, ValidationIssue, ValidationResult, WpcDomain } from './types';

/** The domains whose payloads carry governed clinical codes - bind the gate here. */
export const CODE_CARRYING_DOMAINS: readonly WpcDomain[] = Object.freeze([
  'medications',
  'labs-vitals',
  'behavioral-health',
  'procedures',
  'immunizations',
  // ── Iteration 11 Wave B (append-only): the coded problem-list domain. Its
  // ICD-10-CM + SNOMED-CT (+ CMS-HCC) codings run the same stage-4 semantic gate.
  'conditions',
]);

/** True when a domain carries governed codes and must run the semantic binding. */
export function isCodeCarryingDomain(domain: WpcDomain): boolean {
  return CODE_CARRYING_DOMAINS.includes(domain);
}

/**
 * The value-set currency posture for the current deployment. `enforce` quarantines
 * a stale / expired / superseded binding (fail closed); `flag` surfaces it but
 * admits, keeping the demo green. Resolved from TERMINOLOGY_CURRENCY_POSTURE, else
 * the `terminology` data mode (production -> enforce), else `flag`. The pipeline
 * binding can override it per call (deterministic tests inject the posture).
 */
export function currencyPostureFromConfig(): CurrencyPosture {
  const env = typeof process !== 'undefined' && process.env ? process.env.TERMINOLOGY_CURRENCY_POSTURE : undefined;
  if (env === 'enforce' || env === 'flag') return env;
  return getDataMode('terminology') === 'production' ? 'enforce' : 'flag';
}

/** Injection points for the transform-time semantic binding (all defaulted). */
export interface SemanticBindingOptions {
  /** The stage-4 gate to reuse. Defaults to selectSemanticValidator() (the seam). */
  validator?: SemanticValidator;
  /** The value-set registry consulted for currency. Defaults to the process registry. */
  registry?: ValueSetRegistry;
  /** Currency posture. Defaults to currencyPostureFromConfig(). */
  posture?: CurrencyPosture;
  /** Injected clock (epoch millis) for the currency asOf. */
  now?: () => number;
}

/**
 * Run the stage-4 semantic gate + value-set currency enforcement over one
 * normalized record's governed codings. Returns a PHI-safe ValidationResult:
 * `ok:false` means the record must be quarantined - a bad / unrecognized /
 * retired code, or (under the enforce posture) a stale bound value-set version.
 *
 * The semantic verdict comes entirely from the injected/selected SemanticValidator
 * (no duplicated validateCode logic); currency reuses the registry's own math.
 */
export function bindSemantics(record: NormalizedRecord, opts: SemanticBindingOptions = {}): ValidationResult {
  const validator = opts.validator ?? selectSemanticValidator();
  const issues: ValidationIssue[] = [...validator.validate(record).issues];

  const registry = opts.registry ?? valueSetRegistry;
  const posture = opts.posture ?? currencyPostureFromConfig();
  const asOf = opts.now ? new Date(opts.now()) : undefined;
  const checkedSystems = new Set<string>();
  for (const coding of extractGovernedCodings(record.payload)) {
    const systemUri = SYSTEM_URIS[coding.system];
    if (checkedSystems.has(systemUri)) continue;
    checkedSystems.add(systemUri);
    const decision = decideSystemCurrency(registry, systemUri, posture, asOf);
    if (decision.quarantine && decision.reasonCode) {
      issues.push({ reasonCode: decision.reasonCode, fieldPath: coding.fieldPath });
    }
  }
  return { ok: issues.length === 0, issues };
}
