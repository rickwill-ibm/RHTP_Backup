/**
 * Boundary invariant (generalized): an "including, but not limited to" comorbidity list must bind a
 * value set of ONLY clinical conditions, and any sibling DOCUMENTATION criteria (weight-loss-program
 * history, pre-operative evaluations/education, treatment plan) must surface as their OWN items — never
 * folded into the comorbidity value set as if they were conditions.
 *
 * This pins the class, not one payer: a payer-agnostic synthetic fixture proves the structural rule,
 * and the real Elevance CG-SURG-83 policy proves it end-to-end through the PDF pipeline. Both guard the
 * historical over-capture (documentation options leaking into the comorbidity choice) from regressing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pdfToTextSource } from '@/lib/policy/server/pdfIntake';
import { extractCriteriaPolicy } from '@/lib/policy/extract/criteria';
import { engineQuestionnaireItems } from '@/lib/policy/dtr/engineQuestionnaireItems';
import { VS_COMORBIDITY } from '@/lib/policy/dtr/conformance/valueSets';
import type { CriteriaGroup } from '@/lib/policy/extract/criteria';
import type { QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';

// Process/documentation phrasing that must NEVER appear as a coded CONDITION option in a value set.
const NON_CONDITION =
  /weight loss program|pre-?operative|treatment plan|evaluation|education|counsel|supervised|conservative (?:medical )?therapy|participation|clearance|adherence/i;

/** No choice item anywhere may carry an option that reads like documentation, not a condition. */
function assertNoDocumentationLeak(items: QuestionnaireItemDef[]): void {
  const leaks: string[] = [];
  for (const it of items) {
    if (it.type !== 'choice') continue;
    for (const o of it.answerOption ?? []) {
      const label = String(o.label ?? o.value ?? '');
      if (NON_CONDITION.test(label))
        leaks.push(`"${it.text.slice(0, 40)}" ← "${label.slice(0, 50)}"`);
    }
  }
  expect(leaks).toEqual([]);
}

describe('comorbidity / documentation boundary — payer-agnostic synthetic', () => {
  const sections: CriteriaGroup[] = [
    {
      heading: 'is considered medically necessary when all of the following are met',
      logic: 'all',
      criteria: [
        { label: 'A', text: 'The individual is age 18 years or older', children: [] },
        {
          label: 'C',
          text: 'A body mass index (BMI) of one of the following:',
          children: [
            { label: '1', text: '40 or greater', children: [] },
            {
              label: '2',
              text: '35 or greater with an obesity-related co-morbid condition, including but not limited to:',
              children: [
                { label: 'a', text: 'Diabetes mellitus; or', children: [] },
                { label: 'b', text: 'Hypertension; or', children: [] },
                { label: 'c', text: 'Obstructive sleep apnea', children: [] },
              ],
            },
          ],
        },
        {
          label: 'D',
          text: 'Documentation of all of the following:',
          children: [
            { label: '1', text: 'Past participation in a weight loss program', children: [] },
            {
              label: '2',
              text: 'Pre-operative medical and mental health evaluations and clearances',
              children: [],
            },
            {
              label: '3',
              text: 'A treatment plan which addresses the pre- and post-operative needs',
              children: [],
            },
          ],
        },
      ],
    },
  ];

  it('binds ONLY the true conditions to the comorbidity value set', () => {
    const items = engineQuestionnaireItems(sections, { service: 'Bariatric Surgery' }) ?? [];
    const comorb = items.find((i) => i.type === 'choice' && /co-?morbid/i.test(i.text));
    expect(comorb).toBeDefined();
    expect(comorb?.answerValueSet).toBe(VS_COMORBIDITY.url);
    expect(comorb?.answerOption?.length).toBe(3); // exactly the 3 conditions — not the documentation items
    expect((comorb?.answerOption ?? []).every((o) => !NON_CONDITION.test(String(o.label)))).toBe(
      true
    );
  });

  it('surfaces each documentation criterion as its own item, never as a comorbidity option', () => {
    const items = engineQuestionnaireItems(sections, { service: 'Bariatric Surgery' }) ?? [];
    for (const phrase of [
      /weight loss program/i,
      /evaluations and clearances/i,
      /treatment plan/i,
    ]) {
      const own = items.find((i) => phrase.test(i.text));
      expect(own, `documentation item missing: ${phrase}`).toBeDefined();
      expect(own?.type).not.toBe('choice'); // not a coded choice
      expect(own?.answerValueSet).toBeUndefined(); // never value-set bound
    }
    assertNoDocumentationLeak(items);
  });
});

describe('comorbidity / documentation boundary — real Elevance CG-SURG-83 (end-to-end PDF)', () => {
  it('comorbidity choice is conditions-only; the 5 documentation items stay separate', async () => {
    const src = await pdfToTextSource(
      new Uint8Array(readFileSync('tests/fixtures/elevance-cgsurg83.pdf')),
      'CG-SURG-83.pdf'
    );
    const p = extractCriteriaPolicy(src);
    const items =
      engineQuestionnaireItems(p.medicallyNecessary, {
        service: 'Bariatric Surgery',
        guidelineId: p.guidelineId ?? undefined,
        codes: p.codes,
      }) ?? [];

    const comorbChoices = items.filter((i) => i.type === 'choice' && /co-?morbid/i.test(i.text));
    expect(comorbChoices.length).toBeGreaterThanOrEqual(1);
    for (const c of comorbChoices) {
      expect(c.answerValueSet).toBe(VS_COMORBIDITY.url);
      expect(c.answerOption?.length).toBe(4); // diabetes, cardiovascular, hypertension, cardio-pulmonary
      expect((c.answerOption ?? []).every((o) => !NON_CONDITION.test(String(o.label)))).toBe(true);
    }

    // The five documentation criteria each remain their own item (not swallowed into the value set).
    for (const phrase of [
      /participation in a weight loss program/i,
      /inadequate weight loss/i,
      /medical and mental health evaluations/i,
      /pre-operative education/i,
      /treatment plan which addresses/i,
    ]) {
      const own = items.find((i) => phrase.test(i.text));
      expect(own, `documentation item missing: ${phrase}`).toBeDefined();
      expect(own?.answerValueSet).toBeUndefined();
    }

    assertNoDocumentationLeak(items);
  });
});
