/**
 * Explainability view-model. Every disposition names the policy rule(s) that
 * fired; this renders that into a care-team-facing explanation ("why was this
 * suppressed / delayed / bundled"). Pure, PHI-safe (ids + codes only).
 */
import type { Disposition } from '../types';

export interface DispositionExplanation {
  signalId: string;
  action: Disposition['action'];
  /** The policy rule ids/versions that produced the decision. Never empty. */
  firedPolicies: string[];
  /** A short, human-readable reason phrase. */
  reason: string;
}

const REASON_TEXT: Record<string, string> = {
  'duplicate-collapse': 'duplicate of an earlier signal in this fold',
  'consent-absent': 'required consent scope not granted for member contact',
  'superseded-on-closure': 'care gap already closed for this measure',
  'frequency-cap': 'contact-frequency cap reached for the channel',
  'expired-ttl': 'signal passed its actionable time-to-live',
  'internal-only': 'internal signal, no member or care-team action',
};

/** Explain one disposition: what fired and why. */
export function explainDisposition(d: Disposition): DispositionExplanation {
  let reason: string;
  switch (d.action) {
    case 'suppress':
      reason = `suppressed: ${REASON_TEXT[d.reasonCode] ?? d.reasonCode}`;
      break;
    case 'delay':
      reason = `delayed to coordination window ${d.untilWindowId}`;
      break;
    case 'act':
      reason = 'approved: opens the coordinated touchpoint';
      break;
    case 'bundle':
      reason = `approved: bundled into touchpoint ${d.touchpointId}`;
      break;
  }
  return { signalId: d.signalId, action: d.action, firedPolicies: d.policyIds, reason };
}

/** Explain every disposition in a batch. */
export function explainBatch(dispositions: Disposition[]): DispositionExplanation[] {
  return dispositions.map(explainDisposition);
}
