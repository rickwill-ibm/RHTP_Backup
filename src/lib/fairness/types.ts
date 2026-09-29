// CONTRACT: C-FAIRNESS
/**
 * §92.210 IDENTIFICATION AND MITIGATION — domain types.
 *
 * THE RULE, quoted verbatim from eCFR rather than paraphrased, because the paraphrase was wrong and
 * the wrong word was load-bearing:
 *
 *   (a) "A covered entity must not discriminate on the basis of race, color, national origin, sex,
 *       age, or disability in its health programs or activities through the use of patient care
 *       decision support tools."
 *   (b) "A covered entity has an ongoing duty to make reasonable efforts to identify uses of patient
 *       care decision support tools in its health programs or activities that employ INPUT VARIABLES
 *       OR FACTORS THAT MEASURE race, color, national origin, sex, age, or disability."
 *   (c) "For each patient care decision support tool identified in paragraph (b) of this section, a
 *       covered entity must make reasonable efforts to mitigate the risk of discrimination resulting
 *       from the tool's use..."
 *
 * "OR FACTORS THAT MEASURE" IS THE WHOLE DESIGN. The first cut of this module keyed the declaration
 * on the six protected bases — `protectedInputs: Array<'race' | 'sex' | ...>` — which can only ever
 * record a field literally NAMED after a protected class. A factor that MEASURES race is not
 * required to be called race, and in this codebase none of them are. Adversarial review found five
 * proxies already live, every one of which an author would have declared as `[]`:
 *
 *   • `MemberContext.channelPreference` measures disability (TTY/SMS for deaf and hard-of-hearing;
 *     voice for blind and low-vision), age (mail and phone skew older) and national origin/LEP
 *     (language drives channel). It does not merely annotate — it SELECTS the channel, and the
 *     selection feeds `outsideSmsWindow`, which DELAYS the touchpoint. A deaf member whose only
 *     usable channel is SMS is systematically delayed relative to one who takes a phone call.
 *   • `MemberContext.recentEdWithinHours` — ED utilization is the canonical proxy and the
 *     Obermeyer/Optum failure mode's own input class. Its effect here is favourable, which is
 *     exactly why nobody would flag it; (b) asks whether the factor MEASURES the characteristic,
 *     not whether the effect is benign. And the boost is one-sided: members whose access barriers
 *     show up as ED use get lifted, members whose barriers show up as NO utilization get nothing.
 *   • `Signal.measure` — quality measure ids are sex- and age-defined by construction (breast cancer
 *     screening: female 50-74; cervical: female 21-64; childhood immunization: pediatric). This is a
 *     DIRECT protected input hiding behind a code, in a field whose own comment calls it "PHI-safe".
 *   • `MemberContext.contactHistory` + frequency caps — members in shared or unstable housing, or
 *     several members on one number, accrue phantom contacts and get suppressed.
 *   • `dataClassFloor: ['mental-health']` on the BH screening signal — a routing gate keyed on a
 *     mental-health class is a disability-status gate under §1557.
 *
 * SO THE UNIT OF REGULATION IS THE INPUT VARIABLE, NOT THE AGENT. An agent definition is the wrong
 * place to declare this: `outreach-agent.agent.json` contains no scoring logic at all, the factors
 * live in `sde/engine/rules.ts` and a policy pack, and all of it can change without touching a
 * single `.agent.json`. The registry would stay green while the scoring surface was edited.
 *
 * WHAT THIS MODULE DOES NOT CLAIM. OCR declined to mandate documentation — it ENCOURAGES written
 * policies and procedures, and its reasonable-efforts factors include "whether the covered entity
 * has a methodology or process in place for evaluating" its tools. So this record is EVIDENCE of
 * reasonable efforts, not a thing the rule requires. Claiming "§92.210 compliance" from an artifact
 * the rule never asked for would be exactly the overclaim this programme keeps having to retract.
 */

/** The six bases §92.210(b) enumerates. A pack may not add to them; the federal floor is the floor. */
export type ProtectedBasis = 'race' | 'color' | 'national-origin' | 'sex' | 'age' | 'disability';

export const PROTECTED_BASES: readonly ProtectedBasis[] = [
  'race',
  'color',
  'national-origin',
  'sex',
  'age',
  'disability',
];

/**
 * Whether the field names the characteristic or measures it at one remove.
 *
 * Both are IDENTIFIED — the rule's "or factors that measure" makes no distinction in the duty. Only
 * the record differs, because a reviewer reading a mitigation needs to know which kind they are
 * looking at: a direct input is usually intentional and clinically justified; a proxy is usually
 * neither, and is where the discrimination risk actually lives.
 */
