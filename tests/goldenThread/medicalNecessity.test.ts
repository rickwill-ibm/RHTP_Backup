import { describe, it, expect } from 'vitest';
import {
  runMedicalNecessity,
  type RunContext,
  type StageOrder,
} from '@/lib/goldenThread/medicalNecessity';
import { loadMockLibrary, MOCK_GOLD_CARD_CONTEXT, type MemberContext } from '@/lib/policy';

/** GT-3 — Medical Necessity stage orchestration. */
const lib = loadMockLibrary();
const payer = 'UnitedHealthcare Community Plan';
const asOf = '2026-07-26T00:00:00.000Z';

function ctx(overrides?: Partial<RunContext>): RunContext {
  return {
    library: lib,
    goldCard: { ...MOCK_GOLD_CARD_CONTEXT, asOf },
    ids: { determination: 'd1', goldCard: 'g1', propensity: 'p1', evidence: 'ev1' },
    ts: asOf,
    ...overrides,
  };
}

describe('Medical Necessity — Maria, non-gold-carded provider', () => {
  const member: MemberContext = { memberId: 'MARIA_SD_001', diagnoses: [] };
  const order: StageOrder = {
    code: '72148',
    codeSystem: 'CPT',
    display: 'MRI lumbar',
    providerNpi: '1518998765',
    payer,
  };

  it('requires PA (on PA list) and threads a 3-entry evidence record', () => {
    const r = runMedicalNecessity(member, order, ctx());
    expect(r.netRequiresPA).toBe(true);
    expect(r.netOutcome).toBe('pa-required-list');
    expect(r.goldCard.applied).toBe(false);
    expect(r.evidence.entries.length).toBe(3); // determination + gold-card + propensity
    expect(r.vm.remediation.length).toBeGreaterThan(0);
    expect(r.propensity.band).toBeTruthy();
  });
});

describe('Medical Necessity — gold-carded provider waives PA', () => {
  const member: MemberContext = { memberId: 'MARIA_SD_001', diagnoses: [] };
  const order: StageOrder = {
    code: '72148',
    codeSystem: 'CPT',
    display: 'MRI lumbar',
    providerNpi: '1730154782',
    payer,
  };

  it('is PA-exempt with zero propensity and no deficiencies', () => {
    const r = runMedicalNecessity(member, order, ctx());
    expect(r.goldCard.applied).toBe(true);
    expect(r.netRequiresPA).toBe(false);
    expect(r.netOutcome).toBe('pa-exempt-gold-card');
    expect(r.propensity.score).toBe(0);
    expect(r.vm.deficiencies.length).toBe(0);
    expect(r.vm.remediation[0].action).toBe('submit');
  });
});

describe('Medical Necessity — criteria-gated cardiac order', () => {
  const order: StageOrder = {
    code: '75561',
    codeSystem: 'CPT',
    display: 'Cardiac MRI',
    providerNpi: '1999999999',
    payer,
  };

  it('APPROVE path: supporting dx meets criteria, low propensity', () => {
    const member: MemberContext = {
      memberId: 'M2',
      diagnoses: [{ code: 'I42.0', display: 'Cardiomyopathy' }],
    };
    const r = runMedicalNecessity(member, order, ctx());
    expect(r.determination.outcome).toBe('pa-required-criteria-review');
    expect(r.vm.criteriaMet).toBe(true);
    expect(r.vm.indications.length).toBeGreaterThan(0);
    expect(r.propensity.band).toBe('low');
  });

  it('DEFICIENCY path: no supporting dx yields remediation options', () => {
    const member: MemberContext = {
      memberId: 'M3',
      diagnoses: [{ code: 'E11.9', display: 'Diabetes' }],
    };
    const r = runMedicalNecessity(member, order, ctx());
    expect(r.vm.criteriaMet).toBe(false);
    expect(r.vm.remediation.some((o) => o.action === 'add-on-label-diagnosis')).toBe(true);
    expect(r.vm.remediation[0].examples?.length).toBeGreaterThan(0);
  });
});
