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
  latestObservationAny,
  MEASURE_LOINC_ALIASES,
  type PatientBundle,
  type PatientEvidence,
} from './patientData';
// Reuse the REAL policy-engine primitives (three-valued, fail-closed, inclusivity- and
// thresholdVariant-aware) — never a parallel comparator. Deep-module imports so a client import chain
// never drags the encode barrel's server-only siblings (publish/author use node:*).
import { evalMeasure, type PatientFacts } from '@/lib/policy/encode/evaluate';
import { measureLoincCode } from '@/lib/policy/encode/fhir';
import type { Measure } from '@/lib/policy/encode/ir';

const LOINC_BMI = '39156-5';
const LOINC = 'http://loinc.org';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';

/**
 * A generic computable criterion — ANY LOINC-coded quantitative measure the policy gates on (eGFR,
 * LVEF, HbA1c, BP, lipids, …), lifted from the policy's boolean pathways (see `dtrCriteriaFromPolicy`).
 * Carries the encoded `Measure` verbatim so evaluation reuses the real `evalMeasure` (operator,
 * inclusivity, compound sub-measures, population threshold-variant). `required` is STRUCTURAL: false
 * when the measure sits under an OR / is one of several alternative pathways (so an alternative branch
 * never forces a false "not met"), true only when it is an unconditional AND gate.
 */
export interface ComputableCriterion {
  criterionId: string;
  /** measure field, e.g. 'egfr' | 'lvef' | 'hba1c'. */
  field: string;
  /** human label for the measure, e.g. 'eGFR'. */
  label: string;
  /** LOINC code the value is read from; undefined ⇒ compound (read per sub-measure). */
  loinc?: string;
  /** the encoded measure, evaluated via the shared `evalMeasure`. */
  measure: Measure;
  required: boolean;
  sourceExcerpt?: string;
  /** set when the measure cannot be fully auto-evaluated (e.g. population-shifted threshold) — surfaced,
   *  never silently applied. */
  note?: string;
}

/** Normalize a unit token for a fail-closed equality compare: an eval never crosses unit systems
 *  (e.g. HbA1c % vs mmol/mol, glucose mg/dL vs mmol/L) silently — a mismatch yields `unknown` (a gap),
 *  never a wrong met. `²`→`2`, whitespace/case folded, 'percent'→'%'. */
function normUnit(u?: string): string | undefined {
  if (!u) return undefined;
  let s = u.toLowerCase().replace(/\s+/g, '');
  s = s.replace(/µ|μ/g, 'u'); // micro sign / Greek mu → u
  s = s.replace(/[²]/g, '2').replace(/\^/g, ''); // m² / m^2 → m2
  s = s.replace(/percent/g, '%');
  s = s.replace(/[{}]/g, '').replace(/_/g, ''); // UCUM annotations: {1.73_m2} → 1.73m2
  return s;
}
/** A measured value may feed the comparator only when its unit is compatible with the threshold's.
 *  Threshold unit absent ⇒ accept (the encoder already flags an ambiguous threshold unit for review);
 *  threshold unit present but the observation is unitless ⇒ cannot confirm ⇒ NOT compatible (→ gap). */
function unitsCompatible(measureUnit?: string, obsUnit?: string): boolean {
  const a = normUnit(measureUnit);
  const b = normUnit(obsUnit);
  if (a === undefined) return true;
  if (b === undefined) return false;
  return a === b;
}

/** One reading pulled from the record for a measure's field, with provenance and a unit-compat verdict. */
interface FieldReading {
  field: string;
  loinc?: string;
  /** present ONLY when a matching observation existed AND its unit was compatible with the threshold. */
  value?: number;
  unit?: string;
  date?: string;
  performerName?: string;
  unitMismatch?: boolean;
}

function readField(bundle: PatientBundle, m: Measure): FieldReading {
  const field = m.field ?? '';
  const loinc = measureLoincCode(field); // canonical code (for display / candidate)
  const r: FieldReading = { field, loinc };
  if (!loinc) return r; // no standard coded concept for this field
  // Match ANY accepted LOINC for this field (real records vary the code), not only the canonical one.
  const codes = MEASURE_LOINC_ALIASES[field] ?? [loinc];
  const obs = latestObservationAny(bundle, codes);
  if (!obs) return r; // nothing on file → fact absent → evalMeasure returns 'unknown' → gap
  r.unit = obs.unit;
  r.date = obs.date;
  r.performerName = obs.performerName;
  if (obs.matchedCode) r.loinc = obs.matchedCode; // report the code actually found
  if (!unitsCompatible(m.unit, obs.unit)) {
    r.unitMismatch = true;
    return r; // value withheld → 'unknown' → gap (never a cross-unit wrong answer)
  }
  r.value = obs.value;
  return r;
}

