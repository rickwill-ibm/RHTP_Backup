// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Flag mapping spec: a clinical/administrative Flag event -> the member's alert
 * subgraph. ONE node type and a dated associative link:
 *
 *   (Member)-[:HAS_FLAG {valid from period.start}]->(Flag)
 *
 * The edge is ASSOCIATIVE (a factual "this alert is on the member" link) and DATED
 * from the flag period start, so an asOf query can ask "what flags were active on
 * date X". The node carries the Flag.category coding CODE + status + period ONLY —
 * NEVER Flag.code.text, which is free-text PHI narrative (PHI-minimal projection).
 * A Flag whose category/code coding indicates SUD (F10–F19) arrives with a
 * 42 CFR Part 2 label on the envelope (segmentation-at-transform); it therefore
 * projects as a RESTRICTED Flag node carrying that segmentation label, so the graph
 * never needs the payload to know a node is Part 2 (C10.1). Restriction is read
 * from the envelope so the DP-1 rule is uniform.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned flag namespace — the single source of truth. */
export const FLAG_DOMAIN = 'flag';
export const FLAG_KIND = 'Flag';
export const HAS_FLAG = 'HAS_FLAG';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export const flagSpec = {
  domain: FLAG_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('flag.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const flagRef = str(p.flagRef, `Flag/${event.memberId}`);
    const periodStart =
      str(p.periodStart) || event.occurredAt || new Date(deps.now()).toISOString();
    const periodEnd = str(p.periodEnd) || null;
    const status = str(p.status, 'active');
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, FLAG_KIND, flagRef, {
        categoryCode: str(p.categoryCode, 'clinical'),
        status,
        periodStart,
        periodEnd: periodEnd ?? '',
      })
    );
    out.push({
      op: 'UpsertEdge',
      type: HAS_FLAG,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: FLAG_KIND, key: flagRef },
      properties: { categoryCode: str(p.categoryCode, 'clinical'), status },
      validity: { start: periodStart, end: periodEnd },
      semantics: associative,
    });
    return out;
  },
};
