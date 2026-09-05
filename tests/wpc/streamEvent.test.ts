/**
 * FHIR-Subscription STREAMING ingest — worked-example suite (BOTH backends).
 *
 * Proves the streaming front door (`ingestStreamEvent`) end to end and, above all,
 * that it CONSOLIDATES onto the SAME member a prior BATCH load anchored — riding the
 * existing transform/outbox/graph path, adding no domain and no mapping spec.
 *
 * Adversarially, on BOTH graph backends (pg-mem Postgres + the Neo4j fake):
 *   1. batch-load dorothy via `ingestBundle` into a SHARED graph + xref + outbox;
 *   2. stream a NEW coded lab Observation for dorothy into the SAME stores with the
 *      SAME sourceSystem -> it lands on dorothy's EXISTING member (no new member),
 *      in the STREAM lane, and projects as a labs-vitals Observation node;
 *   3. the STREAM lane is REAL: the streamed outbox event carries `class:'stream'`
 *      while dorothy's batch-loaded events carry `class:'batch'`;
 *   4. an unroutable resource (Basic) -> unrouted, nothing projected, no crash; an
 *      unknown-subject resource still resolves via the xref/EMPI seam (no throw);
 *   5. idempotency: streaming the SAME Observation twice yields exactly ONE node.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createXrefIndex } from '@/lib/identity';
import { createMemoryDeadLetterStore } from '@/lib/deadLetter';
import { createMemoryReconciliationStore } from '@/lib/runtime/reconciliation';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import {
  ingestBundle,
  type FhirBundle,
  type IngestBundleResult,
  type IngestStores,
} from '@/lib/runtime/ingestBundle';
import { ingestStreamEvent } from '@/lib/runtime/ingestStreamEvent';
import type { FhirResource } from '@/lib/runtime/ingestRouting';
import type { GraphStore } from '@/lib/graph/types';
import { makeNeo4jFakeStore, makePgGraphStore } from '../graph/helpers';
import { readMemberLensBundle } from '@/lib/wpc/projectedAggregator';
import { MEMBER_KIND } from '@/lib/graph/mapping/spec';
import { NO_CONSENT } from '@/lib/graph/lens/types';

// ── deterministic clock + rng (no globals) ───────────────────────────────────
const fixedNow = () => 1_700_000_000_000;
function seededRng(seed = 0x1234abcd): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One SHARED durable set of stores — batch load AND stream event use the SAME
 * outbox/graph/checkpoint/xref, so both lanes' events live in one outbox (the
 * `class` comparison below is genuine) and identity consolidates through one xref. */
function sharedStores(graph: GraphStore): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: createXrefIndex({ now: fixedNow }),
  };
}

function loadBundle(slug: string): FhirBundle {
  return JSON.parse(readFileSync(`fhir/seed/patients/${slug}.bundle.json`, 'utf8'));
}
/** Dorothy's Patient anchor token — the streamed Observation's subject reference. */
function patientToken(bundle: FhirBundle): string {
  const pe = (bundle.entry ?? []).find(
    (e) => (e.resource as { resourceType?: string } | undefined)?.resourceType === 'Patient'
  );
  return (pe?.fullUrl as string) ?? '';
}

const SOURCE = 'ehr-dorothy-simmons'; // the SAME source for batch + stream (consolidation)

/** A NEW, coded real-time lab Observation as a FHIR Subscription would deliver it. */
function streamObservation(subjectRef: string, id = 'obs-stream-1'): FhirResource {
  return {
    resourceType: 'Observation',
    id,
    status: 'final',
    category: [{ coding: [{ code: 'laboratory' }] }],
    code: {
      coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' }],
    },
    subject: { reference: subjectRef },
    effectiveDateTime: '2026-07-01',
    valueQuantity: { value: 8.1, unit: '%' },
  };
}

const BACKENDS: { name: string; make: () => Promise<GraphStore> }[] = [
  { name: 'neo4j-fake', make: async () => makeNeo4jFakeStore() },
  { name: 'pg-mem', make: async () => makePgGraphStore() },
];

