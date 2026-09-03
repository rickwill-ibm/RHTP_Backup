/**
 * Coding-gap → RADV candidate-capture BRIDGE — adversarial suite (BOTH backends).
 *
 * The bridge is a CONSENT-SAFE, TWO-HOP read model:
 *   (Member)-[:HAS_CODING_GAP]->(CodingGap)-[:SUPPORTED_BY]->(Evidence ⇒ Condition|Encounter)
 * It turns a member's CLOSED coding gaps into candidate HccCaptures scored for RADV
 * defensibility. This suite proves — on the pg-mem Postgres store AND the Neo4j fake —
 * the three invariants a green happy-path cannot:
 *
 *   1. FIREWALL: an open / pending / suspected gap NEVER becomes a candidate, even when
 *      it cites a real Condition (materializing a hypothesis as a submittable dx is the
 *      coding-intensity abuse the firewall exists to stop).
 *   2. CONSENT ON EVERY HOP: a restricted (42 CFR Part 2) Condition cited by an
 *      OTHERWISE-VISIBLE gap is dropped under NO_CONSENT and only surfaces under a
 *      covering scope — the joined clinical node has its OWN restriction and is gated
 *      independently. This is the prime consent-leak target.
 *   3. NON-DEFENSIBLE IS SURFACED, NOT DROPPED: a closed gap with a dx but no valid F2F
 *      encounter yields a candidate flagged with its deficiencies (not silently gone).
 *
 * Most cases drive the store DIRECTLY with hand-built mutations (precise, adapter-free);
 * one end-to-end case drives the real `ingestBundle` pipeline to prove the wiring.
 */
import { describe, expect, it } from 'vitest';
import type { GraphStore, Mutation, Props } from '@/lib/graph/types';
import { materializeCandidateCaptures } from '@/lib/finance/riskAdjustment';
import { NO_CONSENT } from '@/lib/graph/lens/types';
import { makeNeo4jFakeStore, makePgGraphStore } from '../graph/helpers';
import { createXrefIndex } from '@/lib/identity';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import { ingestBundle, type FhirBundle, type IngestStores } from '@/lib/runtime/ingestBundle';

const BACKENDS: { name: string; make: () => Promise<GraphStore> }[] = [
  { name: 'neo4j-fake', make: async () => makeNeo4jFakeStore() },
  { name: 'pg-mem', make: async () => makePgGraphStore() },
];

const START = '2026-04-01T00:00:00Z';

// ── Hand-built mutation helpers (mirror the projector's node/edge shapes) ──────────
function node(
  kind: string,
  key: string,
  properties: Props,
  restricting: string[] = []
): Mutation[] {
  const restricted = restricting.length > 0;
  const out: Mutation[] = [{ op: 'UpsertNode', kind, key, properties, restricted }];
  if (restricted) out.push({ op: 'SetLabel', kind, key, label: 'Restricted' });
  for (const l of restricting) out.push({ op: 'SetLabel', kind, key, label: l });
  return out;
}
function edge(
  type: string,
  from: [string, string],
  to: [string, string],
  properties: Props = {}
): Mutation {
  return {
    op: 'UpsertEdge',
    type,
    from: { kind: from[0], key: from[1] },
    to: { kind: to[0], key: to[1] },
    properties,
    validity: { start: START, end: null },
    semantics: { kind: 'associative' },
  };
}

