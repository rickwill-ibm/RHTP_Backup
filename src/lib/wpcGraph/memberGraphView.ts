// wpcGraph/memberGraphView.ts — the graph INTERPRETATION engine.
//
// Architecture: data (FHIR/registry → knowledge graph) → ENGINES interpret →
// UI displays. This module is the single interpreter the UI consumes. It does NOT
// draw anything and holds no display constants (rings, colours, pixels) — it decides
// only the SEMANTICS of each node relative to the viewing member:
//   • anchor      — which one node is the member (by IDENTITY, never array order),
//   • role        — a related person's role, derived from the RELATIONSHIP edge to
//                   the member (care direction), never forced from node type,
//   • tier        — act / watch / context, from the attention (signal) engine,
//                   ABSOLUTE (a lone benign item is not promoted to "act"),
//   • disclosure  — show / lock / suppress, from the canonical consent engine
//                   (42 CFR Part 2 / minimum-necessary),
//   • onTrack     — no node crosses the action threshold in this view.
// The UI (SignalGraph) reads this verdict and decides the optimal display pattern,
// including whether to render a node at all. Reuses attention.ts + consent.ts — no
// duplicated scoring or consent logic here.

import type { GraphNode, GraphEdge } from './types';
import { scoreAttention, topAttentionGap } from './attention';
import { isSensitive } from './consent';

/** A related person's role, by care DIRECTION relative to the member. */
export type PersonRole = 'caregiver' | 'dependent' | 'household';
/** The display tier the UI groups + colours by. */
export type ViewTier = 'member' | 'act' | 'watch' | 'context' | PersonRole;
/** Disclosure verdict for the UI: render normally / render a redacted stub / do not render. */
export type Disclosure = 'show' | 'lock' | 'suppress';

export interface NodeView {
  id: string;
  tier: ViewTier;
  disclosure: Disclosure;
  /** The single dominant "act now" signal in this view, if any. */
  signal: boolean;
  /** Human relationship label (Mother, Son, Spouse) for person nodes, when known. */
  relation?: string;
}

export interface MemberGraphView {
  anchorId: string;
  view: Map<string, NodeView>;
  /** True when nothing in this view crosses the action threshold — the member is on track here. */
  onTrack: boolean;
}

// Any node that represents a PERSON (so it is a relationship, never a clinical finding).
const PERSON_TYPES = new Set(['Member', 'Dependent', 'HouseholdUnit', 'Caregiver', 'Person']);
// Person↔person relationship edges that carry NO care direction → household peers
// (spouse, partner, sibling, co-subscriber). Listed so future data is handled without
// forcing them into "dependent".
const PEER_RELS = new Set([
  'SPOUSE_OF',
  'PARTNER_OF',
  'MARRIED_TO',
  'SIBLING_OF',
  'LIVES_WITH',
  'HOUSEHOLD_OF',
  'MEMBER_OF_HOUSEHOLD',
  'RELATED_TO',
]);

// d3-force mutates edge.source/target from id strings into node objects once a
// simulation has run; normalise so id compares never silently fail.
const eid = (x: unknown): string =>
  x && typeof x === 'object' ? String((x as { id?: unknown }).id ?? '') : String(x ?? '');

const titleCase = (s: string): string => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Interpret a member's graph into per-node display verdicts. `activeMemberId` is the
 * viewing member's identity (citizen/platform id); the anchor is matched to it so the
 * center is chosen by identity, not by whichever Member node is first in the array.
 */
