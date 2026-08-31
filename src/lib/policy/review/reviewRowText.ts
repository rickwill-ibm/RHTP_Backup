/**
 * Pure text helpers for the review-row renderers (kept JSX-free so they are unit-testable): the
 * doubled-code-safe descriptor and the plain-English, payer-agnostic section-of-origin line.
 */
import type { ReviewElement } from './encodingReview';

/** The row descriptor, printing the code AT MOST ONCE — a procedure element's `label` already begins
 *  with its code, so we don't re-prefix it. */
export function codeDescriptor(el: Pick<ReviewElement, 'code' | 'label'>): string {
  return el.code && !el.label.startsWith(el.code) ? `${el.code} — ${el.label}` : el.label;
}

/** WHERE a code was harvested — asserts location only, never a coverage decision (payer-agnostic). */
export const ORIGIN_TEXT: Record<NonNullable<ReviewElement['sourceSection']>, string> = {
  'coding-appendix': "Listed in the policy's own CPT/HCPCS coding table.",
  'requirements-table': 'Appears in a prior-authorization requirements table.',
  'inline-prose': 'A bare inline CPT/HCPCS mention — verify against the source.',
};
