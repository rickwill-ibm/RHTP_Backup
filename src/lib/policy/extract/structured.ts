/**
 * Structured policy extractor — the "Requirements By Product" layout.
 *
 * Many payer PA policies are not flat code lists: they are
 * organized as PRODUCT (line of business) → PROCEDURE → a table of CPT/HCPCS rows,
 * each with a wrapped description and an AI **confidence %**. This extractor turns
 * that layout into a reviewable structure a policy expert can inspect and correct,
 * with provenance for every code. Deterministic; generalized via a line-of-business
 * dictionary + a table-shape grammar rather than payer-specific hardcoding.
 *
 * The confidence column is the point: it tells the expert which rows to scrutinize,
 * and their corrections become the training signal for the AI generator over time.
 */
import type { TextSource } from './types';
import type { FieldProvenance, Span } from './provenance';
import { makeProvenance } from './provenance';
import type { NormalizedPolicy } from '../types';

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Flatten a structured policy into one NormalizedPolicy PER PRODUCT (line of business),
 * as a code-on-pa-required-list policy. This is the CRD/coverage-rule projection — it
 * does NOT carry medical-necessity criteria (there are none in a code-list document),
 * which is exactly why a DTR questionnaire built from it is near-empty.
 */
export function structuredToNormalized(policy: StructuredPolicy): NormalizedPolicy[] {
  return policy.products.map((prod) => {
    const paItems = prod.procedures.map((pr) => ({
      category: pr.procedure,
      codes: pr.codes.map((c) => c.code),
      effectiveDate: null,
    }));
    const allPaCodes = Array.from(new Set(paItems.flatMap((i) => i.codes))).sort();
    return {
      policyId: `${slug(policy.title ?? 'policy')}-${slug(prod.product)}`,
      source: policy.title ?? 'Unknown payer',
      sourceType: 'prior-authorization-requirements-list',
      title: `${policy.title ?? 'Policy'} — ${prod.product}`,
      category: policy.category ?? 'Prior authorization requirements',
      requiresPA: true,
      determinationBasis: 'code-on-pa-required-list',
      plan: prod.product,
      number: policy.policyNumber,
      paItems,
      allPaCodes,
      sourceFile: policy.sourceFile,
    };
  });
}

export interface StructuredCode {
  rank: number | null;
  code: string;
  codeSystem: 'CPT' | 'HCPCS';
  description: string;
  confidence: number | null;
}

export interface ProcedureGroup {
  procedure: string;
  codes: StructuredCode[];
}

export interface ProductCoverage {
  /** Verbatim product heading, e.g. "Commercial", "Fide-Snp Coverage". */
  product: string;
  procedures: ProcedureGroup[];
}

