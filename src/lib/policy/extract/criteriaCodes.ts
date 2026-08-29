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
  const order: { code: string; codeSystem: 'CPT' | 'HCPCS'; description: string; span?: Span }[] =
    [];
  const idx = new Map<string, number>();
  const add = (code: string, sys: 'CPT' | 'HCPCS', desc: string, span?: Span): void => {
    const at = idx.get(code);
    if (at !== undefined) {
      if (!order[at].description && desc) order[at].description = desc;
      return;
    }
    idx.set(code, order.length);
    order.push({ code, codeSystem: sys, description: desc, span });
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
    add(code, sys, rest, span);
  }

  // 2) Inline prose mentions: "CPT code 43775", "HCPCS S2083".
  const proseRe = /\b(CPT|HCPCS)\s*(?:codes?)?\s*[:#]?\s*(\d{5}|[A-V]\d{4})\b/gi;
  let pm: RegExpExecArray | null;
  while ((pm = proseRe.exec(text)) !== null) {
    const sys: 'CPT' | 'HCPCS' = pm[1].toUpperCase() === 'HCPCS' ? 'HCPCS' : 'CPT';
    const code = pm[2];
    if (sys === 'CPT' && !inCptRange(code)) continue;
    const codeAt = pm.index + pm[0].lastIndexOf(code);
    add(code, sys, '', { start: codeAt, end: codeAt + code.length });
  }

  order.forEach((e, i) => {
    if (e.span) provenance.push(makeProvenance(text, `codes[${i}].code`, e.span));
  });
  return order.map(({ code, codeSystem, description }) => ({
    code,
    codeSystem,
    description,
    confidence: 'explicit' as const,
  }));
}
