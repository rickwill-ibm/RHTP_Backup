/**
 * Discrete documentation items (1c-A): a documentation-requirement criterion emits an attestation
 * boolean + its OWN targeted attachment + an optional typed datum, instead of draining into one shared
 * catch-all. Generalized (synthetic, payer-agnostic); the catch-all remains a fallback when a policy
 * has no documentation criteria.
 */
import { describe, it, expect } from 'vitest';
import { engineQuestionnaireItems } from '@/lib/policy/dtr/engineQuestionnaireItems';
import { buildDocDatum } from '@/lib/policy/encode/documentation';
import { extractCriteriaPolicy } from '@/lib/policy/extract/criteria';
import type { TextSource } from '@/lib/policy/extract/types';

describe('complication enumeration parses to clean, de-duplicated options (payer-agnostic)', () => {
  const opts = (text: string): string[] =>
    (buildDocDatum(text)?.options ?? []).map((o) => o.display.toLowerCase());

  it('strips a comma-split "including, but not limited to," lead-in', () => {
    const o = opts(
      'a complication (including, but not limited to, obstruction, stricture or leak)'
    );
    expect(o).toContain('obstruction');
    expect(o).toContain('stricture');
    expect(o).toContain('leak');
    expect(o).not.toContain('including');
    expect(o).not.toContain('but not limited to');
    expect(o).toContain('other'); // open enumeration
  });

  it('handles "such as … and/or …" without a parenthetical and without dropping the first item', () => {
    const o = opts('Documentation of a complication such as obstruction and/or stricture and leak');
    expect(o).toEqual(expect.arrayContaining(['obstruction', 'stricture', 'leak']));
  });

  it('de-duplicates repeated tokens', () => {
    const o = opts('a complication (obstruction, obstruction, stricture)');
    expect(o.filter((x) => x === 'obstruction')).toHaveLength(1);
  });
});

const mk = (text: string): TextSource => ({
  sourceFile: 'p.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

describe('documentation criteria become discrete evidence items', () => {
  const doc = mk(
    [
      'Clinical UM Guideline',
      'Medically Necessary:',
      'The procedure is medically necessary when all of the following are met:',
      'A. Pre-operative medical and mental health evaluation and clearance is documented; and',
      'B. Documentation of a complication related to the initial procedure (including but not limited to, obstruction, stricture or documented GERD).',
      'Coding',
      '43775 procedure',
      'References',
    ].join('\n')
  );
  const cp = extractCriteriaPolicy(doc);
  const items =
    engineQuestionnaireItems(cp.medicallyNecessary, { service: 'Svc', codes: cp.codes }) ?? [];

  it('emits per-requirement attachments, not a single shared catch-all', () => {
    const attachments = items.filter((i) => i.type === 'attachment');
    expect(attachments.length).toBeGreaterThanOrEqual(2);
    // each discrete attachment is tied to its own attestation (linkId '<crit>.evidence')
    expect(attachments.some((a) => a.linkId.endsWith('.evidence'))).toBe(true);
    // the generic catch-all is SUPPRESSED because discrete documentation attachments exist
    expect(items.some((i) => i.linkId === 'clinical-documentation')).toBe(false);
  });

  it('each documentation requirement has an attestation boolean that still gates', () => {
    // attestation booleans are present (they remain BoolExpr leaves that gate the determination)
    const booleans = items.filter((i) => i.type === 'boolean');
    expect(booleans.length).toBeGreaterThanOrEqual(2);
  });

  it('a named-complication requirement becomes a coded open-choice, not free text', () => {
    const choice = items.find(
      (i) => i.type === 'choice' && /complication|obstruction|stricture|gerd/i.test(i.text)
    );
    // the complication datum is an (open) choice built from the criterion's own named tokens
    const complicationDatum = items.find((i) => i.linkId.endsWith('.datum') && i.answerOption);
    expect(complicationDatum).toBeTruthy();
    const labels = complicationDatum?.answerOption?.map((o) => o.label?.toLowerCase() ?? '') ?? [];
    expect(labels.some((l) => l.includes('obstruction'))).toBe(true);
    expect(labels.some((l) => l.includes('stricture'))).toBe(true);
    expect(choice || complicationDatum).toBeTruthy();
  });
});

describe('a policy with NO documentation criteria keeps the catch-all fallback', () => {
  const doc = mk(
    [
      'Clinical UM Guideline',
      'Medically Necessary:',
      'Medically necessary when all of the following are met:',
      '1. Age 18 or older; and',
      '2. BMI greater than 40.',
      'Coding',
      '43775 procedure',
      'References',
    ].join('\n')
  );
  it('appends the generic clinical-documentation upload', () => {
    const cp = extractCriteriaPolicy(doc);
    const items = engineQuestionnaireItems(cp.medicallyNecessary, { service: 'Svc' }) ?? [];
    expect(items.some((i) => i.linkId === 'clinical-documentation')).toBe(true);
  });
});