/** Seed a member + one coding gap that cites a Condition (and optionally an Encounter). */
interface SeedOpts {
  memberId: string;
  gapStatus: string; // 'closed-gap' | 'open-gap' | 'pending'
  hcc?: string;
  icd?: string;
  meat?: { monitored?: boolean; evaluated?: boolean; assessed?: boolean; treated?: boolean };
  conditionRestricting?: string[]; // makes the cited Condition a restricted node
  withEncounter?: boolean;
  npi?: string;
  dos?: string;
  sourceDoc?: string;
  /** Omit the member's HAS_PROBLEM ownership edge — simulates a cross-member citation. */
  orphanCondition?: boolean;
}
async function seed(store: GraphStore, o: SeedOpts): Promise<void> {
  const gapRef = `CodingGap/mr-${o.memberId}:CMS-HCC-V28:g1:${o.hcc ?? 'HCC38'}`;
  const condRef = `Condition/cond-${o.memberId}`;
  const encRef = `Encounter/enc-${o.memberId}`;
  const muts: Mutation[] = [];
  muts.push({ op: 'UpsertNode', kind: 'Member', key: o.memberId, properties: { id: o.memberId } });
  muts.push(
    ...node('CodingGap', gapRef, {
      conditionCategory: o.hcc ?? 'HCC38',
      model: 'CMS-HCC',
      modelVersion: 'V28',
      evidenceStatus: o.gapStatus,
      suspectType: 'historic',
    })
  );
  muts.push(edge('HAS_CODING_GAP', ['Member', o.memberId], ['CodingGap', gapRef]));
  // Evidence citation node (neutral) + SUPPORTED_BY, joining back to the Condition.
  muts.push(...node('Evidence', condRef, { evidenceRef: condRef, resourceType: 'Condition' }));
  muts.push(
    edge('SUPPORTED_BY', ['CodingGap', gapRef], ['Evidence', condRef], { evidenceRef: condRef })
  );
  // The real Condition node (may be restricted) carrying the ICD + MEAT booleans.
  muts.push(
    ...node(
      'Condition',
      condRef,
      {
        code: o.icd ?? 'E11.9',
        meatMonitored: o.meat?.monitored ?? true,
        meatEvaluated: o.meat?.evaluated ?? true,
        meatAssessed: o.meat?.assessed ?? true,
        meatTreated: o.meat?.treated ?? true,
      },
      o.conditionRestricting ?? []
    )
  );
  // Membership: the member OWNS this Condition (HAS_PROBLEM) — the real projector emits
  // it. Omitted for `orphanCondition` to simulate a citation of a node not this member's.
  if (!o.orphanCondition) {
    muts.push(
      edge('HAS_PROBLEM', ['Member', o.memberId], ['Condition', condRef], {
        code: o.icd ?? 'E11.9',
      })
    );
  }
  if (o.withEncounter) {
    muts.push(...node('Evidence', encRef, { evidenceRef: encRef, resourceType: 'Encounter' }));
    muts.push(
      edge('SUPPORTED_BY', ['CodingGap', gapRef], ['Evidence', encRef], { evidenceRef: encRef })
    );
    muts.push(
      ...node('Encounter', encRef, {
        dateOfService: o.dos ?? '2026-03-15',
        providerNpi: o.npi ?? '1487654321',
        sourceDocumentRef: o.sourceDoc ?? 'DocumentReference/visit-1',
      })
    );
    muts.push(edge('HAD_ENCOUNTER', ['Member', o.memberId], ['Encounter', encRef]));
  }
  await store.apply(muts);
}

