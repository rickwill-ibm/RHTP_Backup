// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Family-history mapping spec: a FamilyMemberHistory event -> the member's
 * family-history subgraph. ONE node type and a dated associative link:
 *
 *   (Member)-[:HAS_FAMILY_HISTORY {valid from recordedDate}]->(FamilyMemberHistory)  associative
 *
 * HAS_FAMILY_HISTORY is the factual "this family history is on the member's chart"
 * link (associative, dated), so an asOf query can ask "what family history was on
 * file as of X" and the whole-person lens surfaces the FamilyMemberHistory off the
 * member. The relationship role and the coded conditions attributed to the relative
 * ride as node properties — the relative is never a graph node (PHI-minimal: no
 * name, no anchored identity for a non-member). It is an associative attachment,
 * not a causal claim about the member's own conditions.
 *
 * The pinned namespace (L3) is exported so the family-history namespace-integrity
 * test can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned family-history namespace — the single source of truth the pin test uses. */
export const FAMILY_HISTORY_DOMAIN = 'family-history';
export const FAMILY_MEMBER_HISTORY_KIND = 'FamilyMemberHistory';
export const HAS_FAMILY_HISTORY = 'HAS_FAMILY_HISTORY';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
/** The coded conditions attributed to the relative, as a flat code list (PHI-safe). */
function conditionCodes(p: Record<string, unknown>): string[] {
  const conditions = p.conditions;
  if (!Array.isArray(conditions)) return [];
  return conditions.map((c) => str((c as Record<string, unknown>).code)).filter((c) => c !== '');
}

export const familyHistorySpec = {
  domain: FAMILY_HISTORY_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('family-history.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const fmhRef = str(p.familyMemberHistoryRef, `FamilyMemberHistory/${event.memberId}`);
    const start = str(p.recordedDate) || event.occurredAt || new Date(deps.now()).toISOString();
    const relationship = str(p.relationship);
    const codes = conditionCodes(p);
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, FAMILY_MEMBER_HISTORY_KIND, fmhRef, {
        relationship,
        conditionCodes: codes,
        status: str(p.status, 'completed'),
        provenance: str(p.provenance),
      })
    );
    // The member's chart HAS this family history — factual attachment (associative), dated.
    out.push({
      op: 'UpsertEdge',
      type: HAS_FAMILY_HISTORY,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: FAMILY_MEMBER_HISTORY_KIND, key: fmhRef },
      properties: { relationship },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
