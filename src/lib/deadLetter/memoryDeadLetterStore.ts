/**
 * In-memory dead-letter store (NS-01) — the mock/seeded default.
 *
 * Append-only by construction: every append (a creation or a resolution) pushes a
 * new immutable version onto a per-id list; `get`/`list` return the latest
 * snapshot. This is the byte-identical demo store the pipeline persists to by
 * default (the demo stays green), and the reference the pg store must match.
 *
 * Deterministic via clock.ts (createdAt/resolvedAt), so tests pin time.
 */
import * as clock from '@/lib/clock';
import {
  deadLetterIdFor,
  STATUS_FOR_ACTION,
  type DeadLetterAppendInput,
  type DeadLetterFilter,
  type DeadLetterRecord,
  type DeadLetterStore,
  type ResolutionAction,
} from './types';

/** A terminal status a reviewer cannot re-resolve away from (idempotent resolve). */
function isTerminal(status: DeadLetterRecord['status']): boolean {
  return status === 'resolved' || status === 'dismissed' || status === 'retried';
}

export interface MemoryDeadLetterStore extends DeadLetterStore {
  /** Full ordered version history for one id (oldest first) — test/introspection. */
  history(id: string): DeadLetterRecord[];
  /** Drop everything (test reset / "reset demo"). */
  clear(): void;
}

export function createMemoryDeadLetterStore(): MemoryDeadLetterStore {
  // id -> ordered version list (append-only; last element is the latest snapshot).
  const versions = new Map<string, DeadLetterRecord[]>();

  function latest(id: string): DeadLetterRecord | null {
    const list = versions.get(id);
    return list && list.length > 0 ? list[list.length - 1] : null;
  }

  return {
    async append(input: DeadLetterAppendInput): Promise<DeadLetterRecord> {
      const id = input.id ?? deadLetterIdFor(input.kind, input.sourceRef);
      const record: DeadLetterRecord = {
        id,
        kind: input.kind,
        status: 'open',
        memberRef: input.memberRef,
        reasonCode: input.reasonCode,
        sourceRef: input.sourceRef,
        payloadRef: input.payloadRef,
        createdAt: input.createdAt ?? clock.nowIso(),
        resolvedAt: null,
        resolvedBy: null,
        resolutionAction: null,
      };
      const list = versions.get(id) ?? [];
      list.push(record);
      versions.set(id, list);
      return record;
    },

    async get(id: string): Promise<DeadLetterRecord | null> {
      return latest(id);
    },

    async list(filter?: DeadLetterFilter): Promise<DeadLetterRecord[]> {
      const out: DeadLetterRecord[] = [];
      for (const list of versions.values()) {
        const snap = list[list.length - 1];
        if (filter?.kind && snap.kind !== filter.kind) continue;
        if (filter?.status && snap.status !== filter.status) continue;
        out.push(snap);
      }
      // Newest first, deterministic tiebreak by id.
      return out.sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id.localeCompare(b.id)
          : b.createdAt.localeCompare(a.createdAt)
      );
    },

    async resolve(
      id: string,
      action: ResolutionAction,
      actor: string
    ): Promise<DeadLetterRecord | null> {
      const current = latest(id);
      if (!current) return null;
      if (isTerminal(current.status)) return current; // idempotent: no double-resolve
      const resolved: DeadLetterRecord = {
        ...current,
        status: STATUS_FOR_ACTION[action],
        resolvedAt: clock.nowIso(),
        resolvedBy: actor,
        resolutionAction: action,
      };
      versions.get(id)!.push(resolved);
      return resolved;
    },

    history(id: string): DeadLetterRecord[] {
      return [...(versions.get(id) ?? [])];
    },

    clear(): void {
      versions.clear();
    },
  };
}

/** Process-wide default in-memory store (the mock/seeded demo instance). */
let defaultStore: MemoryDeadLetterStore | null = null;

export function defaultDeadLetterStore(): MemoryDeadLetterStore {
  if (!defaultStore) defaultStore = createMemoryDeadLetterStore();
  return defaultStore;
}

/** Test seam: reset the shared default store. */
export function resetDefaultDeadLetterStore(): void {
  defaultStore = null;
}
