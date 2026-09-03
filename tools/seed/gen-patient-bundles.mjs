#!/usr/bin/env node
/**
 * Generate complete, loadable FHIR R4 (4.0.1) *transaction* Bundles for the
 * demo/mock patients. v2 closes the SDOH + behavioral-health completeness gap.
 *
 * Conformance target = what the PLATFORM supports: base FHIR R4 4.0.1,
 * structurally valid, using the app's own code systems (ICD-10-CM incl. Z-codes,
 * LOINC AHC-HRSN/PRAPARE + PHQ-9/AUDIT-C, Gravity SDOHCC pattern, RxNorm-by-text).
 * Deliberately NOT stamped with US Core meta.profile — the platform's validator is
 * a structural pre-flight that enforces no named US Core profile, so the seed data
 * must not claim conformance the platform itself does not assert.
 *
 * Whole-person model per patient:
 *   demographics · Coverage · Conditions (ICD-10) · MedicationRequests ·
 *   resulted labs (Observation) · overdue orders/referrals (ServiceRequest) ·
 *   SDOH screening (Observation, AHC-HRSN LOINC) · SDOH Z-code Conditions ·
 *   closed-loop CBO referral (ServiceRequest → Task → CBO Organization) ·
 *   BH scored surveys (PHQ-9 / AUDIT-C Observation) · BH referral (Dorothy) ·
 *   42 CFR Part 2 Consent (SUD patients) · Encounter · CareTeam · CarePlan · Goals ·
 *   plus each patient's real resources carried over from fhir/fhir-state.json.
 *
 * Sources (no fabricated facts): fhir/fhir-state.json + patientRegistry.data{1,2,3}.ts.
 */
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
// Lazy so that importing this module (e.g. the drift-guard test reading CODING_GAPS) is
// TRULY side-effect-free — nothing touches the filesystem until buildBundle actually runs.
let _state;
function getState() {
  if (!_state)
    _state = JSON.parse(readFileSync(path.join(ROOT, 'fhir/fhir-state.json'), 'utf8')).resources;
  return _state;
}

const MRN_SYS = 'http://tcoc.example.org/fhir/sid/mrn';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';
const LOINC = 'http://loinc.org';
const SCT = 'http://snomed.info/sct';
const CPT = 'http://www.ama-assn.org/go/cpt';
const FLAGCAT = 'http://terminology.hl7.org/CodeSystem/flag-category';
const OBSCAT = 'http://terminology.hl7.org/CodeSystem/observation-category';
const CCAT = 'http://terminology.hl7.org/CodeSystem/condition-category';
const CCLIN = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
const CVER = 'http://terminology.hl7.org/CodeSystem/condition-ver-status';
const ACT = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

// ── Referral terminology (coding + referral experts confirmed). Keyed by the exact
// ServiceRequest.code.text the generator emits, so a text-only referral is coded with
// a GOVERNED code the semantic gate accepts (else it stays quarantined). SR-3 for
// robert is intentionally coded with a generic Patient-referral code AND flagged for
// human review — its Gravity SDOH financial-navigation code is still TBD.
const NEEDS_CODING_REVIEW_EXT =
  'http://tcoc.example.org/fhir/StructureDefinition/needs-coding-review';
const REFERRAL_CODE = {
  'Non-emergency medical transportation': [
    CPT,
    'T2003',
    'Non-emergency transportation; encounter/trip',
  ],
  'Transportation to specialist visits': [
    CPT,
    'T2003',
    'Non-emergency transportation; encounter/trip',
  ],
  'Behavioral health referral': [CPT, '90791', 'Psychiatric diagnostic evaluation'],
  'Nutrition counseling (SNAP-Ed)': [SCT, '306163007', 'Referral to dietetics service'],
  'Medication cost assistance / patient-assistance program': [SCT, '3457005', 'Patient referral'],
  Endocrinologist: [SCT, '103696004', 'Patient referral to specialist'],
  Labs: [SCT, '108252007', 'Laboratory procedure'],
  'Diabetic retinal exam': [CPT, '2022F', 'Dilated retinal eye exam'],
  'Cardiology consultation': [CPT, '99242', 'Office consultation'],
  Spirometry: [CPT, '94010', 'Spirometry'],
  'Weight management program referral': [SCT, '103696004', 'Patient referral to specialist'],
  'Nephrology referral': [SCT, '103696004', 'Patient referral to specialist'],
};
// Referrals that get a governed code BUT must still be routed to a human coder.
const REFERRAL_REVIEW = {
  'Medication cost assistance / patient-assistance program':
    'gravity-sdoh-financial-navigation-code-TBD',
};

/**
 * Attach a governed serviceCode to a text-only ServiceRequest (idempotent: leaves an
 * already-coded request untouched), and route the SR-3 financial-navigation referral
 * to human review via a needs-coding-review extension.
 */
function finalizeServiceRequest(res) {
  const code = res.code || (res.code = {});
  const text = code.text || '';
  if (!code.coding && REFERRAL_CODE[text]) {
    const [system, c, display] = REFERRAL_CODE[text];
    code.coding = [{ system, code: c, display }];
  }
  if (REFERRAL_REVIEW[text]) {
    res.extension = [
      ...(res.extension || []),
      { url: NEEDS_CODING_REVIEW_EXT, valueString: REFERRAL_REVIEW[text] },
    ];
  }
  return res;
}