/** PatientFacts covering just the measure(s) of one computable, from unit-compatible readings only. */
function factsForComputable(
  bundle: PatientBundle,
  c: ComputableCriterion
): { facts: PatientFacts; readings: FieldReading[] } {
  const measures: Record<string, number> = {};
  const readings: FieldReading[] = [];
  const ms = c.measure.kind === 'compound' ? (c.measure.subMeasures ?? []) : [c.measure];
  for (const m of ms) {
    const r = readField(bundle, m);
    readings.push(r);
    if (r.value !== undefined && r.field) measures[r.field] = r.value;
  }
  return { facts: { measures }, readings };
}

function opSymbol(op?: Measure['operator']): string {
  switch (op) {
    case '>=':
      return '≥';
    case '<=':
      return '≤';
    case '>':
      return '>';
    case '<':
      return '<';
    case '=':
      return '=';
    case '!=':
      return '≠';
    default:
      return '';
  }
}
/** Human threshold text for a measure, e.g. "≥ 30 mL/min/1.73m²" or "between 7 and 9 %". */
function describeMeasure(m: Measure): string {
  const unit = m.unit ? ` ${m.unit}` : '';
  if (m.operator === 'between' && m.value !== undefined && m.value2 !== undefined)
    return `between ${m.value} and ${m.value2}${unit}`;
  if (m.value !== undefined) return `${opSymbol(m.operator)} ${m.value}${unit}`.trim();
  return 'evaluated';
}

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
  /** GENERIC computable gates beyond age/BMI (eGFR, LVEF, HbA1c, BP, lipids, …), lifted from the
   *  policy's boolean pathways and evaluated from the record through the shared engine. Empty for an
   *  age/BMI-only policy (e.g. bariatric CG-SURG-83) — so those evaluations are byte-identical. */
  computable?: ComputableCriterion[];
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

  // GENERIC computable gates (eGFR / LVEF / HbA1c / BP / lipids / …), each evaluated from the record
  // through the shared three-valued `evalMeasure`. A reading is used only when its unit matches the
  // threshold; a missing or unit-incompatible reading evaluates 'unknown' → a gap (never a wrong met).
  // OR-alternative accounting: a non-required computable is one arm of an OR / alternative pathway.
  // When such arms exist, at least one must be met — otherwise a policy gated ONLY on alternatives (no
  // required gate) must not read "all met" just because every arm is non-required. (fail-open guard)
  let orAltPresent = false;
  let orAltMet = false;
  for (const c of criteria.computable ?? []) {
    const { facts, readings } = factsForComputable(bundle, c);
    const tri = evalMeasure(c.measure, facts);
    const status: 'met' | 'gap' = tri === 'met' ? 'met' : 'gap';
    if (!c.required) {
      orAltPresent = true;
      if (status === 'met') orAltMet = true;
    }
    const primary = readings[0];
    const opTxt = describeMeasure(c.measure);
    const mismatch = readings.some((r) => r.unitMismatch);
    const hasValue = readings.some((r) => r.value !== undefined);
    const noteTxt = c.note ? ` ${c.note}` : '';
    const gapReason =
      tri === 'unknown'
        ? mismatch
          ? ' (recorded value is in an incompatible unit — not auto-evaluated; provider to confirm)'
          : ' (no result found under the expected code — provider to attach or confirm coding)'
        : '';
    groups.push({
      id: ++id,
      title: `${c.label} ${opTxt}`.trim(),
      status,
      required: c.required,
      description: `${c.label} must be ${opTxt}.${noteTxt}${gapReason}`,
      fhirQuery: c.loinc
        ? {
            resourceType: 'Observation',
            searchParam: 'code',
            system: LOINC,
            codes: [c.loinc],
            valueComparison: opTxt,
          }
        : undefined,
      sourceExcerpt: c.sourceExcerpt,
      leaf:
        primary && primary.value !== undefined && primary.loinc
          ? {
              code: `LOINC ${primary.loinc}`,
              label: `${c.label} ${primary.value}${primary.unit ? ' ' + primary.unit : ''}`,
              evidence: `Most recent ${c.label} ${primary.value}${primary.unit ? ' ' + primary.unit : ''} recorded ${primary.date ?? 'undated'}`,
              source: 'emr',
              recordedDate: primary.date,
              performerName: primary.performerName,
            }
          : undefined,
      candidateCodes:
        hasValue || !c.loinc ? undefined : [{ code: c.loinc, system: LOINC, label: c.label }],
    });
  }

  // A required gate unmet ⇒ not all met; AND when OR-alternatives exist, ≥1 must be met. (This closes
  // the OR fail-open within the flat group model; a full BoolExpr verdict — distinct OR pools, coverage
  // exclusions, population gating, needs-info vs not-met — is the tracked next increment.)
  const orSatisfied = !orAltPresent || orAltMet;
  const allMet = groups.every((g) => !g.required || g.status === 'met') && orSatisfied;
  return {
    policyTitle: criteria.policyTitle,
    cptCode: criteria.cptCode,
    patientId: patient?.id,
    allMet,
    groups,
  };
}
