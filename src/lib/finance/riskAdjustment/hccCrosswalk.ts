// CONTRACT: DP-1  // HW-FIN  // Wave D / decision 2 (swappable ICD→HCC crosswalk stub)
/**
 * ICD-10-CM → CMS-HCC crosswalk — a swappable STUB (decision 2).
 *
 * ADVISORY ONLY. This resolves a *candidate* HCC for a diagnosis code so analytics (e.g.
 * a suggested-RAF uplift for a Condition coded with an ICD but no HCC) can be surfaced
 * for human review. It NEVER asserts a diagnosis, NEVER mints a Condition, and is NOT on
 * the ingest path — the coding-intensity firewall is unaffected. The authoritative
 * ICD↔HCC crosswalk is a licensed terminology asset; this is an illustrative bundled
 * placeholder (`data/hcc-crosswalk.json`) that a deployment replaces via
 * `setHccCrosswalkProvider(...)` with ZERO code change here. Best-effort: an unmapped
 * ICD (or version) returns `undefined`, never a guess.
 */
import bundled from './data/hcc-crosswalk.json';

/** A crosswalk provider: best-effort ICD (+version) → candidate HCC, or undefined. */
export type HccCrosswalkProvider = (icd: string, version: string) => string | undefined;

function toTable(raw: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [ver, tbl] of Object.entries(raw as Record<string, unknown>)) {
    if (ver.startsWith('_') || !tbl || typeof tbl !== 'object') continue;
    const m: Record<string, string> = {};
    for (const [icd, hcc] of Object.entries(tbl as Record<string, unknown>))
      if (typeof hcc === 'string') m[icd.toUpperCase()] = hcc;
    out[ver] = m;
  }
  return out;
}

const BUNDLED = toTable(bundled);
let provider: HccCrosswalkProvider | null = null;

/** Swap in a real (or test) ICD→HCC provider. Pass `null` to restore the bundled stub. */
export function setHccCrosswalkProvider(fn: HccCrosswalkProvider | null): void {
  provider = fn;
}

/**
 * Best-effort candidate HCC for an ICD-10-CM code under a model version. Returns
 * `undefined` when unmapped (never a guess). ADVISORY — never an assertion of diagnosis.
 */
export function resolveIcdToHcc(icd: string, version: string): string | undefined {
  const code = (icd ?? '').trim().toUpperCase();
  if (!code) return undefined;
  if (provider) return provider(code, version);
  return BUNDLED[version]?.[code];
}
