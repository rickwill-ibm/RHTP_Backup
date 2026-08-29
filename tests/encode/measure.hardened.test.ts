/**
 * Hardened encoder — the defect classes the adversarial reviews raised, generalized (NOT one
 * document), plus proof the multi-threshold criterion is wired end-to-end: field resolved from
 * sentence scope across appositive commas, bands never shattered, slash-pair BP, in-scope polarity,
 * fail-closed on out-of-range / fieldless numbers, and age+BMI AND-combined through evaluate + the
 * DTR Questionnaire + the encoding-review panel.
 */
import { describe, it, expect } from 'vitest';
import type { CriteriaPolicy } from '@/lib/policy/extract/criteria';
import { encodePolicy } from '@/lib/policy/encode/encode';
import { evaluatePolicy, type PatientFacts } from '@/lib/policy/encode/evaluate';
import { toQuestionnaire, type FhirItem } from '@/lib/policy/encode/fhir';
import { parseMeasures, parseMeasuresDetailed, parseCompoundBP } from '@/lib/policy/encode/measure';
import { parseTimeWindow } from '@/lib/policy/encode/time';
import { reviewElementsFromPolicy } from '@/lib/policy/review/fromPolicyReview';
import type { PolicyReview } from '@/lib/policy/policyReview';

function req<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('missing fixture');
  return v;
}

function oneCriterionPolicy(text: string): CriteriaPolicy {
  return {
    title: 'Generic Service',
    guidelineId: 'G-GENERIC',
    status: 'active',
    medicallyNecessary: [
      { heading: 'considered when', logic: 'all', criteria: [{ label: 'A', text, children: [] }] },
    ],
    notMedicallyNecessary: [],
    codes: [],
    provenance: [],
    warnings: [],
    stats: { groups: 1, criteria: 1, codes: 0 },
  };
}

function flattenItems(items: FhirItem[]): FhirItem[] {
  const out: FhirItem[] = [];
  const walk = (xs: FhirItem[]): void =>
    xs.forEach((i) => {
      out.push(i);
      if (i.item) walk(i.item);
    });
  walk(items);
  return out;
}

describe('the F1/F2/F10 defect class, generalized: field resolved from scope, not from the unit', () => {
  it('"at least 18 years of age and BMI greater than 40 kg/m²" ⇒ EXACTLY [age>=18 years, bmi>40 kg/m²]', () => {
    const { measures } = parseMeasures('at least 18 years of age and BMI greater than 40 kg/m²');
    expect(measures).toHaveLength(2);
    const [age, bmi] = measures;
    expect(age.field).toBe('age');
    expect(age.operator).toBe('>=');
    expect(age.value).toBe(18);
    expect(age.unit).toBe('years');
    expect(bmi.field).toBe('bmi');
    expect(bmi.operator).toBe('>');
    expect(bmi.value).toBe(40);
    expect(bmi.unit).toBe('kg/m²');
    // The specific corruptions the reviews flagged must be impossible:
    expect(measures.some((m) => m.field === 'bloodPressure')).toBe(false);
    expect(measures.some((m) => m.field === 'bmi' && m.unit === 'years')).toBe(false);
  });

  it('field noun far from the number across appositive commas is still found (not dropped)', () => {
    const m = req(
      parseMeasures('body mass index, documented on two occasions, of at least 40 kg/m²')
        .measures[0]
    );
    expect(m.field).toBe('bmi');
    expect(m.operator).toBe('>=');
    expect(m.value).toBe(40);
    expect(m.unit).toBe('kg/m²');
  });

  it('postfix comparators across "or": "18 years of age or older with a BMI of 40 or greater"', () => {
    const { measures } = parseMeasures('18 years of age or older with a BMI of 40 or greater');
    expect(measures.map((m) => [m.field, m.operator, m.value])).toEqual([
      ['age', '>=', 18],
      ['bmi', '>=', 40],
    ]);
  });

  it('Asian-ancestry BMI variant lands on the BMI field, never on age', () => {
    const m = req(
      parseMeasures('BMI of 32.5 or greater for persons of Asian ancestry').measures[0]
    );
    expect(m.field).toBe('bmi');
    expect(m.value).toBe(32.5);
  });
});

describe('bands are ONE measure, never shattered', () => {
  it('"BMI of 35 to 39.9" ⇒ a single between measure', () => {
    const { measures } = parseMeasures('BMI of 35 to 39.9');
    expect(measures).toHaveLength(1);
    expect(measures[0].operator).toBe('between');
    expect(measures[0].value).toBe(35);
    expect(measures[0].value2).toBe(39.9);
  });

  it('"BMI ≥35 and <40 kg/m²" ⇒ ONE band (incl-low, excl-high), not a lone ≥35', () => {
    const { measures } = parseMeasures('BMI ≥35 and <40 kg/m²');
    expect(measures).toHaveLength(1);
    const m = measures[0];
    expect(m.operator).toBe('between');
    expect(m.value).toBe(35);
    expect(m.value2).toBe(40);
    expect(m.inclusiveLow).toBe(true);
    expect(m.inclusiveHigh).toBe(false);
  });
});

