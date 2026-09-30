/**
 * Fact provenance — public surface.
 *
 * The regulator-facing claim made mechanical: an adverse determination computes
 * from human or system-of-record facts alone. Every typed fact carries its origin
 * and its derivation, the gate resolves the whole graph, and the counterfactual
 * differential proves the claim case by case.
 *
 * INVARIANT: taint is a property of the fact SET. Gate with `assertAdverseEligible`;
 *            `originIsEligible` reports one fact's origin and is not a gate.
 */
export {
  assertAdverseEligible,
  counterfactualDifferential,
  effectiveOrigin,
  originIsEligible,
  ModelSourcedFactRefused,
  type DifferentialResult,
  type FactOrigin,
  type ProvenancedFact,
} from './factProvenance';
