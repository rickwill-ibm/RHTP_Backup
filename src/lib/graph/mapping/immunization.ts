// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Immunizations mapping spec: immunization administration events -> the member's
 * immunization subgraph. ONE new node type and a dated associative link to the
 * member:
 *
 *   (Member)-[:IMMUNIZED_WITH {valid from occurrenceDateTime}]->(Immunization)   associative
 *
 * IMMUNIZED_WITH is a FACTUAL administration-record link (associative), dated from
 * the occurrence date so an asOf query can ask "what immunizations were on record
 * as of X" and the whole-person lens surfaces the Immunization off the member. It
 * mirrors the labs-vitals OBSERVED_FOR factual-record semantics: an immunization is
 * a recorded event, not an asserted causal claim about the member's state. The
 * registry provenance travels as a node/edge property (PHI-safe), never as an
 * anonymous causal assertion.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned immunizations namespace — the single source of truth the integrity test pins. */
export const IMMUNIZATION_DOMAIN = 'immunizations';
export const IMMUNIZATION_KIND = 'Immunization';
export const IMMUNIZED_WITH = 'IMMUNIZED_WITH';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function cvxCode(p: Record<string, unknown>): string {
  const c = (p.cvx ?? {}) as Record<string, unknown>;
  return str(c.code);
}

export const immunizationSpec = {
  domain: IMMUNIZATION_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('immunization.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const immunizationRef = str(p.immunizationRef, `Immunization/${event.memberId}`);
    const start = str(p.occurrenceDateTime) || event.occurredAt || new Date(deps.now()).toISOString();
    const code = cvxCode(p);
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, IMMUNIZATION_KIND, immunizationRef, {
        cvx: code,
        status: str(p.status, 'completed'),
        occurrenceDateTime: str(p.occurrenceDateTime),
        provenance: str(p.provenance),
      }),
    );
    // The member was IMMUNIZED_WITH this vaccine — a factual administration-record
    // link (associative), dated from the occurrence date. Provenance is an edge
    // property, not a causal assertion (a recorded event, not a claim).
    out.push({
      op: 'UpsertEdge',
      type: IMMUNIZED_WITH,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: IMMUNIZATION_KIND, key: immunizationRef },
      properties: { cvx: code, provenance: str(p.provenance) },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
