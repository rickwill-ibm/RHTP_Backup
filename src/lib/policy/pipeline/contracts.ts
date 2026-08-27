/**
 * S0 contracts — the frozen type shapes the pipeline waves (S1–S8) build against.
 * TYPES ONLY (rides the types-only gate exemption). Runtime lives in anchor/, audit/,
 * promote/. These extend the Phase-0 freeze; nothing here is wired yet.
 */
import type { SourceAnchorV2, ProvenanceClass, AnchorSpan } from '../anchor/verify';
import type { InputClass, DlpFinding } from '../audit/modelClient';
import type { AutonomyLevel, AuthoritativeSource, CriteriaSelector } from '../promote/loadPromoted';

export interface BBox {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface LayoutBlock {
  page: number;
  bbox?: BBox;
  text: string;
}

/** A single canonical document after the Loader (S1). */
export interface CanonicalDoc {
  docId: string;
  sourceFile: string;
  provenanceClass: ProvenanceClass;
  text: string; // flat canonical text; charSpans index into this
  blocks?: LayoutBlock[]; // layout-aware blocks with an offset map back to (page, bbox)
  sourceContentHash: string; // hash of source image/container bytes (OCR-stable)
  loaderVersion: string;
}

export type SegmentKind =
  'heading' | 'prose' | 'list' | 'table' | 'code-block' | 'metadata' | 'boilerplate';

export type DocType =
  'clinical-necessity-policy' | 'pa-code-list' | 'medicaid-coverage-manual' | string;

export interface Segment {
  segmentId: string;
  docId: string;
  kind: SegmentKind;
  docType: DocType; // assigned PER SEGMENT, not per document
  charSpan: [number, number];
}
export interface SegmentedDoc {
  docId: string;
  segments: Segment[];
}

export interface FieldSpec {
  name: string;
  type: 'boolean' | 'enum' | 'code-list' | 'date' | 'criteria-tree' | 'text';
  required: boolean;
  allowedCodeSystems?: string[];
}
export interface ExtractionSchema {
  schemaId: string;
  version: string;
  docType: DocType;
  fields: FieldSpec[];
}

export interface FieldCandidate {
  field: string;
  value: unknown;
  spans: AnchorSpan[];
  confidence: number; // calibrated per (schema, field-type, model)
  sourced: boolean; // false when the model could not cite an anchor
}
export interface ExtractionResult {
  docId: string;
  schemaId: string;
  candidates: FieldCandidate[];
}

export type ValidationOutcome = 'accepted' | 'needs-review' | 'rejected' | 'blocked';
export interface ValidatedField {
  field: string;
  value: unknown;
  anchor: SourceAnchorV2;
  outcome: ValidationOutcome;
  confidence: number;
}
export interface ValidatedExtraction {
  docId: string;
  schemaId: string;
  fields: ValidatedField[];
}

/** A normalized-policy candidate awaiting maker-checker promotion. Never live. */
export interface CandidatePolicyBundle {
  policyId: string;
  state: 'candidate';
  provenanceClass: ProvenanceClass;
  selector?: CriteriaSelector;
  authoritativeSource?: AuthoritativeSource;
  provenance: SourceAnchorV2[];
}

// ---- AI evidence (minted at decision time; see plan §7) ----
export interface AIModelCall {
  purpose: string;
  model: string;
  modelVersion: string;
  promptHash: string;
  inputClass: InputClass;
  confidence: number;
  dlp: { ran: boolean; findings: DlpFinding[]; blocked: boolean };
}

export type InfluenceMode = 'advisory' | 'derived-field' | 'informational'; // never 'decisional'

export interface AIEvidenceRecord {
  id: string;
  createdAt: string;
  surface: 'crd' | 'dtr' | 'pas' | 'copilot' | 'assistant' | 'extraction';
  influenceMode: InfluenceMode;
  autonomyLevel: AutonomyLevel; // hook: expressible from day one, pinned to HITL
  oversightMode: 'human-in-the-loop' | 'human-on-the-loop' | 'autonomous';
  modelCalls: AIModelCall[];
  citations: SourceAnchorV2[];
  confidence: number;
  belowThreshold: boolean;
  failClosedReason?: string;
  recordHash: string;
  prevRecordHash?: string;
}
