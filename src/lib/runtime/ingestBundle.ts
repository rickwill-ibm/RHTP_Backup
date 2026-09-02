// CONTRACT: C9  // CONTRACT: C2  // CONTRACT: C10  // SEAM: cdc-relay  // M3
/**
 * Fan-out FHIR-bundle ingest driver (production-shaped, reusable).
 *
 * Given ONE FHIR bundle, it routes each entry to the domain adapter that owns it,
 * runs every group through the REAL five-stage pipeline (`runPipeline`) into a
 * SHARED outbox, then drains the outbox to the projected graph via
 * `runProjectionOnce`. This is the single path that turns a whole-person bundle
 * into a projected, consent-scoped graph — the same wiring production triggers per
 * feed, exercised here over the seed bundles.
 *
 * Routing (resourceType, then discriminator) lives in `./ingestRouting`:
 *   Condition          -> behavioral-health (ICD-10 F-code, any position) | conditions
 *   Observation        -> labs-vitals (laboratory|vital-signs)
 *                       | sdoh (social-history) | behavioral-health (survey)
 *   MedicationRequest / MedicationDispense -> medications
 *   ServiceRequest     -> referrals
 *   Goal / Task        -> goals-tasks
 *   CareTeam           -> care-team
 *   Coverage           -> coverage      | Encounter -> encounter
 *   RiskAssessment     -> risk-assessment | Flag     -> flag
 * Everything else (CarePlan, Organization, Practitioner, Consent, Patient, care-gap
 * Observations, ...) is recorded in the non-projected census — accounted for by
 * design, never silently dropped.
 *
 * M3 identity wiring (closes the red-team fragmentation + cross-link gaps):
 *   1. The bundle's Patient demographics are PRE-RESOLVED once via `resolveEmpi`
 *      (name/dob + a GLOBAL medicaidId when present + a SOURCE-SCOPED localId =
 *      {assigningAuthority: sourceSystem, value: MRN}). A possible-match band
 *      result HOLDS the whole bundle — a wrong-person auto-link never happens.
 *   2. The resolved member id is seeded into a per-source cross-reference under the
 *      bundle's `idScope` (the sourceSystem). Every adapter then resolves its raw
 *      subject id (id-only) through `createXrefEmpiResolver` against THAT scope, so
 *      all of one person's records in the bundle consolidate to ONE member, while
 *      a raw subject id reused across DIFFERENT sources cannot cross-link (the id
 *      is namespaced by source), and a reused MRN under a different assigning
 *      authority is a different person (localId is same-source-exact only).
 *
 * PHI-safety is paramount: on an ambiguous / possible-match identity the bundle is
 * HELD, never force-merged; nothing is projected for a held bundle.
 */
import type { DeadLetterStore } from '@/lib/deadLetter';
import {
  buildLoadReconciliationRecord,
  type LoadReconciliationRecord,
  type ReconciliationStore,
} from './reconciliation';
import { HeldIdentityError, defaultPipelineDeps, runPipeline } from '@/lib/pipeline';
import type { IdentityResolver, PipelineDeps, QuarantineRecord, WpcDomain } from '@/lib/pipeline';
import { route, type FhirResource } from './ingestRouting';
import { patientContext } from './ingestPatientContext';
import { createXrefEmpiResolver, resolveEmpi, type XrefIndex } from '@/lib/identity';
import { GLOBAL_SCOPE, scopeKey } from '@/lib/identity/empiResolver';
import type { IdentitySource } from '@/lib/identity/identitySource';
import { getIdentitySource } from '@/lib/identity/identitySource';
import { OutboxWriter, type OutboxStore } from '@/lib/outbox';
import { makeDevOutboxDeps } from '@/lib/jobs/devOutbox';
import { runProjectionOnce, type ProjectionCheckpointStore } from '@/lib/graph/consumer';
import type { GraphStore } from '@/lib/graph/types';
import { now as clockNow, rng as clockRng } from '@/lib/clock';

// ─── types ────────────────────────────────────────────────────────────────────

interface BundleEntry {
  fullUrl?: string;
  resource?: FhirResource;
}
export interface FhirBundle {
  resourceType?: string;
  entry?: BundleEntry[];
}

/** The stores the driver reads/writes — injected so tests pick the graph backend. */
export interface IngestStores {
  outbox: OutboxStore;
  graph: GraphStore;
  checkpoint: ProjectionCheckpointStore;
  /** The cross-reference index the M3 identity seam consolidates through. */
  xref: XrefIndex;
  /**
   * Durable append-only dead-letter ledger. OPTIONAL so existing callers keep
   * working; when present, quarantines + holds persist immutably (nothing vanishes
   * from the audit trail).
   */
  deadLetter?: DeadLetterStore;
  /**
   * Durable append-only ABC reconciliation ledger. OPTIONAL; when present, the
   * per-load `LoadReconciliationRecord` is appended.
   */
  reconciliation?: ReconciliationStore;
}

