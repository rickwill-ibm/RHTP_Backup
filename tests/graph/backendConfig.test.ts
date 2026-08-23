import { afterEach, describe, it, expect } from 'vitest';
import {
  GRAPH_BACKENDS,
  getGraphBackend,
  graphBackendKind,
  setGraphBackend,
} from '@/lib/config/dataMode';
import { createGraphStore, type GraphStoreConnections, type Mutation } from '@/lib/graph';
import { makePgGraphStore } from './helpers';
import { newDb } from 'pg-mem';
import { ensureGraphSchema } from '@/lib/graph';
import type { PgQueryable } from '@/lib/outbox';

/**
 * Proves the co-equal guarantee's operational half: WHICH backend serves the
 * projection is a CONFIG choice alone. The same connections + the same mutations,
 * switched only by getGraphBackend(), yield the same logical graph.
 */
afterEach(() => setGraphBackend(null));

async function pgQueryable(): Promise<PgQueryable> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as PgQueryable;
  await ensureGraphSchema(pool);
  return pool;
}

const MUTS: Mutation[] = [
  { op: 'UpsertNode', kind: 'Member', key: 'M1', properties: { id: 'M1' } },
  {
    op: 'UpsertEdge', type: 'HAS_COVERAGE',
    from: { kind: 'Member', key: 'M1' }, to: { kind: 'Coverage', key: 'c1' },
    properties: {}, validity: { start: '2026-01-01', end: null }, semantics: { kind: 'associative' },
  },
];

describe('graph backend selection is config-only', () => {
  it('defaults to the Postgres reference projection', () => {
    expect(getGraphBackend()).toBe('postgres-projection');
    expect(graphBackendKind('postgres-projection')).toBe('postgres');
  });

  it('every certified backend maps to a store kind', () => {
    expect(GRAPH_BACKENDS).toEqual(['postgres-projection', 'neo4j-selfhosted', 'neo4j-aura']);
    expect(graphBackendKind('neo4j-selfhosted')).toBe('neo4j');
    expect(graphBackendKind('neo4j-aura')).toBe('neo4j');
  });

  it('rejects an invalid backend override', () => {
    expect(() => setGraphBackend('mysql' as never)).toThrow();
  });

  it('switching GRAPH_BACKEND alone changes the store, same mutations -> same graph', async () => {
    const conn: GraphStoreConnections = { postgres: await pgQueryable(), allowNeo4jFake: true };

    setGraphBackend('postgres-projection');
    const pgStore = createGraphStore(conn);
    expect(pgStore.id).toBe('pg-graph');
    await pgStore.apply(MUTS);

    setGraphBackend('neo4j-selfhosted'); // config flip only, no code change
    const neoStore = createGraphStore(conn);
    expect(neoStore.id).toBe('neo4j-fake');
    await neoStore.apply(MUTS);

    // Identical logical result across the config-selected backends.
    expect(await neoStore.listEdges()).toEqual(await pgStore.listEdges());
    expect((await neoStore.getNode('Member', 'M1'))).toEqual(await pgStore.getNode('Member', 'M1'));
  });

  it('a postgres backend without a Postgres connection fails loud', () => {
    expect(() => createGraphStore({ allowNeo4jFake: true }, 'postgres-projection')).toThrow(/Postgres/);
  });

  it('a neo4j backend without a runner or fake fails loud', () => {
    expect(() => createGraphStore({}, 'neo4j-aura')).toThrow(/Neo4j/);
  });
});

// touch import so the pg helper is exercised even if the switch test is skipped
void makePgGraphStore;
