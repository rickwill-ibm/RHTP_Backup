/**
 * Gold fixture — Aetna CPB. The expected record below is authored by reading the
 * document by hand; the extractor never sees this answer key. This is the
 * anti-tautology guarantee: the test fails if the extractor drifts from an
 * independent human reading, not merely from its own past output.
 */
import { describe, it, expect } from 'vitest';
import { extractDocument } from '@/lib/policy/extract';
import { findBrokenAnchors } from '@/lib/policy/extract/provenance';
import { ingestRecord } from '@/lib/policy/ingest';

const CPB = `Aetna
Clinical Policy Bulletin: Transcatheter Aortic Valve Replacement
Number: 0912

Policy

I. Medical Necessity
Aetna considers TAVR medically necessary for members who meet all of the following:
A. Severe symptomatic aortic stenosis; or
B. Documented surgical risk assessment; or
C. Heart team evaluation completed.

CPT codes covered if selection criteria are met:
33361, 33362

CPT codes not covered (experimental / investigational):
0483T

HCPCS codes covered:
C9600

ICD-10 codes covered:
I35.0, I35.2
`;

describe('Aetna CPB extraction (gold)', () => {
  const src = {
    sourceFile: 'tavr.txt',
    mimeType: 'text/plain',
    text: CPB,
    rawTextChars: CPB.length,
  };
  const result = extractDocument(src);

  it('classifies as an Aetna CPB and produces one record', () => {
    expect(result.kind).toBe('aetna-cpb');
    expect(result.records).toHaveLength(1);
  });

  it('matches the hand-authored code buckets exactly', () => {
    const codes = result.records[0].codes as Record<string, string[]>;
    expect(codes.cptCovered).toEqual(['33361', '33362']);
    expect(codes.cptNotCovered).toEqual(['0483T']);
    expect(codes.hcpcsCovered).toEqual(['C9600']);
    expect(codes.icd10Covered).toEqual(['I35.0', 'I35.2']);
    expect(codes.hcpcsNotCovered).toEqual([]);
    expect(codes.icd10NotCovered).toEqual([]);
  });

  it('extracts number, title, and the three indications', () => {
    const r = result.records[0];
    expect(r.number).toBe('0912');
    expect(r.title).toBe('Transcatheter Aortic Valve Replacement');
    const inds = r.indications as { label: string; title: string }[];
    expect(inds.map((i) => i.label)).toEqual(['A', 'B', 'C']);
    expect(inds[0].title).toBe('Severe symptomatic aortic stenosis');
    expect(inds[2].title).toBe('Heart team evaluation completed');
  });

  it('emits no warnings and all provenance verifies', () => {
    expect(result.warnings).toEqual([]);
    expect(findBrokenAnchors(src.text, result.provenance)).toEqual([]);
    expect(result.provenance.length).toBeGreaterThan(0);
  });

  it('the real Aetna adapter normalizes the extracted record', () => {
    const normalized = ingestRecord(result.records[0]);
    expect(normalized).not.toBeNull();
    if (normalized) {
      expect(normalized.source).toBe('Aetna');
      expect(normalized.requiresPA).toBe(true);
      expect(normalized.determinationBasis).toBe('medical-necessity-criteria');
    }
  });
});