for (const backend of BACKENDS) {
  describe(`coding-gap RADV bridge [${backend.name}]`, () => {
    it('a CLOSED gap with a dx + F2F encounter yields ONE defensible candidate (MEAT/NPI/DOS carried)', async () => {
      const store = await backend.make();
      await seed(store, {
        memberId: 'M1',
        gapStatus: 'closed-gap',
        withEncounter: true,
        icd: 'E11.65',
      });
      const cands = await materializeCandidateCaptures(store, 'M1', NO_CONSENT);
      expect(cands).toHaveLength(1);
      const c = cands[0];
      expect(c.capture.hccCode).toBe('HCC38');
      expect(c.capture.icdCode).toBe('E11.65');
      expect(c.capture.providerNpi).toBe('1487654321');
      expect(c.capture.dateOfService).toBe('2026-03-15');
      expect(c.capture.sourceDocumentRef).toBe('DocumentReference/visit-1');
      expect(c.capture.meat).toEqual({
        monitored: true,
        evaluated: true,
        assessed: true,
        treated: true,
      });
      expect(c.encounterRef).toBe('Encounter/enc-M1');
      expect(c.defensibility.defensible).toBe(true);
      expect(c.defensibility.deficiencies).toEqual([]);
    });

    it('FIREWALL: an OPEN gap citing a real Condition yields ZERO candidates', async () => {
      const store = await backend.make();
      await seed(store, { memberId: 'M2', gapStatus: 'open-gap', withEncounter: true });
      expect(await materializeCandidateCaptures(store, 'M2', NO_CONSENT)).toEqual([]);
    });

    it('FIREWALL: a PENDING gap citing a real Condition yields ZERO candidates', async () => {
      const store = await backend.make();
      await seed(store, { memberId: 'M2b', gapStatus: 'pending', withEncounter: true });
      expect(await materializeCandidateCaptures(store, 'M2b', NO_CONSENT)).toEqual([]);
    });

    it('CONSENT LEAK GUARD: a restricted Part 2 Condition cited by a visible gap is DROPPED under NO_CONSENT', async () => {
      const store = await backend.make();
      // The gap itself is NON-restricted (HCC38) and visible, but the cited Condition is
      // 42 CFR Part 2-restricted. The bridge must gate the JOINED clinical node on hop 2.
      await seed(store, {
        memberId: 'M3',
        gapStatus: 'closed-gap',
        withEncounter: true,
        conditionRestricting: ['42-CFR-Part-2'],
      });
      expect(await materializeCandidateCaptures(store, 'M3', NO_CONSENT)).toEqual([]);
      // Under a covering scope the diagnosis surfaces (proving it was consent-gating, not a bug).
      const covered = await materializeCandidateCaptures(store, 'M3', { part2: true });
      expect(covered).toHaveLength(1);
      expect(covered[0].capture.icdCode).toBe('E11.9');
    });

    it('NON-DEFENSIBLE SURFACED: a closed gap with a dx but NO F2F encounter yields a flagged candidate', async () => {
      const store = await backend.make();
      await seed(store, { memberId: 'M4', gapStatus: 'closed-gap', withEncounter: false });
      const cands = await materializeCandidateCaptures(store, 'M4', NO_CONSENT);
      expect(cands).toHaveLength(1);
      expect(cands[0].defensibility.defensible).toBe(false);
      expect(cands[0].encounterRef).toBeNull();
      expect(cands[0].defensibility.deficiencies.join(' ')).toMatch(/date of service|NPI/i);
    });

    it('MEMBERSHIP GUARD: a gap citing a Condition NOT linked to the member yields ZERO candidates', async () => {
      const store = await backend.make();
      // The cited Condition exists and is non-restricted, but the member has no
      // HAS_PROBLEM edge to it (a cross-member / mis-authored citation). It must not
      // surface another member's diagnosis under this member's captures.
      await seed(store, {
        memberId: 'M6',
        gapStatus: 'closed-gap',
        withEncounter: true,
        orphanCondition: true,
      });
      expect(await materializeCandidateCaptures(store, 'M6', NO_CONSENT)).toEqual([]);
    });

    it('a member with no node in the graph yields [] (pure read, no fabrication)', async () => {
      const store = await backend.make();
      expect(await materializeCandidateCaptures(store, 'ghost', NO_CONSENT)).toEqual([]);
    });

    it('MEAT deficiency is surfaced: a closed gap whose Condition has NO MEAT is non-defensible', async () => {
      const store = await backend.make();
      await seed(store, {
        memberId: 'M5',
        gapStatus: 'closed-gap',
        withEncounter: true,
        meat: { monitored: false, evaluated: false, assessed: false, treated: false },
      });
      const cands = await materializeCandidateCaptures(store, 'M5', NO_CONSENT);
      expect(cands).toHaveLength(1);
      expect(cands[0].defensibility.defensible).toBe(false);
      expect(cands[0].defensibility.deficiencies.join(' ')).toMatch(/MEAT/i);
    });
  });
}

// ── End-to-end: the REAL ingestBundle pipeline wires through to a defensible candidate ──
const RA = 'http://hl7.org/fhir/us/davinci-ra/StructureDefinition';
const HCC_SYS = 'https://www.cms.gov/Medicare/Health-Plans/MedicareAdvtgSpecRateStats/HCC';
const ICD = 'http://hl7.org/fhir/sid/icd-10-cm';
const fixedNow = () => 1_700_000_000_000;

function e2eStores(graph: GraphStore): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: createXrefIndex({ now: fixedNow }),
  };
}

