/**
 * Criteria extractor — gated against the REAL Elevance CG-SURG-83 clinical guideline.
 * Proves the nested medical-necessity criteria (the DTR content) parse correctly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pdfToTextSource } from '@/lib/policy/server/pdfIntake';
import { extractCriteriaPolicy, criteriaToNormalized } from '@/lib/policy/extract/criteria';
import { generateQuestionnaireFromPolicy } from '@/lib/goldenThread/dtrFromPolicy';
import { verifyAnchor } from '@/lib/policy/extract/provenance';
import type { TextSource } from '@/lib/policy/extract/types';

const bytes = (): Uint8Array =>
  new Uint8Array(readFileSync('tests/fixtures/elevance-cgsurg83.pdf'));

const mk = (text: string): TextSource => ({
  sourceFile: 'x.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

describe('clinical-guideline criteria extraction (real Elevance CG-SURG-83)', () => {
  it('extracts nested medical-necessity criteria + coding', async () => {
    const src = await pdfToTextSource(bytes(), 'CG-SURG-83.pdf');
    const p = extractCriteriaPolicy(src);

    expect(p.guidelineId).toBe('CG-SURG-83');
    expect(p.title).toMatch(/Bariatric Surgery/i);
    expect(p.stats.criteria).toBeGreaterThanOrEqual(6);
    expect(p.stats.codes).toBeGreaterThan(20);

    const g0 = p.medicallyNecessary[0];
    expect(g0.logic).toBe('all');
    const labels = g0.criteria.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));

    const A = g0.criteria.find((c) => c.label === 'A');
    expect(A?.text.toLowerCase()).toContain('age 18');

    const B = g0.criteria.find((c) => c.label === 'B');
    expect(B?.children.length).toBe(5); // 5 procedures

    const C = g0.criteria.find((c) => c.label === 'C');
    const cSecond = C?.children.find((n) => n.label === '2');
    expect(cSecond?.children.length).toBe(4); // 4 comorbidities a–d

    const D = g0.criteria.find((c) => c.label === 'D');
    expect(D?.children.length).toBe(5); // 5 documentation items

    // codes carry descriptions and verify against source
    const sleeve = p.codes.find((c) => c.code === '43775');
    expect(sleeve?.description.toLowerCase()).toContain('sleeve');
    for (const pr of p.provenance) expect(verifyAnchor(src.text, pr)).toBe(true);

    // #2 closed: the CRITERIA themselves (the DTR content) are now byte-anchored,
    // not just the codes — so the promotion gate's "every claim anchored" holds.
    const criteriaProv = p.provenance.filter((pr) => /^criteria\[/.test(pr.field));
    expect(criteriaProv.length).toBeGreaterThanOrEqual(6);
    for (const pr of criteriaProv) expect(verifyAnchor(src.text, pr)).toBe(true);

    // exclusions captured
    expect(p.notMedicallyNecessary.join(' ')).toMatch(/not medically necessary/i);
  });

  it('maps real criteria → NormalizedPolicy → the existing generator (fully-populated DTR)', async () => {
    const src = await pdfToTextSource(bytes(), 'CG-SURG-83.pdf');
    const normalized = criteriaToNormalized(extractCriteriaPolicy(src));

    expect(normalized.determinationBasis).toBe('medical-necessity-criteria');
    expect(normalized.indications?.length).toBeGreaterThanOrEqual(4);
    expect(normalized.allPaCodes?.some((c) => c === '43775')).toBe(true);

    // The DTR flows through the ONE existing repo generator — no parallel path.
    const dtr = generateQuestionnaireFromPolicy(normalized);
    const indicationItems = dtr.item.filter((i) => i.linkId.startsWith('indication-'));
    expect(indicationItems.length).toBe(normalized.indications?.length);
    expect(dtr.item.some((i) => i.linkId === 'supporting-diagnosis')).toBe(true);
  });
});

describe('criteriaToNormalized — adversarial: label uniqueness', () => {
  it('two "Medically Necessary" groups both restarting at A do NOT collide on linkId', () => {
    const doc = mk(
      [
        'Medically Necessary:',
        'Service 1 is medically necessary when all of the following:',
        'A. First condition for service 1.',
        'B. Second condition for service 1.',
        'Coding',
        '11111 first',
        'Medically Necessary:',
        'Service 2 is medically necessary when all of the following:',
        'A. First condition for service 2.',
        'References',
      ].join('\n')
    );
    const normalized = criteriaToNormalized(extractCriteriaPolicy(doc));
    const labels = normalized.indications?.map((i) => i.label) ?? [];
    // labels are unique even though two source groups both started at "A"
    expect(new Set(labels).size).toBe(labels.length);

    const dtr = generateQuestionnaireFromPolicy(normalized);
    const linkIds = dtr.item.filter((i) => i.linkId.startsWith('indication-')).map((i) => i.linkId);
    expect(new Set(linkIds).size).toBe(linkIds.length); // no duplicate questionnaire items
  });
});

describe('criteria extractor — adversarial: evidence-review appendix must NOT fold into a criterion', () => {
  // The exact defect class from scanned-then-Word (RTF) payer policies: the last criterion is
  // followed by an un-marked PICO evidence table + Policy Guidelines + Coverage back-matter. With
  // no list markers the parser used to fold that entire appendix into the final criterion — one
  // monstrous, non-consumable questionnaire item. The appendix boundary must terminate the region
  // and trim any residue so no criterion carries the PICO/coverage prose.
  const withAppendix = mk(
    [
      'Medically Necessary:',
      'The service is considered medically necessary when all of the following are met:',
      'A. The member is age 18 years or older.',
      'B. Conservative management has failed after a documented three-month trial.',
      '',
      // ---- un-marked evidence-review back-matter (no A./1./a. markers) ----
      'Populations Interventions Comparators Outcomes',
      'The relevant population is adults with the condition under review.',
      'Interventions of interest are the requested procedure and its variants, which have been',
      'studied across numerous randomized and observational cohorts spanning multiple decades of',
      'literature and are summarized here at considerable length purely as evidence context.',
      'Comparators of interest are usual care and watchful waiting.',
      'Relevant outcomes include symptom relief, functional status, and quality of life.',
      'Policy Guidelines',
      'This section paraphrases coverage determinations and is not itself a necessity criterion.',
      'Medicare Coverage',
      'There is no national coverage determination for this service.',
      'Coding',
      '43775 sleeve gastrectomy',
      'References',
    ].join('\n')
  );

  it('extracts only the two real criteria and drops the PICO/coverage appendix', () => {
    const p = extractCriteriaPolicy(withAppendix);

    // exactly the two lettered criteria — the appendix is NOT a third criterion
    const g0 = p.medicallyNecessary[0];
    expect(g0.criteria.map((c) => c.label)).toEqual(['A', 'B']);
    expect(p.stats.criteria).toBe(2);

    // no criterion text carries any appendix/PICO/coverage phrase
    const allCriteriaText = p.medicallyNecessary
      .flatMap((g) => g.criteria)
      .flatMap((c) => [c.text, ...c.children.map((ch) => ch.text)])
      .join(' ');
    for (const phrase of [
      'Populations Interventions Comparators',
      'Interventions of interest are',
      'Comparators of interest are',
      'Relevant outcomes include',
      'Policy Guidelines',
      'Medicare Coverage',
    ]) {
      expect(allCriteriaText).not.toContain(phrase);
    }

    // criterion B ends at the conservative-management sentence, not the evidence prose
    const B = g0.criteria.find((c) => c.label === 'B');
    expect(B?.text.toLowerCase()).toContain('conservative management');
    expect(B?.text.length).toBeLessThan(400);

    // the coding section still parses past the appendix
    expect(p.codes.some((c) => c.code === '43775')).toBe(true);
  });

  it('the generated questionnaire carries no folded appendix text', () => {
    const normalized = criteriaToNormalized(extractCriteriaPolicy(withAppendix));
    const dtr = generateQuestionnaireFromPolicy(normalized);
    const allText = JSON.stringify(dtr);
    for (const phrase of [
      'Interventions of interest are',
      'Populations Interventions Comparators',
    ]) {
      expect(allText).not.toContain(phrase);
    }
  });
});
