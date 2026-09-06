/**
 * MTM Agent — shared types.
 *
 * All types used across the MTM domain: drug lookup, interaction checking,
 * duplicate therapy, refill-too-soon, and the consolidated finding surface.
 *
 * No imports from React or Next.js — pure domain types.
 */

// ── Drug Lookup ────────────────────────────────────────────────────────────────

/** A single result from the drug-lookup BFF route. */
export interface DrugLookupResult {
  rxcui: string;
  /** Canonical (generic) name */
  name: string;
  isGeneric: boolean;
  /** Present when the searched term was a brand name */
  brandName?: string;
  /** Generic equivalent name (present when a brand was searched) */
  genericName?: string;
  /** Suggested sig string, may be empty */
  suggestedSig: string;
  /** At most 3 NDC codes associated with this RxCUI */
  ndcList: string[];
  /** ATC level-4 class code (used by duplicate-therapy checker) */
  atcLevel4?: string;
  /** Pharmacological allergy class keys (e.g. ['penicillin','beta-lactam']) — used by allergyChecker */
  allergyClasses?: string[];
  /** Descriptive cost tier: 'low' | 'medium' | 'high' (optional — depends on API availability) */
  costTier?: 'low' | 'medium' | 'high';
}

/** Result from the NDC BFF route. */
export interface NdcResult {
  ndc: string;
  labeler: string;
  packageDescription: string;
}

// ── Drug Interaction ───────────────────────────────────────────────────────────

/** A single drug–drug interaction pair. */
export interface DrugInteraction {
  drug1: { rxcui: string; name: string };
  drug2: { rxcui: string; name: string };
  /** Clinical severity assessed by the underlying data source */
  severity: 'contraindicated' | 'major' | 'moderate' | 'minor';
  description: string;
  /** Data source reference (e.g. 'NDF-RT', 'DrugBank') */
  source: string;
}

// ── Allergy ────────────────────────────────────────────────────────────────────

/**
 * Minimal allergy representation passed into the MTM engine.
 * Mapped from FHIR AllergyIntolerance at the call-site.
 */
export interface PatientAllergy {
  /** AllergyIntolerance.id — used as FHIR reference in DetectedIssue.implicated */
  id: string;
  /** Substance name (e.g. "Penicillin", "Sulfonamides") */
  substanceName: string;
  /**
   * Normalised allergy class keys — derived from coding and/or substance name.
   * Used for class-level matching (e.g. 'penicillin' catches Amoxicillin).
   * Values are lowercase, hyphenated (e.g. 'penicillin', 'sulfonamide', 'nsaid').
   */
  allergyClasses: string[];
  /** FHIR criticality: 'high' | 'low' | 'unable-to-assess' */
  criticality?: string;
  /** Worst reaction severity from reaction[].severity */
  reactionSeverity?: string;
}

// ── MTM Findings ──────────────────────────────────────────────────────────────

export type MtmFindingType =
  'interaction' | 'duplicate-therapy' | 'refill-too-soon' | 'beers-criteria' | 'drug-allergy';

export type MtmSeverity = 'contraindicated' | 'major' | 'moderate' | 'minor' | 'info';

/** A single actionable finding produced by the MTM engine. */
export interface MtmFinding {
  type: MtmFindingType;
  severity: MtmSeverity;
  /** Short summary shown in the UI chip */
  headline: string;
  /** Full clinical rationale shown on expansion */
  detail: string;
  /** Whether the provider must explicitly acknowledge before submitting */
  requiresAcknowledgement: boolean;
  /** If true the submit action is fully blocked (severity === 'contraindicated') */
  hardBlock: boolean;
}

// ── FHIR DetectedIssue output ─────────────────────────────────────────────────

/**
 * A FHIR R4 DetectedIssue resource produced by the MTM engine.
 * Conforms to Da Vinci MTM DetectedIssue pattern.
 * Written to the FHIR store after physician acknowledgement.
 */
export interface FhirDetectedIssue {
  resourceType: 'DetectedIssue';
  status: 'final' | 'preliminary' | 'entered-in-error';
  code: {
    coding: Array<{ system: string; code: string; display: string }>;
    text: string;
  };
  severity: 'high' | 'moderate' | 'low';
  patient: { reference: string };
  identifiedDateTime: string;
  /** References to the MedicationRequest(s) and/or AllergyIntolerance(s) involved */
  implicated: Array<{ reference: string }>;
  detail: string;
  mitigation?: Array<{
    action: { text: string };
    date?: string;
    author?: { reference: string };
  }>;
}

// ── MTM Engine I/O ─────────────────────────────────────────────────────────────

/** Current medication on the patient's active med list (subset of FHIR MedicationRequest). */
export interface CurrentMedication {
  rxcui: string;
  name: string;
  /** ATC level-4 class — used for duplicate-therapy check */
  atcLevel4?: string;
  /** Days supply of the last fill (for refill-too-soon) */
  lastFillDaysSupply?: number;
  /** ISO date of the last fill authoredOn (for refill-too-soon) */
  lastFillDate?: string;
}

/** Input to the MTM engine's evaluate() function. */
export interface MtmCheckInput {
  /** The new drug being ordered */
  newDrug: DrugLookupResult;
  /** The patient's current active medications */
  currentMedications: CurrentMedication[];
  /** Known drug–drug interactions (fetched from BFF) */
  interactions: DrugInteraction[];
  /** Patient's active allergies — for drug-allergy contraindication check */
  allergies?: PatientAllergy[];
  /** Patient age in years (for Beers Criteria) */
  patientAgeYears?: number;
  /** Clock override for testing */
  nowIso?: string;
}
