/**
 * RADV enrichment (P1a) on the REAL committed seed bundles — BOTH backends.
 *
 * Proves the Wave-B enrichment end to end on production seed data (not synthetic
 * fixtures): the coding-gap → RADV bridge walks the two-hop read model
 *   (Member)-[:HAS_CODING_GAP]->(CodingGap)-[:SUPPORTED_BY]->(Evidence ⇒ Condition|Encounter)
 * and turns a member's CLOSED coding gaps into candidate HccCaptures scored for RADV
 * defensibility. It asserts three things a green ingest census cannot:
 *
 *   1. the enrichment REACHED the graph — the closed-gap-cited Condition carries the
 *      four MEAT booleans and the cited Encounter carries the RADV evidence trio
 *      (rendering-provider NPI, date of service, source-document ref);
 *   2. a closed gap with that evidence scores RADV-DEFENSIBLE (no residual deficiency);
 *   3. the FIREWALL and CONSENT both hold in the bridge — a suspected / Part 2 SUD gap
 *      never yields a candidate, with or without a covering scope.
 *
 * Split from wpcRecordLoad.test.ts to keep both files well under the size ratchet.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createXrefIndex } from '@/lib/identity';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import { ingestBundle, type FhirBundle, type IngestStores } from '@/lib/runtime/ingestBundle';
import type { GraphStore } from '@/lib/graph/types';
import { makeNeo4jFakeStore, makePgGraphStore } from '../graph/helpers';
import { NO_CONSENT } from '@/lib/graph/lens/types';
import { materializeCandidateCaptures } from '@/lib/finance/riskAdjustment';

const fixedNow = () => 1_700_000_000_000;
function loadBundle(slug: string): FhirBundle {
  return JSON.parse(readFileSync(`fhir/seed/patients/${slug}.bundle.json`, 'utf8'));
}
function sessionStores(shared: { graph: GraphStore; xref: IngestStores['xref'] }): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph: shared.graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: shared.xref,
  };
}

const BACKENDS: { name: string; make: () => Promise<GraphStore> }[] = [
  { name: 'neo4j-fake', make: async () => makeNeo4jFakeStore() },
  { name: 'pg-mem', make: async () => makePgGraphStore() },
];

for (const backend of BACKENDS) {
  describe(`RADV enrichment on seed bundles [${backend.name}]`, () => {
    let graph: GraphStore;
    const member = new Map<string, string>();

    beforeAll(async () => {
      graph = await backend.make();
      const shared = { graph, xref: createXrefIndex({ now: fixedNow }) };
      for (const slug of ['dorothy-simmons', 'robert-chen']) {
        const res = await ingestBundle(
          loadBundle(slug),
          { sourceSystem: `ehr-${slug}`, now: fixedNow },
          sessionStores(shared)
        );
        member.set(slug, res.memberId);
      }
    });

    it('dorothy: the closed V28 diabetes gap materializes a RADV-DEFENSIBLE candidate', async () => {
      const cands = await materializeCandidateCaptures(
        graph,
        member.get('dorothy-simmons')!,
        NO_CONSENT
      );
      const dm = cands.find((c) => c.capture.hccCode === 'HCC38');
      expect(dm).toBeDefined();
      expect(dm!.capture.providerNpi).toMatch(/^\d{10}$/);
      expect(dm!.capture.dateOfService).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(dm!.capture.sourceDocumentRef).toBeTruthy();
      const meat = dm!.capture.meat;
      expect(meat.monitored || meat.evaluated || meat.assessed || meat.treated).toBe(true);
      expect(dm!.defensibility.defensible).toBe(true);
      expect(dm!.defensibility.deficiencies).toEqual([]);
    });

    it('the enriched Condition + Encounter nodes carry the RADV props and NO narrative (PHI-minimal)', async () => {
      const dm = (
        await materializeCandidateCaptures(graph, member.get('dorothy-simmons')!, NO_CONSENT)
      ).find((c) => c.capture.hccCode === 'HCC38')!;
      const cond = await graph.getNode('Condition', dm.conditionRef);
      const enc = await graph.getNode('Encounter', dm.encounterRef!);
      expect(cond!.properties).toHaveProperty('meatMonitored');
      expect(String(enc!.properties.providerNpi)).toMatch(/^\d{10}$/);
      expect(String(enc!.properties.dateOfService)).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(String(enc!.properties.sourceDocumentRef)).toBeTruthy();
      for (const n of [cond!, enc!]) {
        for (const banned of ['note', 'narrative', 'rationale', 'text', 'justification']) {
          expect(Object.keys(n.properties)).not.toContain(banned);
        }
      }
    });

    it('FIREWALL + CONSENT hold: robert never yields a candidate for the suspected Part 2 SUD gap', async () => {
      const m = member.get('robert-chen')!;
      const noConsent = await materializeCandidateCaptures(graph, m, NO_CONSENT);
      // the CKD (closed, non-SUD) gap yields a defensible candidate.
      expect(noConsent.some((c) => c.capture.hccCode === 'HCC329')).toBe(true);
      // the SUD gap (suspected + Part 2) never does — firewall AND consent.
      expect(noConsent.some((c) => c.capture.hccCode === 'HCC135')).toBe(false);
      // even WITH a Part 2 grant the suspected SUD gap stays out (a hypothesis is never
      // submittable regardless of entitlement — the firewall is not a consent check).
      const covered = await materializeCandidateCaptures(graph, m, { part2: true });
      expect(covered.some((c) => c.capture.hccCode === 'HCC135')).toBe(false);
    });
  });
}
