/** OutboxDeps seam — dev deps in mock, fail-closed/real-deps in production (Phase 5). */
import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveOutboxDeps,
  setProductionOutboxDepsFactory,
  OutboxDepsNotConfiguredError,
} from '@/lib/jobs/outboxDeps';
import type { ProjectionStores } from '@/lib/graph/consumer/provider';
import type { OutboxDeps } from '@/lib/outbox';

function fakeStores(durable: boolean): ProjectionStores {
  return {
    outbox: { id: 'fake-outbox' },
    graph: {},
    checkpoint: {},
    durable,
  } as unknown as ProjectionStores;
}

afterEach(() => setProductionOutboxDepsFactory(null));

describe('outbox deps seam', () => {
  it('mock/seeded (non-durable) -> dev in-memory deps around the store', () => {
    const s = fakeStores(false);
    const deps = resolveOutboxDeps(s);
    expect(deps.store).toBe(s.outbox);
  });

  it('production (durable) without a factory -> fail closed', () => {
    expect(() => resolveOutboxDeps(fakeStores(true))).toThrow(OutboxDepsNotConfiguredError);
  });

  it('production (durable) with a registered factory -> uses it', () => {
    const fake = {
      store: { id: 'prod' },
      fhir: {},
      publisher: {},
      now: () => 0,
      rng: () => 0,
    } as unknown as OutboxDeps;
    setProductionOutboxDepsFactory(() => fake);
    expect(resolveOutboxDeps(fakeStores(true))).toBe(fake);
  });
});
