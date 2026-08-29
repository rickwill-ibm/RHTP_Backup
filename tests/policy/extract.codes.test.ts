/**
 * Code recognizer — accepts real CPT/HCPCS/ICD-10, rejects code-shaped noise, and
 * proves the bare-CPT ambiguity is gated. Negative-heavy on purpose.
 */
import { describe, it, expect } from 'vitest';
import { classifyCode, scanCodes, isCodeOnlyLine } from '@/lib/policy/extract/codes';

describe('classifyCode — real codes', () => {
  it('recognizes distinctive shapes without needing a code region', () => {
    expect(classifyCode('J1745', false)).toBe('hcpcs');
    expect(classifyCode('A9270', false)).toBe('hcpcs');
    expect(classifyCode('0512T', false)).toBe('cpt'); // Category III
    expect(classifyCode('1234F', false)).toBe('cpt'); // Category II
    expect(classifyCode('I42.0', false)).toBe('icd10');
    expect(classifyCode('M17', false)).toBe('icd10');
  });

  it('accepts a bare 5-digit CPT ONLY inside a code region', () => {
    expect(classifyCode('72148', false)).toBeNull(); // could be a ZIP — refused in prose
    expect(classifyCode('72148', true)).toBe('cpt'); // accepted in a code list
  });

  it('rejects code-shaped noise', () => {
    for (const noise of ['2024', '12', '5', 'Table', '5.10.2', '800', '90', 'Page']) {
      expect(classifyCode(noise, true)).toBeNull();
    }
  });
});

describe('scanCodes', () => {
  it('finds codes with correct spans and never rejoins a line-broken code', () => {
    const text = '33361, 33362\n0512T';
    const found = scanCodes(text, true).map((m) => m.code);
    expect(found).toEqual(['33361', '33362', '0512T']);
    // a code split across a line break must NOT be silently rejoined
    expect(scanCodes('721-\n48', true).map((m) => m.code)).not.toContain('72148');
  });

  it('extracts nothing from prose even with bare-CPT allowed', () => {
    const prose = 'Call 1-800-555-1234 before 2024; see Table 5.10.2 on page 12.';
    expect(scanCodes(prose, true)).toEqual([]);
  });
});

describe('isCodeOnlyLine', () => {
  it('is true for a code table row, false for prose that mentions a number', () => {
    expect(isCodeOnlyLine('93451, 93452, 93453')).toBe(true);
    expect(isCodeOnlyLine('E0250, E0260')).toBe(true);
    expect(isCodeOnlyLine('Members in ZIP 90210 should note form 12345 is required.')).toBe(false);
    expect(isCodeOnlyLine('CPT codes covered:')).toBe(false);
  });
});
