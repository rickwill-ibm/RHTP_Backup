/**
 * Post-coding adversarial regression pins — one per proven defect. Each fails on the pre-fix
 * implementation and passes after. Payer-agnostic; asserts the fail-safe behavior, not one document.
 */
import { describe, it, expect } from 'vitest';
import type { CriteriaPolicy } from '@/lib/policy/extract/criteria';
import { encodePolicy } from '@/lib/policy/encode/encode';
import { evaluatePolicy } from '@/lib/policy/encode/evaluate';
import { toQuestionnaire, type FhirItem } from '@/lib/policy/encode/fhir';
import { parseMeasures, parseMeasuresDetailed } from '@/lib/policy/encode/measure';
import { normalizeNumerals } from '@/lib/policy/encode/dimensions';

function req<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('missing fixture');
  return v;
}

function policyOf(text: string, logic: 'all' | 'any' = 'all'): CriteriaPolicy {
  return {
    title: 'Generic Service',
    guidelineId: 'G',
    status: 'active',
    medicallyNecessary: [
      { heading: 'considered when', logic, criteria: [{ label: 'A', text, children: [] }] },
    ],
    notMedicallyNecessary: [],
    codes: [],
    provenance: [],
    warnings: [],
    stats: { groups: 1, criteria: 1, codes: 0 },
  };
}

function allLinkIds(items: FhirItem[]): string[] {
  const out: string[] = [];
  const walk = (xs: FhirItem[]): void =>
    xs.forEach((i) => {
      out.push(i.linkId);
      if (i.item) walk(i.item);
    });
  walk(items);
  return out;
}

describe('DEFECT 1 — a locally-negated threshold can never auto-approve the excluded population', () => {
  const policy = encodePolicy(policyOf('a BMI less than 35 is not medically necessary', 'any'), {
    service: 'Generic Service',
  });
  const crit = req(Object.values(policy.criteria).find((c) => c.measure?.field === 'bmi'));

  it('the criterion carries a review flag (ambiguous polarity, never auto-evaluated)', () => {
    expect(crit.reviewFlag).toBeDefined();
    expect(crit.measure?.negatedLocally).toBe(true);
  });

  it('BMI = 30 (inside the excluded band) is NOT approvable', () => {
    const d = evaluatePolicy(policy, { measures: { bmi: 30 } });
    expect(d.disposition).not.toBe('approvable');
  });
});

describe('DEFECT 2 — no phantom same-field measure, no duplicate linkId', () => {
  it('a co-located time unit ("30 days") does NOT become a bmi threshold', () => {
    const { measures } = parseMeasures(
      'The body mass index (BMI) documented on two occasions at least 30 days apart, of at least 40 kg/m²'
    );
    expect(measures).toHaveLength(1);
    expect(measures[0].field).toBe('bmi');
    expect(measures[0].value).toBe(40);
    expect(measures.some((m) => m.field === 'bmi' && m.value === 30)).toBe(false);
  });

  it('a variant value is not double-counted as a standalone threshold', () => {
    const { measures } = parseMeasures('BMI ≥ 40 (or ≥ 37.5 for persons of Asian ancestry)');
    expect(measures).toHaveLength(1);
    expect(measures[0].value).toBe(40);
    expect(measures.some((m) => m.value === 37.5)).toBe(false);
  });

  it('the Questionnaire has unique linkIds for both inputs (FHIR R4)', () => {
    for (const text of [
      'The body mass index (BMI) documented on two occasions at least 30 days apart, of at least 40 kg/m²',
      'BMI ≥ 40 (or ≥ 37.5 for persons of Asian ancestry)',
    ]) {
      const policy = encodePolicy(policyOf(text), { service: 'Generic Service' });
      const ids = allLinkIds(toQuestionnaire(policy).item);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('DEFECT 3 — compound BP goes through the same plausible-range gate as scalars', () => {
  const text =
    'systolic blood pressure greater than 500 mmHg and diastolic blood pressure greater than 300 mmHg';

  it('an out-of-range axis surfaces a review reason', () => {
    const { reviewReasons } = parseMeasuresDetailed(text);
    expect(reviewReasons.join(' ')).toMatch(/plausible range/i);
  });

  it('encodePolicy sets a review flag so it cannot auto-evaluate', () => {
    const policy = encodePolicy(policyOf(text), { service: 'Generic Service' });
    const crit = req(Object.values(policy.criteria).find((c) => c.measure?.kind === 'compound'));
    expect(crit.reviewFlag).toBeDefined();
  });

  it('an in-range BP does NOT get flagged', () => {
    const { reviewReasons } = parseMeasuresDetailed(
      'systolic blood pressure greater than 140 mmHg and diastolic blood pressure greater than 90 mmHg'
    );
    expect(reviewReasons).toHaveLength(0);
  });
});

describe('DEFECT 4 — word-numerals beyond twenty are not silently lost', () => {
  it('"BMI greater than forty kg/m²" ⇒ bmi > 40 (no longer dropped)', () => {
    const m = req(parseMeasures('BMI greater than forty kg/m²').measures[0]);
    expect(m.field).toBe('bmi');
    expect(m.operator).toBe('>');
    expect(m.value).toBe(40);
  });

  it('hyphenated compounds convert ("forty-five" ⇒ 45, "ninety-five" ⇒ 95)', () => {
    expect(normalizeNumerals('forty-five')).toBe('45');
    expect(normalizeNumerals('ninety-five')).toBe('95');
  });

  it('an unresolved vague numeral cue is flagged, not dropped silently', () => {
    const { measures, reviewReasons } = parseMeasuresDetailed('BMI greater than several kg/m²');
    expect(measures).toHaveLength(0);
    expect(reviewReasons.join(' ')).toMatch(/vague words/i);
  });
});
