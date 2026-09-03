/**
 * Da Vinci-RA **$report** assembler — adversarial suite (BOTH backends).
 *
 * `assembleCodingGapReports` reconstructs Coding Gap `MeasureReport`s OUT of the
 * projected graph (the inverse of `codingGapReportAdapter`). This suite proves, on the
 * pg-mem Postgres store AND the Neo4j fake:
 *
 *   1. shape — the emitted MeasureReport carries the model|version measure, the HCC
 *      group code, and the four RA group extensions (evidence status, suspect type,
 *      hierarchical status, evidence-status date) plus evaluatedResource with
 *      ra-groupReference;
 *   2. CONSENT — a 42 CFR Part 2 SUD gap is OMITTED under NO_CONSENT and only appears
 *      under a covering scope (the assembler can never re-disclose what the lens hides);
 *   3. ROUND-TRIP — the assembled Bundle re-ingests to the SAME CodingGap nodes (keys),
 *      so report-out is faithful to report-in;
 *   4. PHI-minimal — no rationale/narrative leaks into the emitted report.
 */
import { describe, expect, it } from 'vitest';
import { createXrefIndex } from '@/lib/identity';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import { ingestBundle, type FhirBundle, type IngestStores } from '@/lib/runtime/ingestBundle';
import type { GraphStore } from '@/lib/graph/types';
import { makeNeo4jFakeStore, makePgGraphStore } from '../graph/helpers';
import { assembleCodingGapReports } from '@/lib/finance/riskAdjustment';
import { NO_CONSENT } from '@/lib/graph/lens/types';

const fixedNow = () => 1_700_000_000_000;
const RA = 'http://hl7.org/fhir/us/davinci-ra/StructureDefinition';
const HCC_SYS = 'https://www.cms.gov/Medicare/Health-Plans/MedicareAdvtgSpecRateStats/HCC';

function newStores(graph: GraphStore): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: createXrefIndex({ now: fixedNow }),
  };
}
function patient(token: string) {
  return {
    fullUrl: token,
    resource: {
      resourceType: 'Patient',
      id: token.replace(/[^A-Za-z0-9]/g, ''),
      name: [{ family: 'Report', given: ['Out'] }],
      birthDate: '1955-05-05',
      gender: 'female',
      identifier: [{ system: 'http://tcoc.example.org/fhir/sid/mrn', value: `MRN-${token}` }],
    },
  };
}
interface G {
  id: string;
  hcc: string;
  status: string;
  suspect: string;
  hier?: string;
}
function group(g: G) {
  return {
    id: g.id,
    code: { coding: [{ system: HCC_SYS, code: g.hcc }] },
    extension: [
      { url: `${RA}/ra-evidenceStatus`, valueCodeableConcept: { coding: [{ code: g.status }] } },
      { url: `${RA}/ra-suspectType`, valueCodeableConcept: { coding: [{ code: g.suspect }] } },
      {
        url: `${RA}/ra-hierarchicalStatus`,
        valueCodeableConcept: { coding: [{ code: g.hier ?? 'applied-not-superseded' }] },
      },
      { url: `${RA}/ra-evidenceStatusDate`, valueDate: '2026-04-01' },
    ],
  };
}
function gapBundle(opts: {
  token: string;
  mrId: string;
  version: string;
  groups: G[];
  evaluated?: { reference: string; groupId?: string }[];
}): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      patient(opts.token),
      {
        resource: {
          resourceType: 'MeasureReport',
          id: opts.mrId,
          status: 'complete',
          type: 'individual',
          measure: `http://tcoc.example.org/Measure/RA-CMS-HCC|${opts.version}`,
          subject: { reference: opts.token },
          period: { start: '2026-01-01', end: '2026-09-30' },
          group: opts.groups.map(group),
          evaluatedResource: (opts.evaluated ?? []).map((e) => ({
            reference: e.reference,
            ...(e.groupId
              ? { extension: [{ url: `${RA}/ra-groupReference`, valueString: e.groupId }] }
              : {}),
          })),
        },
      },
    ],
  } as FhirBundle;
}

const BACKENDS: { name: string; make: () => Promise<GraphStore> }[] = [
  { name: 'neo4j-fake', make: async () => makeNeo4jFakeStore() },
  { name: 'pg-mem', make: async () => makePgGraphStore() },
];

