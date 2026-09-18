/**
 * computableCriteria — proves the DTR evaluator is generic across LOINC-mapped quantitative measures
 * (eGFR / LVEF / HbA1c / …), not just age/BMI, and that it does so HONESTLY:
 *   • a computable gate is read from the patient's FHIR record and flips met/gap by the coded value;
 *   • the comparator direction (≤ / ≥ / between) is respected;
 *   • a unit-incompatible reading is a GAP, never a cross-unit wrong "met";
 *   • a missing reading is a GAP with a candidate code, never a silent pass;
 *   • OR / alternative-pathway gates are non-required (never force a false "not met");
 *   • the fail-loud hollow guard counts only VALID computables;
 *   • the bariatric CG-SURG-83 evaluation stays byte-identical (computable-empty).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  evaluateDtr,
  type ComputableCriterion,
  type DtrCriteria,
} from '@/lib/policy/dtr/evaluate/patientEvaluation';
import {
  bariatricPatientBundle,
  cardioRenalPatientBundle,
  type PatientBundle,
} from '@/lib/policy/dtr/evaluate/patientData';
import { dtrCriteriaFromReview } from '@/lib/policy/dtr/evaluate/dtrCriteriaFromPolicy';
import { isHollowCriteria, isValidComputable } from '@/lib/policy/dtr/evaluate/policyRegistry';
import { pdfToTextSource } from '@/lib/policy/server/pdfIntake';
import { processPolicyDocument, type PolicyReview } from '@/lib/policy/policyReview';
import type { CriteriaGroup } from '@/lib/policy/extract/criteria';

const ASOF = new Date('2026-08-30');

function base(computable: ComputableCriterion[]): DtrCriteria {
  return { policyTitle: 'Test', cptCode: 'X', documentation: [], computable };
}
function comp(over: Partial<ComputableCriterion> & Pick<ComputableCriterion, 'field' | 'loinc' | 'measure'>): ComputableCriterion {
  return { criterionId: over.criterionId ?? `c:${over.field}`, label: over.label ?? over.field, required: over.required ?? true, ...over };
}

describe('evaluateDtr — generic computable measures read from the record', () => {
  it('LVEF ≤ 35% is MET from a recorded LVEF of 30% (with sourced evidence)', () => {
    const c = comp({ field: 'lvef', label: 'LVEF', loinc: '10230-1', measure: { kind: 'scalar', field: 'lvef', operator: '<=', value: 35, unit: '%' } });
    const g = evaluateDtr(base([c]), cardioRenalPatientBundle, ASOF).groups.at(-1)!;
    expect(g.status).toBe('met');
    expect(g.leaf?.code).toBe('LOINC 10230-1');
    expect(g.leaf?.evidence).toMatch(/30/);
  });

  it('LVEF ≥ 40% is a GAP for the same 30% record (direction respected)', () => {
    const c = comp({ field: 'lvef', label: 'LVEF', loinc: '10230-1', measure: { kind: 'scalar', field: 'lvef', operator: '>=', value: 40, unit: '%' } });
    expect(evaluateDtr(base([c]), cardioRenalPatientBundle, ASOF).groups.at(-1)!.status).toBe('gap');
  });

  it('eGFR < 30 is MET from a recorded 22 mL/min/1.73m²; eGFR ≥ 30 is a GAP', () => {
    const lt = comp({ field: 'egfr', label: 'eGFR', loinc: '33914-3', measure: { kind: 'scalar', field: 'egfr', operator: '<', value: 30, unit: 'mL/min/1.73m²' } });
    const ge = comp({ field: 'egfr', label: 'eGFR', loinc: '33914-3', measure: { kind: 'scalar', field: 'egfr', operator: '>=', value: 30, unit: 'mL/min/1.73m²' } });
    expect(evaluateDtr(base([lt]), cardioRenalPatientBundle, ASOF).groups.at(-1)!.status).toBe('met');
    expect(evaluateDtr(base([ge]), cardioRenalPatientBundle, ASOF).groups.at(-1)!.status).toBe('gap');
  });

  it('HbA1c ≥ 7% is MET from a recorded 8.2%', () => {
    const c = comp({ field: 'hba1c', label: 'HbA1c', loinc: '4548-4', measure: { kind: 'scalar', field: 'hba1c', operator: '>=', value: 7, unit: '%' } });
    expect(evaluateDtr(base([c]), cardioRenalPatientBundle, ASOF).groups.at(-1)!.status).toBe('met');
  });

  it('a UNIT-INCOMPATIBLE reading is a GAP, never a cross-unit wrong met', () => {
    // threshold HbA1c ≥ 7 % but the record carries 53 mmol/mol (≈7.0%). A naive numeric compare would
    // read 53 ≥ 7 = MET (wrong-by-luck) — the guard must withhold the value → gap.
    const bundle: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'U', birthDate: '1970-01-01' } },
        { resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' }] }, valueQuantity: { value: 53, unit: 'mmol/mol' }, effectiveDateTime: '2026-01-01' } },
      ],
    };
    const c = comp({ field: 'hba1c', label: 'HbA1c', loinc: '4548-4', measure: { kind: 'scalar', field: 'hba1c', operator: '>=', value: 7, unit: '%' } });
    const g = evaluateDtr(base([c]), bundle, ASOF).groups.at(-1)!;
    expect(g.status).toBe('gap');
    expect(g.description).toMatch(/incompatible unit/i);
  });

  it('a MISSING reading is a GAP carrying a candidate LOINC (never a silent pass)', () => {
    const c = comp({ field: 'ldl', label: 'LDL cholesterol', loinc: '18262-6', measure: { kind: 'scalar', field: 'ldl', operator: '>=', value: 100, unit: 'mg/dL' } });
    const g = evaluateDtr(base([c]), cardioRenalPatientBundle, ASOF).groups.at(-1)!;
    expect(g.status).toBe('gap');
    expect(g.candidateCodes?.[0]?.code).toBe('18262-6');
  });

  it('a required gate met AND one OR-alternative met ⇒ allMet (an unmet sibling alternative is fine)', () => {
    const reqMet = comp({ field: 'lvef', label: 'LVEF', loinc: '10230-1', measure: { kind: 'scalar', field: 'lvef', operator: '<=', value: 35, unit: '%' } });
    const altMet = comp({ field: 'hba1c', label: 'HbA1c', loinc: '4548-4', required: false, measure: { kind: 'scalar', field: 'hba1c', operator: '>=', value: 7, unit: '%' } });
    const altGap = comp({ field: 'ldl', label: 'LDL', loinc: '18262-6', required: false, measure: { kind: 'scalar', field: 'ldl', operator: '>=', value: 100, unit: 'mg/dL' } });
    expect(evaluateDtr(base([reqMet, altMet, altGap]), cardioRenalPatientBundle, ASOF).allMet).toBe(true);
  });
});

describe('isHollowCriteria — the fail-loud guard counts only VALID computables', () => {
  const mk = (m: ComputableCriterion['measure'], loinc?: string): DtrCriteria =>
    base([comp({ field: 'egfr', label: 'eGFR', loinc, measure: m })]);

  it('a valid LOINC-mapped computable makes a policy NON-hollow', () => {
    const c = mk({ kind: 'scalar', field: 'egfr', operator: '<', value: 30, unit: 'mL/min/1.73m²' }, '33914-3');
    expect(isValidComputable(c.computable![0])).toBe(true);
    expect(isHollowCriteria(c)).toBe(false);
  });
  it('a junk computable (NaN value) does NOT rescue a policy from fail-loud', () => {
    const c = mk({ kind: 'scalar', field: 'egfr', operator: '<', value: Number.NaN, unit: '%' }, '33914-3');
    expect(isValidComputable(c.computable![0])).toBe(false);
    expect(isHollowCriteria(c)).toBe(true);
  });
  it('a between missing its upper endpoint is invalid → still hollow', () => {
    const c = mk({ kind: 'scalar', field: 'egfr', operator: 'between', value: 30 }, '33914-3');
    expect(isValidComputable(c.computable![0])).toBe(false);
    expect(isHollowCriteria(c)).toBe(true);
  });
  it('a computable with no resolved LOINC (and not compound) is invalid → hollow', () => {
    const c = mk({ kind: 'scalar', field: 'stenosis', operator: '>=', value: 70, unit: '%' }, undefined);
    expect(isValidComputable(c.computable![0])).toBe(false);
    expect(isHollowCriteria(c)).toBe(true);
  });
  it('an empty criteria object is hollow', () => {
    expect(isHollowCriteria(base([]))).toBe(true);
  });
});

/** A synthetic PolicyReview carrying only the criteria groups we want the lift to walk. */
function reviewOf(sections: CriteriaGroup[], title = 'Cardiac Device Policy'): PolicyReview {
  return {
    kind: 'criteria',
    tenant: null,
    title,
    policyId: 'TEST-CARD-1',
    guidelineId: 'TEST-CARD-1',
    source: 'test',
    sourceFile: 'test.pdf',
    status: 'draft',
    promotable: true,
    criteriaSections: sections,
    item: [],
    provenance: [],
    warnings: [],
    // test double — dtrCriteriaFromReview reads only criteriaSections/title/guidelineId.
  } as unknown as PolicyReview;
}

