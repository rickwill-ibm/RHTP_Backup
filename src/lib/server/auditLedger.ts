/**
 * Tamper-evident audit ledger (HW2 / I15, AUD-01).
 *
 * The base audit trail (audit.ts) appends PHI-safe events to a JSONL sink — but a
 * file can be edited, truncated, or re-ordered with no trace. A payer audit trail
 * must be TAMPER-EVIDENT: any modification, deletion, or insertion is detectable.
 *
 * This adds a hash CHAIN over the same PHI-safe events: entry N stores
 * hash = SHA-256(canonical(event) || prevHash). Removing, altering, or inserting
 * an entry breaks the chain from that point on, which verify() detects and locates.
 *
 * In-memory default (demo/mock, zero backend, per-process chain); a durable factory
 * can be registered for production (append-only pg table with an immutability
 * trigger, like the evidence ledger). Fail-closed: production with no durable
 * factory THROWS rather than presenting a per-process Map as a durable ledger.
 */
import { createHash } from 'node:crypto';
import type { AuditEvent } from './audit';

export interface AuditLedgerEntry {
  seq: number;
  event: AuditEvent;
  prevHash: string;
  hash: string;
}

export interface LedgerVerification {
  ok: boolean;
  /** The seq at which the chain first breaks, when ok=false. */
  brokenAt?: number;
  count: number;
}

export interface AuditLedger {
  readonly id: string;
  append(event: AuditEvent): Promise<AuditLedgerEntry>;
  entries(): Promise<AuditLedgerEntry[]>;
  /** The current chain head hash (the hash of the last entry, or GENESIS). */
  head(): Promise<string>;
  /** Recompute the chain and report the first tampered entry, if any. */
  verify(): Promise<LedgerVerification>;
}

export const GENESIS_HASH = '0'.repeat(64);

/** Canonical JSON (sorted keys) so hashing is stable regardless of field order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** hash = SHA-256(canonical(event) || prevHash). */
export function hashEntry(event: AuditEvent, prevHash: string): string {
  return createHash('sha256').update(canonical(event)).update('|').update(prevHash).digest('hex');
}

/** Verify a chain of entries independently of any store. */
export function verifyChain(entries: AuditLedgerEntry[]): LedgerVerification {
  let prev = GENESIS_HASH;
  for (const e of entries) {
    const expected = hashEntry(e.event, prev);
    if (e.prevHash !== prev || e.hash !== expected) {
      return { ok: false, brokenAt: e.seq, count: entries.length };
    }
    prev = e.hash;
  }
  return { ok: true, count: entries.length };
}

/** In-memory tamper-evident ledger — the demo/mock default. */
export function createMemoryAuditLedger(id = 'mock-audit-ledger'): AuditLedger {
  const chain: AuditLedgerEntry[] = [];
  return {
    id,
    async append(event) {
      const prevHash = chain.length ? chain[chain.length - 1].hash : GENESIS_HASH;
      const entry: AuditLedgerEntry = {
        seq: chain.length,
        event,
        prevHash,
        hash: hashEntry(event, prevHash),
      };
      chain.push(entry);
      return entry;
    },
    async entries() {
      return chain.slice();
    },
    async head() {
      return chain.length ? chain[chain.length - 1].hash : GENESIS_HASH;
    },
    async verify() {
      return verifyChain(chain);
    },
  };
}

export class AuditLedgerNotConfiguredError extends Error {
  constructor() {
    super('audit ledger durable=production but no durable factory registered (fail-closed)');
    this.name = 'AuditLedgerNotConfiguredError';
  }
}

let productionFactory: (() => AuditLedger) | null = null;
export function setProductionAuditLedgerFactory(f: (() => AuditLedger) | null): void {
  productionFactory = f;
}

// One process-global in-memory ledger backs audit() in demo/mock so the chain is
// continuous within a run. Production swaps in the durable factory.
let processLedger: AuditLedger | null = null;

/** Resolve the process audit ledger; durable=production requires the factory. */
export function getAuditLedger(durable: boolean): AuditLedger {
  if (durable) {
    if (!productionFactory) throw new AuditLedgerNotConfiguredError();
    return productionFactory();
  }
  if (!processLedger) processLedger = createMemoryAuditLedger();
  return processLedger;
}

/** Test/ops: reset the process ledger (never used on a request path). */
export function _resetProcessAuditLedger(): void {
  processLedger = null;
}
