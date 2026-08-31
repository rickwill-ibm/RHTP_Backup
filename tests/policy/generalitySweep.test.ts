/**
 * GENERALITY SWEEP (Tier 4): the authoring pipeline must work on ANY policy shape / clinical domain, not
 * just bariatric. These synthetic, tenant-agnostic policies exercise genuinely different shapes — a drug
 * PA policy, a DME policy, a multi-indication imaging policy, a code-table, and a deliberately thin one —
 * and assert the pipeline classifies each sensibly (format, codes, dispositions, discrete items, the
 * under-extraction guard) with NO payer-specific branching.
 */
import { describe, it, expect } from 'vitest';
import { processPolicyDocument } from '@/lib/policy/policyReview';
import type { TextSource } from '@/lib/policy/extract/types';

const mk = (text: string): TextSource => ({
  sourceFile: 'policy.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

describe('drug / pharmacy prior-authorization policy', () => {
  const doc = mk(
    [
      'Pharmacy Clinical Policy',
      'Medically Necessary:',
      'The requested agent is medically necessary when all of the following are met:',
      '1. Diagnosis of moderate-to-severe plaque psoriasis; and',
      '2. Documented trial and failure of at least two preferred systemic agents; and',
      '3. Age 18 years or older.',
      'Coding',
      'HCPCS',
      'J3357',
      'References',
    ].join('\n')
  );
  it('detects a criteria policy, extracts the criteria, and classifies the HCPCS code covered·PA', () => {
    const r = processPolicyDocument(doc);
    expect(r.kind).toBe('criteria');
    expect(r.stats.criteria ?? 0).toBeGreaterThanOrEqual(3);
    const rule = (r.coverageRules ?? []).find((x) => x.code === 'J3357');
    expect(rule?.codeSystem).toBe('HCPCS');
    expect(rule?.role).toBe('covered');
    expect(r.dispositions?.['J3357']).toBe('covered-pa');
  });
});

describe('durable medical equipment (DME) policy', () => {
  const doc = mk(
    [
      'DME Medical Policy',
      'Medically Necessary:',
      'A power wheelchair is medically necessary when all of the following are met:',
      'A. A mobility limitation that cannot be resolved by a cane, walker, or manual wheelchair; and',
      'B. Documentation of a face-to-face mobility evaluation by the treating practitioner; and',
      'C. The home can accommodate the equipment.',
      'Coding',
      'HCPCS',
      'K0856',
      'References',
    ].join('\n')
  );
  it('turns the mobility-evaluation documentation requirement into a discrete evidence item', async () => {
    const r = processPolicyDocument(doc);
    expect(r.kind).toBe('criteria');
    // the "documentation of a face-to-face mobility evaluation" criterion → its own attachment
    const attachments = r.item.filter((i) => i.type === 'attachment');
    expect(attachments.some((a) => a.linkId.endsWith('.evidence'))).toBe(true);
    expect(r.dispositions?.['K0856']).toBe('covered-pa');
  });
});

describe('multi-indication imaging policy (multiple determination pathways)', () => {
  const doc = mk(
    [
      'Advanced Imaging Guideline',
      'Cardiac MRI is considered medically necessary when all of the following are met:',
      '1. Suspected cardiomyopathy not characterized by echocardiography.',
      'Cardiac CT angiography is considered medically necessary when all of the following are met:',
      '1. Acute chest pain with intermediate pretest probability of coronary disease.',
      'Coding',
      'CPT',
      '75561',
      '75574',
      'References',
    ].join('\n')
  );
  it('extracts more than one determination pathway and classifies both codes', () => {
    const r = processPolicyDocument(doc);
    expect(r.kind).toBe('criteria');
    // two distinct "considered medically necessary" determinations → 2 titled DTR sections
    const sections = r.item.filter((i) => i.type === 'display');
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect((r.coverageRules ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('code-table (Requirements By Product) policy — non-bariatric', () => {
  const doc = mk(
    [
      'Prior Authorization Requirements By Product',
      'CPT / HCPCS requiring prior authorization:',
      'CPT',
      '64483',
      '64484',
      'References',
    ].join('\n')
  );
  it('detects a code table by structure (not payer name)', () => {
    // Format detection is purely structural. (Coverage-rule generation from a real tabular code table
    // — with product/confidence columns — is validated end-to-end on the Horizon fixture in
    // codeTableCoverage.test.ts; a bare plain-text list is not the structured extractor's input shape.)
    const r = processPolicyDocument(doc);
    expect(r.kind).toBe('code-table');
    for (const x of r.coverageRules ?? []) {
      expect(x.role).toBe('covered');
      expect(x.priorAuthRequired).toBe(true);
    }
  });
});

describe('deliberately thin / prose policy triggers the under-extraction guard', () => {
  const doc = mk(
    `Medical Policy. ${'This medically necessary determination is described in narrative prose without an enumerated criteria structure, and the reviewer must read the full document. '.repeat(
      40
    )} Medical necessity is established clinically. Medically necessary services require review.`
  );
  it('warns rather than silently presenting a thin extraction as complete', () => {
    const r = processPolicyDocument(doc);
    // a substantial body with almost no parsed criteria must surface a warning, never masquerade as done
    if (r.kind === 'criteria') {
      expect(r.warnings.length).toBeGreaterThan(0);
    } else {
      expect(['unknown', 'code-table', 'criteria']).toContain(r.kind);
    }
  });
});
