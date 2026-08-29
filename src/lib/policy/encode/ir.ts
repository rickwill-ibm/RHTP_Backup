/**
 * PolicyLogic — the typed clinical-structure IR (RHTP Policy Engine, encoding layer).
 *
 * Sits between extraction (`CriteriaPolicy` / `CriterionNode`, text) and generation
 * (DTR Questionnaire + CQL, CRD coverage rules, PAS QuestionnaireResponse). It captures the
 * clinical STRUCTURE the flat extractor loses: thresholds, boolean trees, value sets, time windows,
 * exclusions, populations, and per-procedure coverage.
 *
 * Design authority: docs/policy-encoder-spec.md (v2, pressure-tested). The shapes here implement
 * §3 of that spec and exist to uphold its §1 safety invariants — in particular:
 *   - fail-closed coverage default (`PolicyLogic.defaultProcedureRole`)
 *   - verbatim operators + explicit endpoint inclusivity (`Measure.inclusiveLow/High`)
 *   - value-set polarity (`CodedValueSet.polarity`) so deny families never read as eligibility
 *   - population-gate integrity (`Pathway.population`, `Measure.thresholdVariant`)
 *   - manual-review as a first-class outcome (`Pathway.role`)
 *   - no silent degradation (`EncodedCriterion.reviewFlag`, fail-closed `crossRefs`)
 *
 * FRAMEWORK RULE: every value here is a parse of text present in the document. Nothing is invented;
 * `sourceSpan` byte-anchors each value, `sourceSection` records where it came from, and `labelSource`
 * records whether a label was extracted, OCR-repaired, or inferred by position.
 *
 * This module is PURE TYPES — no runtime logic — so it is safe to import from either the encoding
 * cores or the FHIR/CRD generators without pulling in behavior.
 */
import type { Span } from '../extract/provenance';

// ---------------------------------------------------------------------------
// Boolean structure — the core eligibility rule is AND-over-OR-over-AND, which
// FHIR `enableWhen` (flat, single `enableBehavior`) cannot express. (spec F4/F12)
// ---------------------------------------------------------------------------
export type BoolExpr =
  | { op: 'and' | 'or'; nodes: BoolExpr[] }
  | { op: 'not'; node: BoolExpr }
  | { op: 'leaf'; criterionId: string };

// ---------------------------------------------------------------------------
// Measures — scalar / compound / contextual / sustained. (spec F2/F3/F6/F8)
// ---------------------------------------------------------------------------
export type MeasureOperator = '>=' | '<=' | '>' | '<' | 'between' | '=' | '!=';

/** Population-shifted thresholds (e.g. Asian-ancestry ±2.5), applied atomically. (spec F9) */
export interface ThresholdVariant {
  population: PopulationPredicate;
  /** Shifts ALL affected thresholds together — never one in isolation. */
  substitutions: { field: string; value: number; value2?: number }[];
  /** ALWAYS attested/asked. NEVER CQL-derived from the US Core race extension. */
  derivation: 'asked';
}

export interface Measure {
  kind: 'scalar' | 'compound';
  field?: string; // age | bmi | systolicBP | diastolicBP | ...
  operator?: MeasureOperator;
  value?: number;
  value2?: number;
  /** Explicit endpoint inclusivity for `between` (and single-bound thresholds). Unknown ⇒ review. */
  inclusiveLow?: boolean;
  inclusiveHigh?: boolean;
  unit?: string;
  /** compound: sub-measures combined by `logic` (BP systolic OR diastolic). */
  subMeasures?: Measure[];
  logic?: 'any' | 'all';
  /** "despite N anti-hypertensive agents of different classes". */
  therapyQualifier?: { drugClassCount: number; distinctClasses: boolean };
  /** Encounter anchor: "as measured at first office visit with bariatric surgeon". */
  context?: { anchor: 'first-surgical-visit' | 'order' | 'any'; encounterType?: string };
  /** Threshold-over-a-window: "BMI > 35 ... for most recent 2 years". */
  sustainedOver?: { duration: number; unit: string };
  /** Coordinated population threshold shift. */
  thresholdVariant?: ThresholdVariant;
  /** Byte-anchor of the number/comparator this measure was parsed from (provenance). */
  sourceSpan?: Span;
  /** In-scope polarity cue ("not medically necessary / unless / except / denied") was present. This
   *  is recorded, NEVER used to invert the operator — an exclusionary threshold must not read as a
   *  positive eligibility gate. (spec §1.3, F4) */
  negatedLocally?: boolean;
}

