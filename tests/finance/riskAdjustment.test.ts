/**
 * HW-FIN / I18 — RADV-defensible risk-adjustment integrity.
 * Proves an HCC without MEAT/source linkage is not submittable, a retracted dx is
 * withheld, and the pre-submission scrub partitions correctly.
 */
import { describe, it, expect } from 'vitest';
import {
  assessRadvDefensibility,
  evaluateSubmission,
  retractDiagnosis,
  scrubForSubmission,
  type HccCapture,
} from '../../src/lib/finance/riskAdjustment';

const defensible: HccCapture = {
  hccCode: 'HCC18', icdCode: 'E11.9', memberId: 'patient-001', encounterId: 'enc-1',
  dateOfService: '2026-03-01', providerNpi: '1234567890',
  meat: { monitored: true, evaluated: true, assessed: true, treated: true },
  sourceDocumentRef: 'DocumentReference/chart-1', status: 'active',
};

describe('RADV defensibility', () => {
  it('a fully-documented HCC is defensible', () => {
    expect(assessRadvDefensibility(defensible).defensible).toBe(true);
  });
  it('missing MEAT / source doc / DOS / NPI each make it indefensible', () => {
    expect(assessRadvDefensibility({ ...defensible, meat: { monitored: false, evaluated: false, assessed: false, treated: false } }).deficiencies)
      .toContain('no MEAT evidence (monitored/evaluated/assessed/treated)');
    expect(assessRadvDefensibility({ ...defensible, sourceDocumentRef: undefined }).deficiencies)
      .toContain('no source-document linkage');
    expect(assessRadvDefensibility({ ...defensible, dateOfService: '' }).defensible).toBe(false);
    expect(assessRadvDefensibility({ ...defensible, providerNpi: 'x' }).defensible).toBe(false);
    expect(assessRadvDefensibility({ ...defensible, icdCode: '' }).defensible).toBe(false);
    // whitespace-only icd: !icdCode is false but !icdCode.trim() is true — kills a || -> && regression
    expect(assessRadvDefensibility({ ...defensible, icdCode: '   ' }).deficiencies).toContain('no supporting ICD-10-CM code');
  });

  it('ANY single MEAT element satisfies the MEAT requirement (OR, not AND)', () => {
    // each element alone must make MEAT present — kills a || -> && regression
    for (const only of ['monitored', 'evaluated', 'assessed', 'treated'] as const) {
      const meat = { monitored: false, evaluated: false, assessed: false, treated: false, [only]: true };
      expect(assessRadvDefensibility({ ...defensible, meat }).defensible, `MEAT via ${only} alone`).toBe(true);
    }
  });
});

describe('submission gate + retract', () => {
  it('only a defensible, active diagnosis is submittable', () => {
    expect(evaluateSubmission(defensible).submittable).toBe(true);
    const weak = { ...defensible, sourceDocumentRef: undefined };
    expect(evaluateSubmission(weak).submittable).toBe(false);
  });
  it('a retracted diagnosis is never submittable (avoids the RADV takeback)', () => {
    const r = retractDiagnosis(defensible);
    expect(r.status).toBe('retracted');
    expect(evaluateSubmission(r).submittable).toBe(false);
  });
  it('scrub partitions submittable vs withheld', () => {
    const batch: HccCapture[] = [
      defensible,
      { ...defensible, hccCode: 'HCC85', sourceDocumentRef: undefined }, // indefensible
      retractDiagnosis({ ...defensible, hccCode: 'HCC22' }),             // retracted
    ];
    const res = scrubForSubmission(batch);
    expect(res.submitted).toHaveLength(1);
    expect(res.withheld).toHaveLength(2);
    expect(res.withheld.map((w) => w.decision.reason)).toContain('not RADV-defensible');
    expect(res.withheld.map((w) => w.decision.reason)).toContain('diagnosis retracted (not submitted)');
  });
});
