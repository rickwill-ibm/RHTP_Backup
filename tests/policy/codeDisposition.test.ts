/**
 * DEFAULT coverage disposition inferred from document STRUCTURE (review/codeDisposition.ts), and the
 * end-to-end effect on the generated CRD rules. Deliberately GENERALIZED: the unit cases use synthetic
 * codes and the pipeline case uses a synthetic, tenant-agnostic guideline — the classifier keys off
 * section structure + negation statements, never a payer name.
 */
import { describe, it, expect } from 'vitest';
import { defaultDispositions, summarizeDispositions } from '@/lib/policy/review/codeDisposition';
import type { GuidelineCode } from '@/lib/policy/extract/criteria';
import { processPolicyDocument } from '@/lib/policy/policyReview';
import type { TextSource } from '@/lib/policy/extract/types';

const mk = (text: string): TextSource => ({
  sourceFile: 'policy.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

const code = (c: string, sourceSection?: GuidelineCode['sourceSection']): GuidelineCode => ({
  code: c,
  codeSystem: 'CPT',
  description: '',
  sourceSection,
});

describe('defaultDispositions — inferred from section (payer-agnostic)', () => {
  it('defaults a code table / PA-requirements code to covered·PA', () => {
    const d = defaultDispositions(
      [code('11111', 'coding-appendix'), code('22222', 'requirements-table')],
      []
    );
    expect(d['11111']).toBe('covered-pa');
    expect(d['22222']).toBe('covered-pa');
  });

  it('leaves a bare prose mention or an untagged code pending — never covered', () => {
    const d = defaultDispositions([code('33333', 'inline-prose'), code('44444')], []);
    expect(d['33333']).toBe('pending');
    expect(d['44444']).toBe('pending');
  });

  it('NEVER defaults covered·PA without a code-table tag', () => {
    const d = defaultDispositions([code('33333', 'inline-prose'), code('44444')], []);
    expect(Object.values(d)).not.toContain('covered-pa');
  });

  it('a not-medically-necessary / investigational statement overrides the section', () => {
    const codes = [code('55555', 'coding-appendix'), code('66666', 'coding-appendix')];
    const nmn = [
      'Endoluminal procedure 55555 is considered investigational and not medically necessary.',
      'Procedure 66666 is not medically necessary under this policy.',
    ];
    const d = defaultDispositions(codes, nmn);
    expect(d['55555']).toBe('investigational');
    expect(d['66666']).toBe('not-covered');
  });
});

describe('generated CRD rules arrive classified, not uniformly pending (end-to-end, synthetic)', () => {
  const doc = mk(
    [
      'Clinical UM Guideline',
      'Medically Necessary:',
      'The procedure is medically necessary when all of the following are met:',
      '1. Member is age 18 or older; and',
      '2. Documented failure of conservative therapy.',
      'Not Medically Necessary:',
      'Endoluminal procedure 88888 is considered investigational and not medically necessary.',
      'Coding',
      '77777 covered procedure',
      '88888 endoluminal procedure',
      'References',
    ].join('\n')
  );

  it('classifies the code-table code covered·PA and the investigational-named code investigational', () => {
    const review = processPolicyDocument(doc);
    expect(review.kind).toBe('criteria');
    expect(review.dispositions?.['77777']).toBe('covered-pa');
    expect(review.dispositions?.['88888']).toBe('investigational');

    const rules = review.coverageRules ?? [];
    const covered = rules.find((r) => r.code === '77777');
    const inv = rules.find((r) => r.code === '88888');
    expect(covered?.role).toBe('covered');
    expect(covered?.priorAuthRequired).toBe(true);
    expect(covered?.coverageInfo?.some((c) => c.code === 'covered')).toBe(true);
    expect(covered?.questionnaireCanonical).toBeTruthy();

    // the investigational code is denied, carries no DTR pathway, and needs no PA
    expect(inv?.role).toBe('investigational');
    expect(inv?.priorAuthRequired).toBe(false);
    expect(inv?.questionnaireCanonical).toBe('');

    // and NOT every code is pending-review anymore
    expect(rules.every((r) => r.role === 'referenced')).toBe(false);
  });
});

describe('summarizeDispositions — the checker sign-off summary + spot-check set', () => {
  it('counts by disposition and lists the off-coverage codes the checker must spot-check', () => {
    const s = summarizeDispositions({
      '43644': 'covered-pa',
      '43775': 'covered-pa',
      '44238': 'not-covered',
      '43290': 'investigational',
      '99999': 'pending',
    });
    expect(s.total).toBe(5);
    expect(s.counts['covered-pa']).toBe(2);
    expect(s.counts['not-covered']).toBe(1);
    expect(s.counts.investigational).toBe(1);
    expect(s.counts.pending).toBe(1);
    // restricted = not-covered + investigational (the highest-cost calls), sorted, never covered/pending
    expect(s.restricted.map((r) => r.code)).toEqual(['43290', '44238']);
    expect(s.restricted.every((r) => r.disposition !== 'covered-pa')).toBe(true);
  });

  it('an all-covered policy has an empty spot-check set', () => {
    const s = summarizeDispositions({ '43644': 'covered-pa', '43775': 'covered-pa' });
    expect(s.restricted).toEqual([]);
    expect(s.counts['covered-pa']).toBe(2);
  });

  it('flags a maker OVERRIDE onto coverage against the policy default (the reverse-risk the checker must see)', () => {
    // maker moved 44238 from the policy's investigational default onto covered-pa
    const s = summarizeDispositions(
      { '44238': 'covered-pa', '43775': 'covered-pa' },
      { '44238': 'investigational', '43775': 'covered-pa' }
    );
    const item = s.restricted.find((r) => r.code === '44238');
    expect(item).toBeDefined();
    expect(item?.disposition).toBe('covered-pa');
    expect(item?.overrideFrom).toBe('investigational');
    // 43775 was covered by default and stays covered → not a spot-check item
    expect(s.restricted.some((r) => r.code === '43775')).toBe(false);
  });
});
