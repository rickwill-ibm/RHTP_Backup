/**
 * Record lifecycle + content-hash idempotency (HW3 / I17, RP-01/CRUD-02),
 * program-spine contract C-LIFE.
 *
 * The existing idempotency store dedupes by KEY: a resent intent with the same
 * key is dropped. That is correct for an exact duplicate — but WRONG for a
 * CORRECTION, which reuses the business key with CHANGED content and MUST
 * re-project. This module classifies an incoming record by its CONTENT HASH:
 *   - new         : first time this key is seen                → project
 *   - unchanged   : same key, same content hash (a true resend) → dedupe (no-op)
 *   - correction  : same key, DIFFERENT content hash            → RE-project
 *   - void        : status entered-in-error                     → retract
 *   - revoid      : already void, voided again                  → no-op
 *
 * It also carries the entered-in-error / void lifecycle (CRUD-02). In-memory
 * default (demo, zero backend) + a fail-closed durable factory (production).
 */
import { createHash } from 'node:crypto';

export type RecordStatus = 'active' | 'entered-in-error';
export type LifecycleDisposition = 'new' | 'unchanged' | 'correction' | 'void' | 'revoid';

/** Stable content hash of a record payload (order-independent). */
export function contentHash(payload: unknown): string {
  return createHash('sha256').update(canonical(payload)).digest('hex');
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export interface RecordState {
  key: string;
  hash: string;
  status: RecordStatus;
  version: number;
  updatedAtMs: number;
}

export interface ClassifyInput {
  key: string;
  hash: string;
  status: RecordStatus;
  nowMs: number;
}

export interface ClassifyResult {
  disposition: LifecycleDisposition;
  /** Does this disposition require (re-)projecting to the graph/store? */
  reproject: boolean;
  /** Does this disposition retract prior state (a void)? */
  retract: boolean;
  version: number;
}

/** Pure classifier: prior state + incoming record -> disposition. */
export function classify(prior: RecordState | null, input: ClassifyInput): ClassifyResult {
  if (input.status === 'entered-in-error') {
    const already = prior?.status === 'entered-in-error';
    return { disposition: already ? 'revoid' : 'void', reproject: false, retract: !already, version: (prior?.version ?? 0) + (already ? 0 : 1) };
  }
  if (!prior) return { disposition: 'new', reproject: true, retract: false, version: 1 };
  if (prior.status === 'entered-in-error') {
    // resurrecting a voided key with new active content is a correction
    return { disposition: 'correction', reproject: true, retract: false, version: prior.version + 1 };
  }
  if (prior.hash === input.hash) {
    return { disposition: 'unchanged', reproject: false, retract: false, version: prior.version };
  }
  return { disposition: 'correction', reproject: true, retract: false, version: prior.version + 1 };
}

export interface RecordLifecycleStore {
  readonly id: string;
  /** Classify an incoming record AND persist the resulting state (atomic per key). */
  record(input: ClassifyInput): Promise<ClassifyResult>;
  /** The current state for a key, or null. */
  current(key: string): Promise<RecordState | null>;
}

/** In-memory lifecycle store — the demo/mock default. */
export function createMemoryRecordLifecycleStore(id = 'mock-record-lifecycle'): RecordLifecycleStore {
  const states = new Map<string, RecordState>();
  return {
    id,
    async record(input) {
      const prior = states.get(input.key) ?? null;
      const result = classify(prior, input);
      // persist the new state (a no-op disposition still refreshes updatedAt)
      const status: RecordStatus = input.status;
      states.set(input.key, { key: input.key, hash: input.hash, status, version: result.version, updatedAtMs: input.nowMs });
      return result;
    },
    async current(key) {
      return states.get(key) ?? null;
    },
  };
}

export class RecordLifecycleNotConfiguredError extends Error {
  constructor() {
    super('record lifecycle durable=production but no durable factory registered (fail-closed)');
    this.name = 'RecordLifecycleNotConfiguredError';
  }
}

let productionFactory: (() => RecordLifecycleStore) | null = null;
export function setProductionRecordLifecycleFactory(f: (() => RecordLifecycleStore) | null): void {
  productionFactory = f;
}
let processStore: RecordLifecycleStore | null = null;

/** Resolve the lifecycle store; durable=production requires the registered factory. */
export function getRecordLifecycleStore(durable: boolean): RecordLifecycleStore {
  if (durable) {
    if (!productionFactory) throw new RecordLifecycleNotConfiguredError();
    return productionFactory();
  }
  if (!processStore) processStore = createMemoryRecordLifecycleStore();
  return processStore;
}

export function _resetRecordLifecycleStore(): void {
  processStore = null;
}