describe('dtrCriteriaFromReview — lifts non-bariatric measures from the boolean pathways', () => {
  it('an ALL-group age + LVEF≤35 lifts a REQUIRED lvef computable that then evaluates met', () => {
    const review = reviewOf([
      {
        heading: 'The device is considered medically necessary when all of the following criteria are met:',
        logic: 'all',
        criteria: [
          { label: 'A', text: 'Member is at least 18 years of age.', children: [] },
          { label: 'B', text: 'Left ventricular ejection fraction (LVEF) is less than or equal to 35%.', children: [] },
        ],
      },
    ]);
    const criteria = dtrCriteriaFromReview(review, '33208');
    const lvef = criteria.computable?.find((c) => c.field === 'lvef');
    expect(lvef, 'lvef lifted from the policy').toBeDefined();
    expect(lvef!.required).toBe(true);
    expect(lvef!.measure.operator).toBe('<=');
    expect(lvef!.measure.value).toBe(35);
    // and it evaluates MET against the recorded 30% (proof the lift → engine path is live)
    const g = evaluateDtr(criteria, cardioRenalPatientBundle, ASOF).groups.find((x) => /ejection fraction/i.test(x.title));
    expect(g?.status).toBe('met');
  });

  it('a ONE-OF group makes the lifted measure NON-required (an OR alternative)', () => {
    const review = reviewOf([
      {
        heading: 'Coverage is considered medically necessary when one of the following is met:',
        logic: 'any',
        criteria: [
          { label: 'A', text: 'Left ventricular ejection fraction (LVEF) is less than or equal to 35%.', children: [] },
          { label: 'B', text: 'History of sustained ventricular tachycardia.', children: [] },
        ],
      },
    ]);
    const criteria = dtrCriteriaFromReview(review, '33208');
    const lvef = criteria.computable?.find((c) => c.field === 'lvef');
    expect(lvef, 'lvef lifted').toBeDefined();
    expect(lvef!.required).toBe(false);
  });

  it('a measure with no standard coded concept (stenosis) is surfaced as a documentation gap, not dropped', () => {
    const review = reviewOf([
      {
        heading: 'Considered medically necessary when all of the following criteria are met:',
        logic: 'all',
        criteria: [{ label: 'A', text: 'Carotid artery stenosis is greater than or equal to 70%.', children: [] }],
      },
    ]);
    const criteria = dtrCriteriaFromReview(review, '37215');
    expect(criteria.computable?.some((c) => c.field === 'stenosis')).toBe(false);
    expect(criteria.documentation.some((d) => /stenosis/i.test(d.description))).toBe(true);
  });
});

