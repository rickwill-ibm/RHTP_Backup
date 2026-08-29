/**
 * Policy document extractor — public entry point.
 *
 * Turns a `TextSource` (produced by a reader) into adapter-ready
 * `RawPolicyRecord`s with provenance, then optionally runs them through the
 * EXISTING ingestion adapters to produce `NormalizedPolicy`s. The extractor owns
 * document→record; the adapters own record→normalized. Neither reaches into the
 * other.
 */
import { ingestRecords, type RawPolicyRecord } from '../ingest';
import type { NormalizedPolicy } from '../types';
import type { DocKind, ExtractionResult, TextSource } from './types';
import type { FieldProvenance } from './provenance';
import { extractAetnaCpb, extractPaList, type PaListHints } from './fields';
import { segmentPaList } from './segment';

export interface ExtractHints extends PaListHints {
  kind?: DocKind;
}

/** Classify a document by its text. Falls back to structural evidence when unlabeled. */
export function detectDocKind(src: TextSource): DocKind {
  const t = src.text.toLowerCase();
  const looksCpb = /clinical policy bulletin/.test(t) || /\bmedical necessity\b/.test(t);
  const looksPaList = /prior authorization/.test(t) || /pa[- ]required/.test(t);
  if (looksCpb && !looksPaList) return 'aetna-cpb';
  if (looksPaList && !looksCpb) return 'pa-list';
  if (looksCpb && looksPaList) {
    // Ambiguous label: let structure decide. Categorized code tables ⇒ PA list.
    return segmentPaList(src.text).categories.length > 0 ? 'pa-list' : 'aetna-cpb';
  }
  // Unlabeled: infer from structure only.
  return segmentPaList(src.text).categories.length > 0 ? 'pa-list' : 'unknown';
}

/** Extract the record(s) from a single document. */
export function extractDocument(src: TextSource, hints: ExtractHints = {}): ExtractionResult {
  const kind = hints.kind ?? detectDocKind(src);
  if (kind === 'aetna-cpb') {
    const fe = extractAetnaCpb(src);
    return { kind, records: [fe.record], provenance: fe.provenance, warnings: fe.warnings };
  }
  if (kind === 'pa-list') {
    const fe = extractPaList(src, hints);
    const records = (fe.record.paItems as unknown[]).length > 0 ? [fe.record] : [];
    const warnings =
      records.length === 0 ? [...fe.warnings, 'no usable record produced'] : fe.warnings;
    return { kind, records, provenance: fe.provenance, warnings };
  }
  return {
    kind: 'unknown',
    records: [],
    provenance: [],
    warnings: ['could not classify document as an Aetna CPB or a PA-requirement list'],
  };
}

export interface ExtractAndIngestResult {
  policies: NormalizedPolicy[];
  provenance: FieldProvenance[];
  warnings: string[];
  /** Records that no adapter recognized (extraction produced a record, ingest rejected it). */
  skipped: number;
}

/** Extract records from documents and run them through the real ingestion adapters. */
export function extractAndIngest(
  sources: readonly TextSource[],
  hints: ExtractHints = {}
): ExtractAndIngestResult {
  const records: RawPolicyRecord[] = [];
  const provenance: FieldProvenance[] = [];
  const warnings: string[] = [];
  for (const src of sources) {
    const r = extractDocument(src, hints);
    records.push(...r.records);
    provenance.push(...r.provenance);
    for (const w of r.warnings) warnings.push(`${src.sourceFile}: ${w}`);
  }
  const { policies, skipped } = ingestRecords(records);
  return { policies, provenance, warnings, skipped };
}

export type { TextSource, ExtractionResult, DocKind } from './types';
export type { FieldProvenance, Span } from './provenance';
export { verifyAnchor, findBrokenAnchors } from './provenance';
export {
  plainTextReader,
  makeReader,
  ReaderRegistry,
  ReaderNotWiredError,
  type DocumentReader,
} from './readers';
