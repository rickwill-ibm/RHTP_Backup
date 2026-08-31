/**
 * The shared coverage-DISPOSITION truth table (crd/coverageDisposition.ts). One source of truth for
 * turning a per-code determination into (engine input, role, PA, coverage-info, DTR pathway). Payer-
 * agnostic: nothing here references any payer or policy by name.
 */
import { describe, it, expect } from 'vitest';
import {
  applyDisposition,
  coverageInfoFor,
  dispositionHasPathway,
  dispositionToInput,
  dispositionToRole,
  priorAuthForDisposition,
  type CodeDisposition,
} from '@/lib/policy/crd/coverageDisposition';
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';

const ALL: CodeDisposition[] = ['covered-pa', 'not-covered', 'investigational', 'pending'];

const baseRule: CoverageRule = {
  code: '12345',
  codeSystem: 'CPT',
  display: 'Example procedure',
  priorAuthRequired: true,
  policyId: 'p',
  policyTitle: 'Example Policy',
  questionnaireCanonical: 'urn:rhtp:dtr/Questionnaire/p',
  role: 'referenced',
  reason: 'seed',
};

describe('dispositionToInput → engine coverage input', () => {
  it('hands covered-pa to the engine as auth-needed (engine derives covered + PA)', () => {
    expect(dispositionToInput('covered-pa')).toEqual({ coverageCode: 'auth-needed' });
  });
  it('distinguishes a plain exclusion from an investigational one by basis', () => {
    expect(dispositionToInput('not-covered')).toEqual({
      coverageCode: 'not-covered',
      basis: 'benefit-exclusion',
    });
    expect(dispositionToInput('investigational')).toEqual({
      coverageCode: 'not-covered',
      basis: 'experimental-investigational',
    });
  });
  it('omits the coverage code for pending so the engine treats it as policy-referenced', () => {
    expect(dispositionToInput('pending')).toEqual({});
  });
});

describe('role / PA / pathway by disposition', () => {
  it('maps roles honestly', () => {
    expect(dispositionToRole('covered-pa')).toBe('covered');
    expect(dispositionToRole('not-covered')).toBe('not-covered');
    expect(dispositionToRole('investigational')).toBe('investigational');
    expect(dispositionToRole('pending')).toBe('referenced');
  });
  it('requires PA only for covered·PA and pending', () => {
    expect(priorAuthForDisposition('covered-pa')).toBe(true);
    expect(priorAuthForDisposition('pending')).toBe(true);
    expect(priorAuthForDisposition('not-covered')).toBe(false);
    expect(priorAuthForDisposition('investigational')).toBe(false);
  });
  it('advertises a DTR pathway only for covered·PA and pending', () => {
    expect(dispositionHasPathway('covered-pa')).toBe(true);
    expect(dispositionHasPathway('pending')).toBe(true);
    expect(dispositionHasPathway('not-covered')).toBe(false);
    expect(dispositionHasPathway('investigational')).toBe(false);
  });
});

describe('coverageInfoFor — CRD coded classification', () => {
  it('covered·PA carries covered + prior-auth-required, never pending', () => {
    const info = coverageInfoFor('covered', true);
    expect(info.some((c) => c.code === 'covered')).toBe(true);
    expect(info.some((c) => c.code === 'prior-auth-required')).toBe(true);
    expect(info.some((c) => c.code === 'pending-review')).toBe(false);
  });
  it('investigational carries not-covered + experimental-investigational, no PA line', () => {
    const info = coverageInfoFor('investigational', false);
    expect(info.some((c) => c.code === 'not-covered')).toBe(true);
    expect(info.some((c) => c.code === 'experimental-investigational')).toBe(true);
    expect(info.some((c) => c.code.includes('auth'))).toBe(false);
  });
  it('referenced is pending-review, never covered', () => {
    const info = coverageInfoFor('referenced', true);
    expect(info.some((c) => c.code === 'pending-review')).toBe(true);
    expect(info.some((c) => c.code === 'covered')).toBe(false);
  });
});

describe('applyDisposition — client projection', () => {
  it('projects each disposition onto a rule consistently with the truth table', () => {
    const covered = applyDisposition(baseRule, 'covered-pa');
    expect(covered.role).toBe('covered');
    expect(covered.priorAuthRequired).toBe(true);
    expect(covered.questionnaireCanonical).toBe(baseRule.questionnaireCanonical);

    const denied = applyDisposition(baseRule, 'not-covered');
    expect(denied.role).toBe('not-covered');
    expect(denied.priorAuthRequired).toBe(false);
    // a denied code drops its DTR pathway
    expect(denied.questionnaireCanonical).toBe('');

    const inv = applyDisposition(baseRule, 'investigational');
    expect(inv.role).toBe('investigational');
    expect(inv.questionnaireCanonical).toBe('');
  });

  it('is idempotent — applying the same disposition twice is a fixed point', () => {
    for (const d of ALL) {
      const once = applyDisposition(baseRule, d);
      const twice = applyDisposition(once, d);
      expect(twice).toEqual(once);
    }
  });

  it('re-projection recovers a pathway when a denied code is later re-decided covered', () => {
    const denied = applyDisposition(baseRule, 'not-covered');
    const reCovered = applyDisposition(denied, 'covered-pa', {
      canonical: baseRule.questionnaireCanonical,
    });
    expect(reCovered.questionnaireCanonical).toBe(baseRule.questionnaireCanonical);
    expect(reCovered.priorAuthRequired).toBe(true);
  });
});
