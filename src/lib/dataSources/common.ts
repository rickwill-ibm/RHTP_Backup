/**
 * Data-source adapters — shared primitives (O-2).
 *
 * Every adapter follows one shape: a normalized output type, a seeded-mode
 * implementation backed by a `data/*.json` file (data-is-not-code), and a
 * production-mode stub that throws until wired (the BackboneNotConfigured
 * pattern). Selection is the dataMode registry: getDataMode(seam) returns
 * mock | seeded | production.
 *
 * Boundary validation is hand-written (the repo's isEvidenceRecord discipline):
 * each seed row is parsed and normalized, and malformed data throws rather than
 * flowing downstream. Loaders are deterministic — callers pass `asOf`, no
 * wall-clock reads.
 */
import { getDataMode, type DataMode } from '@/lib/config/dataMode';

/** A normalized data-source loader. `load` is async so production fetches fit. */
export interface DataSourceLoader<T> {
  id: string;
  load(asOf: string): Promise<T>;
}

/** Thrown by a production-mode loader that has no backend wired yet. */
export class DataSourceNotConfiguredError extends Error {
  constructor(seam: string, hint: string) {
    super(
      `DATA_MODE ${seam}=production: no production ${seam} source is wired yet. ${hint} ` +
        `(SEAM: ${seam}) or set DATA_MODE_${seam.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}=seeded.`
    );
    this.name = 'DataSourceNotConfiguredError';
  }
}

/**
 * Resolve a loader for a seam from its mode. `mock` and `seeded` both serve the
 * seeded file source (mock === the bundled seed here); `production` serves the
 * stub until a real client is registered.
 */
export function selectLoader<T>(
  seam: string,
  seeded: DataSourceLoader<T>,
  production: DataSourceLoader<T>
): DataSourceLoader<T> {
  const mode: DataMode = getDataMode(seam);
  return mode === 'production' ? production : seeded;
}

// ── validation helpers (boundary guards) ─────────────────────────────────────

export function asRecord(v: unknown, ctx: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`${ctx}: expected an object`);
  }
  return v as Record<string, unknown>;
}

export function reqString(o: Record<string, unknown>, key: string, ctx: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0)
    throw new Error(`${ctx}: '${key}' must be a non-empty string`);
  return v;
}

export function reqNumber(o: Record<string, unknown>, key: string, ctx: string): number {
  const v = o[key];
  if (typeof v !== 'number' || Number.isNaN(v))
    throw new Error(`${ctx}: '${key}' must be a number`);
  return v;
}

export function optNumber(o: Record<string, unknown>, key: string, ctx: string): number | null {
  if (o[key] === undefined || o[key] === null) return null;
  return reqNumber(o, key, ctx);
}

export function optString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function reqBool(o: Record<string, unknown>, key: string, ctx: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`${ctx}: '${key}' must be a boolean`);
  return v;
}

export function reqArray(v: unknown, ctx: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${ctx}: expected an array`);
  return v;
}
