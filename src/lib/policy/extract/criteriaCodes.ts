/**
 * Structural CPT/HCPCS code harvester — the fallback used when the heading-anchored coding parser
 * finds nothing. Split out of `criteria.ts` for the size cap; behavior unchanged. Reads a bare code
 * LIST (one code per line, its system set by a preceding "CPT"/"HCPCS" header) plus inline "CPT code
 * NNNNN" prose mentions. Deterministic, payer-agnostic; every code is byte-anchored for provenance.
 */
import type { Line, GuidelineCode } from './criteria';
import type { FieldProvenance, Span } from './provenance';
import { makeProvenance } from './provenance';

export function harvestCodes(
  text: string,
  lines: Line[],
  provenance: FieldProvenance[]
): GuidelineCode[] {
  type Section = NonNullable<GuidelineCode['sourceSection']>;
  // Stronger structural signal wins on a duplicate: a code seen in both a bare list and a PA table is
  // tagged by the more coverage-determinable context. requirements-table > coding-appendix > inline-prose.
  const SECTION_RANK: Record<Section, number> = {
    'requirements-table': 3,
    'coding-appendix': 2,
    'inline-prose': 1,
  };
  const order: {
    code: string;
    codeSystem: 'CPT' | 'HCPCS';
    description: string;
    span?: Span;
    sourceSection: Section;
  }[] = [];
  const idx = new Map<string, number>();
  const add = (
    code: string,
    sys: 'CPT' | 'HCPCS',
    desc: string,
    section: Section,
    span?: Span
  ): void => {
    const at = idx.get(code);
    if (at !== undefined) {
      if (!order[at].description && desc) order[at].description = desc;
      if (SECTION_RANK[section] > SECTION_RANK[order[at].sourceSection]) {
        order[at].sourceSection = section;
      }
      return;
    }
    idx.set(code, order.length);
    order.push({ code, codeSystem: sys, description: desc, span, sourceSection: section });
  };
  const inCptRange = (code: string): boolean => {
    const n = Number(code);
    return n >= 100 && n <= 99999; // CPT Category I incl. leading-zero anesthesia codes (00100–01999)
  };

  // 1) Code-list lines. A line is harvested only when it is EITHER a bare code (nothing after the
  // code) OR sits under an active CPT/HCPCS header — never a prose sentence that merely begins with
  // a number. System is decided by FORMAT (5-digit → CPT, letter+4 → HCPCS); an ICD/Diagnosis header
  // suppresses harvesting so dotless ICD codes (E6601 ≡ E66.01, ambiguous with E-series HCPCS) aren't
  // emitted as codes we don't model.
  let section: 'cpt' | 'hcpcs' | 'icd' | null = null;
  for (const line of lines) {
    const s = line.text.trim();
    if (s.length <= 24 && /^HCPCS\b/i.test(s)) {
      section = 'hcpcs';
      continue;
    }
    if (s.length <= 24 && /^CPT\b/i.test(s)) {
      section = 'cpt';
      continue;
    }
    if (s.length <= 28 && /^(ICD|Diagnos)/i.test(s)) {
      section = 'icd';
      continue;
    }
    if (section === 'icd') continue; // inside a diagnosis-code section — not our code systems
    if (s.length > 80) continue; // code-list rows are short; skip prose sentences
    const m = /^(\d{5}|[A-V]\d{4})\b\s*(.*)$/.exec(s);
    if (!m) continue;
    const code = m[1];
    const rest = m[2].trim();
    // A non-bare line with NO active code section is prose that happens to start with a number
    // (e.g. "50000 units of therapy…") — skip it so no phantom code is fabricated.
    if (rest !== '' && section === null) continue;
    const sys: 'CPT' | 'HCPCS' = /^[A-V]\d{4}$/.test(code) ? 'HCPCS' : 'CPT';
    if (sys === 'CPT' && !inCptRange(code)) continue;
    const rel = line.text.indexOf(code);
    const span =
      rel >= 0 ? { start: line.start + rel, end: line.start + rel + code.length } : undefined;
    add(code, sys, rest, 'coding-appendix', span);
  }

  // 1.5) Requirements-table pass. PA-requirement / code-list policies (e.g. "Prior Authorization
  // Requirements", "…required to have prior authorization") lay codes out in ways pass 1 misses: a
  // leading ROW INDEX before the code ("1  43770  Laparoscopy…"), MANY codes per line
  // ("93451, 93452, 93453"), and wide table headers ("CPT/HCPCS Description Confidence (%)"). Inside
  // such a context we harvest EVERY valid code token on a line — not just the first — while staying
  // fail-closed: the pass only fires once a requirements/code-table context is open, only accepts real
  // CPT ranges / HCPCS formats, and suppresses inside an ICD/diagnosis section. No context ⇒ no harvest,
  // so prose 5-digit numbers are never fabricated into codes.
  const opensReqContext = (s: string): boolean =>
    (/prior\s*authoriz/i.test(s) && /require/i.test(s)) ||
    (/\bCPT\b/i.test(s) && /\bHCPCS\b/i.test(s));
  const closesReqContext = (s: string): boolean =>
    /^(References|Rationale|Discussion|Definitions|History|Background|Scope|Policy History)\b/i.test(
      s
    );
  const codeTokenRe = /\b(\d{5}|[A-V]\d{4})\b/g;
  let reqContext = false;
  let reqIcd = false;
  for (const line of lines) {
    const s = line.text.trim();
    if (closesReqContext(s)) {
      reqContext = false;
      continue;
    }
    if (!reqContext && opensReqContext(s)) {
      reqContext = true;
      reqIcd = false;
      continue;
    }
    if (!reqContext) continue;
    if (s.length <= 28 && /^(ICD|Diagnos)/i.test(s)) {
      reqIcd = true; // a diagnosis-code table inside the requirements — not our code systems
      continue;
    }
    if (s.length <= 24 && /^(CPT|HCPCS)\b/i.test(s)) reqIcd = false; // back to a CPT/HCPCS table
    if (reqIcd) continue;
    let tm: RegExpExecArray | null;
    codeTokenRe.lastIndex = 0;
    const found: { code: string; at: number }[] = [];
    while ((tm = codeTokenRe.exec(line.text)) !== null) found.push({ code: tm[1], at: tm.index });
    for (const { code, at } of found) {
      const sys: 'CPT' | 'HCPCS' = /^[A-V]\d{4}$/.test(code) ? 'HCPCS' : 'CPT';
      if (sys === 'CPT' && !inCptRange(code)) continue;
      // Description only when the line carries a SINGLE code (a labelled row); a multi-code list line
      // has no per-code description, so it stays empty rather than mislabelled.
      const desc =
        found.length === 1
          ? line.text
              .slice(at + code.length)
              .replace(/\s+/g, ' ')
              .trim()
          : '';
      add(code, sys, desc, 'requirements-table', {
        start: line.start + at,
        end: line.start + at + code.length,
      });
    }
  }

  // 2) Inline prose mentions: "CPT code 43775", "HCPCS S2083".
  const proseRe = /\b(CPT|HCPCS)\s*(?:codes?)?\s*[:#]?\s*(\d{5}|[A-V]\d{4})\b/gi;
  let pm: RegExpExecArray | null;
  while ((pm = proseRe.exec(text)) !== null) {
    const sys: 'CPT' | 'HCPCS' = pm[1].toUpperCase() === 'HCPCS' ? 'HCPCS' : 'CPT';
    const code = pm[2];
    if (sys === 'CPT' && !inCptRange(code)) continue;
    const codeAt = pm.index + pm[0].lastIndexOf(code);
    add(code, sys, '', 'inline-prose', { start: codeAt, end: codeAt + code.length });
  }

  order.forEach((e, i) => {
    if (e.span) provenance.push(makeProvenance(text, `codes[${i}].code`, e.span));
  });
  return order.map(({ code, codeSystem, description, sourceSection }) => ({
    code,
    codeSystem,
    description,
    sourceSection,
    confidence: 'explicit' as const,
  }));
}
