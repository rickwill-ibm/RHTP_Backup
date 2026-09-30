// CONTRACT: C-DISCLOSURE
/**
 * The disclosure decision. Pure: no clock of its own, no IO, no shared state —
 * `asOfMs` is supplied by the caller so a decision is reproducible from its
 * inputs, which is what lets a hearing officer replay it.
 *
 * ORDER MATTERS AND IS DELIBERATE. The agent's own declaration is checked FIRST,
 * so an agent that never declared a data class cannot reach the member's consent
 * record at all — the cheapest denial happens before the most sensitive lookup.
 * Then the regime: a class needing a specific written basis gets one or is
 * refused, and so does a RECIPIENT the baseline basis does not reach, whatever
 * the class. Absence of a basis is a denial, never a default permit.
 *
 * INVARIANT: every path returns a decision; nothing throws to mean "no".
 * INVARIANT: a denial names a code, never prose, so denials are countable.
 *
 * TOTALITY IS LOAD-BEARING, NOT TIDINESS. Every throw out of this function is an
 * UNRECORDED decision on a confidentiality path: the caller records what this
 * returns, so anything that escapes leaves no ledger row at all. The inputs are
 * JSON-sourced — a basis row with a missing array, a consent store that is down,
 * a recipient lookup that returns nothing — so the malformed cases are the
 * expected cases, not the exotic ones. `sde/consentGate.ts` already had this
 * right years before this module existed: it catches and fails closed.
 */
import {
  HEIGHTENED_BASIS_REQUIRED,
  type AgentCapability,
  type ConsentBasis,
  type DenialReason,
  type DisclosureDecision,
  type DisclosureRequest,
  type Obligation,
  type RecipientKind,
} from './types';

/**
 * The regime cited when nothing heightened applies AND 164.506 reaches the
 * recipient. Its (c) paragraphs authorise a treatment/payment/operations
 * disclosure to another covered entity or a health care provider — that scope is
 * the whole reason this constant cannot be the answer for every non-heightened
 * class, which is what it was.
 */
const BASELINE_BASIS = 'HIPAA 45 CFR 164.506 (treatment, payment, operations)';

/**
 * The regime when 164.506 does not reach the recipient: the member's own written
 * authorization, whose core elements include naming the person or class of
 * persons the disclosure may be made to.
 *
 * NAMED BECAUSE NOTHING ELSE AUTHORISES IT. A community-based organisation is
 * neither a covered entity nor a health care provider, so no paragraph of 164.506
 * reaches a referral to one, and there is no other provision that authorises an
 * UNCONSENTED disclosure of member data to a CBO. That is why the absence of an
 * instrument on this path is a denial rather than a softer outcome: the honest
 * answer is that the disclosure does not happen, and the record says why.
 */
const AUTHORIZATION_BASIS =
  'HIPAA 45 CFR 164.508 (individual authorization — recipient outside treatment, payment, operations)';

/**
 * The recipient kinds a treatment/payment/operations basis can reach.
 *
 * AN ALLOWLIST, DELIBERATELY. A kind added to `RECIPIENT_KINDS` later is outside
 * TPO until someone names the provision that reaches it — the fail-closed
 * direction, and the opposite of the exclusion list that would silently admit it.
 * A `business-associate` disclosure in fact rides 164.502(e) plus the
 * business-associate agreement rather than 164.506 itself; it is grouped here as a
 * declared simplification of this reference model, not because the two provisions
 * are the same one.
 */
const TPO_REACHABLE_KINDS: readonly RecipientKind[] = [
  'internal',
  'covered-entity',
  'business-associate',
];

/**
 * Does any treatment/payment/operations authority reach this recipient?
 *
 * KEYED ON THE RECIPIENT, NOT ON THE PURPOSE, and that is a considered choice. It
 * is tempting to gate `social-care-referral` itself, but an INTERNAL social-care
 * referral is squarely within 164.501's "health care operations" — which names
 * case management and care coordination — and within "treatment", which names the
 * coordination of health care and related services. What puts the seeded referral
 * outside 164.506 is not its purpose but the fact that its recipient is neither a
 * covered entity nor a health care provider. So the recipient is what is read
 * here, and `social-care-referral` consequently never resolves to the baseline
 * basis on any path that leaves the covered entity.
 */
