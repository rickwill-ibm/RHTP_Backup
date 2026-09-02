/**
 * Da Vinci Risk Adjustment CODING GAP dimension — adversarial suite (BOTH backends).
 *
 * Proves the new projected dimension end to end through the production `ingestBundle`
 * driver, and — above all — the coding-intensity FIREWALL that a green happy-path
 * cannot: a coding gap is a payer-analytics HYPOTHESIS, never an asserted diagnosis.
 *
 * Adversarially, on BOTH graph backends (pg-mem Postgres + the Neo4j fake):
 *   1. a Coding Gap MeasureReport PROJECTS a CodingGap node with the HCC category,
 *      evidence status, suspect type, hierarchical status, and model+version;
 *   2. model-version NON-collision: a V24 and a V28 report for the SAME member yield
 *      TWO distinct CodingGap nodes (both coexist — the blend is real);
 *   3. evidence linkage: SUPPORTED_BY edges connect the gap to the exact Condition it
 *      cites (via evaluatedResource + ra-groupReference), binding to the real node;
 *   4. FIREWALL: a `suspected` gap projects a CodingGap but mints ZERO Condition nodes
 *      (no clinical assertion), and coding-gap is NOT a code-carrying domain;
 *   5. 42 CFR Part 2: a SUD-linked HCC gap is RESTRICTED under NO_CONSENT and
 *      DISCLOSED under a covering scope — both backends agree;
 *   6. an ungoverned evidence status / suspect type QUARANTINES (never guessed);
 *   7. a non-RA MeasureReport is by-design NON-projected (not routed to coding-gap);
 *   8. PHI-minimal: the node carries no free-text rationale/justification.
 */
import { describe, expect, it } from 'vitest';
import { createXrefIndex } from '@/lib/identity';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import { ingestBundle, type FhirBundle, type IngestStores } from '@/lib/runtime/ingestBundle';
import { CODE_CARRYING_DOMAINS, isSudConditionCategory } from '@/lib/pipeline';
import type { GraphStore } from '@/lib/graph/types';
import { makeNeo4jFakeStore, makePgGraphStore } from '../graph/helpers';
import { readMemberLensBundle } from '@/lib/wpc/projectedAggregator';
import { MEMBER_KIND } from '@/lib/graph/mapping/spec';
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
function newStores(graph: GraphStore): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: createXrefIndex({ now: fixedNow }),
  };
}

const RA = 'http://hl7.org/fhir/us/davinci-ra/StructureDefinition';
const HCC_SYS = 'https://www.cms.gov/Medicare/Health-Plans/MedicareAdvtgSpecRateStats/HCC';

function patient(token: string) {
  return {
    fullUrl: token,
    resource: {
      resourceType: 'Patient',
      id: token.replace(/[^A-Za-z0-9]/g, ''),
      name: [{ family: 'Gap', given: ['Test'] }],
      birthDate: '1955-05-05',
      gender: 'female',
      identifier: [{ system: 'http://tcoc.example.org/fhir/sid/mrn', value: `MRN-${token}` }],
    },
  };
}

/** A Da Vinci-RA Coding Gap MeasureReport group. */
interface GroupOpts {
  id: string;
  hcc: string;
  status: string;
  suspect: string;
  hier?: string;
  date?: string;
}
function group(opts: GroupOpts) {
  return {
    id: opts.id,
    code: { coding: [{ system: HCC_SYS, code: opts.hcc }] },
    extension: [
      {
        url: `${RA}/ra-evidenceStatus`,
        valueCodeableConcept: { coding: [{ code: opts.status }] },
      },
      {
        url: `${RA}/ra-suspectType`,
        valueCodeableConcept: { coding: [{ code: opts.suspect }] },
      },
      {
        url: `${RA}/ra-hierarchicalStatus`,
        valueCodeableConcept: { coding: [{ code: opts.hier ?? 'applied-not-superseded' }] },
      },
      { url: `${RA}/ra-evidenceStatusDate`, valueDate: opts.date ?? '2026-04-01' },
    ],
  };
}

