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

/** A member's care-plan: one Goal, a Task on that Goal, and a free-standing Task. */
function goalTaskStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-g1`, eventType: 'goal.recorded', memberId,
      occurredAt: '2026-02-01T00:00:00Z',
      payload: {
        goalRef: `Goal/${memberId}-g1`, code: '443402002',
        lifecycleStatus: 'active', startDate: '2026-02-01', dueDate: '2026-08-01',
      },
    }),
    c2({
      eventId: `${memberId}-t1`, eventType: 'task.recorded', memberId,
      occurredAt: '2026-02-05T00:00:00Z',
      payload: {
        taskRef: `Task/${memberId}-t1`, code: 'schedule-visit',
        status: 'requested', goalRef: `Goal/${memberId}-g1`, authoredOn: '2026-02-05',
      },
    }),
    c2({
      eventId: `${memberId}-t2`, eventType: 'task.recorded', memberId,
      occurredAt: '2026-02-10T00:00:00Z',
      payload: {
        taskRef: `Task/${memberId}-t2`, code: 'outreach-call',
        status: 'in-progress', goalRef: '', authoredOn: '2026-02-10',
      },
    }),
  ];
}

describe('goals/tasks projector emits the neutral instruction set', () => {
  it('goal.recorded -> Member + Goal + dated associative HAS_GOAL', () => {
    const muts = projectEvent(goalTaskStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Goal')).toBe(true);
    const e = edges(muts).find((m) => m.type === 'HAS_GOAL')!;
    expect(e.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(e.to).toEqual({ kind: 'Goal', key: 'Goal/M1-g1' });
    expect(e.semantics.kind).toBe('associative');
    expect(e.validity.start).toBe('2026-02-01');
  });

  it('task.recorded attaches HAS_TASK to its Goal, or to the Member when free-standing', () => {
    const onGoal = edges(projectEvent(goalTaskStream('M1')[1], deps)).find((m) => m.type === 'HAS_TASK')!;
    expect(onGoal.from).toEqual({ kind: 'Goal', key: 'Goal/M1-g1' });
    expect(onGoal.to).toEqual({ kind: 'Task', key: 'Task/M1-t1' });
    expect(onGoal.validity.start).toBe('2026-02-05');

    const onMember = edges(projectEvent(goalTaskStream('M1')[2], deps)).find((m) => m.type === 'HAS_TASK')!;
    expect(onMember.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(onMember.to).toEqual({ kind: 'Task', key: 'Task/M1-t2' });
  });
});

describe('goals/tasks projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(goalTaskStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected goal + task nodes + edges', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['Goal', 'Member', 'Task', 'Task']);
    const edgeTypes = (await pg.listEdges()).map((e) => e.type).sort();
    expect(edgeTypes).toEqual(['HAS_GOAL', 'HAS_TASK', 'HAS_TASK']);
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(goalTaskStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces goals/tasks', () => {
  it('whole-person surfaces the Goal + free-standing Task off the member, both backends', async () => {
    const muts = project(goalTaskStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      const keys = r.nodes.map((n) => `${n.kind}:${n.key}`);
      expect(keys).toContain('Goal:Goal/M1-g1');
      expect(keys).toContain('Task:Task/M1-t2');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('HAS_GOAL:Goal/M1-g1');
    }
  });
});
