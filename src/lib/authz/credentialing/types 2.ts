// CONTRACT: C-REVQUAL
/**
 * Reviewer qualification — domain types.
 *
 * THE CLAIM THIS MAKES EXECUTABLE. 42 CFR 438.210(b)(3), quoted from eCFR: a decision to deny a
 * service authorization request, or to authorize less than requested, must "be made by an individual
 * who has appropriate expertise in addressing the enrollee's medical, behavioral health, or
 * long-term services and supports needs." Before this module the platform's entire check was
 * `decisionGate.isQualifiedHumanDecision`, which returned true for any non-empty string that did not
 * begin `autonomy:` — `'human:bob'` passed, and so did the placeholder `'session-user'`.
 *
 * FOUR THINGS THE ADVERSARIAL-BEFORE ROUND CHANGED ABOUT THIS DESIGN, each one load-bearing:
 *
 * 1. THE REGULATION SAYS "APPROPRIATE EXPERTISE", NOT "CLINICAL EXPERTISE", AND NEVER "PHYSICIAN".
 *    "Clinical expertise" is 42 CFR 438.406(b)(2)(ii) — APPEALS — which also adds "as determined by
 *    the State". The two standards are textually different and the tree had drifted the appeal word,
 *    plus a physician requirement, into the initial-determination claim. So `NeedDomain` uses the
 *    regulation's own three words, and the appeal requirement is a separate type.
 *
 * 2. EXPERTISE IS ATTESTED, NOT COMPUTED. The first design matched an NPPES taxonomy family. NPPES
 *    is a self-reported enumeration attribute carrying no licence, expiry, board certification or
 *    sanction, and the proxy fails in both directions: the seed's own Psychiatry code (2084P0800X)
 *    family-matches Neurology (2084N0400X) — a pass that is not a behavioral-health peer — while an
 *    LTSS personal-care reduction fails a taxonomy match against the RN care manager who is exactly
 *    the right reviewer. A platform that computes a match it cannot support is asserting something
 *    false. So the record carries an ATTESTATION with a named attester and the standard applied, and
 *    the platform's claim is the honest one: the attester said so, on this date, under this standard.
 *
 * 3. NPI IS ENRICHMENT, NOT THE ANCHOR. A plan-employed UM nurse — the most common initial-
 *    determination decider in Medicaid managed care — frequently has no NPI at all. Anchoring on one
 *    would structurally exclude the population the rule is most about and push implementers toward
 *    physician-only review, which is not what 438.210(b)(3) asks for. The anchor is the credentialing
 *    record's own reviewer reference.
 *
 * 4. THE RECORD IS NOT CALLER-CONSTRUCTIBLE. An `attestedBy: 'credentialing-system-of-record'` field
 *    is a self-report: nothing stops a caller stamping it on an inline object, which is the hole
 *    `api/pa/decision` already confesses for fact provenance. Attestation is not a property of the
 *    object, it is a property of WHICH RESOLVER PRODUCED IT — so `sourceId` is written by the seam
 *    (see `source.ts`) and `assertReviewerQualified` resolves internally rather than accepting a
 *    qualification from its caller. `manifest/authorityGate.ts` states the general form of this:
 *    rebuild from the verified set, never inspect what was handed in.
 */

/**
 * The three need domains the regulation names, verbatim. NOT a `clinicalPeerReviewer: boolean` —
 * "clinical peer reviewer" is a term of art from NY PHL Article 49, and putting it in the federal
 * floor imports one state's vocabulary into the general core.
 */
export type NeedDomain = 'medical' | 'behavioral-health' | 'ltss';

/**
 * Whether the determination turns on clinical judgement.
 *
 * Eligibility, timeliness and benefit-exhaustion denials are ADMINISTRATIVE and do not require a
 * clinical peer. One bar for both builds a control operations routes around, which is how a gate
 * stops being a gate.
 */
export type DeterminationClass = 'clinical' | 'administrative';

/** A professional licence as the credentialing source of record holds it. */
export interface ReviewerLicence {
  /** Licence type as the source states it ('MD', 'DO', 'RN', 'LCSW', 'LMHC', …). */
  type: string;
  /** Issuing jurisdiction (USPS state code). */
  jurisdiction: string;
  /**
   * Licence number. NEVER appears in a refusal reason, an audit detail, or an API body — reasons on
   * this path are PHI-safe and this is directly identifying. It is here because the credentialing
   * record carries it, and it is the field a pilot will want pinned in a secure store.
   */
  number: string;
  /**
   * Under discipline or otherwise limited. Explicit rather than a free-string `status`, because
   * NY PHL §4900(2) requires a "current and valid NON-RESTRICTED license" and a pack cannot predicate
   * on a string it has to parse.
   */
  restricted: boolean;
  /** Expiry, compared against the DECISION time, never against wall time. */
  expiresAtMs: number;
}

/**
 * A board certification. Carries `eligible` and `yearsInSpecialty` separately from `certified`
 * because NY PHL §4900(2)(b) reads "board certified OR board eligible, AND five years' practice in
 * that specialty" — a pack cannot tighten a field the shape does not have.
 */
