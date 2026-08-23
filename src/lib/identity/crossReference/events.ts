// DP-7  // CONTRACT: C2
/**
 * C2 event builders for the cross-reference operations.
 *
 * link / unlink / merge / unmerge each emit a memberId-partitioned C2 envelope so
 * the graph projectors rekey by REPLAY (never an in-place key rewrite). The merge
 * and unmerge event types are the SAME constants the graph replay recognizes
 * (src/lib/graph/replay.ts), so a merge emitted here flows straight through
 * resolveIdentity + rekeyEvents and lands the subsumed member's subgraph on the
 * survivor. Ids/time are deterministic under injected now/rng (clock.ts), so the
 * whole emission path is testable without mocking globals.
 */
import { uuidV4, validateEnvelope, type C2Event } from '@/lib/outbox';
import { MERGE_EVENT, UNMERGE_EVENT } from '@/lib/graph/replay';
import type { XrefEventDeps } from './types';

export const XREF_LINKED_EVENT = 'identity.xref-linked';
export const XREF_UNLINKED_EVENT = 'identity.xref-unlinked';

function envelope(
  eventType: string,
  memberId: string,
  payload: Record<string, unknown>,
  deps: XrefEventDeps,
): C2Event {
  const recordedAt = new Date(deps.now()).toISOString();
  const event: C2Event = {
    eventId: uuidV4(deps.rng),
    eventType,
    eventVersion: '1.0',
    occurredAt: recordedAt,
    recordedAt,
    memberId,
    partitionKey: memberId,
    class: 'stream',
    sequence: 0,
    correlationId: `xref-${memberId}`,
    idempotencyKey: `${eventType}:${memberId}:${JSON.stringify(payload)}`,
    source: { system: 'identity', feed: 'cross-reference' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
  validateEnvelope(event);
  return event;
}

/** identity.xref-linked, partitioned by the linked member id. */
export function linkedEvent(
  sourceId: string,
  memberId: string,
  feed: string | undefined,
  deps: XrefEventDeps,
): C2Event {
  return envelope(XREF_LINKED_EVENT, memberId, { sourceId, memberId, feed: feed ?? null }, deps);
}

/** identity.xref-unlinked, partitioned by the (formerly) linked member id. */
export function unlinkedEvent(
  sourceId: string,
  memberId: string,
  deps: XrefEventDeps,
): C2Event {
  return envelope(XREF_UNLINKED_EVENT, memberId, { sourceId, memberId }, deps);
}

/** member.merged (DP-7), partitioned by the surviving member id. */
export function mergedEvent(
  survivingMemberId: string,
  mergedMemberId: string,
  deps: XrefEventDeps,
): C2Event {
  return envelope(
    MERGE_EVENT,
    survivingMemberId,
    { survivingMemberId, mergedMemberId },
    deps,
  );
}

/** member.unmerged (DP-7), partitioned by the surviving member id. */
export function unmergedEvent(
  survivingMemberId: string,
  mergedMemberId: string,
  deps: XrefEventDeps,
): C2Event {
  return envelope(
    UNMERGE_EVENT,
    survivingMemberId,
    { survivingMemberId, mergedMemberId },
    deps,
  );
}
