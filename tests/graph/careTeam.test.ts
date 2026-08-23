import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import {
  LENSES,
  type GraphStore,
  project,
  projectEvent,
  type Mutation,
  type UpsertEdge,
} from '@/lib/graph';
import { c2, fixedNow, makeNeo4jFakeStore, makePgGraphStore } from './helpers';

const deps = { now: fixedNow };

function edges(muts: Mutation[]): UpsertEdge[] {
  return muts.filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
}

/** A pipeline-fed care-team: a Practitioner + a non-practitioner CareTeamMember. */
function careTeamStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-ct`, eventType: 'care-team.formed', memberId,
      occurredAt: '2026-03-01T00:00:00Z',
      payload: {
        careTeamRef: `CareTeam/${memberId}-ct`,
        status: 'active', category: 'longitudinal',
        periodStart: '2026-03-01', periodEnd: null,
        participants: [
          { participantRef: `Practitioner/${memberId}-pcp`, kind: 'Practitioner', role: 'primary-care-physician' },
          { participantRef: `CareManager/${memberId}-cm`, kind: 'CareTeamMember', role: 'care-manager' },
        ],
      },
    }),
  ];
}

describe('care-team projector emits the neutral instruction set (pipeline-fed)', () => {
  it('care-team.formed -> CareTeam + participants with CARE_TEAM_FOR / MEMBER_OF_CARE_TEAM / HAS_CARE_TEAM', () => {
    const muts = projectEvent(careTeamStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'CareTeam')).toBe(true);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'CareTeamMember')).toBe(true);
    // A Practitioner-referenced participant REUSES the shared Practitioner node kind.
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Practitioner')).toBe(true);

    const forEdge = edges(muts).find((m) => m.type === 'CARE_TEAM_FOR')!;
    expect(forEdge.from).toEqual({ kind: 'CareTeam', key: 'CareTeam/M1-ct' });
    expect(forEdge.to).toEqual({ kind: 'Member', key: 'M1' });
    expect(forEdge.semantics.kind).toBe('associative');
    expect(forEdge.validity.start).toBe('2026-03-01');

    const memberOf = edges(muts).filter((m) => m.type === 'MEMBER_OF_CARE_TEAM');
    expect(memberOf.map((e) => e.to.key)).toEqual(['CareTeam/M1-ct', 'CareTeam/M1-ct']);
    // HAS_CARE_TEAM is reused off the member so the existing care-team lens surfaces it.
    const hasTeam = edges(muts).filter((m) => m.type === 'HAS_CARE_TEAM');
    expect(hasTeam.map((e) => e.to.key).sort()).toEqual(['CareManager/M1-cm', 'Practitioner/M1-pcp']);
  });
});

describe('care-team projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(careTeamStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected care-team nodes + edges', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['CareTeam', 'CareTeamMember', 'Member', 'Practitioner']);
    const edgeTypes = (await pg.listEdges()).map((e) => e.type).sort();
    expect(edgeTypes).toEqual(['CARE_TEAM_FOR', 'HAS_CARE_TEAM', 'HAS_CARE_TEAM', 'MEMBER_OF_CARE_TEAM', 'MEMBER_OF_CARE_TEAM']);
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(careTeamStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('the existing care-team lens now surfaces pipeline-fed participants', () => {
  it('care-team lens returns the roster off the member, both backends', async () => {
    const muts = project(careTeamStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['care-team'](store, 'M1');
      const keys = r.nodes.map((n) => `${n.kind}:${n.key}`);
      expect(keys).toContain('Practitioner:Practitioner/M1-pcp');
      expect(keys).toContain('CareTeamMember:CareManager/M1-cm');
      // whole-person surfaces the same roster via HAS_CARE_TEAM.
      const wp = await LENSES['whole-person'](store, 'M1');
      expect(wp.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('HAS_CARE_TEAM:Practitioner/M1-pcp');
    }
  });
});