/** A full Coding Gap MeasureReport bundle: Patient + MeasureReport (+ optional evidence). */
function gapBundle(opts: {
  token: string;
  mrId: string;
  version: string; // e.g. '24' | '28'
  groups: GroupOpts[];
  evaluated?: { reference: string; groupId?: string }[];
  extraEntries?: unknown[];
}): FhirBundle {
  const measureReport = {
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
  };
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [patient(opts.token), { resource: measureReport }, ...((opts.extraEntries ?? []) as [])],
  } as FhirBundle;
}

const BACKENDS: { name: string; make: () => Promise<GraphStore> }[] = [
  { name: 'neo4j-fake', make: async () => makeNeo4jFakeStore() },
  { name: 'pg-mem', make: async () => makePgGraphStore() },
];

for (const backend of BACKENDS) {
  describe(`wpc coding-gap dimension [${backend.name}]`, () => {
    it('a Coding Gap MeasureReport projects a CodingGap node with the RA fields', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG1',
          mrId: 'mr-v24-1',
          version: '24',
          groups: [{ id: 'g1', hcc: 'HCC18', status: 'closed-gap', suspect: 'historic' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng() },
        stores
      );
      expect(res.held).toBe(false);
      expect(res.admittedByDomain['coding-gap']).toBeGreaterThanOrEqual(1);
      const lb = await readMemberLensBundle(stores.graph, res.memberId, NO_CONSENT);
      const gaps = lb.wholePerson.nodes.filter((n) => n.kind === 'CodingGap');
      expect(gaps).toHaveLength(1);
      expect(String(gaps[0].properties.conditionCategory)).toBe('HCC18');
      expect(String(gaps[0].properties.evidenceStatus)).toBe('closed-gap');
      expect(String(gaps[0].properties.suspectType)).toBe('historic');
      expect(String(gaps[0].properties.hierarchicalStatus)).toBe('applied-not-superseded');
      expect(String(gaps[0].properties.model)).toBe('CMS-HCC');
      expect(String(gaps[0].properties.modelVersion)).toBe('V24');
      // evidenceStatusDate parsed as a DATE, never mistaken for the status.
      expect(String(gaps[0].properties.evidenceStatusDate)).toBe('2026-04-01');
    });

    it('a V24 and a V28 report for the SAME member yield TWO distinct CodingGap nodes', async () => {
      const stores = newStores(await backend.make());
      const opts = { sourceSystem: 'ra-engine', now: fixedNow } as const;
      const a = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG2',
          mrId: 'mr-v24',
          version: '24',
          groups: [{ id: 'g1', hcc: 'HCC18', status: 'closed-gap', suspect: 'historic' }],
        }),
        { ...opts, rng: seededRng(1) },
        stores
      );
      const b = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG2',
          mrId: 'mr-v28',
          version: '28',
          groups: [{ id: 'g1', hcc: 'HCC38', status: 'open-gap', suspect: 'suspected' }],
        }),
        { ...opts, rng: seededRng(2) },
        stores
      );
      expect(a.memberId).toBe(b.memberId); // same member (same source + token)
      const lb = await readMemberLensBundle(stores.graph, a.memberId, NO_CONSENT);
      const gaps = lb.wholePerson.nodes.filter((n) => n.kind === 'CodingGap');
      expect(gaps).toHaveLength(2); // V24 and V28 coexist, never collapsed
      const versions = gaps.map((g) => String(g.properties.modelVersion)).sort();
      expect(versions).toEqual(['V24', 'V28']);
    });

    it('SUPPORTED_BY cites evidence via a NEUTRAL Evidence node (never mints a Condition)', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG3',
          mrId: 'mr-ev',
          version: '24',
          groups: [{ id: 'g1', hcc: 'HCC18', status: 'closed-gap', suspect: 'historic' }],
          evaluated: [{ reference: 'Condition/cond-dm', groupId: 'g1' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng(3) },
        stores
      );
      const gapKey = 'CodingGap/mr-ev:CMS-HCC-V24:g1:HCC18';
      const edges = await stores.graph.listEdges({ fromKey: gapKey });
      const supported = edges.filter((e) => e.type === 'SUPPORTED_BY');
      expect(supported).toHaveLength(1);
      // the citation is recorded on a NEUTRAL Evidence node (join-back via evidenceRef),
      // NOT a Condition — the reference never materializes a diagnosis.
      expect(supported[0].to.kind).toBe('Evidence');
      expect(supported[0].to.key).toBe('Condition/cond-dm');
      expect(String(supported[0].properties.resourceType)).toBe('Condition');
      const conditions = await stores.graph.listNodes({ kind: 'Condition' });
      expect(conditions).toHaveLength(0); // FIREWALL: no Condition minted from a citation
      expect(res.held).toBe(false);
    });

    it('FIREWALL: a suspected gap CITING a Condition still mints ZERO Condition nodes', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG4',
          mrId: 'mr-susp',
          version: '28',
          groups: [{ id: 'g1', hcc: 'HCC38', status: 'open-gap', suspect: 'suspected' }],
          // the adversarial twist: the suspected gap CITES a Condition reference. A naive
          // edge would stub a Condition node — materializing a hypothesis as a diagnosis.
          evaluated: [{ reference: 'Condition/hypothesis', groupId: 'g1' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng(4) },
        stores
      );
      const conditions = await stores.graph.listNodes({ kind: 'Condition' });
      expect(conditions).toHaveLength(0); // a suspected gap NEVER becomes a diagnosis
      // the citation IS recorded — on a neutral Evidence node, not a Condition.
      const evidence = await stores.graph.listNodes({ kind: 'Evidence' });
      expect(evidence.some((n) => n.key === 'Condition/hypothesis')).toBe(true);
      const lb = await readMemberLensBundle(stores.graph, res.memberId, NO_CONSENT);
      const gap = lb.wholePerson.nodes.find((n) => n.kind === 'CodingGap');
      expect(String(gap?.properties.suspectType)).toBe('suspected');
    });

    it('42 CFR Part 2: a SUD-linked HCC gap is restricted under NO_CONSENT, disclosed under scope', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG5',
          mrId: 'mr-sud',
          version: '24',
          groups: [{ id: 'g1', hcc: 'HCC55', status: 'open-gap', suspect: 'suspected' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng(5) },
        stores
      );
      const noConsent = await readMemberLensBundle(stores.graph, res.memberId, NO_CONSENT);
      expect(noConsent.wholePerson.nodes.some((n) => n.kind === 'CodingGap')).toBe(false);
      const covered = await readMemberLensBundle(stores.graph, res.memberId, { part2: true });
      const gap = covered.wholePerson.nodes.find((n) => n.kind === 'CodingGap');
      expect(gap).toBeTruthy();
      expect(gap?.restricted).toBe(true);
    });

    it('42 CFR Part 2: a ZERO-PADDED SUD HCC (HCC055) is still restricted (no leak)', async () => {
      const stores = newStores(await backend.make());
      // adversarial encoding: leading-zero HCC code must normalize to 55 and restrict.
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG5b',
          mrId: 'mr-sud0',
          version: '24',
          groups: [{ id: 'g1', hcc: 'HCC055', status: 'open-gap', suspect: 'historic' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng(15) },
        stores
      );
      const noConsent = await readMemberLensBundle(stores.graph, res.memberId, NO_CONSENT);
      expect(noConsent.wholePerson.nodes.some((n) => n.kind === 'CodingGap')).toBe(false);
      const covered = await readMemberLensBundle(stores.graph, res.memberId, { part2: true });
      expect(covered.wholePerson.nodes.some((n) => n.kind === 'CodingGap')).toBe(true);
    });

    it('two groups with the SAME HCC in one report yield TWO nodes (no key collision)', async () => {
      const stores = newStores(await backend.make());
      // adversarial: a repeated condition category within one report — the group id must
      // disambiguate so one gap does not silently overwrite the other.
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG5c',
          mrId: 'mr-dup',
          version: '24',
          groups: [
            { id: 'g1', hcc: 'HCC18', status: 'open-gap', suspect: 'suspected' },
            { id: 'g2', hcc: 'HCC18', status: 'closed-gap', suspect: 'historic' },
          ],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng(16) },
        stores
      );
      const lb = await readMemberLensBundle(stores.graph, res.memberId, NO_CONSENT);
      const gaps = lb.wholePerson.nodes.filter((n) => n.kind === 'CodingGap');
      expect(gaps).toHaveLength(2);
      const statuses = gaps.map((g) => String(g.properties.evidenceStatus)).sort();
      expect(statuses).toEqual(['closed-gap', 'open-gap']);
    });

    it('an ungoverned evidence status / suspect type QUARANTINES (never guessed)', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG6',
          mrId: 'mr-bad',
          version: '24',
          groups: [
            { id: 'g1', hcc: 'HCC18', status: 'definitely-a-gap', suspect: 'historic' },
            { id: 'g2', hcc: 'HCC85', status: 'open-gap', suspect: 'maybe' },
          ],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng(6) },
        stores
      );
      // both ungoverned groups quarantine; neither projects a node.
      const reasons = res.quarantined.flatMap((q) => q.reasonCodes);
      expect(reasons).toContain('invalid-evidence-status');
      expect(reasons).toContain('invalid-suspect-type');
      const lb = await readMemberLensBundle(stores.graph, res.memberId, NO_CONSENT);
      expect(lb.wholePerson.nodes.some((n) => n.kind === 'CodingGap')).toBe(false);
    });

    it('a non-RA MeasureReport is by-design non-projected (not routed to coding-gap)', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        {
          resourceType: 'Bundle',
          type: 'collection',
          entry: [
            patient('urn:uuid:CG7'),
            {
              resource: {
                resourceType: 'MeasureReport',
                id: 'mr-quality',
                status: 'complete',
                type: 'individual',
                measure: 'http://example.org/Measure/DiabetesEyeExam',
                subject: { reference: 'urn:uuid:CG7' },
                period: { start: '2026-01-01', end: '2026-12-31' },
                group: [{ id: 'g1', measureScore: { value: 0.8 } }],
              },
            },
          ],
        } as FhirBundle,
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng(7) },
        stores
      );
      expect(res.admittedByDomain['coding-gap'] ?? 0).toBe(0);
      expect(res.nonProjected['MeasureReport:non-ra']).toBe(1);
      const lb = await readMemberLensBundle(stores.graph, res.memberId, NO_CONSENT);
      expect(lb.wholePerson.nodes.some((n) => n.kind === 'CodingGap')).toBe(false);
    });

    it('PHI-minimal: the CodingGap node carries no free-text rationale/narrative', async () => {
      const stores = newStores(await backend.make());
      const res = await ingestBundle(
        gapBundle({
          token: 'urn:uuid:CG8',
          mrId: 'mr-phi',
          version: '24',
          groups: [{ id: 'g1', hcc: 'HCC18', status: 'closed-gap', suspect: 'historic' }],
        }),
        { sourceSystem: 'ra-engine', now: fixedNow, rng: seededRng(8) },
        stores
      );
      const lb = await readMemberLensBundle(stores.graph, res.memberId, NO_CONSENT);
      const gap = lb.wholePerson.nodes.find((n) => n.kind === 'CodingGap');
      const propKeys = Object.keys(gap?.properties ?? {});
      // only the governed PHI-minimal fields — no rationale/justification/note/text.
      for (const banned of ['rationale', 'justification', 'note', 'text', 'narrative']) {
        expect(propKeys).not.toContain(banned);
      }
    });
  });
}

