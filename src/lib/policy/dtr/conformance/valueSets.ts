/**
 * Curated FHIR terminology for the bariatric CONFORMANCE SLICE (CPT 43775 vertical).
 *
 * This is the "coding map" a payer authors: the real code systems + value sets a Da Vinci
 * CRD `coverage-info` card and a DTR Questionnaire bind to. It is CURATED, not fabricated at
 * runtime — the deterministic engine "never invents codes", so the codes a conformant artifact
 * needs are authored here (versioned, reviewable) and the generator binds to them.
 *
 * Systems are the real canonical URLs (LOINC, ICD-10-CM, SNOMED CT, CPT, HL7). Value sets are
 * given canonical URLs under the RHTP namespace with their concept sets inline, the way a DTR
 * Questionnaire's `answerValueSet` resolves.
 */

export const SYSTEM = {
  loinc: 'http://loinc.org',
  icd10: 'http://hl7.org/fhir/sid/icd-10-cm',
  snomed: 'http://snomed.info/sct',
  cpt: 'http://www.ama-assn.org/go/cpt',
  ynu: 'http://terminology.hl7.org/CodeSystem/data-absent-reason', // unknown lives here; y/n below
  hl7YesNo: 'http://terminology.hl7.org/CodeSystem/v2-0136',
  crdCardType: 'http://hl7.org/fhir/us/davinci-crd/CodeSystem/cardType',
  crdCoverage: 'http://hl7.org/fhir/us/davinci-crd/CodeSystem/coverage-information',
} as const;

export interface Coding {
  system: string;
  code: string;
  display: string;
}

export interface ValueSetDef {
  url: string;
  title: string;
  concepts: Coding[];
}

/** Yes / No / Unknown — the answer set for a provider attestation choice. */
export const VS_YES_NO_UNKNOWN: ValueSetDef = {
  url: 'urn:rhtp:dtr/ValueSet/yes-no-unknown',
  title: 'Yes / No / Unknown',
  concepts: [
    { system: SYSTEM.hl7YesNo, code: 'Y', display: 'Yes' },
    { system: SYSTEM.hl7YesNo, code: 'N', display: 'No' },
    { system: SYSTEM.snomed, code: '261665006', display: 'Unknown' },
  ],
};

/** Obesity diagnoses that qualify a bariatric request (ICD-10-CM + SNOMED cross-map). */
export const VS_OBESITY_DX: ValueSetDef = {
  url: 'urn:rhtp:dtr/ValueSet/obesity-diagnosis',
  title: 'Obesity diagnosis (qualifying)',
  concepts: [
    {
      system: SYSTEM.icd10,
      code: 'E66.01',
      display: 'Morbid (severe) obesity due to excess calories',
    },
    {
      system: SYSTEM.icd10,
      code: 'E66.2',
      display: 'Morbid obesity with alveolar hypoventilation',
    },
    { system: SYSTEM.snomed, code: '238136002', display: 'Morbid obesity (disorder)' },
  ],
};

/** Qualifying obesity-related comorbidities. */
export const VS_COMORBIDITY: ValueSetDef = {
  url: 'urn:rhtp:dtr/ValueSet/obesity-comorbidity',
  title: 'Qualifying comorbidity',
  concepts: [
    {
      system: SYSTEM.icd10,
      code: 'E11.9',
      display: 'Type 2 diabetes mellitus without complications',
    },
    { system: SYSTEM.icd10, code: 'G47.33', display: 'Obstructive sleep apnea' },
    { system: SYSTEM.icd10, code: 'I10', display: 'Essential (primary) hypertension' },
  ],
};

/** LOINC codes for the pre-populated clinical observations. */
export const LOINC_BMI: Coding = {
  system: SYSTEM.loinc,
  code: '39156-5',
  display: 'Body mass index (BMI)',
};

/** The procedure this slice authorizes. */
export const CPT_SLEEVE: Coding = {
  system: SYSTEM.cpt,
  code: '43775',
  display: 'Laparoscopic sleeve gastrectomy',
};

/** Da Vinci CRD response coding: a coverage-info card that says PA is required. */
export const CRD_CARD_TYPE_COVERAGE_INFO: Coding = {
  system: SYSTEM.crdCardType,
  code: 'coverage-info',
  display: 'Coverage Information',
};
export const CRD_COVERAGE_PA_REQUIRED: Coding = {
  system: SYSTEM.crdCoverage,
  code: 'prior-auth-required',
  display: 'Prior authorization required',
};
export const CRD_COVERAGE_COVERED: Coding = {
  system: SYSTEM.crdCoverage,
  code: 'covered',
  display: 'Covered',
};

