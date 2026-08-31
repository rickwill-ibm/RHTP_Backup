/**
 * Requirement-table code harvest (generalized). PA-requirement / code-list policies lay codes out in
 * ways the line-start harvester misses: a leading ROW INDEX before the code, MANY codes per line, and
 * wide table headers. This pins the harvest for those layouts on payer-agnostic synthetic fixtures —
 * AND pins the fail-closed guard: outside a requirements/code-table context, a 5-digit number in prose
 * is never fabricated into a code. Grounded in the real horizon.pdf / sample-pa.pdf formats.
 */
import { describe, it, expect } from 'vitest';
import { extractCriteriaPolicy } from '@/lib/policy/extract/criteria';
import type { TextSource } from '@/lib/policy/extract/types';

const mk = (text: string): TextSource => ({
  sourceFile: 'x.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});
const codes = (t: string): string[] => extractCriteriaPolicy(mk(t)).codes.map((c) => c.code);

describe('requirement-table code harvest', () => {
  it('harvests codes with a LEADING ROW INDEX under a wide CPT/HCPCS table header', () => {
    const got = codes(
      [
        'Requirements By Product',
        'All of the items listed below are required to have prior authorization.',
        'CPT/HCPCS Description Confidence (%)',
        '1 43770 Laparoscopy, surgical, gastric restrictive procedure',
        '2 43775 Sleeve gastrectomy',
      ].join('\n')
    );
    expect(got).toEqual(expect.arrayContaining(['43770', '43775']));
    // the single-code rows keep a description
    const desc = extractCriteriaPolicy(
      mk('Prior Authorization Requirements\n1 43770 Laparoscopy, surgical')
    ).codes.find((c) => c.code === '43770')?.description;
    expect(desc?.toLowerCase()).toContain('laparoscopy');
  });

  it('harvests MULTIPLE comma-separated codes per line, including HCPCS', () => {
    const got = codes(
      [
        'Prior Authorization Requirements',
        'Cardiology',
        '93451, 93452, 93453',
        'Radiology (Advanced Imaging)',
        '70450, 72148',
        'Durable Medical Equipment',
        'E0250, E0260',
      ].join('\n')
    );
    expect(got).toEqual(
      expect.arrayContaining(['93451', '93452', '93453', '70450', '72148', 'E0250', 'E0260'])
    );
    const sys = extractCriteriaPolicy(
      mk('Prior Authorization Requirements\nDME\nE0250, E0260')
    ).codes.find((c) => c.code === 'E0250')?.codeSystem;
    expect(sys).toBe('HCPCS');
  });

  it('FAIL-CLOSED: 5-digit numbers in prose with no requirements context are not harvested', () => {
    expect(codes('The study enrolled 12345 patients over 67890 visits in 43770 sites.')).toEqual(
      []
    );
  });

  it('stops harvesting once a References/Rationale section begins', () => {
    const got = codes(
      [
        'Prior Authorization Requirements',
        '93451',
        'References',
        'Smith et al. reported 70450 cases in a 2019 cohort.',
      ].join('\n')
    );
    expect(got).toContain('93451');
    expect(got).not.toContain('70450'); // after References — out of context
  });
});