// ── Goal terminology. Goals bypass the semantic gate but are coded properly:
// Goal.description.coding is set from the goal text (keyword match, first wins).
const GOAL_CODE_RULES = [
  [/a1c/i, [LOINC, '4548-4', 'Hemoglobin A1c']],
  [/blood pressure|(^|\W)bp(\W|$)/i, [LOINC, '85354-9', 'Blood pressure panel']],
  [/phq-?9/i, [LOINC, '44249-1', 'PHQ-9 total score']],
  [/spirometry/i, [SCT, '734163000', 'Care plan']],
  [/asthma action plan/i, [SCT, '734163000', 'Care plan']],
  [/bnp|natriuretic/i, [LOINC, '30934-4', 'Natriuretic peptide B']],
  [/bmi|body mass/i, [LOINC, '39156-5', 'Body mass index']],
  [/egfr|creatinine/i, [LOINC, '33914-3', 'GFR predicted']],
  [/audit-?c/i, [LOINC, '75626-2', 'AUDIT-C total score']],
];
function goalCoding(text) {
  for (const [re, [system, code, display]] of GOAL_CODE_RULES)
    if (re.test(text)) return { system, code, display };
  return null;
}

/** Ensure a Flag carries a PHI-safe category CODING (not just free text). Idempotent. */
function finalizeFlag(res) {
  const cats = Array.isArray(res.category) ? res.category : [];
  const hasCoding = cats.some((c) => Array.isArray(c?.coding) && c.coding.length);
  if (!hasCoding) {
    res.category = [
      {
        coding: [{ system: FLAGCAT, code: 'clinical', display: 'Clinical' }],
        ...(cats[0]?.text ? { text: cats[0].text } : {}),
      },
    ];
  }
  return res;
}

const RXNORM_URI = 'http://www.nlm.nih.gov/research/umls/rxnorm';
// RxNorm ingredient codes keyed by the first token of the medication text.
const RXNORM = {
  furosemide: ['4603', 'Furosemide'],
  metformin: ['6809', 'Metformin'],
  warfarin: ['11289', 'Warfarin'],
  tiotropium: ['69120', 'Tiotropium'],
  lisinopril: ['29046', 'Lisinopril'],
  atorvastatin: ['83367', 'Atorvastatin'],
  carvedilol: ['20352', 'Carvedilol'],
  losartan: ['52175', 'Losartan'],
  amlodipine: ['17767', 'Amlodipine'],
  montelukast: ['88249', 'Montelukast'],
  albuterol: ['435', 'Albuterol'],
  fluticasone: ['41126', 'Fluticasone'],
};

// SDOH screening LOINC (AHC-HRSN / PRAPARE)
const SDOH_Q = {
  housing: ['71802-3', 'Housing status'],
  food: ['88122-7', 'Food insecurity risk'],
  transport: ['93030-5', 'Transportation insecurity'],
  financial: ['76513-1', 'Financial resource strain'],
};

