// Test helpers for the graph foundation. Not a test file.
import { newDb } from 'pg-mem';
import {
  createNeo4jFakeGraphStore,
  createPostgresGraphStore,
  ensureGraphSchema,
  type GraphStore,
} from '@/lib/graph';
import type { PgQueryable } from '@/lib/outbox';
import type { C2Event } from '@/lib/outbox';

/** Fresh pg-mem-backed Postgres GraphStore with the projection schema applied. */
export async function makePgGraphStore(): Promise<GraphStore> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as PgQueryable;
  await ensureGraphSchema(pool);
  return createPostgresGraphStore(pool);
}

/** The in-memory Neo4j fake GraphStore. */
export function makeNeo4jFakeStore(): GraphStore {
  return createNeo4jFakeGraphStore();
}

/** A fixed clock for deterministic projection. */
export const fixedNow = () => 1_700_000_000_000;

/** Build a minimal valid C2 event for the projector. */
export function c2(overrides: Partial<C2Event> = {}): C2Event {
  return {
    eventId: overrides.eventId ?? 'evt-1',
    eventType: overrides.eventType ?? 'coverage.enrolled',
    eventVersion: overrides.eventVersion ?? '1.0',
    occurredAt: overrides.occurredAt ?? '2026-01-01T00:00:00Z',
    recordedAt: overrides.recordedAt ?? '2026-01-01T00:00:00Z',
    memberId: overrides.memberId ?? 'M1',
    partitionKey: overrides.memberId ?? 'M1',
    class: overrides.class ?? 'batch',
    sequence: overrides.sequence ?? 0,
    correlationId: overrides.correlationId ?? 'corr-1',
    idempotencyKey: overrides.idempotencyKey ?? 'idem-1',
    source: overrides.source ?? { system: 'sys', feed: 'feed', tier: 'T1' },
    consentContext: overrides.consentContext ?? { part2Restricted: false, segmentLabels: [] },
    payload: overrides.payload ?? { coverageRef: 'Coverage/c1', planCode: 'PLAN-A', periodStart: '2026-01-01', status: 'active' },
  };
}
