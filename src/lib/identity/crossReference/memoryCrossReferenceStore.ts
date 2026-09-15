// SEAM: crossReference
/**
 * In-memory CrossReferenceStore — the mock/seeded default (demo stays green).
 *
 * A thin async facade over the pure synchronous xref engine (xref.ts), so the
 * demo seam and the resolver share ONE implementation of the resolve/merge logic.
 * The pg store mirrors the same facts durably.
 */
import type { C2Event } from '@/lib/outbox';
import { createXrefIndex, type XrefIndex } from './xref';
import type { CrossReferenceStore, XrefEventDeps, XrefLookup } from './types';

export interface MemoryCrossReferenceStore extends CrossReferenceStore {
  /** The underlying synchronous engine (resolver reads this directly). */
  readonly index: XrefIndex;
  clear(): void;
}

export function createMemoryCrossReferenceStore(
  deps?: Partial<XrefEventDeps>,
  id = 'mock-cross-reference'
): MemoryCrossReferenceStore {
  const index = createXrefIndex(deps);
  return {
    id,
    index,
    async link(sourceId: string, memberId: string, feed?: string): Promise<C2Event> {
      return index.link(sourceId, memberId, feed);
    },
    async unlink(sourceId: string, memberId: string): Promise<C2Event> {
      return index.unlink(sourceId, memberId);
    },
    async lookup(sourceId: string): Promise<XrefLookup> {
      return index.lookup(sourceId);
    },
    async merge(survivingMemberId: string, mergedMemberId: string): Promise<C2Event> {
      return index.merge(survivingMemberId, mergedMemberId);
    },
    async unmerge(survivingMemberId: string, mergedMemberId: string): Promise<C2Event> {
      return index.unmerge(survivingMemberId, mergedMemberId);
    },
    async events(): Promise<C2Event[]> {
      return index.events();
    },
    clear(): void {
      index.clear();
    },
  };
}

let defaultStore: MemoryCrossReferenceStore | null = null;

/** The shared in-memory store used in mock/seeded mode. */
export function defaultCrossReferenceStore(): MemoryCrossReferenceStore {
  if (!defaultStore) defaultStore = createMemoryCrossReferenceStore();
  return defaultStore;
}

/** Reset the shared in-memory store (tests only). */
export function resetDefaultCrossReferenceStore(): void {
  defaultStore = null;
}
