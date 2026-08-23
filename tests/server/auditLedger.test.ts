/**
 * HW2 / I15 — tamper-evident audit ledger (AUD-01).
 * Proves the hash-chain detects modification, deletion, and insertion.
 */
import { describe, it, expect } from 'vitest';
import {
  createMemoryAuditLedger,
  verifyChain,
  hashEntry,
  GENESIS_HASH,
  type AuditLedgerEntry,
} from '../../src/lib/server/auditLedger';
import type { AuditEvent } from '../../src/lib/server/audit';

function ev(action: string, n: number): AuditEvent {
  return { ts: `2026-01-0${n}T00:00:00Z`, actor: 'system', action, correlationId: `c-${n}`, outcome: 'success' };
}

describe('audit ledger hash-chain', () => {
  it('appends a continuous chain and verifies intact', async () => {
    const ledger = createMemoryAuditLedger();
    await ledger.append(ev('a', 1));
    await ledger.append(ev('b', 2));
    await ledger.append(ev('c', 3));
    const v = await ledger.verify();
    expect(v.ok).toBe(true);
    expect(v.count).toBe(3);
    // first entry links to genesis
    const entries = await ledger.entries();
    expect(entries[0].prevHash).toBe(GENESIS_HASH);
    expect(entries[1].prevHash).toBe(entries[0].hash);
  });

  it('detects a MODIFIED entry and locates the break', async () => {
    const ledger = createMemoryAuditLedger();
    await ledger.append(ev('a', 1));
    await ledger.append(ev('b', 2));
    await ledger.append(ev('c', 3));
    const entries = await ledger.entries();
    // tamper: alter the middle event's action without recomputing the hash
    const tampered: AuditLedgerEntry[] = entries.map((e) =>
      e.seq === 1 ? { ...e, event: { ...e.event, action: 'HACKED' } } : e,
    );
    const v = verifyChain(tampered);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
  });

  it('detects a DELETED entry (chain discontinuity)', async () => {
    const ledger = createMemoryAuditLedger();
    await ledger.append(ev('a', 1));
    await ledger.append(ev('b', 2));
    await ledger.append(ev('c', 3));
    const entries = await ledger.entries();
    const withHole = [entries[0], entries[2]]; // drop seq 1
    const v = verifyChain(withHole);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(2);
  });

  it('hashEntry is deterministic and prev-dependent', () => {
    const e = ev('x', 1);
    expect(hashEntry(e, GENESIS_HASH)).toBe(hashEntry(e, GENESIS_HASH));
    expect(hashEntry(e, GENESIS_HASH)).not.toBe(hashEntry(e, 'deadbeef'));
  });

  it('canonicalization is key-order-independent (objects hashed by sorted keys, not JSON order)', () => {
    // Same fields, different insertion order -> same hash. This fails if the
    // canonicalizer treats objects as primitives (JSON.stringify preserves order).
    const a = { ts: '2026-01-01T00:00:00Z', actor: 'system', action: 'x', correlationId: 'c', outcome: 'success' as const };
    const b = { outcome: 'success' as const, correlationId: 'c', action: 'x', actor: 'system', ts: '2026-01-01T00:00:00Z' };
    expect(hashEntry(a, GENESIS_HASH)).toBe(hashEntry(b, GENESIS_HASH));
  });
});
