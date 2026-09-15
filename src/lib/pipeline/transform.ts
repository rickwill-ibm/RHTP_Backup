// CONTRACT: C9  // CONTRACT: C10
/**
 * Lane-agnostic transform core + the packaging seam (plan §4A "lane-agnostic
 * transforms", binding). There is exactly ONE transform implementation per
 * domain (the adapter's validate+normalize), run through ONE runTransform. It is
 * packaged TWICE — as a batch DAG step and as a stream consumer — from that one
 * implementation. Divergence between batch and stream logic is a defect class,
 * banned by construction: both lanes call runTransform. The anti-divergence unit
 * test asserts batch and stream produce identical output for identical input.
 */
import { applySegmentation } from './segmentation';
import { isHeldIdentityError, type HeldIdentitySignal } from './heldIdentity';
import { bindSemantics, isCodeCarryingDomain } from './semanticBinding';
import type {
  DomainAdapter,
  LandedBatch,
  NormalizedRecord,
  PipelineDeps,
  QuarantineRecord,
  RawRecord,
  ReconciliationReport,
  SourceDescriptor,
  TransformOutcome,
} from './types';

function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Build a PHI-safe quarantine record: reason codes + field paths only. */
export function buildQuarantineRecord<Raw>(
  raw: RawRecord<Raw>,
  issues: { reasonCode: string; fieldPath: string }[],
  batchId: string,
  source: SourceDescriptor,
  deps: PipelineDeps
): QuarantineRecord {
  return {
    quarantineId: `q-${stableHash(`${batchId}:${raw.sourceRef}`)}`,
    batchId,
    source,
    sourceRef: raw.sourceRef,
    reasonCodes: issues.map((i) => i.reasonCode),
    fieldPaths: issues.map((i) => i.fieldPath),
    quarantinedAt: new Date(deps.now()).toISOString(),
    status: 'quarantined',
  };
}

/**
 * Build a PHI-safe HELD-for-review record: an identity possible-match, diverted
 * to the review lane so it never auto-attaches to a member. Same shape as a
 * quarantine record (status 'held-for-review' + reason code + match tier/score).
 */
export function buildHeldRecord<Raw>(
  raw: RawRecord<Raw>,
  signal: HeldIdentitySignal,
  batchId: string,
  source: SourceDescriptor,
  deps: PipelineDeps
): QuarantineRecord {
  return {
    quarantineId: `hold-${stableHash(`${batchId}:${raw.sourceRef}`)}`,
    batchId,
    source,
    sourceRef: raw.sourceRef,
    reasonCodes: [signal.reasonCode],
    fieldPaths: ['identity'],
    quarantinedAt: new Date(deps.now()).toISOString(),
    status: 'held-for-review',
    identityHold: { matchTier: signal.matchTier, confidence: signal.confidence },
  };
}

/**
 * The transform core: validate -> (quarantine | normalize -> segment). Pure over
 * (adapter, raw, deps). `landed` supplies batch context for quarantine records;
 * when absent (single-record transform stage) the adapter's own source is used.
 *
 * Identity resolution happens inside `normalize` (via the injected seam). If the
 * resolver lands the subject in the possible-match band it throws
 * `HeldIdentityError`, caught here and turned into a held-for-review record — the
 * record is NEVER normalized or loaded, so a wrong-person match cannot silently
 * corrupt the whole-person record. Any other throw propagates (a real fault).
 */
export function runTransform<Raw>(
  adapter: DomainAdapter<Raw>,
  raw: RawRecord<Raw>,
  deps: PipelineDeps,
  landed?: LandedBatch
): TransformOutcome {
  const batchId = landed?.batchId ?? adapter.source.batchId ?? `adhoc-${adapter.source.feed}`;
  const source = landed?.source ?? adapter.source;
  const validation = adapter.validate(raw);
  if (!validation.ok) {
    return {
      ok: false,
      quarantine: buildQuarantineRecord(raw, validation.issues, batchId, source, deps),
    };
  }
  let normalized: NormalizedRecord;
  try {
    normalized = adapter.normalize(raw, deps);
  } catch (e) {
    if (isHeldIdentityError(e)) {
      return { ok: false, quarantine: buildHeldRecord(raw, e.signal, batchId, source, deps) };
    }
    throw e;
  }
  const record = applySegmentation(normalized);
  // ── I8A-ii Wave C: stage-4 semantic gate BOUND at transform for code-carrying
  // domains. Reuses the semanticValidator (validate every governed coding) and
  // enforces value-set currency; a bad / unrecognized / retired code, or a stale
  // bound value-set version under the enforce posture, is quarantined PHI-safe
  // HERE, never admitted into the normalized set. The clock is injected (deps.now)
  // so the currency asOf is deterministic. Both lanes run through this one path,
  // so batch and stream cannot diverge on semantic admission.
  if (isCodeCarryingDomain(record.domain)) {
    const semantic = bindSemantics(record, { now: deps.now });
    if (!semantic.ok) {
      return {
        ok: false,
        quarantine: buildQuarantineRecord(raw, semantic.issues, batchId, source, deps),
      };
    }
  }
  return { ok: true, record };
}

export interface BatchStepResult {
  normalized: NormalizedRecord[];
  quarantined: QuarantineRecord[];
  reconciliation: ReconciliationReport;
}

/** Batch lane packaging: a DAG step over a whole landed batch, with a recon gate. */
export function batchStep<Raw>(adapter: DomainAdapter<Raw>) {
  return (landed: LandedBatch, deps: PipelineDeps): BatchStepResult => {
    const raws = adapter.parse(landed.payload);
    const normalized: NormalizedRecord[] = [];
    const quarantined: QuarantineRecord[] = [];
    for (const raw of raws) {
      const outcome = runTransform(adapter, raw, deps, landed);
      if (outcome.ok) normalized.push(outcome.record);
      else quarantined.push(outcome.quarantine);
    }
    return {
      normalized,
      quarantined,
      reconciliation: reconcile(landed.batchId, raws.length, normalized.length, quarantined.length),
    };
  };
}

/** Stream lane packaging: a consumer over one message (one record) of a payload. */
export function streamConsumer<Raw>(adapter: DomainAdapter<Raw>) {
  return (landed: LandedBatch, deps: PipelineDeps): TransformOutcome => {
    const raws = adapter.parse(landed.payload);
    if (raws.length !== 1) {
      throw new Error(
        `stream consumer for feed "${adapter.source.feed}" expects one record per message, got ${raws.length}`
      );
    }
    return runTransform(adapter, raws[0], deps, landed);
  };
}

/** The explicit packaging seam: one transform, both lanes, side by side. */
export function packageBothLanes<Raw>(adapter: DomainAdapter<Raw>) {
  return { batch: batchStep(adapter), stream: streamConsumer(adapter) };
}

/** Reconciliation gate: counts in = loaded + rejected, per batch (§4A stage 4). */
export function reconcile(
  batchId: string,
  countIn: number,
  loaded: number,
  rejected: number
): ReconciliationReport {
  return { batchId, countIn, loaded, rejected, balanced: countIn === loaded + rejected };
}

/** Alarmed gate assertion: throws on an unbalanced batch (never load silently). */
export function assertBalanced(report: ReconciliationReport): void {
  if (!report.balanced) {
    throw new ReconciliationError(report);
  }
}

export class ReconciliationError extends Error {
  constructor(public readonly report: ReconciliationReport) {
    super(
      `reconciliation gate failed for batch ${report.batchId}: ` +
        `in=${report.countIn} != loaded=${report.loaded} + rejected=${report.rejected}`
    );
    this.name = 'ReconciliationError';
  }
}
