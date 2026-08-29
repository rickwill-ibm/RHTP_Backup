/**
 * Real PDF intake — a genuine PDF (generated fixture) → text → records → determination-ready.
 * Proves the unpdf-backed reader and the full chain, not a fake.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pdfToTextSource, fileToTextSource } from '@/lib/policy/server/pdfIntake';
import { extractDocument } from '@/lib/policy/extract';
import { ingestRecord } from '@/lib/policy/ingest';

const pdfBytes = (): Uint8Array => new Uint8Array(readFileSync('tests/fixtures/sample-pa.pdf'));

describe('real PDF intake', () => {
  it('extracts the text layer of a real PDF', async () => {
    const src = await pdfToTextSource(pdfBytes(), 'horizon.pdf');
    expect(src.mimeType).toBe('application/pdf');
    expect(src.text).toContain('93451');
    expect(src.text).toContain('72148');
  });

  it('the extracted PDF flows through to determination-ready records', async () => {
    const src = await pdfToTextSource(pdfBytes(), 'horizon.pdf');
    const result = extractDocument(src);
    expect(result.kind).toBe('pa-list');
    const codes = (result.records[0].paItems as { codes: string[] }[]).flatMap((i) => i.codes);
    expect(codes).toEqual(expect.arrayContaining(['93451', '70450', '72148', 'E0250']));
    // first-line fallback names the source
    expect(result.records[0].source).toBe('Horizon NJ Health');
    const normalized = ingestRecord(result.records[0]);
    expect(normalized?.determinationBasis).toBe('code-on-pa-required-list');
    expect(normalized?.allPaCodes).toContain('72148');
  });

  it('fileToTextSource routes .txt bytes as plain text', async () => {
    const bytes = new TextEncoder().encode('Radiology\n70450, 72148');
    const src = await fileToTextSource(bytes, 'list.txt', 'text/plain');
    expect(src.mimeType).toBe('text/plain');
    expect(src.text).toContain('70450');
  });
});
