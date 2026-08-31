/**
 * Review-row text helpers + the data threading that feeds the per-code research drawer.
 * (The render behavior of the row/drawer is verified in the browser; the src components use jsx:preserve
 *  which the vitest transform can't import, so the row's LOGIC is unit-tested here instead.)
 */
import { describe, it, expect } from 'vitest';
import { codeDescriptor, ORIGIN_TEXT } from '@/lib/policy/review/reviewRowText';
import { reviewElementsFromPolicy } from '@/lib/policy/review/fromPolicyReview';
import { processPolicyDocument } from '@/lib/policy/policyReview';
import type { TextSource } from '@/lib/policy/extract/types';

describe('codeDescriptor — prints the code at most once (doubled-code fix)', () => {
  it('does not re-prefix a label that already starts with the code', () => {
    expect(codeDescriptor({ code: '43644', label: '43644 — Laparoscopy' })).toBe(
      '43644 — Laparoscopy'
    );
  });
  it('prefixes a label that does not start with the code', () => {
    expect(codeDescriptor({ code: 'S2083', label: 'Band adjustment' })).toBe(
      'S2083 — Band adjustment'
    );
  });
  it('returns the label unchanged when there is no code', () => {
    expect(codeDescriptor({ label: 'Age 18 or older' })).toBe('Age 18 or older');
  });
});

describe('ORIGIN_TEXT — a plain-English origin for every section (asserts location, not coverage)', () => {
  it('covers all three source sections', () => {
    expect(ORIGIN_TEXT['coding-appendix']).toMatch(/coding table/i);
    expect(ORIGIN_TEXT['requirements-table']).toMatch(/prior-authorization requirements/i);
    expect(ORIGIN_TEXT['inline-prose']).toMatch(/verify/i);
  });
});

describe('procedure review elements carry source excerpt + section-of-origin (drawer data)', () => {
  const mk = (text: string): TextSource => ({
    sourceFile: 'p.txt',
    mimeType: 'text/plain',
    text,
    rawTextChars: text.length,
  });
  it('threads provenance snippet + GuidelineCode.sourceSection into the procedure element', () => {
    const review = processPolicyDocument(
      mk(
        [
          'Clinical UM Guideline',
          'Medically Necessary:',
          'The procedure is medically necessary when all of the following are met:',
          '1. Age 18 or older.',
          'Coding',
          'CPT',
          '43775 sleeve gastrectomy',
          'References',
        ].join('\n')
      )
    );
    const els = reviewElementsFromPolicy(review);
    const proc = els.find((e) => e.kind === 'procedure' && e.code === '43775');
    expect(proc).toBeTruthy();
    expect(proc?.sourceSection).toBe('coding-appendix');
    // a byte-anchored excerpt from the document is attached (used by the research drawer)
    expect(typeof proc?.source === 'string' && proc.source.length > 0).toBe(true);
  });
});
