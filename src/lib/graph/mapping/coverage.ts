// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Coverage mapping spec: 834 eligibility -> the member's insurance subgraph.
 *
 *   (Member)-[:HAS_COVERAGE {valid from periodStart}]->(Coverage)
 *
 * The HAS_COVERAGE edge is ASSOCIATIVE (a factual enrollment link, not an asserted
 * causal claim) and DATED from the coverage period start, so an asOf query can ask
 * "what coverage was active on date X". Coverage is payer-authoritative and never
 * Part 2, but restriction is still read from the envelope so the rule is uniform.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

const COVERAGE_KIND = 'Coverage';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export const coverageSpec = {
  domain: 'coverage',
  matches(eventType: string): boolean {
    return eventType.startsWith('coverage.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const coverageRef = str(p.coverageRef, `Coverage/${event.memberId}`);
    const periodStart = str(p.periodStart) || isoDate(event.occurredAt, deps);
    // A termination (INS-3 024/030) carries a coverage END; it closes the
    // enrollment edge's validity rather than leaving it open, so an asOf query
    // after the end date sees the member as DISENROLLED, not still covered.
    const periodEnd = str(p.periodEnd) || null;
    const status = str(p.status, 'active');
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, COVERAGE_KIND, coverageRef, {
        planCode: str(p.planCode, 'UNK'),
        status,
        periodStart,
        periodEnd: periodEnd ?? '',
        maintenanceTypeCode: str(p.maintenanceTypeCode),
      }),
    );
    out.push({
      op: 'UpsertEdge',
      type: 'HAS_COVERAGE',
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: COVERAGE_KIND, key: coverageRef },
      properties: { planCode: str(p.planCode, 'UNK'), status },
      validity: { start: periodStart, end: periodEnd },
      semantics: associative,
    });
    return out;
  },
};

function isoDate(occurredAt: string, deps: ProjectorDeps): string {
  return occurredAt || new Date(deps.now()).toISOString();
}
