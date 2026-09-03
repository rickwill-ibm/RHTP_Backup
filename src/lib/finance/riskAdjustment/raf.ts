// CONTRACT: DP-1  // HW-FIN  // Wave D (hierarchy-aware RAF, swappable weight tables)
/**
 * Hierarchy-aware RAF (risk-adjustment factor) — a STUB engine over swappable data.
 *
 * CMS-HCC RAF is not a naive sum of every captured HCC's weight: a disease HIERARCHY
 * suppresses a less-severe HCC when a more-severe one in the same family is also
 * present (e.g. diabetes-with-complications supersedes diabetes-without), so the member
 * is not double-counted. `computeHierarchicalRaf` applies that suppression, then sums
 * the surviving HCCs' weights.
 *
 * SWAPPABLE BY DESIGN. The weight and hierarchy tables are ILLUSTRATIVE bundled stubs
 * (`data/hcc-weights.json`, `data/hcc-hierarchy.json`) — placeholders for demo and
 * graph rendering, NOT the licensed CMS model. A deployment plugs in the real,
 * version-correct tables via `setRafModelData(...)` with ZERO code change here; the
 * engine is a pure function of whatever data it is given. Honest by construction: an
 * HCC with no weight in the table is SURFACED (`unweightedHccs`), never silently 0.
 */
import bundledWeights from './data/hcc-weights.json';
import bundledHierarchy from './data/hcc-hierarchy.json';

/** The per-version model data the engine needs: HCC→weight and HCC→[superseded HCCs]. */
export interface RafModelData {
  /** modelVersion -> (HCC -> RAF weight increment). */
  weights: Record<string, Record<string, number>>;
  /** modelVersion -> (HCC -> the less-severe HCCs it supersedes). */
  hierarchy: Record<string, Record<string, string[]>>;
}

/** The result of a hierarchy-aware RAF computation — every input HCC is accounted for. */
export interface HierarchicalRaf {
  /** The summed RAF of the surviving (non-suppressed, weighted) HCCs, rounded to 3dp. */
  raf: number;
  /** The model version the computation used (e.g. 'V28'). */
  version: string;
  /** HCCs that contributed weight (survived the hierarchy AND had a weight). */
  includedHccs: string[];
  /** HCCs dropped because a more-severe HCC in the same family superseded them. */
  suppressedHccs: string[];
  /** Present, non-suppressed HCCs that had NO weight in the table — surfaced, not zeroed. */
  unweightedHccs: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
/** Coerce a raw JSON table to number weights, dropping the `_note` metadata key. */
function toWeights(raw: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (!isRecord(raw)) return out;
  for (const [ver, tbl] of Object.entries(raw)) {
    if (ver.startsWith('_') || !isRecord(tbl)) continue;
    const m: Record<string, number> = {};
    for (const [hcc, w] of Object.entries(tbl)) if (typeof w === 'number') m[hcc] = w;
    out[ver] = m;
  }
  return out;
}
function toHierarchy(raw: unknown): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  if (!isRecord(raw)) return out;
  for (const [ver, tbl] of Object.entries(raw)) {
    if (ver.startsWith('_') || !isRecord(tbl)) continue;
    const m: Record<string, string[]> = {};
    for (const [hcc, arr] of Object.entries(tbl))
      if (Array.isArray(arr)) m[hcc] = arr.filter((x): x is string => typeof x === 'string');
    out[ver] = m;
  }
  return out;
}

const BUNDLED: RafModelData = {
  weights: toWeights(bundledWeights),
  hierarchy: toHierarchy(bundledHierarchy),
};
let active: RafModelData | null = null;

/** Swap in real (or test) RAF model data. Pass `null` to restore the bundled stub. */
export function setRafModelData(data: RafModelData | null): void {
  active = data;
}
function model(): RafModelData {
  return active ?? BUNDLED;
}

/** Normalize an HCC token to a canonical 'HCC<digits>' (leading zeros stripped). */
function normHcc(code: string): string {
  const m = /(\d+)/.exec(code);
  return m ? `HCC${parseInt(m[1], 10)}` : code.trim().toUpperCase();
}

/**
 * Compute a member's hierarchy-aware RAF from a set of captured HCCs, for one model
 * version. Pure and deterministic; no store, no globals beyond the swappable model data.
 * Unknown version → empty tables → raf 0 with every HCC surfaced as unweighted (honest).
 */
export function computeHierarchicalRaf(hccs: string[], version: string): HierarchicalRaf {
  const weights = model().weights[version] ?? {};
  const hierarchy = model().hierarchy[version] ?? {};
  const present = new Set(hccs.map(normHcc).filter(Boolean));

  // Suppression: an HCC is dropped when ANY other present HCC supersedes it (per the
  // hierarchy table). One pass over present HCCs is sufficient — the table already lists
  // each parent's full set of superseded children.
  const suppressed = new Set<string>();
  for (const hcc of present) {
    for (const child of hierarchy[hcc] ?? []) {
      const c = normHcc(child);
      if (present.has(c) && c !== hcc) suppressed.add(c);
    }
  }

  const included: string[] = [];
  const unweighted: string[] = [];
  let raf = 0;
  for (const hcc of present) {
    if (suppressed.has(hcc)) continue;
    if (typeof weights[hcc] === 'number') {
      raf += weights[hcc];
      included.push(hcc);
    } else {
      unweighted.push(hcc);
    }
  }
  return {
    raf: Math.round(raf * 1000) / 1000,
    version,
    includedHccs: included.sort(),
    suppressedHccs: [...suppressed].sort(),
    unweightedHccs: unweighted.sort(),
  };
}