export interface BoardCertification {
  board: string;
  specialty: string;
  certified: boolean;
  eligible: boolean;
  yearsInSpecialty?: number;
}

/**
 * An ATTESTED statement that this reviewer has appropriate expertise for a need domain.
 *
 * `standardApplied` names WHICH rule was applied, so the ledger records "the State's standard,
 * identified by pack and version, was applied and returned pass" rather than the platform asserting
 * a clinical conclusion of its own. `federal:42CFR438.210(b)(3)` is the floor; a jurisdiction pack
 * supplies its own id and version.
 */
export interface ExpertiseAttestation {
  needDomain: NeedDomain;
  /** Who attested (a credentialing committee, medical director, delegated entity). */
  attestedBy: string;
  /** The attestation record's id in the source of record. */
  attestationRef: string;
  /** e.g. 'federal:42CFR438.210(b)(3)' or 'pack:ny-phl-4900@2027-01-01'. */
  standardApplied: string;
  attestedAtMs: number;
}

/**
 * What the credentialing source of record holds about one reviewer.
 *
 * There is deliberately NO `attestedBy` grade on this object and no exported constructor: see item 4
 * in the header. `sourceId` and `sourceAsOfMs` are written by the seam that produced it.
 */
export interface CredentialRecord {
  /** The anchor: a resolvable identity reference, e.g. 'Practitioner/rev-1'. */
  reviewerRef: string;
  /** Display name derived from the source, never client-supplied. */
  display: string;
  /** Optional enrichment. Absent for a plan-employed reviewer who does not bill. */
  npi?: string;
  licences: readonly ReviewerLicence[];
  boardCertifications: readonly BoardCertification[];
  /** NPPES taxonomy, when the source carries one. Informational — never the expertise test. */
  taxonomy?: string;
  expertiseAttestations: readonly ExpertiseAttestation[];
  /**
   * When the credentialing source last refreshed this record. A credential "verified" 400 days
   * before a decision is not a verification, and staleness is unauditable unless it is pinned.
   */
  sourceAsOfMs: number;
  /** Which source produced this record. Written by the seam; `seeded-credentialing-directory` in demo. */
  sourceId: string;
  /**
   * FEDERAL/STATE EXCLUSION SCREENING — OIG LEIE, SAM.gov, the state Medicaid exclusion list.
   *
   * A valid licence and an active exclusion are INDEPENDENT facts and one person can hold both. In
   * state Medicaid audits an excluded reviewer is a more common finding than an unlicensed one, and
   * unlike licensure it carries FFP recoupment exposure for every claim touched. 42 CFR 455.436
   * requires the check MONTHLY.
   *
   * The slot exists now, unpopulated by the seeded source, because adding it later would be an
   * interface freeze: the type, the refusal union, every test and the seed would all move. Absent
   * `excludedCheckedAtMs` means NOT SCREENED, and `FAKE_FIDELITY.md` says so; a production source
   * that populates it makes `assertReviewerQualified` enforce it with no further change.
   */
  excluded?: boolean;
  /** When exclusion screening last ran. Absent = never screened, which is not the same as clear. */
  exclusionCheckedAtMs?: number;
}

/** Every way a reviewer can fail to be qualified. Typed so a 403 can say WHICH, and an appeal knows. */
export type QualificationRefusalCode =
  | 'no-identity-of-record'
  | 'not-in-credentialing-source'
  | 'licence-absent'
  | 'licence-expired-at-decision'
  | 'licence-restricted'
  | 'licence-jurisdiction-mismatch'
  | 'expertise-not-attested'
  | 'credential-record-stale'
  | 'reviewer-excluded'
  | 'prior-involvement'
  | 'subordinate-of-prior-reviewer'
  | 'state-expertise-determination-absent'
  | 'credentialing-source-not-configured';

/**
 * A refused qualification. The message is PHI-safe and identity-safe: it carries the refusal CODE and
 * the reviewer reference, never a licence number, an NPI, or anything about the member. Member appeal
 * rights turn on the reason, so the reason has to be a value rather than a sentence.
 */
export class ReviewerNotQualifiedError extends Error {
  constructor(
    readonly code: QualificationRefusalCode,
    readonly reviewerRef: string
  ) {
    super(`reviewer qualification refused (${code}) for ${reviewerRef}`);
    this.name = 'ReviewerNotQualifiedError';
  }
}

/**
 * Thrown when the credentialing source is asked for a record in production and none is wired. The
 * fail-closed stub for the `credentialing` seam, mirroring `NppesNotConfiguredError`: production
 * NEVER serves a plausible-but-fake credentialing record.
 */
export class CredentialingNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE credentialing=production: no credentialing system of record is wired. ' +
        'Register one with setProductionCredentialingSource(client) (SEAM: credentialing) or set ' +
        'DATA_MODE_CREDENTIALING=mock|seeded to resolve against the seeded reviewer directory.'
    );
    this.name = 'CredentialingNotConfiguredError';
  }
}
