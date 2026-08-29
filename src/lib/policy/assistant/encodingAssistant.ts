/**
 * Encoding assistant seam — the document-grounded Q&A the reviewer uses during encoding.
 *
 * Mirrors the coding-map seam (`review/codingMap.ts`): one contract, two providers behind the SAME
 * env gate. A DETERMINISTIC grounded-retrieval fallback runs offline — it looks a code or section up
 * in THIS policy and answers with the cited snippet, inventing nothing. An AI provider runs an LLM at
 * TEMPERATURE 0 (deterministic mode), grounded strictly in this policy + the coding map. The AI
 * network call lives in the route; everything here is pure — prompt construction, provider selection,
 * response parsing, and the citation contract. No I/O, no time, no framework.
 *
 * Temperature 0 is near-deterministic, not byte-deterministic, so the LLM is never the system of
 * record: it proposes + explains, the human signs off (same contract as codingMap). Every answer is
 * anchored to a cited ref drawn from the provided context, or it is marked ungrounded.
 */
import { aiCodingConfigFromEnv, type AiCodingConfig } from '@/lib/policy/review/codingMap';
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { CriteriaGroup, CriterionNode } from '@/lib/policy/extract/criteria';
import type { CodingMapContribution } from '@/lib/policy/review/fromPolicyReview';

/** Pinned decoding parameters — deterministic mode. */
export const DETERMINISTIC_DECODING = { temperature: 0, top_p: 1 } as const;

/** Version the system prompt so every answer on the evidence ledger is reproducible to a prompt. */
export const ASSISTANT_PROMPT_VERSION = 'enc-assistant/1';

export type AssistantSource = 'deterministic' | 'ai';

export interface AssistantCitation {
  label: string;
  /** The whitelisted ref this citation resolves to (a section marker `§II.C` or a code). */
  ref: string;
}

export interface AssistantAnswer {
  text: string;
  citations: AssistantCitation[];
  /** True only when the answer is anchored to a cited ref in the provided context. */
  grounded: boolean;
  source: AssistantSource;
  model?: string;
  promptVersion: string;
}

/** Minimal, framework-free grounding corpus — THIS policy plus the coding map, nothing else. */
export interface AssistantContext {
  policyId: string;
  title: string;
  codes: { code: string; system?: string; role?: string }[];
  sections: { label: string; text: string }[];
  provenance: { value: string; snippet: string }[];
  codingMap: { code: string; note: string }[];
}

export interface AssistantRequest {
  temperature: number;
  top_p: number;
  system: string;
  user: string;
  promptVersion: string;
  /** The ONLY refs the model is permitted to cite — the grounding whitelist. */
  allowedRefs: string[];
}

const SYSTEM_PROMPT =
  'You are an encoding assistant for ONE payer medical policy under review. Answer ONLY from the ' +
  'provided policy context and coding map. If the answer is not in the context, say so plainly — ' +
  'never invent criteria, codes, or coverage, and never reason across other policies. Every answer ' +
  'must cite the section marker (e.g. §II.C) or the code it draws from.';

/** Recall bound on the grounding corpus. The assistant is advisory (never the system of record), so
 *  a very large policy is capped here deterministically rather than sending an unbounded prompt. */
const MAX_SECTIONS = 200;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function refsFromContext(ctx: AssistantContext): string[] {
  const refs = new Set<string>();
  for (const s of ctx.sections) refs.add(`§${s.label}`);
  for (const c of ctx.codes) refs.add(c.code);
  for (const m of ctx.codingMap) refs.add(`coding-map:${m.code}`);
  return Array.from(refs);
}

