// CONTRACT: C-REVQUAL
/**
 * THE REVIEWER-QUALIFICATION ASSERT — and the only place a `QualifiedReviewer` can come from.
 *
 * WHY IT TAKES A REFERENCE AND NOT A QUALIFICATION. A function that accepted a `CredentialRecord`
 * from its caller would be validating an object the caller built, which is the self-report hole this
 * design exists to close: nothing stops a caller stamping an authoritative-looking source on an
 * inline object. `api/pa/decision` already confesses this class for fact provenance, and reusing
 * `@/lib/agents/provenance` would NOT have fixed it — `origin` there is caller-stamped too, and
 * `assertAdverseEligible` checks derivation consistency rather than who wrote the origin.
 * `manifest/authorityGate.ts` states the general form: "the checked set and the served set are the
 * same object by construction, not by the loader's good behaviour." So this function resolves the
 * record itself, through the seam, and returns a branded token whose symbol is not exported. A
 * caller cannot construct a `QualifiedReviewer`; `tsc` says so.
 *
 * WHY `asOfMs` IS A PARAMETER. Conventions §: engines take injected time. The edge supplies it from
 * `@/lib/clock`; this module never reads a wall clock, so a licence verdict is reproducible.
 *
 * WHY THE VERDICT IS PINNED, NOT THE EXPIRY. Pinning only `expiresAtMs` is wrong in both directions.
 * A 2026 denial by a reviewer whose licence expired in 2027 re-reads, in 2028, as an adverse
 * determination made by an unlicensed reviewer — a violation MANUFACTURED by the audit tooling, and
 * unfalsifiable once the as-at evaluation is gone. The inverse is worse: a licence already expired at
 * decision time but renewed afterwards re-reads as valid, laundering a real violation. So the record
 * pins the VERDICT plus `asOfMs`, `sourceId` and `sourceAsOfMs`.
 */
import {
  ADMINISTRATIVE_STANDARD,
  FEDERAL_INITIAL_STANDARD,
  MAX_CREDENTIAL_AGE_MS,
  type ReviewRequirement,
} from './requirement';
import { isPlaceholderIdentity } from '@/lib/authz/principal';
import { getCredentialingSource } from './source';
import {
  ReviewerNotQualifiedError,
  type DeterminationClass,
  type CredentialRecord,
  type NeedDomain,
  type ReviewerLicence,
} from './types';

/** Brand. NOT exported — this is what makes `QualifiedReviewer` unforgeable outside this module. */
declare const QUALIFIED_BRAND: unique symbol;

/**
 * THE RUNTIME HALF of unforgeability, and it is not optional.
 *
 * The brand above is a `declare const` — erased at compile time. At runtime a `QualifiedReviewer` is
 * an ordinary frozen object with no marker, so ANY of these defeats the type and satisfies a
 * consumer: an `as unknown as QualifiedReviewer` cast, a spread of a real proof, an object parsed
 * from JSON at a future HTTP boundary, or a plain JS caller. Adversarial review found the
 * enforcement point had widened the parameter to `{ reviewerRef: string }`, discarding the brand
 * entirely — so the type was the whole control and it was not enforced where enforcement happens.
 *
 * A module-private WeakSet cannot be forged by a cast, a spread or a parse: membership is granted
 * only by `mint`, and `isMintedProof` is the only way to ask.
 */
const MINTED = new WeakSet<object>();

/** Is this a proof this module actually minted, rather than an object shaped like one? */
export function isMintedProof(v: unknown): v is QualifiedReviewer {
  return typeof v === 'object' && v !== null && MINTED.has(v);
}

/**
 * What gets sealed into the ledger and the decision record.
 *
 * Identity-safe by construction: no licence number, no NPI, nothing about the member. A refusal
 * reason on this path reaches an API body, and a licence number is directly identifying.
 */