describe('post-review hardening', () => {
  it('#3 a compound (BP) measure is VALID → a compound-only policy is not hollow (no false throw)', () => {
    const bp: ComputableCriterion = comp({
      field: 'systolicBP',
      label: 'Systolic / Diastolic BP',
      loinc: undefined,
      measure: {
        kind: 'compound',
        logic: 'all',
        subMeasures: [
          { kind: 'scalar', field: 'systolicBP', operator: '>=', value: 140, unit: 'mmHg' },
          { kind: 'scalar', field: 'diastolicBP', operator: '>=', value: 90, unit: 'mmHg' },
        ],
      },
    });
    expect(isValidComputable(bp)).toBe(true);
    expect(isHollowCriteria(base([bp]))).toBe(false);
  });

  it('#5 a real eGFR coded with a VARIANT LOINC (62238-1) still matches and evaluates', () => {
    const bundle: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'V', birthDate: '1960-01-01' } },
        { resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '62238-1', display: 'eGFR (CKD-EPI)' }] }, valueQuantity: { value: 24, unit: 'mL/min/1.73m2' }, effectiveDateTime: '2026-04-01' } },
      ],
    };
    const c = comp({ field: 'egfr', label: 'eGFR', loinc: '33914-3', measure: { kind: 'scalar', field: 'egfr', operator: '<', value: 30, unit: 'mL/min/1.73m²' } });
    const g = evaluateDtr(base([c]), bundle, ASOF).groups.at(-1)!;
    expect(g.status).toBe('met');
    expect(g.leaf?.code).toBe('LOINC 62238-1'); // reports the code actually found
  });

  it('#6 a UCUM-annotated eGFR unit ({1.73_m2}) is compatible; a true cross-system unit is a gap', () => {
    const ucum: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'U2', birthDate: '1960-01-01' } },
        { resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '33914-3', display: 'eGFR' }] }, valueQuantity: { value: 24, unit: 'mL/min/{1.73_m2}' }, effectiveDateTime: '2026-04-01' } },
      ],
    };
    const c = comp({ field: 'egfr', label: 'eGFR', loinc: '33914-3', measure: { kind: 'scalar', field: 'egfr', operator: '<', value: 30, unit: 'mL/min/1.73m²' } });
    expect(evaluateDtr(base([c]), ucum, ASOF).groups.at(-1)!.status).toBe('met');

    const gluBundle: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'U3', birthDate: '1960-01-01' } },
        { resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '2339-0', display: 'Glucose' }] }, valueQuantity: { value: 7, unit: 'mmol/L' }, effectiveDateTime: '2026-04-01' } },
      ],
    };
    const glu = comp({ field: 'glucose', label: 'Glucose', loinc: '2339-0', measure: { kind: 'scalar', field: 'glucose', operator: '>=', value: 126, unit: 'mg/dL' } });
    expect(evaluateDtr(base([glu]), gluBundle, ASOF).groups.at(-1)!.status).toBe('gap'); // 7 mmol/L not compared to 126 mg/dL
  });

  it('regression: a fasting-specific glucose code does NOT satisfy a generic glucose gate (no cross-specimen match)', () => {
    const fastingOnly: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'F', birthDate: '1960-01-01' } },
        // fasting glucose (1558-6) 140 mg/dL — NOT in the generic glucose alias set on purpose
        { resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '1558-6', display: 'Fasting glucose' }] }, valueQuantity: { value: 140, unit: 'mg/dL' }, effectiveDateTime: '2026-04-01' } },
      ],
    };
    const generic = comp({ field: 'glucose', label: 'Glucose', loinc: '2339-0', measure: { kind: 'scalar', field: 'glucose', operator: '>=', value: 126, unit: 'mg/dL' } });
    expect(evaluateDtr(base([generic]), fastingOnly, ASOF).groups.at(-1)!.status).toBe('gap');
    // but a generic serum glucose (2345-7) DOES match
    const serum: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'S', birthDate: '1960-01-01' } },
        { resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '2345-7', display: 'Glucose SerPl' }] }, valueQuantity: { value: 140, unit: 'mg/dL' }, effectiveDateTime: '2026-04-01' } },
      ],
    };
    expect(evaluateDtr(base([generic]), serum, ASOF).groups.at(-1)!.status).toBe('met');
  });

  it('#1 an all-alternatives-unmet OR policy does NOT read allMet (fail-open closed)', () => {
    const altGapA = comp({ field: 'ldl', label: 'LDL', loinc: '18262-6', required: false, measure: { kind: 'scalar', field: 'ldl', operator: '>=', value: 100, unit: 'mg/dL' } });
    const altGapB = comp({ field: 'hdl', label: 'HDL', loinc: '2085-9', required: false, measure: { kind: 'scalar', field: 'hdl', operator: '>=', value: 100, unit: 'mg/dL' } });
    // both alternatives have no reading in the cardio-renal bundle → both gap → no alternative met
    expect(evaluateDtr(base([altGapA, altGapB]), cardioRenalPatientBundle, ASOF).allMet).toBe(false);
  });

  it('#1 an OR policy with one alternative met DOES read allMet', () => {
    const altMet = comp({ field: 'lvef', label: 'LVEF', loinc: '10230-1', required: false, measure: { kind: 'scalar', field: 'lvef', operator: '<=', value: 35, unit: '%' } });
    const altGap = comp({ field: 'ldl', label: 'LDL', loinc: '18262-6', required: false, measure: { kind: 'scalar', field: 'ldl', operator: '>=', value: 100, unit: 'mg/dL' } });
    expect(evaluateDtr(base([altMet, altGap]), cardioRenalPatientBundle, ASOF).allMet).toBe(true);
  });
});

