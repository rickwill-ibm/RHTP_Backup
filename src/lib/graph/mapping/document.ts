// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Documents mapping spec: document-referenced events -> the member's document
 * subgraph. ONE new node type and a dated associative link to the member:
 *
 *   (Member)-[:DOCUMENTED_BY {valid from date}]->(DocumentReference)   associative
 *
 * DOCUMENTED_BY is a FACTUAL document-attachment link (associative), dated from the
 * document date so an asOf query can ask "what documents were on file as of X" and
 * the whole-person lens surfaces the DocumentReference off the member. This is a
 * TIER T2 node: it carries the document TYPE code + a content POINTER and the
 * `computable: false` marker, honestly stating that no T1 clinical data was
 * extracted from the attachment. The projector emits a pointer, not parsed content
 * — a CCD/PDF is human-readable, not computable, and we do not pretend otherwise.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned documents namespace — the single source of truth the integrity test pins. */
export const DOCUMENT_DOMAIN = 'documents';
export const DOCUMENT_REFERENCE_KIND = 'DocumentReference';
export const DOCUMENTED_BY = 'DOCUMENTED_BY';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function docTypeCode(p: Record<string, unknown>): string {
  const t = (p.docType ?? {}) as Record<string, unknown>;
  return str(t.code);
}
function contentUrl(p: Record<string, unknown>): string {
  const c = (p.content ?? {}) as Record<string, unknown>;
  return str(c.url);
}
function contentType(p: Record<string, unknown>): string {
  const c = (p.content ?? {}) as Record<string, unknown>;
  return str(c.contentType);
}

export const documentSpec = {
  domain: DOCUMENT_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('document.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const docRef = str(p.documentReferenceRef, `DocumentReference/${event.memberId}`);
    const start = str(p.date) || event.occurredAt || new Date(deps.now()).toISOString();
    const out: Mutation[] = [memberNode(event)];
    // T2: the node carries the doc TYPE + a content POINTER + computable:false.
    // No parsed clinical body is ever projected from the attachment.
    out.push(
      ...resourceNode(event, DOCUMENT_REFERENCE_KIND, docRef, {
        docType: docTypeCode(p),
        status: str(p.status, 'current'),
        contentUrl: contentUrl(p),
        contentType: contentType(p),
        computable: false,
        provenance: str(p.provenance),
      }),
    );
    // The member is DOCUMENTED_BY this document reference — a factual attachment
    // link (associative), dated from the document date. Not a causal assertion.
    out.push({
      op: 'UpsertEdge',
      type: DOCUMENTED_BY,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: DOCUMENT_REFERENCE_KIND, key: docRef },
      properties: { docType: docTypeCode(p), provenance: str(p.provenance) },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
