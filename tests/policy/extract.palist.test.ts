/**
 * Gold fixture — payer PA-requirement list. Expected records authored by hand.
 */
import { describe, it, expect } from 'vitest';
import { extractDocument } from '@/lib/policy/extract';
import { findBrokenAnchors } from '@/lib/policy/extract/provenance';
import { ingestRecord } from '@/lib/policy/ingest';

const PA_LIST = `UnitedHealthcare Community Plan — Texas
Prior Authorization Requirements
Effective January 1, 2025

Cardiology
93451, 93452, 93453

Radiology (Advanced Imaging)
70450, 70486, 72148

Durable Medical Equipment
E0250, E0260
`;

describe('PA-list extraction (gold)', () => {
  const src = {
    sourceFile: 'uhc-tx.txt',
    mimeType: 'text/plain',
    text: PA_LIST,
    rawTextChars: PA_LIST.length,
  };
  const result = extractDocument(src, { plan: 'UnitedHealthcare Community Plan — Texas' });

  it('classifies as a PA list with three categories', () => {
    expect(result.kind).toBe('pa-list');
    const items = result.records[0].paItems as { category: string; codes: string[] }[];
    expect(items.map((i) => i.category)).toEqual([
      'Cardiology',
      'Radiology (Advanced Imaging)',
      'Durable Medical Equipment',
    ]);
  });

  it('matches the hand-authored codes per category and effective date', () => {
    const items = result.records[0].paItems as {
      category: string;
      codes: string[];
      effectiveDate: string | null;
    }[];
    expect(items[0].codes).toEqual(['93451', '93452', '93453']);
    expect(items[1].codes).toEqual(['70450', '70486', '72148']);
    expect(items[2].codes).toEqual(['E0250', 'E0260']);
    expect(items[0].effectiveDate).toBe('January 1, 2025');
  });

  it('detects the UHC source and all provenance verifies', () => {
    expect(result.records[0].source).toBe('UnitedHealthcare');
    expect(findBrokenAnchors(src.text, result.provenance)).toEqual([]);
  });

  it('routes to the UHC adapter and rebuilds allPaCodes', () => {
    const normalized = ingestRecord(result.records[0]);
    expect(normalized).not.toBeNull();
    if (normalized) {
      expect(normalized.source).toBe('UnitedHealthcare');
      expect(normalized.determinationBasis).toBe('code-on-pa-required-list');
      expect(normalized.allPaCodes).toContain('72148');
      expect(normalized.allPaCodes).toContain('E0250');
    }
  });
});