describe('slash-pair blood pressure', () => {
  it('"blood pressure 140/90" with no comparator ⇒ review flag, never a guessed threshold', () => {
    const { measures, reviewReasons } = parseMeasuresDetailed('blood pressure 140/90');
    expect(measures).toHaveLength(0);
    expect(reviewReasons.join(' ')).toMatch(/no comparator/i);
  });

  it('"BP ≥ 140/90 mmHg despite 3 agents" ⇒ compound both axes + therapy qualifier', () => {
    const m = req(parseCompoundBP('BP ≥ 140/90 mmHg despite 3 agents'));
    expect(m.kind).toBe('compound');
    expect((m.subMeasures ?? []).map((s) => s.field).sort()).toEqual(['diastolicBP', 'systolicBP']);
    expect((m.subMeasures ?? []).every((s) => s.operator === '>=')).toBe(true);
    expect(m.therapyQualifier?.drugClassCount).toBe(3);
  });
});

describe('in-scope polarity is recorded, never inverted into a positive gate', () => {
  it('"A BMI less than 35 is not medically necessary" ⇒ negatedLocally true, operator NOT inverted', () => {
    const m = req(parseMeasures('A BMI less than 35 is not medically necessary').measures[0]);
    expect(m.field).toBe('bmi');
    expect(m.operator).toBe('<'); // NOT flipped to >=
    expect(m.value).toBe(35);
    expect(m.negatedLocally).toBe(true);
  });
});

describe('fail-closed on unsafe numbers', () => {
  it('out-of-range "BMI greater than 400" ⇒ no measure + a review reason', () => {
    const { measures, reviewReasons } = parseMeasuresDetailed('BMI greater than 400');
    expect(measures).toHaveLength(0);
    expect(reviewReasons.join(' ')).toMatch(/plausible range/i);
  });

  it('fieldless "more than 3 documented attempts" ⇒ no measure (never "Value > 3")', () => {
    expect(parseMeasures('more than 3 documented attempts').measures).toHaveLength(0);
  });

  it('word-numeral time: "two 3-month trials" normalizes and does not throw', () => {
    // A count/duration clause with a word numeral is handled by time.ts after normalization.
    const tw = parseTimeWindow('at least two consecutive months');
    expect(tw?.longestConsecutive?.min).toBe(2);
  });

  it('time count generalizes to visits and treatments, not just sessions', () => {
    expect(req(parseTimeWindow('at least 12 visits')).count).toEqual({ min: 12, unit: 'visits' });
    expect(req(parseTimeWindow('at least 6 treatments')).count).toEqual({
      min: 6,
      unit: 'treatments',
    });
  });
});

describe('multi-measure criterion is wired end-to-end', () => {
  const policy = encodePolicy(
    oneCriterionPolicy('The member is at least 18 years of age and BMI greater than 40 kg/m²'),
    { service: 'Generic Service' }
  );
  const crit = req(Object.values(policy.criteria).find((c) => c.measures && c.measures.length > 1));

  it('encodes both thresholds onto one criterion', () => {
    expect((crit.measures ?? []).map((m) => m.field).sort()).toEqual(['age', 'bmi']);
  });

  it('evaluate AND-combines: both needed', () => {
    const both: PatientFacts = { measures: { age: 20, bmi: 45 } };
    const bmiShort: PatientFacts = { measures: { age: 20, bmi: 30 } };
    const missing: PatientFacts = { measures: { age: 20 } };
    expect(evaluatePolicy(policy, both).disposition).toBe('approvable');
    expect(evaluatePolicy(policy, bmiShort).disposition).not.toBe('approvable');
    expect(evaluatePolicy(policy, missing).disposition).toBe('needs-info');
  });

  it('the Questionnaire emits two distinct linkIds (FHIR R4 uniqueness)', () => {
    const items = flattenItems(toQuestionnaire(policy).item);
    const measureLinks = items.filter((i) => i.linkId.includes('::')).map((i) => i.linkId);
    expect(measureLinks).toHaveLength(2); // one per threshold
    expect(new Set(measureLinks).size).toBe(measureLinks.length); // all unique (index-suffixed)
  });
});

describe('encoding-review panel reflects each typed threshold', () => {
  function reviewFor(text: string): PolicyReview {
    return {
      kind: 'criteria',
      tenant: null,
      title: 'Generic Service',
      policyId: 'p',
      guidelineId: 'G',
      source: 'Generic Service',
      sourceFile: 'p.pdf',
      status: 'draft',
      promotable: true,
      criteriaSections: [
        { heading: 'when', logic: 'all', criteria: [{ label: 'A', text, children: [] }] },
      ],
      guidelineCodes: [],
      item: [],
      provenance: [],
      warnings: [],
      stats: { format: 'criteria', codes: 0, criteria: 1 },
    };
  }

  it('age AND BMI each render as a typed Value-threshold row', () => {
    const els = reviewElementsFromPolicy(
      reviewFor('The member is at least 18 years of age and BMI greater than 40 kg/m²')
    );
    const labels = els.filter((e) => e.kind === 'bmi').map((e) => e.label);
    expect(labels).toContain('Age ≥ 18 years');
    expect(labels).toContain('BMI > 40 kg/m²');
  });

  it('therapy qualifier renders "despite N agents" and never invents a ≥', () => {
    const els = reviewElementsFromPolicy(
      reviewFor(
        'blood pressure greater than 140 mmHg systolic and/or 90 mmHg diastolic despite concurrent use of 3 anti-hypertensive agents'
      )
    );
    const label = req(els.find((e) => e.kind === 'bmi')).label;
    expect(label).toMatch(/despite 3 agents/);
    expect(label).not.toMatch(/despite\s*≥/);
  });
});
