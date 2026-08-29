/**
 * CRD coverage rules — PA-required for covered/revision, not for not-covered/investigational,
 * PA+review for ambiguous, PA-pending for un-roled; deduped; questionnaire canonical matches policy.
 */
import { describe, it, expect } from 'vitest';
import { buildCoverageRules } from '@/lib/policy/crd/coverageRule';
import type { CodedProcedure } from '@/lib/policy/dtr/questionnairePackage';
import type { NormalizedPolicy } from '@/lib/policy';

const policy = {
  policyId: 'horizon/bariatric-022',
  source: 'Horizon',
  sourceType: 'medical-clinical-policy-bulletin',
  title: 'Bariatric Surgery',
  category: 'Medical necessity guideline',
  requiresPA: true,
  determinationBasis: 'medical-necessity-criteria',
} as NormalizedPolicy;

describe('buildCoverageRules', () => {
  it('maps roles to PA determinations', () => {
    const procs: CodedProcedure[] = [
      { code: '43775', codeSystem: 'CPT', role: 'covered' },
      { code: '43848', codeSystem: 'CPT', role: 'revision' },
      { code: '43842', codeSystem: 'CPT', role: 'not-covered' },
      { code: '43290', codeSystem: 'CPT', role: 'investigational' },
      { code: '43847', codeSystem: 'CPT', role: 'ambiguous' },
    ];
    const rules = buildCoverageRules(policy, procs);
    const by = (c: string) => rules.find((r) => r.code === c);
    expect(by('43775')?.priorAuthRequired).toBe(true);
    expect(by('43848')?.priorAuthRequired).toBe(true);
    expect(by('43842')?.priorAuthRequired).toBe(false);
    expect(by('43290')?.priorAuthRequired).toBe(false);
    expect(by('43847')?.priorAuthRequired).toBe(true); // ambiguous → PA + review note
    expect(by('43847')?.reason).toMatch(/documentation/i);
    expect(by('43775')?.questionnaireCanonical).toBe(
      'urn:rhtp:dtr/Questionnaire/horizon-bariatric-022'
    );
  });

  it('without roles, every referenced procedure is PA-required pending review', () => {
    const rules = buildCoverageRules(policy, [{ code: '43775', codeSystem: 'CPT' }]);
    expect(rules[0].priorAuthRequired).toBe(true);
    expect(rules[0].role).toBe('referenced');
    expect(rules[0].reason).toMatch(/pending review/i);
  });

  it('de-dups by system+code', () => {
    const rules = buildCoverageRules(policy, [
      { code: '43775', codeSystem: 'CPT', role: 'covered' },
      { code: '43775', codeSystem: 'CPT', role: 'covered' },
    ]);
    expect(rules).toHaveLength(1);
  });
});
