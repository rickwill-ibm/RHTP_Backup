/**
 * End-to-end engine proof — a Horizon-shaped bariatric policy through the whole pipeline:
 * encode → Questionnaire + coverage rules → evaluate for several patients.
 *
 * Asserts the spec §1 safety invariants on a running engine:
 *  - §1.1 fail-closed: no pathway met ⇒ not-covered; un-enumerated code ⇒ not-covered.
 *  - §1.2/E9: VBG (43842) is not-covered under this payer.
 *  - §1.5 (minor): a 15-yo does NOT auto-approve.
 *  - §1.9 no-silent-degradation: missing BMI ⇒ needs-info, never a covered default.
 *  - CRD present: coverage rules point at the DTR Questionnaire and name the criteria.
 */
import { describe, it, expect } from 'vitest';
import type { CriteriaPolicy } from '@/lib/policy/extract/criteria';
import type { ProcedureRule } from '@/lib/policy/encode/ir';
import { encodePolicy } from '@/lib/policy/encode/encode';
import { evaluatePolicy, type PatientFacts } from '@/lib/policy/encode/evaluate';
import { toQuestionnaire } from '@/lib/policy/encode/fhir';
import { toCoverageRules } from '@/lib/policy/encode/crd';

function req<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('missing fixture');
  return v;
}

// A Horizon-shaped fixture: two eligibility groups modeling ">40" OR "(35–40 + ≥1 comorbidity)".
const horizon: CriteriaPolicy = {
  title: 'Bariatric Surgery',
  guidelineId: 'HORIZON-BARIATRIC',
  status: 'active',
  medicallyNecessary: [
    {
      heading: 'is considered medically necessary when all of the following are met',
      logic: 'all',
      criteria: [
        { label: 'A', text: 'The member is at least 18 years of age', children: [] },
        { label: 'C', text: 'A body mass index (BMI) greater than 40 kg/m²', children: [] },
      ],
    },
    {
      heading: 'OR is considered medically necessary when all of the following are met',
      logic: 'all',
      criteria: [
        { label: 'A', text: 'The member is at least 18 years of age', children: [] },
        { label: 'C', text: 'A body mass index (BMI) between 35 kg/m² and 40 kg/m²', children: [] },
        {
          label: 'D',
          text: 'one or more of the following co-morbidities',
          children: [
            {
              label: 'i',
              text: 'Obstructive sleep apnea (OSA); member should have failed at least 3 months of CPAP',
              children: [],
            },
            { label: 'ii', text: 'Type 2 diabetes mellitus', children: [] },
          ],
        },
      ],
    },
  ],
  notMedicallyNecessary: [
    'Vertical-banded gastroplasty is not considered medically necessary.',
    'Bariatric surgery is not considered medically necessary for members who have not met criteria for II or III.',
  ],
  codes: [],
  provenance: [],
  warnings: [],
  stats: { groups: 2, criteria: 5, codes: 0 },
};

// Injected procedure rules (a code table would supply these): sleeve covered, VBG not-covered.
const procedures: ProcedureRule[] = [
  {
    code: '43775',
    system: 'CPT',
    coverageCode: 'covered',
    sourceText: 'sleeve gastrectomy',
    sourceSpan: { start: 0, end: 0 },
  },
  {
    code: '43842',
    system: 'CPT',
    coverageCode: 'not-covered',
    basis: 'criteria-not-met',
    sourceText: 'vertical-banded gastroplasty',
    sourceSpan: { start: 0, end: 0 },
  },
];

const policy = encodePolicy(horizon, { procedures, service: 'Bariatric Surgery' });

function comorbidityValueSetId(): string {
  const choice = Object.values(policy.criteria).find((c) => c.kind === 'choice');
  if (!choice?.choice) throw new Error('expected a comorbidity choice criterion');
  return choice.choice.valueSetId;
}

