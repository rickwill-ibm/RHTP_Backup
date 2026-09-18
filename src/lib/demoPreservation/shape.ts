/**
 * shape.ts — structural shape extraction + equivalence, for the E15 seam
 * mock<->production PARITY gate (HW0 / I12).
 *
 * A seam's mock and production dispositions must return STRUCTURALLY EQUIVALENT
 * output — same keys, same value-types, same array-element shape — even though
 * the values differ (a mock member vs a real member). shapeOf() erases values
 * and keeps structure; assertShapeEquivalent() compares two shapes. This lets a
 * per-seam parity test prove the mock honestly represents production (and, until
 * a production backend exists, freezes the shape the production disposition must
 * later satisfy).
 */

export type Shape =
  | { k: 'primitive'; t: 'string' | 'number' | 'boolean' | 'null' | 'undefined' }
  | { k: 'array'; of: Shape | null }
  | { k: 'object'; fields: Record<string, Shape> };

/** Extract the structural shape of a value (values erased, structure kept). */
export function shapeOf(value: unknown): Shape {
  if (value === null) return { k: 'primitive', t: 'null' };
  if (Array.isArray(value)) {
    // element shape = the MERGE of element shapes (arrays may hold a union);
    // empty array -> unknown element shape (null), tolerated by equivalence.
    let merged: Shape | null = null;
    for (const el of value) merged = merged ? mergeShape(merged, shapeOf(el)) : shapeOf(el);
    return { k: 'array', of: merged };
  }
  const t = typeof value;
  if (t === 'object') {
    const fields: Record<string, Shape> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      fields[key] = shapeOf((value as Record<string, unknown>)[key]);
    }
    return { k: 'object', fields };
  }
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'undefined') {
    return { k: 'primitive', t };
  }
  // functions/symbols/bigint collapse to string-ish primitive for parity purposes
  return { k: 'primitive', t: 'string' };
}

/** Merge two shapes into the widest common shape (for heterogeneous arrays). */
function mergeShape(a: Shape, b: Shape): Shape {
  if (a.k !== b.k) return a; // divergent kinds: keep the first as the reference
  if (a.k === 'object' && b.k === 'object') {
    const fields: Record<string, Shape> = { ...a.fields };
    for (const [key, s] of Object.entries(b.fields)) {
      fields[key] = key in fields ? mergeShape(fields[key], s) : s;
    }
    return { k: 'object', fields };
  }
  if (a.k === 'array' && b.k === 'array') {
    const of = a.of && b.of ? mergeShape(a.of, b.of) : (a.of ?? b.of);
    return { k: 'array', of };
  }
  return a;
}

export interface ParityDiff {
  path: string;
  reason: string;
}

/**
 * Compare two shapes. Returns the list of structural differences (empty = parity).
 * A null array-element shape (from an empty mock array) is tolerated against any
 * element shape, so a genuinely-empty mock collection does not force a false fail.
 */
export function diffShape(a: Shape, b: Shape, path = '$'): ParityDiff[] {
  if (a.k !== b.k) return [{ path, reason: `kind ${a.k} vs ${b.k}` }];
  if (a.k === 'primitive' && b.k === 'primitive') {
    return a.t === b.t ? [] : [{ path, reason: `type ${a.t} vs ${b.t}` }];
  }
  if (a.k === 'array' && b.k === 'array') {
    if (a.of === null || b.of === null) return []; // empty collection tolerated
    return diffShape(a.of, b.of, `${path}[]`);
  }
  if (a.k === 'object' && b.k === 'object') {
    const diffs: ParityDiff[] = [];
    const keys = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
    for (const key of [...keys].sort()) {
      const av = a.fields[key];
      const bv = b.fields[key];
      if (!av) diffs.push({ path: `${path}.${key}`, reason: 'missing in A (present in B)' });
      else if (!bv) diffs.push({ path: `${path}.${key}`, reason: 'missing in B (present in A)' });
      else diffs.push(...diffShape(av, bv, `${path}.${key}`));
    }
    return diffs;
  }
  return [];
}

/** Throw with a readable path list when two values are not shape-equivalent. */
export function assertShapeEquivalent(mock: unknown, prod: unknown, label = 'seam'): void {
  const diffs = diffShape(shapeOf(mock), shapeOf(prod));
  if (diffs.length) {
    const detail = diffs
      .slice(0, 12)
      .map((d) => `  ${d.path}: ${d.reason}`)
      .join('\n');
    throw new Error(`E15 parity FAIL for ${label}: mock and production shapes diverge:\n${detail}`);
  }
}