// ---------------------------------------------------------------------------
// Cross-domain corpus (Phase 3) — the layer is payer- AND domain-general. These
// come from a DIFFERENT payer + specialty than the bariatric seed: Aetna CPB 0165
// (Cardiac Catheter Ablation & Radioablation), proving the seam is not bariatric-
// or Horizon-specific. Codes are the policy's real canonical systems.
// ---------------------------------------------------------------------------

/** Qualifying cardiac arrhythmia diagnoses (Aetna CPB 0165 catheter-ablation indications). */
export const VS_CARDIAC_ARRHYTHMIA: ValueSetDef = {
  url: 'urn:rhtp:dtr/ValueSet/cardiac-arrhythmia',
  title: 'Qualifying cardiac arrhythmia',
  concepts: [
    { system: SYSTEM.icd10, code: 'I48.0', display: 'Paroxysmal atrial fibrillation' },
    { system: SYSTEM.icd10, code: 'I48.19', display: 'Persistent atrial fibrillation' },
    { system: SYSTEM.icd10, code: 'I48.3', display: 'Typical atrial flutter' },
    { system: SYSTEM.icd10, code: 'I47.1', display: 'Supraventricular tachycardia (incl. AVNRT)' },
    { system: SYSTEM.icd10, code: 'I47.20', display: 'Ventricular tachycardia, unspecified' },
    { system: SYSTEM.icd10, code: 'I45.6', display: 'Pre-excitation syndrome (WPW)' },
    { system: SYSTEM.snomed, code: '49436004', display: 'Atrial fibrillation (disorder)' },
  ],
};

/** Covered cardiac catheter ablation procedures (Aetna CPB 0165). CPT — always stays inline. */
export const VS_ABLATION_CPT: ValueSetDef = {
  url: 'urn:rhtp:dtr/ValueSet/cardiac-ablation-procedure',
  title: 'Cardiac catheter ablation procedure',
  concepts: [
    { system: SYSTEM.cpt, code: '93650', display: 'Ablation of atrioventricular node function' },
    { system: SYSTEM.cpt, code: '93653', display: 'EP ablation — supraventricular tachycardia' },
    { system: SYSTEM.cpt, code: '93654', display: 'EP ablation — ventricular tachycardia' },
    {
      system: SYSTEM.cpt,
      code: '93656',
      display: 'EP ablation — atrial fibrillation (pulmonary vein isolation)',
    },
  ],
};

/** Tobacco use status — a cross-cutting eligibility concept (surgical + cardiac medical policies). */
export const VS_TOBACCO_STATUS: ValueSetDef = {
  url: 'urn:rhtp:dtr/ValueSet/tobacco-use-status',
  title: 'Tobacco use status',
  concepts: [
    { system: SYSTEM.snomed, code: '77176002', display: 'Current every day smoker' },
    { system: SYSTEM.snomed, code: '8517006', display: 'Former smoker' },
    { system: SYSTEM.snomed, code: '266919005', display: 'Never smoked tobacco' },
  ],
};

/**
 * The inline, pre-expanded ValueSet corpus — every curated answer-set a DTR choice item can bind to.
 * This is the offline expansion the inline terminology provider serves (no VSAC key, deterministic).
 * Adding a value set here makes it resolvable + expandable; nothing else needs to change. Spans two
 * payers (Horizon bariatric seed + Aetna cardiac) and three domains (metabolic, cardiac, behavioral).
 */
export const ALL_VALUE_SETS: readonly ValueSetDef[] = [
  VS_YES_NO_UNKNOWN,
  VS_OBESITY_DX,
  VS_COMORBIDITY,
  VS_CARDIAC_ARRHYTHMIA,
  VS_ABLATION_CPT,
  VS_TOBACCO_STATUS,
];

/** Canonical URL → curated ValueSet, for O(1) inline `$expand` and for the demo renderer. */
export const VS_BY_URL: Readonly<Record<string, ValueSetDef>> = Object.freeze(
  Object.fromEntries(ALL_VALUE_SETS.map((v) => [v.url, v]))
);