function tpoReachesRecipient(req: DisclosureRequest): boolean {
  return TPO_REACHABLE_KINDS.includes(req.recipient.kind);
}

/** The regime this disclosure is governed by. Total: every request has one. */
function regimeFor(req: DisclosureRequest, heightened: string | undefined): string {
  if (heightened !== undefined) return heightened;
  return tpoReachesRecipient(req) ? BASELINE_BASIS : AUTHORIZATION_BASIS;
}

function deny(
  req: DisclosureRequest,
  reason: DenialReason,
  legalBasis: string
): DisclosureDecision {
  return {
    requestId: req.requestId,
    subjectId: req.subjectId,
    dataClass: req.dataClass,
    purposeOfUse: req.purposeOfUse,
    requestingAgentId: req.requestingAgentId,
    recipientOrgId: req.recipient.orgId,
    outcome: 'deny',
    reason,
    legalBasis,
    obligations: [],
    decidedAtMs: req.asOfMs,
  };
}

function permit(
  req: DisclosureRequest,
  legalBasis: string,
  obligations: readonly Obligation[],
  basisId?: string
): DisclosureDecision {
  return {
    requestId: req.requestId,
    subjectId: req.subjectId,
    dataClass: req.dataClass,
    purposeOfUse: req.purposeOfUse,
    requestingAgentId: req.requestingAgentId,
    recipientOrgId: req.recipient.orgId,
    outcome: 'permit',
    legalBasis,
    ...(basisId !== undefined ? { basisId } : {}),
    obligations,
    decidedAtMs: req.asOfMs,
  };
}

/** Is this basis usable for this request, and if not, why not? */
function basisFault(basis: ConsentBasis, req: DisclosureRequest): DenialReason | null {
  // A row whose arrays are absent is malformed, not permissive.
  if (!Array.isArray(basis.purposes) || !Array.isArray(basis.recipientOrgIds)) {
    return 'no-basis-on-file';
  }
  if (typeof basis.effectiveFromMs !== 'number') return 'basis-not-yet-effective';
  if (req.asOfMs < basis.effectiveFromMs) return 'basis-not-yet-effective';
  if (basis.revokedAtMs !== undefined && req.asOfMs >= basis.revokedAtMs) return 'basis-revoked';
  if (basis.expiresAtMs !== undefined && req.asOfMs >= basis.expiresAtMs) return 'basis-expired';
  if (!basis.purposes.includes(req.purposeOfUse)) return 'basis-purpose-mismatch';
  // A consent instrument NAMES its recipients. A basis naming a lead entity does
  // not reach that entity's subcontracted CBO, however reasonable that feels.
  if (!basis.recipientOrgIds.includes(req.recipient.orgId)) return 'recipient-not-named';
  return null;
}

/**
 * Pick the basis to decide under: the first candidate covering this class with no
 * fault, else the fault of the FIRST faulty candidate in store order, so the
 * denial is specific ("revoked" rather than "no basis") — a member who revoked
 * deserves to see that word in the record.
 *
 * THE CHOICE AMONG SEVERAL FAULTY CANDIDATES IS POSITIONAL, not a ranking. This
 * comment claimed "the least-broken candidate", which reads as a severity or
 * specificity ordering that no code here implements; store order decides, so two
 * faulty rows in the other order report the other reason. Pinned in
 * `part2Dispatch.test.ts` under that name. A real ranking would be a deliberate
 * change with a stated order, not a comment.
 */
