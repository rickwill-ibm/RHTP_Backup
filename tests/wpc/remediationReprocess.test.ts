/**
 * Alex Kirby remediation / reprocessing round trip — the ABC end-to-end proof.
 *
 * The honest exception: alex-kirby's seed bundle carries an UNCODED "Type 2
 * Diabetes Mellitus" Condition (no `code.coding`). The driver QUARANTINES it —
 * accounted, never vanished — and now (1) persists it to the durable append-only
 * dead-letter ledger and (2) emits a PHI-safe per-load `LoadReconciliationRecord`.
 * A steward stages a CORRECTED bundle (same Patient + the same Condition now coded
 * E11.9); `remediateAndReprocess` runs it back through the SAME graph+xref so it
 * consolidates onto the SAME member, projects the Condition, and resolves the hold.
 *
 * Proven on BOTH graph backends (pg-mem Postgres + the Neo4j fake).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createXrefIndex } from '@/lib/identity';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import {
  ingestBundle,
  type FhirBundle,
  type IngestBundleResult,
  type IngestStores,
} from '@/lib/runtime/ingestBundle';
import {
  createMemoryReconciliationStore,
  type ReconciliationStore,
} from '@/lib/runtime/reconciliation';
import { remediateAndReprocess, registerWpcReprocessLane } from '@/lib/runtime/remediation';
import {
  createMemoryDeadLetterStore,
  type DeadLetterRecord,
  type MemoryDeadLetterStore,
} from '@/lib/deadLetter';
import {
  clearDeadLetterRetryLanes,
  getRetryLaneRouter,
  reviewAction,
} from '@/lib/deadLetter/review';
import type { GraphStore } from '@/lib/graph/types';
import { makeNeo4jFakeStore, makePgGraphStore } from '../graph/helpers';
import { readMemberLensBundle } from '@/lib/wpc/projectedAggregator';
import { NO_CONSENT } from '@/lib/graph/lens/types';

const SOURCE = 'ehr-alex-kirby';
const DIABETES_ID = 'alex-kirby-condition-1'; // the uncoded Type 2 Diabetes Condition
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

function loadAlex(): FhirBundle {
  return JSON.parse(readFileSync('fhir/seed/patients/alex-kirby.bundle.json', 'utf8'));
}

/** Alex's Patient entry (same identifiers) — carried so identity consolidates. */
function alexPatientEntry(): { fullUrl?: string; resource?: Record<string, unknown> } {
  const bundle = loadAlex();
  return (bundle.entry ?? []).find(
    (e: { resource?: { resourceType?: string } }) => e.resource?.resourceType === 'Patient'
  )!;
}

/** The SAME diabetes Condition, now coded ICD-10 E11.9 (a steward correction). */
function correctedBundle(): FhirBundle {
  const patientEntry = alexPatientEntry();
  const patient = patientEntry.resource as Record<string, unknown>;
  return {
    resourceType: 'Bundle',
    entry: [
      {
        fullUrl: patientEntry.fullUrl,
        resource: patient as { resourceType: string } & Record<string, unknown>,
      },
      {
        fullUrl: `urn:uuid:${DIABETES_ID}`,
        resource: {
          resourceType: 'Condition',
          id: DIABETES_ID,
          clinicalStatus: { coding: [{ code: 'active' }] },
          code: {
            coding: [
              {
                system: 'http://hl7.org/fhir/sid/icd-10-cm',
                code: 'E11.9',
                display: 'Type 2 diabetes mellitus without complications',
              },
            ],
          },
          subject: { reference: `Patient/${patient.id}` },
        },
      },
    ],
  };
}

interface Wired {
  graph: GraphStore;
  deadLetter: MemoryDeadLetterStore;
  reconciliation: ReconciliationStore;
  stores: IngestStores;
}
function wire(graph: GraphStore): Wired {
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
  return { graph, deadLetter, reconciliation, stores };
}
/** A fresh outbox+checkpoint per drain session (shared graph/xref/ledgers). */
function session(w: Wired): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph: w.graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: w.stores.xref,
    deadLetter: w.deadLetter,
    reconciliation: w.reconciliation,
  };
}

async function diabetesConditionNodes(graph: GraphStore, memberId: string) {
  const lb = await readMemberLensBundle(graph, memberId, NO_CONSENT);
  return lb.wholePerson.nodes.filter(
    (n) => n.kind === 'Condition' && n.properties.code === 'E11.9'
  );
}

const BACKENDS: { name: string; make: () => Promise<GraphStore> }[] = [
  { name: 'neo4j-fake', make: async () => makeNeo4jFakeStore() },
  { name: 'pg-mem', make: async () => makePgGraphStore() },
];