/** Build the pinned, grounded, temperature-0 request. Pure. */
export function buildAssistantRequest(question: string, ctx: AssistantContext): AssistantRequest {
  const user = [
    `POLICY: ${ctx.title} (${ctx.policyId})`,
    ctx.sections.length
      ? 'SECTIONS:\n' + ctx.sections.map((s) => `§${s.label}: ${s.text}`).join('\n')
      : '',
    ctx.codes.length
      ? 'CODES:\n' +
        ctx.codes
          .map((c) => `${c.code}${c.system ? ` (${c.system})` : ''}${c.role ? ` [${c.role}]` : ''}`)
          .join('\n')
      : '',
    ctx.codingMap.length
      ? 'CODING MAP:\n' + ctx.codingMap.map((m) => `${m.code}: ${m.note}`).join('\n')
      : '',
    `QUESTION: ${question.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    temperature: DETERMINISTIC_DECODING.temperature,
    top_p: DETERMINISTIC_DECODING.top_p,
    system: SYSTEM_PROMPT,
    user,
    promptVersion: ASSISTANT_PROMPT_VERSION,
    allowedRefs: refsFromContext(ctx),
  };
}

/**
 * Parse a raw AI response into an answer, ENFORCING the citation contract: only citations whose ref
 * is in the grounding whitelist survive, and an answer with no surviving citation is marked
 * ungrounded (never presented as anchored). Defensive against malformed shapes.
 */
export function parseAssistantResponse(
  raw: unknown,
  allowedRefs: string[],
  model?: string
): AssistantAnswer {
  const obj = (raw ?? {}) as { text?: unknown; citations?: unknown };
  const text = typeof obj.text === 'string' && obj.text.trim() ? obj.text.trim() : '(no answer)';
  const allow = new Set(allowedRefs);
  const citations: AssistantCitation[] = [];
  if (Array.isArray(obj.citations)) {
    for (const c of obj.citations) {
      const cc = (c ?? {}) as { label?: unknown; ref?: unknown };
      const ref = typeof cc.ref === 'string' ? cc.ref : '';
      const label = typeof cc.label === 'string' && cc.label ? cc.label : ref;
      if (ref && allow.has(ref)) citations.push({ label, ref });
    }
  }
  return {
    text,
    citations,
    grounded: citations.length > 0,
    source: 'ai',
    model,
    promptVersion: ASSISTANT_PROMPT_VERSION,
  };
}

/**
 * Deterministic, offline grounded retrieval. Answers about a specific code or section from THIS
 * policy with a cited snippet; on no direct hit it returns honest ungrounded guidance rather than
 * guessing. This is the fallback the demo runs when no AI endpoint is configured.
 */
export function deterministicAnswer(question: string, ctx: AssistantContext): AssistantAnswer {
  const q = question.trim();
  const qUpper = q.toUpperCase();

  // 1) a code named in the question → its provenance snippet (+ coding-map note if any).
  // Word-boundary match (not substring): a mention of 436440 must not resolve to code 4364, and a
  // longer code must not be triggered by a shorter one embedded in a number.
  for (const c of ctx.codes) {
    if (c.code && new RegExp(`\\b${escapeRegExp(c.code)}\\b`, 'i').test(q)) {
      const prov = ctx.provenance.find((p) => p.value === c.code);
      const cm = ctx.codingMap.find((m) => m.code === c.code);
      const parts = [
        `${c.code}${c.system ? ` (${c.system})` : ''}${c.role ? ` — role: ${c.role}` : ''} appears in this policy.`,
      ];
      if (prov) parts.push(`Source: “${prov.snippet}”.`);
      if (cm) parts.push(`Coding map: ${cm.note}`);
      const citations: AssistantCitation[] = [{ label: c.code, ref: c.code }];
      if (cm) citations.push({ label: `coding-map ${c.code}`, ref: `coding-map:${c.code}` });
      return {
        text: parts.join(' '),
        citations,
        grounded: true,
        source: 'deterministic',
        promptVersion: ASSISTANT_PROMPT_VERSION,
      };
    }
  }

  // 2) a section marker named in the question → its text.
  for (const s of ctx.sections) {
    if (!s.label) continue;
    if (new RegExp(`\\b${escapeRegExp(s.label.toUpperCase())}\\b`).test(qUpper)) {
      return {
        text: `§${s.label}: ${s.text}`,
        citations: [{ label: `§${s.label}`, ref: `§${s.label}` }],
        grounded: true,
        source: 'deterministic',
        promptVersion: ASSISTANT_PROMPT_VERSION,
      };
    }
  }

  // 3) no direct hit → honest, ungrounded guidance (the offline path never reasons freely).
  return {
    text:
      'Offline I can answer about a specific code or section in this policy — reference a code ' +
      '(e.g. 43644) or a section marker (e.g. II.C). For free-form questions grounded in this ' +
      'policy and the coding map, configure the AI assistant (AI_CODING_ENDPOINT + ANTHROPIC_API_KEY).',
    citations: [],
    grounded: false,
    source: 'deterministic',
    promptVersion: ASSISTANT_PROMPT_VERSION,
  };
}

export type AssistantMode = 'deterministic' | 'ai';

/** Pick the assistant path: AI only when the shared coding-map env gate is configured. */
export function selectAssistantMode(
  config: AiCodingConfig = aiCodingConfigFromEnv()
): AssistantMode {
  return config.configured ? 'ai' : 'deterministic';
}

/* ---- Context builder: PolicyReview → the minimal grounding corpus ---- */

function flattenCriteria(groups: CriteriaGroup[]): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  const walk = (nodes: CriterionNode[]): void => {
    for (const n of nodes) {
      if (out.length >= MAX_SECTIONS) return;
      out.push({ label: n.label, text: n.text });
      if (n.children.length > 0) walk(n.children);
    }
  };
  for (const g of groups) {
    if (out.length >= MAX_SECTIONS) break;
    walk(g.criteria);
  }
  return out;
}

/** Build the assistant grounding context from a review + an optional coding-map contribution. */
export function buildAssistantContext(
  review: PolicyReview,
  codingMap?: CodingMapContribution
): AssistantContext {
  const codes: AssistantContext['codes'] = [];
  for (const c of review.guidelineCodes ?? []) {
    codes.push({ code: c.code, system: c.codeSystem, role: codingMap?.roles?.[c.code] });
  }
  for (const s of review.productSections ?? []) {
    for (const p of s.procedures) {
      for (const c of p.codes) codes.push({ code: c.code, system: c.codeSystem });
    }
  }

  const cmNotes: AssistantContext['codingMap'] = [];
  for (const [code, role] of Object.entries(codingMap?.roles ?? {})) {
    cmNotes.push({ code, note: `proposed role ${role}` });
  }
  for (const [code, flag] of Object.entries(codingMap?.flags ?? {})) {
    cmNotes.push({ code, note: `${flag.severity}: ${flag.message}` });
  }

  return {
    policyId: review.policyId,
    title: review.title,
    codes,
    sections: flattenCriteria(review.criteriaSections ?? []),
    provenance: (review.provenance ?? []).map((p) => ({ value: p.value, snippet: p.snippet })),
    codingMap: cmNotes,
  };
}
