// CONTRACT: C9  // CONTRACT: C2  // CONTRACT: C10  // SEAM: cdc-relay  // M3
/**
 * FHIR-Subscription STREAMING ingest driver (worked example).
 *
 * A FHIR R4 Subscription notification delivers ONE resource at a time (not a
 * transaction bundle). This driver is the streaming front door for that shape: it
 * takes a single FHIR resource, routes it to the domain adapter that owns it, runs
 * it through the REAL five-stage pipeline in the STREAM lane, drains the shared
 * outbox to the projected graph, and — critically — projects it onto the SAME
 * member a prior BATCH load already anchored, via the SAME shared cross-reference
 * index. Nothing about the batch path changes: this rides the existing
 * transform/outbox/graph wiring and adds no `WpcDomain` and no mapping spec.
 *
 * How the STREAM lane is real (not cosmetic):
 *   The lane class stamped on every outbox event derives from the OWNING adapter's
 *   `arrivalMode` (`toIntentInput` -> `laneClass(mode)` in `src/lib/pipeline/load.ts`).
 *   The domain adapters that own FHIR-JSON resources declare `arrivalMode:'batch'`
 *   (they are shared with `ingestBundle`). To flip this ONE run to the stream lane
 *   without mutating the shared adapter, `asStreamAdapter` returns a shallow copy
 *   with `arrivalMode:'stream'`. The SAME parse/validate/normalize/segmentation
 *   logic runs; only the event `class` is stamped `'stream'`.
 *
 * Identity SAFETY (why a streamed event never mints blind):
 *   A batch load anchors on the bundle's Patient DEMOGRAPHICS and refuses to mint
 *   when there is no Patient. A single streamed resource carries only a SUBJECT
 *   REFERENCE — a bare id token, no demographics — so the id-only EMPI path would
 *   silently MINT a phantom member for any unknown token. That is a fail-open the
 *   batch path never allows, so this front door adds a PRE-RESOLUTION GATE: the
 *   subject token must already resolve in the shared xref (`linked`) — i.e. a prior
 *   batch load anchored it — OR the caller must pass an `expectedMemberId` (an
 *   operator-confirmed consolidation, which seeds the link). An unknown (`unlinked`)
 *   token with no `expectedMemberId`, or an `ambiguous` token, is HELD for identity
 *   review (a PHI-safe held-identity dead-letter, a first-class `held:true` result)
 *   and NOTHING is minted or projected. Consolidation onto an existing member is the
 *   only silent success; minting is never silent.
 *
 * Balance-control: every event — admitted, unrouted, or held — emits ONE PHI-safe
 * `LoadReconciliationRecord` (counts/refs only) so the stream lane leaves the same
 * durable audit trace the batch lane does, and no event is silently dropped.
 *
 * PHI-safety: only codes/refs cross the seam (the adapters are the same PHI-minimal
 * normalizers the batch path uses); quarantines persist when a dead-letter store is
 * wired, exactly as `ingestBundle` does.
 */
import type { DeadLetterStore } from '@/lib/deadLetter';
import { HeldIdentityError, defaultPipelineDeps, runPipeline } from '@/lib/pipeline';
import type {
  ArrivalMode,
  DomainAdapter,
  IdentityResolver,
  PipelineDeps,
  QuarantineRecord,
} from '@/lib/pipeline';
import { route, type FhirResource } from './ingestRouting';
import { createXrefEmpiResolver } from '@/lib/identity';
import type { XrefLookup } from '@/lib/identity';
import { GLOBAL_SCOPE, scopeKey } from '@/lib/identity/empiResolver';
import type { IdentitySource } from '@/lib/identity/identitySource';
import { getIdentitySource } from '@/lib/identity/identitySource';
import { OutboxWriter } from '@/lib/outbox';
import { makeDevOutboxDeps } from '@/lib/jobs/devOutbox';
import { runProjectionOnce } from '@/lib/graph/consumer';
import { now as clockNow, rng as clockRng } from '@/lib/clock';
import type { IngestStores } from './ingestBundle';
import { buildLoadReconciliationRecord, type LoadReconciliationRecord } from './reconciliation';