const ENRICH = {
  'patient-dorothy-042': {
    slug: 'dorothy-simmons',
    name: { given: ['Dorothy'], family: 'Simmons' },
    gender: 'female',
    birthDate: '1951-03-14',
    mrn: 'MRN-0042',
    phone: '(417) 555-0198',
    address: { city: 'Ozark', state: 'MO', country: 'US' },
    language: 'en',
    org: 'Ozark Regional FQHC',
    pcp: { given: ['—'], family: 'Whitfield', prefix: 'Dr.', npi: '1487654321' },
    coverage: 'MEDICARE',
    conditions: [
      ['I50.32', 'Chronic diastolic (congestive) heart failure', '2019-03-01'],
      ['E11.65', 'Type 2 diabetes mellitus with hyperglycemia', '2014-07-01'],
      ['J44.1', 'COPD with (acute) exacerbation', '2021-11-01'],
      ['I10', 'Essential (primary) hypertension', '2012-03-01'],
      ['E66.01', 'Morbid (severe) obesity due to excess calories', '2016-05-01'],
      ['N18.3', 'Chronic kidney disease, stage 3 (moderate)', '2022-09-01'],
      ['F32.1', 'Major depressive disorder, single episode, moderate', '2023-02-01'],
    ],
    meds: [
      ['Furosemide 40 mg oral tablet', '40 mg once daily'],
      ['Metformin hydrochloride 1000 mg oral tablet', '1000 mg twice daily'],
      ['Warfarin sodium 5 mg oral tablet', '5 mg once daily'],
      ['Tiotropium bromide 18 mcg inhalation powder', '18 mcg once daily, inhaled'],
      ['Lisinopril 20 mg oral tablet', '20 mg once daily'],
      ['Atorvastatin 40 mg oral tablet', '40 mg once nightly'],
    ],
    labs: [
      {
        loinc: '4548-4',
        text: 'Hemoglobin A1c',
        value: 9.2,
        unit: '%',
        date: '2026-03-15',
        interp: 'H',
      },
      {
        loinc: '30934-4',
        text: 'Natriuretic peptide B (BNP)',
        value: 842,
        unit: 'pg/mL',
        date: '2026-03-28',
        interp: 'HH',
      },
      {
        loinc: '33914-3',
        text: 'eGFR',
        value: 38,
        unit: 'mL/min/1.73m2',
        date: '2026-03-15',
        interp: 'L',
      },
      {
        loinc: '10230-1',
        text: 'Left ventricular ejection fraction',
        value: 35,
        unit: '%',
        date: '2026-03-12',
        interp: 'L',
      },
    ],
    orders: [],
    sdoh: {
      screening: {
        housing: 'Stable',
        food: 'Screened — no food insecurity',
        transport: 'Barrier — kept from care',
        financial: 'Not flagged',
      },
      needs: [
        {
          zcode: 'Z59.82',
          zdisplay: 'Transportation insecurity',
          referral: 'Non-emergency medical transportation',
          cbo: 'Unite Us Transportation Network',
          businessStatus: 'In progress — referral #TU-48821',
          date: '2026-02-14',
        },
      ],
    },
    bh: {
      surveys: [
        { loinc: '44249-1', text: 'PHQ-9 total score', score: 14, interp: 'H' },
        { loinc: '75626-2', text: 'AUDIT-C total score', score: 2 },
      ],
      referral: {
        to: 'Cascade Valley Behavioral Health',
        businessStatus: 'Referred — awaiting engagement',
        date: '2026-03-15',
        reason: 'Moderate depression (PHQ-9 14)',
      },
    },
    part2: false,
    goals: [
      'A1C < 8.0% by Q3 2026',
      'Blood pressure < 130/80 by Q2 2026',
      'Spirometry completed by May 2026',
      'PHQ-9 score < 10 by Q3 2026',
    ],
  },
  'patient-james-087': {
    slug: 'james-wilson',
    name: { given: ['James'], family: 'Wilson' },
    gender: 'male',
    birthDate: '1968-07-14',
    mrn: 'MRN-0087',
    phone: null,
    address: { city: 'Winner', state: 'SD', country: 'US' },
    language: 'en',
    org: 'Winner Regional Medical Center',
    pcp: { given: ['—'], family: 'Okonkwo', prefix: 'Dr.', npi: '1598765432' },
    coverage: 'MEDICAID',
    conditions: [
      ['I50.32', 'Chronic diastolic (congestive) heart failure', '2022-01-01'],
      ['E11.9', 'Type 2 diabetes mellitus without complications', '2015-04-01'],
      ['I10', 'Essential (primary) hypertension', '2013-08-01'],
      ['F32.0', 'Major depressive disorder, single episode, mild', '2024-02-01'],
    ],
    meds: [
      ['Metformin hydrochloride 1000 mg oral tablet', '1000 mg twice daily'],
      ['Carvedilol 12.5 mg oral tablet', '12.5 mg twice daily'],
      ['Lisinopril 10 mg oral tablet', '10 mg once daily'],
      ['Furosemide 20 mg oral tablet', '20 mg once daily'],
      ['Atorvastatin 20 mg oral tablet', '20 mg once nightly'],
    ],
    labs: [],
    orders: [
      { text: 'Hemoglobin A1c', loinc: '4548-4', date: '2026-02-28' },
      { text: 'B-type natriuretic peptide panel', loinc: '30934-4', date: '2026-03-21' },
      { text: 'Diabetic retinal exam', date: '2025-12-01' },
      { text: 'Cardiology consultation', date: '2026-04-01', category: 'referral' },
    ],
    sdoh: {
      screening: {
        housing: 'Stable — owns home',
        food: 'SNAP active',
        transport: 'Limited — 35 miles to clinic',
        financial: 'Rural, low income',
      },
      needs: [
        {
          zcode: 'Z59.82',
          zdisplay: 'Transportation insecurity',
          referral: 'Transportation to specialist visits',
          cbo: 'Winner Rural Transit Assistance',
          businessStatus: 'Requested',
          date: '2026-03-01',
        },
      ],
    },
    bh: {
      surveys: [
        { loinc: '44249-1', text: 'PHQ-9 total score', score: 8 },
        { loinc: '75626-2', text: 'AUDIT-C total score', score: 3 },
      ],
      referral: null,
    },
    part2: false,
    goals: ['A1C recheck and control', 'BNP panel for CHF monitoring', 'PHQ-9 follow-up'],
  },
  'patient-robert-103': {
    slug: 'robert-chen',
    name: { given: ['Robert'], family: 'Chen' },
    gender: 'male',
    birthDate: '1964-11-03',
    mrn: 'MRN-0103',
    phone: null,
    address: { city: 'Rapid City', state: 'SD', country: 'US' },
    language: 'en',
    org: 'Rapid City Regional Health',
    pcp: { given: ['—'], family: 'Castillo', prefix: 'Dr.', npi: '1609876543' },
    coverage: 'MEDICAID',
    conditions: [
      ['I10', 'Essential (primary) hypertension', '2014-06-01'],
      ['N18.32', 'Chronic kidney disease, stage 3b', '2020-10-01'],
      ['F10.10', 'Alcohol use disorder, mild', '2023-05-01'],
    ],
    meds: [
      ['Amlodipine 10 mg oral tablet', '10 mg once daily'],
      ['Losartan potassium 100 mg oral tablet', '100 mg once daily'],
      ['Atorvastatin 40 mg oral tablet', '40 mg once nightly'],
    ],
    labs: [
      {
        loinc: '85354-9',
        text: 'Blood pressure panel',
        date: '2026-03-15',
        interp: 'H',
        cat: 'vital-signs',
        components: [
          ['8480-6', 'Systolic blood pressure', 158, 'mm[Hg]'],
          ['8462-4', 'Diastolic blood pressure', 96, 'mm[Hg]'],
        ],
      },
      {
        loinc: '33914-3',
        text: 'eGFR',
        value: 42,
        unit: 'mL/min/1.73m2',
        date: '2026-02-28',
        interp: 'L',
      },
    ],
    orders: [
      { text: 'Urine albumin/creatinine ratio', loinc: '9318-7', date: '2026-02-15' },
      { text: 'Nephrology referral', date: '2026-04-10', category: 'referral' },
    ],
    sdoh: {
      screening: {
        housing: 'Stable — rents apartment',
        food: 'No flag',
        transport: 'Adequate — urban',
        financial: 'Medication cost barrier',
      },
      needs: [
        {
          zcode: 'Z59.86',
          zdisplay: 'Financial insecurity',
          referral: 'Medication cost assistance / patient-assistance program',
          cbo: 'Black Hills Medication Assistance Program',
          businessStatus: 'In progress',
          date: '2026-04-01',
        },
      ],
    },
    bh: {
      surveys: [{ loinc: '75626-2', text: 'AUDIT-C total score', score: 4, interp: 'A' }],
      referral: null,
    },
    part2: true, // alcohol use disorder → 42 CFR Part 2
    goals: [
      'Blood pressure control',
      'eGFR / creatinine monitoring (CKD 3b)',
      'AUDIT-C follow-up counseling',
    ],
  },
  'patient-lisa-156': {
    slug: 'lisa-thompson',
    name: { given: ['Lisa'], family: 'Thompson' },
    gender: 'female',
    birthDate: '1985-05-19',
    mrn: 'MRN-0156',
    phone: null,
    address: { city: 'Sioux Falls', state: 'SD', country: 'US' },
    language: 'en',
    org: 'Sioux Falls Community Health',
    pcp: { given: ['—'], family: 'Torres', prefix: 'Dr.', npi: '1710987654' },
    coverage: 'MEDICAID',
    conditions: [
      ['J45.50', 'Severe persistent asthma, uncomplicated', '2012-03-01'],
      ['E66.9', 'Obesity, unspecified', '2018-09-01'],
    ],
    meds: [
      ['Fluticasone 250 mcg / salmeterol 50 mcg inhalation powder', '1 inhalation twice daily'],
      ['Albuterol 90 mcg/actuation inhaler', '1-2 puffs as needed'],
      ['Montelukast 10 mg oral tablet', '10 mg once daily'],
    ],
    labs: [
      {
        loinc: '39156-5',
        text: 'Body mass index (BMI)',
        value: 38,
        unit: 'kg/m2',
        date: '2026-03-28',
        interp: 'H',
        cat: 'vital-signs',
      },
    ],
    orders: [
      { text: 'Spirometry', date: '2026-03-28' },
      { text: 'Weight management program referral', date: '2026-02-20', category: 'referral' },
    ],
    sdoh: {
      screening: {
        housing: 'Stable — rents apartment',
        food: 'SNAP active',
        transport: 'Adequate — urban',
        financial: 'Not flagged',
      },
      needs: [
        {
          referral: 'Nutrition counseling (SNAP-Ed)',
          cbo: 'Sioux Falls SNAP-Ed Nutrition Program',
          businessStatus: 'Pending enrollment',
          date: '2026-04-01',
        },
      ], // wellness referral — no Z-code deficit
    },
    bh: {
      surveys: [
        { loinc: '44249-1', text: 'PHQ-9 total score', score: 6 },
        { loinc: '75626-2', text: 'AUDIT-C total score', score: 1 },
      ],
      referral: null,
    },
    part2: false,
    goals: ['Asthma action plan update', 'BMI / weight management', 'PHQ-9 annual screening'],
  },
  'patient-alex-kirby': {
    slug: 'alex-kirby',
    fromStateOnly: true,
    coverage: 'MEDICAID',
    org: 'RHTP Community Health',
    goals: [],
  },
};

