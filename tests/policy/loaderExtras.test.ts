/**
 * S1 tests for the CSV loader and the OCR seam. OCR is exercised with the deterministic fake
 * engine (the real tesseract.js engine is verified offline separately and runs in an
 * integration lane); an OCR'd image round-trips through the S0 anchoring spine.
 */
import { describe, it, expect } from 'vitest';
import {
  builtinCapture,
  makeBuiltinCapture,
  csvToCanonicalText,
  parseCsv,
  type RawDoc,
} from '@/lib/policy/loader/capture';
import { fakeOcrEngine } from '@/lib/policy/loader/ocr';
import { makeSpan, verifyAnchor, type CanonicalRef } from '@/lib/policy/anchor/verify';

function raw(bytes: Uint8Array, mime: string): RawDoc {
  return { docId: 'd', sourceFile: 'f', bytes, mime, provenanceClass: 'authoritative' };
}
const enc = (s: string) => new TextEncoder().encode(s);

describe('CSV loader', () => {
  it('parses quoted fields containing commas and newlines', () => {
    const rows = parseCsv('code,desc\n43775,"gastrectomy, sleeve"\n');
    expect(rows).toEqual([
      ['code', 'desc'],
      ['43775', 'gastrectomy, sleeve'],
    ]);
  });

  it('renders CSV to canonical text (row per line, cells joined)', () => {
    const text = csvToCanonicalText('code,pa\n43775,yes');
    expect(text).toBe('code | pa\n43775 | yes');
  });

  it('loads text/csv through the builtin provider', async () => {
    const doc = await builtinCapture.load(raw(enc('a,b\n1,2'), 'text/csv'));
    expect(doc.text).toBe('a | b\n1 | 2');
  });
});

describe('OCR seam (fake engine)', () => {
  it('OCRs an image into a CanonicalDoc via the injected engine', async () => {
    const cap = makeBuiltinCapture({ ocr: fakeOcrEngine('BMI 40 CPT 43775') });
    const doc = await cap.load(raw(enc('fake-png-bytes'), 'image/png'));
    expect(doc.text).toBe('BMI 40 CPT 43775');
  });

  it('ROUND-TRIP: an anchor minted from OCR text verifies through the S0 spine', async () => {
    const cap = makeBuiltinCapture({
      ocr: fakeOcrEngine('Bariatric surgery covered when BMI >= 40.'),
    });
    const doc = await cap.load(raw(enc('img'), 'image/png'));
    const start = doc.text.indexOf('BMI >= 40');
    const span = makeSpan(doc as CanonicalRef, start, start + 'BMI >= 40'.length);
    expect(
      verifyAnchor({ anchorId: 'a', provenanceClass: 'authoritative', spans: [span] }, [
        doc as CanonicalRef,
      ]).ok
    ).toBe(true);
  });

  it('refuses an image when no OCR engine is configured (fail closed)', async () => {
    await expect(builtinCapture.load(raw(enc('img'), 'image/png'))).rejects.toThrow(
      /requires an OCR engine/
    );
  });
});
