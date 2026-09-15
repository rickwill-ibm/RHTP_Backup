// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Caregiver-household mapping spec: caregiver-related events -> the member's
 * household subgraph. ONE new node type and a dated associative link to the member,
 * carrying the coded relationship role on the edge:
 *
 *   (Member)-[:RELATED_TO {role, valid from periodStart}]->(RelatedPerson)   associative
 *
 * RELATED_TO is a FACTUAL relationship-record link (associative), dated from the
 * period start so an asOf query can ask "who was on record as a caregiver as of X"
 * and the whole-person lens surfaces the RelatedPerson off the member. The
 * relationship ROLE (spouse, guardian, primary caregiver) rides the edge as a PHI-
 * safe coded property — it is a recorded relationship, not an asserted causal claim.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned caregiver-household namespace — the single source of truth the test pins. */
export const CAREGIVER_DOMAIN = 'caregiver-household';
export const RELATED_PERSON_KIND = 'RelatedPerson';
export const RELATED_TO = 'RELATED_TO';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function bool(v: unknown): boolean {
  return v === true;
}
function roleCode(p: Record<string, unknown>): string {
  const rel = (p.relationship ?? {}) as Record<string, unknown>;
  return str(rel.code);
}

export const caregiverSpec = {
  domain: CAREGIVER_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('caregiver.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const relatedPersonRef = str(p.relatedPersonRef, `RelatedPerson/${event.memberId}`);
    const start = str(p.periodStart) || event.occurredAt || new Date(deps.now()).toISOString();
    const role = roleCode(p);
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, RELATED_PERSON_KIND, relatedPersonRef, {
        role,
        active: bool(p.active),
        provenance: str(p.provenance),
      })
    );
    // The member is RELATED_TO this person — a factual relationship-record link
    // (associative), dated from the period start. The relationship ROLE rides the
    // edge as a coded property, not a causal assertion.
    out.push({
      op: 'UpsertEdge',
      type: RELATED_TO,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: RELATED_PERSON_KIND, key: relatedPersonRef },
      properties: { role, provenance: str(p.provenance) },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
