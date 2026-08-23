/**
 * External-result disposition: map a PIX/PDQ (or PIXm/PDQm) response onto the
 * platform's link / hold decision, respecting the SAME possible-match HELD
 * semantics the internal resolver uses (empiResolver.ts).
 *
 * The enterprise/global id an external EMPI returns becomes the anchored member
 * id ONLY when the cross-reference is unambiguously resolved, or a demographics
 * candidate clears the auto-link threshold. Everything else is HELD for review,
 * never auto-linked and never defaulted to a fabricated identity (E9: an
 * unresolved external query fails closed / HELD, never returns a default id).
 */
import { MATCH_THRESHOLDS } from '../matchEngine';
import type { PdqResponse, PixResponse } from './types';

export type ExternalOutcome = 'linked' | 'held';

export interface ExternalDisposition {
  outcome: ExternalOutcome;
  /** The anchored member id (the enterprise id) when linked; '' when held. */
  memberId: string;
  /** Responder confidence 0-100 that drove the decision. */
  confidence: number;
  /** Structured, PHI-safe reason code. */
  reasonCode: string;
  /** PHI-free one-line audit summary (no name/dob/SSN). */
  auditSummary: string;
}

const HELD_REASON = 'identity-possible-match';

/**
 * Decide the disposition of a PIX/PIXm cross-reference result.
 *   resolved + a single enterprise id  -> LINKED (anchor = enterprise id)
 *   ambiguous / not-found / no id       -> HELD for review (fail closed)
 */
export function decideCrossReference(response: PixResponse): ExternalDisposition {
  if (response.status === 'resolved' && response.enterpriseId) {
    return {
      outcome: 'linked',
      memberId: response.enterpriseId,
      confidence: 100,
      reasonCode: 'empi-external-linked',
      auditSummary: `external-pix outcome=linked status=resolved xrefs=${response.crossReferences.length}`,
    };
  }
  return {
    outcome: 'held',
    memberId: '',
    confidence: response.status === 'ambiguous' ? MATCH_THRESHOLDS.possibleMatchMin : 0,
    reasonCode: HELD_REASON,
    auditSummary: `external-pix outcome=held status=${response.status}`,
  };
}

/**
 * Decide the disposition of a PDQ/PDQm demographics result. A single top
 * candidate at/above the auto-link threshold links to its enterprise id; a
 * candidate in the possible-match band, several close candidates, or no candidate
 * at all is HELD (a low-confidence external match is HELD, not auto-linked).
 */
export function decideDemographic(response: PdqResponse): ExternalDisposition {
  const sorted = [...response.candidates].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  if (!top) {
    return {
      outcome: 'held',
      memberId: '',
      confidence: 0,
      reasonCode: HELD_REASON,
      auditSummary: 'external-pdq outcome=held candidates=0',
    };
  }
  const runnerUp = sorted[1];
  const dominant = !runnerUp || top.confidence - runnerUp.confidence >= MATCH_THRESHOLDS.possibleMatchMin / 6;
  const confident = top.confidence >= MATCH_THRESHOLDS.autoLinkMin;
  // E9: a top candidate that carries no enterprise anchor (empty enterpriseId)
  // can never auto-link, however confident the demographic score — linking would
  // anchor the member to a fabricated/peer-domain id. It is HELD for review.
  const anchorable = Boolean(top.enterpriseId);

  if (confident && dominant && anchorable) {
    return {
      outcome: 'linked',
      memberId: top.enterpriseId,
      confidence: top.confidence,
      reasonCode: 'empi-external-linked',
      auditSummary: `external-pdq outcome=linked confidence=${top.confidence} candidates=${sorted.length}`,
    };
  }
  return {
    outcome: 'held',
    memberId: '',
    confidence: top.confidence,
    reasonCode: HELD_REASON,
    auditSummary: `external-pdq outcome=held confidence=${top.confidence} candidates=${sorted.length}`,
  };
}
