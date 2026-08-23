// SEAM: substrate  // I9 substrate
/**
 * The migration source registry (Iteration 9, Wave A).
 *
 * The unified runner discovers per-store schema from ONE ordered list, so a
 * deployment applies every store's DDL through a single checksum-guarded ledger
 * instead of each store ensuring its own schema ad hoc. Two source shapes:
 *
 *   fileSource   — a store with versioned SQL files under its own migrations/ dir
 *                  (evidence, deadLetter). `.pg.sql` files are real-Postgres-only.
 *   inlineSource — a store whose schema is a single exported DDL string
 *                  (outbox, idempotency, graph, crossReference). Portable, so
 *                  never real-Postgres-only.
 *
 * Order is fixed and deterministic. Governance is intentionally ABSENT: its store
 * contract is synchronous (putVersion/getVersion return values, not Promises), so
 * a durable pg adapter cannot honor it without an async refactor that is out of
 * this wave's scope and would collide with the terminology tree. Governance keeps
 * its explicit fail-closed disposition (ValueSetGovernanceStoreNotConfiguredError)
 * and stays memory-only until that refactor. See bootstrap.ts.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OUTBOX_DDL } from '@/lib/outbox';
import { IDEMPOTENCY_DDL } from '@/lib/idempotency';
import { GRAPH_DDL } from '@/lib/graph';
import { CROSS_REFERENCE_DDL } from '@/lib/identity/crossReference';
import type { Migration, MigrationSource } from './types';

const PG_ONLY_SUFFIX = '.pg.sql';

/** A store whose migrations are versioned SQL files under an absolute dir. */
export function fileSource(store: string, dir: string): MigrationSource {
  return {
    store,
    async load(): Promise<Migration[]> {
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.sql')).sort();
      const out: Migration[] = [];
      for (const name of names) {
        const sql = await fs.readFile(path.join(dir, name), 'utf8');
        out.push({ store, name, sql, realPostgresOnly: name.endsWith(PG_ONLY_SUFFIX) });
      }
      return out;
    },
  };
}

/** A store whose schema is a single portable DDL string. */
export function inlineSource(store: string, name: string, sql: string): MigrationSource {
  return {
    store,
    async load(): Promise<Migration[]> {
      return [{ store, name, sql, realPostgresOnly: false }];
    },
  };
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** src/lib — the parent of every store dir referenced below. */
const LIB = path.resolve(here, '..');

/**
 * The ordered substrate schema. File-backed append-only ledgers first (they carry
 * their own .pg.sql immutability triggers), then the inline-DDL relational stores.
 */
export const DEFAULT_MIGRATION_SOURCES: MigrationSource[] = [
  fileSource('evidence', path.join(LIB, 'evidence/store/migrations')),
  fileSource('deadLetter', path.join(LIB, 'deadLetter/migrations')),
  inlineSource('outbox', 'outbox_intent.ddl', OUTBOX_DDL),
  inlineSource('idempotency', 'idempotency_marker.ddl', IDEMPOTENCY_DDL),
  inlineSource('graph', 'graph_projection.ddl', GRAPH_DDL),
  inlineSource('crossReference', 'identity_xref.ddl', CROSS_REFERENCE_DDL),
];
