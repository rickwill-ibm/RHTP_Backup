// pg-mem helper: a real in-process Postgres for the idempotency SQL, no container.
import { newDb } from 'pg-mem';
import {
  createPgIdempotencyStore,
  ensureIdempotencySchema,
  type IdempotencyStore,
  type PgQueryable,
} from '@/lib/idempotency';

export interface PgMemHandle {
  db: PgQueryable;
  store: IdempotencyStore;
}

/** Fresh pg-mem database with the idempotency schema applied and a store bound. */
export async function makePgMemIdempotencyStore(now?: () => number): Promise<PgMemHandle> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as PgQueryable;
  await ensureIdempotencySchema(pool);
  return { db: pool, store: createPgIdempotencyStore(pool, 'pg-idempotency', { now }) };
}
