// CONTRACT: C2  // CONTRACT: C10  // SEAM: sde-policy-store
/**
 * Signal Disposition Engine (SDE) — domain types (DP-2).
 *
 * A signal is a typed event about a member derived from a C2 member event. The
 * engine folds a member's pending signal set into a disposition batch: each
 * signal becomes exactly one decision — act, bundle, suppress, or delay — and
 * the acts/bundles compose into a single coordinated touchpoint. Every decision
 * is explainable (it names the policy rule that fired) and auditable (PHI-safe).
 *
 * Nothing here keys on a persona: signal kinds, priorities, channels, and every
 * policy rule are typed data evaluated by a generic engine (plan §1.2).
 */

/** Priority classes; the taxonomy sets a default, policy may reprioritize. */
export type Priority = 'urgent' | 'high' | 'routine';

/** How a disposition would reach the member (or that it stays internal). */
export type Actionability = 'member-outreach' | 'care-team-task' | 'internal-only';

/** Contact channels a touchpoint intent can use. `task` = care-team work item. */
export type Channel = 'sms' | 'email' | 'portal' | 'mail' | 'task';

/** Immediate signals fold the whole set now; windowed ones accumulate. */
export type FoldBehavior = 'immediate' | 'windowed';

/**
 * A signal taxonomy entry (data, not code). Loaded from
 * data/signal-taxonomy.json and validated at load. `signalType` is the canonical
 * kind; `sourceEventTypes` are the C2 event types that raise it.
 */
export interface TaxonomyEntry {
  signalType: string;
  sourceEventTypes: string[];
  defaultPriority: Priority;
  actionability: Actionability;
  foldBehavior: FoldBehavior;
  /** Default outreach channel intent (omitted for internal/care-team kinds). */
  defaultChannel?: Channel;
  /** Consent purpose a resulting member touchpoint requires (checked at act time). */
  consentScope?: string;
  /**
   * The data classes a signal of this type carries AT MINIMUM.
   *
   * A FLOOR, deliberately — not the authoritative class. The regime that governs
   * a record attaches to its PROVENANCE, not to the event kind: the same EPDS
   * result is 42 CFR Part 2 material from an OASAS-licensed program, NY MHL
   * §33.13 material from an OMH-licensed clinic, and ordinary PHI from an OB
   * practice. Making the taxonomy authoritative would freeze the regime as a
   * compile-time constant of the vocabulary and make per-record segmentation
   * structurally impossible. Provenance may only ESCALATE this, never reduce it.
   */
  dataClassFloor?: string[];
  /** Idempotent-intake dedupe key template, e.g. "care-gap:{memberId}:{measure}". */
  dedupeKeyTemplate: string;
  /** How long an undispositioned signal stays actionable (hours). */
  ttlHours?: number;
  /** Names a feed dependency; a gated signal refuses loudly until its source exists. */
  sourceGated?: string;
}

/** The whole taxonomy: a versioned, additive list of entries. */
export interface SignalTaxonomy {
  version: string;
  entries: TaxonomyEntry[];
}

/** A signal ready for disposition (post-intake, taxonomy-resolved). */
export interface Signal {
  signalId: string;
  memberId: string;
  /** Taxonomy signalType, e.g. "care-gap.opened". */
  kind: string;
  sourceEventType: string;
  occurredAtMs: number;
  priority: Priority;
  actionability: Actionability;
  foldBehavior: FoldBehavior;
  channel?: Channel;
  consentScope?: string;
  dedupeKey: string;
  ttlHours?: number;
  part2Restricted: boolean;
  /** Measure id for care-gap signals (drives supersede/dedupe). PHI-safe code. */
  measure?: string;
  /** PHI-safe references only (resource ids, codes) — never free-text payload. */
  refs?: Record<string, string>;
  /** Per-member ordering key from the outbox partition (sequence). */
  sequence?: number;
}

/** Reasons a signal is suppressed (a value, never a silent drop). */
export type SuppressReason =
  | 'duplicate-collapse'
  | 'consent-absent'
  | 'superseded-on-closure'
  | 'frequency-cap'
  | 'expired-ttl'
  | 'internal-only';

export type DispositionAction = 'act' | 'bundle' | 'suppress' | 'delay';

interface DispositionBase {
  signalId: string;
  memberId: string;
  action: DispositionAction;
  /** The policy rule ids (id/version) that produced this decision. Never empty. */
  policyIds: string[];
  decidedAtMs: number;
}

/** Act now: opens the member's coordinated touchpoint. */
export interface ActDisposition extends DispositionBase {
  action: 'act';
  touchpointId: string;
  channel: Channel;
  priorityScore: number;
}

/** Bundle: folded into an already-opened touchpoint with other acts. */
export interface BundleDisposition extends DispositionBase {
  action: 'bundle';
  touchpointId: string;
  channel: Channel;
  priorityScore: number;
}

/** Suppress with an explicit, audited reason. */
export interface SuppressDisposition extends DispositionBase {
  action: 'suppress';
  reasonCode: SuppressReason;
}

