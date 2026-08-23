/**
 * Stage-4 profile-validation gate seam (U2 fix).
 *
 * This is the sibling of the terminology semantic gate (lib/terminology/
 * semanticValidator.ts) and follows its production-fail-closed pattern EXACTLY.
 *
 * IMPORTANT — what each validator actually is:
 *   - `structuralProfileValidator` is a fast STRUCTURAL pre-flight only. It checks
 *     that a handful of fields are present (subject / type / id / non-empty
 *     payload). It is NOT US Core profile `$validate`: it does not check
 *     cardinality, must-support elements, reference integrity, or required-binding
 *     value sets. It exists so the demo has a cheap shape check; it must never be
 *     mistaken for real profile conformance.
 *   - `productionProfileValidator` is the HONEST STUB for the real US Core
 *     `$validate` gate. Until a HAPI/Inferno `$validate` backend is wired it
 *     FAILS CLOSED: every record is quarantined with `profile-validation-
 *     unavailable` rather than admitted as "profile valid". This mirrors the
 *     semantic gate, which quarantines with `semantic-terminology-unavailable`
 *     when the production terminology server is not configured.
 *
 * Mode (via the `profileValidation` dataMode seam):
 *   mock / seeded -> structural pre-flight (demo stays green).
 *   production    -> fail closed until a real `$validate` backend is wired.
 */
import { getDataMode } from '@/lib/config/dataMode';
import type { NormalizedRecord, ValidationResult } from './types';

/** US Core / profile `$validate` gate seam (§4A stage 4). */
export interface FhirProfileValidator {
  readonly id: string;
  validate(record: NormalizedRecord): ValidationResult;
}

/**
 * Thrown by the not-yet-configured production profile validator when invoked
 * directly (fail-loud for integration code). The gate below catches it and turns
 * it into a fail-closed quarantine, exactly like TerminologyServiceNotConfigured.
 */
export class ProfileValidatorNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE profileValidation=production: no US Core $validate backend is wired yet. ' +
        'Wire HAPI/Inferno $validate here (SEAM: profileValidation) or set ' +
        'DATA_MODE_PROFILE_VALIDATION=seeded to use the structural pre-flight.'
    );
    this.name = 'ProfileValidatorNotConfiguredError';
  }
}

/**
 * Structural pre-flight ONLY — not US Core `$validate`. Kept for mock/seeded so
 * the demo's cheap shape check is unchanged. (Was `defaultProfileValidator` /
 * id `structural-profile-validator`; renamed so it can't be read as the profile
 * gate itself.)
 */
export const structuralProfileValidator: FhirProfileValidator = {
  id: 'structural-preflight-not-us-core-validate',
  validate(record) {
    const issues: ValidationResult['issues'] = [];
    if (!record.memberId) issues.push({ reasonCode: 'profile-missing-subject', fieldPath: 'memberId' });
    if (!record.resourceType) issues.push({ reasonCode: 'profile-missing-type', fieldPath: 'resourceType' });
    if (!record.fhirResourceId) issues.push({ reasonCode: 'profile-missing-id', fieldPath: 'fhirResourceId' });
    if (!record.payload || Object.keys(record.payload).length === 0)
      issues.push({ reasonCode: 'profile-empty-payload', fieldPath: 'payload' });
    return { ok: issues.length === 0, issues };
  },
};

/** The real US Core `$validate` service seam — honest stub, throws until wired. */
export interface ProfileValidationService {
  readonly id: string;
  validate(record: NormalizedRecord): ValidationResult;
}

export const productionProfileValidationService: ProfileValidationService = {
  id: 'us-core-validate-server',
  validate(): ValidationResult {
    throw new ProfileValidatorNotConfiguredError();
  },
};

/**
 * The production profile gate: cannot verify a profile, so it FAILS CLOSED —
 * every record is quarantined with `profile-validation-unavailable` rather than
 * admitted unverified. Mirrors selectSemanticValidator()'s fail-closed branch.
 */
export const productionProfileValidator: FhirProfileValidator = {
  id: 'us-core-profile-validator:fail-closed',
  validate(record) {
    try {
      return productionProfileValidationService.validate(record);
    } catch (err) {
      if (err instanceof ProfileValidatorNotConfiguredError) {
        return { ok: false, issues: [{ reasonCode: 'profile-validation-unavailable', fieldPath: 'payload' }] };
      }
      throw err;
    }
  },
};

/** Back-compat alias — the structural pre-flight (mock/seeded default). */
export const defaultProfileValidator = structuralProfileValidator;

/** The stage-4 profile validator for the current `profileValidation` dataMode. */
export function selectProfileValidator(): FhirProfileValidator {
  return getDataMode('profileValidation') === 'production'
    ? productionProfileValidator
    : structuralProfileValidator;
}