export interface IngestBundleOptions {
  /**
   * The bundle's SOURCE SYSTEM — the assigning authority for the localId AND the
   * cross-reference id scope. Two bundles from DIFFERENT sources must pass DIFFERENT
   * values; that is what keeps a reused raw subject id / MRN from cross-linking.
   */
  sourceSystem: string;
  /** Identifier system that carries a GLOBAL medicaid id (default: matches /medicaid/i). */
  medicaidSystem?: string;
  /** EMPI candidate source (default: the configured identity source). */
  identitySource?: IdentitySource;
  now?: () => number;
  rng?: () => number;
  /** Dead-letter store for quarantines; `null` (default) keeps the driver hermetic. */
  deadLetterStore?: DeadLetterStore | null;
}

export interface IngestBundleResult {
  /** The anchored member id, or '' when the bundle was HELD for review. */
  memberId: string;
  /** True when identity resolution landed in the possible-match band (bundle held). */
  held: boolean;
  heldReason?: string;
  /** Admitted (loaded) record count per WpcDomain. */
  admittedByDomain: Record<string, number>;
  /** Quarantined records (structural + semantic + identity holds), PHI-safe. */
  quarantined: QuarantineRecord[];
  /** Resources not routed to any adapter, by resourceType (by-design non-projection). */
  nonProjected: Record<string, number>;
  /** Total resources seen in the bundle. */
  totalResources: number;
  /** Projection drain metrics after the graph was populated. */
  projection: { applied: number; skipped: number; members: number };
  /** Consolidated PHI-safe ABC reconciliation record for this load. */
  reconciliation: LoadReconciliationRecord;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

const RESOURCES = (bundle: FhirBundle): FhirResource[] =>
  (bundle.entry ?? [])
    .map((e) => obj(e.resource) as FhirResource)
    .filter((r) => str(r.resourceType));

// ─── driver ───────────────────────────────────────────────────────────────

/**
 * Ingest one FHIR bundle end-to-end (route -> pipeline -> outbox -> projected graph).
 * Pure over its injected stores; no globals mutated beyond the passed xref/outbox/graph.
 */
export async function ingestBundle(
  bundle: FhirBundle,
  options: IngestBundleOptions,
  stores: IngestStores
): Promise<IngestBundleResult> {
  const now = options.now ?? clockNow;
  const rng = options.rng ?? clockRng;
  const scope = options.sourceSystem || GLOBAL_SCOPE;
  const src = options.identitySource ?? getIdentitySource();
  const resources = RESOURCES(bundle);
  const totalResources = resources.length;
  const occurredAt = new Date(now()).toISOString();
  const deadLetter = stores.deadLetter ?? null;

  // ── M3 step 1: pre-resolve the Patient once (demographics + global + scoped ids).
  const pc = patientContext(bundle, scope, options.medicaidSystem);
  if (!pc) {
    // No Patient in the bundle — nothing to anchor to; refuse rather than mint blind.
    const nonProjected = route(resources).nonProjected;
    // A held bundle projects NOTHING: every resource is accounted as non-projected so
    // the record is self-consistent (admitted 0 + quarantined 0 + nonProjected countIn
    // == countIn), never a `balanced` claim over an unaccounted resource-level gap.
    const reconciliation = buildLoadReconciliationRecord({
      kind: 'load',
      sourceSystem: scope,
      memberRef: '',
      patientToken: '',
      occurredAt,
      countIn: totalResources,
      admitted: 0,
      quarantined: 0,
      nonProjected: totalResources,
      projected: 0,
      held: true,
      heldRefs: [],
    });
    if (stores.reconciliation) await stores.reconciliation.append(reconciliation);
    return {
      memberId: '',
      held: true,
      heldReason: 'no-patient-resource',
      admittedByDomain: {},
      quarantined: [],
      nonProjected,
      totalResources,
      projection: { applied: 0, skipped: 0, members: 0 },
      reconciliation,
    };
  }

  const pre = resolveEmpi(
    pc.patientToken,
    { feed: `bundle:${scope}`, demographics: pc.demographics, idScope: scope },
    src,
    stores.xref
  );
  if (pre.outcome === 'held') {
    // Possible-match band — HOLD the whole bundle. Never force-merge on ambiguity.
    // Persist the WHOLE-BUNDLE identity hold so a held bundle never vanishes from
    // the audit trail (PHI-safe: source handle, reason code, patient token, scope).
    const heldRefs: string[] = [];
    if (deadLetter) {
      const rec = await deadLetter.append({
        kind: 'held-identity',
        memberRef: scope,
        reasonCode: pre.reasonCode,
        sourceRef: pc.patientToken,
        payloadRef: `bundle:${scope}`,
        createdAt: occurredAt,
      });
      heldRefs.push(rec.id);
    }
    const nonProjected = route(resources).nonProjected;
    // Held bundle: nothing projected -> ALL resources are non-projected, so the ABC
    // record is self-consistent (conservation holds without waiving the check).
    const reconciliation = buildLoadReconciliationRecord({
      kind: 'load',
      sourceSystem: scope,
      memberRef: '',
      patientToken: pc.patientToken,
      occurredAt,
      countIn: totalResources,
      admitted: 0,
      quarantined: 0,
      nonProjected: totalResources,
      projected: 0,
      held: true,
      heldRefs,
    });
    if (stores.reconciliation) await stores.reconciliation.append(reconciliation);
    return {
      memberId: '',
      held: true,
      heldReason: pre.reasonCode,
      admittedByDomain: {},
      quarantined: [],
      nonProjected,
      totalResources,
      projection: { applied: 0, skipped: 0, members: 0 },
      reconciliation,
    };
  }
  const memberId = pre.memberId;
  // ── M3 step 2: seed the per-source xref so id-only adapter lookups consolidate.
  for (const token of pc.tokens)
    stores.xref.link(scopeKey(scope, token), memberId, `bundle:${scope}`);

  // The adapters resolve id-only; the scoped resolver injects THIS bundle's idScope
  // so every raw subject id is namespaced by source (no cross-feed cross-link).
  const base = createXrefEmpiResolver(stores.xref, src);
  const resolveIdentity: IdentityResolver = (id, traits) =>
    base(id, { ...(traits ?? {}), idScope: scope });
  const deps: PipelineDeps = defaultPipelineDeps({ now, rng, resolveIdentity });

  // ── route + run each group through the real pipeline into the shared outbox.
  const outboxDeps = { ...makeDevOutboxDeps(stores.outbox), now, rng };
  const writer = new OutboxWriter(outboxDeps);
  const { groups, nonProjected } = route(resources);

  const admittedByDomain: Record<string, number> = {};
  const quarantined: QuarantineRecord[] = [];

  for (const group of groups) {
    const subBundle = JSON.stringify({
      resourceType: 'Bundle',
      type: 'collection',
      entry: group.resources.map((r) => ({ resource: r })),
    });
    let result;
    try {
      result = await runPipeline(
        group.adapter,
        { source: group.adapter.source, format: group.adapter.format, payload: subBundle },
        deps,
        { writer },
        deadLetter ?? options.deadLetterStore ?? null
      );
    } catch (e) {
      // A held-identity throw for a single group must not abort the bundle; record it.
      if (e instanceof HeldIdentityError) continue;
      throw e;
    }
    quarantined.push(...result.quarantined);
    // loaded = intents committed; count by the adapter's declared domain.
    const domain = group.adapter.domain as WpcDomain;
    admittedByDomain[domain] = (admittedByDomain[domain] ?? 0) + result.loadReconciliation.loaded;
  }

  // ── drain the shared outbox to the projected graph.
  const projection = await runProjectionOnce(stores.outbox, stores.graph, stores.checkpoint, {
    now,
    rng,
  });

  // ── ABC reconciliation: one PHI-safe balance-control record per load. When a
  // durable dead-letter ledger is wired, each quarantine was persisted as
  // `dl-${quarantineId}`, so those ids are this load's heldRefs (audit trail).
  const heldRefs = deadLetter ? quarantined.map((q) => `dl-${q.quarantineId}`) : [];
  const reconciliation = buildLoadReconciliationRecord({
    kind: 'load',
    sourceSystem: scope,
    memberRef: memberId,
    patientToken: pc.patientToken,
    occurredAt,
    countIn: totalResources,
    admitted: sum(admittedByDomain),
    quarantined: quarantined.length,
    nonProjected: sum(nonProjected),
    projected: projection.applied,
    held: false,
    heldRefs,
  });
  if (stores.reconciliation) await stores.reconciliation.append(reconciliation);

  return {
    memberId,
    held: false,
    admittedByDomain,
    quarantined,
    nonProjected,
    totalResources,
    projection: {
      applied: projection.applied,
      skipped: projection.skipped,
      members: projection.members,
    },
    reconciliation,
  };
}

/** Sum the values of a count map. */
function sum(counts: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
}

/** Convenience: ingest a bundle given as a JSON string. */
export async function ingestBundleJson(
  payload: string,
  options: IngestBundleOptions,
  stores: IngestStores
): Promise<IngestBundleResult> {
  let bundle: FhirBundle;
  try {
    bundle = JSON.parse(payload) as FhirBundle;
  } catch {
    bundle = { entry: [] };
  }
  return ingestBundle(bundle, options, stores);
}