export function buildMemberGraphView(
  nodes: GraphNode[],
  edges: GraphEdge[],
  activeMemberId?: string
): MemberGraphView {
  const members = nodes.filter((n) => n.type === 'Member');

  // 1 · Anchor — by identity, with deterministic fallbacks (never array order alone).
  const idOf = (n: GraphNode) => String((n.properties as { id?: unknown } | undefined)?.id ?? '');
  const statusOf = (n: GraphNode) =>
    String((n.properties as { status?: unknown } | undefined)?.status ?? '');
  const anchor =
    (activeMemberId
      ? members.find((n) => n.sublabel === activeMemberId || idOf(n) === activeMemberId)
      : undefined) ??
    members.find((n) => !/DEPENDENT_ON/i.test(statusOf(n))) ??
    nodes.find((n) => n.id === 'n01') ??
    members[0] ??
    nodes[0];
  const anchorId = anchor?.id ?? '';

  // 2 · Roles — from the RELATIONSHIP edge to the member (care direction). Never forced.
  const role = new Map<string, PersonRole>();
  const relation = new Map<string, string>();
  for (const e of edges) {
    const t = (e.type || '').toUpperCase();
    const s = eid(e.source),
      d = eid(e.target);
    const other = s === anchorId ? d : d === anchorId ? s : '';
    if (!other) continue;
    if (t === 'PARENT_OF' && s === anchorId)
      role.set(d, 'dependent'); // member's child
    else if ((t === 'CAREGIVER_FOR' || t === 'INFORMAL_CAREGIVER_FOR') && d === anchorId)
      role.set(s, 'caregiver'); // cares for member
    else if ((t === 'CAREGIVER_FOR' || t === 'INFORMAL_CAREGIVER_FOR') && s === anchorId)
      role.set(d, 'dependent'); // member cares for (child or eldercare)
    else if (PEER_RELS.has(t)) role.set(other, 'household'); // spouse / partner / sibling — a peer, NOT a dependent
  }
  // Relationship label for display, from the node's own data (edge already set direction).
  for (const n of nodes) {
    const r = n.properties as { relation?: unknown; relationship?: unknown } | undefined;
    const rel = r?.relation ?? r?.relationship;
    if (rel) relation.set(n.id, titleCase(String(rel)));
  }
  // A related PERSON node with no care-direction edge is a neutral household peer —
  // classified because it IS a person related to the member, not defaulted to dependent.
  for (const n of nodes) {
    if (n.id !== anchorId && PERSON_TYPES.has(n.type) && !role.has(n.id))
      role.set(n.id, 'household');
  }

  // 3 · Consent disclosure — the canonical gate. A consent-pending / Part 2 person is
  // shown as a locked stub (relationship kept, PHI hidden); nodes reachable ONLY through
  // such a person (their own clinical data) are suppressed (minimum-necessary).
  const blockedPersons = new Set(
    nodes
      .filter((n) => n.id !== anchorId && PERSON_TYPES.has(n.type) && isSensitive(n))
      .map((n) => n.id)
  );
  const adj = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
  };
  for (const e of edges) {
    const s = eid(e.source),
      d = eid(e.target);
    touch(s, d);
    touch(d, s);
  }

  const disclosure = new Map<string, Disclosure>();
  for (const n of nodes) {
    if (blockedPersons.has(n.id)) {
      disclosure.set(n.id, 'lock');
      continue;
    }
    if (n.id !== anchorId && !PERSON_TYPES.has(n.type)) {
      const nbrs = [...(adj.get(n.id) ?? [])];
      const touchesBlocked = nbrs.some((x) => blockedPersons.has(x));
      const touchesSafe = nbrs.some((x) => !blockedPersons.has(x)); // anchor or any non-blocked node
      if (touchesBlocked && !touchesSafe) {
        disclosure.set(n.id, 'suppress');
        continue;
      }
    }
    disclosure.set(n.id, 'show');
  }

  // 4 · Attention tiers — ABSOLUTE (act only if it crosses the action threshold). Runs
  // over disclosed, non-person finding nodes only. A lone benign item stays context/watch,
  // so onTrack is truthful instead of always finding a "signal".
  const findingNodes = nodes.filter(
    (n) => n.id !== anchorId && !PERSON_TYPES.has(n.type) && disclosure.get(n.id) !== 'suppress'
  );
  const attn = scoreAttention(findingNodes, edges); // act (score≥60) / watch / context
  const topGap = topAttentionGap(findingNodes, edges);
  const signalId = topGap && attn.get(topGap.id) === 'act' ? topGap.id : undefined;
  const onTrack = ![...attn.values()].some((t) => t === 'act');

  // 5 · Assemble the per-node verdict.
  const view = new Map<string, NodeView>();
  for (const n of nodes) {
    const disc = disclosure.get(n.id) ?? 'show';
    let tier: ViewTier;
    if (n.id === anchorId) tier = 'member';
    else if (role.has(n.id))
      tier = role.get(n.id)!; // caregiver | dependent | household
    else tier = (attn.get(n.id) ?? 'context') as ViewTier; // act | watch | context
    view.set(n.id, {
      id: n.id,
      tier,
      disclosure: disc,
      signal: n.id === signalId,
      relation: relation.get(n.id),
    });
  }

  return { anchorId, view, onTrack };
}
