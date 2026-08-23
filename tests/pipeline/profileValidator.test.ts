/**
 * U2 fix — the stage-4 profile gate must FAIL CLOSED in production.
 *
 * The structural pre-flight (renamed so it can't masquerade as US Core
 * $validate) stays for mock/seeded so the demo is green. In production, until a
 * real US Core $validate backend is wired, every record is quarantined with
 * `profile-validation-unavailable` — never admitted as "profile valid". Mirrors
 * the terminology semantic gate's production-fail-closed pattern exactly.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import {
  structuralProfileValidator,
  productionProfileValidator,
  selectProfileValidator,
  ProfileValidatorNotConfiguredError,
  productionProfileValidationService,
} from '@/lib/pipeline/profileValidator';
import type { NormalizedRecord } from '@/lib/pipeline/types';

afterEach(() => clearSessionDataModes());

/** A structurally-complete-but-not-US-Core-conformant record. */
function record(overrides: Partial<NormalizedRecord> = {}): NormalizedRecord {
  return {
    domain: 'medications',
    memberId: 'mem-abc',
    resourceType: 'Medication',
    fhirResourceId: 'Medication/mr-x',
    eventType: 'medication.prescribed',
    tier: 'T1',
    idempotencyKey: 'rx:med:mr-x',
    provenance: 'prescriber-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: { system: 'test-system', feed: 'test-feed' },
    occurredAt: '2026-05-01T00:00:00Z',
    payload: { medicationRef: 'Medication/mr-x', status: 'active' },
    ...overrides,
  };
}

describe('validator identity is not mistakable for US Core $validate', () => {
  it('the structural validator is clearly labelled as a pre-flight, not $validate', () => {
    expect(structuralProfileValidator.id).not.toContain('profile-validator');
    expect(structuralProfileValidator.id).toMatch(/pre.?flight|not-us-core/i);
  });
});

describe('mock / seeded — structural pre-flight (demo stays green)', () => {
  it('a structurally-complete record passes in mock mode', () => {
    setSessionDataMode('profileValidation', 'mock');
    expect(selectProfileValidator().validate(record()).ok).toBe(true);
  });

  it('an empty-payload record is still rejected by the structural check', () => {
    setSessionDataMode('profileValidation', 'seeded');
    const res = selectProfileValidator().validate(record({ payload: {} }));
    expect(res.ok).toBe(false);
    expect(res.issues.map((i) => i.reasonCode)).toContain('profile-empty-payload');
  });
});

describe('production — fails closed (U2)', () => {
  it('the selector returns the fail-closed validator in production mode', () => {
    setSessionDataMode('profileValidation', 'production');
    expect(selectProfileValidator().id).toBe(productionProfileValidator.id);
  });

  it('a structurally-complete record is QUARANTINED, never admitted, in production', () => {
    setSessionDataMode('profileValidation', 'production');
    const res = selectProfileValidator().validate(record());
    expect(res.ok).toBe(false);
    expect(res.issues.map((i) => i.reasonCode)).toContain('profile-validation-unavailable');
  });

  it('the underlying production service is fail-loud (throws NotConfigured) when called directly', () => {
    expect(() => productionProfileValidationService.validate(record())).toThrow(
      ProfileValidatorNotConfiguredError
    );
  });
});
