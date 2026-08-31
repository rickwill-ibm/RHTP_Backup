/**
 * The BMI-band + comorbidity gate (1c-B): the "BMI ≥ 35 WITH a qualifying comorbidity" band no longer
 * silently drops the ≥35 threshold. It surfaces as a real numeric item AND is required together with
 * the comorbidity choice — so BMI 36 alone does NOT qualify, BMI 36 + a comorbidity DOES. Synthetic +
 * payer-agnostic.
 */
import { describe, it, expect } from 'vitest';
import { evalCriterion } from '@/lib/policy/encode/evaluate';
import type { EncodedCriterion } from '@/lib/policy/encode/ir';
import { engineQuestionnaireItems } from '@/lib/policy/dtr/engineQuestionnaireItems';
import { extractCriteriaPolicy } from '@/lib/policy/extract/criteria';
import type { TextSource } from '@/lib/policy/extract/types';

const SPAN = { start: 0, end: 0 };
// A BMI≥35 band that also requires ≥1 comorbidity — the shape encodeNode now produces for such a node.
const band: EncodedCriterion = {
  id: 'band',
  label: 'B',
  sourceText: 'BMI 35 or greater with a qualifying comorbidity',
  sourceSpan: SPAN,
  sourceSection: 's',
  labelSource: 'extracted',
  kind: 'measure',
  measure: { kind: 'scalar', field: 'bmi', operator: '>=', value: 35 },
  children: [
    {
      id: 'band.comorbidity',
      label: 'B',
      sourceText: 'a qualifying comorbidity',
      sourceSpan: SPAN,
      sourceSection: 's',
      labelSource: 'inferred-by-position',
      kind: 'choice',
      choice: { valueSetId: 'band:vs', min: 1 },
    },
  ],
};

describe('BMI band requires the threshold AND a comorbidity', () => {
  it('BMI 36 + a comorbidity selected → met', () => {
    expect(evalCriterion(band, { measures: { bmi: 36 }, choiceSelections: { 'band:vs': 1 } })).toBe(
      'met'
    );
  });
  it('BMI 36 with NO comorbidity selected → not-met (does not auto-qualify)', () => {
    expect(evalCriterion(band, { measures: { bmi: 36 }, choiceSelections: { 'band:vs': 0 } })).toBe(
      'not-met'
    );
  });
  it('BMI 36 with the comorbidity question unanswered → unknown (needs info, never auto-approve)', () => {
    expect(evalCriterion(band, { measures: { bmi: 36 } })).toBe('unknown');
  });
  it('BMI 34 even with a comorbidity → not-met (threshold not met)', () => {
    expect(evalCriterion(band, { measures: { bmi: 34 }, choiceSelections: { 'band:vs': 1 } })).toBe(
      'not-met'
    );
  });
});

describe('both BMI thresholds surface in the questionnaire (the ≥35 band is not dropped)', () => {
  const mk = (text: string): TextSource => ({
    sourceFile: 'p.txt',
    mimeType: 'text/plain',
    text,
    rawTextChars: text.length,
  });
  const doc = mk(
    [
      'Clinical UM Guideline',
      'Medically Necessary:',
      'Bariatric surgery is medically necessary when the member has one of the following:',
      'A. A BMI of 40 kg/m² or greater; or',
      'B. A BMI of 35 kg/m² or greater with one or more of the following comorbidities:',
      '   i. Type 2 diabetes',
      '   ii. Hypertension',
      '   iii. Obstructive sleep apnea',
      'Coding',
      '43775 procedure',
      'References',
    ].join('\n')
  );
  it('emits a numeric item for BOTH the ≥40 and the ≥35 threshold plus a comorbidity choice', () => {
    const cp = extractCriteriaPolicy(doc);
    const items = engineQuestionnaireItems(cp.medicallyNecessary, { service: 'Svc' }) ?? [];
    const bmiNumeric = items.filter(
      (i) => (i.type === 'decimal' || i.type === 'integer') && /bmi|kg\/m|body mass/i.test(i.text)
    );
    expect(bmiNumeric.length).toBeGreaterThanOrEqual(2);
    const comorbidity = items.find(
      (i) => i.type === 'choice' && /comorbid|diabetes|apnea/i.test(i.text)
    );
    expect(comorbidity).toBeTruthy();
  });
});
