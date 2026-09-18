/**
 * mockBundle.test.ts — E13 test-link + behavior for the dev-mock FHIR bundle
 * builders extracted from the financial-clearance route (mockBundle.ts).
 *
 * These are pure, per-patient builders: mock mode must run each patient against
 * their OWN clinical context (not Maria's seed bundle), so the tests assert
 * structural validity and per-patient differentiation.
 */
import { describe, it, expect } from 'vitest';
import { mockEntriesForPatient, type BundleEntry } from '@/app/api/financial-clearance/mockBundle';

const resourceTypes = (entries: BundleEntry[]): string[] =>
  entries.map((e) => e.resource.resourceType);

describe('mockEntriesForPatient — dev-mock FHIR bundle builder', () => {
  it('returns a non-empty bundle of well-formed FHIR entries for a known patient', () => {
    const entries = mockEntriesForPatient('MARIA_SD_001');
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(typeof e.resource).toBe('object');
      expect(typeof e.resource.resourceType).toBe('string');
      expect(e.resource.resourceType.length).toBeGreaterThan(0);
    }
  });

  it('includes the clinical context the financial-clearance flow consumes (order + coverage)', () => {
    const types = resourceTypes(mockEntriesForPatient('MARIA_SD_001'));
    // The route projects a ServiceRequest (the order) and Coverage from these entries.
    expect(types).toContain('ServiceRequest');
    expect(types).toContain('Coverage');
  });

  it('builds a DIFFERENT context per patient (not everyone gets Maria\'s seed)', () => {
    const maria = JSON.stringify(mockEntriesForPatient('MARIA_SD_001'));
    const other = JSON.stringify(mockEntriesForPatient('PAT-0042'));
    expect(other).not.toEqual(maria);
  });

  it('degrades gracefully for an unknown patient (no throw; array result)', () => {
    const entries = mockEntriesForPatient('UNKNOWN-PATIENT-XYZ');
    expect(Array.isArray(entries)).toBe(true);
  });
});