describe('engine encodes a runnable PolicyLogic', () => {
  it('produces two eligibility pathways and a fail-closed default', () => {
    expect(policy.pathways.filter((p) => p.role === 'eligibility')).toHaveLength(2);
    expect(policy.defaultProcedureRole).toBe('not-covered'); // "not met criteria for II or III"
  });

  it('encodes the age criterion as a measure ≥ 18 (never a boolean)', () => {
    const ageCrit = Object.values(policy.criteria).find((c) => c.measure?.field === 'age');
    expect(ageCrit?.measure?.operator).toBe('>=');
    expect(ageCrit?.measure?.value).toBe(18);
  });
});

describe('CRD is in the pipeline', () => {
  it('emits coverage rules that point at the DTR Questionnaire and name the criteria', () => {
    const rules = toCoverageRules(policy);
    const sleeve = req(rules.find((r) => r.code === '43775'));
    expect(sleeve.priorAuthRequired).toBe(true);
    expect(sleeve.questionnaireCanonical).toContain('urn:rhtp:dtr/Questionnaire/');
    expect(sleeve.criteriaNames && sleeve.criteriaNames.length).toBeGreaterThan(0);

    const vbg = req(rules.find((r) => r.code === '43842'));
    expect(vbg.priorAuthRequired).toBe(false); // not-covered
    expect(vbg.coverageCode).toBe('not-covered');
  });

  it('emits a typed DTR Questionnaire (decimal BMI, integer age, choice comorbidity)', () => {
    const q = toQuestionnaire(policy);
    const flat: string[] = [];
    const walk = (items: typeof q.item): void =>
      items.forEach((i) => {
        flat.push(`${i.type}:${i.text.slice(0, 20)}`);
        if (i.item) walk(i.item);
      });
    walk(q.item);
    expect(flat.some((f) => f.startsWith('decimal:'))).toBe(true); // BMI
    expect(flat.some((f) => f.startsWith('integer:'))).toBe(true); // age
    expect(flat.some((f) => f.startsWith('choice:') || f.startsWith('open-choice:'))).toBe(true);
  });
});

describe('evaluate() upholds the safety invariants on real patients', () => {
  const vsId = comorbidityValueSetId();

  it('adult BMI 42, sleeve → approvable (>40 pathway)', () => {
    const facts: PatientFacts = { procedureCode: '43775', measures: { age: 45, bmi: 42 } };
    const d = evaluatePolicy(policy, facts);
    expect(d.disposition).toBe('approvable');
  });

  it('adult BMI 37 + 1 comorbidity → approvable (35–40 pathway)', () => {
    const facts: PatientFacts = {
      procedureCode: '43775',
      measures: { age: 45, bmi: 37 },
      choiceSelections: { [vsId]: 1 },
    };
    const d = evaluatePolicy(policy, facts);
    expect(d.disposition).toBe('approvable');
  });

  it('§1.5 minor (15) BMI 42 with NO qualifying pathway → NOT approvable', () => {
    const facts: PatientFacts = { procedureCode: '43775', measures: { age: 15, bmi: 42 } };
    const d = evaluatePolicy(policy, facts);
    expect(d.disposition).not.toBe('approvable');
    expect(d.coverage).toBe('not-covered');
  });

  it('§1.2 VBG (43842) → not-covered / denied', () => {
    const facts: PatientFacts = { procedureCode: '43842', measures: { age: 45, bmi: 42 } };
    const d = evaluatePolicy(policy, facts);
    expect(d.coverage).toBe('not-covered');
    expect(d.disposition).toBe('denied');
  });

  it('§1.9 missing BMI → needs-info, never covered by default', () => {
    const facts: PatientFacts = { procedureCode: '43775', measures: { age: 45 } };
    const d = evaluatePolicy(policy, facts);
    expect(d.disposition).toBe('needs-info');
    expect(d.coverage).not.toBe('covered');
  });

  it('§1.1 un-enumerated procedure code → fail-closed not-covered', () => {
    const facts: PatientFacts = { procedureCode: '00000', measures: { age: 45, bmi: 42 } };
    const d = evaluatePolicy(policy, facts);
    expect(d.coverage).toBe('not-covered');
  });
});
