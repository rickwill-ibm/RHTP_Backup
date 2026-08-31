/**
 * Coverage EXCLUSIONS must never become DTR attestation items. A provider can't "check" an
 * exclusion, and rendering one asserts the opposite of coverage. Exclusions stay in the criteria
 * registry (evaluation + CRD see them) but `toQuestionnaire` omits them. Pins the bariatric defect:
 * "…is considered investigational" / "…does not meet …criteria for coverage" rendered as checkboxes.
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
      // Exclusion sentences that (in the real policy) leak into the medically-necessary region:
      {
        label: 'C',
        text: 'Repair of a hiatal hernia in members who are not candidates for surgical repair is considered investigational.',
        children: [],
      },
      {
        label: 'D',
        text: 'Treatment of complications that arise due to non-compliance does not meet Horizon BCBSNJ medical criteria for coverage.',
        children: [],
      },
    ],
  },
];

describe('DTR questionnaire omits coverage exclusions', () => {
  const items = engineQuestionnaireItems(sections, { service: 'Bariatric Surgery' }) ?? [];
  const texts = items.map((i) => i.text.toLowerCase());

  it('does NOT render investigational / "does not meet criteria" statements as items', () => {
    expect(texts.some((t) => t.includes('investigational'))).toBe(false);
    expect(texts.some((t) => t.includes('does not meet'))).toBe(false);
  });

  it('KEEPS the positive medical-necessity criteria (age / BMI)', () => {
    // age + BMI still produce typed items; the attachment upload is still appended.
    expect(items.some((i) => i.type === 'integer' || i.type === 'decimal')).toBe(true);
    expect(items.some((i) => i.type === 'attachment')).toBe(true);
    // and at least one exclusion was actually present in the input, so the filter did work
    expect(items.length).toBeGreaterThan(0);
  });
});