describe('coding-gap RADV bridge — end-to-end through ingestBundle [pg-mem]', () => {
  it('a closed gap citing an in-bundle Condition + Encounter materializes a defensible candidate', async () => {
    const stores = e2eStores(await makePgGraphStore());
    const token = 'urn:uuid:BR1';
    const bundle: FhirBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          fullUrl: token,
          resource: {
            resourceType: 'Patient',
            id: 'BR1',
            name: [{ family: 'Bridge', given: ['E2E'] }],
            birthDate: '1955-05-05',
            gender: 'female',
            identifier: [{ system: 'http://tcoc.example.org/fhir/sid/mrn', value: 'MRN-BR1' }],
          },
        },
        {
          resource: {
            resourceType: 'Condition',
            id: 'dm-1',
            subject: { reference: token },
            recordedDate: '2026-03-15',
            code: {
              coding: [
                {
                  system: ICD,
                  code: 'E11.9',
                  display: 'Type 2 diabetes mellitus without complications',
                },
              ],
            },
            hcc: { system: 'urn:cms:risk-adjustment:hcc', code: 'HCC38', display: 'Diabetes' },
            extension: [
              {
                url: `${RA}/ra-meat`,
                extension: [
                  { url: 'monitored', valueBoolean: true },
                  { url: 'evaluated', valueBoolean: true },
                  { url: 'assessed', valueBoolean: false },
                  { url: 'treated', valueBoolean: true },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Encounter',
            id: 'visit-1',
            subject: { reference: token },
            class: { code: 'AMB' },
            period: { start: '2026-03-15' },
            type: [{ coding: [{ system: 'http://snomed.info/sct', code: '185349003' }] }],
            extension: [
              { url: `${RA}/ra-renderingProviderNpi`, valueString: '1487654321' },
              { url: `${RA}/ra-sourceDocument`, valueString: 'DocumentReference/visit-1-doc' },
            ],
          },
        },
        {
          resource: {
            resourceType: 'MeasureReport',
            id: 'mr-br1',
            status: 'complete',
            type: 'individual',
            measure: 'http://tcoc.example.org/Measure/RA-CMS-HCC|28',
            subject: { reference: token },
            period: { start: '2026-01-01', end: '2026-09-30' },
            group: [
              {
                id: 'g1',
                code: { coding: [{ system: HCC_SYS, code: 'HCC38' }] },
                extension: [
                  {
                    url: `${RA}/ra-evidenceStatus`,
                    valueCodeableConcept: { coding: [{ code: 'closed-gap' }] },
                  },
                  {
                    url: `${RA}/ra-suspectType`,
                    valueCodeableConcept: { coding: [{ code: 'historic' }] },
                  },
                  {
                    url: `${RA}/ra-hierarchicalStatus`,
                    valueCodeableConcept: { coding: [{ code: 'applied-not-superseded' }] },
                  },
                  { url: `${RA}/ra-evidenceStatusDate`, valueDate: '2026-04-01' },
                ],
              },
            ],
            evaluatedResource: [
              {
                reference: 'Condition/dm-1',
                extension: [{ url: `${RA}/ra-groupReference`, valueString: 'g1' }],
              },
              {
                reference: 'Encounter/visit-1',
                extension: [{ url: `${RA}/ra-groupReference`, valueString: 'g1' }],
              },
            ],
          },
        },
      ],
    } as FhirBundle;

    const res = await ingestBundle(bundle, { sourceSystem: 'ra-engine', now: fixedNow }, stores);
    expect(res.held).toBe(false);
    // The Condition + Encounter + CodingGap all projected as real nodes.
    expect(res.admittedByDomain['coding-gap']).toBeGreaterThanOrEqual(1);
    expect(res.admittedByDomain['conditions']).toBeGreaterThanOrEqual(1);

    const cands = await materializeCandidateCaptures(stores.graph, res.memberId, NO_CONSENT);
    expect(cands).toHaveLength(1);
    const c = cands[0];
    expect(c.capture.icdCode).toBe('E11.9');
    expect(c.capture.hccCode).toBe('HCC38');
    expect(c.capture.providerNpi).toBe('1487654321');
    expect(c.capture.dateOfService).toBe('2026-03-15');
    expect(c.capture.meat).toEqual({
      monitored: true,
      evaluated: true,
      assessed: false,
      treated: true,
    });
    // MEAT present (≥1) + valid DOS + valid NPI + source doc ⇒ RADV-defensible.
    expect(c.defensibility.defensible).toBe(true);
  });
});