const COVERAGE_TYPE = {
  MEDICAID: { code: 'MC', display: 'Medicaid' },
  MEDICARE: { code: 'MR', display: 'Medicare' },
};

// ── Da Vinci Risk Adjustment Coding Gap demo data (per hl7.org/fhir/us/davinci-ra).
// AUTHORED, pre-computed gaps exactly as a payer's RA engine emits them — the platform
// is a CONSUMER of the report, never a producer: there is NO gap measurement/detection
// engine here. Covers the full vocabulary (open/closed/pending · historic/suspected/
// net-new · the four hierarchical statuses), CMS-HCC V24<->V28 coexistence (Dorothy),
// and 42 CFR Part 2 (Robert HCC135 SUD). Evidence is resolved by ICD code to the
// Condition the generator built, so refs stay correct across regeneration. HCC codes
// are representative demo values.
const RA_SD = 'http://hl7.org/fhir/us/davinci-ra/StructureDefinition';
const RA_CS = 'http://hl7.org/fhir/us/davinci-ra/CodeSystem';
const HCC_SYS =
  'https://www.cms.gov/Medicare/Health-Plans/MedicareAdvtgSpecRateStats/Risk-Adjustors/HCC';
export const CODING_GAPS = {
  'dorothy-simmons': [
    {
      ver: '28',
      hcc: 'HCC38',
      disp: 'Diabetes with Glycemic, Unspecified, or No Complications',
      status: 'closed-gap',
      suspect: 'historic',
      hier: 'applied-not-superseded',
      ev: ['E11.65'],
      enc: true,
    },
    {
      ver: '24',
      hcc: 'HCC19',
      disp: 'Diabetes without Complication',
      status: 'closed-gap',
      suspect: 'historic',
      hier: 'applied-not-superseded',
      ev: ['E11.65'],
      enc: true,
    },
  ],
  'james-wilson': [
    {
      ver: '28',
      hcc: 'HCC226',
      disp: 'Heart Failure',
      status: 'pending',
      suspect: 'historic',
      hier: 'not-applicable',
      ev: ['I50.32'],
      enc: true,
    },
    {
      ver: '28',
      hcc: 'HCC38',
      disp: 'Diabetes with Glycemic, Unspecified, or No Complications',
      status: 'closed-gap',
      suspect: 'net-new',
      hier: 'applied-not-superseded',
      ev: ['E11.9'],
      enc: true,
    },
  ],
  'robert-chen': [
    {
      ver: '28',
      hcc: 'HCC135',
      disp: 'Substance Use Disorder, Moderate/Severe',
      status: 'open-gap',
      suspect: 'suspected',
      hier: 'applied-not-superseded',
      ev: ['F10.10'],
      enc: true,
    },
    {
      ver: '28',
      hcc: 'HCC329',
      disp: 'Chronic Kidney Disease, Stage 3',
      status: 'closed-gap',
      suspect: 'historic',
      hier: 'applied-not-superseded',
      ev: ['N18.32'],
      enc: false,
    },
  ],
  'lisa-thompson': [
    {
      ver: '28',
      hcc: 'HCC277',
      disp: 'Chronic Obstructive Pulmonary Disease',
      status: 'open-gap',
      suspect: 'suspected',
      hier: 'applied-not-superseded',
      ev: ['J45.50'],
      enc: true,
    },
  ],
  'alex-kirby': [
    {
      ver: '28',
      hcc: 'HCC38',
      disp: 'Diabetes with Glycemic, Unspecified, or No Complications',
      status: 'open-gap',
      suspect: 'suspected',
      hier: '',
      ev: [],
    },
  ],
};

