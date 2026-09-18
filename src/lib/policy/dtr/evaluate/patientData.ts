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

/**
 * Accepted alternate LOINC codes per measure field. A single canonical code (in MEASURE_LOINC) misses
 * real records that code the same concept differently — eGFR is `33914-3` OR `62238-1`/`48642-3`/…,
 * LDL direct vs calculated, HbA1c NGSP vs IFCC. Matching the SET keeps a genuine result from reading as
 * "no result on file". Canonical-only fields fall back to their MEASURE_LOINC code in `latestObservation`.
 */
export const MEASURE_LOINC_ALIASES: Record<string, readonly string[]> = {
  egfr: ['33914-3', '62238-1', '48642-3', '48643-1', '98979-8', '88293-6', '77147-7', '69405-9'],
  ldl: ['18262-6', '13457-7', '2089-1', '55440-2'],
  hdl: ['2085-9'],
  hba1c: ['4548-4', '17856-6', '59261-8', '4549-2'],
  // GENERIC glucose only. Deliberately EXCLUDES specimen-/fasting-specific codes (fasting 1558-6,
  // capillary-glucometer 41653-7): those carry different decision thresholds (fasting ≥126 diagnoses
  // diabetes; a random reading does not) yet report in the same mg/dL, so the unit guard cannot tell
  // them apart — folding them in would let a random glucose satisfy a fasting-glucose gate.
  glucose: ['2339-0', '2345-7'],
  totalCholesterol: ['2093-3'],
  triglycerides: ['2571-8', '3043-7'],
  lvef: ['10230-1', '8806-2', '18043-0', '79991-4'],
  systolicBP: ['8480-6'],
  diastolicBP: ['8462-4'],
  bmi: ['39156-5'],
  weight: ['29463-7', '3141-9'],
  height: ['8302-2', '3137-7'],
};

/** The most-recent final/amended Observation matching ANY of `codes` (LOINC), with value + provenance. */
export function latestObservationAny(
  bundle: PatientBundle,
  codes: readonly string[]
): {
  value: number;
  unit?: string;
  date?: string;
  performerName?: string;
  matchedCode?: string;
} | null {
  const wanted = new Set(codes);
  let matchedCode: string | undefined;
  const obs = resources<FhirObservation>(bundle, 'Observation')
    .filter((o) => {
      if (!(o.status === 'final' || o.status === 'amended')) return false;
      if (o.valueQuantity?.value === undefined) return false;
      const hit = (o.code?.coding ?? []).find(
        (c) => c.system === 'http://loinc.org' && wanted.has(c.code)
      );
      if (hit) matchedCode = hit.code;
      return !!hit;
    })
    // most recent by effective date (undated sorts oldest)
    .sort((a, b) => (a.effectiveDateTime ?? '').localeCompare(b.effectiveDateTime ?? ''));
  const last = obs[obs.length - 1];
  if (!last || last.valueQuantity?.value === undefined) return null;
  const matched = (last.code?.coding ?? []).find(
    (c) => c.system === 'http://loinc.org' && wanted.has(c.code)
  )?.code;
  return {
    value: last.valueQuantity.value,
    unit: last.valueQuantity.unit,
    date: last.effectiveDateTime,
    performerName: last.performerName,
    matchedCode: matched ?? matchedCode,
  };
}

/** The most-recent final/amended Observation for a single LOINC code, with its numeric value +
 *  provenance. (Thin wrapper over `latestObservationAny` for the age/BMI callers that pin one code.) */
export function latestObservation(
  bundle: PatientBundle,
  loinc: string
): { value: number; unit?: string; date?: string; performerName?: string } | null {
  return latestObservationAny(bundle, [loinc]);
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

/**
 * A NON-bariatric sample record — a cardio-renal patient — used to prove the DTR evaluator reads
 * ARBITRARY LOINC-coded measures from the record, not just age/BMI. Carries a low LVEF (30 %, LOINC
 * 10230-1), a low eGFR (22 mL/min/1.73m², LOINC 33914-3) and an elevated HbA1c (8.2 %, LOINC 4548-4),
 * each with provenance. This bundle is a TEST/DEMO fixture that shows a computable gate flipping
 * met/gap purely from the coded value the record carries — the honest proof behind "evaluates live".
 * It is not wired to any registered policy PDF (registering a second live policy still needs its own
 * PDF asset); it exists so the generic engine's behaviour is provable against real FHIR reads.
 */
export const cardioRenalPatientBundle: PatientBundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: 'DEVON_CR_002',
        birthDate: '1958-11-03',
        name: 'Devon Carter',
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '10230-1',
              display: 'Left ventricular ejection fraction',
            },
          ],
        },
        valueQuantity: { value: 30, unit: '%' },
        effectiveDateTime: '2026-06-12',
        performerName: 'Dr. Priya Nair MD',
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '33914-3', display: 'eGFR' }] },
        valueQuantity: { value: 22, unit: 'mL/min/1.73m2' },
        effectiveDateTime: '2026-06-12',
        performerName: 'Dr. Priya Nair MD',
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' }],
        },
        valueQuantity: { value: 8.2, unit: '%' },
        effectiveDateTime: '2026-05-30',
        performerName: 'Dr. Priya Nair MD',
      },
    },
  ],
};
