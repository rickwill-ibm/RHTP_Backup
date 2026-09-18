// CONTRACT: C10  // DP-7  // §4A stage 5
/**
 * Identity resolution + rebuild-from-replay (DP-7).
 *
 * DP-7 is explicit that identity merge is handled by REPLAY, never an in-place key
 * rewrite: "a merge event flows through C10 and every projector rekeys by replay
 * (no in-place key rewrites); unmerge is the same event class in reverse". The
 * golden view is a projection, so rebuilding applies the CURRENT identity resolution
 * to the WHOLE event history and re-projects from scratch.
 *
 * Two control event types carry identity resolution (they emit no graph mutations
 * themselves - no mapping spec owns `member.*`, so the projector skips them):
 *
 *   member.merged   payload { survivingMemberId, mergedMemberId }
 *   member.unmerged payload { survivingMemberId, mergedMemberId }   (reverses it)
 *
 * `resolveIdentity` folds the control events (in stream order) into the final map
 * `mergedMemberId -> survivingMemberId`, with path-compression so a chain
 * A->B, B->C resolves A to C. `rekeyEvents` rewrites each domain event's memberId
 * through that map BEFORE projection, so every node/edge lands under the survivor
 * with no store-side key mutation. Drop the control events and re-project: the
 * merged graph is correct, and removing the merge event (or adding the unmerge)
 * and replaying reverses it exactly.
 */
import type { C2Event } from '@/lib/outbox';
import type { GraphStore, Mutation, ProjectorDeps } from './types';
import { project } from './projector';

export const MERGE_EVENT = 'member.merged';
export const UNMERGE_EVENT = 'member.unmerged';

/** A resolved identity map: a subsumed member id -> its surviving member id. */
export type IdentityResolution = ReadonlyMap<string, string>;

interface MergePair {
  survivingMemberId: string;
  mergedMemberId: string;
}

function mergePair(event: C2Event): MergePair | null {
  const p = event.payload;
  const surviving = typeof p.survivingMemberId === 'string' ? p.survivingMemberId : '';
  const merged = typeof p.mergedMemberId === 'string' ? p.mergedMemberId : '';
  if (!surviving || !merged || surviving === merged) return null;
  return { survivingMemberId: surviving, mergedMemberId: merged };
}

/** Follow the map to the ultimate survivor (path compression over merge chains). */
function survivorOf(map: Map<string, string>, id: string): string {
  const seen = new Set<string>();
  let cur = id;
  while (map.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = map.get(cur)!;
  }
  return cur;
}

/**
 * Fold the merge/unmerge control events (in stream order) into the final identity
 * resolution. Later events win: an unmerge after a merge removes the mapping, a
 * re-merge restores it. Deterministic in event order alone.
 */
export function resolveIdentity(events: readonly C2Event[]): IdentityResolution {
  const map = new Map<string, string>();
  for (const event of events) {
    if (event.eventType === MERGE_EVENT) {
      const pair = mergePair(event);
      if (pair) map.set(pair.mergedMemberId, pair.survivingMemberId);
    } else if (event.eventType === UNMERGE_EVENT) {
      const pair = mergePair(event);
      if (pair) map.delete(pair.mergedMemberId);
    }
  }
  // Compress chains so every subsumed id points straight at its ultimate survivor.
  const compressed = new Map<string, string>();
  for (const key of map.keys()) compressed.set(key, survivorOf(map, key));
  return compressed;
}

/** True for the identity control events that carry resolution, not graph data. */
export function isIdentityEvent(event: C2Event): boolean {
  return event.eventType === MERGE_EVENT || event.eventType === UNMERGE_EVENT;
}

/**
 * Rewrite each domain event's memberId (and partitionKey) through the resolution
 * map, dropping the identity control events. Node/edge business keys derived from
 * `event.memberId` (Member, SocialNeed, the member end of every edge) therefore
 * land under the SURVIVOR on projection - the rekey, achieved purely by replay.
 * Keys that come from stable payload refs (a Coverage/Encounter/Practitioner ref)
 * are unchanged, so the same clinical resource is never duplicated across a merge.
 */
export function rekeyEvents(events: readonly C2Event[], resolution: IdentityResolution): C2Event[] {
  const out: C2Event[] = [];
  for (const event of events) {
    if (isIdentityEvent(event)) continue;
    const survivor = resolution.get(event.memberId);
    if (survivor === undefined) {
      out.push(event);
    } else {
      out.push({
        ...event,
        memberId: survivor,
        partitionKey: survivor,
      });
    }
  }
  return out;
}

/**
 * The full rebuild-from-replay pipeline (DP-1 + DP-7): resolve identity from the
 * whole stream, rekey the domain events to their survivors, project, and apply to
 * a store. Idempotent per store (every mutation is an upsert), so replaying the
 * same stream onto a fresh store rebuilds a byte-identical graph, and replaying it
 * with a merge event present rekeys the merged member's subgraph to the survivor.
 */
export function replayEvents(events: readonly C2Event[], deps: ProjectorDeps): Mutation[] {
  const resolution = resolveIdentity(events);
  const rekeyed = rekeyEvents(events, resolution);
  return project(rekeyed, deps);
}

/** Replay an event stream straight into a (freshly wiped) store. */
export async function replayToStore(
  store: GraphStore,
  events: readonly C2Event[],
  deps: ProjectorDeps
): Promise<void> {
  await store.apply(replayEvents(events, deps));
}
