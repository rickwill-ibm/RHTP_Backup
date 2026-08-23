import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import {
  type GraphStore,
  MERGE_EVENT,
  UNMERGE_EVENT,
  project,
  replayEvents,
  replayToStore,
  resolveIdentity,
} from '@/lib/graph';
import { c2, fixedNow, makeNeo4jFakeStore, makePgGraphStore } from './helpers';

/**
 * REBUILD-FROM-REPLAY (DP-1) + MERGE/UNMERGE REKEY (DP-7), both proven on BOTH
 * backends. Identity merge is handled by REPLAY (no in-place key rewrite): a
 * member.merged event rekeys the subsumed member's subgraph to the survivor when
 * the stream is re-projected, and member.unmerged reverses it.
 */
const deps = { now: fixedNow };

function domainStream(memberId: string): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-cov`, eventType: 'coverage.enrolled', memberId,
      occurredAt: '2026-01-01T00:00:00Z',
      payload: { coverageRef: `Coverage/${memberId}`, planCode: 'PLAN', status: 'active', periodStart: '2026-01-01' },
    }),
    c2({
      eventId: `${memberId}-sdoh`, eventType: 'sdoh.screening.completed', memberId,
      occurredAt: '2026-03-01T00:00:00Z',
      payload: { responseRef: `Observation/${memberId}-h`, domain: 'housing', zCode: { code: 'Z59.0' }, positive: true, provenance: 'chc' },
    }),
    c2({
      eventId: `${memberId}-team`, eventType: 'careteam.assigned', memberId,
      occurredAt: '2026-03-05T00:00:00Z',
      payload: { providerRef: `Practitioner/${memberId}-cm`, role: 'care-manager' },
    }),
  ];
}

async function snapshot(store: GraphStore) {
  return { nodes: await store.listNodes(), edges: await store.listEdges() };
}

const backends: Array<[string, () => Promise<GraphStore>]> = [
  ['postgres (pg-mem)', () => makePgGraphStore()],
  ['neo4j (fake)', async () => makeNeo4jFakeStore()],
];

describe.each(backends)('rebuild-from-replay [%s]', (_name, make) => {
  it('replaying the same stream onto a fresh (wiped) store rebuilds an identical graph', async () => {
    const stream = domainStream('M1');

    const first = await make();
    await replayToStore(first, stream, deps);
    const original = await snapshot(first);

    // Wipe == a fresh store; replay the SAME stream.
    const rebuilt = await make();
    await replayToStore(rebuilt, stream, deps);
    expect(await snapshot(rebuilt)).toEqual(original);
  });

  it('replay is idempotent: applying the stream twice equals applying it once', async () => {
    const stream = domainStream('M1');
    const store = await make();
    await replayToStore(store, stream, deps);
    const once = await snapshot(store);
    await replayToStore(store, stream, deps);
    expect(await snapshot(store)).toEqual(once);
  });
});

describe('cross-backend replay parity', () => {
  it('postgres and neo4j-fake produce equal graphs from the same replay', async () => {
    const stream = domainStream('M1');
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await replayToStore(pg, stream, deps);
    await replayToStore(neo, stream, deps);
    expect(await snapshot(neo)).toEqual(await snapshot(pg));
  });
});

// ── DP-7 merge / unmerge rekey ─────────────────────────────────────────────────

function mergeEvent(surviving: string, merged: string): C2Event {
  return c2({
    eventId: `merge-${merged}-${surviving}`, eventType: MERGE_EVENT, memberId: surviving,
    occurredAt: '2026-04-01T00:00:00Z',
    payload: { survivingMemberId: surviving, mergedMemberId: merged },
  });
}
function unmergeEvent(surviving: string, merged: string): C2Event {
  return c2({
    eventId: `unmerge-${merged}-${surviving}`, eventType: UNMERGE_EVENT, memberId: surviving,
    occurredAt: '2026-05-01T00:00:00Z',
    payload: { survivingMemberId: surviving, mergedMemberId: merged },
  });
}

describe('resolveIdentity folds merge/unmerge control events', () => {
  it('a merge maps the subsumed id to the survivor; unmerge removes it', () => {
    const merged = resolveIdentity([mergeEvent('SURV', 'DUP')]);
    expect(merged.get('DUP')).toBe('SURV');
    const reversed = resolveIdentity([mergeEvent('SURV', 'DUP'), unmergeEvent('SURV', 'DUP')]);
    expect(reversed.has('DUP')).toBe(false);
  });

  it('compresses a merge chain A->B, B->C to A->C', () => {
    const map = resolveIdentity([mergeEvent('B', 'A'), mergeEvent('C', 'B')]);
    expect(map.get('A')).toBe('C');
    expect(map.get('B')).toBe('C');
  });
});

describe.each(backends)('merge/unmerge rekey by replay [%s]', (_name, make) => {
  const stream = [
    ...domainStream('SURV'),
    ...domainStream('DUP'),
    mergeEvent('SURV', 'DUP'),
  ];

  it('a merge event rekeys the subsumed member subgraph onto the survivor (no orphan member)', async () => {
    const store = await make();
    await replayToStore(store, stream, deps);

    // The subsumed Member node no longer exists - it rekeyed to the survivor.
    expect(await store.getNode('Member', 'DUP')).toBeNull();
    expect((await store.getNode('Member', 'SURV'))?.key).toBe('SURV');

    // The survivor now carries BOTH sources' coverage (survivorship keeps
    // source-attributed facts), both linked from the survivor member.
    const covEdges = await store.listEdges({ type: 'HAS_COVERAGE', fromKey: 'SURV' });
    expect(covEdges.map((e) => e.to.key).sort()).toEqual(['Coverage/DUP', 'Coverage/SURV']);
    // No coverage edge dangles from the merged id.
    expect(await store.listEdges({ type: 'HAS_COVERAGE', fromKey: 'DUP' })).toEqual([]);

    // Member-keyed nodes (SocialNeed key = memberId:domain) coalesce onto survivor.
    expect(await store.getNode('SocialNeed', 'SURV:housing')).not.toBeNull();
    expect(await store.getNode('SocialNeed', 'DUP:housing')).toBeNull();
    const needEdges = await store.listEdges({ type: 'HAS_UNMET_NEED', fromKey: 'SURV' });
    expect(needEdges.map((e) => e.to.key)).toEqual(['SURV:housing']);
    expect(needEdges[0].causal).toBe(true); // provenance preserved through rekey
  });

  it('unmerge reverses the merge: replaying with the unmerge event splits them again', async () => {
    const merged = await make();
    await replayToStore(merged, stream, deps);

    const unmerged = await make();
    await replayToStore(unmerged, [...stream, unmergeEvent('SURV', 'DUP')], deps);

    // The subsumed member is whole again, with its own coverage.
    expect(await unmerged.getNode('Member', 'DUP')).not.toBeNull();
    expect((await unmerged.listEdges({ type: 'HAS_COVERAGE', fromKey: 'DUP' })).map((e) => e.to.key))
      .toEqual(['Coverage/DUP']);
    // And the survivor is back to only its own coverage.
    expect((await unmerged.listEdges({ type: 'HAS_COVERAGE', fromKey: 'SURV' })).map((e) => e.to.key))
      .toEqual(['Coverage/SURV']);

    // The unmerged graph equals the graph of the two members with no merge at all.
    const noMerge = await make();
    await replayToStore(noMerge, [...domainStream('SURV'), ...domainStream('DUP')], deps);
    expect(await snapshot(unmerged)).toEqual(await snapshot(noMerge));
  });

  it('the identity control events emit no graph mutations of their own', () => {
    const muts = project([mergeEvent('SURV', 'DUP'), unmergeEvent('SURV', 'DUP')], deps);
    expect(muts).toEqual([]);
  });
});

describe('merge/unmerge is cross-backend identical', () => {
  it('the merged graph is byte-identical across Postgres and Neo4j', async () => {
    const stream = [...domainStream('SURV'), ...domainStream('DUP'), mergeEvent('SURV', 'DUP')];
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await replayToStore(pg, stream, deps);
    await replayToStore(neo, stream, deps);
    expect(await snapshot(neo)).toEqual(await snapshot(pg));
  });
});

describe('replayEvents is a pure projection function', () => {
  it('resolves identity, rekeys, and projects in one call', () => {
    const muts = replayEvents([...domainStream('DUP'), mergeEvent('SURV', 'DUP')], deps);
    // Every emitted Member node is the survivor; the subsumed id never appears.
    const memberKeys = muts
      .filter((m) => m.op === 'UpsertNode' && m.kind === 'Member')
      .map((m) => (m.op === 'UpsertNode' ? m.key : ''));
    expect(memberKeys.every((k) => k === 'SURV')).toBe(true);
    expect(memberKeys).not.toContain('DUP');
  });
});