export interface StructuredPolicy {
  title: string | null;
  policyNumber: string | null;
  category: string | null;
  sourceFile: string;
  products: ProductCoverage[];
  provenance: FieldProvenance[];
  warnings: string[];
  codeCount: number;
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

// A product heading: a short line beginning with a known line-of-business term.
const LOB_RE =
  /^(commercial|medicaid|medicare|fide[-\s]?snp|d[-\s]?snp|dual|exchange|marketplace|hmo|ppo|epo|chip)\b/i;

const TABLE_HEADER_RE = /CPT\s*\/\s*HCPCS\s+Description\s+Confidence/i;
const ROW_START_RE = /^\s*(\d{1,3})\s+(\d{5}|[A-V]\d{4})\b(.*)$/;
const CONF_END_RE = /\s(\d{1,3}(?:\.\d+)?)\s*$/;
const PAGE_RE = /^Page\s+\d+$/i;

function isProductHeading(t: string): boolean {
  return t.length > 0 && t.length <= 40 && LOB_RE.test(t);
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m && m[1] ? m[1].trim() : null;
}

export function extractStructuredPolicy(src: TextSource): StructuredPolicy {
  const text = src.text;
  const lines = toLines(text);
  const provenance: FieldProvenance[] = [];
  const warnings: string[] = [];
  const products: ProductCoverage[] = [];

  const title = lines.map((l) => l.text.trim()).find((t) => t.length > 0) ?? null;
  const policyNumber = firstMatch(text, /Policy Number:?\s*([A-Za-z0-9-]+)/i);
  const category = firstMatch(text, /Category:?\s*(.+?)\s+(?:Policy Number|Section Type)/i);

  const isNoise = (t: string): boolean =>
    t.length === 0 || PAGE_RE.test(t) || (title !== null && t === title);

  let started = false;
  let currentProduct: ProductCoverage | null = null;
  let candidateProcedure: string | null = null;

  const ensureProduct = (): ProductCoverage => {
    if (currentProduct) return currentProduct;
    const p: ProductCoverage = { product: 'General', procedures: [] };
    products.push(p);
    currentProduct = p;
    return p;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.text.trim();

    if (isNoise(t)) {
      i += 1;
      continue;
    }
    if (!started) {
      if (/Requirements By Product/i.test(t)) started = true;
      i += 1;
      continue;
    }
    if (isProductHeading(t)) {
      currentProduct = { product: t, procedures: [] };
      products.push(currentProduct);
      candidateProcedure = null;
      i += 1;
      continue;
    }
    if (TABLE_HEADER_RE.test(t)) {
      const proc: ProcedureGroup = {
        procedure: candidateProcedure ?? '(unnamed procedure)',
        codes: [],
      };
      ensureProduct().procedures.push(proc);
      candidateProcedure = null;
      i = parseRows(lines, i + 1, proc, text, provenance, products.length - 1, title);
      continue;
    }
    // A meaningful non-heading line preceding a table is the procedure name.
    candidateProcedure = t;
    i += 1;
  }

  let codeCount = 0;
  for (const p of products) for (const pr of p.procedures) codeCount += pr.codes.length;
  if (codeCount === 0) {
    warnings.push(
      'no product/procedure code tables recognized — layout may not be "Requirements By Product"'
    );
  }
  for (const p of products)
    for (const pr of p.procedures)
      if (pr.codes.length === 0)
        warnings.push(`procedure "${pr.procedure}" (${p.product}) had no codes`);

  return {
    title,
    policyNumber,
    category,
    sourceFile: src.sourceFile,
    products,
    provenance,
    warnings,
    codeCount,
  };
}

function parseRows(
  lines: Line[],
  from: number,
  proc: ProcedureGroup,
  text: string,
  provenance: FieldProvenance[],
  productIdx: number,
  title: string | null
): number {
  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.text.trim();
    if (t.length === 0 || PAGE_RE.test(t) || (title !== null && t === title)) {
      i += 1;
      continue;
    }
    if (isProductHeading(t)) break;
    if (TABLE_HEADER_RE.test(t)) {
      // A table header inside a table is a page-break-repeated header for the SAME
      // procedure (a genuine new procedure would have broken at its name line first).
      i += 1;
      continue;
    }
    const m = ROW_START_RE.exec(line.text);
    if (!m) break; // a new procedure name ends this table
    const rank = Number(m[1]);
    const code = m[2];

    // Accumulate the (possibly wrapped) row until a line ends with the confidence decimal.
    let j = i;
    let buf = line.text;
    while (!CONF_END_RE.test(buf)) {
      const next = lines[j + 1];
      if (!next) break;
      const nt = next.text.trim();
      if (
        ROW_START_RE.test(next.text) ||
        isProductHeading(nt) ||
        TABLE_HEADER_RE.test(nt) ||
        PAGE_RE.test(nt)
      ) {
        break;
      }
      j += 1;
      buf += ' ' + next.text;
    }

    const confMatch = CONF_END_RE.exec(buf);
    const confidence = confMatch ? Number(confMatch[1]) : null;
    const codeIdx = buf.indexOf(code);
    let description = codeIdx >= 0 ? buf.slice(codeIdx + code.length) : buf;
    description = description.replace(CONF_END_RE, '').replace(/\s+/g, ' ').trim();

    const rel = line.text.indexOf(code);
    if (rel >= 0) {
      const span: Span = { start: line.start + rel, end: line.start + rel + code.length };
      const idx = proc.codes.length;
      provenance.push(
        makeProvenance(text, `products[${productIdx}].${proc.procedure}.codes[${idx}].code`, span)
      );
    }

    proc.codes.push({
      rank: Number.isFinite(rank) ? rank : null,
      code,
      codeSystem: /^\d{5}$/.test(code) ? 'CPT' : 'HCPCS',
      description,
      confidence,
    });

    i = confMatch ? j + 1 : j;
    if (!confMatch && i === from) i += 1; // guard against no-progress
  }
  return i;
}
