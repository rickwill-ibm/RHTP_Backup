/**
 * Field extraction — assemble a `RawPolicyRecord` in one of the two shapes the
 * existing ingestion adapters recognize, with byte/char-anchored provenance for
 * every extracted code and indication, plus warnings for anything skipped.
 *
 * This layer NEVER builds a NormalizedPolicy — it stops at the adapter's front
 * door. `codes`/`paItems` are exactly what `aetnaCpb` / `uhcPaList` /
 * `genericPaList` coerce.
 */
import type { RawPolicyRecord } from '../ingest';
import type { FieldExtraction, TextSource } from './types';
import type { FieldProvenance } from './provenance';
import { anchorValue, makeProvenance } from './provenance';
import { dedupeByCode, scanCodes, type CodeMatch } from './codes';
import { segmentCpb, segmentPaList, type CpbBucket } from './segment';

/** Shift a region-relative match into absolute source coordinates. */
function absolutize(match: CodeMatch, base: number): CodeMatch {
  return { ...match, span: { start: match.span.start + base, end: match.span.end + base } };
}

const CPB_EMPTY_BUCKETS: Record<CpbBucket, string[]> = {
  cptCovered: [],
  cptNotCovered: [],
  hcpcsCovered: [],
  hcpcsNotCovered: [],
  icd10Covered: [],
  icd10NotCovered: [],
};

function bucketFor(kind: CodeMatch['kind'], covered: boolean): CpbBucket {
  if (kind === 'cpt') return covered ? 'cptCovered' : 'cptNotCovered';
  if (kind === 'hcpcs') return covered ? 'hcpcsCovered' : 'hcpcsNotCovered';
  return covered ? 'icd10Covered' : 'icd10NotCovered';
}

export function extractAetnaCpb(src: TextSource): FieldExtraction {
  const text = src.text;
  const seg = segmentCpb(text);
  const warnings: string[] = [];
  const provenance: FieldProvenance[] = [];

  const buckets: Record<CpbBucket, string[]> = {
    cptCovered: [],
    cptNotCovered: [],
    hcpcsCovered: [],
    hcpcsNotCovered: [],
    icd10Covered: [],
    icd10NotCovered: [],
  };
  const seen: Record<CpbBucket, Set<string>> = {
    cptCovered: new Set(),
    cptNotCovered: new Set(),
    hcpcsCovered: new Set(),
    hcpcsNotCovered: new Set(),
    icd10Covered: new Set(),
    icd10NotCovered: new Set(),
  };

  for (const region of seg.regions) {
    const covered = !region.bucket.includes('NotCovered');
    const regionText = text.slice(region.start, region.end);
    const matches = dedupeByCode(scanCodes(regionText, true)).map((m) =>
      absolutize(m, region.start)
    );
    for (const m of matches) {
      const bucket = bucketFor(m.kind, covered);
      if (seen[bucket].has(m.code)) continue;
      seen[bucket].add(m.code);
      buckets[bucket].push(m.code);
      provenance.push(
        makeProvenance(text, `codes.${bucket}[${buckets[bucket].length - 1}]`, m.span)
      );
    }
  }

  const indications = seg.indications.map((ind, i) => {
    provenance.push(makeProvenance(text, `indications[${i}].title`, ind.span));
    return { label: ind.label, title: ind.title };
  });

  const totalCodes = Object.values(buckets).reduce((n, b) => n + b.length, 0);
  if (totalCodes === 0 && indications.length === 0) {
    warnings.push('no codes or indications extracted — document may be an unrecognized CPB layout');
  }
  if (!seg.title) warnings.push('no title found');
  if (!seg.number) warnings.push('no CPB number found');

  const record: RawPolicyRecord = {
    sourceType: 'medical-clinical-policy-bulletin',
    source: 'Aetna',
    title: seg.title ?? 'Untitled Aetna CPB',
    number: seg.number,
    category: 'Medical Clinical Policy Bulletin',
    codes: { ...CPB_EMPTY_BUCKETS, ...buckets, cptOther: [], hcpcsOther: [] },
    indications,
    effectiveDate: seg.effectiveDate,
    sourceFile: src.sourceFile,
    rawTextChars: src.rawTextChars,
  };

  anchorInto(provenance, text, 'title', seg.title);
  anchorInto(provenance, text, 'number', seg.number);

  return { record, provenance, warnings };
}

function anchorInto(
  provenance: FieldProvenance[],
  text: string,
  field: string,
  value: string | null
): void {
  if (!value) return;
  const p = anchorValue(text, value, field);
  if (p) provenance.push(p);
}

export interface PaListHints {
  source?: string;
  plan?: string;
}

function detectSource(text: string): string | null {
  if (/United\s*Healthcare/i.test(text)) return 'UnitedHealthcare';
  if (/\bAetna\b/i.test(text)) return 'Aetna';
  const m = /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+Medicaid)/.exec(text);
  if (m && m[1]) return m[1].trim();
  // Tenant-agnostic fallback: a policy's first meaningful line names its payer/agency.
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return firstLine && firstLine.length <= 60 ? firstLine : null;
}

export function extractPaList(src: TextSource, hints: PaListHints = {}): FieldExtraction {
  const text = src.text;
  const seg = segmentPaList(text);
  const warnings: string[] = [];
  const provenance: FieldProvenance[] = [];

  const paItems: { category: string; codes: string[]; effectiveDate: string | null }[] = [];
  for (const cat of seg.categories) {
    const regionText = text.slice(cat.start, cat.end);
    const matches = dedupeByCode(scanCodes(regionText, true)).map((m) => absolutize(m, cat.start));
    if (matches.length === 0) {
      warnings.push(`category "${cat.category}" had no recognizable codes — skipped`);
      continue;
    }
    const codes: string[] = [];
    for (const m of matches) {
      codes.push(m.code);
      provenance.push(
        makeProvenance(text, `paItems[${paItems.length}].codes[${codes.length - 1}]`, m.span)
      );
    }
    paItems.push({ category: cat.category, codes, effectiveDate: seg.effectiveDate });
  }

  if (paItems.length === 0) {
    warnings.push(
      'no PA categories with codes found — document may be an unrecognized list layout'
    );
  }

  const source = hints.source ?? detectSource(text) ?? 'Unknown payer/agency';
  const plan = hints.plan ?? source;

  const record: RawPolicyRecord = {
    sourceType: 'prior-authorization-requirements-list',
    source,
    plan,
    paItems,
    effectiveDate: seg.effectiveDate,
    sourceFile: src.sourceFile,
    rawTextChars: src.rawTextChars,
  };

  return { record, provenance, warnings };
}
