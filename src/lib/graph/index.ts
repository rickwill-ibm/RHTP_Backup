// CONTRACT: C10  // SEAM: graph  // ADR-001 v12.3
/**
 * The graph foundation barrel (Iteration 2 wave A).
 *
 *   project(events)   C2 events  -> neutral MUTATION instruction set (no SQL/Cypher)
 *   GraphStore        ONE interface, TWO co-equal certified backends
 *   createGraphStore  picks the backend by CONFIG ALONE (getGraphBackend)
 *
 * Wave B builds the five lens queries + the SDE on top of this surface; it is NOT
 * built here. The hardcoded `wholePersonGraphData` demo stays the mock source for
 * the `graph` seam (lib/careTeam/graph/resources.ts) — untouched; production mode
 * reads a store produced here.
 */
import type { PgQueryable } from '@/lib/outbox';
import { type GraphBackend, getGraphBackend, graphBackendKind } from '@/lib/config/dataMode';
import type { GraphStore } from './types';
import { createPostgresGraphStore } from './adapters/postgres';
import { createNeo4jFakeGraphStore, createNeo4jGraphStore, type Neo4jRunner } from './adapters/neo4j';

export * from './types';
export { project, projectEvent } from './projector';
export {
  resolveIdentity,
  rekeyEvents,
  replayEvents,
  replayToStore,
  isIdentityEvent,
  MERGE_EVENT,
  UNMERGE_EVENT,
  type IdentityResolution,
} from './replay';
export {
  wholePersonLens,
  careGapLens,
  sdohBarrierLens,
  careTeamLens,
  part2RestrictedLens,
  scopeCovers,
  LENSES,
  LENS_NAMES,
  NO_CONSENT,
  type ConsentScope,
  type LensName,
  type LensResult,
} from './lens';
export {
  MAPPING_SPECS,
  specFor,
  mutationsFor,
  MEMBER_KIND,
  type MappingSpec,
} from './mapping';
export { createPostgresGraphStore, ensureGraphSchema, GRAPH_DDL } from './adapters/postgres';
export {
  createNeo4jGraphStore,
  createNeo4jFakeGraphStore,
  renderMutation,
  assertIdentifier,
  type Neo4jRunner,
  type Neo4jRunResult,
  type Neo4jRecord,
  type CypherStatement,
} from './adapters/neo4j';

/** Connections the factory can draw on. Only the selected backend's is required. */
export interface GraphStoreConnections {
  postgres?: PgQueryable;
  neo4j?: Neo4jRunner;
  /** Fall back to the in-memory Neo4j fake when a neo4j backend has no live runner
   * (mock mode / this sandbox). The bolt path is proved by the Docker-guarded spec. */
  allowNeo4jFake?: boolean;
}

/**
 * Build the GraphStore for the configured backend. Switching backend is a CONFIG
 * change (GRAPH_BACKEND / setGraphBackend) and nothing else — same projector, same
 * mutations, same interface. Pass `backend` to override the resolved config.
 */
export function createGraphStore(
  conn: GraphStoreConnections,
  backend: GraphBackend = getGraphBackend(),
): GraphStore {
  if (graphBackendKind(backend) === 'postgres') {
    if (!conn.postgres) throw new Error(`graph backend '${backend}' needs a Postgres connection`);
    return createPostgresGraphStore(conn.postgres);
  }
  if (conn.neo4j) return createNeo4jGraphStore(conn.neo4j);
  if (conn.allowNeo4jFake) return createNeo4jFakeGraphStore();
  throw new Error(`graph backend '${backend}' needs a Neo4j runner (or allowNeo4jFake)`);
}
