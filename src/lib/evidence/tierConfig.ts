/**
 * Evidence tier + authority rung configuration (Wave-1, Twin-Ladder governance).
 *
 * Pure types and frozen data ONLY — no logic, no imports. This is the shared
 * vocabulary the evidence tier ladder (tier.ts) and the authority interlock
 * (other work-trees) both build against, so the ordinals and the tier→rung
 * ceiling live in exactly one place and are immutable at runtime.
 *
 * Evidence tiers (D0 weakest → D3 settlement-grade):
 *   D0  raw payer statements (e.g. an 835 remittance as received)
 *   D1  conformed single-source records (eligibility, determination, PAS, notes)
 *   D2  reconciled / contested findings (reconciliation, underpayment)
 *   D3  settlement-grade artifacts (recovery)
 *
 * Authority rungs (A0 weakest → A3 highest permitted action authority) pair with
 * tiers via TIER_RUNG_CEILING: evidence of tier Dn can never license an action
 * above rung An. The ceiling is the weakest-link cap, not a grant.
 */

export type EvidenceTier = 'D0' | 'D1' | 'D2' | 'D3';
export type AuthorityRung = 'A0' | 'A1' | 'A2' | 'A3';

/** Ordinal ranking of evidence tiers (D0 weakest = 0 … D3 strongest = 3). */
export const EVIDENCE_TIER_ORDER: Record<EvidenceTier, number> = Object.freeze({
  D0: 0,
  D1: 1,
  D2: 2,
  D3: 3,
});

/** Ordinal ranking of authority rungs (A0 weakest = 0 … A3 strongest = 3). */
export const RUNG_ORDER: Record<AuthorityRung, number> = Object.freeze({
  A0: 0,
  A1: 1,
  A2: 2,
  A3: 3,
});

/**
 * The rung ceiling each evidence tier permits. Evidence of tier Dn caps the
 * permitted authority rung at An — it never raises it. Frozen so no runtime
 * path can widen the ceiling.
 */
export const TIER_RUNG_CEILING: Readonly<Record<EvidenceTier, AuthorityRung>> = Object.freeze({
  D0: 'A0',
  D1: 'A1',
  D2: 'A2',
  D3: 'A3',
});