for (const backend of BACKENDS) {
  describe(`wpc remediation / reprocess [${backend.name}]`, () => {
    let w: Wired;
    let load: IngestBundleResult;
    let diabetesHold: DeadLetterRecord;

    beforeAll(async () => {
      w = wire(await backend.make());
      load = await ingestBundle(
        loadAlex(),
        { sourceSystem: SOURCE, now: fixedNow, rng: seededRng() },
        session(w)
      );
      const quarantines = await w.deadLetter.list({ kind: 'quarantine' });
      diabetesHold = quarantines.find((r) => r.sourceRef === DIABETES_ID)!;
    });

    // ── 1. the uncoded diabetes quarantines, persists, and is NOT yet in the graph.
    it('1. uncoded diabetes is quarantined, persisted to the ledger, and absent from the graph', async () => {
      // quarantined in the load result, with the missing-code reason.
      const q = load.quarantined.find((r) => r.sourceRef === DIABETES_ID);
      expect(q).toBeDefined();
      expect(q!.reasonCodes).toContain('missing-condition-code');

      // persisted as a durable `quarantine` dead-letter record.
      expect(diabetesHold).toBeDefined();
      expect(diabetesHold.kind).toBe('quarantine');
      expect(diabetesHold.status).toBe('open');

      // the ABC reconciliation record for the load: balanced, with quarantines + heldRefs.
      expect(load.reconciliation.kind).toBe('load');
      expect(load.reconciliation.balanced).toBe(true);
      expect(load.reconciliation.quarantined).toBeGreaterThan(0);
      expect(load.reconciliation.heldRefs.length).toBeGreaterThan(0);
      expect(load.reconciliation.heldRefs).toContain(diabetesHold.id);

      // the graph does NOT yet carry an E11.9 Condition node.
      expect(await diabetesConditionNodes(w.graph, load.memberId)).toHaveLength(0);
    });

    // ── 2/3. remediate: the corrected Condition projects onto the SAME member; hold resolved.
    it('2+3. remediation projects E11.9 onto the same member and resolves the hold (idempotent)', async () => {
      const r = await remediateAndReprocess(
        correctedBundle(),
        {
          holdId: diabetesHold.id,
          actor: 'steward-1',
          sourceSystem: SOURCE,
          expectedMemberId: load.memberId,
          now: fixedNow,
          rng: seededRng(),
        },
        session(w)
      );

      expect(r.ok).toBe(true);
      // consolidated onto Alex's SAME member — no duplicate member.
      expect(r.memberId).toBe(load.memberId);
      expect(r.stillQuarantined).toHaveLength(0);

      // the corrected Condition now projects as an E11.9 node (exactly one).
      const nodes = await diabetesConditionNodes(w.graph, load.memberId);
      expect(nodes).toHaveLength(1);
      expect(String(nodes[0].properties.code)).toBe('E11.9');

      // the dead-letter record is now retried/resolved by the steward.
      expect(r.resolvedHold).not.toBeNull();
      expect(r.resolvedHold!.status).toBe('retried');
      expect(r.resolvedHold!.resolvedBy).toBe('steward-1');
      const reread = await w.deadLetter.get(diabetesHold.id);
      expect(reread!.status).toBe('retried');
      // immutable history preserved (open -> retried).
      expect(w.deadLetter.history(diabetesHold.id).length).toBeGreaterThanOrEqual(2);

      // a `remediation` reconciliation record exists showing the hold cleared.
      expect(r.reconciliation.kind).toBe('remediation');
      expect(r.reconciliation.heldRefs).toContain(diabetesHold.id);
      const remediations = await w.reconciliation.list({ kind: 'remediation' });
      expect(remediations.length).toBeGreaterThan(0);

      // idempotent: re-running does not duplicate the node and does not crash.
      const again = await remediateAndReprocess(
        correctedBundle(),
        {
          holdId: diabetesHold.id,
          actor: 'steward-1',
          sourceSystem: SOURCE,
          expectedMemberId: load.memberId,
          now: fixedNow,
          rng: seededRng(),
        },
        session(w)
      );
      expect(again.ok).toBe(true);
      expect(again.memberId).toBe(load.memberId);
      expect(await diabetesConditionNodes(w.graph, load.memberId)).toHaveLength(1);
    });

    // ── 5. PHI: the ledgers carry NO name / narrative — refs + codes + counts only.
    it('5. dead-letter and reconciliation records contain no PHI', async () => {
      const dlDump = JSON.stringify(await w.deadLetter.list());
      const reconDump = JSON.stringify(await w.reconciliation.list());
      for (const forbidden of ['Kirby', 'Alex', 'Diabetes']) {
        expect(dlDump).not.toContain(forbidden);
        expect(reconDump).not.toContain(forbidden);
      }
    });
  });
}