function buildCodingGap(slug, patientUuid, entries, g, idx) {
  const ext = [
    {
      url: `${RA_SD}/ra-evidenceStatus`,
      valueCodeableConcept: {
        coding: [{ system: `${RA_CS}/ra-evidencestatus-cs`, code: g.status }],
      },
    },
    {
      url: `${RA_SD}/ra-suspectType`,
      valueCodeableConcept: { coding: [{ system: `${RA_CS}/ra-suspecttype-cs`, code: g.suspect }] },
    },
  ];
  if (g.hier)
    ext.push({
      url: `${RA_SD}/ra-hierarchicalStatus`,
      valueCodeableConcept: {
        coding: [{ system: `${RA_CS}/ra-hierarchicalstatus-cs`, code: g.hier }],
      },
    });
  ext.push({ url: `${RA_SD}/ra-evidenceStatusDate`, valueDate: '2026-04-01' });
  const condIdByIcd = {};
  for (const en of entries)
    if (en.resource.resourceType === 'Condition')
      condIdByIcd[en.resource.code?.coding?.[0]?.code] = en.resource.id;
  const encId = entries.find((en) => en.resource.resourceType === 'Encounter')?.resource.id;
  const evRefs = [];
  for (const icd of g.ev) if (condIdByIcd[icd]) evRefs.push(`Condition/${condIdByIcd[icd]}`);
  if (g.enc && encId) evRefs.push(`Encounter/${encId}`);
  const mr = {
    resourceType: 'MeasureReport',
    id: `${slug}-codinggap-${idx + 1}`,
    status: 'complete',
    type: 'individual',
    measure: `http://tcoc.example.org/Measure/RA-CMS-HCC|${g.ver}`,
    subject: { reference: patientUuid },
    period: { start: '2026-01-01', end: '2026-09-30' },
    group: [
      {
        id: 'g1',
        code: { coding: [{ system: HCC_SYS, code: g.hcc, display: g.disp }] },
        extension: ext,
      },
    ],
  };
  if (evRefs.length)
    mr.evaluatedResource = evRefs.map((r) => ({
      reference: r,
      extension: [{ url: `${RA_SD}/ra-groupReference`, valueString: 'g1' }],
    }));
  return mr;
}

