/**
 * UCUM unit validation for LOINC quantitative results (I8A-ii wave A).
 *
 * A LOINC quantitative result carries a numeric value AND a unit. Two things must
 * hold: the unit is a well-formed UCUM unit, AND it is appropriate for that LOINC
 * (mm[Hg] for a blood pressure, not mg/dL). Either failure is a SEMANTIC finding.
 *
 * This is a seeded stub: `validUnits` is an allowlist of well-formed UCUM atoms
 * (a real UCUM service parses the full grammar) and `loincUnits` maps a
 * quantitative LOINC to its appropriate units. A LOINC absent from `loincUnits`
 * is treated as non-quantitative (no unit check applies). PHI-free.
 */
import seed from '../data/terminology-seed.json';

interface UcumSeed {
  ucum?: { validUnits: string[]; loincUnits: Record<string, string[]> };
}

const U = (seed as unknown as UcumSeed).ucum ?? { validUnits: [], loincUnits: {} };

export type UcumFinding = 'ucum-invalid-unit' | 'ucum-unit-not-allowed-for-loinc';

export interface UcumValidation {
  loinc: string;
  unit: string;
  /** false when this LOINC is not a quantitative code we govern units for. */
  applicable: boolean;
  valid: boolean;
  finding?: UcumFinding;
  /** The units appropriate for this LOINC, when applicable. */
  allowed?: string[];
  stub: boolean;
}

/** True when `unit` is a well-formed UCUM unit (seeded allowlist). */
export function isValidUcumUnit(unit: string): boolean {
  return U.validUnits.includes(unit);
}

/** The units appropriate for a quantitative LOINC, or undefined when not governed. */
export function allowedUnitsForLoinc(loinc: string): string[] | undefined {
  return U.loincUnits[loinc];
}

/** Validate a unit for a LOINC quantitative result. */
export function validateUcumForLoinc(loinc: string, unit: string): UcumValidation {
  const allowed = U.loincUnits[loinc];
  if (!allowed) {
    return { loinc, unit, applicable: false, valid: true, stub: true };
  }
  if (!isValidUcumUnit(unit)) {
    return {
      loinc,
      unit,
      applicable: true,
      valid: false,
      finding: 'ucum-invalid-unit',
      allowed,
      stub: true,
    };
  }
  if (!allowed.includes(unit)) {
    return {
      loinc,
      unit,
      applicable: true,
      valid: false,
      finding: 'ucum-unit-not-allowed-for-loinc',
      allowed,
      stub: true,
    };
  }
  return { loinc, unit, applicable: true, valid: true, allowed, stub: true };
}
