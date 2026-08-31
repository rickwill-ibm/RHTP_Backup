/**
 * PolicyProfile seam + silent-under-extraction guard.
 *
 * The seam is the ONLY sanctioned place a payer/state may be recognized, and it only pre-normalizes
 * INPUT into the general extractor's shape. With no profile registered the engine is payer-agnostic
 * (generic identity). The guard warns when a substantial document extracts suspiciously few criteria.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  genericProfile,
  selectProfile,
  applyProfile,
  registerProfile,
  registeredProfiles,
  __resetProfilesForTest,
} from '@/lib/policy/profile/policyProfile';
import { processPolicyDocument } from '@/lib/policy/policyReview';
import type { TextSource } from '@/lib/policy/extract/types';

const mk = (text: string): TextSource => ({
  sourceFile: 'x.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

afterEach(() => __resetProfilesForTest());

describe('policy profile seam', () => {
  it('defaults to the generic identity profile — payer-agnostic, text unchanged', () => {
    const src = mk('Medically Necessary:\nA. The member is age 18 or older.');
    expect(selectProfile(src).id).toBe('generic');
    expect(applyProfile(src).src).toBe(src); // identity — same reference
    expect(registeredProfiles().length).toBe(0);
  });

  it('selects a registered profile that detects the document and pre-normalizes input', () => {
    registerProfile({
      id: 'demo-payer',
      detect: (s) => /ACME HEALTH PLAN/.test(s.text),
      // canonicalize the payer's heading onto the generic marker the extractor understands
      normalizeText: (s) => ({
        ...s,
        text: s.text.replace(/Coverage Criteria:/g, 'Medically Necessary:'),
      }),
    });
    const src = mk('ACME HEALTH PLAN\nCoverage Criteria:\nA. Age 18 or older.');
    expect(selectProfile(src).id).toBe('demo-payer');
    expect(applyProfile(src).src.text).toContain('Medically Necessary:');
    expect(applyProfile(src).src.text).not.toContain('Coverage Criteria:');
    // a document the profile does NOT recognize still flows through the generic floor
    expect(selectProfile(mk('some other policy')).id).toBe('generic');
  });

  it('registration is idempotent by id', () => {
    registerProfile(genericProfile);
    registerProfile(genericProfile);
    expect(registeredProfiles().filter((p) => p.id === 'generic').length).toBe(1);
  });
});

describe('silent under-extraction guard', () => {
  it('warns when a substantial medical-necessity document yields very few criteria', () => {
    // Prose-style necessity with cues but no enumerated criteria the parser can walk.
    const prose =
      'Medical Necessity. This service is considered medically necessary when the treating provider ' +
      'documents that conservative therapy has failed and the member meets clinical thresholds. '.repeat(
        90
      ) +
      ' Medically necessary. Medically necessary.';
    const r = processPolicyDocument(mk(prose));
    expect(r.stats.criteria ?? 0).toBeLessThanOrEqual(2);
    expect(r.warnings.some((w) => /Extraction looks thin/i.test(w))).toBe(true);
  });
});
