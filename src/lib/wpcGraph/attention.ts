// wpcGraph/attention.ts — attention hierarchy for the member graph.
// Salience is derived from GRAPH STRUCTURE, not node type. Clinical findings
// (CareGap / SDOHNode) are scored intrinsically into act / watch / context; any node
// that sits on a causal chain feeding an emphasized finding — a resolver, driver, or
// compounder (WOULD_RESOLVE / COMPOUNDS / DRIVES / …) — is then promoted onto a label.
// Type-agnostic and member-agnostic: a node earns emphasis by its role in the graph,
// so the engine behaves identically for every member with no per-node tuning.
// Pure & deterministic.

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

// Edge types that express a causal relationship the SOURCE node has TO its TARGET —
// it resolves, reduces, addresses, blocks, drives, delays, deprioritises, exacerbates,
// or compounds the target. Walking these backward from an emphasized finding surfaces
// the signals that explain it or would resolve it.
// GATED_BY and EXPOSES_GAP are intentionally excluded: their source/target direction is
// reversed (the emphasized node is the SOURCE) or points at the member anchor, so they
// do not express "source feeds target" and would promote the wrong end of the edge.
const CAUSAL_EDGE = new Set([
  'BLOCKS',
  'COMPOUNDS',
  'DRIVES',
  'DELAYS',
  'DEPRIORITIZES',
  'EXACERBATES',
  'WOULD_RESOLVE',
  'WOULD_REDUCE',
  'WOULD_ADDRESS',
]);
// Decisive / actionable relationships (a concrete fix, or a hard block) outrank mere
// aggravators when a density budget must choose which supporters to surface.
const DECISIVE_EDGE = new Set(['WOULD_RESOLVE', 'WOULD_ADDRESS', 'WOULD_REDUCE', 'BLOCKS']);
// Safety valve for pathologically dense graphs. On a typical member the whole causal
// chain is well under this, so the budget never binds and nothing real is evicted; it
// only bounds a runaway graph. A global knob, not a per-member tune.
const MAX_SUPPORTERS = 8;

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
  return 20; // everything else starts in context; a causal edge can still promote it
}

interface Supporter {
  id: string;
  targetTop: boolean; // feeds an act/signal (vs watch) node → higher priority
  decisive: boolean;
  hop: number;
}

/**
 * Nodes on a causal chain leading INTO an emphasized node — the resolver, driver, or
 * compounder of a surfaced finding. Backward breadth-first walk from the emphasized set
 * along CAUSAL edges (collect `source` when `target` is in the frontier), up to maxHops.
 * Type- and member-agnostic, so it behaves identically for every member. Returned in a
 * deterministic priority order (feeders of the top tier first, decisive edges first,
 * nearer hops, higher intrinsic score, then id) so a density budget can bound a dense
 * graph without evicting the highest-value links. Output is independent of edge order.
 */
export function causalSupporters(
  emphasized: ReadonlyMap<string, string>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  maxHops = 2
): string[] {
  const emphIds = new Set(
    [...emphasized]
      .filter(([, t]) => t === 'act' || t === 'watch' || t === 'signal')
      .map(([id]) => id)
  );
  if (emphIds.size === 0) return [];
  const scoreById = new Map(nodes.map((n) => [n.id, rawScore(n, edges)] as const));
  const found = new Map<string, Supporter>();
  let frontier = new Set(emphIds);
  for (let hop = 0; hop < maxHops; hop++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (!e.source || !e.target) continue;
      if (!CAUSAL_EDGE.has((e.type || '').toUpperCase())) continue;
      if (!frontier.has(e.target)) continue;
      if (emphIds.has(e.source) || found.has(e.source)) continue;
      const tt = emphasized.get(e.target);
      found.set(e.source, {
        id: e.source,
        targetTop: tt === 'act' || tt === 'signal',
        decisive: DECISIVE_EDGE.has((e.type || '').toUpperCase()),
        hop,
      });
      next.add(e.source);
    }
    if (next.size === 0) break;
    frontier = next;
  }
  return [...found.values()]
    .sort(
      (a, b) =>
        Number(b.targetTop) - Number(a.targetTop) ||
        Number(b.decisive) - Number(a.decisive) ||
        a.hop - b.hop ||
        (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0) ||
        (a.id < b.id ? -1 : 1)
    )
    .map((s) => s.id);
}

/**
 * The CareGap the attention scorer ranks highest — the member's primary act signal.
 * Keeps the story headline and the graph's red act node in agreement.
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

  // Structural promotion: surface the causal chain (resolver / driver / compounder)
  // feeding any emphasized finding, so the graph shows WHY a signal is stuck and WHAT
  // would clear it — read from the graph's own edges, identically for every member.
  const supporters = causalSupporters(out, nodes, edges).slice(0, MAX_SUPPORTERS);
  for (const id of supporters) if (out.get(id) === 'context') out.set(id, 'watch');
  return out;
}

/** Edge ids on the causal chain feeding an act/watch node — for edge emphasis. */
export function emphasizedChain(
  _nodes: GraphNode[],
  edges: GraphEdge[],
  attn: AttentionMap
): Set<string> {
  const out = new Set<string>();
  const isEmph = (id: string | undefined) => {
    const t = id ? attn.get(id) : undefined;
    return t === 'act' || t === 'watch';
  };
  for (const e of edges) {
    if ((e.type || '').toUpperCase() !== 'BLOCKS') continue;
    if (!isEmph(e.target)) continue;
    out.add(e.id);
    // one hop upstream: any causal edge feeding the barrier (driver / compounder / resolver)
    for (const up of edges) {
      if (up.target === e.source && CAUSAL_EDGE.has((up.type || '').toUpperCase())) {
        out.add(up.id);
      }
    }
  }
  // Also emphasize causal edges pointing directly into an emphasized node (e.g. a
  // benefit's WOULD_RESOLVE edge into a watch-tier barrier) so promoted supporters read
  // as connected to the finding they explain.
  for (const e of edges) {
    if (!CAUSAL_EDGE.has((e.type || '').toUpperCase())) continue;
    if (isEmph(e.target)) out.add(e.id);
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

// ── Non-golden attention ──────────────────────────────────────────────────────
// Real members get a sharper hierarchy: exactly ONE signal, relative score gates, and
// an enforced dim-floor so context nodes genuinely recede in a small lens. Salience is
// promoted from the SAME structural causal-chain rule as the golden path.

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
  scored.forEach((s, i) => out.set(s.id, tier[i]));

  // Structural promotion (same rule as the golden path): lift causal-chain supporters
  // of any emphasized node onto a label. Runs BEFORE the context-floor demotion so the
  // floor dims NON-supporter noise, never the chain.
  const supporters = new Set(causalSupporters(out, nodes, edges).slice(0, MAX_SUPPORTERS));
  for (const id of supporters) if (out.get(id) === 'context') out.set(id, 'watch');

  // Context dim-floor: keep ~40% of the lens genuinely receded, demoting the
  // lowest-scored NON-supporter watch nodes first so causal-chain links are never
  // dimmed just to satisfy the floor.
  let ctxCount = [...out.values()].filter((t) => t === 'context').length;
  for (let i = n - 1; i >= 1 && ctxCount < minContext; i--) {
    const id = scored[i].id;
    if (out.get(id) === 'watch' && !supporters.has(id)) {
      out.set(id, 'context');
      ctxCount++;
    }
  }
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
