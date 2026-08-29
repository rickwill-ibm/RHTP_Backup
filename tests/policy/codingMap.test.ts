/**
 * Coding-map seam — deterministic fallback flags codes for role assignment; the AI path is
 * config-gated and never selected unless configured; selection is env-driven.
 */
import { describe, it, expect } from 'vitest';
import { processPolicyDocument } from '@/lib/policy/policyReview';
import type { TextSource } from '@/lib/policy/extract/types';
import {
  deterministicCodingMap,
  aiCodingMap,
  aiCodingConfigFromEnv,
  selectCodingMap,
  CodingMapNotConfiguredError,
} from '@/lib/policy/review/codingMap';
import { reviewElementsFromPolicy } from '@/lib/policy/review/fromPolicyReview';

const TEXT =
  'Bariatric Surgery\nII. medically necessary when all of the following:\nA. sleeve\n' +
  'Coding\nCPT\n43775\n43644\nHCPCS\nS2083\n';
const review = () =>
  processPolicyDocument(
    {
      sourceFile: 'x.txt',
      mimeType: 'text/plain',
      text: TEXT,
      rawTextChars: TEXT.length,
    } as TextSource,
    { tenant: 'T' }
  );

describe('deterministic coding-map', () => {
  it('flags every extracted procedure code for role assignment, invents no diagnoses', () => {
    const contrib = deterministicCodingMap.propose(review());
    expect(Object.keys(contrib.flags ?? {}).sort()).toEqual(['43644', '43775', 'S2083']);
    expect(contrib.flags?.['43775']?.severity).toBe('verify');
    expect(contrib.diagnoses ?? []).toEqual([]);
    expect(contrib.roles ?? {}).toEqual({});
  });

  it('flows into review elements so procedures surface as needs-review', () => {
    const r = review();
    const els = reviewElementsFromPolicy(r, deterministicCodingMap.propose(r));
    expect(
      els.filter((e) => e.kind === 'procedure').every((e) => e.flag?.severity === 'verify')
    ).toBe(true);
  });
});

describe('AI coding-map config + selection', () => {
  it('is unconfigured without an endpoint, configured with endpoint + key', () => {
    expect(aiCodingConfigFromEnv({}).configured).toBe(false);
    expect(aiCodingConfigFromEnv({ ANTHROPIC_API_KEY: 'k' }).configured).toBe(false);
    expect(
      aiCodingConfigFromEnv({ AI_CODING_ENDPOINT: 'https://x', ANTHROPIC_API_KEY: 'k' }).configured
    ).toBe(true);
    // falls back to the AI_DTR endpoint
    expect(
      aiCodingConfigFromEnv({ AI_DTR_ENDPOINT: 'https://y', ANTHROPIC_API_KEY: 'k' }).configured
    ).toBe(true);
  });

  it('selects deterministic when unconfigured, AI when configured', () => {
    expect(selectCodingMap({ configured: false, hasKey: false }).provider.id).toBe('deterministic');
    expect(
      selectCodingMap({ configured: true, hasKey: true, endpoint: 'https://x' }).provider.id
    ).toBe('ai');
  });

  it('the AI provider throws until wired', () => {
    expect(() => aiCodingMap.propose(review())).toThrow(CodingMapNotConfiguredError);
  });
});
