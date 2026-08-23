// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Encounter mapping spec: ADT triggers -> the member's clinical-event subgraph.
 *
 *   (Member)-[:HAD_ENCOUNTER {valid from occurredAt}]->(Encounter)
 *
 * The edge is ASSOCIATIVE and DATED from the encounter time. A chemical-dependency
 * encounter arrives with a 42 CFR Part 2 label on the envelope (the pipeline's
 * segmentation-at-transform); it therefore projects as a RESTRICTED Encounter node
 * carrying that segmentation label — the graph never needs the payload to know a
 * node is Part 2 (C10.1). A discharge additionally CLOSES the encounter's validity.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

const ENCOUNTER_KIND = 'Encounter';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export const encounterSpec = {
  domain: 'encounter',
  matches(eventType: string): boolean {
    return eventType.startsWith('encounter.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const encounterRef = str(p.encounterRef, `Encounter/${event.memberId}`);
    const start = event.occurredAt || new Date(deps.now()).toISOString();
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, ENCOUNTER_KIND, encounterRef, {
        encounterClass: str(p.encounterClass, 'IMP'),
        trigger: str(p.trigger),
        pointOfCare: str(p.pointOfCare),
      }),
    );
    out.push({
      op: 'UpsertEdge',
      type: 'HAD_ENCOUNTER',
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: ENCOUNTER_KIND, key: encounterRef },
      properties: { encounterClass: str(p.encounterClass, 'IMP') },
      validity: { start, end: event.eventType === 'encounter.discharged' ? start : null },
      semantics: associative,
    });
    return out;
  },
};