/** Delay: parked to a named coordination window (bundled with peers there). */
export interface DelayDisposition extends DispositionBase {
  action: 'delay';
  untilWindowId: string;
  untilMs: number;
}

export type Disposition =
  ActDisposition | BundleDisposition | SuppressDisposition | DelayDisposition;

/** An approved disposition (act or bundle) counts toward "approved". */
export function isApproved(d: Disposition): d is ActDisposition | BundleDisposition {
  return d.action === 'act' || d.action === 'bundle';
}

/** One coordinated touchpoint: the acts/bundles for one member in one fold. */
export interface Touchpoint {
  touchpointId: string;
  memberId: string;
  channel: Channel;
  /** Content intents, ordered by priority score (highest first). */
  intents: Array<{ signalId: string; kind: string; priorityScore: number; channel: Channel }>;
}

/** A delayed-window bundle: signals parked to the same coordination window. */
export interface DelayBundle {
  windowId: string;
  untilMs: number;
  signalIds: string[];
}

/** The acceptance summary shape the demo screen renders. */
export interface DispositionSummary {
  approved: number;
  suppressed: number;
  delayed: number;
  touchpoints: number;
}

/** The full result of folding a member's signal set. */
export interface DispositionBatch {
  memberId: string;
  foldWindowId: string;
  decidedAtMs: number;
  dispositions: Disposition[];
  touchpoints: Touchpoint[];
  delayBundles: DelayBundle[];
  summary: DispositionSummary;
  /**
   * 45 CFR 92.210(b) — the identified inputs whose MITIGATION REVIEW is out of date as at this fold.
   *
   * Present and empty on a healthy fold. Non-empty means the ongoing duty has lapsed for those
   * inputs, and the fold is DEMOTED: it still produces dispositions, and the caller is expected to
   * route them through the human gate rather than act on them unreviewed.
   *
   * Demotion rather than refusal, deliberately. Failing closed on a stale review would stop the
   * platform on a calendar date — the bug this programme already had to fix in the credentialing
   * seed — and "ongoing duty" is satisfied by a live cadence with an escalation on breach, not by a
   * binary. It is certainly not satisfied by a function that returns a list nobody reads, which is
   * what this was until it was wired here.
   */
  fairnessDemotion: { staleFields: string[]; asOfMs: number };
}

/** Per-member context the engine reads (from person-context / consent domains). */
export interface MemberContext {
  memberId: string;
  /** Preferred channel order; overrides the pack's default order. */
  channelPreference?: Channel[];
  /** Measures recently closed — supersede pending outreach for them. */
  recentlyClosedMeasures?: string[];
  /** Prior member contacts, for frequency-cap evaluation. */
  contactHistory?: Array<{ channel: Channel; atMs: number }>;
  /** Consent purposes the member has granted (from the consent domain). */
  consentScopesGranted?: string[];
  /** Priority-boost context (e.g. a recent ED visit). */
  recentEdWithinHours?: number;
}

/** A frequency-cap rule: max contacts per channel per rolling window. */
export interface FrequencyCap {
  channel: Channel;
  windowHours: number;
  maxPerWindow: number;
}

/** The disposition policy pack (data). Every rule carries an id/version string. */
export interface PolicyPack {
  packId: string;
  version: string;
  priorityWeights: Record<Priority, number>;
  /** Additional score added when the member had a recent ED visit. */
  recentEdBoost: number;
  frequencyCaps: FrequencyCap[];
  channelDefaultOrder: Channel[];
  /** SMS contact window (24h clock, local). Outside it, sms outreach delays. */
  smsWindow: { startHour: number; endHour: number };
  bundling: { coordinationWindowCadenceHours: number; maxIntentsPerTouchpoint: number };
  suppression: { supersedeOnClosure: boolean; duplicateCollapse: boolean };
  /** Rule id/version strings surfaced in explanations. */
  ruleIds: {
    consentScope: string;
    duplicateCollapse: string;
    supersedeOnClosure: string;
    frequencyCap: string;
    quietHoursWindow: string;
    priorityScoring: string;
    bundlingWindow: string;
    expiredTtl: string;
    internalOnly: string;
  };
}

/** A PHI-safe audit entry emitted per disposition and per fold. */
export interface SdeAuditEntry {
  kind: 'disposition' | 'fold';
  memberId: string;
  actor: string;
  atMs: number;
  correlationId?: string;
  /** References + codes only — never member PHI. */
  detail: Record<string, string | number | string[]>;
}

/** Audit sink seam — an in-memory default ships; a ledger backs it in production. */
export interface SdeAuditSink {
  readonly id: string;
  record(entry: SdeAuditEntry): void;
  entries(): SdeAuditEntry[];
}

/** Everything the pure engine needs injected (deterministic; no I/O in core). */
export interface EngineDeps {
  now: () => number;
  audit: SdeAuditSink;
  /** Consent lookup: true when the member has granted the given purpose. */
  consentGranted: (memberId: string, scope: string, ctx: MemberContext) => boolean;
  actor?: string;
  correlationId?: string;
}
