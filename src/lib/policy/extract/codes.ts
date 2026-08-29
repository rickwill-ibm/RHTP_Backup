/**
 * Medical code recognition — CPT, HCPCS Level II, and ICD-10-CM, with noise guards.
 *
 * This is the anti-hallucination core. Text extracted from policy PDFs is full of
 * code-shaped noise: table numbers ("5.10.2"), page numbers, years ("2024"),
 * phone fragments, ZIP codes. The recognizer accepts only tokens that match a
 * real code grammar, and the ambiguous case — a bare 5-digit CPT, which is
 * indistinguishable from a ZIP by shape alone — is gated behind `allowBareCpt`,
 * set true ONLY inside a region segmentation has already classified as a code
 * list. Free-running text never yields bare-CPT matches.
 */

export type CodeKind = 'cpt' | 'hcpcs' | 'icd10';

export interface CodeMatch {
  code: string;
  kind: CodeKind;
  span: { start: number; end: number };
}

// CPT Category I: exactly five digits (e.g. 72148).
const RE_CPT_I = /^\d{5}$/;
// CPT Category II (…F) and III (…T): four digits + suffix letter (e.g. 1234F, 0512T).
const RE_CPT_CAT2 = /^\d{4}F$/;
const RE_CPT_CAT3 = /^\d{4}T$/;
// HCPCS Level II: a letter A–V then four digits (e.g. J1745, A9270, E0250).
const RE_HCPCS = /^[A-V]\d{4}$/;
// ICD-10-CM: letter, digit, alphanumeric, optional dot + 1–4 alphanumerics (e.g. I42.0, M17.11).
const RE_ICD10 = /^[A-TV-Z]\d[0-9A-Z](?:\.[0-9A-Z]{1,4})?$/;

// A token that could plausibly be a code: alphanumerics, dots allowed internally.
const TOKEN_RE = /[A-Za-z0-9](?:[A-Za-z0-9.]*[A-Za-z0-9])?/g;

/**
 * Classify a single already-trimmed token. `allowBareCpt` must be true to accept
 * a bare five-digit CPT (ambiguous with ZIP/other 5-digit numbers); distinctive
 * shapes (HCPCS, Cat II/III CPT, dotted ICD-10) are accepted regardless.
 */
export function classifyCode(token: string, allowBareCpt: boolean): CodeKind | null {
  const t = token.toUpperCase();
  if (RE_HCPCS.test(t)) return 'hcpcs';
  if (RE_CPT_CAT2.test(t) || RE_CPT_CAT3.test(t)) return 'cpt';
  if (RE_ICD10.test(t)) return 'icd10';
  if (allowBareCpt && RE_CPT_I.test(t)) return 'cpt';
  return null;
}

/**
 * Scan `text` for code tokens, returning each match with its character span.
 * Tokenizes on code-shaped runs, so a code split across a line break
 * ("721-\n48") tokenizes as "721" and "48" and is correctly rejected rather than
 * silently re-joined into a hallucinated code.
 */
export function scanCodes(text: string, allowBareCpt: boolean): CodeMatch[] {
  const out: CodeMatch[] = [];
  const re = new RegExp(TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const raw = m[0];
    const kind = classifyCode(raw, allowBareCpt);
    if (kind) {
      out.push({
        code: raw.toUpperCase(),
        kind,
        span: { start: m.index, end: m.index + raw.length },
      });
    }
    m = re.exec(text);
  }
  return out;
}

/**
 * A "code-only" line is codes plus separators and nothing else — the shape of a
 * real code table row. Prose that merely mentions a ZIP or form number is NOT
 * code-only, so it can never be mistaken for a code list. This is the guard that
 * makes bare 5-digit CPT extraction safe: bare-CPT is only ever accepted inside a
 * region built from code-only lines.
 */
export function isCodeOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  const matches = scanCodes(trimmed, true);
  if (matches.length === 0) return false;
  let residue = trimmed;
  for (const m of [...matches].sort((a, b) => b.span.start - a.span.start)) {
    residue = residue.slice(0, m.span.start) + residue.slice(m.span.end);
  }
  residue = residue.replace(/[\s,;:.|/()\][-]+/g, '');
  return residue.length === 0;
}

/** Deduplicate matches by code, keeping the first occurrence (and its span). */
export function dedupeByCode(matches: readonly CodeMatch[]): CodeMatch[] {
  const seen = new Set<string>();
  const out: CodeMatch[] = [];
  for (const c of matches) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    out.push(c);
  }
  return out;
}
