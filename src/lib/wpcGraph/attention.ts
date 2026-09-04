// wpcGraph/attention.ts — attention hierarchy for the member graph.
// Scores every node into act (≤3) / watch (≤5) / context, and exposes edge
// confidence/inference + the causal BLOCKS chain to emphasize. Pure & deterministic.
// Keeps the golden demo intact by carrying the causal story on EDGES (emphasizedChain),
// not by forcing a barrier into the act tier.

import type { GraphNode, GraphEdge } from './types';
import {
  isOverdue,
  daysOpenOf,
  daysToDeadline,
  severityRank,
  isKeystoneBarrier,
  blocksEdgesFrom,
  edgeConfidence,
  edgeInferred,
} from './derivationPrimitives';

export type AttentionTier = 'act' | 'watch' | 'context';
export type AttentionMap = Map<string, AttentionTier>;

const ACT_CAP = 3;
const WATCH_CAP = 5;

interface Scored {
  id: string;
  score: number;
  sev: number;
  urgency: number;
}

function rawScore(n: GraphNode, edges: GraphEdge[]): number {
  if (n.type === 'Member') return -1; // anchor, never competes
  if (n.type === 'CareGap') {
    const status = String(n.properties.status ?? '').toLowerCase();
    if (/clos/.test(status)) return 5; // resolved → context
    const dOpen = daysOpenOf(n);
    const blocked = edges.some(
      (e) => e.target === n.id && (e.type || '').toUpperCase() === 'BLOCKS'
    );
    if (isOverdue(n)) return 100 + dOpen;
    const dl = daysToDeadline(n);
    if (dl != null && dl <= 14) return 92 + (14 - dl); // near deadline
    if (blocked) return 90 + dOpen * 0.1;
    return 40 + dOpen * 0.1;
  }
  if (n.type === 'SDOHNode') {
    const sev = severityRank(n.properties.severity);
    const keystone = isKeystoneBarrier(n, edges);
    if (keystone && sev >= 3) return 80 + sev * 5;
    return 45 + sev * 5;
  }
  if (n.pulse) return 46; // authored-emphasis nodes never fall to context
  if (n.consentPending || n.locked) return 42;
  return 20;
}

/**
 * The CareGap the attention scorer ranks highest — i.e. the node the graph
 * emphasizes as the member's primary act signal (overdue > near-deadline > blocked
 * > oldest, via the same rawScore the graph uses). Keeps the story headline and the
 * graph's red act node in agreement instead of running two different priorities.
 */
export function topAttentionGap(nodes: GraphNode[], edges: GraphEdge[]): GraphNode | undefined {
  return [...nodes.filter((n) => n.type === 'CareGap')].sort(
    (a, b) => rawScore(b, edges) - rawScore(a, edges) || (a.id < b.id ? -1 : 1)
  )[0];
}

export function scoreAttention(nodes: GraphNode[], edges: GraphEdge[]): AttentionMap {
  const out: AttentionMap = new Map();
  const scored: Scored[] = [];
  for (const n of nodes) {
    if (n.type === 'Member') {
      out.set(n.id, 'context');
      continue;
    }
    scored.push({
      id: n.id,
      score: rawScore(n, edges),
      sev: severityRank(n.properties.severity),
      urgency: n.type === 'CareGap' && isOverdue(n) ? 2 : n.pulse ? 1 : 0,
    });
  }
  const cmp = (a: Scored, b: Scored) =>
    b.score - a.score || b.sev - a.sev || b.urgency - a.urgency || (a.id < b.id ? -1 : 1);
  scored.sort(cmp);

  const act = scored.slice(0, ACT_CAP).filter((s) => s.score >= 60);
  const actIds = new Set(act.map((s) => s.id));
  const rest = scored.filter((s) => !actIds.has(s.id));
  const watch = rest.slice(0, WATCH_CAP).filter((s) => s.score >= 40);
  const watchIds = new Set(watch.map((s) => s.id));

  for (const s of scored) {
    out.set(s.id, actIds.has(s.id) ? 'act' : watchIds.has(s.id) ? 'watch' : 'context');
  }
  return out;
}

/** Edge ids on the causal barrier→BLOCKS→gap chain feeding an act/watch gap. */
export function emphasizedChain(
  nodes: GraphNode[],
  edges: GraphEdge[],
  attn: AttentionMap
): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if ((e.type || '').toUpperCase() !== 'BLOCKS') continue;
    const t = attn.get(e.target);
    if (t === 'act' || t === 'watch') {
      out.add(e.id);
      // one hop upstream: what feeds the barrier
      for (const up of edges) {
        if (
          up.target === e.source &&
          /COMPOUNDS|DRIVES|DELAYS|DEPRIORITIZES/.test((up.type || '').toUpperCase())
        ) {
          out.add(up.id);
        }
      }
    }
  }
  return out;
}

export { edgeConfidence, edgeInferred, blocksEdgesFrom };

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Node visual multipliers per tier. */
export function attnNodeStyle(tier: AttentionTier): {
  radiusMul: number;
  alpha: number;
  ring: boolean;
} {
  if (tier === 'act') return { radiusMul: 1.32, alpha: 1, ring: true };
  if (tier === 'watch') return { radiusMul: 1.0, alpha: 1, ring: false };
  return { radiusMul: 0.68, alpha: 0.32, ring: false };
}

// ── Non-golden attention (Phase 1) ────────────────────────────────────────────
// Maria (golden) keeps scoreAttention above untouched. Real members get a sharper
// hierarchy: exactly ONE signal, relative score gates, and an enforced dim-floor so
// context nodes genuinely recede even in a small 5–8 node lens.

export type NGTier = 'signal' | 'act' | 'watch' | 'context';

export function scoreAttentionNG(nodes: GraphNode[], edges: GraphEdge[]): Map<string, NGTier> {
  const out = new Map<string, NGTier>();
  const scored: { id: string; score: number }[] = [];
  for (const n of nodes) {
    if (n.type === 'Member') {
      out.set(n.id, 'context');
      continue;
    }
    scored.push({ id: n.id, score: rawScore(n, edges) });
  }
  if (scored.length === 0) return out;
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const top = scored[0].score || 1;
  const n = scored.length;
  const minContext = Math.ceil(0.4 * n);
  const tier: NGTier[] = scored.map((s, i) => {
    if (i === 0) return 'signal'; // exactly one signal
    if (i <= 2 && s.score >= 0.75 * top) return 'act'; // ≤2 more, relative gate
    if (s.score < 0.55 * top) return 'context';
    return 'watch';
  });
  // Enforce the dim-floor: demote the lowest-scored WATCH nodes to context until met.
  let ctxCount = tier.filter((t) => t === 'context').length;
  for (let i = n - 1; i >= 1 && ctxCount < minContext; i--) {
    if (tier[i] === 'watch') {
      tier[i] = 'context';
      ctxCount++;
    }
  }
  scored.forEach((s, i) => out.set(s.id, tier[i]));
  return out;
}

/** Non-golden per-tier visual multipliers — the signal dominates. */
export function ngNodeStyle(tier: NGTier): {
  radiusMul: number;
  alpha: number;
  ring: boolean;
  signal: boolean;
} {
  if (tier === 'signal') return { radiusMul: 1.5, alpha: 1, ring: true, signal: true };
  if (tier === 'act') return { radiusMul: 1.0, alpha: 1, ring: true, signal: false };
  if (tier === 'watch') return { radiusMul: 0.78, alpha: 0.85, ring: false, signal: false };
  return { radiusMul: 0.52, alpha: 0.4, ring: false, signal: false }; // context — genuinely recede
}
