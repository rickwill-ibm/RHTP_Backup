/**
 * Phase 0 — Interface Freeze (Generalized Policy Processing & Provenance-Anchored Review).
 *
 * Frozen contracts published BEFORE any wave builds, so parallel work does not collide
 * (framework interface-freeze discipline). This module is TYPES ONLY — no runtime, nothing
 * is wired yet. Later phases implement against these shapes and migrate the live types.
 *
 * Design rule: ADDITIVE. We extend the existing MemberContext / Predicate / CriteriaSet
 * instead of mutating them, so current behavior is untouched until a phase deliberately
 * widens the live type in place.
 *
 * Each contract is annotated with the red-team guardrail it carries (see
 * docs/plans/policy-processing-and-review-program.md §2).
 */

import type { MemberContext, PolicyIndication, CoverageDetermination } from './types';
import type { Predicate, CriteriaSet } from './criteria';

/* ------------------------------------------------------------------ *
 * Guardrail 5 — provenanceClass quarantine.
 * Every document/element is tagged. Only 'authoritative' may back a live
 * decision; 'sample'/'synthetic' are ingestible for pipeline testing only.
 * ------------------------------------------------------------------ */
export type ProvenanceClass = 'authoritative' | 'sample' | 'synthetic';

/* ------------------------------------------------------------------ *
 * Guardrail 2 — machine-verified anchors.
 * SourceAnchor is the full, byte-verifiable location of a cited snippet.
 * `contentHash` is re-checked at render/decision time; drift auto-revokes review.
 * ------------------------------------------------------------------ */
export interface SourceAnchor {
  anchorId: string;
  sourceFile: string;
  page: number | null;
  sectionHeading: string | null;
  paragraphIdx: number | null;
  lineRange: [number, number] | null;
  charSpan: [number, number];
  snippet: string;
  contentHash: string; // hash of source[charSpan] captured at ingest
  provenanceClass: ProvenanceClass;
}

/** A lightweight pointer that attaches to a domain object and resolves to a SourceAnchor. */
export interface ProvenanceAnchor {
  anchorId: string;
  contentHash: string;
  provenanceClass: ProvenanceClass;
}

/* ------------------------------------------------------------------ *
 * Extended member context — adds the facts richer criteria need
 * (BMI≥40 bariatric criteria are inexpressible under the current
 * diagnoses-only MemberContext). Additive: extends the live shape.
 * ------------------------------------------------------------------ */
export interface MemberObservation {
  code?: string; // LOINC / local, e.g. "39156-5" (BMI)
  display?: string;
  value?: number;
  unit?: string; // UCUM where possible
  effectiveDateTime?: string;
}

export interface MemberVitals {
  bmi?: number;
  weightKg?: number;
  heightCm?: number;
}

export interface MemberContextExtended extends MemberContext {
  observations?: MemberObservation[];
  vitals?: MemberVitals;
  ageYears?: number;
  comorbidities?: string[]; // ICD-10 codes
}

/* ------------------------------------------------------------------ *
 * Guardrail 6 — plan-scope. Criteria are selected by line of business
 * (Medicare NCD vs Medicaid state manual vs commercial), state, and payer.
 * ------------------------------------------------------------------ */
export type LineOfBusiness = 'Commercial' | 'Medicaid' | 'Medicare';

export interface PlanContext {
  lineOfBusiness: LineOfBusiness;
  state?: string; // e.g. "TX"
  payer?: string;
}

/* ------------------------------------------------------------------ *
 * New predicate leaves. Phase 1 WIDENS the live `Predicate` union in
 * criteria.ts in place to include these, so the existing all/any/not
 * combinators cover them automatically. Frozen here as the target shapes.
 * ------------------------------------------------------------------ */
export type PredicateLeafAdditions =
  | { kind: 'bmiAtLeast'; bmi: number }
  | { kind: 'bmiBelow'; bmi: number }
  | {
      kind: 'observationValueCompare';
      code: string;
      op: '>=' | '<=' | '>' | '<' | '==';
      value: number;
      unit?: string;
    }
  | { kind: 'hasComorbidity'; icd10: string[] };

