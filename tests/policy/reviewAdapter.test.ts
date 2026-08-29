/**
 * PolicyReview → encoding-review element adapter: procedure codes + criteria come from
 * deterministic extraction (explicit); diagnoses/roles/flags come from the coding-map contribution.
 */
import { describe, it, expect } from 'vitest';
import { processPolicyDocument } from '@/lib/policy/policyReview';
import type { TextSource } from '@/lib/policy/extract/types';
import { reviewElementsFromPolicy } from '@/lib/policy/review/fromPolicyReview';
import { buildEncodingReview } from '@/lib/policy/review/encodingReview';

const TEXT =
  'Bariatric Surgery\n' +
  'II. Bariatric surgery is considered medically necessary when ALL of the following are met:\n' +
  'A. The procedure is one of the following types:\n' +
  '1. Laparoscopic sleeve gastrectomy\n' +
  'B. The member is at least 18 years of age\n' +
  'Coding\nCPT\n43775\n43644\nHCPCS\nS2083\n';

const review = () =>
  processPolicyDocument(
    {
      sourceFile: 'x.txt',
      mimeType: 'text/plain',
      text: TEXT,
      rawTextChars: TEXT.length,
    } as TextSource,
    { tenant: 'Test' }
  );

describe('reviewElementsFromPolicy', () => {
  it('maps explicit procedure codes and criteria from extraction', () => {
    const els = reviewElementsFromPolicy(review());
    const procs = els.filter((e) => e.kind === 'procedure');
    expect(procs.map((p) => p.code).sort()).toEqual(['43644', '43775', 'S2083']);
    expect(procs.every((p) => p.confidence === 'explicit')).toBe(true);
    expect(procs.every((p) => p.role === undefined)).toBe(true); // no roles pre-coding-map
    expect(els.some((e) => e.kind === 'criterion')).toBe(true);
  });

  it('applies coding-map roles, flags, diagnoses and gated items', () => {
    const els = reviewElementsFromPolicy(review(), {
      roles: { '43775': 'covered', '43842': 'not-covered' },
      flags: { '43775': { severity: 'verify', message: 'confirm role' } },
      diagnoses: [
        {
          system: 'icd10',
          code: 'I10',
          label: 'Hypertension',
          flag: { severity: 'defect', message: 'refractory not codeable' },
        },
        { system: 'icd10', code: 'Z68.41', label: 'BMI 40' },
      ],
      gatedItems: [{ id: 'gate-diet', label: 'Supervised program' }],
    });

    const sleeve = els.find((e) => e.code === '43775');
    expect(sleeve?.role).toBe('covered');
    expect(sleeve?.flag?.severity).toBe('verify');

    const dx = els.filter((e) => e.kind === 'diagnosis');
    expect(dx.map((d) => d.code).sort()).toEqual(['I10', 'Z68.41']);
    expect(dx.every((d) => d.confidence === 'mapped')).toBe(true);
    expect(els.find((e) => e.code === 'I10')?.flag?.severity).toBe('defect');

    const gated = els.filter((e) => e.kind === 'gated');
    expect(gated).toHaveLength(1);
    expect(gated[0].gated).toBe(true);
  });

  it('feeds cleanly into buildEncodingReview (defect surfaces, explicit clean)', () => {
    const els = reviewElementsFromPolicy(review(), {
      diagnoses: [
        {
          system: 'icd10',
          code: 'I10',
          label: 'HTN',
          flag: { severity: 'defect', message: 'x' },
        },
      ],
    });
    const secs = buildEncodingReview(els);
    const all = secs.flatMap((s) => s.elements);
    expect(all.find((e) => e.code === 'I10')?.flag?.severity).toBe('defect');
    expect(secs.map((s) => s.key)).toContain('procedure');
    expect(secs.map((s) => s.key)).toContain('diagnosis');
  });
});
