/**
 * Policy document extraction — shared types (RHTP Policy Engine, extractor layer).
 *
 * The extractor turns a policy DOCUMENT into one or more `RawPolicyRecord`s — the
 * exact shape the existing ingestion adapters (`aetnaCpb`, `uhcPaList`,
 * `genericPaList`) already consume. It NEVER produces a `NormalizedPolicy`
 * directly: the adapters remain the single source of truth for normalization.
 * The extractor's only job is to fill the "future importer" slot the ingest
 * layer documents.
 *
 * Everything downstream of `RawPolicyRecord` (adapters → library → engine →
 * Golden Thread) is unchanged.
 */
import type { RawPolicyRecord } from '../ingest';
import type { FieldProvenance } from './provenance';

/**
 * A text view of a source document, with a stable character index used for
 * provenance. Every provenance span is an offset into `text` — so `text` is the
 * canonical, immutable string the whole extraction reasons over.
 */
export interface TextSource {
  /** Original filename (or logical id) of the document. */
  sourceFile: string;
  /** MIME type the reader recognized (e.g. text/plain, application/pdf). */
  mimeType: string;
  /** The extracted text. Provenance spans index into THIS string. */
  text: string;
  /** Character count of the extracted text (populates NormalizedPolicy.rawTextChars). */
  rawTextChars: number;
  /** True when the text was recovered by OCR (the PDF had no text layer). */
  viaOcr?: boolean;
  /** Id of the OCR provider used, when viaOcr. */
  ocrProvider?: string;
}

/** The document kinds the extractor can produce records for. */
export type DocKind = 'aetna-cpb' | 'pa-list' | 'unknown';

/** One document's extraction: the raw record(s), field-level provenance, and warnings. */
export interface ExtractionResult {
  kind: DocKind;
  /** Records in adapter-ready shape. Empty when nothing usable was found. */
  records: RawPolicyRecord[];
  /** Byte/char-anchored provenance for every extracted field value. */
  provenance: FieldProvenance[];
  /** Non-fatal problems: skipped regions, empty sections, ambiguous headers. */
  warnings: string[];
}

/** The output of one field-extraction pass (CPB or PA-list). */
export interface FieldExtraction {
  record: RawPolicyRecord;
  provenance: FieldProvenance[];
  warnings: string[];
}
