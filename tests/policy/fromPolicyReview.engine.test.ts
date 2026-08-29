/**
 * The Encoding Review panel reflects the engine's TYPED criteria: a measure lands in the
 * Value-thresholds ('bmi') section with a readable label ("Age ≥ 18 years", "BMI > 40 kg/m²"),
 * not as an opaque line of text. Fixes "age and other criteria not reflected".
 */
import { describe, it, expect } from 'vitest';
import { reviewElementsFromPolicy } from '@/lib/policy/review/fromPolicyReview';
import type { PolicyReview } from '@/lib/policy/policyReview';

const review: PolicyReview = {
  kind: 'criteria',
  tenant: null,
  title: 'Bariatric Surgery',
  policyId: 'bari',
  guidelineId: 'HORIZON-BARIATRIC',
  source: 'Bariatric Surgery',
  sourceFile: 'bari.pdf',
  status: 'draft',
  promotable: true,
  criteriaSections: [
    {
      heading: 'medically necessary when all of the following are met',
      logic: 'all',
      criteria: [
        { label: 'A', text: 'The member is at least 18 years of age', children: [] },
        { label: 'B', text: 'A body mass index (BMI) greater than 40 kg/m²', children: [] },
      ],
    },
  ],
  guidelineCodes: [{ code: '43775', codeSystem: 'CPT', description: 'Sleeve gastrectomy' }],
  item: [],
  provenance: [],
  warnings: [],
  stats: { format: 'criteria', codes: 1, criteria: 2 },
};

describe('encoding-review reflects typed engine criteria', () => {
  const elements = reviewElementsFromPolicy(review);

  it('age and BMI appear as typed Value-threshold elements with readable labels', () => {
    const thresholds = elements.filter((e) => e.kind === 'bmi');
    const labels = thresholds.map((e) => e.label);
    expect(labels).toContain('Age ≥ 18 years');
    expect(labels).toContain('BMI > 40 kg/m²');
  });

  it('the procedure code is still surfaced for coverage-role assignment', () => {
    expect(elements.some((e) => e.kind === 'procedure' && e.code === '43775')).toBe(true);
  });

  it('no criterion is rendered as an opaque "Does the member meet indication" line', () => {
    expect(elements.every((e) => !/Does the member meet indication/i.test(e.label))).toBe(true);
  });
});
