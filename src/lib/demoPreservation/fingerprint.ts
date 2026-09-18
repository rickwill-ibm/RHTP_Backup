/**
 * fingerprint.ts — deterministic, dependency-free fingerprints for the
 * demo-preservation gate (HW0 / I12).
 *
 * A fingerprint is a stable structural signature of an authored demo surface:
 * an ordered id list, a count, and a hash of the canonical JSON. Comparing the
 * live fingerprint to a committed golden one turns "the demo still looks right"
 * from a manual eyeball into a mechanical gate — a change to any demo screen's
 * underlying data/shape fails like a broken build (governing constraint #2).
 *
 * No dependencies: canonical JSON (sorted keys) + FNV-1a/32 hashing.
 */

// Canonical JSON (sorted-key, array-order-preserving) is single-sourced in
// lib/util/canonicalJson.ts; re-exported here so the produced bytes are IDENTICAL
// to the ledger hash-chain and this module's existing public surface is unchanged.
export { canonicalJson } from '../util/canonicalJson';
import { canonicalJson } from '../util/canonicalJson';

/** FNV-1a 32-bit hash of a string, returned as 8-hex-char. Deterministic across runs/machines. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts, kept in uint32
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Hash any value by its canonical JSON. */
export function hashValue(value: unknown): string {
  return fnv1a(canonicalJson(value));
}

/**
 * Keys whose VALUES are volatile per evaluation (live clocks in the demo data,
 * e.g. `timestamp: new Date().toISOString()`). Their values are redacted to a
 * sentinel before hashing so the golden is deterministic while still pinning the
 * KEY's presence and everything non-volatile around it.
 */
const VOLATILE_KEY =
  /(^|_)(timestamp|expiry|expires|generatedat|createdat|updatedat|ts|time|now|nonce|requestid|correlationid)$/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Recursively replace volatile field values with a stable sentinel. */
export function normalizeVolatile(value: unknown, key?: string): unknown {
  if (key && VOLATILE_KEY.test(key)) return '<volatile>';
  if (typeof value === 'string' && ISO_DATETIME.test(value)) return '<volatile-iso>';
  if (Array.isArray(value)) return value.map((v) => normalizeVolatile(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = normalizeVolatile((value as Record<string, unknown>)[k], k);
    }
    return out;
  }
  return value;
}

export interface PanelFingerprint {
  /** Stable panel id (e.g. 'graph.nodes'). */
  panel: string;
  /** Element count (arrays) or key count (objects). */
  count: number;
  /** Sorted element ids, when the elements carry a stable id/code/seam key. */
  ids: string[];
  /** FNV-1a hash of the canonical JSON of the whole panel value. */
  hash: string;
}

/** Pull a stable id from a demo element: prefer id, then code, then seam, then name. */
function elementId(el: unknown): string | undefined {
  if (!el || typeof el !== 'object') return undefined;
  const o = el as Record<string, unknown>;
  for (const k of ['id', 'code', 'seam', 'measureId', 'nodeId', 'name']) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Fingerprint one demo panel (array or object). */
export function fingerprintPanel(panel: string, value: unknown): PanelFingerprint {
  const ids: string[] = [];
  let count = 0;
  if (Array.isArray(value)) {
    count = value.length;
    for (const el of value) {
      const id = elementId(el);
      if (id !== undefined) ids.push(id);
    }
    ids.sort();
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    count = keys.length;
    ids.push(...keys.sort());
  }
  return { panel, count, ids, hash: hashValue(normalizeVolatile(value)) };
}
