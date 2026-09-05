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

/**
 * Fail-closed neutral member. An unknown/out-of-scope citizenId must NEVER resolve
 * to another member's record - the previous `|| getPatientById('MARIA_SD_001')!`
 * fallback leaked Maria Redhawk's identity/PII onto other members. Screens that need
 * a non-null RegistryPatient contract use this so no real member's data is shown.
 * Mirrors placeholderPersona in uhg/data/persona.ts; values are neutral, not Maria's.
 */
export function placeholderMember(citizenId?: string): RegistryPatient {
  return {
    platformId: citizenId || 'UNKNOWN',
    fhirId: '',
    ehrMrn: '',
    name: 'Member',
    age: 0,
    gender: '',
    dob: '',
    location: '—',
    phone: '',
    pcp: '—',
    careManager: '—',
    careManagerInitials: '—',
    organization: '—',
    contract: '—',
    attribution: '—',
    rafScore: 0,
    riskTier: 'Low',
    riskLabel: 'Scope pending',
    erRiskPct: 0,
    hccSuspects: 0,
    hccValue: 0,
    openCareGaps: 0,
    episodeType: '—',
    episodeStatus: 'Stable',
    episodeDaysActive: 0,
    pmpm: 0,
    pmpmTarget: 0,
    lastContact: '—',
    bhScreeningLabel: '—',
    bhScore: null,
    bhScoreLabel: '—',
    auditC: 0,
    bhRisk: 'Low',
    bhReferralStatus: '—',
    bhProvider: '—',
    burdenScore: '—',
    patientGoal: '—',
    transportStatus: '—',
    foodSecurity: '—',
    housingStatus: '—',
    language: '—',
    ruralDistance: '—',
    disparityFlag: '—',
    cohortFlag: '—',
    snapStatus: '—',
    digitalAccess: '—',
    careGaps: [],
    pathwaySteps: [],
    aiCopilot: '—',
    cdsCards: [],
  };
}