// ─── options + result ─────────────────────────────────────────────────────────

export interface IngestStreamEventOptions {
  /**
   * The notification's SOURCE SYSTEM — the cross-reference id scope. Pass the SAME
   * value the member's batch load used so the streamed subject id resolves to the
   * EXISTING member (consolidation); a different value namespaces it apart.
   */
  sourceSystem: string;
  /**
   * Operator-confirmed member id for this streamed subject. Provide it ONLY when a
   * human/EMPI has confirmed the token belongs to this member: it seeds the shared
   * xref link and lets an as-yet-unlinked token consolidate instead of being held.
   * Without it, an unknown subject is HELD (never minted blind). Ignored for a
   * subject that already resolves, and never honored for an `ambiguous` token.
   */
  expectedMemberId?: string;
  /** EMPI candidate source (default: the configured identity source). */
  identitySource?: IdentitySource;
  now?: () => number;
  rng?: () => number;
  actor?: string;
  /** Dead-letter store for quarantines/holds; `null` (default) keeps the driver hermetic. */
  deadLetterStore?: DeadLetterStore | null;
}

export interface StreamEventResult {
  /** The anchored member id the streamed resource projected onto (or '' if none). */
  memberId: string;
  /** The `WpcDomain` of the adapter that owned the resource (or '' when unrouted). */
  admittedDomain: string;
  /** Records admitted (intents committed) for this event — >= 1 on a clean admit. */
  admitted: number;
  /** Quarantined records (structural + semantic), PHI-safe. */
  quarantined: QuarantineRecord[];
  /** Projection drain metrics after the graph was populated. */
  projection: { applied: number; skipped: number; members: number };
  /** The lane class stamped on the streamed event — 'stream' for this front door. */
  laneClass: 'stream' | 'batch';
  /** True when no domain adapter owned the resource (nothing projected, no crash). */
  unrouted: boolean;
  /**
   * True when the event was HELD for identity review (unknown/ambiguous subject with
   * no `expectedMemberId`): nothing minted, nothing projected. A first-class signal —
   * an operator resolves the identity, then re-streams with `expectedMemberId`.
   */
  held: boolean;
  /** The identity-hold reason code when `held`, else ''. PHI-safe. */
  heldReason: string;
  /** The one PHI-safe balance-control record this event emitted (counts/refs only). */
  reconciliation: LoadReconciliationRecord;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * The raw subject-id token an adapter would extract from this resource, computed the
 * SAME way the domain adapters do (`reference.split('/').pop()`), so the gate's xref
 * key is identical to the key the pipeline resolves through. Covers every anchor
 * reference the payer/clinical adapters read, in the SAME precedence: `subject`
 * (Observation/Condition/Encounter/RiskAssessment/Flag), then `beneficiary` /
 * `subscriber` (Coverage), then `patient` (Flag fallback + administrative resources).
 */
function subjectToken(resource: FhirResource): string {
  const o = obj(resource);
  const ref =
    str(obj(o.subject).reference) ||
    str(obj(o.beneficiary).reference) ||
    str(obj(o.subscriber).reference) ||
    str(obj(o.patient).reference);
  return ref.split('/').pop() ?? '';
}

/**
 * Wrap a domain adapter so THIS run executes in the STREAM lane: a shallow copy
 * with `arrivalMode:'stream'`. The shared adapter object is never mutated, so the
 * batch path keeps its declared `arrivalMode`. `runPipeline` reads the wrapped
 * adapter's `arrivalMode` and `toIntentInput` stamps the event `class:'stream'`.
 */
export function asStreamAdapter<Raw>(adapter: DomainAdapter<Raw>): DomainAdapter<Raw> {
  const mode: ArrivalMode = 'stream';
  return { ...adapter, arrivalMode: mode };
}

function laneClassOf(mode: ArrivalMode): 'stream' | 'batch' {
  return mode === 'stream' ? 'stream' : 'batch';
}

/** Resource-granular census for the single streamed resource (always sums to countIn=1). */
function streamCensus(
  admittedIntents: number,
  quarantined: number
): {
  admitted: number;
  quarantined: number;
  nonProjected: number;
} {
  const admitted = admittedIntents > 0 ? 1 : 0;
  const quar = admitted === 0 && quarantined > 0 ? 1 : 0;
  const nonProjected = admitted + quar === 0 ? 1 : 0;
  return { admitted, quarantined: quar, nonProjected };
}

// ─── driver ───────────────────────────────────────────────────────────────

/**
 * Ingest ONE FHIR resource delivered by a FHIR Subscription notification
 * (route -> identity-safety gate -> STREAM-lane pipeline -> shared outbox ->
 * projected graph). Pure over its injected stores; consolidates onto the member the
 * shared xref already anchors, and HOLDS (never mints blind) an unknown subject.
 */
export async function ingestStreamEvent(
  resource: FhirResource,
  options: IngestStreamEventOptions,
  stores: IngestStores
): Promise<StreamEventResult> {
  const now = options.now ?? clockNow;
  const rng = options.rng ?? clockRng;
  const scope = options.sourceSystem || GLOBAL_SCOPE;
  const src = options.identitySource ?? getIdentitySource();
  const deadLetter = stores.deadLetter ?? options.deadLetterStore ?? null;
  const occurredAt = new Date(now()).toISOString();
  const token = subjectToken(resource);

  // A closure that emits the ONE PHI-safe reconciliation record this event owes,
  // appends it when a store is wired, and returns it for the first-class result.
  const reconcile = async (input: {
    memberRef: string;
    admittedIntents: number;
    quarantined: number;
    projected: number;
    held: boolean;
    heldRefs: string[];
  }): Promise<LoadReconciliationRecord> => {
    const census = input.held
      ? { admitted: 0, quarantined: 0, nonProjected: 1 }
      : streamCensus(input.admittedIntents, input.quarantined);
    const rec = buildLoadReconciliationRecord({
      kind: 'load',
      sourceSystem: scope,
      memberRef: input.memberRef,
      patientToken: token,
      occurredAt,
      countIn: 1,
      admitted: census.admitted,
      quarantined: census.quarantined,
      nonProjected: census.nonProjected,
      projected: input.projected,
      held: input.held,
      heldRefs: input.heldRefs,
    });
    if (stores.reconciliation) await stores.reconciliation.append(rec);
    return rec;
  };

  // ── 1. route the single resource to its owning domain adapter.
  const single: FhirResource[] = str(obj(resource).resourceType) ? [resource] : [];
  const { groups } = route(single);
  if (groups.length === 0) {
    // No adapter owns this resource (e.g. Basic, or an unroutable Observation).
    // Nothing projects; the front door reports it loudly and still leaves an audit
    // trace (the by-design non-projected census for a single streamed resource).
    const reconciliation = await reconcile({
      memberRef: '',
      admittedIntents: 0,
      quarantined: 0,
      projected: 0,
      held: false,
      heldRefs: [],
    });
    return {
      memberId: '',
      admittedDomain: '',
      admitted: 0,
      quarantined: [],
      projection: { applied: 0, skipped: 0, members: 0 },
      laneClass: 'stream',
      unrouted: true,
      held: false,
      heldReason: '',
      reconciliation,
    };
  }
  // One resource routes to exactly one group; guard defensively regardless.
  const group = groups[0];
  const streamAdapter = asStreamAdapter(group.adapter);

  // ── 2. IDENTITY-SAFETY GATE (never mint blind). A single streamed resource carries
  // only a subject token (no demographics), so the id-only EMPI path would MINT for
  // any unknown token. Refuse that fail-open: the token must already resolve in the
  // shared xref (a prior batch load anchored it), or the caller must confirm the
  // member via `expectedMemberId` (which seeds the link). Otherwise HOLD.
  const key = scopeKey(scope, token);
  const look: XrefLookup = token ? stores.xref.lookup(key) : { status: 'unlinked' };
  let heldReason = '';
  if (look.status === 'linked') {
    // Known subject — consolidate onto the existing member. (silent success)
  } else if (look.status === 'unlinked' && options.expectedMemberId) {
    // Operator-confirmed consolidation: seed the shared xref link, then proceed.
    stores.xref.link(key, options.expectedMemberId, `stream:${scope}`);
  } else {
    // Unknown token with no confirmation, OR an ambiguous token (never auto-picked).
    heldReason =
      look.status === 'ambiguous'
        ? 'identity-xref-ambiguous'
        : token
          ? 'identity-unresolved-stream-subject'
          : 'missing-stream-subject';
  }

  if (heldReason) {
    // HELD for identity review: persist a PHI-safe held-identity dead-letter (so the
    // held event never vanishes from the audit trail), emit the balance-control
    // record, and return a first-class `held:true`. NOTHING is minted or projected.
    const heldRefs: string[] = [];
    if (deadLetter) {
      const rec = await deadLetter.append({
        kind: 'held-identity',
        memberRef: scope,
        reasonCode: heldReason,
        sourceRef: token || `stream:${scope}`,
        payloadRef: `stream:${scope}`,
        createdAt: occurredAt,
      });
      heldRefs.push(rec.id);
    }
    const reconciliation = await reconcile({
      memberRef: '',
      admittedIntents: 0,
      quarantined: 0,
      projected: 0,
      held: true,
      heldRefs,
    });
    return {
      memberId: '',
      admittedDomain: str(group.adapter.domain),
      admitted: 0,
      quarantined: [],
      projection: { applied: 0, skipped: 0, members: 0 },
      laneClass: 'stream',
      unrouted: false,
      held: true,
      heldReason,
      reconciliation,
    };
  }

  // ── 3. identity wiring — the SAME seam the batch driver uses, SAME idScope. The
  // gate above guarantees the token resolves `linked` here (either it already was, or
  // `expectedMemberId` seeded it), so this consolidates onto the EXISTING member.
  const base = createXrefEmpiResolver(stores.xref, src);
  const resolveIdentity: IdentityResolver = (id, traits) =>
    base(id, { ...(traits ?? {}), idScope: scope });
  const deps: PipelineDeps = defaultPipelineDeps({ now, rng, resolveIdentity });

  // ── 4. run the owning adapter through the REAL pipeline into the shared outbox,
  // stamping the event class from the wrapped adapter's `arrivalMode` ('stream').
  const outboxDeps = { ...makeDevOutboxDeps(stores.outbox), now, rng };
  const writer = new OutboxWriter(outboxDeps);
  const payload = JSON.stringify({
    resourceType: 'Bundle',
    type: 'collection',
    entry: [{ resource }],
  });

  const loadDeps = options.actor ? { writer, actor: options.actor } : { writer };
  let admitted = 0;
  let memberId = '';
  let heldByPipeline = false;
  const quarantined: QuarantineRecord[] = [];
  try {
    const result = await runPipeline(
      streamAdapter,
      { source: streamAdapter.source, format: streamAdapter.format, payload },
      deps,
      loadDeps,
      deadLetter
    );
    admitted = result.publishedIntents.length;
    memberId = result.affectedMembers[0] ?? '';
    quarantined.push(...result.quarantined);
  } catch (e) {
    // Defense in depth: the gate above already holds an unresolvable subject, so this
    // catch is a backstop for a demographics-based hold a future adapter might raise.
    // Treat it as a held event (never a force-attach), not a crash of the front door.
    if (!(e instanceof HeldIdentityError)) throw e;
    heldByPipeline = true;
    heldReason = 'identity-held-in-pipeline';
  }

  // ── 5. drain the shared outbox to the projected graph (idempotent + resumable).
  const projection = await runProjectionOnce(stores.outbox, stores.graph, stores.checkpoint, {
    now,
    rng,
  });

  const reconciliation = await reconcile({
    memberRef: memberId,
    admittedIntents: admitted,
    quarantined: quarantined.length,
    projected: projection.applied,
    held: heldByPipeline,
    heldRefs: [],
  });

  return {
    memberId,
    admittedDomain: str(group.adapter.domain),
    admitted,
    quarantined,
    projection: {
      applied: projection.applied,
      skipped: projection.skipped,
      members: projection.members,
    },
    laneClass: laneClassOf(streamAdapter.arrivalMode),
    unrouted: false,
    held: heldByPipeline,
    heldReason,
    reconciliation,
  };
}
