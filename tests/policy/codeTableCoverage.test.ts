/**
 * Code-table (Requirements By Product) path parity (Tier 2): the code-table path now emits CRD coverage
 * rules — every enumerated code is a covered·PA procedure, deduped, with a covered-pa default disposition
 * the maker can override. Generalized (synthetic, payer-agnostic).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeTableCoverage } from '@/lib/policy/crd/codeTableCoverage';
import type { ProductReviewSection } from '@/lib/policy/productReview';
import { processPolicyDocument } from '@/lib/policy/policyReview';
import { pdfToTextSource } from '@/lib/policy/server/pdfIntake';

const sections: ProductReviewSection[] = [
  {
    product: 'Plan A',
    procedures: [
      {
        procedure: 'Imaging',
        codes: [
          {
            code: '70551',
            codeSystem: 'CPT',
            description: 'MRI brain',
            confidence: 90,
            needsReview: false,
          },
          {
            code: '70552',
            codeSystem: 'CPT',
            description: 'MRI brain w/ contrast',
            confidence: 90,
            needsReview: false,
          },
        ],
      },
    ],
  },
  {
    product: 'Plan B',
    procedures: [
      {
        procedure: 'Imaging',
        // 70551 repeats across products — must dedupe to one rule
        codes: [
          {
            code: '70551',
            codeSystem: 'CPT',
            description: 'MRI brain',
            confidence: 88,
            needsReview: false,
          },
        ],
      },
    ],
  },
];

describe('codeTableCoverage', () => {
  it('emits one covered·PA rule per unique code, deduped across products', () => {
    const { rules, dispositions } = codeTableCoverage(sections, {
      policyId: 'p',
      policyTitle: 'Requirements By Product',
      canonical: 'urn:rhtp:dtr/Questionnaire/p',
    });
    expect(rules.map((r) => r.code).sort()).toEqual(['70551', '70552']);
    for (const r of rules) {
      expect(r.role).toBe('covered');
      expect(r.priorAuthRequired).toBe(true);
      expect(r.coverageInfo?.some((c) => c.code === 'covered')).toBe(true);
      expect(r.coverageInfo?.some((c) => c.code === 'prior-auth-required')).toBe(true);
    }
    expect(dispositions['70551']).toBe('covered-pa');
    expect(dispositions['70552']).toBe('covered-pa');
  });
});

describe('a code-table policy now produces CRD rules end-to-end (was empty)', () => {
  it('processPolicyDocument yields covered·PA coverage rules for a real Requirements By Product policy', async () => {
    const src = await pdfToTextSource(
      new Uint8Array(readFileSync('tests/fixtures/horizon.pdf')),
      'Horizon_Bariatric.pdf'
    );
    const review = processPolicyDocument(src);
    expect(review.kind).toBe('code-table');
    const rules = review.coverageRules ?? [];
    // was 0 before Tier 2 — the code-table path emitted no CRD rules at all (deduped across products)
    expect(rules.length).toBeGreaterThan(10);
    expect(rules.every((r) => r.role === 'covered' && r.priorAuthRequired)).toBe(true);
    // deduped: no code appears twice
    expect(new Set(rules.map((r) => r.code)).size).toBe(rules.length);
    // and every code carries a covered-pa default disposition the maker can override
    expect(Object.values(review.dispositions ?? {}).every((d) => d === 'covered-pa')).toBe(true);
  });
});
