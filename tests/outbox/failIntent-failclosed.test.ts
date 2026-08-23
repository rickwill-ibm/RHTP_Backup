/**
 * failIntent fail-closed on dead-letter capture failure (R1 / NS-01 convergence).
 *
 * The default failIntent path resolves the dead-letter store via the seam and
 * persists the exhausted intent as a `failed-outbox` record. The sink is a
 * sync-sink-over-async-store that captures append errors out-of-band. This test
 * pins the convergence fix: when that append FAILS (e.g. the dead-letter store is
 * down), failIntent must THROW rather than silently drop the failed-outbox record
 * — the exact silent drop NS-01 forbids.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { failIntent } from '@/lib/outbox';
import type { OutboxDeps, OutboxIntentRow } from '@/lib/outbox';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import { setProductionDeadLetterStoreFactory } from '@/lib/deadLetter';
import type { DeadLetterStore } from '@/lib/deadLetter';

function faultyStore(): DeadLetterStore {
  return {
    async append() {
      throw new Error('dead-letter store unavailable');
    },
    async get() {
      return null;
    },
    async list() {
      return [];
    },
    async resolve() {
      return null;
    },
  };
}

function minimalDeps(): { deps: OutboxDeps; updated: string[] } {
  const updated: string[] = [];
  const deps = {
    store: {
      async update(id: string) {
        updated.push(id);
      },
    },
    now: () => 1_700_000_000_000,
    // no alarm, no injected quarantine -> the default seam path runs.
  } as unknown as OutboxDeps;
  return { deps, updated };
}

const row = {
  id: 'intent-1',
  memberId: 'member-1',
  attempts: 5,
} as unknown as OutboxIntentRow;

afterEach(() => {
  clearSessionDataModes();
  setProductionDeadLetterStoreFactory(null);
});

describe('failIntent — dead-letter capture is fail-closed', () => {
  it('throws when the dead-letter append fails (no silent drop)', async () => {
    setSessionDataMode('deadLetterStore', 'production');
    setProductionDeadLetterStoreFactory(faultyStore);
    const { deps } = minimalDeps();
    await expect(failIntent(deps, row, 5, 'exhausted')).rejects.toThrow(
      'dead-letter store unavailable',
    );
  });

  it('still marks the intent failed before attempting capture (durability order)', async () => {
    setSessionDataMode('deadLetterStore', 'production');
    setProductionDeadLetterStoreFactory(faultyStore);
    const { deps, updated } = minimalDeps();
    await expect(failIntent(deps, row, 5, 'exhausted')).rejects.toThrow();
    expect(updated).toEqual(['intent-1']); // status flip happened; capture then threw
  });
});
