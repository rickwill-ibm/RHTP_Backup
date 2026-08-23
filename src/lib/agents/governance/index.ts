/**
 * agents/governance — the AI-accountability layer (HW-AI / I16), program-spine
 * contract C-DEC. The tier-independent human-decision invariant + decision
 * provenance. The runtime consults `isAutoApprovable` before any auto-approval;
 * every resolution emits `DecisionProvenance`.
 */
export {
  isAdverseCoverageAction,
  isQualifiedHumanDecision,
  evaluateDecision,
  isAutoApprovable,
  type GateInput,
  type GateResult,
} from './decisionGate';
export {
  buildDecisionProvenance,
  isAdverseProvenanceComplete,
  type DecisionProvenance,
  type BuildProvenanceInput,
} from './decisionProvenance';
