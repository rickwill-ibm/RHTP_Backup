// DP-7  // SEAM: crossReference
/**
 * The pure, synchronous cross-reference engine — the F3 fragmentation fix core.
 *
 * Holds two append-only fact sets in memory:
 *   links   sourceId -> set of member ids ever linked (unlink removes one)
 *   merges  mergedMemberId -> survivingMemberId (unmerge removes it)
 *
 * lookup RESOLVES a source id at read time: it maps every member linked to that
 * source id through the merge chain to its ultimate survivor, then:
 *   - exactly one distinct survivor  -> linked
 *   - two or more distinct survivors -> ambiguous  (E9: caller HOLDS, never picks)
 *   - none                           -> unlinked
 *
 * This is the synchronous projection the identity resolver reads (resolveEmpi is a
 * sync seam). The durable pg store mirrors the same facts for persistence; the
 * async memory store is a thin facade over this engine for the demo seam. Every
 * mutation appends the C2 event it emitted to an internal log (events()) so the
 * graph rekeys by REPLAY. Deterministic under injected now/rng.
 */
import * as clock from '@/lib/clock';
import type { C2Event } from '@/lib/outbox';
import { linkedEvent, unlinkedEvent, mergedEvent, unmergedEvent } from './events';
import type { XrefEventDeps, XrefLookup } from './types';

/** A synchronous xref reader — the minimum the identity resolver needs. */
export interface XrefReader {
  lookup(sourceId: string): XrefLookup;
}

export interface XrefIndex extends XrefReader {
  link(sourceId: string, memberId: string, feed?: string): C2Event;
  unlink(sourceId: string, memberId: string): C2Event;
  merge(survivingMemberId: string, mergedMemberId: string): C2Event;
  unmerge(survivingMemberId: string, mergedMemberId: string): C2Event;
  /** Emitted events in order — the replay source for graph rekey. */
  events(): C2Event[];
  /** Drop all facts and events (test reset / rebuild). */
  clear(): void;
}

/** Follow the merge map to the ultimate survivor (path-compressed, cycle-safe). */
export function survivorOf(merges: ReadonlyMap<string, string>, id: string): string {
  const seen = new Set<string>();
  let cur = id;
  while (merges.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = merges.get(cur)!;
  }
  return cur;
}

/**
 * Resolve a source id against the append-only facts. Shared by the sync engine and
 * the durable pg store so the fragmentation + E9 semantics are defined ONCE.
 */
export function resolveLookup(
  links: ReadonlyMap<string, ReadonlySet<string>>,
  merges: ReadonlyMap<string, string>,
  sourceId: string,
): XrefLookup {
  const raw = links.get(sourceId);
  if (!raw || raw.size === 0) return { status: 'unlinked' };
  const survivors = new Set<string>();
  for (const m of raw) survivors.add(survivorOf(merges, m));
  if (survivors.size === 1) return { status: 'linked', memberId: [...survivors][0] };
  // E9: distinct, unmerged members claim the same source id. Do NOT guess.
  return { status: 'ambiguous', memberIds: [...survivors].sort() };
}

export function createXrefIndex(deps?: Partial<XrefEventDeps>): XrefIndex {
  const eventDeps: XrefEventDeps = {
    now: deps?.now ?? clock.now,
    rng: deps?.rng ?? clock.rng,
  };
  // sourceId -> distinct raw member ids linked to it (append-only within a source).
  const links = new Map<string, Set<string>>();
  const merges = new Map<string, string>();
  const log: C2Event[] = [];

  function lookup(sourceId: string): XrefLookup {
    return resolveLookup(links, merges, sourceId);
  }

  return {
    lookup,
    link(sourceId, memberId, feed) {
      const set = links.get(sourceId) ?? new Set<string>();
      set.add(memberId);
      links.set(sourceId, set);
      const evt = linkedEvent(sourceId, memberId, feed, eventDeps);
      log.push(evt);
      return evt;
    },
    unlink(sourceId, memberId) {
      links.get(sourceId)?.delete(memberId);
      const evt = unlinkedEvent(sourceId, memberId, eventDeps);
      log.push(evt);
      return evt;
    },
    merge(survivingMemberId, mergedMemberId) {
      if (survivingMemberId && mergedMemberId && survivingMemberId !== mergedMemberId) {
        merges.set(mergedMemberId, survivingMemberId);
      }
      const evt = mergedEvent(survivingMemberId, mergedMemberId, eventDeps);
      log.push(evt);
      return evt;
    },
    unmerge(survivingMemberId, mergedMemberId) {
      merges.delete(mergedMemberId);
      const evt = unmergedEvent(survivingMemberId, mergedMemberId, eventDeps);
      log.push(evt);
      return evt;
    },
    events() {
      return [...log];
    },
    clear() {
      links.clear();
      merges.clear();
      log.length = 0;
    },
  };
}