/** The widened predicate the engine will evaluate once Phase 1 lands. */
export type PredicateV2 = Predicate | PredicateLeafAdditions;

/* ------------------------------------------------------------------ *
 * Guardrail 1 — POC/unreviewed rulesets are structurally barred from
 * evaluate(). A set may influence a member determination ONLY if it is
 * SME-reviewed AND cites an authoritative source AND names a reviewer.
 * We make that a COMPILE-TIME invariant: only `PromotedCriteriaSet`
 * (which requires all three) is accepted by the live evaluation path.
 * ------------------------------------------------------------------ */
export interface AuthoritativeSource {
  kind: 'CMS-NCD' | 'CMS-LCD' | 'state-medicaid-manual' | 'payer-policy';
  citation: string; // e.g. "NCD 100.1" or "TX Medicaid Provider Manual §9.2"
  url?: string;
  effectiveDate?: string;
}

export interface CriteriaSelector {
  lineOfBusiness?: LineOfBusiness;
  state?: string;
  payer?: string;
  appliesToCodes?: string[]; // CPT/HCPCS this set governs
}

/** CriteriaSet + provenance + selector, still promotable OR not. */
export interface CriteriaSetV2 extends CriteriaSet {
  selector?: CriteriaSelector;
  provenance?: SourceAnchor[];
  authoritativeSource?: AuthoritativeSource;
  reviewedBy?: string; // named clinical reviewer
}

/**
 * The ONLY criteria shape the live evaluate() path may accept.
 * All three guardrail-1 fields are REQUIRED — a POC set cannot be typed as this.
 */
export interface PromotedCriteriaSet extends CriteriaSetV2 {
  smeReviewed: true;
  authoritativeSource: AuthoritativeSource;
  reviewedBy: string;
}

/** Type guard contract (implemented in Phase 1) that gates promotion. */
export type PromoteCriteriaSet = (set: CriteriaSetV2) => PromotedCriteriaSet | null;

/* ------------------------------------------------------------------ *
 * Review BFF contracts (Phase 4 reviewer chatbot, placed in CMS-0057-F).
 * Guardrail 3 — hard PHI/model separation: the interrogate payload carries
 * references/codes/counts ONLY — never MemberContext. Enforced by shape.
 * Guardrail 4 — real maker-checker: per-element decision, maker≠checker,
 * reviewer must have viewed the rendered anchor before a flip is enabled.
 * ------------------------------------------------------------------ */
export interface PolicyReviewSummary {
  policyId: string;
  title: string;
  provenanceClass: ProvenanceClass;
  indications: PolicyIndication[];
  criteriaSetIds: string[];
}

export interface SourceRenderRequest {
  policyId: string;
  anchorId: string;
}

/** NOTE: no member fields — policy text/refs only (guardrail 3). */
export interface InterrogateRequest {
  policyId: string;
  question: string;
  anchorRefs?: string[]; // SourceAnchor.anchorId values
  codeRefs?: string[]; // CPT/HCPCS/ICD-10 in scope
}

export interface InterrogateResponse {
  answer: string;
  citedAnchors: ProvenanceAnchor[]; // every claim points back to source
}

export interface CriteriaDecisionRequest {
  setId: string;
  elementId: string; // per-element sign-off (no bulk approve-all)
  decision: 'approve' | 'reject';
  reviewerId: string; // must differ from the maker; server enforces
  viewedAnchorId: string; // proof the reviewer saw the rendered source
  note?: string;
}

export interface CriteriaDecisionResponse {
  setId: string;
  elementId: string;
  applied: boolean;
  auditId: string; // immutable audit-log entry
}

/* ------------------------------------------------------------------ *
 * Engine output extension — advisory-only labeling (guardrail 6).
 * The payer ClaimResponse stays authoritative; propensityToDeny is
 * decision-support, never an auto-final decision.
 * ------------------------------------------------------------------ */
export interface CoverageDeterminationV2 extends CoverageDetermination {
  advisoryOnly: true;
  planContext?: PlanContext;
  criteriaProvenance?: ProvenanceAnchor[];
}
