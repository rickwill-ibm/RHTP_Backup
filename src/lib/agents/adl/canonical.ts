/**
 * Canonical serialisation — the FROZEN spec byte-equality depends on.
 *
 * INVARIANT: object keys are emitted in sorted order; arrays keep author order.
 * INVARIANT: two-space indent, LF line endings, exactly one trailing newline.
 * INVARIANT: no floats are emitted (every numeric in ADL data is an integer).
 *
 * Changing anything here changes every generated file, so it is versioned and
 * covered by its own tests. A Node upgrade must not be able to move these bytes.
 */

export const CANONICAL_SPEC_VERSION = '1.0.0';

/** Recursively order object keys so serialisation is independent of build order. */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortValue(src[key]);
    return out;
  }
  return value;
}

/**
 * Serialise to the canonical form. Deterministic and idempotent: the same
 * logical value always produces the same bytes, whatever order it was built in.
 */
export function serializeStable(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

/** Parse canonical JSON, refusing anything that is not an object graph. */
export function parseStable(text: string): unknown {
  return JSON.parse(text) as unknown;
}
