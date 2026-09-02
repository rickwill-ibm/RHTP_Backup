/**
 * Adversarial suite for the WPC payer dimensions (Coverage / Encounter FHIR
 * adapters + RiskAssessment / Flag projection). Proves the PHI-critical properties
 * on BOTH graph backends (pg-mem + the Neo4j fake):
 *
 *   A. a SUD-coded Encounter and a SUD-coded Flag project as RESTRICTED (42 CFR
 *      Part 2) nodes — HIDDEN under NO_CONSENT, VISIBLE under a Part 2 grant, and
 *      surfaced by the part2-restricted enforcement lens only with the grant;
 *   B. the RiskAssessment RAF score round-trips as an IDENTICAL number on both
 *      backends (and the free-text rationale sentence never reaches the graph);
 *   C. robert's SR-3 (medication-cost / financial-navigation referral) carries the
 *      human-review flag — it is visibly tagged, not silently coded.
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
import type { GraphStore } from '@/lib/graph/types';
import { makeNeo4jFakeStore, makePgGraphStore } from '../graph/helpers';
import { readMemberLensBundle } from '@/lib/wpc/projectedAggregator';
import { NO_CONSENT } from '@/lib/graph/lens/types';

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
function stores(graph: GraphStore): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: createXrefIndex({ now: fixedNow }),
  };
}
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';

/** A minimal bundle: one Patient plus a SUD-coded Encounter, a SUD-coded Flag, and a RiskAssessment. */
function sudBundle(): FhirBundle {
  const pt = 'urn:uuid:SUD-PT';
  return {
    resourceType: 'Bundle',
    entry: [
      {
        fullUrl: pt,
        resource: {
          resourceType: 'Patient',
          id: 'sud-pt',
          name: [{ family: 'Test', given: ['Sud'] }],
          birthDate: '1980-01-01',
          gender: 'male',
          identifier: [{ system: 'http://tcoc.example.org/fhir/sid/mrn', value: 'MRN-SUD' }],
        },
      },
      {
        fullUrl: 'urn:uuid:enc-sud',
        resource: {
          resourceType: 'Encounter',
          id: 'enc-sud',
          status: 'finished',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'IMP',
            display: 'inpatient',
          },
          type: [{ coding: [{ system: ICD10, code: 'F10.20', display: 'Alcohol dependence' }] }],
          subject: { reference: pt },
          period: { start: '2026-02-01T00:00:00Z' },
        },
      },
      {
        fullUrl: 'urn:uuid:flag-sud',
        resource: {
          resourceType: 'Flag',
          id: 'flag-sud',
          status: 'active',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/flag-category',
                  code: 'clinical',
                  display: 'Clinical',
                },
              ],
            },
          ],
          code: {
            coding: [{ system: ICD10, code: 'F10.20', display: 'Alcohol dependence' }],
            text: 'SUD relapse risk — free-text narrative',
          },
          subject: { reference: pt },
          period: { start: '2026-02-01T00:00:00Z' },
        },
      },
      {
        fullUrl: 'urn:uuid:ra-sud',
        resource: {
          resourceType: 'RiskAssessment',
          id: 'ra-sud',
          status: 'final',
          subject: { reference: pt },
          prediction: [
            {
              outcome: { text: 'Emergency Room Visit' },
              probabilityDecimal: 0.73,
              rationale: 'Predicted ER risk 73% based on RAF score 2.91 and clinical profile.',
            },
          ],
        },
      },
    ],
  };
}

const BACKENDS: { name: string; make: () => Promise<GraphStore> }[] = [
  { name: 'neo4j-fake', make: async () => makeNeo4jFakeStore() },
  { name: 'pg-mem', make: async () => makePgGraphStore() },
];

