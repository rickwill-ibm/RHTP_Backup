// patientRegistry.ts — Single source of truth for all canonical patients
// Every patient-facing screen reads from this registry via getPatientById(id)
// FHIR ID mapping bridges EHR launch context to platform patient IDs

export * from './patientRegistry.types';

import {
  REGISTRY_PART1,
  FHIR_ID_MAP as MAP1,
  PLATFORM_TO_FHIR_ID_MAP as PMAP1,
} from './patientRegistry.data1';
import { REGISTRY_PART2 } from './patientRegistry.data2';
import { REGISTRY_PART3 } from './patientRegistry.data3';
import {
  REGISTRY_PART4,
  FHIR_ID_MAP_EXT,
  PLATFORM_TO_FHIR_ID_MAP_EXT,
} from './patientRegistry.data4';
import type { RegistryPatient } from './patientRegistry.types';

// Merged ID maps — data1 is the canonical baseline; data4 extends it.
export const FHIR_ID_MAP: Record<string, string> = { ...MAP1, ...FHIR_ID_MAP_EXT };
export const PLATFORM_TO_FHIR_ID_MAP: Record<string, string> = {
  ...PMAP1,
  ...PLATFORM_TO_FHIR_ID_MAP_EXT,
};

const PATIENT_REGISTRY: RegistryPatient[] = [
  ...REGISTRY_PART1,
  ...REGISTRY_PART2,
  ...REGISTRY_PART3,
  ...REGISTRY_PART4,
];

export function getPatientById(platformId: string): RegistryPatient | undefined {
  return PATIENT_REGISTRY.find((p) => p.platformId === platformId);
}

export function getPatientByFhirId(fhirId: string): RegistryPatient | undefined {
  const platformId = FHIR_ID_MAP[fhirId];
  if (!platformId) return undefined;
  return getPatientById(platformId);
}

export function getPatientByMrn(mrn: string): RegistryPatient | undefined {
  return PATIENT_REGISTRY.find((p) => p.ehrMrn === mrn);
}

export function resolveFhirToPlatformId(fhirId: string): string | undefined {
  return FHIR_ID_MAP[fhirId];
}

export function resolveToCanonicalFhirPatientId(id: string): string | undefined {
  if (!id) return undefined;
  if (PLATFORM_TO_FHIR_ID_MAP[id]) return PLATFORM_TO_FHIR_ID_MAP[id];
  const platformId = resolveFhirToPlatformId(id);
  return platformId
    ? (PLATFORM_TO_FHIR_ID_MAP[platformId] ?? id.replace(/^patient\//, ''))
    : id.replace(/^patient\//, '');
}

export function getAllPatients(): RegistryPatient[] {
  return PATIENT_REGISTRY;
}

export function getVisiblePatients(useMock: boolean): RegistryPatient[] {
  if (useMock) {
    return PATIENT_REGISTRY.filter((p) => p.mockOnly === true);
  }
  return PATIENT_REGISTRY;
}

export default PATIENT_REGISTRY;
