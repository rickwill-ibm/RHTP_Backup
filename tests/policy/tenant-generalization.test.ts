/**
 * Generalization + tenant-context tests for the criteria path.
 *
 * These use SYNTHETIC, tenant-agnostic documents on purpose: the point is that the
 * extractor works on ANY tenant's policy shape, not one named payer's. The real named
 * documents are covered by criteria.test.ts / structured.test.ts (regression); here we
 * attack the enumeration styles and the per-tenant segregation the workbench relies on.
 */
import { describe, it, expect } from 'vitest';
import { extractCriteriaPolicy, criteriaToNormalized } from '@/lib/policy/extract/criteria';
import { generateQuestionnaireFromPolicy } from '@/lib/goldenThread/dtrFromPolicy';
import { processPolicyDocument } from '@/lib/policy/policyReview';
import type { TextSource } from '@/lib/policy/extract/types';

const mk = (text: string): TextSource => ({
  sourceFile: 'policy.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

describe('criteria generalization — enumeration styles', () => {
  it('numbered top-level criteria (1./2./3.) are captured, not dropped', () => {
    const doc = mk(
      [
        'Clinical Policy Bulletin',
        'Medically Necessary:',
        'The service is medically necessary when all of the following are met:',
        '1. Member is age 18 or older; and',
        '2. Documented failure of conservative therapy; and',
        '3. Imaging confirms the diagnosis.',
        'Coding',
        '12345 example procedure',
        'References',
      ].join('\n')
    );
    const cp = extractCriteriaPolicy(doc);
    expect(cp.stats.criteria).toBe(3);
    expect(cp.medicallyNecessary[0].logic).toBe('all');
    expect(cp.medicallyNecessary[0].criteria.map((c) => c.label)).toEqual(['1', '2', '3']);

    const dtr = generateQuestionnaireFromPolicy(criteriaToNormalized(cp));
    expect(dtr.item.filter((i) => i.linkId.startsWith('indication-')).length).toBe(3);
  });

  it('roman-numeral sections nest their lettered sub-criteria correctly', () => {
    const doc = mk(
      [
        'Clinical UM Guideline',
        'Medically Necessary:',
        'I. Primary service is medically necessary when all of the following:',
        'A. Member is age 18 or older; and',
        'B. BMI meets threshold.',
        'II. Revision is medically necessary when the following applies:',
        'A. A documented complication is present.',
        'References',
      ].join('\n')
    );
    const cp = extractCriteriaPolicy(doc);
    const top = cp.medicallyNecessary[0].criteria;
    // two top-level roman sections, each carrying its own lettered sub-criteria
    expect(top.map((c) => c.label)).toEqual(['I', 'II']);
    expect(top.find((c) => c.label === 'I')?.children.map((c) => c.label)).toEqual(['A', 'B']);
    expect(top.find((c) => c.label === 'II')?.children.map((c) => c.label)).toEqual(['A']);
  });

  it('deep 3-level nesting (letter → number → sub-letter) is preserved generally', () => {
    const doc = mk(
      [
        'Medically Necessary:',
        'Service is medically necessary when all of the following:',
        'A. First criterion.',
        'B. One of the following:',
        '1. Option one; or',
        '2. One of the following comorbidities:',
        'a. Condition A; or',
        'b. Condition B.',
        'References',
      ].join('\n')
    );
    const cp = extractCriteriaPolicy(doc);
    const b = cp.medicallyNecessary[0].criteria.find((c) => c.label === 'B');
    expect(b?.children.map((c) => c.label)).toEqual(['1', '2']);
    expect(b?.children.find((c) => c.label === '2')?.children.map((c) => c.label)).toEqual([
      'a',
      'b',
    ]);
  });

  it('two Medically Necessary regions do not bleed into each other', () => {
    const doc = mk(
      [
        'Medically Necessary:',
        'Service one is medically necessary when all of the following:',
        'A. Criterion for service one.',
        'Medically Necessary:',
        'Service two is medically necessary when all of the following:',
        'A. Criterion for service two.',
        'References',
      ].join('\n')
    );
    const cp = extractCriteriaPolicy(doc);
    const allText = cp.medicallyNecessary
      .flatMap((g) => g.criteria)
      .map((c) => c.text)
      .join(' | ');
    // the second region's header must not leak into the first criterion's text
    expect(allText).not.toMatch(/Medically Necessary/i);
    expect(cp.medicallyNecessary.length).toBe(2);
  });
});

describe('tenant context — segregation, no payer hardcoding', () => {
  const criteriaDoc = mk(
    [
      'Clinical UM Guideline',
      'Guideline #: XX-TEST-01',
      'Medically Necessary:',
      'The service is medically necessary when all of the following:',
      'A. Member is age 18 or older.',
      'References',
    ].join('\n')
  );

  it('stamps the tenant and scopes the policyId under it', () => {
    const r = processPolicyDocument(criteriaDoc, { tenant: 'Tenant One' });
    expect(r.tenant).toBe('Tenant One');
    expect(r.policyId.startsWith('tenant-one/')).toBe(true);
  });

  it('the same policy under two tenants yields distinct, non-colliding ids', () => {
    const a = processPolicyDocument(criteriaDoc, { tenant: 'Tenant One' });
    const b = processPolicyDocument(criteriaDoc, { tenant: 'Tenant Two' });
    expect(a.policyId).not.toBe(b.policyId);
    // identical policy body under each tenant → same suffix, different tenant prefix
    expect(a.policyId.split('/').slice(1).join('/')).toBe(b.policyId.split('/').slice(1).join('/'));
  });

  it('no tenant → unscoped id and null tenant (back-compatible)', () => {
    const r = processPolicyDocument(criteriaDoc);
    expect(r.tenant).toBeNull();
    expect(r.policyId).not.toContain('/');
  });
});

describe('#5: sub-item fidelity + all-of / one-of logic', () => {
  const doc = mk(
    [
      'Medically Necessary:',
      'Service is medically necessary when all of the following:',
      'A. Member is age 18 or older.',
      'B. One of the following procedures is planned:',
      '1. Roux-en-Y; or',
      '2. Sleeve gastrectomy; or',
      '3. Gastric band.',
      'References',
    ].join('\n')
  );

  it('surfaces each sub-item as its own item and sets required from the logic', () => {
    const norm = criteriaToNormalized(extractCriteriaPolicy(doc));
    const inds = norm.indications ?? [];
    const byLabel = Object.fromEntries(inds.map((i) => [i.label, i]));

    // Top-level A and B are individually required (group is "all of the following").
    expect(byLabel['A']?.required).toBe(true);
    expect(byLabel['B']?.required).toBe(true);
    // The three procedures are surfaced as distinct alternatives — NOT collapsed, NOT required.
    expect(byLabel['B.1']).toBeDefined();
    expect(byLabel['B.2']).toBeDefined();
    expect(byLabel['B.3']).toBeDefined();
    expect(byLabel['B.1']?.required).toBe(false);
  });

  it('the existing generator emits the alternatives as separate, correctly-required items', () => {
    const dtr = generateQuestionnaireFromPolicy(criteriaToNormalized(extractCriteriaPolicy(doc)));
    const byId = Object.fromEntries(dtr.item.map((i) => [i.linkId, i]));
    expect(byId['indication-B']?.required).toBe(true);
    expect(byId['indication-B.1']?.required).toBe(false);
    // No longer one folded boolean: the three options are three items.
    expect(dtr.item.filter((i) => i.linkId.startsWith('indication-B.')).length).toBe(3);
  });
});

describe('#6: empty drafts are not promotable', () => {
  it('a guideline with no parsed criteria is not promotable and warns', () => {
    const r = processPolicyDocument(
      mk(
        [
          'Clinical UM Guideline',
          'Medically Necessary:',
          'See coding table.',
          'Coding',
          '12345 x',
          'References',
        ].join('\n')
      ),
      { tenant: 'Tenant One' }
    );
    expect(r.kind).toBe('criteria');
    expect(r.promotable).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/no medical-necessity criteria/i);
  });

  it('a real criteria guideline is promotable', () => {
    const r = processPolicyDocument(
      mk(
        [
          'Medically Necessary:',
          'Service is medically necessary when all of the following:',
          'A. Member is age 18 or older.',
          'References',
        ].join('\n')
      )
    );
    expect(r.promotable).toBe(true);
  });

  it('an unknown format is not promotable', () => {
    const r = processPolicyDocument(mk('Just prose with no structure.'));
    expect(r.kind).toBe('unknown');
    expect(r.promotable).toBe(false);
  });
});

describe('#7: multi-service guidelines carry service context', () => {
  const multiDoc = mk(
    [
      'Medically Necessary:',
      'Gastric bypass is medically necessary when all of the following:',
      'A. BMI over 40.',
      'Medically Necessary:',
      'Panniculectomy is medically necessary when all of the following:',
      'A. Documented rash.',
      'References',
    ].join('\n')
  );

  it('labels are service-scoped and titles name the service; no collisions', () => {
    const inds = criteriaToNormalized(extractCriteriaPolicy(multiDoc)).indications ?? [];
    const labels = inds.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.every((l) => /^S\d+\./.test(l))).toBe(true);
    const titles = inds.map((i) => i.title);
    expect(titles.some((t) => /Gastric bypass/i.test(t))).toBe(true);
    expect(titles.some((t) => /Panniculectomy/i.test(t))).toBe(true);

    // The generated questions are unambiguous across services.
    const dtr = generateQuestionnaireFromPolicy(
      criteriaToNormalized(extractCriteriaPolicy(multiDoc))
    );
    const qids = dtr.item.filter((i) => i.linkId.startsWith('indication-')).map((i) => i.linkId);
    expect(new Set(qids).size).toBe(qids.length);
  });

  it('single-service guidelines keep pristine A/B labels (no regression)', () => {
    const single = mk(
      [
        'Medically Necessary:',
        'Service is medically necessary when all of the following:',
        'A. First.',
        'B. Second.',
        'References',
      ].join('\n')
    );
    const inds = criteriaToNormalized(extractCriteriaPolicy(single)).indications ?? [];
    expect(inds.map((i) => i.label)).toEqual(['A', 'B']);
    expect(inds.every((i) => !i.title.includes(' — '))).toBe(true);
  });
});
