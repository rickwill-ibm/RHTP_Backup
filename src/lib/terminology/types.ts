/**
 * Terminology / semantic-validation seam — types (Iteration 4 terminology seam).
 *
 * Structural validity (does the record have the right shape — FhirProfileValidator
 * at pipeline stage 4) is NOT the same as SEMANTIC validity: is a code an actual
 * RxNorm / LOINC / SNOMED / ICD-10 code, does it translate across systems, and how
 * does it classify (HCC risk-adjustment grouping, value-set membership)? That is
 * the job of a terminology server. This seam expresses it; the seeded stub answers
 * for demo data, and the production stub throws until a real server is wired.
 */

/** The code systems this seam governs. */
export const TERMINOLOGY_SYSTEMS = Object.freeze([
  'RxNorm',
  'LOINC',
  'SNOMED-CT',
  'ICD-10-CM',
  'CPT-HCPCS',
  'HCC',
] as const);
export type TerminologySystem = (typeof TERMINOLOGY_SYSTEMS)[number];

/** Canonical FHIR/URI form of each governed system, for mapping payload codings. */
export const SYSTEM_URIS: Readonly<Record<TerminologySystem, string>> = Object.freeze({
  RxNorm: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  LOINC: 'http://loinc.org',
  'SNOMED-CT': 'http://snomed.info/sct',
  'ICD-10-CM': 'http://hl7.org/fhir/sid/icd-10-cm',
  'CPT-HCPCS': 'http://www.ama-assn.org/go/cpt',
  HCC: 'urn:cms:risk-adjustment:hcc',
});

/** Reverse map: a coding.system URI -> the governed TerminologySystem, if any. */
export function systemForUri(uri: string): TerminologySystem | undefined {
  for (const s of TERMINOLOGY_SYSTEMS) if (SYSTEM_URIS[s] === uri) return s;
  return undefined;
}

export type CodeValidationStatus =
  | 'valid'
  | 'unknown-code' //     the system is governed but the code is not recognized
  | 'retired' //          the code existed in a prior version but is retired/removed in the current bound version (I8A-ii wave A)
  | 'unsupported-system'; // the system is not one we govern

/**
 * The registry asset a code was validated / classified against — the ACTIVE
 * version the semantic layer bound the check to. PHI-free (metadata only).
 */
export interface CodeAssetBinding {
  assetId: string;
  version: string;
  status: string;
  /** true when that bound version is current at check time. */
  current: boolean;
}

/** Result of validateCode — PHI-free (system + code + status only). */
export interface CodeValidation {
  system: TerminologySystem | string;
  code: string;
  valid: boolean;
  status: CodeValidationStatus;
  /** Human-readable display when known (demo/reference only). */
  display?: string;
  /** true for the seeded/stub answer, so callers never mistake it for a live server. */
  stub: boolean;
  /** The registry asset (active version) this code was validated against, when known. */
  binding?: CodeAssetBinding;
}

/** Result of translate ($translate / ConceptMap). */
export interface TranslationResult {
  sourceSystem: TerminologySystem;
  sourceCode: string;
  targetSystem: TerminologySystem;
  /** Empty when no mapping is known. */
  targetCode: string | null;
  matched: boolean;
  stub: boolean;
}

/** A classification scheme classify() can resolve against. */
export type ClassificationScheme = 'HCC' | 'value-set';

/** Result of classify (HCC risk-adjustment grouping / value-set membership). */
export interface ClassificationResult {
  scheme: ClassificationScheme;
  code: string;
  /** The group / value-set the code maps into (e.g. 'HCC38'), or null if none. */
  group: string | null;
  label?: string;
  classified: boolean;
  stub: boolean;
  /** The registry asset (active version) this classification was resolved against, when known. */
  binding?: CodeAssetBinding;
}

/**
 * The terminology service seam. `validateCode` answers "is this a real code";
 * `translate` crosses systems ($translate / ConceptMap); `classify` groups a
 * code (HCC risk adjustment, value-set membership).
 */
export interface TerminologyService {
  readonly id: string;
  validateCode(system: TerminologySystem | string, code: string): CodeValidation;
  translate(
    code: string,
    sourceSystem: TerminologySystem,
    targetSystem: TerminologySystem
  ): TranslationResult;
  classify(code: string, scheme: ClassificationScheme, valueSetId?: string): ClassificationResult;
}

/**
 * Thrown by the production terminology service until a real terminology server
 * is wired. Names the FHIR terminology operations needed (fail-loud, PHI-free).
 */
export class TerminologyServiceNotConfiguredError extends Error {
  readonly capability: string;
  constructor(capability: string) {
    super(
      `Terminology server not configured for "${capability}". Real integration is a later ` +
        `roadmap iteration. Needs a FHIR terminology server (TERMINOLOGY_SERVER_BASE_URL) ` +
        `exposing CodeSystem $validate-code, ConceptMap $translate, and ValueSet $expand, ` +
        `or set DATA_MODE_TERMINOLOGY=seeded to use the in-repo allowlist.`
    );
    this.name = 'TerminologyServiceNotConfiguredError';
    this.capability = capability;
  }
}
