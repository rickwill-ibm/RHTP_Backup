// CONTRACT: C9  // CONTRACT: C10
/**
 * Documents FHIR-JSON adapter (arrival mode: batch). Parses a synthetic FHIR
 * DocumentReference feed into normalized document records at tier **T2**.
 *
 * T2 IS THE POINT, AND IT IS AN HONEST TIER. A DocumentReference points at a
 * CCD, a scanned PDF, a discharge summary — a document that is attached and
 * human-readable but NOT computable. This adapter deliberately does NOT parse the
 * attachment: it carries the document TYPE code (LOINC), the content POINTER
 * (attachment url + contentType + title), and provenance — and nothing that
 * pretends to be extracted structured clinical data. A CCD's problems, meds, and
 * results would be T1 domains in their own right, arriving through their own coded
 * feeds; claiming them here from an opaque attachment would be a fidelity lie.
 * So the tier is T2 and the payload is a pointer, not parsed content.
 *
 * The graph mapping turns each into a dated associative DOCUMENTED_BY edge from the
 * member to the DocumentReference. Generic over records: no member is hardcoded; the
 * subject reference is anchored through the injected identity seam (plan §1.2).
 *
 * C9.2 yield: documents feed -> documents T2 (document-level, NOT computable T1).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

/** One tagged FHIR DocumentReference pulled from the bundle. */
interface DocumentReferenceResource {
  resource: Record<string, unknown>;
}

/** An opaque content pointer — where the document lives, never its parsed body. */
export interface DocumentPointer {
  url: string;
  contentType: string;
  title: string;
}

/**
 * Normalized document payload (the DocumentReference node's projection seed). It
 * is a POINTER + TYPE, tier T2: `computable: false` states plainly that no T1
 * clinical data was (or could honestly be) extracted from the attachment.
 */
export interface DocumentPayload {
  documentReferenceRef: string;
  /** LOINC document-type coding (e.g. 34133-9 Summary of episode note); code may be ''. */
  docType: { system: string; code: string; display: string };
  status: string;
  date: string;
  /** The content pointer; the attachment is NOT fetched or parsed here. */
  content: DocumentPointer;
  /** Always false at T2: a document-level record claims no computable clinical data. */
  computable: false;
  /** Carried onto the DocumentReference node/edge as the source repository (PHI-safe). */
  provenance: string;
}

const SOURCE = { system: 'document-hub', feed: 'documents-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** subject.reference "Patient/DOC-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** type.coding[0] as a LOINC document-type coding triple (code may be ''). */
function docType(resource: Record<string, unknown>): { system: string; code: string; display: string } {
  const coding = obj(resource.type).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return {
    system: str(first.system, 'http://loinc.org'),
    code: str(first.code),
    display: str(first.display),
  };
}
/** content[0].attachment as the opaque content pointer (url + contentType + title). */
function contentPointer(resource: Record<string, unknown>): DocumentPointer {
  const content = Array.isArray(resource.content) ? obj(resource.content[0]) : {};
  const attachment = obj(content.attachment);
  return {
    url: str(attachment.url),
    contentType: str(attachment.contentType),
    title: str(attachment.title),
  };
}

function parse(payload: string): RawRecord<DocumentReferenceResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<DocumentReferenceResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'DocumentReference') continue;
    const id = str(resource.id) || `doc-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<DocumentReferenceResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource)) issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (!contentPointer(resource).url) issues.push({ reasonCode: 'missing-content-pointer', fieldPath: 'content.attachment.url' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<DocumentReferenceResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const docId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const documentReferenceRef = `DocumentReference/${docId}`;
  const date = str(resource.date);
  const payload: DocumentPayload = {
    documentReferenceRef,
    docType: docType(resource),
    status: str(resource.status, 'current'),
    date,
    content: contentPointer(resource),
    computable: false,
    provenance: 'document-repository',
  };
  return {
    domain: 'documents',
    memberId,
    resourceType: 'DocumentReference',
    fhirResourceId: documentReferenceRef,
    eventType: 'document.referenced',
    // T2, honestly: a document-level record is attached + human-readable, NOT
    // computable T1. See the module header — the attachment is never parsed.
    tier: 'T2',
    idempotencyKey: `document:${docId}`,
    provenance: 'document-repository',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: date ? date : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The documents FHIR-JSON batch adapter (DocumentReference, tier T2). */
export const documentAdapter: DomainAdapter<DocumentReferenceResource> = {
  source: SOURCE,
  domain: 'documents',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
