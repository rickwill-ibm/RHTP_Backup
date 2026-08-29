/**
 * Cross-reader differential — the same PA list read as plain text and via a fake
 * PDF reader that yields the same text must extract an identical code set. The
 * extraction logic is reader-independent by construction; this pins that.
 */
import { describe, it, expect } from 'vitest';
import { extractDocument } from '@/lib/policy/extract';
import { makeReader } from '@/lib/policy/extract/readers';

const TEXT = `Radiology
70450, 70486
Cardiology
93451, 93452
`;

function codesOf(records: { paItems?: unknown }[]): string[] {
  const out: string[] = [];
  for (const r of records) {
    if (r.paItems) for (const it of r.paItems as { codes: string[] }[]) out.push(...it.codes);
  }
  return out.sort();
}

describe('reader-independent extraction', () => {
  it('plain text and a fake PDF reader yield the same codes', () => {
    const viaText = extractDocument({
      sourceFile: 'a.txt',
      mimeType: 'text/plain',
      text: TEXT,
      rawTextChars: TEXT.length,
    });

    const fakePdf = makeReader(
      'fake-pdf',
      () => true,
      () => TEXT
    );
    const ts = fakePdf.read(new Uint8Array(), 'a.pdf', 'application/pdf');
    const viaPdf = extractDocument(ts);

    expect(codesOf(viaText.records)).toEqual(['70450', '70486', '93451', '93452']);
    expect(codesOf(viaPdf.records)).toEqual(codesOf(viaText.records));
  });
});
