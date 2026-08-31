/**
 * Authoring "Generate CRD" is engine-sourced: one rule per authored code, code systems preserved,
 * and the DTR Questionnaire canonical single-sourced from the same engine encode.
 */
import { describe, it, expect } from 'vitest';
import { engineCoverageRulesForReview } from '@/lib/policy/crd/engineCoverageRules';
import type { CriteriaGroup, GuidelineCode } from '@/lib/policy/extract/criteria';

function req<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('missing fixture');
  return v;
}

const codes: GuidelineCode[] = [
  { code: '43775', codeSystem: 'CPT', description: 'Sleeve gastrectomy' },
  { code: 'S2083', codeSystem: 'HCPCS', description: 'Band adjustment' },
];
const sections: CriteriaGroup[] = [
  {
    heading: 'medically necessary when all of the following are met',
    logic: 'all',
    criteria: [{ label: 'A', text: 'A body mass index (BMI) greater than 40 kg/m²', children: [] }],
  },
];

describe('engine-sourced authoring CRD coverage rules', () => {
  it('emits one rule per code with systems + canonical preserved', () => {
    const rules =
      engineCoverageRulesForReview(sections, codes, {
        service: 'Bariatric Surgery',
        policyId: 'bariatric',
        policyTitle: 'Bariatric Surgery',
      }) ?? [];
    expect(rules.length).toBe(2);
    const sleeve = req(rules.find((r) => r.code === '43775'));
    expect(sleeve.codeSystem).toBe('CPT');
    expect(sleeve.priorAuthRequired).toBe(true);
    // Pre-review coverage is UNDETERMINED — honest 'referenced' (pending review), never a fake 'covered'.
    expect(sleeve.role).toBe('referenced');
    // …and it carries a coded coverage-information classification (pending-review, not "covered").
    expect(sleeve.coverageInfo?.some((c) => c.code === 'pending-review')).toBe(true);
    expect(sleeve.coverageInfo?.some((c) => c.code === 'prior-auth-required')).toBe(true);
    expect(sleeve.coverageInfo?.some((c) => c.code === 'covered')).toBe(false);
    expect(sleeve.questionnaireCanonical).toContain('urn:rhtp:dtr/Questionnaire/');
    const band = req(rules.find((r) => r.code === 'S2083'));
    expect(band.codeSystem).toBe('HCPCS');
    // CRD rule and DTR items share one questionnaire canonical (single-sourced from the engine)
    expect(band.questionnaireCanonical).toBe(sleeve.questionnaireCanonical);
  });

  it('returns null when there are no codes to rule on (caller keeps legacy rules)', () => {
    expect(
      engineCoverageRulesForReview(sections, [], { policyId: 'p', policyTitle: 'P' })
    ).toBeNull();
    expect(
      engineCoverageRulesForReview(sections, undefined, { policyId: 'p', policyTitle: 'P' })
    ).toBeNull();
  });
});
