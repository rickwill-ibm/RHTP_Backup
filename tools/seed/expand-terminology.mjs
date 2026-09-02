#!/usr/bin/env node
/**
 * Governed expansion of the in-repo terminology allowlist
 * (src/lib/terminology/data/terminology-seed.json) so the whole-person patient
 * bundles ADMIT through the semantic gate instead of quarantining.
 *
 * This is a CURATED delta (reviewed code→display list), applied under the systems
 * and value-set families that ALREADY exist in the seed — no new terminology
 * structure. Codes are real ICD-10-CM / LOINC / RxNorm / SNOMED-CT concepts
 * covering the clinical + Gravity SDOH + behavioral-health codesets the records use.
 * Idempotent: only adds missing codes; never removes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(__dirname, '../../src/lib/terminology/data/terminology-seed.json');

// ── Curated delta, grouped by the seed's system names ──
const CURATED = {
  'ICD-10-CM': {
    // clinical
    'E11.65': 'Type 2 diabetes mellitus with hyperglycemia',
    'E11.9': 'Type 2 diabetes mellitus without complications',
    'E66.01': 'Morbid (severe) obesity due to excess calories',
    'E66.9': 'Obesity, unspecified',
    I10: 'Essential (primary) hypertension',
    'I50.32': 'Chronic diastolic (congestive) heart failure',
    'J44.1': 'Chronic obstructive pulmonary disease with (acute) exacerbation',
    'J45.50': 'Severe persistent asthma, uncomplicated',
    'N18.3': 'Chronic kidney disease, stage 3 (moderate)',
    'N18.32': 'Chronic kidney disease, stage 3b',
    // behavioral health (governed BH codeset)
    'F10.10': 'Alcohol use disorder, mild, uncomplicated',
    'F32.0': 'Major depressive disorder, single episode, mild',
    'F32.1': 'Major depressive disorder, single episode, moderate',
    // Gravity SDOH Z-codes (social codeset)
    'Z59.86': 'Financial insecurity',
  },
  LOINC: {
    // clinical labs / vitals
    '10230-1': 'Left ventricular Ejection fraction',
    '1558-6': 'Fasting glucose [Mass/volume] in Serum or Plasma',
    '1742-6': 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma',
    '18262-6': 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
    '2085-9': 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
    '2160-0': 'Creatinine [Mass/volume] in Serum or Plasma',
    '2571-8': 'Triglyceride [Mass/volume] in Serum or Plasma',
    '30934-4': 'Natriuretic peptide B [Mass/volume] in Serum or Plasma',
    '33914-3': 'Glomerular filtration rate/1.73 sq M.predicted',
    '39156-5': 'Body mass index (BMI) [Ratio]',
    '85354-9': 'Blood pressure panel with all children optional',
    '8462-4': 'Diastolic blood pressure',
    '89270-3': 'Waist-height ratio',
    '9318-7': 'Microalbumin/Creatinine [Mass Ratio] in Urine',
    // behavioral-health instruments (governed BH codeset)
    '44249-1': 'PHQ-9 quick depression assessment panel total score',
    '75626-2': 'Total score [AUDIT-C]',
    // Gravity / AHC-HRSN SDOH screening panels (governed social codeset)
    '71802-3': 'Housing status',
    '88122-7': 'Within the last year, were you worried that your food would run out [AHC-HRSN]',
    '93030-5': 'Has a lack of transportation kept you from appointments or daily living [AHC-HRSN]',
    '76513-1': 'How hard is it to pay for the very basics [PRAPARE]',
    // app care-gap + consent document codings carried in the record
    '11503-0': 'Clinical care gap',
    '75630-4': 'Social care gap',
    '59284-0': 'Patient Consent',
  },
  RxNorm: {
    435: 'Albuterol',
    4603: 'Furosemide',
    6809: 'Metformin',
    11289: 'Warfarin',
    17767: 'Amlodipine',
    20352: 'Carvedilol',
    29046: 'Lisinopril',
    41126: 'Fluticasone',
    52175: 'Losartan',
    69120: 'Tiotropium',
    83367: 'Atorvastatin',
    88249: 'Montelukast',
  },
  'SNOMED-CT': {
    108252007: 'Laboratory procedure',
    185349003: 'Encounter for check up',
    3457005: 'Patient referral',
    446050000: 'Primary care physician',
    734163000: 'Care plan',
    // WPC payer-dimension referral codes (coding + referral experts confirmed).
    103696004: 'Patient referral to specialist',
    306163007: 'Referral to dietetics service',
  },
  // WPC payer-dimension referral codes. The referral serviceCode is re-checked by the
  // load-stage semantic gate (CPT-HCPCS + SNOMED-CT are governed systems), so every
  // new governed referral code MUST live here or the referral trades
  // missing-service-code for semantic-unrecognized-code and stays quarantined.
  'CPT-HCPCS': {
    T2003: 'Non-emergency transportation; encounter/trip',
    90791: 'Psychiatric diagnostic evaluation',
    '2022F': 'Dilated retinal eye exam',
    94010: 'Spirometry',
  },
};

// Value-set membership additions (families already exist: sdoh-z-codes, chronic-conditions)
const VS_ADD = {
  'sdoh-z-codes': ['Z59.86'],
  'chronic-conditions': [
    'E11.65',
    'E11.9',
    'I10',
    'I50.32',
    'J44.1',
    'J45.50',
    'N18.3',
    'N18.32',
    'E66.01',
    'E66.9',
  ],
};

const seed = JSON.parse(readFileSync(SEED, 'utf8'));
let added = 0;
for (const [sys, codes] of Object.entries(CURATED)) {
  const target = seed.codeSystems[sys]?.codes;
  if (!target) {
    console.error(`! system ${sys} not in seed`);
    continue;
  }
  for (const [code, display] of Object.entries(codes)) {
    if (!(code in target)) {
      target[code] = display;
      added++;
    }
  }
}
for (const [vs, codes] of Object.entries(VS_ADD)) {
  if (!Array.isArray(seed.valueSets[vs])) continue;
  for (const c of codes) if (!seed.valueSets[vs].includes(c)) seed.valueSets[vs].push(c);
}
writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
console.log(`Terminology seed expanded: +${added} codes across ${Object.keys(CURATED).join(', ')}`);
for (const sys of Object.keys(CURATED))
  console.log(`  ${sys}: now ${Object.keys(seed.codeSystems[sys].codes).length} codes`);
