// SEAM: graph  // ADR-001 v12.3 (neo4j-selfhosted | neo4j-aura backend)
/**
 * The Neo4j GraphStore: renders the neutral mutation instruction set as Cypher
 * (cypher.ts) and runs it over a bolt session. It depends only on a minimal
 * `Neo4jRunner` surface that neo4j-driver's Session satisfies, so the adapter is
 * unit-constructible and the Docker-guarded bolt spec supplies a real session.
 *
 * Read-back is reconstructed through the SAME records helpers the Postgres store
 * uses, so both backends return byte-identical GraphNodeRecord/GraphEdgeRecord —
 * the co-equal guarantee the shared contract test asserts.
 */
import type {
  EdgeFilter,
  GraphEdgeRecord,
  GraphNodeRecord,
  GraphStore,
  Mutation,
  NodeFilter,
  Props,
} from '../../types';
import { edgeRecord, nodeLabels } from '../records';
import { edgesMatch, nodeMatch, nodesMatch, renderMutation } from './cypher';

export interface Neo4jRecord {
  get(key: string): unknown;
}
export interface Neo4jRunResult {
  records: Neo4jRecord[];
}
/** The bolt surface we need — neo4j-driver `Session` satisfies this. */
export interface Neo4jRunner {
  run(query: string, params?: Record<string, unknown>): Promise<Neo4jRunResult>;
}

const NODE_RESERVED = new Set(['kind', 'key', 'restricted']);
const EDGE_RESERVED = new Set(['v_start', 'v_end', 'causal', 'asserter', 'basis']);

function businessProps(all: Record<string, unknown>, reserved: Set<string>): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(all)) if (!reserved.has(k)) out[k] = v as Props[string];
  return out;
}

export function createNeo4jGraphStore(runner: Neo4jRunner, id = 'neo4j-graph'): GraphStore {
  function toNode(props: Record<string, unknown>, labels: string[]): GraphNodeRecord {
    const kind = String(props.kind);
    return {
      kind,
      key: String(props.key),
      labels: nodeLabels(kind, labels),
      properties: businessProps(props, NODE_RESERVED),
      restricted: Boolean(props.restricted),
    };
  }
  function toEdge(r: Neo4jRecord): GraphEdgeRecord {
    const p = (r.get('props') ?? {}) as Record<string, unknown>;
    return edgeRecord({
      type: String(r.get('type')),
      from: { kind: String(r.get('fromKind')), key: String(r.get('fromKey')) },
      to: { kind: String(r.get('toKind')), key: String(r.get('toKey')) },
      props: businessProps(p, EDGE_RESERVED),
      vStart: String(p.v_start),
      vEnd: p.v_end == null ? null : String(p.v_end),
      causal: Boolean(p.causal),
      asserter: p.asserter == null ? null : String(p.asserter),
      basis: p.basis == null ? null : String(p.basis),
    });
  }

  return {
    id,
    async apply(mutations: Mutation[]) {
      for (const m of mutations) {
        for (const stmt of renderMutation(m)) await runner.run(stmt.text, stmt.params);
      }
    },
    async getNode(kind, key) {
      const stmt = nodeMatch(kind, key);
      const res = await runner.run(stmt.text, stmt.params);
      if (res.records.length === 0) return null;
      const rec = res.records[0];
      return toNode((rec.get('props') ?? {}) as Record<string, unknown>, (rec.get('labels') ?? []) as string[]);
    },
    async listNodes(filter: NodeFilter = {}) {
      const stmt = nodesMatch(filter);
      const res = await runner.run(stmt.text, stmt.params);
      return res.records.map((rec) =>
        toNode((rec.get('props') ?? {}) as Record<string, unknown>, (rec.get('labels') ?? []) as string[]),
      );
    },
    async listEdges(filter: EdgeFilter = {}) {
      const stmt = edgesMatch(filter);
      const res = await runner.run(stmt.text, stmt.params);
      return res.records.map(toEdge);
    },
  };
}
