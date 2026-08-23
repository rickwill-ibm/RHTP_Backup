// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Behavioral-health mapping spec: a behavioral-health Condition event -> the
 * member's condition subgraph.
 *
 *   (Member)-[:HAS_CONDITION {valid from recordedDate}]->(Condition)   associative
 *
 * HAS_CONDITION is the factual "member has this condition" link (associative,
 * dated from the recorded date), so an asOf query can ask "what conditions as of
 * date X" and the whole-person lens surfaces the Condition off the member.
 *
 * F2 (42 CFR Part 2): restriction is read from the ENVELOPE, never the payload.
 * `resourceNode` sets `restricted` and appends the 42-CFR-Part-2 label the pipeline
 * stamped, so the SUD subset projects as a RESTRICTED Condition node by envelope
 * inspection alone (C10.1) — the consent-scoped lens then excludes it without a
 * covering scope. A restricted Condition also carries the durable
 * `reDisclosureProhibited` marker on the node itself: any disclosure of Part 2 data
 * is subject to the re-disclosure prohibition, so the marker travels WITH the node.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { associative, isRestricted, memberNode, resourceNode } from './spec';

/** Pinned behavioral-health namespace — the single source of truth for the pin test. */
export const BEHAVIORAL_HEALTH_DOMAIN = 'behavioral-health';
export const CONDITION_KIND = 'Condition';
export const HAS_CONDITION = 'HAS_CONDITION';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function dxCode(p: Record<string, unknown>): string {
  const code = (p.code ?? {}) as Record<string, unknown>;
  return str(code.code);
}

export const behavioralHealthSpec = {
  domain: BEHAVIORAL_HEALTH_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('behavioral-health.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const conditionRef = str(p.conditionRef, `Condition/${event.memberId}`);
    const start = str(p.recordedDate) || event.occurredAt || new Date(deps.now()).toISOString();
    const restricted = isRestricted(event);
    const out: Mutation[] = [memberNode(event)];
    // resourceNode applies restricted + segmentation labels from the envelope, so
    // the SUD (Part 2) subset becomes a RESTRICTED node with the 42-CFR-Part-2 label.
    out.push(
      ...resourceNode(event, CONDITION_KIND, conditionRef, {
        code: dxCode(p),
        category: str(p.category, 'behavioral-health'),
        clinicalStatus: str(p.clinicalStatus, 'active'),
        // The re-disclosure prohibition travels with a Part 2 node (42 CFR 2.32).
        reDisclosureProhibited: restricted,
      }),
    );
    out.push({
      op: 'UpsertEdge',
      type: HAS_CONDITION,
      from: { kind: 'Member', key: event.memberId },
      to: { kind: CONDITION_KIND, key: conditionRef },
      properties: { code: dxCode(p) },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
