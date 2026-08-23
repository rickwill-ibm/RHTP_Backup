// CONTRACT: C10  // F5 claims integrity
/**
 * X12 CARC GROUP capture + member-liability derivation for the claims mapping.
 *
 * A CARC (claim-adjustment-reason) code never stands alone on an 835/ClaimResponse:
 * it sits under an X12 Claim Adjustment GROUP code that says WHO the adjustment
 * falls on. That group is what makes member liability derivable:
 *
 *   CO  Contractual Obligation      provider WRITE-OFF, member is NOT billed
 *   PR  Patient Responsibility      the member OWES this portion
 *   OA  Other Adjustment            neither party billed (informational / transfer)
 *   PI  Payer Initiated Reduction   payer reduction, member is NOT billed
 *
 * So a `197` (prior-auth absent) under CO is a write-off the member never sees,
 * while the same `197` under PR is money the member owes. Capturing only the CARC
 * code and dropping the group loses exactly the fact liability turns on.
 *
 * E9 (never default a liability): when NO group is present we return
 * 'indeterminate', NEVER a guessed PR or CO. Missing group information can only ever
 * make liability UNKNOWN, it can never silently bill the member or write the balance
 * off. The mapping stamps this on the ClaimResponse node so a downstream reader
 * derives liability from real data or sees that it could not be derived.
 */

/** The X12 Claim Adjustment Group Codes this layer recognizes. */
export const X12_GROUP_CODES = Object.freeze(['CO', 'PR', 'OA', 'PI'] as const);
export type X12GroupCode = (typeof X12_GROUP_CODES)[number];

/** True for a recognized X12 group code (case-sensitive, as X12 emits them). */
export function isX12GroupCode(v: unknown): v is X12GroupCode {
  return typeof v === 'string' && (X12_GROUP_CODES as readonly string[]).includes(v);
}

/**
 * Derived member-liability disposition. `indeterminate` is the E9 floor: with no
 * group present, liability is UNKNOWN, never defaulted to owes/write-off.
 */
export type MemberLiability =
  | 'member-responsibility' //     at least one PR group -> the member owes a portion
  | 'not-member-responsibility' // groups present, none PR -> CO/OA/PI, member not billed
  | 'indeterminate'; //            no group captured -> cannot derive (never defaulted)

/**
 * Derive the member-liability disposition from the set of X12 group codes present
 * on an adjudication. PR anywhere means the member owes a portion; groups present
 * without PR mean the member is not billed; NO groups mean indeterminate (E9: a
 * missing group never defaults a liability).
 */
export function deriveMemberLiability(groups: readonly string[]): MemberLiability {
  const recognized = groups.filter(isX12GroupCode);
  if (recognized.length === 0) return 'indeterminate';
  return recognized.includes('PR') ? 'member-responsibility' : 'not-member-responsibility';
}

/** Normalize a raw group list: keep recognized X12 codes, de-duped, in X12 order. */
export function normalizeGroups(v: unknown): X12GroupCode[] {
  const raw = Array.isArray(v) ? v : [];
  const present = new Set(raw.filter(isX12GroupCode));
  return X12_GROUP_CODES.filter((g) => present.has(g));
}
