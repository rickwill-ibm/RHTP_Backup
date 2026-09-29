/**
 * AI decision provenance (HW-AI / I16). Every AI-influenced decision must record,
 * PHI-safely: the inputs it saw, the fired rule + its version, a member-facing
 * reason, and an appeal artifact reference — so an adverse determination is
 * explainable and appealable (the AI-governance requirement). Emitted alongside
 * the tamper-evident audit ledger (C-AUD).
 */

import type { QualificationVerdict } from '@/lib/authz/credentialing';
import type { ProposedAction, HumanDecision } from '@/lib/agentRuntime/types';

export interface DecisionProvenance {
  proposalId: string;
  actionType: string;
  decision: 'approved' | 'rejected';
  /** Attributed decider — a qualified human id, or `autonomy:<tier>` for auto. */
  decidedBy: string;
  requiresHuman: boolean;
  /** The rule/model that fired, with version, for reproducibility. */
  firedRule: string;
  ruleVersion: string;
  /** PHI-safe references the decision was based on (resource ids, codes). */
  inputs: Record<string, string>;
  /** A short, member-facing reason (no free-text PHI) for the determination. */
  memberFacingReason: string;
  /** Reference to the appeal artifact/pathway generated for an adverse decision. */
  appealRef?: string;
  decidedAtMs: number;
  /**
   * THE REVIEWER-QUALIFICATION RECEIPT — who was qualified, under which standard, as at when.
   *
   * WHY IT IS HERE. The qualification was being computed, used for admission control, and then
   * DISCARDED. The one artifact that proves 42 CFR 438.210(b)(3) compliance never reached the
   * durable record, so a state auditor or a fair-hearing officer asking "who decided this, and what
   * made them appropriate" would have found `decidedBy` and nothing else. `standardApplied` and
   * `attestationRef` are precisely what they ask for.
   *
   * Identity-safe: no licence number, no NPI. Carried verbatim from the verdict so the record cannot
   * disagree with the proof that admitted the decision.
   */
  reviewerQualification?: {
    reviewerRef: string;
    standardApplied: string;
    attestationRef?: string;
    licenceVerdict: string;
    licenceType?: string;
    licenceJurisdiction?: string;
    needDomain: string;
    sourceId: string;
    sourceAsOfMs: number;
    qualifiedAsOfMs: number;
  };
}

export interface BuildProvenanceInput {
  action: ProposedAction;
  humanDecision: HumanDecision;
  requiresHuman: boolean;
  firedRule: string;
  ruleVersion: string;
  memberFacingReason: string;
  /** Provide when the decision is adverse (an appeal path is mandatory). */
  appealRef?: string;
  /** The verdict from the qualification gate that admitted this decision. */
  qualification?: QualificationVerdict;
}

/** Build a PHI-safe decision provenance record from a resolved decision. */
export function buildDecisionProvenance(input: BuildProvenanceInput): DecisionProvenance {
  return {
    proposalId: input.humanDecision.proposalId,
    actionType: input.action.actionType,
    decision: input.humanDecision.decision,
    decidedBy: input.humanDecision.decidedBy,
    requiresHuman: input.requiresHuman,
    firedRule: input.firedRule,
    ruleVersion: input.ruleVersion,
    inputs: input.action.refs ?? {},
    memberFacingReason: input.memberFacingReason,
    appealRef: input.appealRef,
    decidedAtMs: input.humanDecision.decidedAtMs,
    ...(input.qualification
      ? {
          reviewerQualification: {
            reviewerRef: input.qualification.reviewerRef,
            standardApplied: input.qualification.standardApplied,
            attestationRef: input.qualification.attestationRef,
            licenceVerdict: input.qualification.licenceVerdict,
            licenceType: input.qualification.licenceType,
            licenceJurisdiction: input.qualification.licenceJurisdiction,
            needDomain: input.qualification.needDomain,
            sourceId: input.qualification.sourceId,
            sourceAsOfMs: input.qualification.sourceAsOfMs,
            qualifiedAsOfMs: input.qualification.asOfMs,
          },
        }
      : {}),
  };
}

/**
 * Completeness check for an ADVERSE decision's provenance: an adverse determination
 * that lacks a member-facing reason or an appeal reference is not compliant.
 */
export function isAdverseProvenanceComplete(p: DecisionProvenance): boolean {
  if (p.decision !== 'rejected') return true;
  return Boolean(
    p.memberFacingReason && p.memberFacingReason.trim() && p.appealRef && p.appealRef.trim()
  );
}
