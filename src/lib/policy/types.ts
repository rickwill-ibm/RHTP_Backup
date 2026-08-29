/**
 * Generalized Policy Engine — normalized policy model + evaluation types.
 * (Golden Thread plan — Policy Engine increment PE-1.)
 *
 * A single normalized shape that ANY payer / state-agency policy can be
 * ingested into, regardless of the source format. Two reference adapters ship
 * today (Aetna Clinical Policy Bulletins; UnitedHealthcare PA-requirement
 * lists); new payers/states are added by writing an adapter that emits this
 * shape — the engine itself never changes.
 *
 * These types mirror `data/policy-library.seed.json` (produced by
 * `tools/seed/parse_policies.py`) so the mock library loads with no transform.
 */

export type PolicySource = 'Aetna' | 'UnitedHealthcare' | string;

export type PolicySourceType =
  'medical-clinical-policy-bulletin' | 'prior-authorization-requirements-list' | string;

/** How a determination is reached for codes governed by a policy. */
export type DeterminationBasis =
  | 'medical-necessity-criteria' // criteria-gated (Aetna CPB "covered if…")
  | 'experimental-investigational-not-covered' // auto-deny (Aetna CPB not covered)
  | 'code-on-pa-required-list'; // requires PA because code is listed (UHC)

/** Code buckets extracted from an Aetna CPB. */
export interface PolicyCodeBuckets {
  cptCovered: string[];
  cptNotCovered: string[];
  cptOther: string[];
  hcpcsCovered: string[];
  hcpcsNotCovered: string[];
  hcpcsOther: string[];
  icd10Covered: string[];
  icd10NotCovered: string[];
}

/** A lettered medical-necessity indication (Aetna CPB "I. Medical Necessity"). */
export interface PolicyIndication {
  label: string; // "A", "B", …
  title: string;
  /** Individually required (all-of) vs. one of several alternatives (one-of). */
  required?: boolean;
}

/** A category → codes group from a payer PA-requirement list (UHC). */
export interface PaListItem {
  category: string;
  codes: string[];
  effectiveDate: string | null;
}

/**
 * The normalized policy. Optional fields carry adapter-specific detail; the
 * engine only relies on the common fields (source, requiresPA,
 * determinationBasis, and the code accessors derived below).
 */
export interface NormalizedPolicy {
  policyId: string;
  source: PolicySource;
  sourceType: PolicySourceType;
  title: string;
  category: string;
  requiresPA: boolean;
  determinationBasis: DeterminationBasis;

  // Aetna CPB fields
  number?: string | null;
  url?: string | null;
  effectiveDate?: string | null;
  reviewLastDate?: string | null;
  nextReviewDate?: string | null;
  experimental?: boolean;
  codes?: PolicyCodeBuckets;
  indications?: PolicyIndication[];

  // UHC list fields
  plan?: string;
  paItems?: PaListItem[];
  allPaCodes?: string[];

  // provenance
  sourceFile?: string;
  rawTextChars?: number;
}

export interface PolicyLibrary {
  libraryVersion: string;
  generator?: string;
  sourceCorpus?: string;
  policyCount: number;
  policies: NormalizedPolicy[];
}

// ---------- evaluation inputs ----------

/** A diagnosis the member carries (from FHIR Condition). */
export interface MemberDiagnosis {
  code?: string; // ICD-10, e.g. "I42.0"
  display?: string;
}

/** The member context the engine reasons over (projected from FHIR). */
export interface MemberContext {
  memberId: string;
  payer?: string; // e.g. "UnitedHealthcare Community Plan — Texas STAR"
  plan?: string;
  diagnoses: MemberDiagnosis[];
}

/** The ordered service being evaluated (from FHIR ServiceRequest). */
export interface OrderContext {
  code: string; // CPT/HCPCS, e.g. "72148"
  codeSystem?: 'CPT' | 'HCPCS' | string;
  display?: string;
}

// ---------- evaluation outputs ----------

export type DeterminationOutcome =
  | 'pa-required-criteria-review' // PA needed; criteria-gated medical necessity
  | 'pa-required-list' // PA needed because code is on payer PA list
  | 'likely-denial-experimental' // code is experimental/not covered
  | 'no-policy-found' // nothing in the library governs this code
  | 'no-pa-required'; // governed but PA not required

/** A specific missing element blocking a clean approval. */
export interface Deficiency {
  kind: 'missing-supporting-diagnosis' | 'missing-documentation' | 'experimental-service';
  detail: string;
}

/** A policy the order matched, and how. */
export interface PolicyMatch {
  policyId: string;
  source: PolicySource;
  title: string;
  number?: string | null;
  url?: string | null;
  basis: DeterminationBasis;
  matchedBucket: 'cptCovered' | 'hcpcsCovered' | 'cptNotCovered' | 'hcpcsNotCovered' | 'pa-list';
  category?: string;
}

/**
 * The engine's answer — a Coverage Determination Record fragment that threads
 * into the Golden Thread Evidence Record (Da Vinci CRD/DTR/PAS input).
 */
export interface CoverageDetermination {
  order: OrderContext;
  memberId: string;
  outcome: DeterminationOutcome;
  requiresPA: boolean;
  criteriaMet: boolean | null; // null when not criteria-gated
  matchedPolicies: PolicyMatch[];
  indicationsConsidered: PolicyIndication[];
  deficiencies: Deficiency[];
  /** 0–100 heuristic propensity that a submission is denied as-is. */
  propensityToDeny: number;
  rationale: string;
  evaluatedAt?: string; // caller stamps; engine stays deterministic
}
