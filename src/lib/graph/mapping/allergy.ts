// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Allergies mapping spec: recorded allergy events -> the member's allergy
 * subgraph. ONE node type and a dated CAUSAL link:
 *
 *   (Member)-[:ALLERGIC_TO {causal, asserter, basis}]->(AllergyIntolerance)   causal
 *
 * An allergy is not an observed co-occurrence: a clinician ASSERTS that the member
 * reacts to the allergen. Under DP-1 that asserted claim MUST be a CAUSAL edge that
 * carries provenance: `asserter` = the asserting source (clinician-asserted),
 * `basis` = the allergen code + allergy ref (PHI-safe). The edge is dated from the
 * recordedDate so an asOf query can ask "what allergies were on record as of X",
 * and the whole-person lens surfaces the AllergyIntolerance off the member.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, causal, memberNode, resourceNode } from './spec';

/** Pinned allergies namespace — the single source of truth the integrity test pins. */
export const ALLERGY_DOMAIN = 'allergies';
export const ALLERGY_KIND = 'AllergyIntolerance';
export const ALLERGIC_TO = 'ALLERGIC_TO';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function allergenCode(p: Record<string, unknown>): string {
  const c = (p.code ?? {}) as Record<string, unknown>;
  return str(c.code);
}

export const allergySpec = {
  domain: ALLERGY_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('allergy.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const allergyRef = str(p.allergyRef, `AllergyIntolerance/${event.memberId}`);
    const start = str(p.recordedDate) || event.occurredAt || new Date(deps.now()).toISOString();
    const asserter = str(p.provenance, event.source.system);
    const code = allergenCode(p);
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, ALLERGY_KIND, allergyRef, {
        code,
        criticality: str(p.criticality, 'low'),
        clinicalStatus: str(p.clinicalStatus, 'active'),
        category: str(p.category),
      })
    );
    // The member IS allergic to the allergen — an asserted clinical claim, so a
    // CAUSAL edge carrying who asserted it + the allergen code @ allergy ref.
    out.push({
      op: 'UpsertEdge',
      type: ALLERGIC_TO,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: ALLERGY_KIND, key: allergyRef },
      properties: { code, criticality: str(p.criticality, 'low') },
      validity: { start, end: null },
      semantics: causal(asserter, `${code || 'no-code'}@${allergyRef}`),
    });
    return out;
  },
};