function buildBundle(pid) {
  const e = ENRICH[pid];
  const entries = [];
  const now = '2026-04-15';
  const patientUuid = `urn:uuid:${randomUUID()}`;
  const idCounts = {};
  const add = (resource) => {
    const fullUrl = `urn:uuid:${randomUUID()}`;
    const t = resource.resourceType;
    const n = (idCounts[t] = (idCounts[t] || 0) + 1);
    if (!resource.id) resource.id = `${e.slug}-${t.toLowerCase()}-${n}`; // stable id → deterministic graph key / idempotency
    entries.push({ fullUrl, resource, request: { method: 'POST', url: t } });
    return fullUrl;
  };

  const orgUuid = add({
    resourceType: 'Organization',
    active: true,
    name: e.org || 'RHTP Community Health',
    type: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/organization-type',
            code: 'prov',
            display: 'Healthcare Provider',
          },
        ],
      },
    ],
  });
  const payerUuid = add({
    resourceType: 'Organization',
    active: true,
    name: e.coverage === 'MEDICARE' ? 'Medicare (CMS)' : 'State Medicaid Agency',
  });

  const statePatient = (getState().Patient || []).find((p) => p.id === pid);
  let patient;
  if (e.fromStateOnly && statePatient) {
    patient = JSON.parse(JSON.stringify(statePatient));
    delete patient.id;
    delete patient.meta;
    patient.managingOrganization = { reference: orgUuid };
  } else {
    patient = {
      resourceType: 'Patient',
      active: true,
      identifier: [
        {
          use: 'usual',
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MR',
                display: 'Medical record number',
              },
            ],
          },
          system: MRN_SYS,
          value: e.mrn,
        },
      ],
      name: [{ use: 'official', family: e.name.family, given: e.name.given }],
      gender: e.gender,
      birthDate: e.birthDate,
      managingOrganization: { reference: orgUuid },
    };
    if (e.phone) patient.telecom = [{ system: 'phone', value: e.phone, use: 'home' }];
    if (e.address)
      patient.address = [
        { use: 'home', city: e.address.city, state: e.address.state, country: e.address.country },
      ];
    if (e.language)
      patient.communication = [
        {
          language: { coding: [{ system: 'urn:ietf:bcp:47', code: e.language }] },
          preferred: true,
        },
      ];
  }
  if (Array.isArray(patient.name))
    patient.name.forEach((n) => {
      if (n.given && !Array.isArray(n.given)) n.given = [n.given];
    });
  patient.id = e.slug;
  entries.push({
    fullUrl: patientUuid,
    resource: patient,
    request: { method: 'POST', url: 'Patient' },
  });

  let pcpUuid = null;
  if (e.pcp) {
    pcpUuid = add({
      resourceType: 'Practitioner',
      active: true,
      name: [
        {
          family: e.pcp.family,
          given: e.pcp.given,
          prefix: e.pcp.prefix ? [e.pcp.prefix] : undefined,
        },
      ],
      identifier: e.pcp.npi
        ? [{ system: 'http://hl7.org/fhir/sid/us-npi', value: e.pcp.npi }]
        : undefined,
    });
    add({
      resourceType: 'PractitionerRole',
      active: true,
      practitioner: { reference: pcpUuid },
      organization: { reference: orgUuid },
      code: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/practitioner-role',
              code: 'doctor',
              display: 'Doctor',
            },
          ],
        },
      ],
    });
  }

  const ct = COVERAGE_TYPE[e.coverage] || COVERAGE_TYPE.MEDICAID;
  add({
    resourceType: 'Coverage',
    status: 'active',
    type: { coding: [{ system: ACT, code: ct.code, display: ct.display }] },
    beneficiary: { reference: patientUuid },
    payor: [{ reference: payerUuid }],
    relationship: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship', code: 'self' },
      ],
    },
  });

  // Encounter (anchor)
  if (!e.fromStateOnly) {
    add({
      resourceType: 'Encounter',
      status: 'finished',
      class: { system: ACT, code: 'AMB', display: 'ambulatory' },
      type: [{ coding: [{ system: SCT, code: '185349003', display: 'Encounter for check up' }] }],
      subject: { reference: patientUuid },
      participant: pcpUuid ? [{ individual: { reference: pcpUuid } }] : undefined,
      // RADV enrichment: rendering-provider NPI + source-document ref authored ON the
      // Encounter (the ingest driver hands the Encounter adapter an Encounter-only
      // sub-bundle, so a Practitioner reference cannot be resolved for the NPI). DOS =
      // period.start. `visitdoc` (not `note`) so the PHI-minimal sweep never matches.
      extension:
        e.pcp && e.pcp.npi
          ? [
              { url: `${RA_SD}/ra-renderingProviderNpi`, valueString: e.pcp.npi },
              {
                url: `${RA_SD}/ra-sourceDocument`,
                valueString: `DocumentReference/${e.slug}-visitdoc-1`,
              },
            ]
          : undefined,
      serviceProvider: { reference: orgUuid },
      period: { start: `${now}T09:00:00Z`, end: `${now}T09:40:00Z` },
    });
  }

  const condUuids = [];
  // ICDs cited by a CLOSED-gap coding gap get a MEAT extension so the RADV bridge can
  // assess them defensible (Monitored/Evaluated/Assessed/Treated booleans — PHI-minimal).
  const closedGapIcds = new Set(
    (CODING_GAPS[e.slug] || []).filter((g) => g.status === 'closed-gap').flatMap((g) => g.ev || [])
  );
  const MEAT_EXT = {
    url: `${RA_SD}/ra-meat`,
    extension: [
      { url: 'monitored', valueBoolean: true },
      { url: 'evaluated', valueBoolean: true },
      { url: 'assessed', valueBoolean: true },
      { url: 'treated', valueBoolean: true },
    ],
  };
  const mkCondition = (code, text, onset, extraCat) =>
    add({
      resourceType: 'Condition',
      clinicalStatus: { coding: [{ system: CCLIN, code: 'active' }] },
      verificationStatus: { coding: [{ system: CVER, code: 'confirmed' }] },
      category: [
        { coding: [{ system: CCAT, code: 'problem-list-item', display: 'Problem List Item' }] },
        ...(extraCat ? [extraCat] : []),
      ],
      code: { coding: [{ system: ICD10, code, display: text }], text },
      subject: { reference: patientUuid },
      onsetDateTime: onset,
      ...(closedGapIcds.has(code) ? { extension: [MEAT_EXT] } : {}),
    });
  for (const [code, text, onset] of e.conditions || [])
    condUuids.push(mkCondition(code, text, onset));

  for (const [text, dosage] of e.meds || []) {
    const ing = String(text)
      .toLowerCase()
      .split(/[^a-z]/)[0];
    const rx = RXNORM[ing];
    add({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: {
        coding: rx ? [{ system: RXNORM_URI, code: rx[0], display: rx[1] }] : undefined,
        text,
      },
      subject: { reference: patientUuid },
      authoredOn: now,
      requester: pcpUuid ? { reference: pcpUuid } : undefined,
      dosageInstruction: [{ text: dosage }],
    });
  }

  const mkObs = (l) => {
    const cat = l.cat || 'laboratory';
    const obs = {
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSCAT, code: cat }] }],
      code: {
        coding: l.loinc ? [{ system: LOINC, code: l.loinc, display: l.text }] : undefined,
        text: l.text,
      },
      subject: { reference: patientUuid },
      effectiveDateTime: l.date,
    };
    if (l.components)
      obs.component = l.components.map(([lc, disp, v, u]) => ({
        code: { coding: [{ system: LOINC, code: lc, display: disp }], text: disp },
        valueQuantity: { value: v, unit: u, system: 'http://unitsofmeasure.org', code: u },
      }));
    else if (l.value !== undefined)
      obs.valueQuantity = {
        value: l.value,
        unit: l.unit,
        system: 'http://unitsofmeasure.org',
        code: l.unit,
      };
    if (l.interp)
      obs.interpretation = [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
              code: l.interp,
            },
          ],
        },
      ];
    return add(obs);
  };
  for (const l of e.labs || []) mkObs(l);

  const mkServiceRequest = (o) =>
    add(
      finalizeServiceRequest({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        category: [
          {
            coding: [
              {
                system: SCT,
                code: o.category === 'referral' ? '3457005' : '108252007',
                display: o.category === 'referral' ? 'Patient referral' : 'Laboratory procedure',
              },
            ],
          },
        ],
        code: {
          coding: o.loinc ? [{ system: LOINC, code: o.loinc, display: o.text }] : undefined,
          text: o.text,
        },
        subject: { reference: patientUuid },
        authoredOn: o.date,
        requester: pcpUuid ? { reference: pcpUuid } : undefined,
      })
    );
  for (const o of e.orders || []) mkServiceRequest(o);

  // ── SDOH ──
  if (e.sdoh) {
    // screening Observations (AHC-HRSN / PRAPARE), social-history category
    for (const [key, val] of Object.entries(e.sdoh.screening || {})) {
      const [loinc, disp] = SDOH_Q[key] || [null, key];
      add({
        resourceType: 'Observation',
        status: 'final',
        category: [
          { coding: [{ system: OBSCAT, code: 'social-history', display: 'Social History' }] },
        ],
        code: {
          coding: loinc ? [{ system: LOINC, code: loinc, display: disp }] : undefined,
          text: disp,
        },
        subject: { reference: patientUuid },
        effectiveDateTime: '2026-01-08',
        valueCodeableConcept: { text: val },
      });
    }
    // needs → Z-code Condition (optional) + closed-loop referral (ServiceRequest → Task → CBO)
    for (const need of e.sdoh.needs || []) {
      let addressesCond = null;
      if (need.zcode)
        addressesCond = mkCondition(need.zcode, need.zdisplay, need.date, {
          coding: [
            {
              system:
                'http://hl7.org/fhir/us/sdoh-clinicalcare/CodeSystem/SDOHCC-CodeSystemTemporaryCodes',
              code: 'sdoh-category-unspecified',
              display: 'SDOH Category Unspecified',
            },
          ],
        });
      const cboUuid = add({
        resourceType: 'Organization',
        active: true,
        name: need.cbo,
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/organization-type',
                code: 'other',
                display: 'Community-Based Organization',
              },
            ],
            text: 'Community-Based Organization (CBO)',
          },
        ],
      });
      const srUuid = add(
        finalizeServiceRequest({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'order',
          category: [{ coding: [{ system: SCT, code: '3457005', display: 'Patient referral' }] }],
          code: { text: need.referral },
          subject: { reference: patientUuid },
          authoredOn: need.date,
          requester: pcpUuid ? { reference: pcpUuid } : undefined,
          performer: [{ reference: cboUuid }],
          reasonReference: addressesCond ? [{ reference: addressesCond }] : undefined,
        })
      );
      add({
        resourceType: 'Task',
        status: 'in-progress',
        intent: 'order',
        code: {
          coding: [
            {
              system: 'http://hl7.org/fhir/CodeSystem/task-code',
              code: 'fulfill',
              display: 'Fulfill the focal request',
            },
          ],
        },
        description: `Closed-loop CBO referral: ${need.referral}`,
        focus: { reference: srUuid },
        for: { reference: patientUuid },
        owner: { reference: cboUuid },
        authoredOn: need.date,
        businessStatus: { text: need.businessStatus },
      });
    }
  }

  // ── Behavioral health ──
  if (e.bh) {
    for (const s of e.bh.surveys || []) {
      const obs = {
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: OBSCAT, code: 'survey', display: 'Survey' }] }],
        code: { coding: [{ system: LOINC, code: s.loinc, display: s.text }], text: s.text },
        subject: { reference: patientUuid },
        effectiveDateTime: '2026-03-15',
        valueQuantity: {
          value: s.score,
          unit: '{score}',
          system: 'http://unitsofmeasure.org',
          code: '{score}',
        },
      };
      if (s.interp)
        obs.interpretation = [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                code: s.interp,
              },
            ],
          },
        ];
      add(obs);
    }
    if (e.bh.referral) {
      const bhOrg = add({
        resourceType: 'Organization',
        active: true,
        name: e.bh.referral.to,
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/organization-type',
                code: 'prov',
                display: 'Healthcare Provider',
              },
            ],
            text: 'Behavioral Health Provider',
          },
        ],
      });
      const bhSr = add(
        finalizeServiceRequest({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'order',
          category: [{ coding: [{ system: SCT, code: '3457005', display: 'Patient referral' }] }],
          code: { text: 'Behavioral health referral' },
          subject: { reference: patientUuid },
          authoredOn: e.bh.referral.date,
          requester: pcpUuid ? { reference: pcpUuid } : undefined,
          performer: [{ reference: bhOrg }],
          reasonCode: [{ text: e.bh.referral.reason }],
        })
      );
      add({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: { coding: [{ system: 'http://hl7.org/fhir/CodeSystem/task-code', code: 'fulfill' }] },
        description: 'Closed-loop behavioral-health referral',
        focus: { reference: bhSr },
        for: { reference: patientUuid },
        owner: { reference: bhOrg },
        authoredOn: e.bh.referral.date,
        businessStatus: { text: e.bh.referral.businessStatus },
      });
    }
  }

  // ── 42 CFR Part 2 Consent (SUD patients) ──
  if (e.part2) {
    add({
      resourceType: 'Consent',
      status: 'active',
      scope: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/consentscope',
            code: 'patient-privacy',
            display: 'Privacy Consent',
          },
        ],
      },
      category: [{ coding: [{ system: LOINC, code: '59284-0', display: 'Consent Document' }] }],
      patient: { reference: patientUuid },
      dateTime: now,
      policy: [{ uri: 'https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2' }],
      provision: {
        type: 'permit',
        securityLabel: [{ system: ACT, code: '42CFRPart2', display: '42 CFR Part 2' }],
        purpose: [{ system: ACT, code: 'TREAT', display: 'Treatment' }],
      },
    });
  }

  // Goals + CareTeam + CarePlan
  const goalUuids = (e.goals || []).map((g) => {
    const coding = goalCoding(g);
    return add({
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      description: { coding: coding ? [coding] : undefined, text: g },
      subject: { reference: patientUuid },
    });
  });
  let careTeamUuid = null;
  if (pcpUuid)
    careTeamUuid = add({
      resourceType: 'CareTeam',
      status: 'active',
      subject: { reference: patientUuid },
      participant: [
        {
          role: [
            { coding: [{ system: SCT, code: '446050000', display: 'Primary care physician' }] },
          ],
          member: { reference: pcpUuid },
        },
      ],
      managingOrganization: [{ reference: orgUuid }],
    });
  if (goalUuids.length || condUuids.length)
    add({
      resourceType: 'CarePlan',
      status: 'active',
      intent: 'plan',
      category: [{ coding: [{ system: SCT, code: '734163000', display: 'Care plan' }] }],
      subject: { reference: patientUuid },
      careTeam: careTeamUuid ? [{ reference: careTeamUuid }] : undefined,
      addresses: condUuids.map((r) => ({ reference: r })),
      goal: goalUuids.map((r) => ({ reference: r })),
    });

  // Carry over existing per-patient fhir-state resources
  const carry = [];
  for (const [type, arr] of Object.entries(getState())) {
    if (type === 'Patient') continue;
    for (const res of Array.isArray(arr) ? arr : []) {
      const ref =
        res.subject?.reference ||
        res.patient?.reference ||
        res.for?.reference ||
        res.beneficiary?.reference ||
        '';
      if (ref.split('/').pop() === pid) carry.push(res);
    }
  }
  for (const src of carry) {
    const res = JSON.parse(JSON.stringify(src));
    delete res.id;
    delete res.meta;
    const rewrite = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) return obj.forEach(rewrite);
      for (const k of Object.keys(obj)) {
        if (k === 'reference' && typeof obj[k] === 'string') {
          const tail = obj[k].split('/').pop();
          if (tail === pid || obj[k].includes(pid)) obj[k] = patientUuid;
          else if (!obj[k].startsWith('urn:uuid:')) delete obj[k];
        } else rewrite(obj[k]);
      }
    };
    rewrite(res);
    // Coding governance for carried resources: a text-only ServiceRequest (e.g.
    // alex's "Endocrinologist" / "Labs") gets a governed serviceCode so it admits;
    // a Flag gets a PHI-safe category coding so its projected node is meaningful.
    if (res.resourceType === 'ServiceRequest') finalizeServiceRequest(res);
    else if (res.resourceType === 'Flag') finalizeFlag(res);
    add(res);
  }

  // Da Vinci-RA Coding Gap MeasureReports (authored demo data; evidence resolved by
  // ICD code against the Conditions built above, so refs stay valid across regen).
  (CODING_GAPS[e.slug] || []).forEach((g, i) =>
    add(buildCodingGap(e.slug, patientUuid, entries, g, i))
  );

  return { resourceType: 'Bundle', type: 'transaction', entry: entries };
}

