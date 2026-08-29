/**
 * CRD coverage-view model — data-driven, production-general (any patient/plan/order).
 * Lenses: same-template-different-data, honest-altitude (no per-criterion Met at CRD; benefits
 * labeled eligibility), determination-not-check.
 */
import { describe, it, expect } from 'vitest';
import { buildCrdCoverageViewModel, initialsOf } from '@/lib/pa/crdCoverageView';
import { deriveCrdResult } from '@/lib/pa/crdDerivation';
import { coverageRuleForCode } from '@/lib/pa/publishedCoverage';
import { getPatientContext } from '@/lib/pa/patientContext';

function req<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('fixture');
  return v;
}

const maria = req(getPatientContext('MARIA_SD_001'));
const priya = req(getPatientContext('patient-priya-natarajan'));

function vm(ctx: typeof maria, code: string, provider: string) {
  const rule = coverageRuleForCode(code);
  const determination = deriveCrdResult(ctx, code, rule, {
    serviceDate: '2026-08-27',
    orderingProviderInNetwork: true,
    orderingProvider: provider,
  });
  return buildCrdCoverageViewModel({
    ctx,
    determination,
    rule,
    order: { desc: rule.policyTitle, cpt: code, orderedOn: '08/27/2026', provider },
    referenceId: 'CRD-TEST-0001',
  });
}

describe('initials', () => {
  it('derives initials from a name', () => {
    expect(initialsOf('Maria Redhawk')).toBe('MR');
    expect(initialsOf('Priya Natarajan')).toBe('PN');
    expect(initialsOf('Cher')).toBe('C');
  });
});

describe('the SAME builder renders different members/plans/orders', () => {
  const m = vm(maria, '72148', 'James Whitfield, MD');
  const p = vm(priya, '71275', 'Robert Jones, MD');

  it('Medicaid member: minimal benefits, no deductible row', () => {
    expect(m.payer).toBe('South Dakota Medicaid');
    expect(m.benefits.rows.find((r) => r.label === 'Deductible')).toBeUndefined();
    expect(m.benefits.rows.find((r) => r.label === 'Member cost share')?.value).toContain('$0');
    expect(m.order.dxCode).toBe('M54.16');
  });

  it('Commercial member: full benefits with deductible + OOP + copay', () => {
    expect(p.payer).toBe('Dakota Health Plan');
    expect(p.benefits.rows.find((r) => r.label === 'Deductible')?.value).toContain('$1,500');
    expect(p.benefits.rows.find((r) => r.label === 'Out-of-pocket')?.value).toContain('$4,000');
    expect(p.order.dxCode).toBe('R06.02');
    expect(p.order.cpt).toBe('71275');
  });

  it('benefits are labeled as eligibility (270/271), not CRD', () => {
    expect(m.benefits.source).toMatch(/270\/271/);
  });
});

describe('determination altitude (Da Vinci)', () => {
  const m = vm(maria, '72148', 'James Whitfield, MD');

  it('PA required is a determination cell (warn), not a pass/fail check', () => {
    const pa = m.determination.find((c) => c.label === 'Prior auth');
    expect(pa?.value).toBe('Required');
    expect(pa?.tone).toBe('warn');
    expect(m.paRequired).toBe(true);
  });

  it('documentation-needed is listed; criteria are NAMED, not evaluated (no Met/Partial)', () => {
    expect(m.docNeeded.length).toBeGreaterThan(0);
    expect(m.criteriaNames).toContain('Neurological deficit / red-flag findings');
    // the VM carries no per-criterion met/partial field at all
    expect((m as unknown as Record<string, unknown>).criteriaEvaluation).toBeUndefined();
  });

  it('coverage-found reflects active enrollment', () => {
    expect(m.coverageFound).toBe(true);
    const cov = m.determination.find((c) => c.label === 'Coverage');
    expect(cov?.value).toBe('Active');
    expect(cov?.tone).toBe('ok');
  });
});
