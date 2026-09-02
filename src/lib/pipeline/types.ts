// CONTRACT: C9  // CONTRACT: C2  // CONTRACT: C10
/**
 * Pipeline reference-architecture types (plan §4A, binding).
 *
 * Five stages, every feed, both lanes: land -> stage+validate -> transform+enrich
 * -> conform+load -> project+propagate. Stages 2-5 are PURE functions over
 * (input, deps); deps carries the clock/rng seam (src/lib/clock.ts) plus the
 * identity-resolution seam, so nothing reads a global. Adapters are generic over
 * records — no persona is ever hardcoded (plan §1.2 representative-use-case rule).
 */

export type PipelineStage =
  'land' | 'stage-validate' | 'transform-enrich' | 'conform-load' | 'project-propagate';

/** The three arrival modes §4A names; the transform is identical across them. */
export type ArrivalMode = 'batch' | 'stream' | 'micro-batch';

/** Inbound wire formats (subset built here: X12 834, HL7v2 ADT, flat-file CSV, FHIR JSON). */
export type SourceFormat = 'x12-834' | 'hl7v2-adt' | 'flat-file-csv' | 'fhir-json';

/** C9 domains this wave delivers. Extend as adapters are added. */
export type WpcDomain =
  | 'coverage'
  | 'encounter'
  | 'sdoh'
  | 'medications'
  | 'labs-vitals'
  | 'allergies'
  | 'procedures'
  | 'care-team'
  | 'goals-tasks'
  | 'referrals'
  | 'immunizations'
  | 'claims-financial'
  | 'pa-lifecycle'
  | 'behavioral-health'
  | 'assessments'
  | 'caregiver-household'
  | 'documents'
  // ── Iteration 11 Wave B (append-only): conditions, diagnostic-reports,
  // family-history. Brings the C9 domain count to 20 (asserted 20/20 by
  // tests/pipeline/domainRecordCount.test.ts). Do NOT reorder the block above.
  | 'conditions'
  | 'diagnostic-reports'
  | 'family-history'
  // ── WPC payer dimensions (append-only): RiskAssessment + Flag become first-class
  // PROJECTED dimensions, each a NEW record domain with its own mapping spec, moving
  // the C9 record-domain count 20 -> 22 (asserted 22/22 by
  // tests/pipeline/domainRecordCount.test.ts). Coverage/Encounter are NOT new here —
  // they already exist above and only gain FHIR-JSON adapters. Do NOT reorder.
  | 'risk-assessment'
  | 'flag'
  // ── WPC Da Vinci Risk Adjustment (append-only): the coding gap becomes a
  // first-class PROJECTED dimension (its own record domain + mapping spec), moving
  // the C9 record-domain count 22 -> 23 (asserted 23/23 by
  // tests/pipeline/domainRecordCount.test.ts). NOT code-carrying: a coding gap is a
  // payer-analytics hypothesis, never an asserted clinical code. Do NOT reorder.
  | 'coding-gap';

export type Tier = 'T1' | 'T2' | 'T3';

export interface SourceDescriptor {
  system: string;
  feed: string;
  batchId?: string;
}

/** Injected everywhere. Defaults bind to clock.ts; tests pass fakes. */
export interface PipelineDeps {
  now: () => number;
  rng: () => number;
  /** Attach a raw source id to the anchored member identity (stage 3, never raw). */
  resolveIdentity: IdentityResolver;
}

/**
 * Demographic traits an adapter parsed from its source, carried into identity
 * resolution for probabilistic matching. All optional: a source may carry only
 * a name, only a name+dob, or nothing (id-only, deterministic path). Used ONLY
 * for matching — never persisted onto a NormalizedRecord or a quarantine record,
 * so no name/dob/SSN leaves the resolver seam (PHI-minimal, §4A stage 3).
 */
export interface DemographicTraits {
  firstName?: string;
  lastName?: string;
  dob?: string; // YYYY-MM-DD
  sex?: 'male' | 'female' | 'other' | 'unknown';
  ssnLast4?: string;
  medicaidId?: string;
  zip?: string;
  phone?: string;
  /**
   * A source-LOCAL identifier (e.g. an MRN), scoped to its assigning authority.
   * Mirrors IdentityTraits.localId (lib/identity/mpiTypes.ts). NEVER a cross-source
   * deterministic key: only a same-authority + same-value pair agrees — a reused
   * value under a different authority is a different person and must not merge.
   */
  localId?: { assigningAuthority: string; value: string };
}

/**
 * What an adapter hands the identity seam: always the feed, optionally the
 * demographic traits it parsed. Backward-compatible — `{ feed }` alone still
 * resolves (id-only, deterministic). When `demographics` is present, a real EMPI
 * resolver can run probabilistic matching (empiResolver.ts).
 */
