/**
 * Append-only, content-addressed, hash-chained ledger (S0). Each record is content-addressed
 * (bodyHash) and chained to its predecessor (prevHash → entryHash). Tamper-evidence:
 * `verifyLedger()` re-walks and recomputes every hash and link, and — given an out-of-band
 * head checkpoint — also detects truncation/rollback (the chain alone cannot). `parents`
 * carries DAG edges by ledgerId (the provenance graph). In-memory backend for dev/CI;
 * production swaps a WORM-backed adapter behind the same `Ledger` interface (plan §5, §12).
 */
import { hashText } from '../anchor/verify';

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

export interface LedgerEntry {
  ledgerId: string;
  seq: number;
  kind: string;
  createdAt: string;
  actor: string;
  parents: string[]; // DAG edges by ledgerId
  body: unknown;
  bodyHash: string;
  prevHash: string | null; // previous entry's entryHash (the chain)
  entryHash: string;
}

export type LedgerVerdict = { ok: true } | { ok: false; brokenAt: number; reason: string };

/** An out-of-band checkpoint that pins length + head, so truncation is detectable. */
export interface LedgerHead {
  count: number;
  headHash: string | null;
}

export interface Ledger {
  append(kind: string, body: unknown, actor: string, parents?: string[]): LedgerEntry;
  entries(): LedgerEntry[];
  get(ledgerId: string): LedgerEntry | undefined;
  head(): LedgerHead;
  verify(expected?: LedgerHead): LedgerVerdict;
}

/**
 * Deterministic, INJECTIVE canonical JSON (recursively sorted keys). Throws LedgerError on
 * any non-JSON-safe value (undefined / function / symbol / bigint / non-finite number), so a
 * body cannot silently drop `undefined` and collide with a different body.
 */
export function canonicalize(v: unknown): string {
  const enc = (x: unknown): string => {
    if (x === null) return 'null';
    const t = typeof x;
    if (t === 'string') return JSON.stringify(x);
    if (t === 'boolean') return x ? 'true' : 'false';
    if (t === 'number') {
      if (!Number.isFinite(x as number)) throw new LedgerError('canonicalize: non-finite number');
      return JSON.stringify(x);
    }
    if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') {
      throw new LedgerError(`canonicalize: non-serializable ${t}`);
    }
    if (Array.isArray(x)) return '[' + x.map(enc).join(',') + ']';
    if (t === 'object') {
      const o = x as Record<string, unknown>;
      const keys = Object.keys(o).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + enc(o[k])).join(',') + '}';
    }
    throw new LedgerError('canonicalize: unserializable value');
  };
  return enc(v);
}

interface HashableCore {
  seq: number;
  kind: string;
  createdAt: string;
  actor: string;
  parents: string[];
  bodyHash: string;
  prevHash: string | null;
}

/** Injective hash of the whole core object (not delimiter-joined fields). */
function entryHashOf(c: HashableCore): string {
  return hashText(canonicalize(c));
}

function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Pure verifier over an explicit entry array. Recomputes bodyHash, the chain link, and the
 * entryHash for every entry; if `expected` is given, also checks count + head (truncation).
 */
export function verifyLedger(
  entries: readonly LedgerEntry[],
  expected?: LedgerHead
): LedgerVerdict {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (hashText(canonicalize(e.body)) !== e.bodyHash) {
      return { ok: false, brokenAt: i, reason: 'body-tampered' };
    }
    const expectedPrev = i === 0 ? null : entries[i - 1].entryHash;
    if (e.prevHash !== expectedPrev) return { ok: false, brokenAt: i, reason: 'chain-broken' };
    const recomputed = entryHashOf({
      seq: e.seq,
      kind: e.kind,
      createdAt: e.createdAt,
      actor: e.actor,
      parents: e.parents,
      bodyHash: e.bodyHash,
      prevHash: e.prevHash,
    });
    if (recomputed !== e.entryHash)
      return { ok: false, brokenAt: i, reason: 'entry-hash-mismatch' };
  }
  if (expected) {
    if (entries.length !== expected.count) {
      return { ok: false, brokenAt: entries.length, reason: 'count-mismatch' };
    }
    const headHash = entries.length === 0 ? null : entries[entries.length - 1].entryHash;
    if (headHash !== expected.headHash) {
      return { ok: false, brokenAt: entries.length, reason: 'head-mismatch' };
    }
  }
  return { ok: true };
}

export class InMemoryLedger implements Ledger {
  private _entries: LedgerEntry[] = [];

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  append(kind: string, body: unknown, actor: string, parents: string[] = []): LedgerEntry {
    const bodyHash = hashText(canonicalize(body)); // throws LedgerError on non-serializable body
    const seq = this._entries.length;
    const prevHash = seq === 0 ? null : this._entries[seq - 1].entryHash;
    const createdAt = this.now();
    const entryHash = entryHashOf({ seq, kind, createdAt, actor, parents, bodyHash, prevHash });
    const ledgerId = `${seq}:${entryHash.slice(0, 16)}`;
    const entry: LedgerEntry = {
      ledgerId,
      seq,
      kind,
      createdAt,
      actor,
      parents,
      body,
      bodyHash,
      prevHash,
      entryHash,
    };
    this._entries.push(entry);
    return entry;
  }

  /** Defensive DEEP copy — external mutation cannot reach the internal chain. */
  entries(): LedgerEntry[] {
    return this._entries.map((e) => deepCopy(e));
  }

  get(ledgerId: string): LedgerEntry | undefined {
    const e = this._entries.find((x) => x.ledgerId === ledgerId);
    return e ? deepCopy(e) : undefined;
  }

  head(): LedgerHead {
    const n = this._entries.length;
    return { count: n, headHash: n === 0 ? null : this._entries[n - 1].entryHash };
  }

  verify(expected?: LedgerHead): LedgerVerdict {
    return verifyLedger(this._entries, expected);
  }
}
