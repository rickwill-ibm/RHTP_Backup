// CONTRACT: C2  // CONTRACT: C10  // SEAM: cdc-relay
/**
 * Stage 4 (conform + load) and stage 5 (project + propagate), wired to the
 * outbox-intent mechanism (ADR-006 + amendment §2). The loader is the outbox
 * writer: conform+load runs the profile-validate gate and the reconciliation
 * gate, then commits an intent per record (the transactional anchor). Project+
 * propagate pumps the writer, which does the idempotent FHIR apply and publishes
 * the C2 event only after a confirmed commit, per-member FIFO. Dual-write banned.
 */
import type { OutboxIntentInput, OutboxWriter, PumpResult } from '@/lib/outbox';
import { selectSemanticValidator, type SemanticValidator } from '@/lib/terminology';
import {
  defaultProfileValidator,
  selectProfileValidator,
  type FhirProfileValidator,
} from './profileValidator';
import { assertBalanced, buildQuarantineRecord, reconcile } from './transform';
import type {
  ArrivalMode,
  NormalizedRecord,
  PipelineDeps,
  QuarantineRecord,
  RawRecord,
  ReconciliationReport,
} from './types';

// The stage-4 profile gate seam moved to ./profileValidator (U2 fix): mock/seeded
// runs the structural pre-flight, production FAILS CLOSED until US Core $validate
// is wired. Re-exported here for back-compat with existing importers.
export { defaultProfileValidator, selectProfileValidator, type FhirProfileValidator };

export interface LoadDeps {
  writer: OutboxWriter;
  arrivalMode: ArrivalMode;
  profileValidator?: FhirProfileValidator;
  /**
   * Stage-4 SEMANTIC gate (terminology/ontology), run ALONGSIDE the structural
   * profileValidator. Defaults to selectSemanticValidator() (the `terminology`
   * dataMode seam). Pass `null` to disable the semantic gate for a caller.
   */
  semanticValidator?: SemanticValidator | null;
  actor?: string;
}

export interface ConformLoadResult {
  intents: string[];
  affectedMembers: string[];
  quarantined: QuarantineRecord[];
  reconciliation: ReconciliationReport;
}

function laneClass(mode: ArrivalMode): 'stream' | 'batch' {
  return mode === 'stream' ? 'stream' : 'batch';
}

/** Map a normalized record to the outbox intent input (the C2 payload seed). */
export function toIntentInput(record: NormalizedRecord, mode: ArrivalMode, actor: string): OutboxIntentInput {
  const batchId = record.source.batchId;
  return {
    memberId: record.memberId,
    eventType: record.eventType,
    fhirResourceId: record.fhirResourceId,
    idempotencyKey: record.idempotencyKey,
    actor,
    correlationId: `corr-${batchId ?? record.source.feed}-${record.memberId}`,
    class: laneClass(mode),
    source: { ...record.source, tier: record.tier },
    consentContext: record.consent,
    occurredAt: record.occurredAt,
    payload: record.payload,
  };
}

/**
 * Stage 4 — Conform + load. Profile-validate gate then intent commit per record;
 * batchId defaults from the first record. Runs the reconciliation gate (counts
 * in = loaded + rejected) and throws on an unbalanced batch (never loads silently).
 */
export async function conformAndLoad(
  batchId: string,
  records: NormalizedRecord[],
  deps: PipelineDeps,
  loadDeps: LoadDeps,
): Promise<ConformLoadResult> {
  // undefined -> mode-selected profile gate (production fails closed); an explicit
  // validator still overrides for a caller/test.
  const validator = loadDeps.profileValidator ?? selectProfileValidator();
  // undefined -> default semantic gate; explicit null -> disabled for this caller.
  const semantic =
    loadDeps.semanticValidator === undefined ? selectSemanticValidator() : loadDeps.semanticValidator;
  const actor = loadDeps.actor ?? `pipeline-loader`;
  const intents: string[] = [];
  const affected = new Set<string>();
  const quarantined: QuarantineRecord[] = [];

  for (const record of records) {
    // Gate 1: structural profile validity.
    const result = validator.validate(record);
    if (!result.ok) {
      const raw: RawRecord = { sourceRef: record.idempotencyKey, data: {} };
      quarantined.push(buildQuarantineRecord(raw, result.issues, batchId, record.source, deps));
      continue;
    }
    // Gate 2: semantic (terminology/ontology) validity — additional, not a replacement.
    if (semantic) {
      const semanticResult = semantic.validate(record);
      if (!semanticResult.ok) {
        const raw: RawRecord = { sourceRef: record.idempotencyKey, data: {} };
        quarantined.push(buildQuarantineRecord(raw, semanticResult.issues, batchId, record.source, deps));
        continue;
      }
    }
    const { intentId } = await loadDeps.writer.enqueue(toIntentInput(record, loadDeps.arrivalMode, actor));
    intents.push(intentId);
    affected.add(record.memberId);
  }

  const reconciliation = reconcile(batchId, records.length, intents.length, quarantined.length);
  assertBalanced(reconciliation);
  return { intents, affectedMembers: [...affected], quarantined, reconciliation };
}

/**
 * Stage 5 — Project + propagate. Pumps the outbox writer per affected member:
 * idempotent FHIR apply, confirm, then publish the C2 event in per-member
 * sequence order. Events are the only way domains reach the graph and the SDE.
 */
export async function projectAndPropagate(
  affectedMembers: string[],
  loadDeps: LoadDeps,
): Promise<PumpResult[]> {
  const results: PumpResult[] = [];
  for (const memberId of affectedMembers) {
    results.push(await loadDeps.writer.pump(memberId));
  }
  return results;
}

/** Descriptor metadata for the two I/O stages (parity with StageContract). */
export const CONFORM_LOAD_CONTRACT = Object.freeze({
  stage: 'conform-load' as const,
  declaredInput: 'NormalizedRecord[] (one batch)',
  declaredOutput: 'ConformLoadResult (intents committed + recon gate)',
  idempotencyKeyOf: (batchId: string) => `conform:${batchId}`,
});

export const PROJECT_PROPAGATE_CONTRACT = Object.freeze({
  stage: 'project-propagate' as const,
  declaredInput: 'affected memberIds',
  declaredOutput: 'C2 events published in per-member sequence order',
  idempotencyKeyOf: (memberId: string) => `propagate:${memberId}`,
});
