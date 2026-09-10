// cdp-intake/wiring.ts — the ONE integration file: binds the pure core to the REAL
// front doors. This is the only module in the tree that imports the engine (forward
// dependency, new → existing); nothing imports it back. Deletable with the tree.
//
// It builds the live IntakeDispatch and a runPopulationLoad() convenience the run route
// calls. FHIR sources go through ingestBundleJson (which resolves identity via the shared
// xref/EMPI seam, runs the 5-stage pipeline incl. the semantic/terminology gate, and
// projects into the SHARED graph). Raw adapter sources (X12/HL7/CSV) land in increment 2b
// (runPipeline → outbox → projection.drain); for now they are reported, not loaded.

import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { ingestBundleJson, type IngestStores } from '@/lib/runtime/ingestBundle';
import { defaultCrossReferenceStore } from '@/lib/identity';
import type { IntakeDispatch, SourceLoadOutcome, IntakeRunResult } from './types';
import { runIntake } from './coordinator';
import { seededIdentitySource } from './seededIdentitySource';

/**
 * A live dispatch bound to the shared projection stores AND the process-shared
 * in-memory cross-reference index (defaultCrossReferenceStore().index) — the XrefIndex
 * ingestBundleJson resolves identity against, shared with every in-process reader and
 * the stream door, so identity persists across runs and consolidates across sources /
 * the batch↔stream seam. (Productionising durable xref is a composition-root concern
 * behind the crossReference seam, not wired here.) Projects into the same graph the
 * WPC record + KG read.
 */
export function makeLiveDispatch(): IntakeDispatch {
  const proj = getSharedProjectionStores();
  const stores: IngestStores = {
    outbox: proj.outbox,
    graph: proj.graph,
    checkpoint: proj.checkpoint,
    xref: defaultCrossReferenceStore().index,
  };
  return {
    async ingestFhir(payload: string, sourceSystem: string) {
      // seededIdentitySource resolves the 5 demo patients deterministically (medicaidId-exact)
      // to stable member ids instead of minting orphans; passed by value, no engine edit.
      return ingestBundleJson(
        payload,
        { sourceSystem, identitySource: seededIdentitySource },
        stores
      );
    },
    async runAdapter(
      _adapter: string,
      sourceSystem: string,
      _format: string,
      _payload: string
    ): Promise<SourceLoadOutcome> {
      // Increment 2b: raw X12/HL7/CSV via runPipeline → outbox → projection.drain.
      // Reported (not loaded) so the population totals stay honest until that lands.
      return {
        sourceSystem,
        file: '',
        memberId: '',
        held: false,
        loaded: 0,
        quarantined: 0,
        byDomain: {},
      };
    },
  };
}

/** Cumulative size of the projected knowledge graph after a load — REAL, read back
 * from the shared GraphStore (listNodes/listEdges), never a fabricated figure. */
export interface GraphSize {
  nodes: number;
  edges: number;
}

/** IntakeRunResult plus the real projected-graph size — what the screen shows as the
 * population's knowledge-graph footprint. The graph is process-shared and accumulates
 * across runs, so this is the graph's CURRENT size, not this run's delta. */
export interface PopulationLoadResult extends IntakeRunResult {
  graph: GraphSize;
}

/**
 * Run a whole source folder through the REAL pipeline into the shared projected graph,
 * then read back the graph's true node/edge counts from the SAME shared store the
 * dispatch projected into (getSharedProjectionStores is memoized → same instance).
 */
export async function runPopulationLoad(dir: string): Promise<PopulationLoadResult> {
  const result = await runIntake(dir, makeLiveDispatch(), {
    receivedAt: new Date().toISOString(),
  });
  const { graph } = getSharedProjectionStores();
  const [nodes, edges] = await Promise.all([graph.listNodes(), graph.listEdges()]);
  return { ...result, graph: { nodes: nodes.length, edges: edges.length } };
}