for (const backend of BACKENDS) {
  describe(`wpc stream event [${backend.name}]`, () => {
    let stores: IngestStores;
    let load: IngestBundleResult;
    let bundle: FhirBundle;
    let membersAfterBatch: number;
    let streamResult: Awaited<ReturnType<typeof ingestStreamEvent>>;

    beforeEach(async () => {
      const graph = await backend.make();
      stores = sharedStores(graph);
      bundle = loadBundle('dorothy-simmons');
      // 1. BATCH-load dorothy into the shared stores.
      load = await ingestBundle(
        bundle,
        { sourceSystem: SOURCE, now: fixedNow, rng: seededRng() },
        stores
      );
      membersAfterBatch = (await stores.graph.listNodes({ kind: MEMBER_KIND })).length;
      // 2. STREAM a NEW coded lab Observation for dorothy into the SAME stores.
      streamResult = await ingestStreamEvent(
        streamObservation(patientToken(bundle)),
        { sourceSystem: SOURCE, now: fixedNow, rng: seededRng(7) },
        stores
      );
    });

    // ── 2. consolidation onto the SAME batch-loaded member ───────────────────
    it('the streamed event consolidates onto dorothy’s EXISTING member (no new member minted)', async () => {
      expect(load.held).toBe(false);
      expect(load.memberId).toMatch(/^mem-/);
      // SAME member as the batch load — resolved through the shared xref.
      expect(streamResult.memberId).toBe(load.memberId);
      expect(streamResult.unrouted).toBe(false);
      // no new Member node was minted by the streamed event.
      const membersNow = await stores.graph.listNodes({ kind: MEMBER_KIND });
      expect(membersNow.length).toBe(membersAfterBatch);
      expect(membersNow.filter((m) => m.key === load.memberId)).toHaveLength(1);
    });

    it('the streamed event ran in the STREAM lane and admitted the labs-vitals Observation', () => {
      expect(streamResult.laneClass).toBe('stream');
      expect(streamResult.admittedDomain).toBe('labs-vitals');
      expect(streamResult.admitted).toBeGreaterThanOrEqual(1);
      expect(streamResult.projection.applied).toBeGreaterThanOrEqual(1);
    });

    it('the streamed lab projects as an Observation node on dorothy’s member', async () => {
      const lb = await readMemberLensBundle(stores.graph, load.memberId, NO_CONSENT);
      const streamed = lb.wholePerson.nodes.filter(
        (n) => n.kind === 'Observation' && n.key.includes('obs-stream-1')
      );
      expect(streamed.length).toBe(1);
      expect(String(streamed[0].properties.loinc ?? '')).toBe('4548-4');
    });

    // ── 3. the STREAM lane is REAL: event `class` on the shared outbox ────────
    it('the streamed outbox event carries class:"stream"; batch events carry class:"batch"', async () => {
      const rows = await stores.outbox.all();
      const streamed = rows.filter((r) => r.fhirResourceId.includes('obs-stream-1'));
      expect(streamed.length).toBe(1);
      expect(streamed[0].envelope.class).toBe('stream');
      // dorothy's batch-loaded events (everything not the streamed obs) carry 'batch'.
      const batchRows = rows.filter((r) => !r.fhirResourceId.includes('obs-stream-1'));
      expect(batchRows.length).toBeGreaterThan(0);
      for (const r of batchRows) expect(r.envelope.class).toBe('batch');
    });

    // ── 4. adversarial: unroutable + unknown subject ─────────────────────────
    it('an unroutable resource (Basic) reports unrouted and projects nothing (no crash)', async () => {
      const before = (await stores.graph.listNodes({ kind: MEMBER_KIND })).length;
      const res = await ingestStreamEvent(
        { resourceType: 'Basic' } as FhirResource,
        { sourceSystem: SOURCE, now: fixedNow, rng: seededRng(9) },
        stores
      );
      expect(res.unrouted).toBe(true);
      expect(res.memberId).toBe('');
      expect(res.admitted).toBe(0);
      expect(res.projection.applied).toBe(0);
      const after = (await stores.graph.listNodes({ kind: MEMBER_KIND })).length;
      expect(after).toBe(before); // nothing minted, nothing projected
    });

    it('an unknown-subject Observation is HELD for identity review (never mints blind)', async () => {
      // A brand-new subject the shared xref has never seen. A single streamed resource
      // carries no demographics, so the id-only EMPI path WOULD mint a phantom member.
      // The identity-safety gate refuses that fail-open: HOLD, nothing minted/projected.
      const before = (await stores.graph.listNodes({ kind: MEMBER_KIND })).length;
      const res = await ingestStreamEvent(
        streamObservation('Patient/never-seen-subject', 'obs-stream-unknown'),
        { sourceSystem: SOURCE, now: fixedNow, rng: seededRng(11) },
        stores
      );
      expect(res.held).toBe(true);
      expect(res.heldReason).toBe('identity-unresolved-stream-subject');
      expect(res.memberId).toBe(''); // no phantom member anchored
      expect(res.admitted).toBe(0);
      expect(res.projection.applied).toBe(0);
      expect(res.unrouted).toBe(false); // it routed; it was held on identity, not routing
      // NO new member minted, and the held event still balances (nonProjected == countIn).
      const after = (await stores.graph.listNodes({ kind: MEMBER_KIND })).length;
      expect(after).toBe(before);
      expect(res.reconciliation.held).toBe(true);
      expect(res.reconciliation.balanced).toBe(true);
      expect(res.reconciliation.memberRef).toBe('');
    });

    it('an operator-confirmed expectedMemberId consolidates an as-yet-unlinked subject', async () => {
      // The same unknown token, but the operator has confirmed it belongs to dorothy.
      // `expectedMemberId` seeds the shared xref link, so the event consolidates onto
      // dorothy's EXISTING member instead of being held — and still mints no new member.
      const before = (await stores.graph.listNodes({ kind: MEMBER_KIND })).length;
      const res = await ingestStreamEvent(
        streamObservation('Patient/operator-confirmed-token', 'obs-stream-confirmed'),
        {
          sourceSystem: SOURCE,
          expectedMemberId: load.memberId,
          now: fixedNow,
          rng: seededRng(13),
        },
        stores
      );
      expect(res.held).toBe(false);
      expect(res.memberId).toBe(load.memberId); // consolidated onto dorothy
      expect(res.admitted).toBeGreaterThanOrEqual(1);
      expect(res.reconciliation.memberRef).toBe(load.memberId);
      expect(res.reconciliation.balanced).toBe(true);
      const after = (await stores.graph.listNodes({ kind: MEMBER_KIND })).length;
      expect(after).toBe(before); // consolidation, not a new mint
    });

    it('every stream event emits one PHI-safe, balanced reconciliation record', () => {
      // The admitted dorothy stream from the setup hook carries a first-class ABC record.
      expect(streamResult.reconciliation).toBeTruthy();
      expect(streamResult.reconciliation.countIn).toBe(1);
      expect(streamResult.reconciliation.balanced).toBe(true);
      expect(streamResult.reconciliation.memberRef).toBe(load.memberId);
      expect(streamResult.held).toBe(false);
    });

    // ── 5. idempotency: same Observation twice -> exactly ONE node ────────────
    it('streaming the SAME Observation twice yields exactly ONE Observation node', async () => {
      // dorothy's obs-stream-1 was already streamed once in the setup hook; stream it AGAIN.
      const again = await ingestStreamEvent(
        streamObservation(patientToken(bundle)),
        { sourceSystem: SOURCE, now: fixedNow, rng: seededRng(7) },
        stores
      );
      expect(again.memberId).toBe(load.memberId);
      const lb = await readMemberLensBundle(stores.graph, load.memberId, NO_CONSENT);
      const streamed = lb.wholePerson.nodes.filter(
        (n) => n.kind === 'Observation' && n.key.includes('obs-stream-1')
      );
      expect(streamed.length).toBe(1); // deterministic fhirResourceId PUT -> one node
    });
  });
}

