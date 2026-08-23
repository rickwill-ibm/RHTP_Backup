/**
 * cms0057fEndpoints.ts — shared patient scenario + endpoint definitions
 *
 * Single source of truth consumed by:
 *   - /api-explorer page (Try It UI)
 *   - /api/postman-collection (collection generator)
 *   - /api/postman-environment (environment generator)
 *
 * Prevents drift between what the Explorer shows and what the collection tests.
 */

import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';

// ─── Patient scenarios ────────────────────────────────────────────────────────

export interface PatientScenario {
  platformId: string;
  fhirPatientId: string;
  firstName: string;
  lastName: string;
  dob: string;
  state: string;
  cptCode: string;
  procedureName: string;
  priorPayer: string;
  specialty: string;
  location: string;
}

export const PATIENT_SCENARIOS: Record<string, PatientScenario> = {
  MARIA_SD_001: {
    platformId: 'MARIA_SD_001',
    fhirPatientId: 'patient-maria-001',
    firstName: 'Maria',
    lastName: 'Redhawk',
    dob: '1985-04-12',
    state: 'SD',
    cptCode: '72148',
    procedureName: 'MRI Lumbar Spine w/o Contrast',
    priorPayer: 'Aetna Medicaid SD',
    specialty: 'Behavioral Health',
    location: 'Martin, Bennett County SD',
  },
  'PAT-0042': {
    platformId: 'PAT-0042',
    fhirPatientId: 'patient-pat-0042',
    firstName: 'James',
    lastName: 'Thunderbird',
    dob: '1972-09-18',
    state: 'SD',
    cptCode: '75561',
    procedureName: 'Cardiac MRI w/ and w/o contrast',
    priorPayer: 'UnitedHealthcare Community Plan MO',
    specialty: 'Pulmonology',
    location: 'Ozark Regional FQHC Service Area, SD',
  },
  'PAT-0087': {
    platformId: 'PAT-0087',
    fhirPatientId: 'patient-pat-0087',
    firstName: 'Dorothy',
    lastName: 'Simmons',
    dob: '1968-03-22',
    state: 'SD',
    cptCode: '93306',
    procedureName: 'Echocardiogram (complete transthoracic)',
    priorPayer: 'Molina Healthcare of South Dakota',
    specialty: 'Cardiology',
    location: 'Winner, Tripp County SD',
  },
  'PAT-0103': {
    platformId: 'PAT-0103',
    fhirPatientId: 'patient-pat-0103',
    firstName: 'Robert',
    lastName: 'Yellowhorse',
    dob: '1955-11-07',
    state: 'SD',
    cptCode: '99243',
    procedureName: 'Nephrology office consultation',
    priorPayer: 'Anthem BCBS South Dakota',
    specialty: 'Nephrology',
    location: 'Rapid City, Pennington County SD',
  },
  'PAT-0156': {
    platformId: 'PAT-0156',
    fhirPatientId: 'patient-pat-0156',
    firstName: 'Lisa',
    lastName: 'Thompson',
    dob: '1991-06-30',
    state: 'SD',
    cptCode: '99244',
    procedureName: 'Pulmonology office consultation',
    priorPayer: 'Meridian Health Plan SD',
    specialty: 'Pulmonology',
    location: 'Sioux Falls, Minnehaha County SD',
  },
};

export const DEFAULT_PATIENT_ID = DEMO_MEMBER_ID;
export const DEFAULT_PROVIDER_NPI = '1730154783';
export const DEFAULT_REVIEWER_EMAIL = 'reviewer@rhtp-health.org';

export function getScenario(patientId: string): PatientScenario {
  return PATIENT_SCENARIOS[patientId] ?? PATIENT_SCENARIOS[DEFAULT_PATIENT_ID];
}

// ─── Mandate section metadata ─────────────────────────────────────────────────

export const MANDATE_SECTIONS = [
  { key: 'patientAccess', label: '§1 Patient Access', mandate: 'CMS-0057-F §1', color: '#0043ce' },
  {
    key: 'providerAccess',
    label: '§2 Provider Access',
    mandate: 'CMS-0057-F §2',
    color: '#6929c4',
  },
  { key: 'payerToPayer', label: '§3 Payer-to-Payer', mandate: 'CMS-0057-F §3', color: '#005d5d' },
  { key: 'priorAuth', label: '§4 Prior Auth', mandate: 'CMS-0057-F §4', color: '#b45309' },
  { key: 'infrastructure', label: 'Infrastructure', mandate: 'HL7 / CMS', color: '#57606a' },
] as const;

export type ScopeKey = (typeof MANDATE_SECTIONS)[number]['key'];
