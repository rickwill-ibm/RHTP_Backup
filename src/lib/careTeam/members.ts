// careTeam/members.ts — Canonical care-team roster (single source of truth)
// Promotes the participant model from fhirCareTeamData.ts into one app-wide roster
// enriched with the attributes the attribution algorithm matches on.
//
// IMPORTANT: Sarah Johnson is a Care Manager and remains a first-class member here.
// Screens reference members by `id` (e.g. 'cm-sarah-johnson'); the literal display
// name is resolved from this roster, not hardcoded in page files.

export type Specialty =
  | 'Diabetes'
  | 'Cardiometabolic'
  | 'Respiratory'
  | 'Renal'
  | 'Behavioral Health'
  | 'Maternal/Postpartum'
  | 'Complex/Geriatric'
  | 'Preventive'
  | 'Social/SDOH';

export type MemberFunction = 'CaseManager' | 'CHW' | 'Specialist' | 'BH' | 'PCP';

export type Credential = 'RN' | 'LCSW' | 'RD' | 'CHW' | 'LPC' | 'MD';

export interface CareTeamMember {
  id: string;
  name: string;
  initials: string;
  credential: Credential;
  function: MemberFunction;
  specialties: Specialty[];
  languages: string[];
  regions: string[];
  culturalCompetencies: string[];
  maxCaseload: number;
  baseCaseload: number; // existing panel not modeled patient-by-patient (keeps load realistic)
  status: 'Active' | 'PTO' | 'Onboarding';
  organization: string;
  fhirParticipantId?: string; // provenance link to fhirCareTeamData.ts
}

// ─── Roster ─────────────────────────────────────────────────────────────────
// Case Managers + CHWs receive cohort attribution. Specialists/PCP/BH-clinician
// are included for completeness and downstream screens but are not cohort owners.

export const CARE_TEAM_MEMBERS: CareTeamMember[] = [
  {
    id: 'cm-sarah-johnson',
    name: 'Sarah Johnson',
    initials: 'SJ',
    credential: 'RN',
    function: 'CaseManager',
    specialties: ['Diabetes', 'Cardiometabolic', 'Preventive'],
    languages: ['English'],
    regions: ['Bennett County', 'Martin', 'Rural SD'],
    culturalCompetencies: [],
    maxCaseload: 120,
    baseCaseload: 28,
    status: 'Active',
    organization: 'RHTP Care Management Team — Bennett County',
    fhirParticipantId: 'ct-p-004',
  },
  {
    id: 'cm-rachel-bordeaux',
    name: 'Rachel Bordeaux',
    initials: 'RB',
    credential: 'RN',
    function: 'CaseManager',
    specialties: ['Maternal/Postpartum', 'Preventive'],
    languages: ['English', 'Lakota'],
    regions: ['Rural SD', 'Winner', 'Pine Ridge'],
    culturalCompetencies: ['Tribal/IHS'],
    maxCaseload: 90,
    baseCaseload: 19,
    status: 'Active',
    organization: 'RHTP Maternal Health — Cedar Bluff Regional',
  },
  {
    id: 'cm-grace-thunderhawk',
    name: 'Grace Thunderhawk',
    initials: 'GT',
    credential: 'RN',
    function: 'CaseManager',
    specialties: ['Complex/Geriatric', 'Respiratory', 'Renal'],
    languages: ['English', 'Lakota'],
    regions: ['Rapid City', 'Pine Ridge', 'Rural SD'],
    culturalCompetencies: ['Tribal/IHS'],
    maxCaseload: 100,
    baseCaseload: 24,
    status: 'Active',
    organization: 'RHTP Complex Care — Summit Regional',
  },
  {
    id: 'cm-lisa-fontaine',
    name: 'Lisa Fontaine, LCSW',
    initials: 'LF',
    credential: 'LCSW',
    function: 'CaseManager',
    specialties: ['Behavioral Health'],
    languages: ['English'],
    regions: ['Bennett County', 'Martin'],
    culturalCompetencies: [],
    maxCaseload: 85,
    baseCaseload: 22,
    status: 'Active',
    organization: 'Prairie Health Services — BH',
    fhirParticipantId: 'ct-p-007',
  },
  {
    id: 'chw-angela-torres',
    name: 'Angela Torres',
    initials: 'AT',
    credential: 'CHW',
    function: 'CHW',
    specialties: ['Social/SDOH'],
    languages: ['English', 'Spanish'],
    regions: ['Bennett County', 'Martin'],
    culturalCompetencies: [],
    maxCaseload: 150,
    baseCaseload: 41,
    status: 'Active',
    organization: 'Frontier Community Action CBO',
    fhirParticipantId: 'ct-p-005',
  },
  {
    id: 'chw-james-holloway',
    name: 'James Holloway',
    initials: 'JH',
    credential: 'CHW',
    function: 'CHW',
    specialties: ['Social/SDOH'],
    languages: ['English', 'Lakota'],
    regions: ['Pine Ridge', 'Rural SD'],
    culturalCompetencies: ['Tribal/IHS'],
    maxCaseload: 140,
    baseCaseload: 37,
    status: 'Active',
    organization: 'Prairie Roots Food Network',
    fhirParticipantId: 'ct-p-008',
  },
  // ── Specialists / clinicians (not cohort owners) ──────────────────────────
  {
    id: 'sp-amara-osei',
    name: 'Dr. Amara Osei',
    initials: 'AO',
    credential: 'MD',
    function: 'Specialist',
    specialties: ['Cardiometabolic'],
    languages: ['English'],
    regions: ['Rapid City'],
    culturalCompetencies: [],
    maxCaseload: 200,
    baseCaseload: 0,
    status: 'Active',
    organization: 'Summit Regional Cardiology',
    fhirParticipantId: 'ct-p-002',
  },
  {
    id: 'bh-sarah-nakamura',
    name: 'Dr. Sarah Nakamura',
    initials: 'SN',
    credential: 'LPC',
    function: 'BH',
    specialties: ['Behavioral Health'],
    languages: ['English'],
    regions: ['Winner'],
    culturalCompetencies: [],
    maxCaseload: 120,
    baseCaseload: 0,
    status: 'Active',
    organization: 'Cedar Valley Behavioral Health — Winner',
    fhirParticipantId: 'ct-p-006',
  },
];

// ─── Lookups ──────────────────────────────────────────────────────────────────
export function getMember(id: string): CareTeamMember | undefined {
  return CARE_TEAM_MEMBERS.find((m) => m.id === id);
}

export function getMemberName(id: string): string {
  return getMember(id)?.name ?? id;
}

export function membersByFunction(fn: MemberFunction): CareTeamMember[] {
  return CARE_TEAM_MEMBERS.filter((m) => m.function === fn);
}

/** Members eligible to own a managed cohort (case managers + CHWs). */
export function cohortOwnerPool(): CareTeamMember[] {
  return CARE_TEAM_MEMBERS.filter((m) => m.function === 'CaseManager' || m.function === 'CHW');
}
