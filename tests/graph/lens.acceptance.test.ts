import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import {
  LENS_NAMES,
  LENSES,
  type ConsentScope,
  type GraphStore,
  type LensResult,
  part2RestrictedLens,
  project,
  scopeCovers,
} from '@/lib/graph';
import { c2, fixedNow, makeNeo4jFakeStore, makePgGraphStore } from './helpers';

/**
 * The LENS ACCEPTANCE SUITE (DP-1) - the co-equal lens guarantee in code. All five
 * lens queries run against BOTH certified backends (Postgres via pg-mem, Neo4j via
 * the fake) from the SAME seeded event stream, and every lens must return identical
 * logical results. Part 2 enforcement (restricted node excluded without scope,
 * included with it) is asserted on both backends too.
 */
const deps = { now: fixedNow };

/** One member's cross-domain event stream, deterministic under the fixed clock. */
function seedFor(memberId: string): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-cov`, eventType: 'coverage.enrolled', memberId,
      occurredAt: '2026-01-01T00:00:00Z',
      payload: { coverageRef: `Coverage/${memberId}`, planCode: 'SD-MEDICAID', status: 'active', periodStart: '2026-01-01' },
    }),
    // Open, non-restricted encounter -> a care gap (still admitted).
    c2({
      eventId: `${memberId}-enc-open`, eventType: 'encounter.admitted', memberId,
      occurredAt: '2026-02-01T00:00:00Z',
      payload: { encounterRef: `Encounter/${memberId}-open`, encounterClass: 'IMP', trigger: 'A01' },
    }),
    // Closed encounter (admit then discharge) -> NOT a care gap.
    c2({
      eventId: `${memberId}-enc-c-a`, eventType: 'encounter.admitted', memberId,
      occurredAt: '2026-02-03T00:00:00Z',
      payload: { encounterRef: `Encounter/${memberId}-closed`, encounterClass: 'IMP' },
    }),
    c2({
      eventId: `${memberId}-enc-c-d`, eventType: 'encounter.discharged', memberId,
      occurredAt: '2026-02-05T00:00:00Z',
      payload: { encounterRef: `Encounter/${memberId}-closed`, encounterClass: 'IMP' },
    }),
    // Part 2 restricted behavioral-health encounter (envelope-labeled by the pipeline).
    c2({
      eventId: `${memberId}-enc-r`, eventType: 'encounter.admitted', memberId,
      occurredAt: '2026-02-07T00:00:00Z',
      consentContext: { part2Restricted: true, segmentLabels: ['42-CFR-Part-2'] },
      payload: { encounterRef: `Encounter/${memberId}-restricted`, encounterClass: 'IMP', trigger: 'A01' },
    }),
    // Positive SDOH screen -> screening + causal unmet need.
    c2({
      eventId: `${memberId}-sdoh-pos`, eventType: 'sdoh.screening.completed', memberId,
      occurredAt: '2026-03-01T00:00:00Z',
      payload: { responseRef: `Observation/${memberId}-housing`, domain: 'housing', zCode: { code: 'Z59.0' }, positive: true, provenance: 'community-reported' },
    }),
    // Negative SDOH screen -> screening only, no unmet need.
    c2({
      eventId: `${memberId}-sdoh-neg`, eventType: 'sdoh.screening.completed', memberId,
      occurredAt: '2026-03-02T00:00:00Z',
      payload: { responseRef: `Observation/${memberId}-food`, domain: 'food', zCode: { code: 'Z59.4' }, positive: false },
    }),
    // Care-team assignment.
    c2({
      eventId: `${memberId}-team`, eventType: 'careteam.assigned', memberId,
      occurredAt: '2026-03-05T00:00:00Z',
      payload: { providerRef: `Practitioner/${memberId}-cm`, role: 'care-manager', name: 'CM', organization: 'CHC' },
    }),
  ];
}

async function seededStores(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
  const muts = project(seedFor(memberId), deps);
  const pg = await makePgGraphStore();
  const neo = makeNeo4jFakeStore();
  await pg.apply(muts);
  await neo.apply(muts);
  return { pg, neo };
}

const keys = (r: LensResult) => ({
  nodes: r.nodes.map((n) => `${n.kind}:${n.key}`),
  edges: r.edges.map((e) => `${e.type}:${e.to.key}`),
});

describe('lens acceptance - all five lenses, both backends, identical results', () => {
  it('every lens returns byte-identical results across Postgres and Neo4j', async () => {
    const { pg, neo } = await seededStores();
    for (const name of LENS_NAMES) {
      const onPg = await LENSES[name](pg, 'M1');
      const onNeo = await LENSES[name](neo, 'M1');
      expect(onNeo, `lens ${name} parity`).toEqual(onPg);
    }
  });

  it('exposes exactly the five named lenses', () => {
    expect(LENS_NAMES).toEqual([
      'whole-person', 'care-gap', 'sdoh-barrier', 'care-team', 'part2-restricted',
    ]);
  });

  it('whole-person: member + every non-restricted connected resource', async () => {
    const { pg } = await seededStores();
    const r = keys(await LENSES['whole-person'](pg, 'M1'));
    // Restricted encounter is excluded (no consent scope).
    expect(r.nodes).toContain('Member:M1');
    expect(r.nodes).toContain('Coverage:Coverage/M1');
    expect(r.nodes).not.toContain('Encounter:Encounter/M1-restricted');
    expect(r.edges).toContain('HAS_CARE_TEAM:Practitioner/M1-cm');
  });

  it('care-gap: OPEN encounters + unmet needs only (closed + restricted excluded)', async () => {
    const { pg } = await seededStores();
    const r = keys(await LENSES['care-gap'](pg, 'M1'));
    expect(r.nodes).toContain('Encounter:Encounter/M1-open');
    expect(r.nodes).toContain('SocialNeed:M1:housing');
    expect(r.nodes).not.toContain('Encounter:Encounter/M1-closed'); // discharged
    expect(r.nodes).not.toContain('Encounter:Encounter/M1-restricted'); // no scope
  });

  it('sdoh-barrier: screenings + the causal unmet need', async () => {
    const { pg } = await seededStores();
    const r = keys(await LENSES['sdoh-barrier'](pg, 'M1'));
    expect(r.nodes).toContain('SdohScreening:Observation/M1-housing');
    expect(r.nodes).toContain('SdohScreening:Observation/M1-food');
    expect(r.nodes).toContain('SocialNeed:M1:housing');
    expect(r.edges.filter((e) => e.startsWith('HAS_UNMET_NEED')).length).toBe(1);
  });

  it('care-team: assigned providers only', async () => {
    const { pg } = await seededStores();
    const r = keys(await LENSES['care-team'](pg, 'M1'));
    expect(r.nodes).toEqual(['Member:M1', 'CareTeamMember:Practitioner/M1-cm']);
  });
});

describe('lens Part 2 enforcement - both backends', () => {
  const scoped: ConsentScope = { part2: true };

  it('part2-restricted lens is empty WITHOUT consent scope, on both backends', async () => {
    const { pg, neo } = await seededStores();
    for (const store of [pg, neo]) {
      const r = await part2RestrictedLens(store, 'M1');
      expect(r.nodes).toEqual([]);
      expect(r.edges).toEqual([]);
    }
  });

  it('part2-restricted lens INCLUDES the restricted node WITH consent scope, both backends', async () => {
    const { pg, neo } = await seededStores();
    for (const store of [pg, neo]) {
      const r = await part2RestrictedLens(store, 'M1', scoped);
      expect(r.nodes.map((n) => n.key)).toEqual(['Encounter/M1-restricted']);
      expect(r.nodes[0].restricted).toBe(true);
      expect(r.nodes[0].labels).toContain('42-CFR-Part-2');
      expect(r.edges.map((e) => e.to.key)).toEqual(['Encounter/M1-restricted']);
    }
  });

  it('whole-person surfaces the restricted encounter ONLY with scope (both backends)', async () => {
    const { pg, neo } = await seededStores();
    for (const store of [pg, neo]) {
      const without = await LENSES['whole-person'](store, 'M1');
      const withScope = await LENSES['whole-person'](store, 'M1', scoped as ConsentScope);
      const has = (r: LensResult, k: string) => r.nodes.some((n) => n.key === k);
      expect(has(without, 'Encounter/M1-restricted')).toBe(false);
      expect(has(withScope, 'Encounter/M1-restricted')).toBe(true);
    }
  });

  it('partial scope (wrong segment) still excludes a Part 2 node', async () => {
    const { pg } = await seededStores();
    const r = await part2RestrictedLens(pg, 'M1', { part2: false, segments: ['SOME-OTHER-SEG'] });
    expect(r.nodes).toEqual([]);
  });

  it('scopeCovers FAILS CLOSED for a restricted node with no restricting label (E9)', () => {
    // A node flagged restricted but carrying only its kind + the Restricted marker
    // (no identifiable segment label) must NOT be disclosed under NO_CONSENT: an
    // empty label set previously made `every(...)` vacuously true (fail-open).
    const node = { kind: 'Condition', key: 'X', labels: ['Condition', 'Restricted'], restricted: true } as never;
    expect(scopeCovers(node, { part2: false, segments: [] })).toBe(false);
    expect(scopeCovers(node, { part2: false, segments: ['SOME-SEG'] })).toBe(false);
    // Only an explicit Part 2 (catch-all restricted) grant surfaces it.
    expect(scopeCovers(node, { part2: true, segments: [] })).toBe(true);
  });
});
