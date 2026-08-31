/**
 * The production DTR pipeline now emits CODED items: a typed measure (BMI, age, …) carries its
 * standard LOINC coding through `engineQuestionnaireItems` → `QuestionnaireItemDef.code`, so the
 * generated questionnaire is coded FHIR, not bare text. Pins the coding carry-through.
 */
import { describe, it, expect } from 'vitest';
import { engineQuestionnaireItems } from '@/lib/policy/dtr/engineQuestionnaireItems';
import type { CriteriaGroup } from '@/lib/policy/extract/criteria';

const sections: CriteriaGroup[] = [
  {
    heading: 'considered medically necessary when all of the following are met',
    logic: 'all',
    criteria: [
      { label: 'A', text: 'The member is at least 18 years of age', children: [] },
      { label: 'B', text: 'A body mass index (BMI) greater than 40 kg/m²', children: [] },
    ],
  },
];

describe('engine DTR items are LOINC-coded', () => {
  const items = engineQuestionnaireItems(sections, { service: 'Bariatric Surgery' }) ?? [];

  it('codes the BMI item to LOINC 39156-5', () => {
    const bmi = items.find((i) => /body mass index/i.test(i.text));
    expect(bmi?.code?.some((c) => c.system === 'http://loinc.org' && c.code === '39156-5')).toBe(
      true
    );
  });

  it('codes the age item to LOINC 30525-0', () => {
    const age = items.find((i) => /years of age/i.test(i.text));
    expect(age?.code?.some((c) => c.system === 'http://loinc.org' && c.code === '30525-0')).toBe(
      true
    );
  });

  it('INVARIANT: every carried coding has a real system + code (never a bare label)', () => {
    for (const i of items) {
      for (const c of i.code ?? []) {
        expect(c.system).toMatch(/^https?:\/\//);
        expect(c.code.length).toBeGreaterThan(0);
      }
    }
  });
});
