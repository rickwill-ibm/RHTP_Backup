/**
 * HW-FIN-B / I24 — encounter-submission pipeline + COB.
 */
import { describe, it, expect } from 'vitest';
import {
  buildBatch,
  reconcile,
  buildResubmission,
  orderOfBenefits,
  primaryPayer,
  type Coverage,
} from '../../src/lib/finance/submission';

describe('encounter submission pipeline', () => {
  const batch = buildBatch('B1', [
    { encounterId: 'e1', memberId: 'm1', diagnoses: ['E11.9'] },
    { encounterId: 'e2', memberId: 'm1', diagnoses: ['I50.9'] },
    { encounterId: 'e3', memberId: 'm2', diagnoses: ['N18.3'] },
  ]);

  it('an encounter is accepted only with NO rejecting ack at any level', () => {
    const r = reconcile(batch, [
      { level: 'MAO-002', encounterId: 'e1', accepted: true, code: 'A' },
      { level: '277CA', encounterId: 'e2', accepted: false, code: 'R277' },
      // e3 has no ack -> pending
    ]);
    expect(r.accepted).toEqual(['e1']);
    expect(r.rejected).toEqual(['e2']);
    expect(r.pending).toEqual(['e3']);
    expect(r.resubmit.map((e) => e.encounterId)).toEqual(['e2']);
  });

  it('a 999 syntax reject blocks acceptance even if a later level accepts', () => {
    const b = buildBatch('B2', [{ encounterId: 'x', memberId: 'm', diagnoses: ['E11.9'] }]);
    const r = reconcile(b, [
      { level: '999', encounterId: 'x', accepted: false, code: 'SYNTAX' },
      { level: 'MAO-002', encounterId: 'x', accepted: true, code: 'A' },
    ]);
    expect(r.rejected).toEqual(['x']);
  });

  it('resubmission increments attempts and clears the rejection code', () => {
    const b = buildBatch('B3', [{ encounterId: 'y', memberId: 'm', diagnoses: ['E11.9'] }]);
    const r = reconcile(b, [{ level: 'MAO-002', encounterId: 'y', accepted: false, code: 'DUP' }]);
    const resub = buildResubmission('B3-r', r.resubmit);
    expect(resub.encounters[0].attempts).toBe(2);
    expect(resub.encounters[0].rejectionCode).toBeUndefined();
    expect(resub.encounters[0].status).toBe('resubmitted');
  });

  it('stops resubmitting after max attempts', () => {
    const b = buildBatch('B4', [{ encounterId: 'z', memberId: 'm', diagnoses: ['E11.9'] }]);
    b.encounters[0].attempts = 3;
    const r = reconcile(b, [{ level: 'MAO-002', encounterId: 'z', accepted: false, code: 'DUP' }], 3);
    expect(r.rejected).toEqual(['z']);
    expect(r.resubmit).toHaveLength(0);
  });
});

describe('coordination of benefits', () => {
  it('active employer coverage is primary; Medicaid is last resort', () => {
    const coverages: Coverage[] = [
      { coverageId: 'c-mcaid', type: 'medicaid' },
      { coverageId: 'c-active', type: 'commercial-active', activeEmployment: true },
      { coverageId: 'c-medicare', type: 'medicare' },
    ];
    const order = orderOfBenefits(coverages);
    expect(order.ordered.map((c) => c.type)).toEqual(['commercial-active', 'medicare', 'medicaid']);
    expect(primaryPayer(coverages)?.type).toBe('commercial-active');
  });

  it('birthday rule breaks a tie within the same rank', () => {
    const order = orderOfBenefits([
      { coverageId: 'a', type: 'commercial-retiree', subscriberBirthday: '09-15' },
      { coverageId: 'b', type: 'commercial-retiree', subscriberBirthday: '03-02' },
    ]);
    expect(order.ordered[0].coverageId).toBe('b'); // earlier month-day first
  });
});
