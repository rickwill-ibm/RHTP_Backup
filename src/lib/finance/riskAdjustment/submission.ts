/**
 * Encounter-submission gate + diagnosis retract (HW-FIN / I18), program-spine
 * contract C-SUB (gate half).
 *
 * Two financial-integrity Crits addressed:
 *  - "no encounter-submission pipeline so no risk revenue is earned" — a gate that
 *    decides which captured HCCs are submittable to EDPS/RAPS;
 *  - "an unsupported HCC cannot be retracted pre-submission" — a retract flow that
 *    removes a non-defensible diagnosis BEFORE it is submitted (avoiding the RADV
 *    takeback), tying into the C-LIFE void lifecycle.
 *
 * Only a RADV-defensible, active diagnosis is submittable. The gate is the single
 * mechanical check the submission pipeline (and the UI) consult.
 */
import { assessRadvDefensibility, type HccCapture } from './meat';

export interface SubmissionDecision {
  submittable: boolean;
  reason: string;
  deficiencies: string[];
}

/** May this captured HCC be submitted for risk-adjustment payment? */
export function evaluateSubmission(capture: HccCapture): SubmissionDecision {
  if (capture.status === 'retracted') {
    return { submittable: false, reason: 'diagnosis retracted (not submitted)', deficiencies: [] };
  }
  const radv = assessRadvDefensibility(capture);
  if (!radv.defensible) {
    return { submittable: false, reason: 'not RADV-defensible', deficiencies: radv.deficiencies };
  }
  return { submittable: true, reason: 'RADV-defensible and active', deficiencies: [] };
}

/** Retract a diagnosis pre-submission (unsupported / provider withdrawal). */
export function retractDiagnosis(capture: HccCapture): HccCapture {
  return { ...capture, status: 'retracted' };
}

export interface SubmissionBatchResult {
  submitted: HccCapture[];
  withheld: Array<{ capture: HccCapture; decision: SubmissionDecision }>;
}

/**
 * Partition a set of captured HCCs into submittable vs withheld. This is the
 * defensible pre-submission scrub: nothing non-defensible or retracted goes to
 * EDPS/RAPS, so the plan does not book risk revenue it cannot survive an audit on.
 */
export function scrubForSubmission(captures: HccCapture[]): SubmissionBatchResult {
  const submitted: HccCapture[] = [];
  const withheld: SubmissionBatchResult['withheld'] = [];
  for (const c of captures) {
    const decision = evaluateSubmission(c);
    if (decision.submittable) submitted.push(c);
    else withheld.push({ capture: c, decision });
  }
  return { submitted, withheld };
}
