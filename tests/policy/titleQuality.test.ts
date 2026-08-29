/**
 * Title quality — the fallback skips OCR/scan junk (replacement chars, symbol-only lines) and
 * picks the first line that reads like a real title.
 */
import { describe, it, expect } from 'vitest';
import { extractCriteriaPolicy } from '@/lib/policy/extract/criteria';
import type { TextSource } from '@/lib/policy/extract/types';

const src = (text: string): TextSource => ({
  sourceFile: 'x.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

describe('title fallback quality', () => {
  it('skips OCR junk lines and picks the first meaningful title', () => {
    const cp = extractCriteriaPolicy(
      src('◄ &lnl\nHorizon. T. �\nBariatric Surgery\nPolicy Number: 022\n')
    );
    expect(cp.title).toBe('Bariatric Surgery');
  });

  it('still honors an explicit Subject: line', () => {
    const cp = extractCriteriaPolicy(src('◄ junk\nSubject: Knee Arthroscopy\nBody'));
    expect(cp.title).toBe('Knee Arthroscopy');
  });
});