// ── durable audit trace on the held/unrouted paths (wired stores) ─────────────
describe('wpc stream event — durable audit trace when stores are wired', () => {
  it('a held unknown subject persists a held-identity dead-letter AND a balanced ABC record', async () => {
    const graph = await makeNeo4jFakeStore();
    const deadLetter = createMemoryDeadLetterStore();
    const reconciliation = createMemoryReconciliationStore();
    const stores: IngestStores = {
      outbox: createMemoryOutboxStore(),
      graph,
      checkpoint: createMemoryCheckpointStore(),
      xref: createXrefIndex({ now: fixedNow }),
      deadLetter,
      reconciliation,
    };
    const res = await ingestStreamEvent(
      streamObservation('Patient/ghost-subject', 'obs-held-1'),
      { sourceSystem: 'ehr-x', now: fixedNow, rng: seededRng(21) },
      stores
    );
    expect(res.held).toBe(true);
    // the held event left a durable, PHI-safe trace in BOTH ledgers.
    const dls = await deadLetter.list({ kind: 'held-identity' });
    expect(dls.length).toBe(1);
    expect(dls[0].sourceRef).toBe('ghost-subject');
    const recon = await reconciliation.list();
    expect(recon.length).toBe(1);
    expect(recon[0].held).toBe(true);
    expect(recon[0].balanced).toBe(true);
    expect(recon[0].heldRefs).toContain(dls[0].id);
  });

  it('an unrouted event still emits a balanced reconciliation record (no silent drop)', async () => {
    const graph = await makeNeo4jFakeStore();
    const reconciliation = createMemoryReconciliationStore();
    const stores: IngestStores = {
      outbox: createMemoryOutboxStore(),
      graph,
      checkpoint: createMemoryCheckpointStore(),
      xref: createXrefIndex({ now: fixedNow }),
      reconciliation,
    };
    const res = await ingestStreamEvent(
      { resourceType: 'Basic' } as FhirResource,
      { sourceSystem: 'ehr-x', now: fixedNow, rng: seededRng(23) },
      stores
    );
    expect(res.unrouted).toBe(true);
    const recon = await reconciliation.list();
    expect(recon.length).toBe(1);
    expect(recon[0].balanced).toBe(true);
    expect(recon[0].nonProjected).toBe(1);
    expect(recon[0].countIn).toBe(1);
  });
});
