/**
 * CRD derivation — patient-aware, published-rule-driven checklist.
 * Lenses: guards-fail-closed (eligibility/PA never assumed), no-silent-degradation
 * (unverified network is not a pass), determination-not-check (C3), precision-not-recall
 * (card parsing).
 */
import { describe, it, expect } from 'vitest';
import { deriveCrdResult, parseCrdCards } from '@/lib/pa/crdDerivation';
import { coverageRuleForCode } from '@/lib/pa/publishedCoverage';
import { getPatientContext, type PatientContext } from '@/lib/pa/patientContext';

function req<T>(v: T | undefined | null): T {
  if (v == null) throw new Error('missing fixture');
  return v;
}
const maria = req(getPatientContext('MARIA_SD_001'));

describe('CRD reads the member coverage, not a hardcoded payer', () => {
  it('enrolled/eligible detail comes from the patient coverage', () => {
    const r = deriveCrdResult(maria, '72148', coverageRuleForCode('72148'), {
      serviceDate: '2026-07-20',
    });
    expect(r.patientEnrolled.pass).toBe(true);
    expect(r.patientEnrolled.detail).toContain('South Dakota Medicaid');
    expect(r.patientEnrolled.detail).toContain(maria.coverage.memberId);
    expect(r.patientEligible.pass).toBe(true);
  });

  it('a different member surfaces a different payer/plan (no SD constant)', () => {
    const priya = req(getPatientContext('patient-priya-natarajan'));
    const r = deriveCrdResult(priya, '71275', coverageRuleForCode('71275'), {
      serviceDate: '2026-07-28',
    });
    expect(r.patientEnrolled.detail).toContain('Dakota Health Plan');
    expect(r.patientEnrolled.detail).not.toContain('South Dakota Medicaid');
  });
});

describe('eligibility fails closed', () => {
  const inactive: PatientContext = {
    ...maria,
    coverage: { ...maria.coverage, coverageStatus: 'inactive' },
  };
  it('inactive coverage is not enrolled and not eligible', () => {
    const r = deriveCrdResult(inactive, '72148', coverageRuleForCode('72148'));
    expect(r.patientEnrolled.pass).toBe(false);
    expect(r.patientEligible.pass).toBe(false);
  });
  it('service date before verification is not eligible', () => {
    const r = deriveCrdResult(maria, '72148', coverageRuleForCode('72148'), {
      serviceDate: '2026-06-01',
    });
    expect(r.patientEligible.pass).toBe(false);
    expect(r.patientEligible.detail.toLowerCase()).toContain('not confirmed');
  });
});

describe('provider network is unverified unless signalled (no-silent-degradation)', () => {
  it('no signal ⇒ not a pass, labeled unverified', () => {
    const r = deriveCrdResult(maria, '72148', coverageRuleForCode('72148'), {
      orderingProvider: 'Dr. Whitfield',
    });
    expect(r.providerInNetwork.pass).toBe(false);
    expect(r.providerInNetwork.detail.toLowerCase()).toContain('not verified');
  });
  it('explicit in-network signal ⇒ pass', () => {
    const r = deriveCrdResult(maria, '72148', coverageRuleForCode('72148'), {
      orderingProviderInNetwork: true,
      orderingProvider: 'Dr. Whitfield',
    });
    expect(r.providerInNetwork.pass).toBe(true);
    expect(r.providerInNetwork.detail).toContain('in-network');
  });
});

describe('PA required is a determination, not a passed check (C3)', () => {
  it('carries required=true from the published rule and is not styled as pass/fail data', () => {
    const r = deriveCrdResult(maria, '72148', coverageRuleForCode('72148'));
    expect(r.paRequired.required).toBe(true);
    expect(r.paRequired.label).toMatch(/determination/i);
    expect(r.paRequired.detail).toMatch(/REQUIRED/);
  });
  it('an unpublished code fails honest: PA required, review pending', () => {
    const rule = coverageRuleForCode('99999');
    expect(rule.priorAuthRequired).toBe(true);
    expect(rule.reason).toMatch(/review/i);
  });
});

describe('parseCrdCards precision-not-recall', () => {
  it('returns undefined when no cards or none relevant', () => {
    expect(parseCrdCards(undefined)).toBeUndefined();
    expect(parseCrdCards([])).toBeUndefined();
  });
  it('only a PA-speaking card sets the determination', () => {
    const sig = parseCrdCards([{ summary: 'Prior authorization required for this service' }]);
    expect(sig?.priorAuthRequired).toBe(true);
  });
  it('an explicit "not required" negates', () => {
    const sig = parseCrdCards([{ summary: 'Prior auth not required for this member' }]);
    expect(sig?.priorAuthRequired).toBe(false);
  });
  it('a card signal overrides the rule determination in derive', () => {
    const r = deriveCrdResult(maria, '72148', coverageRuleForCode('72148'), {
      cardSignal: { priorAuthRequired: false, notes: [] },
    });
    expect(r.paRequired.required).toBe(false);
  });
});

describe('parseCrdCards guideline-conflict precision (RT-1)', () => {
  it('does NOT flag a conflict from a "no conflicting guideline" info card', () => {
    const sig = parseCrdCards([
      { summary: 'No conflicting Milliman/InterQual guideline identified', indicator: 'info' },
    ]);
    // may be undefined (nothing relevant) or present but not a conflict — never a true conflict
    expect(sig?.guidelineConflict ?? false).toBe(false);
  });
  it('flags a conflict only from a warning/critical card that asserts one', () => {
    const sig = parseCrdCards([
      { summary: 'Conflicting utilization guideline applies', indicator: 'warning' },
    ]);
    expect(sig?.guidelineConflict).toBe(true);
  });
  it('an info card asserting a conflict without severity is not treated as a hard conflict', () => {
    const sig = parseCrdCards([{ summary: 'Conflicting guideline note', indicator: 'info' }]);
    expect(sig?.guidelineConflict ?? false).toBe(false);
  });
});
