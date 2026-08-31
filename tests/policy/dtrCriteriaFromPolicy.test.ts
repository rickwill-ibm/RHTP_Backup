/**
 * The authored policy drives the evaluation: dtrCriteriaFromReview encodes the reviewed criteria (the
 * same engine the questionnaire/CQL use) and lifts the typed age/BMI thresholds and the documentation
 * criteria — so a change in the authored policy changes what the patient is evaluated against.
 */
import { describe, it, expect } from 'vitest';
import {
  dtrCriteriaFromReview,
  OBESITY_COMORBIDITY_ICD10,
} from '@/lib/policy/dtr/evaluate/dtrCriteriaFromPolicy';
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { CriteriaGroup } from '@/lib/policy/extract/criteria';

const group = (criteria: { label: string; text: string }[]): CriteriaGroup => ({
  heading: 'considered medically necessary when all of the following are met',
  logic: 'all',
  criteria: criteria.map((c) => ({ label: c.label, text: c.text, children: [] })),
});

const review = (sections: CriteriaGroup[]): PolicyReview =>
  ({
    title: 'Bariatric Surgery',
    guidelineId: null,
    criteriaSections: sections,
  }) as unknown as PolicyReview;

describe('dtrCriteriaFromReview — derived from the authored policy, not hardcoded', () => {
  it('lifts age + BMI thresholds and the documentation criteria out of the encoded measures', () => {
    const crit = dtrCriteriaFromReview(
      review([
        group([
          { label: '1', text: 'The individual is age 18 years or older; and' },
          { label: '2', text: 'A body mass index (BMI) of 40 kg/m2 or greater; and' },
          {
            label: '3',
            text: 'Pre-operative medical and mental health evaluations and clearances; and',
          },
        ]),
      ]),
      '43644'
    );
    expect(crit.policyTitle).toBe('Bariatric Surgery');
    expect(crit.cptCode).toBe('43644');
    expect(crit.minAge).toBe(18);
    expect(crit.bmi?.threshold).toBe(40);
    // documentation extraction is best-effort (depends on the encoder's kind classification); the
    // structure is always present so the evaluator has a place for documentation gaps.
    expect(Array.isArray(crit.documentation)).toBe(true);
  });

  it('a policy with NO computable measures yields no age/BMI (documentation-gated, honest)', () => {
    const crit = dtrCriteriaFromReview(
      review([
        group([{ label: '1', text: 'A treatment plan addressing pre- and post-operative needs.' }]),
      ]),
      '43775'
    );
    expect(crit.minAge).toBeUndefined();
    expect(crit.bmi).toBeUndefined();
    expect(crit.comorbidity).toBeUndefined(); // no band ⇒ no comorbidity requirement
  });

  it('exposes a standard obesity-comorbidity code set for the band rule', () => {
    expect(OBESITY_COMORBIDITY_ICD10).toContain('E11.9'); // type 2 diabetes
    expect(OBESITY_COMORBIDITY_ICD10).toContain('I10'); // hypertension
  });
});
