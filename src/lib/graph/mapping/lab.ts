// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Labs/vitals mapping spec: recorded observation events -> the member's clinical
 * observation subgraph. ONE node type and a dated factual link:
 *
 *   (Member)-[:OBSERVED_FOR {valid from effectiveDateTime}]->(Observation)   associative
 *
 * OBSERVED_FOR is a FACTUAL link (associative), dated from the observation time so
 * an asOf query can ask "what was observed as of date X" and the whole-person lens
 * surfaces the Observation off the member. A LOINC-coded result/vital is not an
 * asserted causal claim, so the edge is associative; the measuring provenance
 * (lab-result-authoritative / clinician-measured) is carried onto the Observation
 * node as a PHI-safe attribute so downstream reads keep the source of record.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned labs-vitals namespace — the single source of truth the integrity test pins. */
export const LAB_DOMAIN = 'labs-vitals';
export const OBSERVATION_KIND = 'Observation';
export const OBSERVED_FOR = 'OBSERVED_FOR';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function loincCode(p: Record<string, unknown>): string {
  const l = (p.loinc ?? {}) as Record<string, unknown>;
  return str(l.code);
}

export const labSpec = {
  domain: LAB_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('observation.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const observationRef = str(p.observationRef, `Observation/${event.memberId}`);
    const start = str(p.effectiveDateTime) || event.occurredAt || new Date(deps.now()).toISOString();
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, OBSERVATION_KIND, observationRef, {
        loinc: loincCode(p),
        category: str(p.category, 'laboratory'),
        status: str(p.status, 'final'),
        provenance: str(p.provenance),
      }),
    );
    out.push({
      op: 'UpsertEdge',
      type: OBSERVED_FOR,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: OBSERVATION_KIND, key: observationRef },
      properties: { loinc: loincCode(p), category: str(p.category, 'laboratory') },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
