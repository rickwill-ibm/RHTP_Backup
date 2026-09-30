// CONTRACT: C-REVQUAL
/**
 * What a determination REQUIRES of its reviewer.
 *
 * THREE SHAPES, NOT ONE, because federal law states three different things and collapsing them
 * encodes a false equivalence — the platform would claim an appeal-grade control on an initial
 * determination, and a federal basis for peer-to-peer that does not exist:
 *
 *   INITIAL DETERMINATION — 42 CFR 438.210(b)(3): "an individual who has appropriate expertise in
 *     addressing the enrollee's medical, behavioral health, or long-term services and supports
 *     needs." No "clinical", no "physician", no State delegation.
 *
 *   APPEAL — 42 CFR 438.406(b)(2): individuals who (i) were NOT involved in any previous level of
 *     review or decision-making, and are not the subordinate of someone who was, and (ii) have "the
 *     appropriate clinical expertise, AS DETERMINED BY THE STATE, in treating the enrollee's
 *     condition or disease."
 *
 *   PEER-TO-PEER — no federal construct. A plan/state UM courtesy. It gets NO requirement type and
 *     NO citation here until someone names the state rule it implements. Inventing one would be the
 *     same class of error as the "qualified physician decider (438.210(b)(3))" string this programme
 *     just had to retract.
 *
 * WHY THE APPEAL STANDARD IS NOT IN THE CODE FLOOR. The programme rule is "federal floor in code, a
 * jurisdiction pack may only make it stricter." For appeals that is structurally impossible: the
 * federal text DELEGATES the expertise definition to the State, so there is no computable federal
 * predicate to put in the floor, and a State whose determination is differently SHAPED — accepting a
 * same-profession non-physician where a physician-shaped floor demanded an MD — is not "looser", it
 * is other, and an only-narrowing model cannot express it. So the code floor for an appeal is
 * exactly the two things federal law states unconditionally (not involved, not subordinate), plus a
 * REQUIRED reference to the State's determination that fails closed when absent. The platform never
 * asserts the expertise standard was met; it asserts that the State's standard, identified by pack
 * and version, was applied.
 */
import type { DeterminationClass, NeedDomain } from './types';

/** Common to every determination that needs a reviewer. */
interface RequirementBase {
  /** Clinical determinations need attested expertise; administrative ones do not. */
  determinationClass: DeterminationClass;
  /** Which of the regulation's three need domains this determination addresses. */
  needDomain: NeedDomain;
  /**
   * The jurisdiction whose licence is required (USPS state code).
   *
   * DELIBERATELY NOT DEFAULTED, and deliberately named by the caller. Whether this is the enrollee's
   * state of residence, the place of service, or the reviewer's location is live and contested —
   * for telehealth-delivered services especially — and a default here would silently pick a side of
   * that question in every determination the platform records.
   */
  licenceJurisdiction: string;
}

/** 42 CFR 438.210(b)(3). */
export interface InitialDeterminationRequirement extends RequirementBase {
  kind: 'initial-determination';
}

/** 42 CFR 438.406(b)(2). */
export interface AppealReviewRequirement extends RequirementBase {
  kind: 'appeal';
  /**
   * Everyone who decided at a previous level. 438.406(b)(2)(i). An appeal gate without this passes
   * the reviewer who issued the original denial, which is the single most-litigated defect in
   * Medicaid appeals — and nothing in this platform could express it before now.
   */
  priorReviewerRefs: readonly string[];
  /**
   * Reviewers the acting reviewer reports to, when the org hierarchy is known. Also 438.406(b)(2)(i)
   * — "the subordinate of any such individual". Absent means UNKNOWN, not clear: see
   * `assertReviewerQualified`, which refuses to treat an unknown chain as a pass when a prior
   * reviewer exists.
   */
  subordinateOfRefs?: readonly string[];
  /**
   * The State's determination of appropriate clinical expertise — 438.406(b)(2)(ii). Absent ⇒
   * REFUSED (`state-expertise-determination-absent`). There is no federal default to fall back on.
   */
  stateExpertiseDetermination?: {
    packId: string;
    packVersion: string;
    determinationRef: string;
  };
}

export type ReviewRequirement = InitialDeterminationRequirement | AppealReviewRequirement;

/** The standard applied when the federal floor is what governs. */
export const FEDERAL_INITIAL_STANDARD = 'federal:42CFR438.210(b)(3)';
/** The standard recorded for an administrative determination — no clinical peer is required. */
export const ADMINISTRATIVE_STANDARD = 'none-required:administrative';

/**
 * Maximum age of a credentialing record at decision time, in ms (400 days).
 *
 * NOT a regulatory number — it is a deliberately generous outer bound that makes STALENESS VISIBLE
 * rather than a claim that 399 days is fresh. A real programme sets this from its credentialing
 * cycle (NCQA re-credentialing runs on a 36-month cycle, and 42 CFR 455.436 requires MONTHLY
 * exclusion screening, which is a far tighter bound than this one). It is here so that "the record
 * was verified at some point" cannot pass for "the record was verified".
 */
export const MAX_CREDENTIAL_AGE_MS = 400 * 24 * 60 * 60 * 1000;
