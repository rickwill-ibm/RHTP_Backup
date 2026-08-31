/**
 * Authoring "Generate DTR" is engine-sourced: typed items, OCR-repaired, no flat
 * "Does the member meet indication …?" wrapper. Pins the fix for the legacy flat generator.
 */
import { describe, it, expect } from 'vitest';
import { engineQuestionnaireItems } from '@/lib/policy/dtr/engineQuestionnaireItems';
import { VS_COMORBIDITY } from '@/lib/policy/dtr/conformance/valueSets';
import type { CriteriaGroup } from '@/lib/policy/extract/criteria';

const sections: CriteriaGroup[] = [
  {
    heading: 'considered medically necessary when all of the following are met',
    logic: 'all',
    criteria: [
      { label: 'A', text: 'Ill. The member is at least 18 years of age', children: [] },
      { label: 'C', text: 'A body mass index (BMI) greater than 40 kg/m²', children: [] },
    ],
  },
];

describe('engine-sourced authoring DTR items', () => {
  it('are typed and de-noised — no flat wrapper, OCR repaired, BMI/age typed', () => {
    const items = engineQuestionnaireItems(sections, { service: 'Bariatric Surgery' }) ?? [];
    const texts = items.map((i) => i.text);
    expect(texts.some((t) => /Does the member meet indication/i.test(t))).toBe(false);
    expect(texts.some((t) => /\bIll\./.test(t))).toBe(false); // OCR "Ill." repaired → III
    const types = items.map((i) => i.type);
    expect(types).toContain('integer'); // age ≥ 18 is a number, not a yes/no
    expect(types).toContain('decimal'); // BMI is a number
    expect(items.some((i) => i.type === 'attachment')).toBe(true); // documentation upload preserved
  });

  it('returns null when there is nothing to encode (caller keeps legacy items)', () => {
    expect(engineQuestionnaireItems([], {})).toBeNull();
    expect(engineQuestionnaireItems(undefined, {})).toBeNull();
  });
});

// Regression: real payer policies phrase enumerations as "one of the following …" (not only "one or
// more of …") and write "co-morbid" hyphenated. Both must produce a coded, value-set-bound choice
// rather than a pile of booleans with dangling "; or". Grounded in Elevance CG-SURG-83.
describe('engine-sourced DTR — one-of-N + open enumerations become bound choices', () => {
  const sections: CriteriaGroup[] = [
    {
      heading: 'is considered medically necessary when all of the following are met',
      logic: 'all',
      criteria: [
        {
          label: 'A',
          text: 'The recommended surgery is one of the following procedures:',
          children: [
            { label: '1', text: 'Sleeve gastrectomy; or', children: [] },
            { label: '2', text: 'Roux-en-Y gastric bypass; or', children: [] },
            { label: '3', text: 'Biliopancreatic diversion with duodenal switch', children: [] },
          ],
        },
        {
          label: 'B',
          text: 'An obesity-related co-morbid condition, including but not limited to:',
          children: [
            { label: '1', text: 'Diabetes mellitus; or', children: [] },
            { label: '2', text: 'Hypertension; or', children: [] },
            { label: '3', text: 'Obstructive sleep apnea', children: [] },
          ],
        },
      ],
    },
  ];

  it('turns a "one of the following procedures" list into a single choice (not N booleans)', () => {
    const items = engineQuestionnaireItems(sections, { service: 'Bariatric Surgery' }) ?? [];
    const proc = items.find((i) => i.text.includes('recommended surgery'));
    expect(proc?.type).toBe('choice');
    expect(proc?.answerOption?.length).toBe(3);
    // the dangling list conjunction is trimmed from option labels
    expect(proc?.answerOption?.some((o) => /;\s*or$/i.test(o.label ?? ''))).toBe(false);
  });

  it('binds a hyphenated "co-morbid" comorbidity list to obesity-comorbidity (not obesity-diagnosis)', () => {
    const items = engineQuestionnaireItems(sections, { service: 'Bariatric Surgery' }) ?? [];
    const comorb = items.find((i) => i.type === 'choice' && /co-?morbid/i.test(i.text));
    expect(comorb?.answerValueSet).toBe(VS_COMORBIDITY.url);
  });
});
