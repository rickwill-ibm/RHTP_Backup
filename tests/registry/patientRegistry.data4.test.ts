import { describe, it, expect } from 'vitest';
import {
  FHIR_ID_MAP_EXT,
  PLATFORM_TO_FHIR_ID_MAP_EXT,
  REGISTRY_PART4,
} from '@/lib/patientRegistry.data4';

describe('patientRegistry.data4 — Alex Kirby FHIR ID extensions', () => {
  it('FHIR_ID_MAP_EXT maps both alex-kirby FHIR ID variants to PAT-0200', () => {
    expect(FHIR_ID_MAP_EXT['patient-alex-kirby']).toBe('PAT-0200');
    expect(FHIR_ID_MAP_EXT['patient/alex-kirby']).toBe('PAT-0200');
  });

  it('PLATFORM_TO_FHIR_ID_MAP_EXT maps PAT-0200 to patient-alex-kirby', () => {
    expect(PLATFORM_TO_FHIR_ID_MAP_EXT['PAT-0200']).toBe('patient-alex-kirby');
  });

  it('FHIR_ID_MAP_EXT and PLATFORM_TO_FHIR_ID_MAP_EXT are inverses for alex-kirby', () => {
    const fhirId = PLATFORM_TO_FHIR_ID_MAP_EXT['PAT-0200'];
    const platformId = FHIR_ID_MAP_EXT[fhirId];
    expect(platformId).toBe('PAT-0200');
  });

  it('REGISTRY_PART4 is an array (may be empty until a full profile is added)', () => {
    expect(Array.isArray(REGISTRY_PART4)).toBe(true);
  });
});