export interface QualificationVerdict {
  reviewerRef: string;
  /** The decision time the licence was evaluated AGAINST. */
  asOfMs: number;
  /** Always this value when a verdict exists — a refusal throws rather than returning a verdict. */
  licenceVerdict: 'valid-at-decision' | 'not-required-administrative';
  /** The expiry that was compared. Kept alongside the verdict, never instead of it. */
  licenceExpiresAtMs?: number;
  licenceType?: string;
  licenceJurisdiction?: string;
  needDomain: NeedDomain;
  /** Which rule was applied — federal floor, a jurisdiction pack, or none (administrative). */
  standardApplied: string;
  /** The attestation record id in the source of record. Absent for an administrative determination. */
  attestationRef?: string;
  /** Which source produced the credentialing record, and when it last refreshed. */
  sourceId: string;
  sourceAsOfMs: number;
  /** Appeal only: 438.406(b)(2)(i) was evaluated. False on an initial determination. */
  priorInvolvementChecked: boolean;
  /**
   * WHAT THIS PROOF IS A PROOF OF. Added after adversarial review found the design's own central
   * insight abandoned halfway: attestation is a property of which resolver produced a record, and
   * the record honoured that — but the PROOF was unscoped. It named no determination class and no
   * need domain that a consumer could check, so an `administrative` proof (which skips the licence
   * and attestation checks entirely) resolved a clinical adverse determination, and one proof minted
   * for `medical` resolved a behavioral-health one. Every consumer now asserts against this.
   */
  boundTo: ProofScope;
}

/** What a proof covers. A consumer that does not check this is not enforcing the proof. */
export interface ProofScope {
  determinationClass: DeterminationClass;
  needDomain: NeedDomain;
}

/**
 * An opaque proof that a named reviewer was qualified for a named requirement at a named instant.
 * Only `assertReviewerQualified` can mint one.
 */
export interface QualifiedReviewer {
  readonly [QUALIFIED_BRAND]: true;
  readonly reviewerRef: string;
  readonly verdict: QualificationVerdict;
}

/** The licence that satisfies the requirement's jurisdiction, or a typed refusal. */
function pickLicence(rec: CredentialRecord, jurisdiction: string, asOfMs: number): ReviewerLicence {
  if (rec.licences.length === 0)
    throw new ReviewerNotQualifiedError('licence-absent', rec.reviewerRef);
  const inJurisdiction = rec.licences.filter((l) => l.jurisdiction === jurisdiction);
  if (inJurisdiction.length === 0)
    throw new ReviewerNotQualifiedError('licence-jurisdiction-mismatch', rec.reviewerRef);
  // Prefer an unrestricted, unexpired licence; report the most specific failure otherwise, so the
  // 403 says which of the two is wrong rather than a generic "not qualified".
  const usable = inJurisdiction.find((l) => !l.restricted && l.expiresAtMs > asOfMs);
  if (usable) return usable;
  if (inJurisdiction.some((l) => l.expiresAtMs <= asOfMs))
    throw new ReviewerNotQualifiedError('licence-expired-at-decision', rec.reviewerRef);
  throw new ReviewerNotQualifiedError('licence-restricted', rec.reviewerRef);
}

/**
 * Assert that the acting reviewer is qualified for this determination, and mint the proof.
 *
 * Throws `ReviewerNotQualifiedError` with a typed code, or `CredentialingNotConfiguredError` when
 * the seam is in production with nothing wired. Never returns a boolean: a boolean cannot tell a 403
 * whether the reviewer was unlicensed, out of jurisdiction, or simply not attested for this need —
 * and member appeal rights turn on the reason.
 */
