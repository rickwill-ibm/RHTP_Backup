/**
 * Adversarial corpus — the extractor must SKIP-AND-WARN, never hallucinate a code.
 * Every case here is designed to trick a naive extractor into inventing codes.
 */
import { describe, it, expect } from 'vitest';
import { extractDocument } from '@/lib/policy/extract';
import type { TextSource } from '@/lib/policy/extract';

const mk = (text: string): TextSource => ({
  sourceFile: 'adv.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

function allCodes(records: { codes?: unknown; paItems?: unknown }[]): string[] {
  const out: string[] = [];
  for (const r of records) {
    if (r.codes)
      for (const arr of Object.values(r.codes as Record<string, string[]>)) out.push(...arr);
    if (r.paItems) for (const it of r.paItems as { codes: string[] }[]) out.push(...it.codes);
  }
  return out;
}

describe('adversarial extraction', () => {
  it('empty and garbage documents yield no records', () => {
    expect(extractDocument(mk('')).records).toEqual([]);
    expect(extractDocument(mk('lorem ipsum dolor 2024 page 3 section 5')).records).toEqual([]);
  });

  it('prose full of code-shaped noise yields no codes', () => {
    const doc = mk(
      [
        'Prior Authorization Requirements',
        'See Table 5.10.2 on page 12 for details.',
        'Members in ZIP 90210 should note form 12345 is required.',
        'Call 1-800-555-1234 before 2024.',
      ].join('\n')
    );
    const result = extractDocument(doc);
    expect(allCodes(result.records)).toEqual([]);
    expect(result.records).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('header/footer/page-number bleed does not contaminate a real code block', () => {
    const doc = mk(
      [
        'Aetna',
        'Clinical Policy Bulletin: Test Policy',
        'Number: 0001',
        'Page 1 of 3 — Effective 2024',
        '',
        'CPT codes covered:',
        '33361',
        '',
        'Footer: see page 12, call 1-800-555-1234',
      ].join('\n')
    );
    const result = extractDocument(doc);
    expect(allCodes(result.records)).toEqual(['33361']);
  });

  it('a code split across a line break is never rejoined into a real code', () => {
    const doc = mk(['CPT codes covered:', '721-', '48'].join('\n'));
    const result = extractDocument(doc);
    expect(allCodes(result.records)).not.toContain('72148');
    expect(allCodes(result.records)).toEqual([]);
  });

  it('unicode/whitespace traps do not create phantom codes', () => {
    const doc = mk('Prior Authorization\n \u200B\uFEFF\nMiscellaneous notes only.\n');
    expect(allCodes(extractDocument(doc).records)).toEqual([]);
  });
});
