/**
 * Clinical-guideline (criteria) extractor — for any payer or state medical policy.
 *
 * These policies are NOT code tables; they are nested medical-necessity CRITERIA
 * (a "Medically Necessary" / "Medical Necessity" region with lettered/numbered/roman
 * sub-items and and/or logic) plus a coding section. The criteria are the real DTR
 * content — each becomes a questionnaire item a provider must satisfy. Deterministic;
 * keyed off structural section markers and enumeration style, never payer-specific wording.
 *
 * The list-nesting parser lives in `criteriaParse.ts`, the fallback code harvester in
 * `criteriaCodes.ts`, and the NormalizedPolicy mapping in `criteriaNormalize.ts` (re-exported below).
 */
import type { TextSource } from './types';
import type { FieldProvenance, Span } from './provenance';
import { makeProvenance } from './provenance';
import { parseCriteria } from './criteriaParse';
import { harvestCodes } from './criteriaCodes';

export interface CriterionNode {
  /** "A" / "1" / "a" */
  label: string;
  text: string;
  children: CriterionNode[];
  /** Source span of this criterion's first line — the byte anchor for its text. */
  span?: Span;
}

export interface CriteriaGroup {
  /** The intro sentence, e.g. "…considered medically necessary when all of the following…". */
  heading: string;
  /** all-of / one-of, when the intro states it. */
  logic: 'all' | 'any' | null;
  criteria: CriterionNode[];
}

export interface GuidelineCode {
  code: string;
  codeSystem: 'CPT' | 'HCPCS';
  description: string;
  /** How the code was obtained: `explicit` = present in the policy text (deterministic, byte-anchored);
   *  `mapped` = a standard code assigned to a concept the policy states in prose (a coding-layer decision
   *  a reviewer validates). The deterministic extractor only ever emits `explicit`. */
  confidence?: 'explicit' | 'mapped';
  /** WHERE in the document the code was harvested — the structural signal a default coverage disposition
   *  is inferred from (payer-agnostic; see review/codeDisposition.ts). `coding-appendix` = the policy's
   *  own CPT/HCPCS coding table; `requirements-table` = a prior-authorization requirements table;
   *  `inline-prose` = a bare "CPT NNNNN" mention. Absent when the origin is not tracked. */
  sourceSection?: 'coding-appendix' | 'requirements-table' | 'inline-prose';
}

export interface CriteriaPolicy {
  title: string | null;
  guidelineId: string | null;
  status: string | null;
  medicallyNecessary: CriteriaGroup[];
  notMedicallyNecessary: string[];
  codes: GuidelineCode[];
  provenance: FieldProvenance[];
  warnings: string[];
  stats: { groups: number; criteria: number; codes: number };
}

export interface Line {
  text: string;
  start: number;
}

function toLines(text: string): Line[] {
  const out: Line[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    out.push({ text: line, start: offset });
    offset += line.length + 1;
  }
  return out;
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m && m[1] ? m[1].trim() : null;
}

/**
 * The first line that reads like a real title, skipping OCR/scan junk: too-short lines, lines carrying
 * the Unicode replacement char (�), and lines that are mostly punctuation/symbols (e.g. "◄ &lnl").
 * Payer-agnostic — a quality gate on the title fallback, not a wording rule.
 */
function firstMeaningfulLine(lines: Line[]): string | null {
  for (const l of lines) {
    const t = l.text.trim();
    if (t.length < 4 || t.length > 120) continue;
    if (/�/.test(t)) continue; // OCR replacement character
    const letters = (t.match(/[A-Za-z]/g) ?? []).length;
    if (letters < 4) continue;
    const alnum = (t.match(/[A-Za-z0-9]/g) ?? []).length;
    if (alnum / t.length < 0.6) continue; // mostly symbols/punctuation
    return t;
  }
  return null;
}

// Structure-driven markers — match how policies are organized, not any payer's wording. An optional
// leading enumerator (roman/letter/number, e.g. "I.", "A.", "1.") is allowed so section headings like
// "I. Medical Necessity" are recognized the same as "Medically Necessary:".
const ENUM_PREFIX = '(?:[IVXLC]+\\.|[A-Za-z]\\.|\\d{1,2}\\.)?\\s*';
const MN_RE = new RegExp(`^${ENUM_PREFIX}Medical(?:ly)?\\s+Necess`, 'i');
const NMN_RE = new RegExp(`^${ENUM_PREFIX}Not\\s+Medical(?:ly)?\\s+Necess`, 'i');
// An INLINE medical-necessity determination (criteria embedded in a numbered clause, no heading):
// "…is considered medically necessary when ALL/ONE of the following … are met:". Structural payer
// boilerplate — a determination phrase, a logic word, then "following" — never any payer's wording.
const MN_INTRO_RE =
  /medical(?:ly)?\s+necess\w*[\s\S]*?\b(?:all|one|any|either|each|both)\b[\s\S]*?\bfollowing\b/i;
