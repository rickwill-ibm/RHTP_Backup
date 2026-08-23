/**
 * F3 cross-reference + fragmentation-fix proof (I8A wave A).
 *
 * Proves: the same person across TWO feeds LINKS to one member (not two); a
 * genuinely new source id still mints; an AMBIGUOUS source id fails to HELD, never
 * to a wrong member (E9); link/unlink round-trips; merge emits a rekey event the
 * graph honors by REPLAY (DP-7) and unmerge reverses it; the pg-mem store mirrors
 * the same resolve semantics; production fails closed.
 */
import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import type { C2Event } from '@/lib/outbox';
import { replayEvents } from '@/lib/graph';
import { HeldIdentityError } from '@/lib/pipeline/heldIdentity';
import { mockIdentitySource } from '@/lib/identity/identitySource';
import { resolveEmpi, createXrefEmpiResolver } from '@/lib/identity/empiResolver';
import {
  createXrefIndex,
  createMemoryCrossReferenceStore,
  createPgCrossReferenceStore,
  ensureCrossReferenceSchema,
  getCrossReferenceStore,
  setProductionCrossReferenceStoreFactory,
  CrossReferenceStoreNotConfiguredError,
  type PgLike,
} from '@/lib/identity/crossReference';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

// Deterministic id/time injection so envelopes are reproducible without globals.
function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const deps = () => ({ now: () => 1_700_000_000_000, rng: seededRng() });

