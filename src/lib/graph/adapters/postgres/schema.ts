// SEAM: graph  // ADR-001 v12.3 (postgres-projection backend)
/**
 * The relational projection schema — the Postgres rendering of the neutral
 * property graph. Two tables: nodes keyed by (kind, key); edges keyed by
 * (type, endpoints). Labels and properties are JSONB (the value space is
 * scalar/array/null, so this round-trips losslessly). This is the REFERENCE
 * projection both backends are conformance-gated against.
 */
import type { PgQueryable } from '@/lib/outbox';

// NB: no column DEFAULT clauses. Every write supplies its values explicitly, and
// reads tolerate NULL (see the store's j()/jArr()). This keeps the DDL inside the
// subset pg-mem's parser fully covers while remaining valid on real Postgres.
// Uniqueness is declared as a separate CREATE UNIQUE INDEX (not an inline table
// constraint). Both are standard Postgres and both satisfy ON CONFLICT inference;
// the index form is what pg-mem's query planner fully covers under Vite's build.
// Identity is enforced by the UNIQUE INDEX; NOT NULL column constraints are
// omitted because pg-mem's CREATE TABLE IF NOT EXISTS path (under Vite's build)
// leaves them unread and errors. The projector always supplies the key columns,
// and real Postgres accepts this schema unchanged (the index is the invariant).
export const GRAPH_DDL = `
CREATE TABLE IF NOT EXISTS graph_node (
  kind        TEXT,
  key         TEXT,
  restricted  BOOLEAN,
  labels      JSONB,
  props       JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS graph_node_uk ON graph_node (kind, key);
CREATE TABLE IF NOT EXISTS graph_edge (
  type      TEXT,
  from_kind TEXT,
  from_key  TEXT,
  to_kind   TEXT,
  to_key    TEXT,
  props     JSONB,
  v_start   TEXT,
  v_end     TEXT,
  causal    BOOLEAN,
  asserter  TEXT,
  basis     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS graph_edge_uk ON graph_edge (type, from_kind, from_key, to_kind, to_key);`;

/** Ensure the projection schema exists (idempotent). Call once at store init. */
export async function ensureGraphSchema(db: PgQueryable): Promise<void> {
  await db.query(GRAPH_DDL);
}