// A heading that begins a code section: "Coding", "Codes", or "Applicable CPT / HCPCS / ICD-10 Codes".
const CODING_RE = new RegExp(
  `^${ENUM_PREFIX}(?:Coding\\b|Codes\\b|Applicable\\s+(?:CPT|HCPCS|ICD|Codes)|CPT\\s*/\\s*HCPCS)`,
  'i'
);
const CODE_LINE_RE = /^(\d{5}|[A-V]\d{4})\s+(.*)$/;
const SECTION_END_RE = new RegExp(
  `^${ENUM_PREFIX}(Coding|Codes|Applicable\\s+(?:CPT|HCPCS|ICD|Codes)|CPT\\s*/\\s*HCPCS|Discussion|Definitions|References|Rationale|Background|History|Scope|Policy History)\\b`,
  'i'
);

// Back-matter that must NOT be treated as medical-necessity criteria: the payer policy's evidence-
// review appendix (a "Populations / Interventions / Comparators / Outcomes" PICO table), coverage
// statements, and policy-guideline notes that follow the criteria. On scanned-then-Word documents this
// tail has no list markers, so the parser would otherwise fold the entire appendix into the LAST
// criterion — producing one monstrous, non-consumable questionnaire item. We (a) end the criteria
// region at the first appendix boundary and (b) cut every criterion's text at that boundary, dropping
// any criterion that was ENTIRELY back-matter. The PICO phrases never occur in a real criterion.
const APPENDIX_BOUNDARY_RE =
  /(Policy Guidelines\b|Populations\s+Interventions\s+Comparators|Interventions of interest are\b|Comparators of interest are\b|Relevant outcomes include\b|Medicare Coverage\b|Medicaid Coverage\b|FIDE-?SNP)/i;
const MAX_CRITERION_CHARS = 1200; // defensive cap; real criteria run well under this

function trimAtAppendix(textIn: string): string {
  const m = APPENDIX_BOUNDARY_RE.exec(textIn);
  let out = (m ? textIn.slice(0, m.index) : textIn).trim();
  if (out.length > MAX_CRITERION_CHARS) out = out.slice(0, MAX_CRITERION_CHARS).trim() + '…';
  return out;
}

/** Trim each criterion's text at the first appendix boundary and drop nodes that were only back-matter
 *  (recursively). Preserves the real criterion prefix; kills the folded PICO/coverage blob. */
function cleanCriterionNodes(nodes: CriterionNode[]): CriterionNode[] {
  const out: CriterionNode[] = [];
  for (const n of nodes) {
    const cleanedText = trimAtAppendix(n.text);
    const children = cleanCriterionNodes(n.children);
    if (cleanedText.length === 0 && children.length === 0) continue;
    out.push({ ...n, text: cleanedText, children });
  }
  return out;
}

