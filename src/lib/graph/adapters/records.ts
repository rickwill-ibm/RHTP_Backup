// SEAM: graph
/**
 * Record-normalization shared by EVERY adapter, so read-back shape is identical
 * across backends by construction (the contract test asserts this; these helpers
 * make it true rather than coincidental). Kept tiny and store-free.
 */
import type { EdgeSemantics, GraphEdgeRecord, GraphNodeRef, Props } from '../types';

/** Canonical label list: primary kind first, extras de-duped + sorted after it. */
export function nodeLabels(kind: string, extra: readonly string[]): string[] {
  const rest = [...new Set(extra.filter((l) => l && l !== kind))].sort();
  return [kind, ...rest];
}

/** Merge property maps (later wins), the idempotent upsert semantics. */
export function mergeProps(base: Props | undefined, patch: Props | undefined): Props {
  return { ...(base ?? {}), ...(patch ?? {}) };
}

/** Union of label lists. */
export function unionLabels(base: readonly string[], add: readonly string[]): string[] {
  return [...new Set([...base, ...add])];
}

/** Split EdgeSemantics into the flat (causal, asserter, basis) storage triple. */
export function semanticsToTriple(s: EdgeSemantics): {
  causal: boolean;
  asserter: string | null;
  basis: string | null;
} {
  return s.kind === 'causal'
    ? { causal: true, asserter: s.asserter, basis: s.basis }
    : { causal: false, asserter: null, basis: null };
}

/** Assemble an edge read-back record from stored fields. */
export function edgeRecord(fields: {
  type: string;
  from: GraphNodeRef;
  to: GraphNodeRef;
  props: Props;
  vStart: string;
  vEnd: string | null;
  causal: boolean;
  asserter: string | null;
  basis: string | null;
}): GraphEdgeRecord {
  const rec: GraphEdgeRecord = {
    type: fields.type,
    from: fields.from,
    to: fields.to,
    properties: fields.props,
    validity: { start: fields.vStart, end: fields.vEnd },
    causal: fields.causal,
  };
  if (fields.causal) {
    if (fields.asserter !== null) rec.asserter = fields.asserter;
    if (fields.basis !== null) rec.basis = fields.basis;
  }
  return rec;
}
