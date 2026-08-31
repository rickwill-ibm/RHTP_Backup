/**
 * Minimal patient FHIR data + query helpers for DTR prepopulation.
 *
 * The DTR evaluation is REAL when it reads a patient's FHIR record instead of returning baked-in
 * literals: age from Patient.birthDate, the most-recent BMI from an Observation (LOINC 39156-5), and
 * comorbidities from Condition resources. These pure helpers run a coded query against a bundle and
 * return the matching resource WITH its provenance (effective/recorded date, performer), so the
 * evaluation's evidence is genuinely sourced from the record. Deterministic; no I/O, no framework.
 *
 * Types are a deliberately small subset of FHIR R4 — only the fields the evaluator reads — so this
 * module is self-contained and testable without a FHIR client.
 */

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  birthDate: string; // YYYY-MM-DD
  name?: string;
}

export interface FhirObservation {
  resourceType: 'Observation';
  status: 'final' | 'amended' | 'preliminary' | 'registered' | 'cancelled';
  code: { coding: FhirCoding[] };
  valueQuantity?: { value: number; unit?: string };
  effectiveDateTime?: string; // YYYY-MM-DD
  performerName?: string;
}

export interface FhirCondition {
  resourceType: 'Condition';
  code: { coding: FhirCoding[] };
  clinicalStatus?: 'active' | 'recurrence' | 'relapse' | 'inactive' | 'remission' | 'resolved';
  recordedDate?: string;
  performerName?: string;
}

export type FhirResource = FhirPatient | FhirObservation | FhirCondition;

export interface PatientBundle {
  resourceType: 'Bundle';
  type: 'collection';
  entry: { resource: FhirResource }[];
}

/** Evidence a query found in the record — carried into the evaluation as the group's `leaf`. */
export interface PatientEvidence {
  code: string;
  label: string;
  evidence: string;
  source: 'emr' | 'claims';
  recordedDate?: string;
  performerName?: string;
}

function resources<T extends FhirResource>(bundle: PatientBundle, kind: T['resourceType']): T[] {
  // Guard a malformed/empty bundle — this is a general exported helper, not only fed the fixture.
  return (bundle?.entry ?? [])
    .map((e) => e?.resource)
    .filter((r): r is T => !!r && r.resourceType === kind);
}

/** Active clinical-status values per the FHIR condition-clinical value set (all count as "present"). */
const ACTIVE_STATUS = new Set(['active', 'recurrence', 'relapse']);

/** The patient, or null if the bundle has none. */
export function getPatient(bundle: PatientBundle): FhirPatient | null {
  return resources<FhirPatient>(bundle, 'Patient')[0] ?? null;
}

/** Whole years between birthDate and `asOf` (default: the birthDate's own year is not counted until the
 *  month/day is reached). `asOf` is injected so evaluation is deterministic and testable. */
export function ageInYears(birthDate: string, asOf: Date): number | null {
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = asOf.getUTCFullYear() - b.getUTCFullYear();
  const m = asOf.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}

/** The most-recent final/amended Observation for a LOINC code, with its numeric value + provenance. */
export function latestObservation(
  bundle: PatientBundle,
  loinc: string
): { value: number; unit?: string; date?: string; performerName?: string } | null {
  const obs = resources<FhirObservation>(bundle, 'Observation')
    .filter(
      (o) =>
        (o.status === 'final' || o.status === 'amended') &&
        o.valueQuantity?.value !== undefined &&
        (o.code?.coding ?? []).some((c) => c.system === 'http://loinc.org' && c.code === loinc)
    )
    // most recent by effective date (undated sorts oldest)
    .sort((a, b) => (a.effectiveDateTime ?? '').localeCompare(b.effectiveDateTime ?? ''));
  const last = obs[obs.length - 1];
  if (!last || last.valueQuantity?.value === undefined) return null;
  return {
    value: last.valueQuantity.value,
    unit: last.valueQuantity.unit,
    date: last.effectiveDateTime,
    performerName: last.performerName,
  };
}

/** The first ACTIVE Condition whose code is in `codes` (any of the given systems), with provenance. */
export function findCondition(
  bundle: PatientBundle,
  codes: readonly string[]
): { coding: FhirCoding; recordedDate?: string; performerName?: string } | null {
  const wanted = new Set(codes);
  for (const cond of resources<FhirCondition>(bundle, 'Condition')) {
    const active = !cond.clinicalStatus || ACTIVE_STATUS.has(cond.clinicalStatus);
    if (!active) continue;
    const hit = (cond.code?.coding ?? []).find((c) => wanted.has(c.code));
    if (hit)
      return { coding: hit, recordedDate: cond.recordedDate, performerName: cond.performerName };
  }
  return null;
}

/**
 * A bariatric-relevant patient FHIR record: qualifies on the computable criteria (age ≥ 18, BMI ≥ 40,
 * an obesity-related comorbidity) so DTR prepopulation has real data to read. Maria Redhawk — the same
 * patient the rest of the demo uses — with a BMI Observation and a type-2-diabetes Condition. The
 * documentation-only criteria (pre-op evaluation, treatment plan) are intentionally absent so they
 * surface as gaps, showing the computable-vs-documentation split honestly.
 */
export const bariatricPatientBundle: PatientBundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: 'MARIA_SD_001',
        birthDate: '1982-04-17',
        name: 'Maria Redhawk',
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{ system: 'http://loinc.org', code: '39156-5', display: 'Body mass index' }],
        },
        valueQuantity: { value: 42.3, unit: 'kg/m2' },
        effectiveDateTime: '2026-02-28',
        performerName: 'Dr. James Whitfield MD',
      },
    },
    {
      resource: {
        resourceType: 'Condition',
        code: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: 'E11.9',
              display: 'Type 2 diabetes mellitus without complications',
            },
          ],
        },
        clinicalStatus: 'active',
        recordedDate: '2023-09-14',
        performerName: 'Dr. James Whitfield MD',
      },
    },
  ],
};
