/**
 * SemanticValidator — the stage-4 semantic gate (Iteration 4 terminology seam).
 *
 * Runs ALONGSIDE the structural FhirProfileValidator, never instead of it. After
 * a record is structurally valid, this gate checks its CODES against the
 * TerminologyService: every governed coding (RxNorm / LOINC / SNOMED / ICD-10 /
 * CPT-HCPCS / HCC) must validate. Findings are PHI-safe (system + code + reason,
 * never clinical narrative), so a bad-code record can be quarantined without
 * leaking PHI.
 *
 * Mode (via the `terminology` dataMode seam):
 *   mock / seeded -> the seed allowlist service (demo codes are valid -> demo
 *                    stays green; an unrecognized code is quarantined).
 *   production    -> the not-configured server stub. Codes cannot be verified, so
 *                    the gate FAILS CLOSED: a coded record is quarantined with
 *                    `semantic-terminology-unavailable` rather than admitted
 *                    unverified. (The stub itself still throws when called
 *                    directly, preserving fail-loud for integration code.)
 */
import { getDataMode, type DataMode } from '@/lib/config/dataMode';
import type { NormalizedRecord, ValidationIssue, ValidationResult } from '@/lib/pipeline/types';
import { productionTerminologyService } from './productionTerminologyService';
import { seedTerminologyService } from './seedTerminologyService';
import { validateUcumForLoinc } from './validateCode';
import {
  TerminologyServiceNotConfiguredError,
  SYSTEM_URIS,
  systemForUri,
  type TerminologyService,
  type TerminologySystem,
} from './types';

/** A governed coding found in a record payload (PHI-safe: system + code only). */
export interface GovernedCoding {
  system: TerminologySystem;
  code: string;
  fieldPath: string;
}

/** A LOINC quantitative result paired with its UCUM unit (PHI-safe). */
export interface LoincQuantity {
  code: string;
  unit: string;
  fieldPath: string;
}

const MAX_DEPTH = 6;

const LOINC_URI = SYSTEM_URIS.LOINC;

/** The LOINC code carried directly by an object, via a `loinc` or `code.coding` coding. */
function directLoincCode(obj: Record<string, unknown>): string | undefined {
  const loinc = obj.loinc;
  if (loinc && typeof loinc === 'object') {
    const l = loinc as Record<string, unknown>;
    if (l.system === LOINC_URI && typeof l.code === 'string' && l.code) return l.code;
  }
  const code = obj.code;
  if (code && typeof code === 'object') {
    const coding = (code as Record<string, unknown>).coding;
    if (Array.isArray(coding)) {
      for (const c of coding) {
        if (c && typeof c === 'object') {
          const cc = c as Record<string, unknown>;
          if (cc.system === LOINC_URI && typeof cc.code === 'string' && cc.code) return cc.code;
        }
      }
    }
  }
  return undefined;
}

/** The UCUM unit carried directly by an object (normalized `value.unit` or FHIR `valueQuantity.unit`). */
function directUnit(obj: Record<string, unknown>): string | undefined {
  for (const key of ['value', 'valueQuantity'] as const) {
    const q = obj[key];
    if (q && typeof q === 'object') {
      const unit = (q as Record<string, unknown>).unit;
      if (typeof unit === 'string' && unit) return unit;
    }
  }
  return undefined;
}

/**
 * Collect (LOINC code, UCUM unit) pairs from a payload: an enclosing object that
 * carries BOTH a LOINC coding and a unit is one quantitative result. PHI-safe.
 */
export function extractLoincQuantities(value: unknown, path = 'payload', depth = 0): LoincQuantity[] {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => extractLoincQuantities(v, `${path}[${i}]`, depth + 1));
  }
  const obj = value as Record<string, unknown>;
  const out: LoincQuantity[] = [];
  const code = directLoincCode(obj);
  const unit = directUnit(obj);
  if (code && unit) out.push({ code, unit, fieldPath: path });
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') out.push(...extractLoincQuantities(v, `${path}.${k}`, depth + 1));
  }
  return out;
}

/** Recursively collect governed { system, code } codings from a payload value. */
export function extractGovernedCodings(value: unknown, path = 'payload', depth = 0): GovernedCoding[] {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => extractGovernedCodings(v, `${path}[${i}]`, depth + 1));
  }
  const obj = value as Record<string, unknown>;
  const out: GovernedCoding[] = [];
  const sys = obj.system;
  const code = obj.code;
  if (typeof sys === 'string' && typeof code === 'string' && code) {
    const governed = systemForUri(sys);
    if (governed) out.push({ system: governed, code, fieldPath: path });
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') out.push(...extractGovernedCodings(v, `${path}.${k}`, depth + 1));
  }
  return out;
}

/** The stage-4 semantic gate (mirrors FhirProfileValidator's shape). */
export interface SemanticValidator {
  readonly id: string;
  validate(record: NormalizedRecord): ValidationResult;
}

/** Build a semantic validator over a terminology service. */
export function makeSemanticValidator(service: TerminologyService): SemanticValidator {
  return {
    id: `semantic-validator:${service.id}`,
    validate(record) {
      const issues: ValidationIssue[] = [];
      const codings = extractGovernedCodings(record.payload);
      let unavailable = false;
      for (const c of codings) {
        try {
          const result = service.validateCode(c.system, c.code);
          if (!result.valid) {
            issues.push({
              reasonCode:
                result.status === 'unsupported-system'
                  ? 'semantic-unsupported-system'
                  : result.status === 'retired'
                    ? 'semantic-retired-code'
                    : 'semantic-unrecognized-code',
              fieldPath: c.fieldPath,
            });
          }
        } catch (err) {
          if (err instanceof TerminologyServiceNotConfiguredError) {
            // Fail closed: cannot verify -> quarantine, never admit unverified.
            unavailable = true;
            issues.push({ reasonCode: 'semantic-terminology-unavailable', fieldPath: c.fieldPath });
          } else {
            throw err;
          }
        }
      }
      // UCUM: a LOINC quantitative result whose unit is invalid or inappropriate
      // for the LOINC is a semantic finding. Skipped when the server is
      // unavailable (that record already fails closed above).
      if (!unavailable) {
        for (const q of extractLoincQuantities(record.payload)) {
          const u = validateUcumForLoinc(q.code, q.unit);
          if (u.applicable && !u.valid) {
            issues.push({
              reasonCode:
                u.finding === 'ucum-invalid-unit' ? 'semantic-ucum-invalid-unit' : 'semantic-ucum-unit-not-allowed',
              fieldPath: q.fieldPath,
            });
          }
        }
      }
      return { ok: issues.length === 0, issues };
    },
  };
}

/** The terminology service for the current `terminology` dataMode. */
export function selectTerminologyService(): TerminologyService {
  const mode: DataMode = getDataMode('terminology');
  return mode === 'production' ? productionTerminologyService : seedTerminologyService;
}

/** The stage-4 semantic gate for the current `terminology` dataMode. */
export function selectSemanticValidator(): SemanticValidator {
  return makeSemanticValidator(selectTerminologyService());
}