// ---------------------------------------------------------------------------
// Time windows — independent, co-present axes. (spec F7/F11)
// ---------------------------------------------------------------------------
export interface TimeWindow {
  /** "cumulative total of 6 months (180 days)". */
  cumulative?: { min: number; unit: string };
  /** "one program for at least 3 consecutive months". */
  longestConsecutive?: { min: number; unit: string };
  /** "≥ 12 sessions / visits / treatments" — a count, independent of calendar duration. */
  count?: { min: number; unit: 'sessions' | 'visits' | 'treatments' };
  /** "within 1 year prior to surgery" — with explicit endpoint inclusivity. */
  lookback?: {
    within: number;
    unit: string;
    relativeTo: 'surgery' | 'order' | 'firstVisit';
    inclusive: boolean;
  };
}

// ---------------------------------------------------------------------------
// Populations — encode the STATED construct per payer; never normalize. (spec F9/F17)
// ---------------------------------------------------------------------------
export interface PopulationPredicate {
  concept: string; // adult | adolescent | asian-ancestry | diabetic | ...
  sourceText: string;
  derivation: 'asked' | 'derived';
  definition?: {
    kind: 'chronological-age' | 'bone-age' | 'skeletal-growth' | 'condition';
    sourceText: string;
  };
}

// ---------------------------------------------------------------------------
// Value sets & coded options. (spec F3/F13)
// ---------------------------------------------------------------------------
export interface CodedOption {
  code?: string;
  system?: string;
  display: string;
  sourceText: string;
  /** Per-option nested criteria (OSA → "failed 3–6 months CPAP"). Compiles to
   *  `answerOption` + `enableWhen(answerCoding)`-gated sibling items, NOT `answerValueSet`. */
  followUp?: EncodedCriterion[];
}

export interface CodedValueSet {
  id: string;
  concept: string;
  /** "including but not limited to" ⇒ open (UI offers Other + specify). */
  open: boolean;
  /** Deny families (Z68.20–.34) must never read as eligibility families (Z68.35–.45). */
  polarity: 'inclusion' | 'exclusion';
  purpose: 'eligibility' | 'coverage-deny' | 'documentation';
  options: CodedOption[];
  /** Human-readable BMI band asserted against the code range, e.g. "40 or greater". */
  humanReadableBand?: string;
}

// ---------------------------------------------------------------------------
// The encoded criterion. (spec §3)
// ---------------------------------------------------------------------------
export type CriterionKind =
  'measure' | 'boolean' | 'choice' | 'attestation' | 'exclusion' | 'reference' | 'freetext';

export interface CrossRef {
  rawLabel: string;
  resolved?: string;
  status: 'resolved' | 'unresolved-fail-closed';
}

export interface EncodedCriterion {
  id: string;
  label: string;
  sourceText: string;
  sourceSpan: Span;
  /** Where in the document this came from — criteria may only originate in indications. (spec §1.7) */
  sourceSection: string;
  /** How the label was obtained; inference is recorded, never presented as extracted fact. (spec F1) */
  labelSource: 'extracted' | 'ocr-repaired' | 'inferred-by-position';
  kind: CriterionKind;
  measure?: Measure;
  /** When a single criterion carries MORE THAN ONE threshold (e.g. "age ≥ 18 AND BMI > 40"), all of
   *  them are kept and AND-combined at evaluation; `measure` holds the first for back-compat. */
  measures?: Measure[];
  /** "one or more of" ⇒ min:1, bound to a value set, gated under its parent branch. */
  choice?: { valueSetId: string; min?: number; max?: number };
  timeWindow?: TimeWindow;
  population?: PopulationPredicate;
  /** Exclusion / "not medically necessary if ...". */
  negate?: boolean;
  crossRefs?: CrossRef[];
  /** Low-confidence parse ⇒ human review. Never dropped, never guessed. (spec §1.9) */
  reviewFlag?: { reason: string };
  children?: EncodedCriterion[];
}