export function extractCriteriaPolicy(src: TextSource): CriteriaPolicy {
  const text = src.text;
  const lines = toLines(text);
  const provenance: FieldProvenance[] = [];
  const warnings: string[] = [];

  const title =
    firstMatch(text, /Subject:\s*(.+)/i) ??
    firstMeaningfulLine(lines) ??
    lines.map((l) => l.text.trim()).find((t) => t.length > 0) ??
    null;
  const guidelineId = firstMatch(text, /Guideline\s*#:?\s*([A-Za-z0-9-]+)/i);
  const status = firstMatch(text, /Status:\s*([A-Za-z ]+?)(?:\s{2,}|Last Review|$)/i);

  // ---- Medically Necessary region(s) ----
  // A region opens on EITHER of two structural signals, so both common payer layouts work:
  //   • a heading line — "Medically Necessary:" / "I. Medical Necessity"     (MN_RE)
  //   • an inline determination — "…is considered medically necessary when   (MN_INTRO_RE)
  //     ALL/ONE of the following … are met:" — where the criteria live INSIDE a numbered clause,
  //     with no separate heading (common in many payer/state policies).
  // A heading's criteria start on the NEXT line; an inline determination IS itself the first
  // criterion, so its own line is included. The region runs to the next heading / NMN / section end.
  const mnGroups: CriteriaGroup[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].text.trim();
    const heading = MN_RE.test(t);
    const inline = !heading && MN_INTRO_RE.test(t);
    if (!heading && !inline) continue;
    let j = i + 1;
    while (
      j < lines.length &&
      !NMN_RE.test(lines[j].text.trim()) &&
      !MN_RE.test(lines[j].text.trim()) &&
      !SECTION_END_RE.test(lines[j].text.trim()) &&
      !APPENDIX_BOUNDARY_RE.test(lines[j].text.trim())
    ) {
      j += 1;
    }
    mnGroups.push(...parseCriteria(lines.slice(heading ? i + 1 : i, j)));
    i = j - 1;
  }

  // ---- Not Medically Necessary statements ----
  const notMedicallyNecessary: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!NMN_RE.test(lines[i].text.trim())) continue;
    let j = i + 1;
    while (
      j < lines.length &&
      !SECTION_END_RE.test(lines[j].text.trim()) &&
      !MN_RE.test(lines[j].text.trim()) &&
      !APPENDIX_BOUNDARY_RE.test(lines[j].text.trim())
    ) {
      const t = lines[j].text.trim();
      if (t.length > 0) notMedicallyNecessary.push(t);
      j += 1;
    }
    i = j - 1;
  }

  // ---- Coding section: CPT/HCPCS code + wrapped description ----
  const codes: GuidelineCode[] = [];
  const codingIdx = lines.findIndex((l) => CODING_RE.test(l.text.trim()));
  if (codingIdx >= 0) {
    const header = lines[codingIdx].text.trim();
    // An ICD-only coding section is a diagnosis-code table — don't emit its codes as CPT/HCPCS.
    let section: 'cpt' | 'hcpcs' | 'icd' | null =
      /ICD/i.test(header) && !/CPT|HCPCS/i.test(header) ? 'icd' : null;
    const seen = new Set<string>();
    for (let i = codingIdx + 1; i < lines.length; i += 1) {
      const t = lines[i].text.trim();
      if (/^(Discussion|Definitions|References|Rationale|History)\b/i.test(t)) break;
      if (t.length <= 28 && /^(ICD|Diagnos)/i.test(t)) {
        section = 'icd';
        continue;
      }
      if (t.length <= 24 && /^HCPCS\b/i.test(t)) {
        section = 'hcpcs';
        continue;
      }
      if (t.length <= 24 && /^CPT\b/i.test(t)) {
        section = 'cpt';
        continue;
      }
      if (section === 'icd') continue; // diagnosis-code region — not our code systems
      const m = CODE_LINE_RE.exec(t);
      if (!m) continue;
      const code = m[1];
      if (seen.has(code)) continue;
      seen.add(code);
      let description = m[2].trim();
      let k = i + 1;
      while (k < lines.length) {
        const nt = lines[k].text.trim();
        if (CODE_LINE_RE.test(nt) || nt.length === 0 || /^(CPT|HCPCS|ICD)/i.test(nt)) break;
        description = `${description} ${nt}`.trim();
        k += 1;
      }
      const rel = lines[i].text.indexOf(code);
      if (rel >= 0) {
        const span: Span = { start: lines[i].start + rel, end: lines[i].start + rel + code.length };
        provenance.push(makeProvenance(text, `codes[${codes.length}].code`, span));
      }
      codes.push({
        code,
        codeSystem: /^\d{5}$/.test(code) ? 'CPT' : 'HCPCS',
        description,
        confidence: 'explicit',
        sourceSection: 'coding-appendix',
      });
    }
  }

  // Fallback: many policies keep a bare CPT/HCPCS code LIST (one code per line, under "CPT"/"HCPCS"
  // header lines, often placed AFTER the references section — past where the heading-anchored scan
  // stops). If the primary parse found nothing, harvest codes structurally from the whole document.
  if (codes.length === 0) {
    for (const c of harvestCodes(text, lines, provenance)) codes.push(c);
  }

  const cleaned = mnGroups.map((g) => ({ ...g, criteria: cleanCriterionNodes(g.criteria) }));
  const groups = cleaned.filter((g) => g.criteria.length > 0);
  let criteriaCount = 0;
  for (const g of groups) criteriaCount += g.criteria.length;
  if (criteriaCount === 0)
    warnings.push('no medical-necessity criteria found — document may not be a clinical guideline');

  // Byte-anchor every criterion (top-level and nested) to its source span, so the criteria — the
  // actual DTR content — are falsifiable evidence, not just the codes.
  let critIdx = 0;
  const anchorNodes = (nodes: CriterionNode[]): void => {
    for (const n of nodes) {
      if (n.span) provenance.push(makeProvenance(text, `criteria[${critIdx}].text`, n.span));
      critIdx += 1;
      if (n.children.length > 0) anchorNodes(n.children);
    }
  };
  for (const g of groups) anchorNodes(g.criteria);

  return {
    title,
    guidelineId,
    status,
    medicallyNecessary: groups,
    notMedicallyNecessary,
    codes,
    provenance,
    warnings,
    stats: { groups: groups.length, criteria: criteriaCount, codes: codes.length },
  };
}

export { criteriaToNormalized } from './criteriaNormalize';
