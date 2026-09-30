/**
 * Fixture data for the RHTP API integration suite.
 *
 * Extracted verbatim from tests/api-integration.test.mjs.
 */

// ── Patient registry (direct JS parse, mirrors patientRegistry.ts) ───────────
// We duplicate the key lookup logic here so we don't need ts-node.
// The actual tests use the same data the routes use.

export const PATIENTS = {
  MARIA_SD_001: {
    platformId: 'MARIA_SD_001',
    name: 'Maria Redhawk',
    dob: '1992-06-15',
    gender: 'F',
    contract: 'SD Medicaid',
    pcp: 'Prairie Health Services',
    location: 'Martin, SD 57551',
  },
  'PAT-0042': {
    platformId: 'PAT-0042',
    name: 'Dorothy Simmons',
    dob: '1951-03-14',
    gender: 'F',
    contract: 'MSSP Trk 3',
    pcp: 'Dr. Whitfield',
    location: 'Ozark Regional FQHC Service Area',
  },
  'PAT-0087': {
    platformId: 'PAT-0087',
    name: 'James Wilson',
    dob: '1968-07-14',
    gender: 'M',
    contract: 'Medicaid RHTP Track 3',
    pcp: 'Dr. Okonkwo',
    location: 'Rural Route 2, Winner SD 57580',
  },
  'PAT-0103': {
    platformId: 'PAT-0103',
    name: 'Robert Chen',
    dob: '1964-11-03',
    gender: 'M',
    contract: 'Medicaid RHTP Track 3',
    pcp: 'Dr. Castillo',
    location: '847 Summit Street, Rapid City SD 57701',
  },
  'PAT-0156': {
    platformId: 'PAT-0156',
    name: 'Lisa Thompson',
    dob: '1985-05-19',
    gender: 'F',
    contract: 'Medicaid RHTP Track 3',
    pcp: 'Dr. Torres',
    location: '223 Metro Ave, Sioux Falls SD 57104',
  },
};

// PA scenarios — mirrors devStubs PATIENT_PROFILES.paScenario
export const PA_SCENARIOS = {
  MARIA_SD_001: {
    cptCode: '72148',
    procedureName: 'MRI Lumbar Spine w/o Contrast',
    priorPayer: 'Aetna Medicaid SD',
    priorMemberId: 'AETNA-MBR-00182734',
  },
  'PAT-0042': {
    cptCode: '75561',
    procedureName: 'Cardiac MRI w/ and w/o contrast',
    priorPayer: 'UnitedHealthcare Community Plan MO',
    priorMemberId: 'UHC-MBR-00487291',
  },
  'PAT-0087': {
    cptCode: '93306',
    procedureName: 'Echocardiogram (complete transthoracic)',
    priorPayer: 'Molina Healthcare of South Dakota',
    priorMemberId: 'MOL-MBR-00294817',
  },
  'PAT-0103': {
    cptCode: '99243',
    procedureName: 'Nephrology office consultation',
    priorPayer: 'Anthem BCBS South Dakota',
    priorMemberId: 'ANTH-MBR-00731028',
  },
  'PAT-0156': {
    cptCode: '99244',
    procedureName: 'Pulmonology office consultation',
    priorPayer: 'Meridian Health Plan SD',
    priorMemberId: 'MER-MBR-00118847',
  },
};

export const PA_HISTORY = {
  MARIA_SD_001: [
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
  'PAT-0042': [
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
  ],
  'PAT-0087': [
    {
      service: 'BNP / Pro-BNP Lab Panel (CHF monitoring)',
      cpt: '83880',
      decision: 'approved',
      authNumber: 'MOL-2022-03312',
      date: '2022-11-22',
    },
    {
      service: 'Echocardiogram (complete)',
      cpt: '93306',
      decision: 'denied',
      denialReason: 'Not medically necessary — stable CHF',
      date: '2023-02-17',
    },
  ],
  'PAT-0103': [
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
  'PAT-0156': [
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
};

// CPT metadata — mirrors evidence/[id]/route.ts CPT_META
export const CPT_META = {
  72148: {
    display: 'MRI Lumbar Spine w/o Contrast',
    policyRef: 'Policy/MRI-LUMBAR-001',
    deficiency: 'Neurological deficit documentation missing',
    payer: 'SD Medicaid',
    propensity: 0.71,
    propensityBand: 'high',
  },
  75561: {
    display: 'Cardiac MRI w/ and w/o contrast',
    policyRef: 'Policy/CARDIAC-MRI-001',
    deficiency: 'Clinical justification beyond echocardiogram missing',
    payer: 'UHC Community',
    propensity: 0.48,
    propensityBand: 'medium',
  },
  93306: {
    display: 'Echocardiogram (complete transthoracic)',
    policyRef: 'Policy/ECHO-001',
    deficiency: 'None — all criteria met',
    payer: 'Molina SD',
    propensity: 0.12,
    propensityBand: 'low',
  },
  99243: {
    display: 'Nephrology office consultation',
    policyRef: 'Policy/SPECIALTY-001',
    deficiency: 'None — all criteria met',
    payer: 'Anthem BCBS SD',
    propensity: 0.08,
    propensityBand: 'low',
  },
  99244: {
    display: 'Pulmonology office consultation',
    policyRef: 'Policy/SPECIALTY-002',
    deficiency: 'None — all criteria met',
    payer: 'Meridian SD',
    propensity: 0.18,
    propensityBand: 'low',
  },
};

export const PIDS = ['MARIA_SD_001', 'PAT-0042', 'PAT-0087', 'PAT-0103', 'PAT-0156'];

export const PATIENT_CONDITIONS = {
  MARIA_SD_001: ['Pre-diabetic', 'Postpartum', 'Depression'],
  'PAT-0042': ['Heart failure', 'COPD', 'Diabetes', 'Hypertension'],
  'PAT-0087': ['Heart failure', 'Diabetes', 'Hypertension'],
  'PAT-0103': ['Hypertension', 'CKD'],
  'PAT-0156': ['Asthma', 'Obesity'],
};
