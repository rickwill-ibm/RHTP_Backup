// CONTRACT: C9  // CONTRACT: C2  // CONTRACT: C10
/**
 * The five-stage contract as real code (plan §4A). Stages 1-3 are the pure,
 * synchronous, lane-agnostic core declared here as StageContract objects with
 * named IO and an idempotency key each; stages 4-5 (conform+load, project+
 * propagate) carry I/O over the outbox/FHIR seams and live in load.ts. All five
 * are registered in PIPELINE_STAGES so traceability and tests can enumerate the
 * contract mechanically.
 */
import * as clock from '@/lib/clock';
import { getDataMode } from '@/lib/config/dataMode';
import { empiResolver } from '@/lib/identity/empiResolver';
import { externalIdentityResolverFor, identityResolverKind } from '@/lib/identity/external';
import { runTransform } from './transform';
import type {
  DomainAdapter,
  IdentityResolver,
  LandedBatch,
  PipelineDeps,
  PipelineStage,
  QuarantineRecord,
  RawRecord,
  SourceDescriptor,
  SourceFormat,
  StageContract,
  TransformOutcome,
} from './types';

/**
 * Deterministic identity resolver: source id -> anchored member id. Ignores
 * demographics (deterministic-only). Kept for mock/seeded (demo) stability — the
 * demo's ids stay identical run to run. Production swaps in the EMPI resolver.
 */
export const defaultIdentityResolver: IdentityResolver = (sourceMemberId) =>
  `mem-${hash(sourceMemberId).slice(0, 8)}`;

/**
 * The resolver the pipeline uses, chosen by the resolver-KIND config layered
 * over the `identity` dataMode seam:
 *   external-pixpdq     -> PIX/PDQ (HL7v2) external EMPI stub (throws until wired).
 *   external-pixm-pdqm  -> PIXm/PDQm (FHIR) external EMPI stub (throws until wired).
 *   internal (default)  -> production: the EMPI resolver (real match engine, holds
 *                          possible matches); mock/seeded: the deterministic stub
 *                          (stable demo, no external matching).
 * An external EMPI returns an enterprise/global id that becomes the anchored
 * member id. Config change only (identityResolverKind / getDataMode), never a
 * code change (plan D5). Internal stays default so the demo stays green.
 */
export function selectIdentityResolver(): IdentityResolver {
  const external = externalIdentityResolverFor(identityResolverKind());
  if (external) return external;
  return getDataMode('identity') === 'production' ? empiResolver : defaultIdentityResolver;
}

/** Default deps bound to the clock.ts seam (tests override with fakes). */
export function defaultPipelineDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    now: overrides.now ?? clock.now,
    rng: overrides.rng ?? clock.rng,
    resolveIdentity: overrides.resolveIdentity ?? selectIdentityResolver(),
  };
}

/** Stable non-crypto content hash (djb2, hex) for catalog checksums + ids. */
export function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export interface LandInput {
  source: SourceDescriptor;
  format: SourceFormat;
  payload: string;
  batchId?: string;
}

/** Stage 1 — Land. Raw capture, immutable, cataloged. Nothing is transformed. */
export const landStage: StageContract<LandInput, LandedBatch> = {
  stage: 'land',
  declaredInput: 'LandInput (source, format, raw payload)',
  declaredOutput: 'LandedBatch (batchId, checksum, receivedAt, verbatim payload)',
  idempotencyKeyOf: (i) => `land:${i.source.system}:${i.source.feed}:${i.batchId ?? hash(i.payload)}`,
  run(input, deps) {
    const checksum = hash(input.payload);
    const batchId = input.batchId ?? `batch-${input.source.feed}-${checksum}`;
    return {
      batchId,
      source: { ...input.source, batchId },
      format: input.format,
      receivedAt: new Date(deps.now()).toISOString(),
      checksum,
      payload: input.payload,
    };
  },
};

export interface StageValidateOutput<Raw = Record<string, unknown>> {
  staged: RawRecord<Raw>[];
  quarantined: QuarantineRecord[];
}

/**
 * Stage 2 — Stage + validate (adapter-scoped). Parses the landed payload and
 * structurally validates each record; rejects go to the quarantine lane as
 * PHI-safe records, never silently dropped.
 */
export function stageValidate<Raw>(
  adapter: DomainAdapter<Raw>,
): StageContract<LandedBatch, StageValidateOutput<Raw>> {
  return {
    stage: 'stage-validate',
    declaredInput: 'LandedBatch',
    declaredOutput: 'StageValidateOutput (staged RawRecords + PHI-safe quarantine)',
    idempotencyKeyOf: (b) => `stage:${b.batchId}`,
    run(landed, deps) {
      const staged: RawRecord<Raw>[] = [];
      const quarantined: QuarantineRecord[] = [];
      for (const raw of adapter.parse(landed.payload)) {
        const outcome = runTransform(adapter, raw, deps, landed);
        if (outcome.ok) staged.push(raw);
        else quarantined.push(outcome.quarantine);
      }
      return { staged, quarantined };
    },
  };
}

/**
 * Stage 3 — Transform + enrich (adapter-scoped). Normalizes one valid raw record
 * to the canonical model, resolves identity, and applies segmentation labels.
 * This is the SAME runTransform the lane packaging uses, so batch and stream
 * cannot diverge.
 */
export function transformEnrich<Raw>(
  adapter: DomainAdapter<Raw>,
): StageContract<RawRecord<Raw>, TransformOutcome> {
  return {
    stage: 'transform-enrich',
    declaredInput: 'RawRecord',
    declaredOutput: 'TransformOutcome (NormalizedRecord | QuarantineRecord)',
    idempotencyKeyOf: (r) => `transform:${adapter.source.feed}:${r.sourceRef}`,
    run: (raw, deps) => runTransform(adapter, raw, deps),
  };
}

/** All five stage contract descriptors (4-5 imported lazily to avoid a cycle). */
export const PIPELINE_STAGE_NAMES: readonly PipelineStage[] = Object.freeze([
  'land',
  'stage-validate',
  'transform-enrich',
  'conform-load',
  'project-propagate',
]);
