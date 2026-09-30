// CONTRACT: C-DISCLOSURE  // SEAM: consentBases
/**
 * The two remaining producers the disclosure gate needs, for the demo run.
 *
 * These are SEEDED reference data, not a production store — stated plainly here
 * rather than implied, because a consent source that looks production-shaped and
 * is not is exactly the "unwired realness" the project's framework names.
 *
 * INVARIANT: an unknown member has NO bases, and no bases is a denial. There is
 *            no permissive default anywhere in this file.
 */
import { loadDemoBatch } from '@/lib/sde';
import type { ConsentBasis, Recipient } from '@/lib/agents/disclosure';

let cached: readonly ConsentBasis[] | null = null;

/**
 * Seeded consent instruments for the DEMO MEMBER. TWO of them, because they are
 * two different legal instruments and the difference between them is the point:
 *
 *   1. `consent/care-coordination/demo-1` — an internal care-coordination consent
 *      naming the WPCO care team. It does NOT name any outside organisation.
 *   2. `consent/cbo-release/demo-1` — the release the member signed for the
 *      food-access CBO, naming that organisation by org id, for the social-care
 *      referral purpose, with an expiration.
 *
 * WHY THE SECOND ONE EXISTS. A social-care referral LEAVES the covered entity, and
 * 45 CFR 164.506(c) authorises a treatment/payment/operations disclosure to
 * another covered entity or a health care provider — a community food-access
 * organisation is neither. So a CBO referral rides an authorization the member
 * signed (164.508, whose core elements include naming the recipient and an
 * expiration), or it does not ride at all. Instrument 1 is the live example of the
 * `recipient-not-named` fault (42 CFR 2.31(a)(4) and its 164.508 analogue): the
 * decision walks past it and relies on instrument 2.
 *
 * REFERENCE DATA, STATED RATHER THAN IMPLIED: instrument 2 asserts that this
 * member signed a release naming this CBO — which is what a real referral workflow
 * obtains before it sends a member's address to a food bank. Delete instrument 2
 * and the demo shows the refusal instead; the control is tested either way
 * (`part2Dispatch.test.ts`), and the refusal side is live on the seeded batch
 * regardless through `sig-7` (MHL §33.13) and `sig-10` (Part 2).
 *
 * `subjectId` is READ FROM the seeded batch rather than written here. It was the
 * literal `'MARIA_SD_001'` while the seeded batch's member is `'sde-demo-member'`,
 * so `loadConsentBases()` matched nobody, this row was unreachable, and the
 * comment claiming "the demo member holds a care-coordination consent" was false.
 * Deriving the id makes the claim true by construction, and keeps it true if the
 * seeded member is ever renamed.
 *
 * Neither instrument covers `substance-use-disorder` or `mental-health`, so the
 * Part 2 and MHL §33.13 signals in the seeded batch are refused for the honest
 * reason rather than a contrived one.
 */
function seededBases(): readonly ConsentBasis[] {
  if (!cached) {
    cached = Object.freeze([
      Object.freeze({
        basisId: 'consent/care-coordination/demo-1',
        subjectId: loadDemoBatch().memberId,
        dataClasses: Object.freeze(['demographic', 'social-need'] as const),
        purposes: Object.freeze(['care-coordination', 'social-care-referral'] as const),
        recipientOrgIds: Object.freeze(['org/wpco-care-team'] as const),
        effectiveFromMs: Date.parse('2026-01-01T00:00:00.000Z'),
      }) as ConsentBasis,
      Object.freeze({
        basisId: 'consent/cbo-release/demo-1',
        subjectId: loadDemoBatch().memberId,
        dataClasses: Object.freeze(['demographic', 'social-need'] as const),
        purposes: Object.freeze(['social-care-referral'] as const),
        recipientOrgIds: Object.freeze(['org/cbo-food-access'] as const),
        effectiveFromMs: Date.parse('2026-06-01T00:00:00.000Z'),
        // An authorization carries an expiration date or event among its core
        // elements, which a treatment/payment/operations basis does not. Set well
        // after the seeded batch's clock (2026-08-22) so the demo shows a valid
        // instrument rather than an expired one.
        expiresAtMs: Date.parse('2027-06-01T00:00:00.000Z'),
      }) as ConsentBasis,
    ]);
  }
  return cached;
}

/** The member's consent instruments. Unknown member ⇒ none ⇒ denial. */
export function loadConsentBases(memberId: string): readonly ConsentBasis[] {
  return seededBases().filter((b) => b.subjectId === memberId);
}

/**
 * Where a dispatch to this agent sends the data.
 *
 * THE REFERRAL RECIPIENT IS THE CBO, NOT THE AGENT. This was a ternary whose two
 * branches returned the identical internal care-team org — the branch existed, the
 * distinction did not, and `org/wpco-care-team` is exactly the org the seeded
 * consent instrument names, so `recipient-not-named` (42 CFR 2.31(a)(4) — the
 * "name(s) of the person(s), or class of persons, to which a disclosure is to be
 * made"; (a)(3) is the INFORMATION description, and this comment cited it — and
 * the equivalent requirement in MHL §33.13, PHL Art 27-F and 45 CFR 164.508) could
 * never fire for any agent. A social-care referral leaves the covered entity: the
 * referral agent's recipient is a named outside organisation, so a consent
 * instrument naming only the lead entity does NOT reach it.
 *
 * `kind` IS NOW READ BY THE DECISION, which it was not when this recipient was
 * first pointed at a real CBO. `decide.ts` returned the baseline
 * treatment/payment/operations permit for any class with no heightened regime
 * BEFORE consulting the recipient at all, so pointing this function at a genuine
 * outside organisation did not make `recipient-not-named` exercisable — it made a
 * live unconsented disclosure that the ledger recorded as lawful under 164.506.
 * The gate on `recipient.kind` is what makes this function's return value matter.
 *
 * KNOWN LIMITATION, stated rather than hidden: this is one hardcoded CBO, not a
 * lookup of the CBO a particular referral targets. The recipient is an
 * organisational fact and must come from a reviewed organisation registry, never
 * be derived from the requester — a pilot concern, declared here and in the
 * coalition record rather than faked.
 */
export function recipientForAgent(agentId: string): Recipient {
  return agentId === 'referral-coordination-agent'
    ? { orgId: 'org/cbo-food-access', kind: 'outside-covered-entity' }
    : { orgId: 'org/wpco-care-team', kind: 'internal' };
}
