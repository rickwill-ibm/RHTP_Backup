// ─── devStubs.profiles.ts ─────────────────────────────────────────────────────
// Per-patient profiles + lookup helper used by all devStub modules.

interface PatientProfile {
  name: string;
  dob: string;
  gender: string;
  priorPayer: string;
  priorMemberId: string;
  priorCoverageStart: string;
  priorCoverageEnd: string;
  eobCount: number;
  claimCount: number;
  claimResponseCount: number;
  conditionCount: number;
  medicationCount: number;
  observationCount: number;
  procedureCount: number;
  encounterCount: number;
  coverageCount: number;
  paHistory: Array<{
    service: string;
    cpt: string;
    decision: 'approved' | 'denied';
    denialReason?: string;
    authNumber?: string;
    date: string;
  }>;
  newConditionsAdded: number;
  coverageGapsResolved: number;
  paScenario: { cptCode: string; procedureName: string; policyTitle: string; allMet: boolean };
}

const PATIENT_PROFILES: Record<string, PatientProfile> = {
  MARIA_SD_001: {
    name: 'Maria Redhawk',
    dob: '1992-06-15',
    gender: 'female',
    priorPayer: 'Aetna Medicaid SD',
    priorMemberId: 'AETNA-MBR-00182734',
    priorCoverageStart: '2019-01-01',
    priorCoverageEnd: '2024-01-31',
    eobCount: 412,
    claimCount: 388,
    claimResponseCount: 19,
    conditionCount: 8,
    medicationCount: 12,
    observationCount: 64,
    procedureCount: 31,
    encounterCount: 87,
    coverageCount: 3,
    paHistory: [
      {
        service: 'MRI Lumbar Spine w/o Contrast',
        cpt: '72148',
        decision: 'denied',
        denialReason: 'Conservative therapy not documented',
        date: '2023-08-12',
      },
      {
        service: 'Physical Therapy (16 sessions)',
        cpt: '97110',
        decision: 'approved',
        authNumber: 'AT-2022-00441',
        date: '2022-03-04',
      },
      {
        service: 'Prenatal Ultrasound — 20-Week Anatomy',
        cpt: '76805',
        decision: 'approved',
        authNumber: 'AT-2022-00882',
        date: '2022-06-18',
      },
    ],
    newConditionsAdded: 3,
    coverageGapsResolved: 1,
    paScenario: {
      cptCode: '72148',
      procedureName: 'MRI Lumbar Spine w/o Contrast',
      policyTitle: 'MRI Lumbar Spine — Medical Necessity Policy (CPT 72148)',
      allMet: false,
    },
  },
  'PAT-0042': {
    name: 'Dorothy Simmons',
    dob: '1951-03-14',
    gender: 'female',
    priorPayer: 'UnitedHealthcare Community Plan MO',
    priorMemberId: 'UHC-MBR-00487291',
    priorCoverageStart: '2019-01-01',
    priorCoverageEnd: '2023-12-31',
    eobCount: 847,
    claimCount: 791,
    claimResponseCount: 42,
    conditionCount: 14,
    medicationCount: 31,
    observationCount: 156,
    procedureCount: 67,
    encounterCount: 203,
    coverageCount: 4,
    paHistory: [
      {
        service: 'Cardiac MRI w/ and w/o contrast',
        cpt: '75561',
        decision: 'denied',
        denialReason: 'Echocardiogram not attempted first',
        date: '2023-04-19',
      },
      {
        service: 'Cardiac MRI — resubmission after echo',
        cpt: '75561',
        decision: 'approved',
        authNumber: 'UHC-2023-04881',
        date: '2023-07-02',
      },
      {
        service: 'Home health aide (12 visits)',
        cpt: '99500',
        decision: 'approved',
        authNumber: 'UHC-2022-18934',
        date: '2022-09-14',
      },
      {
        service: 'Spirometry (COPD monitoring)',
        cpt: '94010',
        decision: 'approved',
        authNumber: 'UHC-2023-00221',
        date: '2023-01-08',
      },
    ],
    newConditionsAdded: 4,
    coverageGapsResolved: 2,
    paScenario: {
      cptCode: '75561',
      procedureName: 'Cardiac MRI w/ and w/o contrast',
      policyTitle: 'Cardiac MRI — Medical Necessity Policy (CPT 75561)',
      allMet: false,
    },
  },
  'PAT-0087': {
    name: 'James Wilson',
    dob: '1968-07-14',
    gender: 'male',
    priorPayer: 'Molina Healthcare of South Dakota',
    priorMemberId: 'MOL-MBR-00294817',
    priorCoverageStart: '2019-01-01',
    priorCoverageEnd: '2023-06-30',
    eobCount: 531,
    claimCount: 502,
    claimResponseCount: 27,
    conditionCount: 9,
    medicationCount: 19,
    observationCount: 98,
    procedureCount: 44,
    encounterCount: 134,
    coverageCount: 3,
    paHistory: [
      {
        service: 'Echocardiogram (complete transthoracic)',
        cpt: '93306',
        decision: 'denied',
        denialReason: 'Not medically necessary — stable CHF',
        date: '2023-02-17',
      },
      {
        service: 'Echocardiogram — resubmission with worsening dyspnea',
        cpt: '93306',
        decision: 'approved',
        authNumber: 'MOL-2023-04127',
        date: '2023-03-03',
      },
      {
        service: 'Diabetes education program (10 hrs)',
        cpt: '98960',
        decision: 'approved',
        authNumber: 'MOL-2021-00771',
        date: '2021-05-03',
      },
    ],
    newConditionsAdded: 2,
    coverageGapsResolved: 1,
    paScenario: {
      cptCode: '93306',
      procedureName: 'Echocardiogram (complete transthoracic)',
      policyTitle: 'Echocardiogram — Medical Necessity Policy (CPT 93306)',
      allMet: true,
    },
  },
  'PAT-0103': {
    name: 'Robert Chen',
    dob: '1959-11-02',
    gender: 'male',
    priorPayer: 'Anthem BCBS South Dakota',
    priorMemberId: 'ANTH-MBR-00731028',
    priorCoverageStart: '2019-01-01',
    priorCoverageEnd: '2024-03-31',
    eobCount: 623,
    claimCount: 589,
    claimResponseCount: 33,
    conditionCount: 11,
    medicationCount: 22,
    observationCount: 112,
    procedureCount: 51,
    encounterCount: 161,
    coverageCount: 3,
    paHistory: [
      {
        service: 'Nephrology consult',
        cpt: '99243',
        decision: 'approved',
        authNumber: 'ANTH-2022-00992',
        date: '2022-08-30',
      },
      {
        service: 'Kidney biopsy',
        cpt: '50200',
        decision: 'denied',
        denialReason: 'Step therapy — ACE inhibitor trial required first',
        date: '2023-06-11',
      },
    ],
    newConditionsAdded: 3,
    coverageGapsResolved: 1,
    paScenario: {
      cptCode: '99243',
      procedureName: 'Nephrology office consultation',
      policyTitle: 'Specialty Consult — Medical Necessity Policy (CPT 99243)',
      allMet: true,
    },
  },
  'PAT-0156': {
    name: 'Lisa Thompson',
    dob: '1974-05-28',
    gender: 'female',
    priorPayer: 'Meridian Health Plan SD',
    priorMemberId: 'MER-MBR-00118847',
    priorCoverageStart: '2019-01-01',
    priorCoverageEnd: '2023-09-30',
    eobCount: 289,
    claimCount: 271,
    claimResponseCount: 14,
    conditionCount: 6,
    medicationCount: 9,
    observationCount: 48,
    procedureCount: 22,
    encounterCount: 73,
    coverageCount: 2,
    paHistory: [
      {
        service: 'Pulmonology consult — severe asthma',
        cpt: '99244',
        decision: 'approved',
        authNumber: 'MER-2022-01104',
        date: '2022-04-20',
      },
      {
        service: 'Monoclonal antibody (dupilumab) — asthma',
        cpt: 'J0222',
        decision: 'denied',
        denialReason: 'Step therapy — 2 biologic trials required',
        date: '2023-03-15',
      },
    ],
    newConditionsAdded: 1,
    coverageGapsResolved: 1,
    paScenario: {
      cptCode: '99244',
      procedureName: 'Pulmonology office consultation',
      policyTitle: 'Specialty Consult — Medical Necessity Policy (CPT 99244)',
      allMet: true,
    },
  },
};

