// SEAM: graph  // ADR-001 v12.3 (neo4j backend)
/**
 * Mutation -> Cypher rendering. PURE and store-free, so it is fully unit-testable
 * without a live Neo4j (the Docker-guarded bolt spec exercises it against a real
 * server). Every VALUE is a bound parameter; only structural identifiers (node
 * labels, relationship types) are interpolated, and each is validated first, so
 * nothing here is an injection surface.
 *
 * Storage convention (kept parallel to the Postgres reference projection):
 *   node   reserved props: kind, key, restricted; extra labels are REAL labels.
 *   edge   reserved props: v_start, v_end, causal, asserter, basis.
 * Business properties are set via `+= $props` and never collide with reserved keys.
 */
import type { EdgeFilter, Mutation, NodeFilter } from '../../types';
import { semanticsToTriple } from '../records';

export interface CypherStatement {
  text: string;
  params: Record<string, unknown>;
}

/** Neo4j identifiers may be arbitrary when back-ticked; we still forbid a literal
 * back-tick so the escaping cannot be broken out of. Labels like `42-CFR-Part-2`
 * (hyphens) are legal back-ticked, which is exactly why segmentation labels work. */
export function assertIdentifier(id: string, what: string): string {
  if (typeof id !== 'string' || id.length === 0 || id.includes('`')) {
    throw new Error(`invalid ${what} identifier: ${JSON.stringify(id)}`);
  }
  return id;
}
const tick = (id: string, what: string) => '`' + assertIdentifier(id, what) + '`';

export function renderMutation(m: Mutation): CypherStatement[] {
  if (m.op === 'UpsertNode') {
    return [
      {
        text:
          `MERGE (n:${tick(m.kind, 'label')} {key:$key}) ` +
          `SET n.kind=$kind, n.restricted = coalesce(n.restricted,false) OR $restricted, n += $props`,
        params: {
          key: m.key,
          kind: m.kind,
          restricted: Boolean(m.restricted),
          props: m.properties,
        },
      },
    ];
  }
  if (m.op === 'SetLabel') {
    return [
      {
        text: `MERGE (n:${tick(m.kind, 'label')} {key:$key}) SET n.kind=$kind, n:${tick(m.label, 'label')}`,
        params: { key: m.key, kind: m.kind },
      },
    ];
  }
  if (m.op === 'UpsertEdge') {
    const t = semanticsToTriple(m.semantics);
    return [
      {
        text:
          `MERGE (a:${tick(m.from.kind, 'label')} {key:$fromKey}) SET a.kind=$fromKind ` +
          `MERGE (b:${tick(m.to.kind, 'label')} {key:$toKey}) SET b.kind=$toKind ` +
          `MERGE (a)-[r:${tick(m.type, 'type')}]->(b) ` +
          `SET r += $props, r.v_start=$vStart, r.v_end=$vEnd, r.causal=$causal, r.asserter=$asserter, r.basis=$basis`,
        params: {
          fromKey: m.from.key,
          fromKind: m.from.kind,
          toKey: m.to.key,
          toKind: m.to.kind,
          props: m.properties ?? {},
          vStart: m.validity.start,
          vEnd: m.validity.end ?? null,
          causal: t.causal,
          asserter: t.asserter,
          basis: t.basis,
        },
      },
    ];
  }
  // SetValidity
  return [
    {
      text:
        `MERGE (a:${tick(m.from.kind, 'label')} {key:$fromKey}) SET a.kind=$fromKind ` +
        `MERGE (b:${tick(m.to.kind, 'label')} {key:$toKey}) SET b.kind=$toKind ` +
        `MERGE (a)-[r:${tick(m.type, 'type')}]->(b) SET r.v_start=$vStart, r.v_end=$vEnd`,
      params: {
        fromKey: m.from.key,
        fromKind: m.from.kind,
        toKey: m.to.key,
        toKind: m.to.kind,
        vStart: m.validity.start,
        vEnd: m.validity.end ?? null,
      },
    },
  ];
}

/** Read one node by (kind, key). */
export function nodeMatch(kind: string, key: string): CypherStatement {
  return {
    text: `MATCH (n:${tick(kind, 'label')} {key:$key}) RETURN properties(n) AS props, labels(n) AS labels`,
    params: { key },
  };
}

/** Read nodes with an optional kind/restricted filter. */
export function nodesMatch(filter: NodeFilter = {}): CypherStatement {
  const label = filter.kind ? `:${tick(filter.kind, 'label')}` : '';
  const where =
    filter.restricted !== undefined ? `WHERE coalesce(n.restricted,false)=$restricted` : '';
  return {
    text: `MATCH (n${label}) ${where} RETURN properties(n) AS props, labels(n) AS labels ORDER BY n.kind, n.key`,
    params: filter.restricted !== undefined ? { restricted: filter.restricted } : {},
  };
}

/** Read edges with an optional type/from/to filter. */
export function edgesMatch(filter: EdgeFilter = {}): CypherStatement {
  const rel = filter.type ? `:${tick(filter.type, 'type')}` : '';
  const conds: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.fromKey !== undefined) {
    conds.push('a.key=$fromKey');
    params.fromKey = filter.fromKey;
  }
  if (filter.toKey !== undefined) {
    conds.push('b.key=$toKey');
    params.toKey = filter.toKey;
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return {
    text:
      `MATCH (a)-[r${rel}]->(b) ${where} ` +
      `RETURN type(r) AS type, a.kind AS fromKind, a.key AS fromKey, b.kind AS toKind, b.key AS toKey, ` +
      `properties(r) AS props ORDER BY type(r), a.key, b.key`,
    params,
  };
}