for (const backend of BACKENDS) {
  describe(`payer dimensions R4 [${backend.name}]`, () => {
    let graph: GraphStore;
    let res: IngestBundleResult;
    beforeAll(async () => {
      graph = await backend.make();
      res = await ingestBundle(
        sudBundle(),
        { sourceSystem: 'sud-ehr', now: fixedNow, rng: seededRng() },
        stores(graph)
      );
    });

    it('a SUD Encounter + SUD Flag are HIDDEN under NO_CONSENT, VISIBLE under a Part 2 grant', async () => {
      const noConsent = await readMemberLensBundle(graph, res.memberId, NO_CONSENT);
      const covered = await readMemberLensBundle(graph, res.memberId, { part2: true });

      // NO_CONSENT: the restricted Encounter + Flag are fully redacted from whole-person.
      expect(noConsent.wholePerson.nodes.some((n) => n.kind === 'Encounter')).toBe(false);
      expect(noConsent.wholePerson.nodes.some((n) => n.kind === 'Flag')).toBe(false);
      // and the part2-restricted enforcement lens is EMPTY without the grant.
      expect(noConsent.part2Restricted.nodes.filter((n) => n.restricted)).toHaveLength(0);

      // Part 2 grant: both appear, flagged restricted with the 42-CFR-Part-2 label.
      const enc = covered.wholePerson.nodes.find((n) => n.kind === 'Encounter');
      const flag = covered.wholePerson.nodes.find((n) => n.kind === 'Flag');
      expect(enc).toBeDefined();
      expect(flag).toBeDefined();
      expect(enc!.restricted).toBe(true);
      expect(flag!.restricted).toBe(true);
      expect(enc!.labels).toContain('42-CFR-Part-2');
      expect(flag!.labels).toContain('42-CFR-Part-2');
      // the enforcement lens now surfaces the restricted subgraph.
      expect(covered.part2Restricted.nodes.some((n) => n.restricted)).toBe(true);
    });

    it('the Flag never leaks its free-text narrative even when disclosed', async () => {
      const covered = await readMemberLensBundle(graph, res.memberId, { part2: true });
      const flag = covered.wholePerson.nodes.find((n) => n.kind === 'Flag')!;
      expect(JSON.stringify(flag.properties)).not.toContain('free-text narrative');
    });

    it('the RiskAssessment RAF score round-trips as the identical NUMBER', async () => {
      const lb = await readMemberLensBundle(graph, res.memberId, NO_CONSENT);
      const ra = lb.wholePerson.nodes.find((n) => n.kind === 'RiskAssessment');
      expect(ra).toBeDefined();
      expect(ra!.properties.rafScore).toBe(2.91);
      expect(typeof ra!.properties.rafScore).toBe('number');
      expect(ra!.properties.probability).toBe(0.73);
      // the rationale sentence never reaches the graph (PHI-minimal projection).
      expect(JSON.stringify(ra!.properties)).not.toContain('based on');
    });
  });
}

describe('robert SR-3 review routing (financial-navigation referral)', () => {
  it('robert SR-3 carries the human-review flag — visibly tagged, not silently coded', async () => {
    const graph = makeNeo4jFakeStore();
    const bundle = JSON.parse(
      readFileSync('fhir/seed/patients/robert-chen.bundle.json', 'utf8')
    ) as FhirBundle;
    const res = await ingestBundle(
      bundle,
      { sourceSystem: 'ehr-robert', now: fixedNow, rng: seededRng() },
      stores(graph)
    );
    const lb = await readMemberLensBundle(graph, res.memberId, NO_CONSENT);
    const referrals = lb.wholePerson.nodes.filter((n) => n.kind === 'ServiceRequest');
    const flagged = referrals.filter((n) => n.properties.reviewRequired === true);
    // exactly the SR-3 medication-cost / financial-navigation referral is flagged for review.
    expect(flagged.length).toBe(1);
    expect(String(flagged[0].properties.reviewReason)).toContain('gravity-sdoh-financial');
    // it is still coded (admitted), not quarantined — a governed code + a review flag.
    expect(String(flagged[0].properties.serviceCode)).toBe('3457005');
    // no other referral carries the review flag.
    expect(referrals.filter((n) => n.properties.reviewRequired === true)).toHaveLength(1);
  });
});