// Driver — runs ONLY when executed directly (`node gen-patient-bundles.mjs`), NEVER on
// import. Without this guard, importing CODING_GAPS (e.g. from the drift-guard test)
// would re-run generation and OVERWRITE the committed, hand-maintained bundles as a
// side effect. Guard: this module's path === the script node was invoked with.
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    // realpath both sides so a symlinked invocation still resolves as main (and an
    // import — argv[1] is the test runner — never does). Fails safe to false on error.
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMainModule()) {
  const outDir = path.join(ROOT, 'fhir/seed/patients');
  mkdirSync(outDir, { recursive: true });
  const manifest = [];
  for (const pid of Object.keys(ENRICH)) {
    const bundle = buildBundle(pid);
    const slug = ENRICH[pid].slug;
    const counts = {};
    for (const en of bundle.entry)
      counts[en.resource.resourceType] = (counts[en.resource.resourceType] || 0) + 1;
    writeFileSync(path.join(outDir, `${slug}.bundle.json`), JSON.stringify(bundle, null, 2));
    manifest.push({
      pid,
      slug,
      file: `fhir/seed/patients/${slug}.bundle.json`,
      entries: bundle.entry.length,
      resourceTypes: counts,
    });
    console.log(
      `✔ ${slug}: ${bundle.entry.length} entries  {${Object.entries(counts)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')}}`
    );
  }
  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${manifest.length} bundles + manifest.json`);
}
