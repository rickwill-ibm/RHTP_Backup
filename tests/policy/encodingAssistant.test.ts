/**
 * Encoding-assistant seam tests. Invariants: temperature-0 pinned; the citation whitelist is
 * enforced (an answer citing something outside the context is stripped and marked ungrounded); the
 * deterministic fallback answers only from the document and never guesses; provider selection rides
 * the shared coding-map env gate.
 */
import { describe, it, expect } from 'vitest';
import {
  buildAssistantRequest,
  parseAssistantResponse,
  deterministicAnswer,
  selectAssistantMode,
  buildAssistantContext,
  DETERMINISTIC_DECODING,
  ASSISTANT_PROMPT_VERSION,
  type AssistantContext,
} from '@/lib/policy/assistant/encodingAssistant';
import type { PolicyReview } from '@/lib/policy/policyReview';

const ctx: AssistantContext = {
  policyId: 'horizon/bariatric',
  title: 'Bariatric Surgery',
  codes: [
    { code: '43644', system: 'CPT', role: 'covered' },
    { code: 'S2083', system: 'HCPCS' },
  ],
  sections: [{ label: 'II.C', text: 'BMI > 40, or BMI 35-40 with a qualifying comorbidity.' }],
  provenance: [{ value: '43644', snippet: 'Laparoscopic gastric bypass' }],
  codingMap: [{ code: '43644', note: 'proposed role covered' }],
};

describe('buildAssistantRequest — pinned + grounded', () => {
  it('pins temperature 0 / top_p 1 and stamps the prompt version', () => {
    const req = buildAssistantRequest('What qualifies?', ctx);
    expect(req.temperature).toBe(0);
    expect(req.top_p).toBe(1);
    expect(DETERMINISTIC_DECODING.temperature).toBe(0);
    expect(req.promptVersion).toBe(ASSISTANT_PROMPT_VERSION);
  });
  it('whitelists exactly the refs present in the context', () => {
    const req = buildAssistantRequest('x', ctx);
    expect(req.allowedRefs).toContain('§II.C');
    expect(req.allowedRefs).toContain('43644');
    expect(req.allowedRefs).toContain('coding-map:43644');
    expect(req.allowedRefs).not.toContain('§IV'); // not in context
  });
});

describe('parseAssistantResponse — citation contract', () => {
  it('keeps only whitelisted citations; grounded when at least one survives', () => {
    const ans = parseAssistantResponse(
      { text: 'BMI > 40 qualifies.', citations: [{ label: 'II.C', ref: '§II.C' }] },
      ['§II.C', '43644']
    );
    expect(ans.grounded).toBe(true);
    expect(ans.citations).toHaveLength(1);
  });
  it('drops off-context citations and marks the answer ungrounded', () => {
    const ans = parseAssistantResponse(
      { text: 'per some other policy', citations: [{ label: 'X', ref: '§ZZ' }] },
      ['§II.C']
    );
    expect(ans.citations).toHaveLength(0);
    expect(ans.grounded).toBe(false);
  });
  it('is safe on malformed shapes', () => {
    const ans = parseAssistantResponse(null, ['§II.C']);
    expect(ans.text).toBe('(no answer)');
    expect(ans.grounded).toBe(false);
    expect(ans.source).toBe('ai');
  });
});

