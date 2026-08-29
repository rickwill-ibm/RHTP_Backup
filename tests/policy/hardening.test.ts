/**
 * Regression locks for the adversarial findings on the CRD / CQL / lifecycle / feedback modules:
 * maker/checker fail-closed, unknown-status degradation, conflicting-role surfacing, visible CQL
 * band suppression + bound validation, and deterministic override tie-breaking + immutability.
 */
import { describe, it, expect } from 'vitest';
import {
  applyTransition,
  canTransition,
  nextStatuses,
  TransitionError,
  type PolicyWorkflowRecord,
} from '@/lib/policy/workflow/lifecycle';
import { buildCoverageRules } from '@/lib/policy/crd/coverageRule';
import type { CodedProcedure } from '@/lib/policy/dtr/questionnairePackage';
import type { NormalizedPolicy } from '@/lib/policy';
import { buildCql } from '@/lib/policy/dtr/cql';
import { applyOverrides } from '@/lib/policy/review/feedback';

const policy = {
  policyId: 'p',
  source: 'X',
  sourceType: 'medical-clinical-policy-bulletin',
  title: 'T',
  category: 'c',
  requiresPA: true,
  determinationBasis: 'medical-necessity-criteria',
} as NormalizedPolicy;

describe('lifecycle — fail closed', () => {
  it('refuses approval when no submitter is recorded (no fail-open)', () => {
    const rec: PolicyWorkflowRecord = { policyId: 'p', status: 'ready-for-approval' };
    expect(() => applyTransition(rec, 'approved', 'checker', 'Practitioner/alice')).toThrow(
      TransitionError
    );
  });
  it('degrades gracefully on an unknown status instead of throwing TypeError', () => {
    expect(canTransition('bogus' as never, 'approved', 'checker')).toBe(false);
    expect(nextStatuses('bogus' as never)).toEqual([]);
  });
});

describe('coverageRule — conflict surfacing', () => {
  it('surfaces a conflicting-role duplicate deterministically (order-independent)', () => {
    const a: CodedProcedure[] = [
      { code: '43644', codeSystem: 'CPT', role: 'covered' },
      { code: '43644', codeSystem: 'CPT', role: 'not-covered' },
    ];
    const r1 = buildCoverageRules(policy, a);
    const r2 = buildCoverageRules(policy, [...a].reverse());
    expect(r1).toHaveLength(1);
    expect(r1[0].role).toBe('ambiguous');
    expect(r1[0].priorAuthRequired).toBe(true);
    expect(r1[0].reason).toMatch(/conflicting/i);
    // same outcome regardless of input order
    expect(r2[0].role).toBe('ambiguous');
  });
  it('same code + same role is a plain dedup (no conflict)', () => {
    const r = buildCoverageRules(policy, [
      { code: '43775', codeSystem: 'CPT', role: 'covered' },
      { code: '43775', codeSystem: 'CPT', role: 'covered' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].role).toBe('covered');
  });
});

describe('cql — visible band suppression + bound validation', () => {
  it('drops the band with a visible comment when the comorbidity value set is missing', () => {
    const cql = buildCql({
      libraryName: 'X',
      bmi: { threshold: 40, bandWithComorbidity: { lower: 35, upper: 40 } },
    });
    expect(cql).toContain('NOT computable: comorbidity value set missing');
    expect(cql).toContain('define "MeetsObesity": "BMIValue" >= 40');
    expect(cql).not.toContain('Qualifying Comorbidities');
  });
  it('drops a band with invalid bounds (lower >= upper) with a comment', () => {
    const cql = buildCql({
      libraryName: 'X',
      comorbidityValueSetUrl: 'urn:vs',
      bmi: { threshold: 40, bandWithComorbidity: { lower: 40, upper: 35 } },
    });
    expect(cql).toContain('invalid bounds');
    expect(cql).not.toContain('and "HasQualifyingComorbidity"');
  });
  it('keeps a valid band', () => {
    const cql = buildCql({
      libraryName: 'X',
      comorbidityValueSetUrl: 'urn:vs',
      bmi: { threshold: 40, bandWithComorbidity: { lower: 35, upper: 40 } },
    });
    expect(cql).toContain('"BMIValue" >= 35 and "BMIValue" < 40');
    expect(cql).toContain('valueset "Qualifying Comorbidities"');
  });
});

describe('feedback — override determinism + immutability', () => {
  it('breaks a version tie by later timestamp, not array order', () => {
    const base = { note: 'n', reviewer: 'r', version: 1 };
    const early = {
      code: '43847',
      role: 'investigational' as const,
      timestamp: '2026-01-01',
      ...base,
    };
    const late = { code: '43847', role: 'covered' as const, timestamp: '2026-02-01', ...base };
    expect(applyOverrides({ roles: {} }, [early, late]).roles?.['43847']).toBe('covered');
    expect(applyOverrides({ roles: {} }, [late, early]).roles?.['43847']).toBe('covered');
  });
  it('does not mutate the input contribution', () => {
    const input = { roles: { a: 'covered' as const }, flags: {}, diagnoses: [] };
    const snapshot = JSON.stringify(input);
    applyOverrides(input, [
      { code: 'a', suppressed: true, note: 'n', reviewer: 'r', timestamp: 't', version: 1 },
    ]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