// ── 4. the registerWpcReprocessLane path (fail-closed + staged correction). ──────
describe('4. WPC reprocess retry lane', () => {
  it('fails closed with no correction staged, and resolves the hold once one is staged', async () => {
    clearDeadLetterRetryLanes();
    const w = wire(makeNeo4jFakeStore());
    const load = await ingestBundle(
      loadAlex(),
      { sourceSystem: SOURCE, now: fixedNow, rng: seededRng() },
      session(w)
    );
    expect(load.held).toBe(false);
    const hold = (await w.deadLetter.list({ kind: 'quarantine' })).find(
      (r) => r.sourceRef === DIABETES_ID
    )!;
    expect(hold).toBeDefined();

    // an in-memory staging map the provider reads (a steward stages corrections here).
    const staged = new Map<string, FhirBundle>();
    registerWpcReprocessLane(session(w), async (record) => {
      const bundle = staged.get(record.sourceRef);
      return bundle
        ? {
            bundle,
            sourceSystem: SOURCE,
            actor: 'steward-2',
            expectedMemberId: load.memberId,
            now: fixedNow,
            rng: seededRng(),
          }
        : null;
    });

    // NO correction staged -> fail closed; the record stays open.
    const closed = await reviewAction(
      w.deadLetter,
      { id: hold.id, action: 'retry', actor: 'steward-2' },
      getRetryLaneRouter()
    );
    expect(closed.ok).toBe(false);
    expect(closed.reason).toBe('retry-lane-rejected');
    expect((await w.deadLetter.get(hold.id))!.status).toBe('open');

    // stage the correction, retry again -> the hold resolves.
    staged.set(DIABETES_ID, correctedBundle());
    const open = await reviewAction(
      w.deadLetter,
      { id: hold.id, action: 'retry', actor: 'steward-2' },
      getRetryLaneRouter()
    );
    expect(open.ok).toBe(true);
    const resolved = await w.deadLetter.get(hold.id);
    expect(resolved!.status).toBe('retried');
    // the E11.9 Condition now projects onto Alex's member.
    const lb = await readMemberLensBundle(w.graph, load.memberId, NO_CONSENT);
    expect(
      lb.wholePerson.nodes.some((n) => n.kind === 'Condition' && n.properties.code === 'E11.9')
    ).toBe(true);
    clearDeadLetterRetryLanes();
  });
});

// ── 6. the integrity guards actually fire (red-team FINDING 1/2 regression). ──────
describe('6. remediation refuses to falsely close a hold', () => {
  it('a member-id drift REFUSES to resolve (no silent identity split)', async () => {
    const w = wire(makeNeo4jFakeStore());
    const load = await ingestBundle(
      loadAlex(),
      { sourceSystem: SOURCE, now: fixedNow, rng: seededRng() },
      session(w)
    );
    const hold = (await w.deadLetter.list({ kind: 'quarantine' })).find(
      (r) => r.sourceRef === DIABETES_ID
    )!;
    // pass the WRONG expected member — the correction consolidates onto Alex, not this id.
    const r = await remediateAndReprocess(
      correctedBundle(),
      {
        holdId: hold.id,
        actor: 'steward-x',
        sourceSystem: SOURCE,
        expectedMemberId: 'mem-someone-else',
        now: fixedNow,
        rng: seededRng(),
      },
      session(w)
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('member-mismatch');
    expect((await w.deadLetter.get(hold.id))!.status).toBe('open'); // hold stays open
  });

  it('a correction that does NOT contain the held resource REFUSES to resolve it', async () => {
    const w = wire(makeNeo4jFakeStore());
    const load = await ingestBundle(
      loadAlex(),
      { sourceSystem: SOURCE, now: fixedNow, rng: seededRng() },
      session(w)
    );
    const hold = (await w.deadLetter.list({ kind: 'quarantine' })).find(
      (r) => r.sourceRef === DIABETES_ID
    )!;
    // a valid, coded, but DIFFERENT resource (not the held diabetes Condition).
    const patientEntry = alexPatientEntry();
    const decoyBundle: FhirBundle = {
      resourceType: 'Bundle',
      entry: [
        {
          fullUrl: patientEntry.fullUrl,
          resource: patientEntry.resource as { resourceType: string } & Record<string, unknown>,
        },
        {
          fullUrl: 'urn:uuid:alex-kirby-condition-decoy',
          resource: {
            resourceType: 'Condition',
            id: 'alex-kirby-condition-decoy',
            clinicalStatus: { coding: [{ code: 'active' }] },
            code: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/sid/icd-10-cm',
                  code: 'I10',
                  display: 'Essential hypertension',
                },
              ],
            },
            subject: { reference: `Patient/${(patientEntry.resource as { id?: string }).id}` },
          },
        },
      ],
    };
    const r = await remediateAndReprocess(
      decoyBundle,
      {
        holdId: hold.id,
        actor: 'steward-x',
        sourceSystem: SOURCE,
        expectedMemberId: load.memberId,
        now: fixedNow,
        rng: seededRng(),
      },
      session(w)
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('target-not-in-correction'); // the diabetes hold is NOT closed by an unrelated fix
    expect((await w.deadLetter.get(hold.id))!.status).toBe('open');
  });
});