describe('deterministicAnswer — grounded retrieval, no guessing', () => {
  it('answers about a named code with its provenance + coding-map note, cited', () => {
    const ans = deterministicAnswer('what is 43644?', ctx);
    expect(ans.grounded).toBe(true);
    expect(ans.text).toMatch(/Laparoscopic gastric bypass/);
    expect(ans.citations.map((c) => c.ref)).toContain('43644');
    expect(ans.citations.map((c) => c.ref)).toContain('coding-map:43644');
  });
  it('answers about a named section', () => {
    const ans = deterministicAnswer('explain II.C', ctx);
    expect(ans.grounded).toBe(true);
    expect(ans.text).toMatch(/BMI > 40/);
    expect(ans.citations[0].ref).toBe('§II.C');
  });
  it('returns honest ungrounded guidance on no direct hit (never invents)', () => {
    const ans = deterministicAnswer('what is the meaning of life?', ctx);
    expect(ans.grounded).toBe(false);
    expect(ans.citations).toHaveLength(0);
    expect(ans.source).toBe('deterministic');
  });

  // LENS 1 (precision, not recall): substring collisions must NOT match a code.
  it('does not resolve a code from a longer number that merely contains it', () => {
    const short: AssistantContext = {
      ...ctx,
      codes: [{ code: '4364', system: 'CPT' }],
      provenance: [{ value: '4364', snippet: 'short code' }],
      codingMap: [],
    };
    // '436440' contains '4364' as a substring but is not a whole-token match.
    const ans = deterministicAnswer('what about 436440?', short);
    expect(ans.grounded).toBe(false);
  });
  it('matches a code only as a whole token (43644 not matched inside 1436442)', () => {
    expect(deterministicAnswer('reference 1436442 here', ctx).grounded).toBe(false);
    // sanity: a clean whole-token mention of the same code still resolves
    expect(deterministicAnswer('is 43644 covered?', ctx).grounded).toBe(true);
  });

  // LENS 8 (degenerate inputs): empty question / empty context must not throw or false-match.
  it('is safe on empty question and empty context', () => {
    expect(deterministicAnswer('', ctx).grounded).toBe(false);
    const empty: AssistantContext = {
      policyId: 'x',
      title: 'x',
      codes: [],
      sections: [],
      provenance: [],
      codingMap: [],
    };
    expect(() => deterministicAnswer('43644', empty)).not.toThrow();
    expect(deterministicAnswer('43644', empty).grounded).toBe(false);
    expect(buildAssistantRequest('', empty).allowedRefs).toEqual([]);
  });
});

// LENS 4/7 (contract + claim enforced): both providers must cite from the SAME ref vocabulary that
// buildAssistantRequest whitelists — otherwise a valid citation could be wrongly stripped.
describe('assistant — ref vocabulary is consistent across providers', () => {
  it('deterministic citation refs are all in the request whitelist', () => {
    const allow = new Set(buildAssistantRequest('43644 and II.C', ctx).allowedRefs);
    for (const q of ['43644', 'II.C']) {
      const ans = deterministicAnswer(q, ctx);
      for (const c of ans.citations) expect(allow.has(c.ref)).toBe(true);
    }
  });
});

// LENS 6 (no silent degradation): the recall cap is a KNOWN, tested bound, not an accident.
describe('buildAssistantContext — recall cap is bounded and deterministic', () => {
  it('caps a very large policy at the documented MAX_SECTIONS (200)', () => {
    const many = {
      policyId: 'p',
      title: 'Big',
      criteriaSections: [
        {
          heading: 'h',
          logic: 'all',
          criteria: Array.from({ length: 500 }, (_, i) => ({
            label: `S${i}`,
            text: `crit ${i}`,
            children: [],
          })),
        },
      ],
    } as unknown as PolicyReview;
    const built = buildAssistantContext(many);
    expect(built.sections).toHaveLength(200);
    // deterministic: it keeps the FIRST 200, in order
    expect(built.sections[0].label).toBe('S0');
    expect(built.sections[199].label).toBe('S199');
  });
});

describe('selectAssistantMode — shared env gate', () => {
  it('ai only when configured, deterministic otherwise', () => {
    expect(selectAssistantMode({ hasKey: true, configured: true, endpoint: 'https://x' })).toBe(
      'ai'
    );
    expect(selectAssistantMode({ hasKey: false, configured: false })).toBe('deterministic');
  });
});

describe('buildAssistantContext — from a review', () => {
  const review = {
    policyId: 'horizon/bariatric',
    title: 'Bariatric Surgery',
    guidelineCodes: [{ code: '43644', codeSystem: 'CPT', description: 'bypass' }],
    criteriaSections: [
      {
        heading: 'Medically necessary when:',
        logic: 'all',
        criteria: [
          {
            label: 'II.C',
            text: 'BMI > 40',
            children: [{ label: 'II.C.1', text: 'BMI over 40', children: [] }],
          },
        ],
      },
    ],
    provenance: [{ value: '43644', snippet: 'bypass', field: 'code', span: { start: 0, end: 1 } }],
  } as unknown as PolicyReview;

  it('maps codes, flattens nested criteria, and carries coding-map roles/flags', () => {
    const built = buildAssistantContext(review, {
      roles: { '43644': 'covered' },
      flags: { S2083: { severity: 'verify', message: 'assign role' } },
    });
    expect(built.codes.find((c) => c.code === '43644')?.role).toBe('covered');
    expect(built.sections.map((s) => s.label)).toContain('II.C.1'); // flattened child
    expect(built.codingMap.some((m) => m.code === '43644' && /covered/.test(m.note))).toBe(true);
    expect(built.codingMap.some((m) => m.code === 'S2083' && /assign role/.test(m.note))).toBe(
      true
    );
  });
});