function selectBasis(
  bases: readonly ConsentBasis[],
  req: DisclosureRequest
): { basis: ConsentBasis } | { fault: DenialReason } {
  // `bases` crosses a seam: a store can hand back null, or rows with missing
  // arrays. Treat anything unreadable as absent — never as covering.
  const candidates = (Array.isArray(bases) ? bases : []).filter(
    (b) =>
      b !== null &&
      typeof b === 'object' &&
      b.subjectId === req.subjectId &&
      Array.isArray(b.dataClasses) &&
      b.dataClasses.includes(req.dataClass)
  );
  if (candidates.length === 0) return { fault: 'no-basis-on-file' };
  let firstFault: DenialReason | null = null;
  for (const b of candidates) {
    const fault = basisFault(b, req);
    if (fault === null) return { basis: b };
    firstFault = firstFault ?? fault;
  }
  return { fault: firstFault ?? 'no-basis-on-file' };
}

/**
 * Which reason a selection fault is recorded as.
 *
 * When the class is NOT heightened, an instrument was required only because
 * 164.506 does not reach this recipient. Filing that as `no-basis-on-file` leaves
 * a reviewer asking why an ordinary social-need row needed a written instrument at
 * all, so the reason names the actual gap instead. A SPECIFIC fault — revoked,
 * expired, an instrument naming someone else — is kept as it is, because it is the
 * more informative of the two and the member is entitled to see it.
 */
function faultReason(fault: DenialReason, heightened: string | undefined): DenialReason {
  return heightened === undefined && fault === 'no-basis-on-file'
    ? 'recipient-outside-tpo-scope'
    : fault;
}

/** What a permitted heightened disclosure must carry with it. */
function obligationsFor(dataClass: string): readonly Obligation[] {
  return dataClass === 'substance-use-disorder'
    ? [
        'part2-redisclosure-prohibited',
        'notice-to-accompany-disclosure',
        'minimum-necessary-projection',
      ]
    : ['notice-to-accompany-disclosure', 'minimum-necessary-projection'];
}

/** Decide one disclosure. Total: always returns, never throws to mean "no". */
export function decideDisclosure(
  req: DisclosureRequest,
  capability: AgentCapability | undefined,
  bases: readonly ConsentBasis[]
): DisclosureDecision {
  // The regime is resolved FIRST so that every denial — including one made on
  // the agent's own declaration — is recorded citing the regime that governs the
  // class. A Part 2 refusal filed under "HIPAA treatment, payment, operations"
  // is a misfiled refusal, and misfiled is how a privacy officer fails to find
  // it during a breach review.
  const heightened = HEIGHTENED_BASIS_REQUIRED[req.dataClass];
  const regime = regimeFor(req, heightened);

  // 1. The agent's own declaration, first — an agent that never declared this
  //    class does not get to read the member's consent record to find out.
  if (!capability || !Array.isArray(capability.dataClasses)) {
    return deny(req, 'agent-class-not-declared', regime);
  }
  if (!capability.dataClasses.includes(req.dataClass)) {
    return deny(req, 'agent-class-not-declared', regime);
  }
  if (capability.purposeOfUse !== req.purposeOfUse) {
    return deny(req, 'agent-purpose-mismatch', regime);
  }

  // 2. The baseline permit carries this disclosure only if BOTH hold: the class
  //    does not need a specific written basis, and 164.506 reaches the recipient.
  //
  //    THE SECOND CONJUNCT IS THE FIX. It was absent, so a `social-need` referral
  //    to a food-access CBO — a class with no heightened regime, a recipient no
  //    part of 164.506 reaches — returned here before `selectBasis` was called,
  //    and `recipient.kind` was therefore read by no decision logic at all. The
  //    result was an unconsented disclosure outside the covered entity recorded in
  //    the ledger as lawful under treatment/payment/operations. A ledger row
  //    asserting an authority that does not exist is worse than a missing row: the
  //    ledger is the artifact produced under subpoena.
  if (heightened === undefined && tpoReachesRecipient(req)) {
    return permit(req, BASELINE_BASIS, ['minimum-necessary-projection']);
  }

  // 3. Otherwise an instrument must cover the class AND name this recipient.
  const selected = selectBasis(bases, req);
  if ('fault' in selected) return deny(req, faultReason(selected.fault, heightened), regime);
  return permit(req, regime, obligationsFor(req.dataClass), selected.basis.basisId);
}
