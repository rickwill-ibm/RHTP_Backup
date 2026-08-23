// CONTRACT: C10  // SEAM: graph
/**
 * Graph foundation types (ADR-001 v12.3 dual co-equal backends, DP-1).
 *
 * TWO layers, kept strictly apart:
 *
 *   1. The NEUTRAL MUTATION INSTRUCTION SET — UpsertNode / UpsertEdge / SetLabel /
 *      SetValidity. A property-graph change described with ZERO store knowledge:
 *      no SQL, no Cypher. The projector emits ONLY these; both adapters render
 *      them (Postgres relational upserts, Neo4j Cypher). This is what makes the
 *      two backends co-equal — they consume the identical instruction stream.
 *
 *   2. The GraphStore interface + read-back records. One interface, two certified
 *      implementations; the shared contract test asserts identical logical results.
 *
 * Property values are scalars, arrays, or null — every value here is a legal Neo4j
 * property AND trivially columnised/JSON-encoded in Postgres, so nothing in the
 * instruction set can be faithful in one backend and lossy in the other.
 */

export type PropVal = string | number | boolean | string[] | null;
export type Props = Record<string, PropVal>;

/** A node address: primary label (kind) + stable business key. */
export interface GraphNodeRef {
  kind: string;
  key: string;
}

/** A dated edge's validity interval (DP-1: every edge is dated for asOf queries).
 * `start` is inclusive ISO-8601; `end` null/absent means "still open". */
export interface EdgeValidity {
  start: string;
  end?: string | null;
}

/**
 * Edge semantics (DP-1). Associative is the DEFAULT (an observed co-occurrence).
 * A CAUSAL edge is an asserted claim, so it MUST carry provenance: who/what
 * asserted it (`asserter`) and on what basis (`basis`, a PHI-safe code/ref).
 */
export type EdgeSemantics =
  | { kind: 'associative' }
  | { kind: 'causal'; asserter: string; basis: string };

export interface UpsertNode {
  op: 'UpsertNode';
  kind: string;
  key: string;
  properties: Props;
  /** 42 CFR Part 2 / segmented: projects as a RESTRICTED node (DP-1). */
  restricted?: boolean;
}

/** Attach an extra label to a node (segmentation labels, restriction marker). */
export interface SetLabel {
  op: 'SetLabel';
  kind: string;
  key: string;
  label: string;
}

export interface UpsertEdge {
  op: 'UpsertEdge';
  type: string;
  from: GraphNodeRef;
  to: GraphNodeRef;
  properties?: Props;
  validity: EdgeValidity;
  semantics: EdgeSemantics;
}

/** Revise an existing edge's validity interval (e.g. close it: set `end`). */
export interface SetValidity {
  op: 'SetValidity';
  type: string;
  from: GraphNodeRef;
  to: GraphNodeRef;
  validity: EdgeValidity;
}

export type Mutation = UpsertNode | UpsertEdge | SetLabel | SetValidity;

// ─── Read-back records (identical shape across both backends) ─────────────────

export interface GraphNodeRecord {
  kind: string;
  key: string;
  /** Primary kind first, then any labels added via SetLabel, sorted + de-duped. */
  labels: string[];
  properties: Props;
  restricted: boolean;
}

export interface GraphEdgeRecord {
  type: string;
  from: GraphNodeRef;
  to: GraphNodeRef;
  properties: Props;
  validity: EdgeValidity;
  causal: boolean;
  asserter?: string;
  basis?: string;
}

export interface NodeFilter {
  kind?: string;
  restricted?: boolean;
}

export interface EdgeFilter {
  type?: string;
  fromKey?: string;
  toKey?: string;
}

/**
 * The ONE store interface both backends implement. `apply` is idempotent: the
 * same mutation stream applied twice yields the same graph (the rebuild-from-
 * replay guarantee). Reads are the neutral surface the wave-B lens queries and
 * the contract test share.
 */
export interface GraphStore {
  readonly id: string;
  apply(mutations: Mutation[]): Promise<void>;
  getNode(kind: string, key: string): Promise<GraphNodeRecord | null>;
  listNodes(filter?: NodeFilter): Promise<GraphNodeRecord[]>;
  listEdges(filter?: EdgeFilter): Promise<GraphEdgeRecord[]>;
}

/** Everything the projector needs injected — the clock seam (src/lib/clock.ts). */
export interface ProjectorDeps {
  now: () => number;
}
