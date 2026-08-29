/**
 * Authoring "Generate DTR" is engine-sourced: typed items, OCR-repaired, no flat
 * "Does the member meet indication …?" wrapper. Pins the fix for the legacy flat generator.
 */
import { describe, it, expect } from 'vitest';
import { engineQuestionnaireItems } from '@/lib/policy/dtr/engineQuestionnaireItems';
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