export type Directness = 'direct' | 'proxy';

/**
 * Is the tool in §92.210's scope at all?
 *
 * 45 CFR 92.4 defines a patient care decision support tool as "any automated or non-automated tool,
 * mechanism, method, technology, or combination thereof used by a covered entity to support CLINICAL
 * DECISION-MAKING in its health programs or activities" — administrative, billing, scheduling and
 * facilities-management tools are outside it.
 *
 * DELIBERATELY NOT A BOOLEAN. A boolean with no adjudication means every author picks `false` and
 * the identification artifact is empty. `administrative-excluded` requires a reviewed lock entry
 * exactly as a mitigation does, so claiming yourself out of scope costs the same review as claiming
 * a mitigation — which is the only thing that makes the identification an EFFORT rather than a form.
 *
 * `contested` exists because the honest answer for outreach prioritisation is that OCR did not
 * address it. Asserting it in scope, or out, would both be inventing a position the source does not
 * support.
 */
export type ToolScope = 'clinical-decision-support' | 'administrative-excluded' | 'contested';

/** One identified input variable or factor. Keyed on the FIELD; the basis is an attribute of it. */
export interface IdentifiedInput {
  /** A real path in this tree, e.g. `MemberContext.channelPreference`. Not a category. */
  field: string;
  /** Which of the six bases this field measures. Non-empty. */
  measures: readonly ProtectedBasis[];
  directness: Directness;
  /** WHY this field measures those characteristics. Prose, for a human reviewer. */
  basis: string;
}

/**
 * The mitigation §92.210(c) requires for an identified input.
 *
 * `evidenceRef` must point at something REAL. It may not cite the simulated fairness screen in
 * `goldenThread/flowSim.runFairnessScreen`: that ratio is synthesised from `0.86 - denyRate * 1.2`
 * plus a seeded variance term, its own header says "the cohort split is modeled, not from real member
 * data", and letting a mitigation record cite it would make a modelled number the evidence for a
 * regulatory claim. `assertFairnessLock` refuses that reference.
 */
export interface Mitigation {
  /** What was actually done — a measure, not an intention. */
  measure: string;
  /** The accountable human. §92.7 names a Section 1557 Coordinator; this is that role's record. */
  reviewedBy: string;
  reviewedAtMs: number;
  /** Where the evidence lives. Never the simulated fairness screen. */
  evidenceRef: string;
  /**
   * A member-facing statement, at 42 CFR 438.10 reading level, for when this tool contributed to a
   * decision the member is noticed about.
   *
   * §1557's remedy structure is complaint-driven, so an artifact the member cannot see produces no
   * member-side effect. Without this the whole record is regulator-facing and the person it is
   * supposed to protect gets nothing.
   */
  memberFacingReason?: string;
}

/** One reviewed entry: a field, what it measures, whether it is in scope, and its mitigation. */
export interface FairnessLockEntry {
  field: string;
  toolScope: ToolScope;
  measures: readonly ProtectedBasis[];
  /**
   * Optional, because it is incoherent on a field that measures nothing: `Directness` describes HOW a
   * field measures a basis, and an `administrative-excluded` entry measures none. Four entries
   * carried `directness: 'direct'` alongside `measures: []`, which asserts a manner for a thing that
   * is not happening.
   */
  directness?: Directness;
  basis: string;
  /** Required when `toolScope` is 'clinical-decision-support' or 'contested'. */
  mitigation?: Mitigation;
  /** Required when `toolScope` is 'administrative-excluded': why 92.4 does not reach it. */
  exclusionBasis?: string;
}

/**
 * The reviewed record. Listed in `/CODEOWNERS` alongside `authority-lock.json`, for the same reason:
 * a declaration that lives inside the artifact it governs, written by the artifact's own author, is
 * a self-attestation that no structural check can distinguish from an empty one.
 *
 * CODEOWNERS binds only where the host enforces required reviews on protected branches — it says who
 * must look, it does not stop an edit. The mechanical half is `check-92210.mjs`, which refuses an
 * unlisted input and an orphan entry. Neither half is sufficient alone, and describing either as if
 * it were would be the same overclaim this module was written to avoid.
 */
export interface FairnessLockFile {
  version: string;
  entries: FairnessLockEntry[];
}

/** How a violation is raised. Injected so each caller keeps its own error taxonomy. */
export type FairnessViolation = (path: string, detail: string) => Error;

/** Thrown when an identified input has no reviewed entry, or its entry is incomplete. */
export class FairnessLockError extends Error {
  constructor(
    readonly field: string,
    detail: string
  ) {
    super(`fairness lock: ${field}: ${detail}`);
    this.name = 'FairnessLockError';
  }
}
