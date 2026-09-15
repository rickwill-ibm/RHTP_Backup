// CONTRACT: C9  // CONTRACT: C2  // CONTRACT: C10  // SEAM: cdc-relay
/**
 * End-to-end pipeline runner: composes all five stages for one adapter and one
 * landed payload. This is the executable proof that land -> stage+validate ->
 * transform+enrich -> conform+load -> project+propagate runs as one contract,
 * both lanes, no persona hardcoded.
 */
import type { PumpResult } from '@/lib/outbox';
import {
  getDeadLetterStore,
  persistPipelineDeadLetters,
  type DeadLetterStore,
} from '@/lib/deadLetter';
import { conformAndLoad, projectAndPropagate, type LoadDeps } from './load';
import { landStage, type LandInput } from './stages';
import { batchStep } from './transform';
import type { DomainAdapter, PipelineDeps, QuarantineRecord, ReconciliationReport } from './types';

export interface PipelineRunResult {
  batchId: string;
  publishedIntents: string[];
  affectedMembers: string[];
  /** Structural (stage 2) + profile (stage 4) rejects, all PHI-safe. */
  quarantined: QuarantineRecord[];
  /**
   * The identity HELD-for-review lane: records whose subject scored in the
   * possible-match band (a subset of `quarantined`, status 'held-for-review').
   * Surfaced separately so a reviewer can resolve them without them ever having
   * auto-attached to a member. Empty in mock/seeded mode (deterministic resolver).
   */
  heldForReview: QuarantineRecord[];
  stageReconciliation: ReconciliationReport;
  loadReconciliation: ReconciliationReport;
  pump: PumpResult[];
}

/**
 * Run the whole pipeline for an adapter + landed input.
 *
 * NS-01: quarantine + held-identity records are no longer merely returned and
 * dropped — they are PERSISTED to the durable dead-letter store (resolved via the
 * `deadLetterStore` seam; mock/seeded → in-memory so the demo stays green). Pass
 * `deadLetterStore` to override (tests / composition); pass `null` to opt out.
 */
export async function runPipeline<Raw>(
  adapter: DomainAdapter<Raw>,
  input: LandInput,
  deps: PipelineDeps,
  loadDeps: Omit<LoadDeps, 'arrivalMode'>,
  deadLetterStore?: DeadLetterStore | null
): Promise<PipelineRunResult> {
  const landed = landStage.run(input, deps);
  const staged = batchStep(adapter)(landed, deps);
  const load = await conformAndLoad(landed.batchId, staged.normalized, deps, {
    ...loadDeps,
    arrivalMode: adapter.arrivalMode,
  });
  const pump = await projectAndPropagate(load.affectedMembers, {
    ...loadDeps,
    arrivalMode: adapter.arrivalMode,
  });
  const quarantined = [...staged.quarantined, ...load.quarantined];
  // NS-01 call-site wiring: persist quarantine + held-identity records instead of
  // dropping them. `null` opts out; undefined resolves the configured seam.
  if (deadLetterStore !== null) {
    const store = deadLetterStore ?? getDeadLetterStore();
    await persistPipelineDeadLetters(store, quarantined);
  }
  return {
    batchId: landed.batchId,
    publishedIntents: load.intents,
    affectedMembers: load.affectedMembers,
    quarantined,
    heldForReview: quarantined.filter((q) => q.status === 'held-for-review'),
    stageReconciliation: staged.reconciliation,
    loadReconciliation: load.reconciliation,
    pump,
  };
}
