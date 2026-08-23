import { describe, expect, it } from 'vitest';
import {
  validateUcumForLoinc,
  isValidUcumUnit,
  allowedUnitsForLoinc,
  createSeedTerminologyService,
  makeSemanticValidator,
  extractLoincQuantities,
} from '@/lib/terminology';
import type { NormalizedRecord } from '@/lib/pipeline/types';

/**
 * I8A-ii wave A: UCUM unit validation for LOINC quantitative results. The unit
 * must be a well-formed UCUM unit AND appropriate for the LOINC. Either failure
 * is a semantic finding. A non-quantitative LOINC has no unit check.
 */
const LOINC_URI = 'http://loinc.org';

/** A PHI-free normalized lab record: a LOINC coding + a UCUM-quantified value. */
function labRecord(code: string, unit: string): NormalizedRecord {
  return {
    domain: 'labs-vitals',
    memberId: 'mem-lab',
    resourceType: 'Observation',
    fhirResourceId: 'Observation/o-1',
    eventType: 'observation.recorded',
    tier: 'T1',
    idempotencyKey: 'lab:o-1',
    provenance: 'device-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: { feed: 'test', system: 'test' } as unknown as NormalizedRecord['source'],
    occurredAt: '2026-06-01T00:00:00Z',
    payload: {
      loinc: { system: LOINC_URI, code },
      value: { value: 6.7, unit },
    },
  };
}

describe('validateUcumForLoinc: good and bad units', () => {
  it('accepts an appropriate unit for the LOINC', () => {
    expect(validateUcumForLoinc('8480-6', 'mm[Hg]')).toMatchObject({ applicable: true, valid: true });
    expect(validateUcumForLoinc('4548-4', '%')).toMatchObject({ valid: true });
    expect(validateUcumForLoinc('2339-0', 'mg/dL')).toMatchObject({ valid: true });
  });

  it('flags a not-well-formed UCUM unit', () => {
    const u = validateUcumForLoinc('8480-6', 'furlongs');
    expect(u).toMatchObject({ applicable: true, valid: false, finding: 'ucum-invalid-unit' });
    expect(u.allowed).toContain('mm[Hg]');
  });

  it('flags a valid UCUM unit that is inappropriate for the LOINC', () => {
    const u = validateUcumForLoinc('8480-6', 'mg/dL');
    expect(isValidUcumUnit('mg/dL')).toBe(true);
    expect(u).toMatchObject({ applicable: true, valid: false, finding: 'ucum-unit-not-allowed-for-loinc' });
  });

  it('treats a non-quantitative LOINC as not applicable (no unit check)', () => {
    // 11506-3 is a document/progress-note LOINC, not a quantitative result.
    const u = validateUcumForLoinc('11506-3', 'anything');
    expect(u).toMatchObject({ applicable: false, valid: true });
    expect(allowedUnitsForLoinc('11506-3')).toBeUndefined();
  });
});

describe('extractLoincQuantities pairs a LOINC coding with its unit', () => {
  it('finds the (code, unit) pair in a normalized lab payload', () => {
    const pairs = extractLoincQuantities(labRecord('8480-6', 'mm[Hg]').payload);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ code: '8480-6', unit: 'mm[Hg]' });
  });
});

describe('the semantic gate emits UCUM findings', () => {
  const gate = makeSemanticValidator(createSeedTerminologyService({ now: () => new Date('2026-06-01T00:00:00Z') }));

  it('passes a lab with a good unit', () => {
    expect(gate.validate(labRecord('8480-6', 'mm[Hg]')).ok).toBe(true);
  });

  it('quarantines a lab with an invalid UCUM unit (PHI-safe)', () => {
    const result = gate.validate(labRecord('8480-6', 'furlongs'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.reasonCode)).toContain('semantic-ucum-invalid-unit');
    expect(JSON.stringify(result.issues)).not.toContain('mem-lab');
  });

  it('quarantines a lab whose valid unit is wrong for the LOINC', () => {
    const result = gate.validate(labRecord('8480-6', 'mg/dL'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.reasonCode)).toContain('semantic-ucum-unit-not-allowed');
  });
});
