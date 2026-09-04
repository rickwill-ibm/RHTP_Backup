// wpcGraph/derivationPrimitives.ts — tolerant readers over GraphNode/GraphEdge.
// The SINGLE boundary where raw node/edge `properties` are parsed. Accepts both the
// authored golden shapes (status 'OPEN', severity 'MODERATE-HIGH', no `domain`/`keystone`)
// and normalized shapes. Pure, deterministic, no I/O, no clock.

import type { GraphNode, GraphEdge } from './types';

const S = (v: unknown): string => (v == null ? '' : String(v));
const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type GapStatus = 'open' | 'overdue' | 'closed';

export function gapStatus(gap: GraphNode): GapStatus {
  const s = S(gap.properties.status).toLowerCase();
  if (/clos/.test(s)) return 'closed';
  if (/overdue|past due/.test(s)) return 'overdue';
  return 'open';
}

export function daysOpenOf(n: GraphNode): number {
  return N(n.properties.daysOpen ?? n.properties.gapDays);
}

export function hedisWindowOf(n: GraphNode): number | null {
  const w = n.properties.hedisWindow;
  return w == null ? null : N(w);
}

export function daysToDeadline(gap: GraphNode): number | null {
  if (gap.validUntilDays != null) return gap.validUntilDays;
  const w = hedisWindowOf(gap);
  return w == null ? null : w - daysOpenOf(gap);
}

export function isOverdue(gap: GraphNode): boolean {
  if (gapStatus(gap) === 'overdue') return true;
  const d = daysToDeadline(gap);
  if (d != null && d <= 0) return true;
  const w = hedisWindowOf(gap);
  return w != null && daysOpenOf(gap) > w;
}

/** HIGH/CRITICAL=3, MODERATE-HIGH=2.5, MODERATE=2, LOW=1, else 0. */
export function severityRank(s: unknown): number {
  const t = S(s).toUpperCase();
  if (t === 'HIGH' || t === 'CRITICAL') return 3;
  if (t === 'MODERATE-HIGH' || t === 'MOD-HIGH') return 2.5;
  if (t === 'MODERATE' || t === 'MEDIUM') return 2;
  if (t === 'LOW') return 1;
  return 0;
}

export function blocksEdgesFrom(id: string, edges: GraphEdge[]): GraphEdge[] {
  return edges.filter((e) => e.source === id && (e.type || '').toUpperCase() === 'BLOCKS');
}

export function isKeystoneBarrier(node: GraphNode, edges: GraphEdge[]): boolean {
  if (node.properties.keystone === true) return true;
  return blocksEdgesFrom(node.id, edges).length > 0;
}

// ── Edge confidence / inference (for opacity=confidence, dashed=inferred) ───────
const STRUCTURAL = new Set([
  'HAS_CARE_GAP',
  'HAS_SDOH',
  'HAS_EPISODE',
  'HAS_SIGNAL',
  'PRESCRIBED',
  'PARENT_OF',
  'CAREGIVER_FOR',
  'INFORMAL_CAREGIVER_FOR',
  'COVERED_BY',
  'TREATED_BY',
]);
// Confirmed causal insights — bold + opaque even when authored as dashed/animated.
const CONFIRMED_CAUSAL = new Set([
  'BLOCKS',
  'WOULD_RESOLVE',
  'WOULD_REDUCE',
  'WOULD_ADDRESS',
  'CONFIRMS',
  'QUANTIFIES',
  'INDICATES',
]);

export function edgeConfidence(edge: GraphEdge): number {
  const c = edge.edgeProps?.confidence;
  if (typeof c === 'number') return Math.min(1, Math.max(0.35, c));
  const t = (edge.type || '').toUpperCase();
  if (STRUCTURAL.has(t)) return 1;
  if (CONFIRMED_CAUSAL.has(t)) return 0.9;
  return 0.7;
}

export function edgeInferred(edge: GraphEdge): boolean {
  const t = (edge.type || '').toUpperCase();
  if (CONFIRMED_CAUSAL.has(t)) return false;
  const flag = (edge.edgeProps as Record<string, unknown> | undefined)?.inferred;
  if (flag === true) return true;
  return edge.dashed === true;
}