describe('bariatric CG-SURG-83 — evaluation is byte-identical (computable-empty)', () => {
  it('lifts ZERO computables and keeps its 9-group age/BMI/comorbidity/documentation shape', async () => {
    const bytes = await readFile(path.join(process.cwd(), 'public/sample-policies/elevance-cgsurg83.pdf'));
    const src = await pdfToTextSource(new Uint8Array(bytes), 'elevance-cgsurg83.pdf');
    const review = await processPolicyDocument(src);
    const criteria = dtrCriteriaFromReview(review, '43644');
    expect(criteria.computable).toEqual([]);
    const out = evaluateDtr(criteria, bariatricPatientBundle, new Date('2026-08-30'));
    expect(out.groups.map((g) => g.title)).toEqual([
      'Member age ≥ 18 years',
      'BMI ≥ 40 kg/m² (or 35–40 kg/m² with a qualifying comorbidity)',
      'Obesity-related comorbidity — type 2 diabetes, hypertension, obstructive sleep apnea, or related condition',
      'Past participation in a weight loss program; and',
      'Inadequate weight loss despite a committed attempt at conservative medical therapy (for…',
      'Pre-operative medical and mental health evaluations and clearances; and',
      'Pre-operative education which addresses the risks, benefits, realistic expectations and…',
      'A treatment plan which addresses the pre- and post-operative needs of an individual unde…',
      'There is documentation of a complication related to the initial procedure (including but…',
    ]);
    expect(out.groups[0].status).toBe('met');
    expect(out.groups[1].status).toBe('met');
    expect(out.groups[2].required).toBe(false);
    expect(out.allMet).toBe(false);
  });
});
