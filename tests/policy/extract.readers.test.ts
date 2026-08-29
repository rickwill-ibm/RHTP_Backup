/**
 * Reader seam — the one real reader works; injected fakes stand in for PDF/XLSX/OCR;
 * an unwired format fails loudly rather than silently producing nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  plainTextReader,
  makeReader,
  ReaderRegistry,
  ReaderNotWiredError,
} from '@/lib/policy/extract/readers';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('document readers', () => {
  it('plainTextReader decodes UTF-8 and normalizes CRLF + BOM', () => {
    const ts = plainTextReader.read(enc('\uFEFFa\r\nb'), 'x.txt', 'text/plain');
    expect(ts.text).toBe('a\nb');
    expect(ts.rawTextChars).toBe(3);
  });

  it('an injected fake reader stands in for a format the core does not parse', () => {
    const fakePdf = makeReader(
      'fake-pdf',
      (mt, fn) => mt === 'application/pdf' || /\.pdf$/i.test(fn),
      () => 'Radiology\n93451, 93452'
    );
    const reg = new ReaderRegistry();
    reg.register(fakePdf);
    const ts = reg.read(enc('binary-ignored'), 'policy.pdf', 'application/pdf');
    expect(ts.text).toContain('93451');
    expect(ts.sourceFile).toBe('policy.pdf');
  });

  it('an unwired format throws ReaderNotWiredError, not a silent empty read', () => {
    const reg = new ReaderRegistry();
    expect(() =>
      reg.read(
        enc('x'),
        'sheet.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    ).toThrow(ReaderNotWiredError);
  });
});
