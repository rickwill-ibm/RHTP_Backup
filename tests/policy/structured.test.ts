/**
 * Structured extractor — gated against the REAL Horizon Bariatric Surgery PA PDF.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pdfToTextSource } from '@/lib/policy/server/pdfIntake';
import { extractStructuredPolicy } from '@/lib/policy/extract/structured';
import { verifyAnchor } from '@/lib/policy/extract/provenance';

const bytes = (): Uint8Array => new Uint8Array(readFileSync('tests/fixtures/horizon.pdf'));

describe('structured extraction (real Horizon PDF)', () => {
  it('parses products → procedures → codes with confidence', async () => {
    const src = await pdfToTextSource(bytes(), 'Horizon_Bariatric.pdf');
    const policy = extractStructuredPolicy(src);

    expect(policy.title).toBe('Horizon Bariatric Surgery');
    expect(policy.policyNumber).toBe('22');
    expect(policy.products.map((p) => p.product)).toEqual(
      expect.arrayContaining([
        'Commercial',
        'Fide-Snp Coverage',
        'Medicaid Coverage',
        'Medicare Coverage',
      ])
    );
    expect(policy.codeCount).toBeGreaterThan(20);

    // a known high-confidence sleeve gastrectomy row
    const allCodes = policy.products.flatMap((p) => p.procedures.flatMap((pr) => pr.codes));
    const sleeve = allCodes.find((c) => c.code === '43775');
    expect(sleeve).toBeDefined();
    expect(sleeve?.description.toLowerCase()).toContain('sleeve gastrectomy');
    expect(sleeve?.confidence).toBeGreaterThan(90);

    // a known low-confidence row (the ones an expert must review)
    const low = allCodes.find(
      (c) => c.code === '43773' && c.confidence !== null && c.confidence < 20
    );
    expect(low).toBeDefined();

    // every provenance span slices back to its code
    for (const p of policy.provenance) expect(verifyAnchor(src.text, p)).toBe(true);
    expect(policy.provenance.length).toBeGreaterThan(20);
  });
});
