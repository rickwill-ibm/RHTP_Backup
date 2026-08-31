/**
 * The Generate-stage projection (components/policy/workbench/generateInputs.ts): the maker's final
 * per-code decisions — not the frozen ingest snapshot — drive the published CRD. With the defaults and
 * no override, projecting reproduces the ingest rules; an override re-projects just that rule.
 */
import { describe, it, expect } from 'vitest';
import { projectCoverageRules } from '@/components/policy/workbench/generateInputs';
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';
import type { CodeDisposition } from '@/lib/policy/crd/coverageDisposition';

const canonical = 'urn:rhtp:dtr/Questionnaire/p';
const coveredRule: CoverageRule = {
  code: '11111',
  codeSystem: 'CPT',
  display: 'A',
  priorAuthRequired: true,
  policyId: 'p',
  policyTitle: 'P',
  questionnaireCanonical: canonical,
  role: 'covered',
  coverageInfo: [{ system: 's', code: 'covered', display: 'Covered' }],
  reason: 'built',
};

describe('projectCoverageRules', () => {
  it('leaves a rule untouched when there is no decision on record', () => {
    const out = projectCoverageRules([coveredRule], {}, canonical);
    expect(out[0]).toBe(coveredRule); // referential identity — no reprojection
  });

  it('is a fixed point when the decision matches how the rule was already built', () => {
    const dispositions: Record<string, CodeDisposition> = { '11111': 'covered-pa' };
    const out = projectCoverageRules([coveredRule], dispositions, canonical);
    expect(out[0].role).toBe('covered');
    expect(out[0].priorAuthRequired).toBe(true);
    expect(out[0].questionnaireCanonical).toBe(canonical);
  });

  it('re-projects a rule the maker overrode to investigational (denied, no pathway)', () => {
    const out = projectCoverageRules([coveredRule], { '11111': 'investigational' }, canonical);
    expect(out[0].role).toBe('investigational');
    expect(out[0].priorAuthRequired).toBe(false);
    expect(out[0].questionnaireCanonical).toBe('');
    expect(out[0].coverageInfo?.some((c) => c.code === 'experimental-investigational')).toBe(true);
  });

  it('is idempotent — projecting the projection is stable', () => {
    const d: Record<string, CodeDisposition> = { '11111': 'not-covered' };
    const once = projectCoverageRules([coveredRule], d, canonical);
    const twice = projectCoverageRules(once, d, canonical);
    expect(twice).toEqual(once);
  });
});
