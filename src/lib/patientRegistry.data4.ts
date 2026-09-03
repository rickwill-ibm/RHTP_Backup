// patientRegistry.data4.ts — Alex Kirby FHIR ID extensions
// Extends the FHIR_ID_MAP and PLATFORM_TO_FHIR_ID_MAP from data1.ts
// with Alex Kirby (PAT-0200), added when patient-alex-kirby was seeded to HAPI.
// Merged in patientRegistry.ts alongside REGISTRY_PART1/2/3.
import type { RegistryPatient } from './patientRegistry.types';

export const FHIR_ID_MAP_EXT: Record<string, string> = {
  'patient/alex-kirby': 'PAT-0200',
  'patient-alex-kirby': 'PAT-0200',
};

export const PLATFORM_TO_FHIR_ID_MAP_EXT: Record<string, string> = {
  'PAT-0200': 'patient-alex-kirby',
};

// No registry patient record for Alex yet — she is a FHIR-only test patient.
// Add a RegistryPatient entry here when a full profile is needed.
export const REGISTRY_PART4: RegistryPatient[] = [];
