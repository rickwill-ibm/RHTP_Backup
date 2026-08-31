/**
 * Regression (red-team Finding 1+2): a not-covered / investigational code emits an EMPTY DTR canonical.
 * When such a code is harvested BEFORE a covered one, the policy-level canonical and the covered rule's
 * pathway must NOT be blanked; and projecting a rule with its own section-inferred default must be a
 * verbatim no-op (engine reason preserved). Synthetic + payer-agnostic.
 */
import { describe, it, expect } from 'vitest';
import { engineCoverageRulesForReview } from '@/lib/policy/crd/engineCoverageRules';
import { projectCoverageRules } from '@/components/policy/workbench/generateInputs';
import type { CriteriaGroup, GuidelineCode } from '@/lib/policy/extract/criteria';
import type { CodeDisposition } from '@/lib/policy/crd/coverageDisposition';

const sections: CriteriaGroup[] = [
  {
    heading: 'medically necessary when all of the following are met',
    logic: 'all',
    criteria: [{ label: 'A', text: 'BMI greater than 40 kg/m²', children: [] }],
  },
];
// investigational code FIRST (index 0), covered code SECOND — the order that triggered the blanking bug.
const codes: GuidelineCode[] = [
  {
    code: '00488',
    codeSystem: 'CPT',
    description: 'Investigational procedure',
    sourceSection: 'coding-appendix',
  },
  {
    code: '43775',
    codeSystem: 'CPT',
    description: 'Covered procedure',
    sourceSection: 'coding-appendix',
  },
];
const dispositions: Record<string, CodeDisposition> = {
  '00488': 'investigational',
  '43775': 'covered-pa',
};

describe('canonical is not blanked by an excluded code harvested first', () => {
  const rules =
    engineCoverageRulesForReview(sections, codes, {
      service: 'Svc',
      policyId: 'p',
      policyTitle: 'P',
      dispositions,
    }) ?? [];
  const inv = rules.find((r) => r.code === '00488');
  const covered = rules.find((r) => r.code === '43775');

  it('the investigational code has no pathway but the covered code keeps a real canonical', () => {
    expect(inv?.role).toBe('investigational');
    expect(inv?.questionnaireCanonical).toBe('');
    expect(covered?.role).toBe('covered');
    expect(covered?.questionnaireCanonical).toBeTruthy();
    expect(covered?.questionnaireCanonical).toContain('urn:rhtp:dtr/Questionnaire/');
  });

  it('projecting with the same dispositions is a verbatim no-op (reason preserved)', () => {
    const projected = projectCoverageRules(rules, dispositions, covered?.questionnaireCanonical);
    const pCovered = projected.find((r) => r.code === '43775');
    const pInv = projected.find((r) => r.code === '00488');
    // referential identity — the rule was returned untouched, so reason text never diverges
    expect(pCovered).toBe(covered);
    expect(pInv).toBe(inv);
  });
});
