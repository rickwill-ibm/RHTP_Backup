/**
 * Extraction boundary regression: a criterion must not absorb a following SECTION HEADING or a
 * FOOTNOTE line. Both defects were seen on the real Elevance CG-SURG-83 policy ("…surgery. Reoperation"
 * and "…GERD). * Revision/ conversion indications apply…"); this pins the fix on a minimal synthetic
 * document so it stays fast and payer-agnostic.
 */
import { describe, it, expect } from 'vitest';
import { extractCriteriaPolicy } from '@/lib/policy/extract/criteria';
import type { TextSource } from '@/lib/policy/extract/types';

const mk = (text: string): TextSource => ({
  sourceFile: 'x.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

const doc = mk(
  [
    'Medically Necessary:',
    'The service is considered medically necessary when all of the following are met:',
    'A. The member is age 18 years or older.',
    'B. A treatment plan addressing the pre- and post-operative needs of the member.',
    'Reoperation', // a standalone SECTION HEADING (must NOT fold into criterion B)
    'Surgical revision is considered medically necessary when all of the following are met:',
    'A. There is documentation of a complication related to the initial procedure.',
    '* Revision indications apply to the procedures listed under criteria B.', // FOOTNOTE (must NOT fold)
    'References',
  ].join('\n')
);

describe('criteria extraction — heading/footnote boundaries', () => {
  const allCriteriaText = (): string[] => {
    const p = extractCriteriaPolicy(doc);
    const out: string[] = [];
    const walk = (n: { text: string; children: { text: string; children: unknown[] }[] }): void => {
      out.push(n.text);
      n.children.forEach((c) => walk(c as never));
    };
    p.medicallyNecessary.forEach((g) => g.criteria.forEach((c) => walk(c as never)));
    return out;
  };

  it('does not fold a standalone section heading into the previous criterion', () => {
    const texts = allCriteriaText();
    const treatmentPlan = texts.find((t) => /treatment plan addressing/i.test(t));
    expect(treatmentPlan).toBeDefined();
    expect(/\bReoperation\b/.test(treatmentPlan ?? '')).toBe(false);
    // the two determinations still split into two groups (heading skipped, not lost as content)
    expect(extractCriteriaPolicy(doc).medicallyNecessary.length).toBeGreaterThanOrEqual(2);
  });

  it('does not fold a footnote line into a criterion', () => {
    expect(allCriteriaText().some((t) => /Revision indications apply/i.test(t))).toBe(false);
  });
});