/** A minimal valid coverage.enrolled domain event that projects a Member node. */
function coverageEvent(memberId: string): C2Event {
  return {
    eventId: `${memberId}-cov`,
    eventType: 'coverage.enrolled',
    eventVersion: '1.0',
    occurredAt: '2026-01-01T00:00:00Z',
    recordedAt: '2026-01-01T00:00:00Z',
    memberId,
    partitionKey: memberId,
    class: 'batch',
    sequence: 0,
    correlationId: 'corr-1',
    idempotencyKey: `idem-${memberId}`,
    source: { system: 'sys', feed: 'feed', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload: { coverageRef: `Coverage/${memberId}`, planCode: 'PLAN-A', periodStart: '2026-01-01', status: 'active' },
  };
}

function memberNodeKeys(muts: ReturnType<typeof replayEvents>): string[] {
  return muts
    .filter((m) => m.op === 'UpsertNode' && m.kind === 'Member')
    .map((m) => (m.op === 'UpsertNode' ? m.key : ''));
}

describe('F3 fragmentation fix: same person across two feeds links to ONE member', () => {
  it('an id-only record whose source id is already linked resolves to the EXISTING member', () => {
    const xref = createXrefIndex(deps());
    const resolve = createXrefEmpiResolver(xref, mockIdentitySource);

    // Feed A first sees source id 'src-X' (id-only): mints and records the link.
    const feedA = resolve('src-X', { feed: 'feed-a' });
    // Feed B sends the SAME source id (id-only): must resolve to feed A's member.
    const feedB = resolve('src-X', { feed: 'feed-b' });

    expect(feedB).toBe(feedA); // ONE member, not two — fragmentation closed.
  });

  it('a genuinely new source id still mints a distinct member', () => {
    const xref = createXrefIndex(deps());
    const resolve = createXrefEmpiResolver(xref, mockIdentitySource);
    const a = resolve('src-X', { feed: 'feed-a' });
    const b = resolve('src-Y', { feed: 'feed-b' });
    expect(b).not.toBe(a);
  });

  it('resolveEmpi returns a link intent on a fresh mint and links back on the next lookup', () => {
    const xref = createXrefIndex(deps());
    const first = resolveEmpi('src-Z', { feed: 'f' }, mockIdentitySource, xref);
    expect(first.outcome).toBe('minted');
    expect(first.link).toEqual({ sourceId: 'src-Z', memberId: first.memberId });
    // record it, then a second id-only lookup resolves to the same member.
    xref.link(first.link!.sourceId, first.link!.memberId);
    const second = resolveEmpi('src-Z', { feed: 'f2' }, mockIdentitySource, xref);
    expect(second.outcome).toBe('linked');
    expect(second.memberId).toBe(first.memberId);
  });
});

describe('E9: an ambiguous source id fails to HELD, never to a wrong member', () => {
  it('two distinct unmerged members claiming one source id -> HELD (resolveEmpi)', () => {
    const xref = createXrefIndex(deps());
    xref.link('src-amb', 'mem-A');
    xref.link('src-amb', 'mem-B'); // distinct, no merge relating them
    const res = resolveEmpi('src-amb', { feed: 'f' }, mockIdentitySource, xref);
    expect(res.outcome).toBe('held');
    expect(res.reasonCode).toBe('identity-xref-ambiguous');
    expect(res.memberId).toBe(''); // never picks A or B
    expect(res.memberId).not.toBe('mem-A');
    expect(res.memberId).not.toBe('mem-B');
  });

  it('the wired resolver THROWS HeldIdentityError on ambiguity (routes to review)', () => {
    const xref = createXrefIndex(deps());
    xref.link('src-amb', 'mem-A');
    xref.link('src-amb', 'mem-B');
    const resolve = createXrefEmpiResolver(xref, mockIdentitySource);
    expect(() => resolve('src-amb', { feed: 'f' })).toThrow(HeldIdentityError);
  });

  it('merging the two members RESOLVES the ambiguity to the survivor', () => {
    const xref = createXrefIndex(deps());
    xref.link('src-amb', 'mem-A');
    xref.link('src-amb', 'mem-B');
    xref.merge('mem-A', 'mem-B'); // survivor mem-A subsumes mem-B
    expect(xref.lookup('src-amb')).toEqual({ status: 'linked', memberId: 'mem-A' });
  });
});

describe('link / unlink round-trip', () => {
  it('link then lookup resolves; unlink then lookup is unlinked', async () => {
    const store = createMemoryCrossReferenceStore(deps());
    const linked = await store.link('s1', 'm1', 'feed-a');
    expect(linked.eventType).toBe('identity.xref-linked');
    expect(await store.lookup('s1')).toEqual({ status: 'linked', memberId: 'm1' });

    const unlinked = await store.unlink('s1', 'm1');
    expect(unlinked.eventType).toBe('identity.xref-unlinked');
    expect(await store.lookup('s1')).toEqual({ status: 'unlinked' });
  });
});

describe('merge/unmerge emit rekey events the graph honors by REPLAY (DP-7)', () => {
  it('merge emits member.merged and rekeys the subsumed subgraph onto the survivor', async () => {
    const store = createMemoryCrossReferenceStore(deps());
    const mergeEvt = await store.merge('SURV', 'DUP');
    expect(mergeEvt.eventType).toBe('member.merged');
    expect(mergeEvt.payload).toMatchObject({ survivingMemberId: 'SURV', mergedMemberId: 'DUP' });

    const muts = replayEvents([coverageEvent('DUP'), mergeEvt], { now: () => 1 });
    const keys = memberNodeKeys(muts);
    expect(keys).toContain('SURV');
    expect(keys).not.toContain('DUP'); // subsumed id rekeyed to survivor
  });

  it('unmerge emits member.unmerged and reverses the rekey on replay', async () => {
    const store = createMemoryCrossReferenceStore(deps());
    const mergeEvt = await store.merge('SURV', 'DUP');
    const unmergeEvt = await store.unmerge('SURV', 'DUP');
    expect(unmergeEvt.eventType).toBe('member.unmerged');

    const muts = replayEvents([coverageEvent('DUP'), mergeEvt, unmergeEvt], { now: () => 1 });
    const keys = memberNodeKeys(muts);
    expect(keys).toContain('DUP'); // split back out — the merge is reversed
    expect(keys).not.toContain('SURV');
  });
});

describe('pg-mem store mirrors the resolve/merge semantics', () => {
  async function makePgStore() {
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    const pool = new Pool() as unknown as PgLike;
    await ensureCrossReferenceSchema(pool);
    return createPgCrossReferenceStore(pool, 'pg-xref', deps());
  }

  it('link/lookup round-trips and lookup follows a merge to the survivor', async () => {
    const pg = await makePgStore();
    await pg.link('s1', 'm1');
    expect(await pg.lookup('s1')).toEqual({ status: 'linked', memberId: 'm1' });

    await pg.link('s2', 'm2');
    await pg.merge('m1', 'm2'); // m1 survives, subsumes m2
    expect(await pg.lookup('s2')).toEqual({ status: 'linked', memberId: 'm1' });

    await pg.unlink('s1', 'm1');
    expect(await pg.lookup('s1')).toEqual({ status: 'unlinked' });
  });

  it('the pg store surfaces ambiguity identically (E9)', async () => {
    const pg = await makePgStore();
    await pg.link('sx', 'mA');
    await pg.link('sx', 'mB');
    expect(await pg.lookup('sx')).toEqual({ status: 'ambiguous', memberIds: ['mA', 'mB'] });
  });
});

describe('E1: the crossReference seam fails closed in production', () => {
  it('production with no registered factory throws; mock returns the in-memory store', () => {
    setProductionCrossReferenceStoreFactory(null);
    setSessionDataMode('crossReference', 'production');
    expect(() => getCrossReferenceStore()).toThrow(CrossReferenceStoreNotConfiguredError);
    setSessionDataMode('crossReference', 'mock');
    expect(getCrossReferenceStore()).toBeTruthy();
    clearSessionDataModes();
  });
});
