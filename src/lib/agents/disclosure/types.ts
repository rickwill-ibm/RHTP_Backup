// CONTRACT: C-DISCLOSURE  // SEAM: disclosure
/**
 * The disclosure decision plane — domain types.
 *
 * WHY THIS IS NOT A FIELD ON AN AGENT. The authority lock caps what an agent
 * MAY hold: tools, autonomy tier, PHI posture. Those are agent properties and
 * they are static, so a compile-time declaration capped by a reviewed lock is
 * the right shape for them.
 *
 * Consent is not an agent property. It is a property of a disclosure EVENT —
 * the tuple (subject × data class × purpose of use × recipient organisation ×
 * legal basis × as-of time). Two of those belong to the member, one belongs to
 * a third party, and one is a clock. A static declaration on an agent has no
 * subject, no counterparty, no clock and no revocation, so it cannot express
 * any of them: an agent that declares `consentScope: ['part2-tpo']` is still
 * declaring it the day after the member revokes.
 *
 * So authority splits in two, deliberately:
 *   - the LOCK caps capability, at build time, per agent;
 *   - this plane decides disclosure, at runtime, per event.
 * An agent definition contributes only a CAPABILITY DECLARATION — the purpose
 * it operates under and the data classes it intends to touch. That is
 * legitimately static and legitimately locked. It is an INPUT to the decision
 * here, never the decision.
 *
 * INVARIANT: every decision is recorded, including denials — a revocation is
 *            unanswerable without a record of what was refused and when.
 * INVARIANT: absence of a basis is a denial, never a default permit.
 */

/**
 * Classes of member data, by the legal regime that governs them rather than by
 * clinical taxonomy — because the regime is what decides the disclosure.
 */
export const DATA_CLASSES = [
  'demographic',
  'clinical-general',
  /** 42 CFR Part 2 — substance use disorder records from a Part 2 program. */
  'substance-use-disorder',
  /** NY MHL §33.13 — mental health clinical records. */
  'mental-health',
  /** NY PHL Article 27-F — HIV-related information (DOH-2557 authorization). */
  'hiv',
  'social-need',
  'financial',
] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

/**
 * The data classes that require a specific written basis rather than riding on
 * treatment/payment/operations. Each names the regime that makes it so.
 */
export const HEIGHTENED_BASIS_REQUIRED: Readonly<Record<string, string>> = Object.freeze({
  'substance-use-disorder': '42 CFR Part 2 §2.31 (written consent identifying the recipient)',
  'mental-health': 'NY MHL §33.13 (clinical records — disclosure restricted)',
  hiv: 'NY PHL Article 27-F §2782 (specific written authorization, form DOH-2557)',
});

/** Why the data is being disclosed. Purpose limits the basis that can carry it. */
export const PURPOSES_OF_USE = [
  'treatment',
  'care-coordination',
  'payment',
  'operations',
  /** A referral out to a community-based organisation for a social need. */
  'social-care-referral',
  'quality-measurement',
] as const;
export type PurposeOfUse = (typeof PURPOSES_OF_USE)[number];

/**
 * What kind of organisation receives the data. `outside-covered-entity` is the
 * one that matters: a CBO receiving a social-care referral is not a covered
 * entity and is not reached by a treatment/payment/operations basis.
 *
 * THIS VOCABULARY IS READ BY THE DECISION, not merely declared. It was declared
 * here, populated correctly by the recipient source, and consulted by no decision
 * logic anywhere — so a referral to a CBO was permitted on 45 CFR 164.506, whose
 * (c) paragraphs reach another covered entity or a health care provider and reach
 * nothing else. `decide.ts` now gates the baseline permit on this field; see
 * `TPO_REACHABLE_KINDS` there, which is an allowlist so that a kind added to this
 * list is outside TPO until someone names the provision that reaches it.
 */
export const RECIPIENT_KINDS = [
  'internal',
  'covered-entity',
  'business-associate',
  'outside-covered-entity',
] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

export interface Recipient {
  orgId: string;
  kind: RecipientKind;
}

/** One disclosure being asked for. Carries no member payload — ids and codes. */
export interface DisclosureRequest {
  requestId: string;
  subjectId: string;
  dataClass: DataClass;
  purposeOfUse: PurposeOfUse;
  requestingAgentId: string;
  recipient: Recipient;
  asOfMs: number;
}

/**
 * A consent instrument, as the member granted it. Revocable and time-bounded,
 * which is precisely what an agent-side declaration cannot represent.
 */
export interface ConsentBasis {
  basisId: string;
  subjectId: string;
  /** The classes this instrument covers. A TPO consent does not cover Part 2. */
  dataClasses: readonly DataClass[];
  purposes: readonly PurposeOfUse[];
  /**
   * The organisations the instrument NAMES. Part 2 consent identifies its
   * recipient; a basis that names the lead entity does not reach its
   * subcontracted CBO.
   */
  recipientOrgIds: readonly string[];
  effectiveFromMs: number;
  expiresAtMs?: number;
  revokedAtMs?: number;
}

/**
 * The static half, contributed by the agent definition and capped by the
 * authority lock. It says what the agent WILL ASK FOR — never what it is
 * permitted to receive.
 */
export interface AgentCapability {
  agentId: string;
  purposeOfUse: PurposeOfUse;
  dataClasses: readonly DataClass[];
}

export type DisclosureOutcome = 'permit' | 'deny';

/** Reasons, as codes — never free text that could vary between decisions. */
export const DENIAL_REASONS = [
  'agent-class-not-declared',
  'agent-purpose-mismatch',
  'no-basis-on-file',
  'basis-not-yet-effective',
  'basis-expired',
  'basis-revoked',
  'basis-purpose-mismatch',
  'recipient-not-named',
  /**
   * No treatment/payment/operations authority reaches this recipient, and the
   * member holds no instrument covering the class for it. Distinct from
   * `no-basis-on-file`, which would leave a reviewer asking why an ordinary
   * social-need row needed a written instrument at all: this code says the
   * recipient is outside 45 CFR 164.506's scope, so one was required.
   */
  'recipient-outside-tpo-scope',
] as const;
export type DenialReason = (typeof DENIAL_REASONS)[number];

/** Obligations that travel WITH a permitted disclosure. */
export const OBLIGATIONS = [
  'part2-redisclosure-prohibited',
  'notice-to-accompany-disclosure',
  'minimum-necessary-projection',
] as const;
export type Obligation = (typeof OBLIGATIONS)[number];

/** The decision. Recorded whichever way it goes. */
export interface DisclosureDecision {
  requestId: string;
  subjectId: string;
  dataClass: DataClass;
  purposeOfUse: PurposeOfUse;
  requestingAgentId: string;
  recipientOrgId: string;
  outcome: DisclosureOutcome;
  /** Set on a denial; absent on a permit. */
  reason?: DenialReason;
  /** The regime the decision was made under, for the record a reviewer reads. */
  legalBasis: string;
  /** The basis relied on, when one was. */
  basisId?: string;
  obligations: readonly Obligation[];
  decidedAtMs: number;
}
