// pg-mem helper: a real in-process Postgres for the outbox SQL, no container.
import { newDb } from 'pg-mem';
import { createPgOutboxStore, ensureOutboxSchema, type OutboxStore, type PgQueryable } from '@/lib/outbox';

export interface PgMemHandle {
  db: PgQueryable;
  store: OutboxStore;
}

/** Fresh pg-mem database with the outbox schema applied and a store bound. */
export async function makePgMemStore(): Promise<PgMemHandle> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as PgQueryable;
  await ensureOutboxSchema(pool);
  return { db: pool, store: createPgOutboxStore(pool) };
}