for (const backend of BACKENDS) {
  describe(`Da Vinci-RA $report assembler [${backend.name}]`, () => {
    it('assembles a MeasureReport with the model|version measure, HCC group code, and RA extensions', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:RO1',
          mrId: 'mr-ro1',
          version: '28',
          groups: [{ id: 'g1', hcc: 'HCC38', status: 'closed-gap', suspect: 'historic' }],
          evaluated: [{ reference: 'Condition/dm-1', groupId: 'g1' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow },
        stores
      );
      const reports = await assembleCodingGapReports(stores.graph, res.memberId, NO_CONSENT);
      expect(reports).toHaveLength(1);
      const r = reports[0];
      expect(r.resourceType).toBe('MeasureReport');
      expect(r.id).toBe('mr-ro1');
      expect(r.measure).toBe('CMS-HCC|V28');
      expect(r.subject.reference).toBe(`Patient/${res.memberId}`);
      expect(r.group).toHaveLength(1);
      expect(r.group[0].code.coding[0].code).toBe('HCC38');
      const extUrls = r.group[0].extension.map((e) => e.url.split('/').pop());
      expect(extUrls).toContain('ra-evidenceStatus');
      expect(extUrls).toContain('ra-suspectType');
      expect(extUrls).toContain('ra-hierarchicalStatus');
      expect(extUrls).toContain('ra-evidenceStatusDate');
      // evaluatedResource cites the evidence, tagged with the group reference.
      expect(r.evaluatedResource.some((e) => e.reference === 'Condition/dm-1')).toBe(true);
      expect(r.evaluatedResource[0].extension?.[0].valueString).toBe('g1');
    });

    it('CONSENT: a Part 2 SUD gap is omitted under NO_CONSENT, present under a covering scope', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:RO2',
          mrId: 'mr-sud',
          version: '24',
          groups: [
            { id: 'g1', hcc: 'HCC55', status: 'open-gap', suspect: 'suspected' }, // SUD → restricted
            { id: 'g2', hcc: 'HCC18', status: 'closed-gap', suspect: 'historic' }, // not SUD
          ],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow },
        stores
      );
      const hidden = await assembleCodingGapReports(stores.graph, res.memberId, NO_CONSENT);
      const hiddenHccs = hidden.flatMap((r) => r.group.map((g) => g.code.coding[0].code));
      expect(hiddenHccs).toContain('HCC18');
      expect(hiddenHccs).not.toContain('HCC55'); // the SUD gap is redacted from the report
      const covered = await assembleCodingGapReports(stores.graph, res.memberId, { part2: true });
      const coveredHccs = covered.flatMap((r) => r.group.map((g) => g.code.coding[0].code));
      expect(coveredHccs).toContain('HCC55'); // disclosed only under a covering scope
    });

    it('ROUND-TRIP: the assembled report re-ingests to the SAME CodingGap nodes', async () => {
      const a = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:RO3',
          mrId: 'mr-rt',
          version: '28',
          groups: [
            { id: 'g1', hcc: 'HCC38', status: 'closed-gap', suspect: 'historic' },
            { id: 'g2', hcc: 'HCC226', status: 'pending', suspect: 'net-new' },
          ],
          evaluated: [{ reference: 'Condition/dm-1', groupId: 'g1' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow },
        a
      );
      const keysA = (await a.graph.listNodes({ kind: 'CodingGap' })).map((n) => n.key).sort();

      const reports = await assembleCodingGapReports(a.graph, res.memberId, NO_CONSENT);
      const reIngest: FhirBundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          patient('urn:uuid:RO3'),
          ...reports.map((resource) => ({
            resource: resource as unknown as Record<string, unknown>,
          })),
        ],
      } as FhirBundle;
      const b = newStores(await backend.make());
      await ingestBundle(reIngest, { sourceSystem: 'ra-engine', now: fixedNow }, b);
      const keysB = (await b.graph.listNodes({ kind: 'CodingGap' })).map((n) => n.key).sort();
      expect(keysB).toEqual(keysA); // report-out is faithful to report-in
    });

    it('a member with no gaps (or absent) yields no reports; output carries no narrative', async () => {
      const stores = newStores(await backend.make());
      expect(await assembleCodingGapReports(stores.graph, 'ghost', NO_CONSENT)).toEqual([]);
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:RO4',
          mrId: 'mr-phi',
          version: '28',
          groups: [{ id: 'g1', hcc: 'HCC38', status: 'closed-gap', suspect: 'historic' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow },
        stores
      );
      const reports = await assembleCodingGapReports(stores.graph, res.memberId, NO_CONSENT);
      expect(JSON.stringify(reports)).not.toMatch(/rationale|narrative|note|justification/i);
    });
  });
}