export function assertReviewerQualified(
  reviewerRef: string,
  requirement: ReviewRequirement,
  asOfMs: number
): QualifiedReviewer {
  const ref = (reviewerRef ?? '').trim();
  // The placeholder identities. `deriveUserId` returns the literal 'session-user' when a session
  // carries no `fhirUser`, and `decisionGate` accepted it as a qualified human — while
  // `approvalAuthority.isNonIdentity` blocked the same string. Two mechanisms, disagreeing, live.
  if (isPlaceholderIdentity(ref))
    throw new ReviewerNotQualifiedError('no-identity-of-record', ref || '(empty)');

  const source = getCredentialingSource(); // throws in production with nothing wired
  const rec = source.lookup(ref, asOfMs);
  if (!rec) throw new ReviewerNotQualifiedError('not-in-credentialing-source', ref);

  if (asOfMs - rec.sourceAsOfMs > MAX_CREDENTIAL_AGE_MS)
    throw new ReviewerNotQualifiedError('credential-record-stale', ref);

  // EXCLUSION (42 CFR 455.436). Refused when the source SAYS excluded. Deliberately NOT refused
  // when the source is silent: the seeded directory does not screen at all, and failing closed on
  // absence today would make every seeded reviewer unusable and the whole plane undemonstrable.
  // `FAKE_FIDELITY.md` records that this is unscreened rather than clear — the honest position
  // while the slot exists and no source fills it. A production source that populates the field gets
  // enforcement with no further change.
  if (rec.excluded === true) throw new ReviewerNotQualifiedError('reviewer-excluded', ref);

  // APPEAL: the two things 438.406(b)(2)(i) states unconditionally, before anything about expertise.
  let priorInvolvementChecked = false;
  if (requirement.kind === 'appeal') {
    priorInvolvementChecked = true;
    if (requirement.priorReviewerRefs.includes(ref))
      throw new ReviewerNotQualifiedError('prior-involvement', ref);
    // An UNKNOWN supervisory chain is not a clear one. When a prior reviewer exists and the caller
    // supplied no chain, the platform cannot say this reviewer is not their subordinate — and
    // "cannot say" is a refusal on a control whose whole purpose is independence.
    if (requirement.priorReviewerRefs.length > 0) {
      const chain = requirement.subordinateOfRefs;
      if (chain === undefined)
        throw new ReviewerNotQualifiedError('subordinate-of-prior-reviewer', ref);
      if (chain.some((sup) => requirement.priorReviewerRefs.includes(sup)))
        throw new ReviewerNotQualifiedError('subordinate-of-prior-reviewer', ref);
    }
    // 438.406(b)(2)(ii) delegates the expertise standard TO THE STATE. No federal default exists to
    // fall back on, so its absence is a refusal rather than a pass under the floor.
    if (!requirement.stateExpertiseDetermination)
      throw new ReviewerNotQualifiedError('state-expertise-determination-absent', ref);
  }

  // ADMINISTRATIVE determinations (eligibility, timeliness, benefit exhaustion) need no clinical
  // peer. One bar for both classes builds a control operations route around.
  if (requirement.determinationClass === 'administrative') {
    return mint(ref, {
      reviewerRef: ref,
      asOfMs,
      licenceVerdict: 'not-required-administrative',
      needDomain: requirement.needDomain,
      boundTo: { determinationClass: 'administrative', needDomain: requirement.needDomain },
      standardApplied: ADMINISTRATIVE_STANDARD,
      sourceId: rec.sourceId,
      sourceAsOfMs: rec.sourceAsOfMs,
      priorInvolvementChecked,
    });
  }

  const licence = pickLicence(rec, requirement.licenceJurisdiction, asOfMs);

  // EXPERTISE IS ATTESTED, NEVER COMPUTED. The platform does not conclude that this reviewer has
  // appropriate expertise; it records that a named attester said so, under a named standard.
  const attestation = rec.expertiseAttestations.find(
    (a) => a.needDomain === requirement.needDomain
  );
  if (!attestation) throw new ReviewerNotQualifiedError('expertise-not-attested', ref);

  const standardApplied =
    requirement.kind === 'appeal' && requirement.stateExpertiseDetermination
      ? `pack:${requirement.stateExpertiseDetermination.packId}@${requirement.stateExpertiseDetermination.packVersion}`
      : attestation.standardApplied || FEDERAL_INITIAL_STANDARD;

  return mint(ref, {
    reviewerRef: ref,
    asOfMs,
    licenceVerdict: 'valid-at-decision',
    boundTo: {
      determinationClass: requirement.determinationClass,
      needDomain: requirement.needDomain,
    },
    licenceExpiresAtMs: licence.expiresAtMs,
    licenceType: licence.type,
    licenceJurisdiction: licence.jurisdiction,
    needDomain: requirement.needDomain,
    standardApplied,
    attestationRef: attestation.attestationRef,
    sourceId: rec.sourceId,
    sourceAsOfMs: rec.sourceAsOfMs,
    priorInvolvementChecked,
  });
}

function mint(reviewerRef: string, verdict: QualificationVerdict): QualifiedReviewer {
  const proof = Object.freeze({ reviewerRef, verdict }) as QualifiedReviewer;
  MINTED.add(proof);
  return proof;
}

/**
 * Does a proof cover this determination?
 *
 * A CLINICAL determination requires a proof minted as clinical: the administrative path performs no
 * licence check and no attestation check at all, so accepting one here would mean an unlicensed
 * reviewer with no expertise attestation resolving an adverse coverage action. The reverse is fine —
 * a clinical proof is strictly stronger than an administrative requirement.
 *
 * The need domain must MATCH, not merely be present. A reviewer attested for `medical` is not
 * thereby attested for behavioral health or LTSS, and that substitution is the one 438.210(b)(3)
 * exists to prevent.
 */
export function proofCovers(proof: QualifiedReviewer, required: ProofScope): boolean {
  const { boundTo } = proof.verdict;
  if (required.determinationClass === 'clinical' && boundTo.determinationClass !== 'clinical')
    return false;
  return boundTo.needDomain === required.needDomain;
}
