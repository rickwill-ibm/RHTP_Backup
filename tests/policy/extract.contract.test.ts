/**
 * Adapter-contract + coverage tests surfaced by the adversarial pass:
 *  - an Aetna PA list must route to the PA adapter, NOT the CPB adapter (the fixed mis-routing);
 *  - a non-UHC agency PA list routes to the generic adapter with its real source;
 *  - a category whose codes span multiple lines keeps all of them;
 *  - provenance VALUES actually equal the record's codes (verifyAnchor alone is self-consistent,
 *    so this is the check that a span points at the right code, not just at itself).
 */
import { describe, it, expect } from 'vitest';
import { extractDocument } from '@/lib/policy/extract';
import { ingestRecord } from '@/lib/policy/ingest';
import type { TextSource } from '@/lib/policy/extract';

const mk = (text: string): TextSource => ({
  sourceFile: 'c.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

describe('adapter routing (regression: Aetna PA list must not become a CPB)', () => {
  it('an Aetna PA list routes to a PA adapter and keeps its codes', () => {
    const doc = mk(
      [
        'Aetna Better Health',
        'Prior Authorization Requirements',
        'Effective 01/01/2025',
        '',
        'Radiology',
        '70450, 72148',
      ].join('\n')
    );
    const result = extractDocument(doc);
    expect(result.kind).toBe('pa-list');
    expect(result.records[0].source).toBe('Aetna');

    const normalized = ingestRecord(result.records[0]);
    expect(normalized).not.toBeNull();
    if (normalized) {
      // The bug would have produced determinationBasis medical-necessity-criteria + requiresPA false.
      expect(normalized.determinationBasis).toBe('code-on-pa-required-list');
      expect(normalized.requiresPA).toBe(true);
      expect(normalized.allPaCodes).toContain('72148');
    }
  });

  it('a non-UHC agency PA list routes to the generic adapter with its real source', () => {
    const doc = mk(
      [
        'Texas Medicaid',
        'Prior Authorization Requirements',
        '',
        'Behavioral Health',
        '90791, 90792',
      ].join('\n')
    );
    const result = extractDocument(doc);
    expect(result.records[0].source).toBe('Texas Medicaid');
    const normalized = ingestRecord(result.records[0]);
    expect(normalized?.source).toBe('Texas Medicaid');
    expect(normalized?.determinationBasis).toBe('code-on-pa-required-list');
  });
});

describe('multi-line code block within one category', () => {
  it('keeps codes that continue onto the next line', () => {
    const doc = mk(['Cardiology', '93451, 93452', '93453, 93454'].join('\n'));
    const result = extractDocument(doc);
    const items = result.records[0].paItems as { codes: string[] }[];
    expect(items[0].codes).toEqual(['93451', '93452', '93453', '93454']);
  });
});

describe('provenance values equal the record codes (not just self-consistent)', () => {
  it('every extracted PA code has a provenance entry whose value is that code', () => {
    const doc = mk(['Radiology', '70450, 72148', 'Cardiology', '93451'].join('\n'));
    const result = extractDocument(doc);
    const recordCodes = (result.records[0].paItems as { codes: string[] }[]).flatMap(
      (i) => i.codes
    );
    const provValues = result.provenance.map((p) => p.value.toUpperCase());
    for (const code of recordCodes) {
      expect(provValues).toContain(code);
    }
    // and every provenance slice really is that substring of the source
    for (const p of result.provenance) {
      expect(doc.text.slice(p.span.start, p.span.end)).toBe(p.value);
    }
  });
});
