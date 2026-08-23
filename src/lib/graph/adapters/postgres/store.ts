// SEAM: graph  // ADR-001 v12.3 (postgres-projection backend, reference)
/**
 * The Postgres GraphStore: renders the neutral mutation instruction set as
 * relational upserts. This is the REFERENCE projection. It runs against real
 * Postgres in CI (testcontainers) and pg-mem in unit tests — the SAME SQL.
 *
 * Merge semantics (idempotent upsert) are computed in-app via read-modify-write
 * so the projection is portable (no reliance on jsonb operators pg-mem lacks).
 * A projection run is single-writer, so read-modify-write is safe here.
 */
import type { PgQueryable } from '@/lib/outbox';
import type {
  EdgeFilter,
  GraphEdgeRecord,
  GraphNodeRecord,
  GraphStore,
  Mutation,
  NodeFilter,
  Props,
} from '../../types';
import { edgeRecord, mergeProps, nodeLabels, semanticsToTriple, unionLabels } from '../records';
import { ensureGraphSchema } from './schema';

type Row = Record<string, unknown>;

function j(v: unknown): Props {
  if (v == null) return {};
  return (typeof v === 'string' ? JSON.parse(v) : v) as Props;
}
function jArr(v: unknown): string[] {
  if (v == null) return [];
  return (typeof v === 'string' ? JSON.parse(v) : v) as string[];
}

export function createPostgresGraphStore(db: PgQueryable, id = 'pg-graph'): GraphStore {
  async function loadNode(kind: string, key: string): Promise<Row | null> {
    const r = await db.query('SELECT * FROM graph_node WHERE kind=$1 AND key=$2', [kind, key]);
    return r.rows[0] ?? null;
  }
  async function writeNode(
    kind: string,
    key: string,
    restricted: boolean,
    labels: string[],
    props: Props,
  ): Promise<void> {
    await db.query(
      `INSERT INTO graph_node (kind, key, restricted, labels, props)
         VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (kind, key)
         DO UPDATE SET restricted=$3, labels=$4, props=$5`,
      [kind, key, restricted, JSON.stringify(labels), JSON.stringify(props)],
    );
  }
  async function ensureStub(kind: string, key: string): Promise<void> {
    await db.query(
      `INSERT INTO graph_node (kind, key) VALUES ($1,$2) ON CONFLICT (kind, key) DO NOTHING`,
      [kind, key],
    );
  }
  async function loadEdge(m: {
    type: string;
    from: { kind: string; key: string };
    to: { kind: string; key: string };
  }): Promise<Row | null> {
    const r = await db.query(
      `SELECT * FROM graph_edge WHERE type=$1 AND from_kind=$2 AND from_key=$3 AND to_kind=$4 AND to_key=$5`,
      [m.type, m.from.kind, m.from.key, m.to.kind, m.to.key],
    );
    return r.rows[0] ?? null;
  }

  async function applyOne(m: Mutation): Promise<void> {
    if (m.op === 'UpsertNode') {
      const cur = await loadNode(m.kind, m.key);
      const restricted = Boolean(cur?.restricted) || Boolean(m.restricted);
      const labels = unionLabels(jArr(cur?.labels), []);
      await writeNode(m.kind, m.key, restricted, labels, mergeProps(j(cur?.props), m.properties));
    } else if (m.op === 'SetLabel') {
      await ensureStub(m.kind, m.key);
      const cur = await loadNode(m.kind, m.key);
      await writeNode(
        m.kind,
        m.key,
        Boolean(cur?.restricted),
        unionLabels(jArr(cur?.labels), [m.label]),
        j(cur?.props),
      );
    } else if (m.op === 'UpsertEdge') {
      await ensureStub(m.from.kind, m.from.key);
      await ensureStub(m.to.kind, m.to.key);
      const cur = await loadEdge(m);
      const props = mergeProps(j(cur?.props), m.properties);
      const t = semanticsToTriple(m.semantics);
      await db.query(
        `INSERT INTO graph_edge
           (type, from_kind, from_key, to_kind, to_key, props, v_start, v_end, causal, asserter, basis)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (type, from_kind, from_key, to_kind, to_key)
           DO UPDATE SET props=$6, v_start=$7, v_end=$8, causal=$9, asserter=$10, basis=$11`,
        [
          m.type, m.from.kind, m.from.key, m.to.kind, m.to.key, JSON.stringify(props),
          m.validity.start, m.validity.end ?? null, t.causal, t.asserter, t.basis,
        ],
      );
    } else {
      // SetValidity: revise an existing edge's interval; create it (associative)
      // if absent so an out-of-order close is still recorded.
      await ensureStub(m.from.kind, m.from.key);
      await ensureStub(m.to.kind, m.to.key);
      await db.query(
        `INSERT INTO graph_edge
           (type, from_kind, from_key, to_kind, to_key, v_start, v_end)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (type, from_kind, from_key, to_kind, to_key)
           DO UPDATE SET v_start=$6, v_end=$7`,
        [m.type, m.from.kind, m.from.key, m.to.kind, m.to.key, m.validity.start, m.validity.end ?? null],
      );
    }
  }

  function toNode(r: Row): GraphNodeRecord {
    const kind = String(r.kind);
    return {
      kind,
      key: String(r.key),
      labels: nodeLabels(kind, jArr(r.labels)),
      properties: j(r.props),
      restricted: Boolean(r.restricted),
    };
  }
  function toEdge(r: Row): GraphEdgeRecord {
    return edgeRecord({
      type: String(r.type),
      from: { kind: String(r.from_kind), key: String(r.from_key) },
      to: { kind: String(r.to_kind), key: String(r.to_key) },
      props: j(r.props),
      vStart: String(r.v_start),
      vEnd: r.v_end == null ? null : String(r.v_end),
      causal: Boolean(r.causal),
      asserter: r.asserter == null ? null : String(r.asserter),
      basis: r.basis == null ? null : String(r.basis),
    });
  }

  return {
    id,
    async apply(mutations: Mutation[]) {
      await ensureGraphSchema(db);
      for (const m of mutations) await applyOne(m);
    },
    async getNode(kind, key) {
      const r = await loadNode(kind, key);
      return r ? toNode(r) : null;
    },
    async listNodes(filter: NodeFilter = {}) {
      const clauses: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (filter.kind !== undefined) { clauses.push(`kind=$${i++}`); vals.push(filter.kind); }
      if (filter.restricted !== undefined) { clauses.push(`restricted=$${i++}`); vals.push(filter.restricted); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const r = await db.query(`SELECT * FROM graph_node ${where} ORDER BY kind, key`, vals);
      return r.rows.map(toNode);
    },
    async listEdges(filter: EdgeFilter = {}) {
      const clauses: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (filter.type !== undefined) { clauses.push(`type=$${i++}`); vals.push(filter.type); }
      if (filter.fromKey !== undefined) { clauses.push(`from_key=$${i++}`); vals.push(filter.fromKey); }
      if (filter.toKey !== undefined) { clauses.push(`to_key=$${i++}`); vals.push(filter.toKey); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const r = await db.query(
        `SELECT * FROM graph_edge ${where} ORDER BY type, from_key, to_key`,
        vals,
      );
      return r.rows.map(toEdge);
    },
  };
}