describe('coding-gap is NOT a code-carrying domain (firewall)', () => {
  it('never runs the clinical semantic-binding gate', () => {
    expect(CODE_CARRYING_DOMAINS).not.toContain('coding-gap');
  });
});

describe('SUD condition-category detection (42 CFR Part 2, version-aware, fail-closed)', () => {
  it('matches SUD HCCs per model version and normalizes leading zeros', () => {
    expect(isSudConditionCategory('HCC55', 'V24')).toBe(true);
    expect(isSudConditionCategory('HCC055', 'V24')).toBe(true); // leading zero
    expect(isSudConditionCategory('HCC136', 'V28')).toBe(true);
    expect(isSudConditionCategory('HCC18', 'V24')).toBe(false); // diabetes, not SUD
  });
  it('fails CLOSED: a non-empty code with no parseable digits is treated as sensitive', () => {
    expect(isSudConditionCategory('HCC-SUD', 'V24')).toBe(true);
    expect(isSudConditionCategory('', 'V24')).toBe(false); // empty never projects anyway
  });
  it('unknown version falls back to the cross-version UNION (never leaks)', () => {
    expect(isSudConditionCategory('HCC55', '')).toBe(true);
    expect(isSudConditionCategory('HCC137', 'V99')).toBe(true);
  });
});
