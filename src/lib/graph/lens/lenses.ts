// CONTRACT: C1  // CONTRACT: C10  // DP-1
/**
 * The FIVE lens queries (DP-1 acceptance), each a store-agnostic read over the
 * GraphStore API. They answer the same questions the demo's five lens filters ask
 * of the hardcoded graph, but against the PROJECTED store, so both certified
 * backends satisfy them identically (the co-equal lens guarantee, proven by
 * tests/graph/lens.acceptance.test.ts running every lens on both backends).
 *
 *   whole-person      the member and every connected resource (consent-filtered)
 *   care-gap          open/unresolved items needing action: open encounters +
 *                     unmet needs (the "gap" surface)
 *   sdoh-barrier      social screenings + the unmet social needs they assert
 *   care-team         the providers / care managers assigned to the member
 *   part2-restricted  the 42 CFR Part 2 / segmented subgraph - EMPTY without the
 *                     consent scope, visible with it (the enforcement lens)
 *
 * Consent (C1): a restricted node is included only when the caller's ConsentScope
 * covers each of its restricting labels; otherwise it (and every edge to it) is
 * dropped. This gating is applied uniformly by `collect`, so no lens can leak a
 * restricted node.
 */
import type { EdgeValidity, GraphEdgeRecord, GraphNodeRecord, GraphStore } from '../types';
import { MEMBER_KIND } from '../mapping';
import { type ConsentScope, type LensName, type LensResult, NO_CONSENT } from './types';

/** Does the caller's scope cover a node's restriction? Non-restricted -> always. */
export function scopeCovers(node: GraphNodeRecord, scope: ConsentScope): boolean {
  if (!node.restricted) return true;
  // A restricted node's restricting labels are every label past the primary kind.
  const restricting = node.labels.filter((l) => l !== node.kind && l !== 'Restricted');
  // FAIL-SAFE (E9): a node flagged restricted but carrying NO identifiable
  // restricting label cannot be proven grantable by an ordinary segment grant. An
  // empty `every(...)` would return true and DISCLOSE it without consent, so an
  // unlabeled restricted node is covered only under an explicit Part 2 grant (the
  // catch-all restricted grant) - a missing restriction label fails CLOSED.
  if (restricting.length === 0) return scope.part2 === true;
  const granted = new Set(scope.segments ?? []);
  if (scope.part2) granted.add('42-CFR-Part-2');
  // Covered when every restricting label is granted (Part 2 alone covers the
  // common case where 42-CFR-Part-2 is the only restricting label).
  return restricting.every((l) => granted.has(l));
}

/** An edge is still open (no end) - used by the care-gap lens. */
function isOpen(v: EdgeValidity): boolean {
  return v.end === null || v.end === undefined;
}

interface Collected {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}

/**
 * Gather the member-scoped subgraph, consent-filtered. Starts from the member's
 * outgoing edges, loads each target node, and keeps only edges whose target node
 * is visible under `scope`. `edgeTypes` restricts to specific relationships;
 * `edgePredicate` further filters (e.g. open-only). The member node itself is
 * always included (it is never restricted).
 */
async function collect(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope,
  opts: {
    edgeTypes?: readonly string[];
    edgePredicate?: (e: GraphEdgeRecord) => boolean;
    /** When set, keep only target nodes that are restricted (part2-restricted lens). */
    restrictedTargetsOnly?: boolean;
    /** Include the member node in the result (default true). */
    includeMember?: boolean;
  } = {}
): Promise<Collected> {
  const typeSet = opts.edgeTypes ? new Set(opts.edgeTypes) : null;
  const allEdges = await store.listEdges({ fromKey: memberId });
  const nodes: GraphNodeRecord[] = [];
  const edges: GraphEdgeRecord[] = [];
  const seenNode = new Set<string>();

  const member = await store.getNode(MEMBER_KIND, memberId);
  if (member && opts.includeMember !== false) {
    nodes.push(member);
    seenNode.add(`${member.kind} ${member.key}`);
  }

  for (const edge of allEdges) {
    if (typeSet && !typeSet.has(edge.type)) continue;
    if (opts.edgePredicate && !opts.edgePredicate(edge)) continue;
    const target = await store.getNode(edge.to.kind, edge.to.key);
    if (!target) continue;
    if (!scopeCovers(target, scope)) continue; // consent gate
    if (opts.restrictedTargetsOnly && !target.restricted) continue;
    edges.push(edge);
    const nk = `${target.kind} ${target.key}`;
    if (!seenNode.has(nk)) {
      seenNode.add(nk);
      nodes.push(target);
    }
  }
  return { nodes, edges };
}

function result(lens: LensName, memberId: string, c: Collected): LensResult {
  return { lens, memberId, nodes: c.nodes, edges: c.edges };
}

// ── The five lenses ───────────────────────────────────────────────────────────

/** 1. Whole-person: the member and every connected resource (consent-filtered). */
export async function wholePersonLens(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<LensResult> {
  return result('whole-person', memberId, await collect(store, memberId, scope));
}

/** 2. Care-gap: open, unresolved items - open encounters and unmet needs. */
export async function careGapLens(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<LensResult> {
  const c = await collect(store, memberId, scope, {
    edgeTypes: ['HAD_ENCOUNTER', 'HAS_UNMET_NEED'],
    edgePredicate: (e) => e.type === 'HAS_UNMET_NEED' || isOpen(e.validity),
  });
  return result('care-gap', memberId, c);
}

/** 3. SDOH-barrier: social screenings + the unmet social needs they assert. */
export async function sdohBarrierLens(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<LensResult> {
  const c = await collect(store, memberId, scope, {
    edgeTypes: ['SCREENED_FOR', 'HAS_UNMET_NEED'],
  });
  return result('sdoh-barrier', memberId, c);
}

/** 4. Care-team: the providers / care managers assigned to the member. */
export async function careTeamLens(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<LensResult> {
  const c = await collect(store, memberId, scope, { edgeTypes: ['HAS_CARE_TEAM'] });
  return result('care-team', memberId, c);
}

/**
 * 5. Part 2-restricted-aware: the restricted (42 CFR Part 2 / segmented) subgraph.
 * EMPTY of restricted nodes without a covering consent scope, populated with it -
 * the co-equal Part 2 enforcement surface. The member node is omitted so the
 * result IS the restricted set (empty === fully redacted).
 */
export async function part2RestrictedLens(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<LensResult> {
  const c = await collect(store, memberId, scope, {
    restrictedTargetsOnly: true,
    includeMember: false,
  });
  return result('part2-restricted', memberId, c);
}

/** The lens registry, keyed by canonical name (for a uniform acceptance sweep). */
export const LENSES: Record<
  LensName,
  (store: GraphStore, memberId: string, scope?: ConsentScope) => Promise<LensResult>
> = {
  'whole-person': wholePersonLens,
  'care-gap': careGapLens,
  'sdoh-barrier': sdohBarrierLens,
  'care-team': careTeamLens,
  'part2-restricted': part2RestrictedLens,
};

/** Every lens name, in canonical order. */
export const LENS_NAMES: readonly LensName[] = [
  'whole-person',
  'care-gap',
  'sdoh-barrier',
  'care-team',
  'part2-restricted',
];
