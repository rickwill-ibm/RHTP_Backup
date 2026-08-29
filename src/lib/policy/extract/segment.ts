/**
 * Structural segmentation — find the labeled regions a policy document is built
 * from, each tied to a character offset so downstream code extraction can anchor
 * provenance. Deterministic and heuristic: it recognizes the common shapes of
 * Aetna CPB text and payer/agency PA-requirement lists. Ambiguous or novel
 * layouts surface as warnings rather than silent mis-extraction — which is why a
 * human-review UI is the next unit.
 */
import { isCodeOnlyLine } from './codes';

export type CpbBucket =
  | 'cptCovered'
  | 'cptNotCovered'
  | 'hcpcsCovered'
  | 'hcpcsNotCovered'
  | 'icd10Covered'
  | 'icd10NotCovered';

export interface CodeRegion {
  label: string;
  bucket: CpbBucket;
  start: number;
  end: number;
}

export interface IndicationHit {
  label: string;
  title: string;
  span: { start: number; end: number };
}

export interface CpbSegmentation {
  title: string | null;
  number: string | null;
  effectiveDate: string | null;
  indications: IndicationHit[];
  regions: CodeRegion[];
}

export interface PaCategoryRegion {
  category: string;
  start: number;
  end: number;
}

export interface PaSegmentation {
  effectiveDate: string | null;
  categories: PaCategoryRegion[];
}

interface Line {
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

// ---------- Aetna CPB ----------

function classifyCpbHeader(line: string): CpbBucket | null {
  const trimmed = line.trim();
  const isHeaderShape = trimmed.endsWith(':') || trimmed.length <= 70;
  if (!isHeaderShape) return null;
  const l = trimmed.toLowerCase();
  if (!/(cpt|hcpcs|icd)/.test(l)) return null;
  const notCovered = /(not covered|experimental|investigational)/.test(l);
  const covered = /(cover|necessary)/.test(l);
  if (!notCovered && !covered) return null;
  if (/cpt/.test(l)) return notCovered ? 'cptNotCovered' : 'cptCovered';
  if (/hcpcs/.test(l)) return notCovered ? 'hcpcsNotCovered' : 'hcpcsCovered';
  return notCovered ? 'icd10NotCovered' : 'icd10Covered';
}

/** Collect a contiguous block of non-empty lines starting at index `from`. */
function blockEnd(lines: Line[], from: number): number {
  let i = from;
  while (i < lines.length && lines[i].text.trim().length > 0) i += 1;
  return i; // exclusive; lines[from..i) are the block
}

const INDICATION_RE = /^\s*([A-Za-z])[.)]\s+(\S.*)$/;

export function segmentCpb(text: string): CpbSegmentation {
  const lines = toLines(text);
  const title =
    firstMatch(text, /Clinical Policy Bulletin:?\s*(.+)/i) ??
    firstMatch(text, /^Subject:?\s*(.+)$/im);
  const number = firstMatch(text, /Number:?\s*([A-Za-z0-9-]+)/i);
  const effectiveDate =
    firstMatch(
      text,
      /(?:Last Review|Review Date|Effective(?: Date)?)\s*:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/
    ) ?? firstMatch(text, /(?:Effective|Review)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);

  const regions: CodeRegion[] = [];
  const indications: IndicationHit[] = [];
  let inIndications = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const bucket = classifyCpbHeader(line.text);
    if (bucket) {
      inIndications = false;
      const start = i + 1 < lines.length ? lines[i + 1].start : line.start + line.text.length;
      const end = blockEnd(lines, i + 1);
      const endOffset = end > i + 1 ? lines[end - 1].start + lines[end - 1].text.length : start;
      regions.push({ label: line.text.trim(), bucket, start, end: endOffset });
      i = end - 1;
      continue;
    }
    if (/medical necessity/i.test(line.text)) {
      inIndications = true;
      continue;
    }
    if (inIndications) {
      if (line.text.trim().length === 0) continue;
      const m = INDICATION_RE.exec(line.text);
      if (m && m[1] && m[2]) {
        const titleText = m[2]
          .replace(/\s*;?\s*or$/i, '')
          .replace(/[.;,]+$/, '')
          .trim();
        const rel = line.text.indexOf(titleText);
        const start = line.start + (rel >= 0 ? rel : 0);
        indications.push({
          label: m[1].toUpperCase(),
          title: titleText,
          span: { start, end: start + titleText.length },
        });
      } else if (/^[IVX]+[.)]/.test(line.text.trim()) || classifyCpbHeader(line.text)) {
        inIndications = false;
      }
    }
  }

  return { title, number, effectiveDate, indications, regions };
}

// ---------- PA-requirement list ----------

/** A heading: a non-empty, non-code-only line whose next non-empty line is code-only. */
function isCategoryHeading(lines: Line[], i: number): boolean {
  const line = lines[i];
  if (line.text.trim().length === 0) return false;
  if (isCodeOnlyLine(line.text)) return false;
  for (let j = i + 1; j < lines.length; j += 1) {
    if (lines[j].text.trim().length === 0) continue;
    return isCodeOnlyLine(lines[j].text);
  }
  return false;
}

export function segmentPaList(text: string): PaSegmentation {
  const lines = toLines(text);
  const effectiveDate =
    firstMatch(text, /Effective(?:\s*Date)?\s*:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/) ??
    firstMatch(text, /Effective(?:\s*Date)?\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);

  const categories: PaCategoryRegion[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!isCategoryHeading(lines, i)) continue;
    const contentStart = i + 1 < lines.length ? lines[i + 1].start : lines[i].start;
    let lastCode = -1;
    let j = i + 1;
    while (j < lines.length) {
      const trimmed = lines[j].text.trim();
      if (trimmed.length === 0) {
        j += 1;
        continue;
      }
      if (isCodeOnlyLine(lines[j].text)) {
        lastCode = j;
        j += 1;
        continue;
      }
      break; // first prose line ends the category's code block
    }
    const end = lastCode >= 0 ? lines[lastCode].start + lines[lastCode].text.length : contentStart;
    categories.push({ category: lines[i].text.trim(), start: contentStart, end });
    i = Math.max(i, lastCode);
  }

  return { effectiveDate, categories };
}
