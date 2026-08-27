/**
 * Ledger tests (S0) with red-team regressions: defensive-copy entries(), truncation
 * detection against a head checkpoint, injective parents hashing, and rejection of
 * non-serializable (undefined) bodies. Tamper cases verify an explicit (tampered) array via
 * verifyLedger, since entries() now returns deep copies.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryLedger, verifyLedger, LedgerError } from '@/lib/policy/audit/ledger';

const clock = () => '2026-01-01T00:00:00.000Z';

describe('ledger — chaining & content addressing', () => {
  it('chains entries and records DAG parents', () => {
    const l = new InMemoryLedger(clock);
    const a = l.append('SourceDocRecord', { docId: 'd1' }, 'ingest');
    const b = l.append('ExtractionRecord', { docId: 'd1' }, 'extractor', [a.ledgerId]);
    expect(a.prevHash).toBeNull();
    expect(b.prevHash).toBe(a.entryHash);
    expect(b.parents).toEqual([a.ledgerId]);
    expect(l.get(a.ledgerId)?.kind).toBe('SourceDocRecord');
  });

  it('is content-addressed: equal bodies hash equal regardless of key order', () => {
    const l = new InMemoryLedger(clock);
    expect(l.append('X', { a: 1, b: 2 }, 'x').bodyHash).toBe(
      l.append('X', { b: 2, a: 1 }, 'x').bodyHash
    );
  });

  it('verifies a clean ledger and against its own head checkpoint', () => {
    const l = new InMemoryLedger(clock);
    l.append('A', { n: 1 }, 'x');
    l.append('B', { n: 2 }, 'x');
    expect(l.verify()).toEqual({ ok: true });
    expect(l.verify(l.head())).toEqual({ ok: true });
  });
});

describe('ledger — tamper & truncation evidence', () => {
  it('detects a mutated body at the exact index', () => {
    const l = new InMemoryLedger(clock);
    l.append('A', { n: 1 }, 'x');
    l.append('B', { n: 2 }, 'x');
    const t = l.entries();
    t[1].body = { n: 999 };
    expect(verifyLedger(t)).toMatchObject({ ok: false, brokenAt: 1, reason: 'body-tampered' });
  });

  it('detects a severed chain link', () => {
    const l = new InMemoryLedger(clock);
    l.append('A', { n: 1 }, 'x');
    l.append('B', { n: 2 }, 'x');
    const t = l.entries();
    t[1].prevHash = 'deadbeef';
    expect(verifyLedger(t)).toMatchObject({ ok: false, brokenAt: 1, reason: 'chain-broken' });
  });

  it('detects a forged entryHash', () => {
    const l = new InMemoryLedger(clock);
    l.append('A', { n: 1 }, 'x');
    const t = l.entries();
    t[0].entryHash = 'f'.repeat(64);
    expect(verifyLedger(t)).toMatchObject({
      ok: false,
      brokenAt: 0,
      reason: 'entry-hash-mismatch',
    });
  });

  it('REGRESSION: entries() is a defensive copy — external mutation cannot touch the chain', () => {
    const l = new InMemoryLedger(clock);
    l.append('A', { n: 1 }, 'x');
    l.entries()[0].body = { n: 999 };
    expect(l.verify()).toEqual({ ok: true });
  });

  it('REGRESSION: detects tail truncation/rollback against a head checkpoint', () => {
    const l = new InMemoryLedger(clock);
    l.append('A', { n: 1 }, 'x');
    l.append('B', { n: 2 }, 'x');
    l.append('C', { n: 3 }, 'x');
    const checkpoint = l.head();
    const truncated = l.entries().slice(0, -1);
    expect(verifyLedger(truncated, checkpoint)).toMatchObject({
      ok: false,
      reason: 'count-mismatch',
    });
  });

  it('REGRESSION: parents cannot be tampered via delimiter ambiguity (injective hash)', () => {
    const l = new InMemoryLedger(clock);
    l.append('P', { n: 1 }, 'x', ['0:aaaa', '1:bbbb']);
    const t = l.entries();
    t[0].parents = ['0:aaaa,1:bbbb'];
    expect(verifyLedger(t)).toMatchObject({ ok: false, reason: 'entry-hash-mismatch' });
  });
});

describe('ledger — non-serializable bodies fail loudly', () => {
  it('REGRESSION: rejects undefined values / bodies with a typed LedgerError', () => {
    const l = new InMemoryLedger(clock);
    expect(() => l.append('X', { a: undefined }, 'x')).toThrow(LedgerError);
    expect(() => l.append('X', undefined, 'x')).toThrow(LedgerError);
  });
});
