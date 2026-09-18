// CONTRACT: C1  // CONTRACT: C10  // DP-1
/**
 * Lens query types. The five lenses (DP-1 acceptance) are STORE-AGNOSTIC read
 * queries: each is expressed only against the GraphStore read API (getNode,
 * listNodes, listEdges), so the Postgres and Neo4j backends satisfy the same lens
 * with no per-store code. A lens returns a member-scoped subgraph (nodes + edges).
 *
 * Consent scope (C1: every read scoped by requestor purpose + consent state). A
 * lens NEVER surfaces a RESTRICTED (42 CFR Part 2 / segmented) node unless the
 * caller's scope covers its restriction. The default scope covers nothing, so
 * restricted data is excluded by default and included only with explicit scope.
 */
import type { GraphEdgeRecord, GraphNodeRecord } from '../types';

/** The five demo lenses, one canonical name each. */
export type LensName =
  'whole-person' | 'care-gap' | 'sdoh-barrier' | 'care-team' | 'part2-restricted';

/**
 * The consent scope a lens read runs under (C1 consent enforcement). `part2`
 * grants 42 CFR Part 2 restricted data; `segments` grants named segmentation
 * labels. A restricted node is visible only when the scope covers every one of its
 * restricting labels. The empty scope (default) covers nothing.
 */
export interface ConsentScope {
  part2?: boolean;
  segments?: string[];
}

/** The scope that grants nothing - restricted nodes are excluded. */
export const NO_CONSENT: ConsentScope = Object.freeze({ part2: false, segments: [] });

/** A member-scoped subgraph result. Nodes and edges are the consent-filtered view. */
export interface LensResult {
  lens: LensName;
  memberId: string;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}
