/**
 * DTR generator — built ONLY from extracted content, and proven to generalize:
 * the SAME extractor+generator handles a real Horizon PDF and a synthetic,
 * differently-worded "Requirements By Product" policy with no code changes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pdfToTextSource } from '@/lib/policy/server/pdfIntake';
import { extractStructuredPolicy } from '@/lib/policy/extract/structured';
import { buildPolicyDtr } from '@/lib/policy/policyDtr';
import type { TextSource } from '@/lib/policy/extract';

const horizonBytes = (): Uint8Array => new Uint8Array(readFileSync('tests/fixtures/horizon.pdf'));

// A DIFFERENT payer, different products, procedures, codes — same layout grammar.
const ELEVANCE: TextSource = {
  sourceFile: 'elevance-msk.txt',
  mimeType: 'text/plain',
  rawTextChars: 0,
  text: `Elevance Musculoskeletal Surgery
Policy Summary
Category: Orthopedics Policy Number: 118 Section Type: Surgery
Requirements By Product
Commercial
Lumbar Spinal Fusion
CPT/HCPCS Description Confidence (%)
1 22551 Arthrodesis, anterior interbody, including disc space preparation, cervical below C2 95.2
2 22552 Arthrodesis, anterior interbody, each additional interspace 12.4
Total Knee Arthroplasty
CPT/HCPCS Description Confidence (%)
1 27447 Arthroplasty, knee, condyle and plateau; medial AND lateral compartments 98.1
Medicaid
Total Knee Arthroplasty
CPT/HCPCS Description Confidence (%)
1 27447 Arthroplasty, knee, condyle and plateau; medial AND lateral compartments 99.0
`,
};

describe('DTR generator — Horizon (real PDF)', () => {
  it('produces a draft DTR grouped by product/procedure with confidence + review flags', async () => {
    const src = await pdfToTextSource(horizonBytes(), 'Horizon_Bariatric.pdf');
    const dtr = buildPolicyDtr(extractStructuredPolicy(src));

    expect(dtr.status).toBe('draft');
    expect(dtr.title).toBe('DTR — Horizon Bariatric Surgery');
    expect(dtr.sections.map((s) => s.product)).toEqual(
      expect.arrayContaining([
        'Commercial',
        'Fide-Snp Coverage',
        'Medicaid Coverage',
        'Medicare Coverage',
      ])
    );
    expect(dtr.stats.codes).toBe(46);
    // low-confidence rows (e.g. 43773@2.6) are flagged for the expert
    expect(dtr.stats.flaggedForReview).toBeGreaterThan(0);
    const allCodes = dtr.sections.flatMap((s) => s.procedures.flatMap((p) => p.codes));
    const low = allCodes.find((c) => c.code === '43773' && (c.confidence ?? 100) < 20);
    expect(low?.needsReview).toBe(true);
    const high = allCodes.find((c) => c.code === '43775' && (c.confidence ?? 0) > 90);
    expect(high?.needsReview).toBe(false);
    // one boolean per procedure + one documentation item
    expect(dtr.item.some((i) => i.linkId === 'clinical-documentation')).toBe(true);
  });
});

describe('DTR generator — generalization (non-Horizon policy, no code changes)', () => {
  it('parses a different payer/procedure/code set into a correct DTR', () => {
    const dtr = buildPolicyDtr(extractStructuredPolicy(ELEVANCE));

    expect(dtr.title).toBe('DTR — Elevance Musculoskeletal Surgery');
    expect(dtr.policyNumber).toBe('118');
    expect(dtr.sections.map((s) => s.product)).toEqual(['Commercial', 'Medicaid']);

    const commercial = dtr.sections.find((s) => s.product === 'Commercial');
    expect(commercial?.procedures.map((p) => p.procedure)).toEqual([
      'Lumbar Spinal Fusion',
      'Total Knee Arthroplasty',
    ]);
    const fusion = commercial?.procedures.find((p) => p.procedure === 'Lumbar Spinal Fusion');
    expect(fusion?.codes.map((c) => `${c.code}@${c.confidence}`)).toEqual([
      '22551@95.2',
      '22552@12.4',
    ]);
    // the low-confidence add-on code is flagged, the primary is not
    expect(fusion?.codes.find((c) => c.code === '22552')?.needsReview).toBe(true);
    expect(fusion?.codes.find((c) => c.code === '22551')?.needsReview).toBe(false);
    // Commercial: fusion (22551, 22552) + knee (27447); Medicaid: knee (27447) = 4
    expect(dtr.stats.codes).toBe(4);
  });
});