export interface ResolveIdentityTraits {
  feed?: string;
  demographics?: DemographicTraits;
  /**
   * Namespace for the raw source id in the cross-reference index. Defaults to a
   * single shared 'global' namespace (backward-compatible: feed-only callers all
   * share it, so the same id under two feeds still consolidates). A source-scoped
   * caller passes a per-authority scope so a REUSED id value across authorities
   * does not collide in the xref (R2 Option B; empiResolver scopeKey).
   */
  idScope?: string;
}

/**
 * The identity-resolution seam (stage 3). Returns the ANCHORED member id for a
 * raw source id + optional demographics. A real match-engine-backed resolver may
 * THROW `HeldIdentityError` (src/lib/pipeline/heldIdentity.ts) when the subject
 * lands in the possible-match band — a wrong-person auto-link must never happen
 * silently; runTransform catches it and routes the record to the held-for-review
 * lane. Id-only calls (no demographics) always resolve deterministically.
 */
export type IdentityResolver = (sourceMemberId: string, traits?: ResolveIdentityTraits) => string;

/** Stage 1 output: immutable, cataloged landing of one payload. Nothing transformed. */
export interface LandedBatch {
  batchId: string;
  source: SourceDescriptor;
  format: SourceFormat;
  receivedAt: string;
  checksum: string;
  /** The raw payload text, retained verbatim for replay (DR source of truth). */
  payload: string;
}

/** A single parsed raw record with a PHI-safe stable reference (no payload values). */
export interface RawRecord<Raw = Record<string, unknown>> {
  /** Stable, PHI-free handle: row index, HL7 control id, 834 member-source id. */
  sourceRef: string;
  data: Raw;
}

export interface ValidationIssue {
  reasonCode: string; // structured + PHI-safe, e.g. 'missing-field', 'bad-segment'
  fieldPath: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Consent + 42 CFR Part 2 labels, applied at TRANSFORM time (§4A stage 3). */
export interface ConsentLabel {
  part2Restricted: boolean;
  segmentLabels: string[];
}

/** Stage 3 output: the canonical, identity-anchored, labeled record. PHI-minimal. */
export interface NormalizedRecord {
  domain: WpcDomain;
  /** Anchored member identity (post match-engine); never a raw source id. */
  memberId: string;
  resourceType: string;
  /** Deterministic FHIR id the stage-4 idempotent PUT targets. */
  fhirResourceId: string;
  eventType: string;
  tier: Tier;
  idempotencyKey: string;
  provenance: string;
  consent: ConsentLabel;
  source: SourceDescriptor;
  occurredAt: string;
  /** Codes + references only; never free-text clinical narrative. */
  payload: Record<string, unknown>;
}

/**
 * PHI-safe rejection record for the quarantine lane (§4A stage 2). Reused as the
 * identity HELD-for-review lane: an inbound record whose subject scores in the
 * possible-match band (60-90) is diverted here with `status: 'held-for-review'`
 * and reason code `identity-possible-match`, so a wrong-person match can never
 * silently auto-attach to a member. Codes, paths, and a match tier/score only —
 * never a name, DOB, or SSN (the litmus test's trust guarantee).
 */
export interface QuarantineRecord {
  quarantineId: string;
  batchId: string;
  source: SourceDescriptor;
  sourceRef: string;
  reasonCodes: string[];
  fieldPaths: string[];
  quarantinedAt: string;
  status: 'quarantined' | 'remediated' | 'discarded' | 'held-for-review';
  /** Present ONLY on identity holds (possible-match band). PHI-safe: tier + score. */
  identityHold?: { matchTier: string; confidence: number };
}

export type TransformOutcome =
  { ok: true; record: NormalizedRecord } | { ok: false; quarantine: QuarantineRecord };

/** Reconciliation gate output (§4A stage 4): counts in = loaded + rejected. */
export interface ReconciliationReport {
  batchId: string;
  countIn: number;
  loaded: number;
  rejected: number;
  balanced: boolean;
}

/**
 * ONE transform per domain, packaged twice (batch step + stream consumer). An
 * adapter is the whole per-source contract: parse (land->stage), validate
 * (stage 2), normalize (stage 3 core). Segmentation is layered by the shared
 * transform runner, not the adapter, so every source gets it uniformly.
 */
export interface DomainAdapter<Raw = Record<string, unknown>> {
  readonly source: SourceDescriptor;
  readonly domain: WpcDomain;
  readonly format: SourceFormat;
  readonly arrivalMode: ArrivalMode;
  parse(payload: string): RawRecord<Raw>[];
  validate(raw: RawRecord<Raw>): ValidationResult;
  normalize(raw: RawRecord<Raw>, deps: PipelineDeps): NormalizedRecord;
}

/** A stage as a declared contract: named IO plus an idempotency key per §4A. */
export interface StageContract<I, O> {
  readonly stage: PipelineStage;
  readonly declaredInput: string;
  readonly declaredOutput: string;
  idempotencyKeyOf(input: I): string;
  run(input: I, deps: PipelineDeps): O;
}