// ---------------------------------------------------------------------------
// Procedures — keyed by (code, contextQualifier); CRD-conformant coverage codes. (spec F5/F6/F11/F15)
// ---------------------------------------------------------------------------
export type CoverageCode =
  'covered' | 'not-covered' | 'conditional' | 'no-auth-needed' | 'auth-needed';

export type CoverageBasis =
  | 'benefit-exclusion'
  | 'criteria-not-met'
  | 'experimental-investigational'
  | 'conditional-on-criteria';

export interface ProcedureRule {
  code: string;
  system: 'CPT' | 'HCPCS' | 'ICD10PCS';
  /** "[when specified as Billroth II]" — part of the identity key, not a footnote. */
  contextQualifier?: string;
  coverageCode: CoverageCode;
  /** Orthogonal reason: experimental is preserved distinctly from a bare not-covered. */
  basis?: CoverageBasis;
  /** Conditional-coverage predicate. */
  criteria?: BoolExpr;
  /** Intra-procedure split, e.g. roux limb ≤ 150 cm covered / > 150 cm investigational. */
  parameterCondition?: Measure;
  /** Two-stage sequencing: stage-2 deferred to service time. */
  sequencing?: { stage: number; dependsOn?: string; authTiming: 'defer-to-service' | 'concurrent' };
  /** "adjustments within 90 days ... part of the global surgical service". */
  globalPeriodDays?: number;
  sourceText: string;
  sourceSpan: Span;
}

// ---------------------------------------------------------------------------
// Pathways & the top-level PolicyLogic. (spec F10/§1)
// ---------------------------------------------------------------------------
export interface DocRequirement {
  doc: string;
  sub?: string;
  requirement: 'required' | 'recommended';
  sourceSpan?: Span;
}

export interface FieldProvenanceRef {
  field: string;
  span: Span;
}

export interface Pathway {
  id: string;
  /** `manual-review` carries no criteria tree — only a routing instruction. (spec F10/§1.8) */
  role: 'eligibility' | 'manual-review';
  population?: PopulationPredicate;
  /** The pathway's eligibility tree; null for a manual-review pathway. */
  logic?: BoolExpr;
  /** Verbatim routing text for manual-review (e.g. "contact a Medical Director"). */
  routingInstruction?: string;
  /** Value sets are SCOPED per pathway — there is no global concept-keyed pool. (spec F10) */
  valueSets: CodedValueSet[];
}

export interface PolicyLogic {
  service: string;
  guidelineId: string;
  /** section-id → section label, so `EncodedCriterion.sourceSection` resolves. */
  sourceSectionMap: Record<string, string>;
  pathways: Pathway[];
  /** Registry of every EncodedCriterion by id, referenced by `BoolExpr` leaves. */
  criteria: Record<string, EncodedCriterion>;
  procedures: ProcedureRule[];
  /** Fail-closed default for un-enumerated / "all other ... not medically necessary" codes. (spec §1.1) */
  defaultProcedureRole: CoverageCode;
  exclusions: EncodedCriterion[];
  documentation: DocRequirement[];
  provenance: FieldProvenanceRef[];
  /** Precedence for role writes so E6/E9 order cannot change output. (spec F12)
   *  e.g. ['conditional','benefit-exclusion','experimental-investigational','criteria-not-met']. */
  rolePrecedence: string[];
}
