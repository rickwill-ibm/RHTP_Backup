import { describe, it, expect } from 'vitest';
import { project, projectEvent, type Mutation, type UpsertEdge } from '@/lib/graph';
import { c2, fixedNow, makeNeo4jFakeStore, makePgGraphStore } from './helpers';

const deps = { now: fixedNow };

function edges(muts: Mutation[]): UpsertEdge[] {
  return muts.filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
}

describe('projector emits the neutral instruction set (no SQL/Cypher)', () => {
  it('coverage.enrolled -> Member + Coverage + dated associative HAS_COVERAGE', () => {
    const muts = projectEvent(c2(), deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Member')).toBe(true);
    const e = edges(muts).find((m) => m.type === 'HAS_COVERAGE')!;
    expect(e.semantics.kind).toBe('associative');
    expect(e.validity.start).toBe('2026-01-01');
  });

  it('encounter with a Part 2 label -> RESTRICTED node carrying the segmentation label', () => {
    const muts = projectEvent(
      c2({
        eventType: 'encounter.admitted',
        memberId: 'M2',
        consentContext: { part2Restricted: true, segmentLabels: ['42-CFR-Part-2'] },
        payload: { encounterRef: 'Encounter/e9', encounterClass: 'IMP', trigger: 'A01' },
      }),
      deps,
    );
    const node = muts.find((m) => m.op === 'UpsertNode' && m.kind === 'Encounter');
    expect(node && node.op === 'UpsertNode' && node.restricted).toBe(true);
    const labels = muts.filter((m) => m.op === 'SetLabel').map((m) => m.op === 'SetLabel' && m.label);
    expect(labels).toContain('Restricted');
    expect(labels).toContain('42-CFR-Part-2');
  });

  it('positive SDOH screen -> CAUSAL HAS_UNMET_NEED with asserter + basis provenance', () => {
    const muts = projectEvent(
      c2({
        eventType: 'sdoh.screening.completed',
        memberId: 'M3',
        payload: {
          responseRef: 'Observation/o1', domain: 'housing',
          zCode: { code: 'Z59.0' }, positive: true, provenance: 'community-reported',
        },
      }),
      deps,
    );
    const causalEdge = edges(muts).find((m) => m.type === 'HAS_UNMET_NEED')!;
    expect(causalEdge.semantics).toEqual({
      kind: 'causal', asserter: 'community-reported', basis: 'Z59.0@Observation/o1',
    });
    // A negative screen asserts no need.
    const neg = projectEvent(
      c2({ eventType: 'sdoh.screening.completed', payload: { responseRef: 'Observation/o2', domain: 'food', zCode: { code: 'Z59.4' }, positive: false } }),
      deps,
    );
    expect(edges(neg).some((m) => m.type === 'HAS_UNMET_NEED')).toBe(false);
  });

  it('is deterministic: same events + clock -> identical mutations', () => {
    const events = [c2(), c2({ eventType: 'encounter.admitted', payload: { encounterRef: 'Encounter/e1' } })];
    expect(project(events, deps)).toEqual(project(events, deps));
  });

  it('skips unmapped event types', () => {
    expect(projectEvent(c2({ eventType: 'unknown.thing' }), deps)).toEqual([]);
  });
});

describe('rebuild-from-replay: projecting the event log rebuilds the identical graph', () => {
  const log = [
    c2({ memberId: 'M1', eventType: 'coverage.enrolled', payload: { coverageRef: 'Coverage/c1', planCode: 'PLAN-A', periodStart: '2026-01-01', status: 'active' } }),
    c2({ memberId: 'M1', eventType: 'encounter.admitted', occurredAt: '2026-02-01T00:00:00Z', payload: { encounterRef: 'Encounter/e1', encounterClass: 'IMP', trigger: 'A01' } }),
    c2({ memberId: 'M1', eventType: 'sdoh.screening.completed', occurredAt: '2026-03-01T00:00:00Z', payload: { responseRef: 'Observation/o1', domain: 'housing', zCode: { code: 'Z59.0' }, positive: true, provenance: 'community-reported' } }),
  ];

  it('replaying twice into a store yields the same nodes and edges (idempotent)', async () => {
    const store = await makePgGraphStore();
    await store.apply(project(log, deps));
    const first = { nodes: await store.listNodes(), edges: await store.listEdges() };
    await store.apply(project(log, deps)); // full replay
    const second = { nodes: await store.listNodes(), edges: await store.listEdges() };
    expect(second).toEqual(first);
    expect(first.nodes.map((n) => n.kind).sort()).toEqual(['Coverage', 'Encounter', 'Member', 'SdohScreening', 'SocialNeed']);
  });

  it('both backends rebuild the identical graph from the same replay', async () => {
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    const muts = project(log, deps);
    await pg.apply(muts);
    await neo.apply(muts);
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });
});
