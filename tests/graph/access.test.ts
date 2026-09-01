// Access-geography spec (WPC Unit 1): namespace pin + projection against BOTH
// certified backends (Postgres reference + Neo4j fake), and the fail-closed rule
// that an ABSENT field is stored as null, never a fabricated default.
import { describe, it, expect } from 'vitest';
import { project, specFor, MAPPING_SPECS, ENRICHMENT_SPECS } from '@/lib/graph';
import {
  accessSpec,
  ACCESS_DOMAIN,
  ACCESS_CONTEXT_KIND,
  HAS_ACCESS_CONTEXT,
} from '@/lib/graph/mapping/access';
import { c2, fixedNow, makeNeo4jFakeStore, makePgGraphStore } from './helpers';

const deps = { now: fixedNow };
const accessEvent = (memberId: string, payload: Record<string, unknown>) =>
  c2({ eventType: 'access.geographic.recorded', memberId, payload });

describe('access-geography namespace + registration', () => {
  it('pins the namespace and is claimed by exactly its spec', () => {
    expect(ACCESS_DOMAIN).toBe('access-geography');
    expect(ACCESS_CONTEXT_KIND).toBe('AccessContext');
    expect(HAS_ACCESS_CONTEXT).toBe('HAS_ACCESS_CONTEXT');
    expect(accessSpec.domain).toBe(ACCESS_DOMAIN);
    expect(accessSpec.matches('access.geographic.recorded')).toBe(true);
    expect(accessSpec.matches('sdoh.screening.completed')).toBe(false);
    expect(specFor('access.geographic.recorded')).toBe(accessSpec);
    // It is an ENRICHMENT projection, NOT a C9 record domain (keeps the 20/20 count true).
    expect(ENRICHMENT_SPECS).toContain(accessSpec);
    expect(MAPPING_SPECS).not.toContain(accessSpec);
  });
});

describe('access-geography projection (backend parity)', () => {
  it('projects an AccessContext node + edge identically on both backends; absent field -> null', async () => {
    const muts = project(
      [accessEvent('M1', { ruralStatus: 'rural', distanceToProviderMiles: 45 })],
      deps
    );
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const node = await store.getNode(ACCESS_CONTEXT_KIND, 'M1');
      expect(node).toBeTruthy();
      expect(node!.properties.ruralStatus).toBe('rural');
      expect(node!.properties.distanceToProviderMiles).toBe(45);
      // absent fields are null (fail-closed), NEVER a fabricated false/0
      expect(node!.properties.publicTransitAvailable).toBeNull();
      expect(node!.properties.nearestERMiles).toBeNull();
      const edges = await store.listEdges({ fromKey: 'M1' });
      expect(
        edges.some((e) => e.type === HAS_ACCESS_CONTEXT && e.to.kind === ACCESS_CONTEXT_KIND)
      ).toBe(true);
    }
  });

  it('is idempotent even with a CHANGED asOf: one node, one edge (latest wins)', async () => {
    const store = makeNeo4jFakeStore();
    await store.apply(
      project(
        [{ ...accessEvent('M2', { ruralStatus: 'frontier' }), occurredAt: '2026-01-01T00:00:00Z' }],
        deps
      )
    );
    await store.apply(
      project(
        [{ ...accessEvent('M2', { ruralStatus: 'rural' }), occurredAt: '2026-06-01T00:00:00Z' }],
        deps
      )
    );
    const node = await store.getNode(ACCESS_CONTEXT_KIND, 'M2');
    expect(node!.properties.ruralStatus).toBe('rural'); // latest wins
    const edges = await store.listEdges({ fromKey: 'M2' });
    expect(edges.filter((e) => e.type === HAS_ACCESS_CONTEXT).length).toBe(1);
  });
});
