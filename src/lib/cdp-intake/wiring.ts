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
import { createXrefIndex } from '@/lib/identity';
import type { IntakeDispatch, SourceLoadOutcome, IntakeRunResult } from './types';
import { runIntake } from './coordinator';

/**
 * A live dispatch bound to the shared projection stores + ONE xref for this run, so
 * every source in the folder consolidates identity through the same cross-reference
 * (cross-source stitching) and projects into the same graph the WPC record + KG read.
 */
export function makeLiveDispatch(): IntakeDispatch {
  const proj = getSharedProjectionStores();
  const stores: IngestStores = {
    outbox: proj.outbox,
    graph: proj.graph,
    checkpoint: proj.checkpoint,
    xref: createXrefIndex(),
  };
  return {
    async ingestFhir(payload: string, sourceSystem: string) {
      return ingestBundleJson(payload, { sourceSystem }, stores);
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

/** Run a whole source folder through the REAL pipeline into the shared projected graph. */
export async function runPopulationLoad(dir: string): Promise<IntakeRunResult> {
  return runIntake(dir, makeLiveDispatch(), { receivedAt: new Date().toISOString() });
}