/**
 * Neutral, obviously-synthetic profile returned for an UNREGISTERED member id. This is the fail-closed
 * default that replaces the old `?? MARIA_SD_001` — so an unknown id can never resolve to a REAL seed
 * member's demographics / prior-payer id / PA history (a cross-member PHI mis-attribution). It carries
 * no real member's data: zero counts, empty history, placeholder identity. Every consumer of
 * `profileFor` (devMemberMatch, devBulkStatus, devClaimResponseApproved, CDS/DTR stubs, and the
 * /api/fhir ClaimResponse branch) inherits this safety without needing its own guard.
 */
const PLACEHOLDER_PROFILE: PatientProfile = {
  name: 'Unknown Member',
  dob: '1900-01-01',
  gender: 'unknown',
  priorPayer: 'Unknown',
  priorMemberId: 'UNKNOWN',
  priorCoverageStart: '1900-01-01',
  priorCoverageEnd: '1900-01-01',
  eobCount: 0,
  claimCount: 0,
  claimResponseCount: 0,
  conditionCount: 0,
  medicationCount: 0,
  observationCount: 0,
  procedureCount: 0,
  encounterCount: 0,
  coverageCount: 0,
  paHistory: [],
  newConditionsAdded: 0,
  coverageGapsResolved: 0,
  paScenario: { cptCode: '', procedureName: 'Unknown', policyTitle: 'Unknown', allMet: false },
};

/** Whether an id resolves to a REAL seeded member profile (not the placeholder). */
export function isKnownProfile(patientId: string | undefined): boolean {
  return !!patientId && Object.prototype.hasOwnProperty.call(PATIENT_PROFILES, patientId);
}

/**
 * Resolve a member profile. A registered id returns its real profile; an UNKNOWN id fails CLOSED to a
 * neutral placeholder — never another member's data. Callers that intend the demo default pass a known
 * id explicitly (e.g. `patientId ?? 'MARIA_SD_001'`), which resolves to the real seeded profile.
 */
export function profileFor(patientId: string): PatientProfile {
  return PATIENT_PROFILES[patientId] ?? PLACEHOLDER_PROFILE;
}
