/**
 * Confidence + conflict TRIAGE for the encoding review — where the reviewer should look first.
 *
 * An item earns "attention" when the AI is least safe to trust: the policy's own text flags it as
 * not-medically-necessary / investigational (a real coverage call), it carries a defect/ambiguous
 * flag, or it is an AI-MAPPED code (inferred, not lifted verbatim from the text). A clean explicit
 * code is "normal". Confidence aids focus but is NOT the same as safe: an explicit code whose text
 * says "not medically necessary" is high-confidence to EXTRACT yet the single most important one to
 * review — the conflict wins over the confidence. Pure; split from encodingReview.ts for the size cap.
 */
import type { ReviewElement } from './encodingReview';

export interface ReviewAttention {
  level: 'attention' | 'normal';
  reason?: string;
}

export function reviewAttention(el: ReviewElement): ReviewAttention {
  if (el.routing?.bucket === 'excluded')
    return {
      level: 'attention',
      reason:
        'Policy text flags this as not medically necessary / investigational — decide coverage.',
    };
  if (el.flag?.severity === 'defect' || el.flag?.severity === 'ambiguous')
    return { level: 'attention', reason: el.flag.message };
  if (el.confidence === 'mapped')
    return { level: 'attention', reason: 'AI-mapped code — verify it against the source.' };
  return { level: 'normal' };
}

/** Stable sort comparator that floats attention-worthy items to the top of a list (equal items keep
 *  their original order under a stable sort). */
export function compareAttention(a: ReviewElement, b: ReviewElement): number {
  const av = reviewAttention(a).level === 'attention' ? 0 : 1;
  const bv = reviewAttention(b).level === 'attention' ? 0 : 1;
  return av - bv;
}
