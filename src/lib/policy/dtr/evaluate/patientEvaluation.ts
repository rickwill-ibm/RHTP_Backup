/**
 * DTR patient evaluation — the runtime that PREPOPULATES documentation status from a patient's FHIR
 * record instead of returning baked-in literals.
 *
 * `evaluateDtr` takes the computable criteria (age / BMI / comorbidity) plus the documentation-gated
 * criteria of a policy and a patient FHIR bundle, and returns the same evaluation shape the PA runtime
 * renders — but every status and every piece of evidence is READ FROM THE RECORD: age from
 * Patient.birthDate, BMI from the latest LOINC 39156-5 Observation, comorbidity from an active
 * Condition. The documentation-only criteria are never auto-satisfied — they surface as gaps the
 * provider must attest/attach, which is the honest computable-vs-documentation split DTR requires.
 * Pure and deterministic (`asOf` is injected, never `Date.now()`).
 */
import {
  ageInYears,
  findCondition,
  getPatient,
  latestObservation,
  type PatientBundle,
  type PatientEvidence,
} from './patientData';

const LOINC_BMI = '39156-5';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';

/** The computable + documentation criteria a policy reduces to — the input to evaluation. Derived from
 *  the authored policy (see `dtrCriteriaFromPolicy.ts`); the same computable subset the CQL emits. */
export interface DtrCriteria {
  policyTitle: string;
  cptCode: string;
  /** Minimum age in years (e.g. 18). */
  minAge?: number;
  /** BMI qualifies at/above `threshold`, or within `band` WITH a comorbidity. */
  bmi?: { threshold: number; band?: { lower: number; upper: number } };
  /** Qualifying obesity-related comorbidity codes (ICD-10) + a human label. */
  comorbidity?: { codes: string[]; label: string };
  /** Criteria that cannot be computed from coded data — provider attests/attaches. */
  documentation: { title: string; description: string; sourceExcerpt?: string }[];
}

export interface DtrGroup {
  id: number;
  title: string;
  status: 'met' | 'gap';
  required: boolean;
  description: string;
  fhirQuery?: {
    resourceType: string;
    searchParam: string;
    system: string;
    codes: string[];
    valueComparison?: string;
  };
  sourceExcerpt?: string;
  leaf?: PatientEvidence;
  candidateCodes?: { code: string; system: string; label: string }[];
}

export interface DtrEvaluation {
  policyTitle: string;
  cptCode: string;
  /** The patient actually evaluated (from the bundle). */
  patientId?: string;
  allMet: boolean;
  groups: DtrGroup[];
}

/**
 * Evaluate one policy's criteria against one patient bundle. Every computable group's status and
 * evidence is read from the record; documentation groups stay `gap`. `allMet` is true only when every
 * REQUIRED group is met — so a policy whose documentation is unfilled correctly reads "not yet met".
 */
export function evaluateDtr(
  criteria: DtrCriteria,
  bundle: PatientBundle,
  asOf: Date
): DtrEvaluation {
  const patient = getPatient(bundle);
  const groups: DtrGroup[] = [];
  let id = 0;

  if (criteria.minAge !== undefined) {
    const age = patient ? ageInYears(patient.birthDate, asOf) : null;
    const met = age !== null && age >= criteria.minAge;
    groups.push({
      id: ++id,
      title: `Member age ≥ ${criteria.minAge} years`,
      status: met ? 'met' : 'gap',
      required: true,
      description: `The member must be at least ${criteria.minAge} years old.`,
      fhirQuery: { resourceType: 'Patient', searchParam: 'birthDate', system: '', codes: [] },
      leaf:
        patient && age !== null
          ? {
              code: 'Patient.birthDate',
              label: `Age ${age}`,
              evidence: `DOB ${patient.birthDate} → ${age} years as of ${asOf.toISOString().slice(0, 10)}`,
              source: 'emr',
            }
          : undefined,
    });
  }

  // BMI facts, computed once and shared with the comorbidity group so "is a comorbidity REQUIRED?"
  // depends on whether this patient already cleared the ≥ threshold on BMI alone.
  const bmiObs = criteria.bmi ? latestObservation(bundle, LOINC_BMI) : null;
  const bmiClearsThreshold =
    !!criteria.bmi && bmiObs?.value !== undefined && bmiObs.value >= criteria.bmi.threshold;

  if (criteria.bmi) {
    const obs = bmiObs;
    const comorbid = criteria.comorbidity
      ? findCondition(bundle, criteria.comorbidity.codes)
      : null;
    const v = obs?.value;
    const band = criteria.bmi.band;
    const met =
      v !== undefined &&
      (v >= criteria.bmi.threshold || (!!band && v >= band.lower && v < band.upper && !!comorbid));
    const bandTxt = band
      ? ` (or ${band.lower}–${band.upper} kg/m² with a qualifying comorbidity)`
      : '';
    groups.push({
      id: ++id,
      title: `BMI ≥ ${criteria.bmi.threshold} kg/m²${bandTxt}`,
      status: met ? 'met' : 'gap',
      required: true,
      description: `Body mass index must be ≥ ${criteria.bmi.threshold} kg/m²${bandTxt}.`,
      fhirQuery: {
        resourceType: 'Observation',
        searchParam: 'code',
        system: 'http://loinc.org',
        codes: [LOINC_BMI],
        valueComparison: `>= ${criteria.bmi.threshold}`,
      },
      leaf: obs
        ? {
            code: 'LOINC 39156-5',
            label: `BMI ${obs.value}${obs.unit ? ' ' + obs.unit : ''}`,
            evidence: `Most recent BMI ${obs.value} recorded ${obs.date ?? 'undated'}`,
            source: 'emr',
            recordedDate: obs.date,
            performerName: obs.performerName,
          }
        : undefined,
    });
  }

  if (criteria.comorbidity) {
    const c = findCondition(bundle, criteria.comorbidity.codes);
    groups.push({
      id: ++id,
      title: `Obesity-related comorbidity — ${criteria.comorbidity.label}`,
      // Required only when the band is this patient's ONLY path to BMI qualification — i.e. a band
      // exists AND their BMI did not already clear the ≥ threshold. A BMI ≥ 40 patient needs no comorbidity.
      required: !!criteria.bmi?.band && !bmiClearsThreshold,
      status: c ? 'met' : 'gap',
      description: `A qualifying obesity-related comorbid condition (${criteria.comorbidity.label}).`,
      fhirQuery: {
        resourceType: 'Condition',
        searchParam: 'code',
        system: ICD10,
        codes: criteria.comorbidity.codes,
      },
      leaf: c
        ? {
            code: c.coding.code,
            label: c.coding.display ?? c.coding.code,
            evidence: `Active diagnosis ${c.coding.display ?? c.coding.code}${c.recordedDate ? ' since ' + c.recordedDate : ''}`,
            source: 'emr',
            recordedDate: c.recordedDate,
            performerName: c.performerName,
          }
        : undefined,
      candidateCodes: c
        ? undefined
        : criteria.comorbidity.codes.map((code) => ({
            code,
            system: ICD10,
            label: criteria.comorbidity!.label,
          })),
    });
  }

  for (const doc of criteria.documentation) {
    groups.push({
      id: ++id,
      title: doc.title,
      status: 'gap', // documentation is never auto-satisfied from coded data
      required: true,
      description: doc.description,
      sourceExcerpt: doc.sourceExcerpt,
    });
  }

  const allMet = groups.every((g) => !g.required || g.status === 'met');
  return {
    policyTitle: criteria.policyTitle,
    cptCode: criteria.cptCode,
    patientId: patient?.id,
    allMet,
    groups,
  };
}
