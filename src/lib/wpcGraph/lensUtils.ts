// wpcGraph/lensUtils.ts — lens node-set helpers, the lens REGISTRY, and BH layout.
//
// buildLensNodeSets() derives domain-lens membership purely from each node's .lens
// array. No patient-specific branches — identical logic for every citizen. An empty
// domain returns the member anchor only (graceful absence), NOT the whole graph.
//
// buildLensRegistry() is the single source of truth for the lens surfaces (bar,
// legend, counts, cypher, canvas). It returns universal DOMAIN lenses plus
// data-derived RELATIONSHIP lenses (one per PARENT_OF / CAREGIVER_FOR edge on the
// member), labeled by the real person's name and absent when the member has none.
//
// applyBehavioralLayout() is the dedicated radial layout for the BH lens.

import { graphNodes, lensDefinitions } from '@/lib/wholePersonGraphData';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import { isSensitive } from './consent';
import type { GraphNode, GraphEdge, LensType } from '@/lib/wholePersonGraphData';

/** Sofia lens — Maria's curated pediatric thread (presentation-only, Maria authored graph). */
export const SOFIA_LENS_NODES = ['n01', 'n15', 'n06', 'n35', 'n13', 'n32', 'n26', 'n52'];

/** Agent coalition lens nodes (Maria authored graph). */
export const AGENT_LENS_NODES = [
  'n01',
  'a01',
  'a02',
  'a03',
  'n04',
  'n07',
  'n17',
  'n18',
  'n41',
  'n38',
  'n51',
  'n25',
  'n14',
];

/**
 * Curated lens node-sets for the Maria authored 52-node graph.
 * Used only by CypherModal for display counts — NOT used in the canvas render path.
 */
export const MARIA_LENS_NODE_SETS: Record<LensType, string[]> = {
  all: graphNodes.map((n) => n.id),
  clinical: [
    'n01',
    'n04',
    'n05',
    'n06',
    'n07',
    'n08',
    'n09',
    'n10',
    'n14',
    'n33',
    'n11',
    'n12',
    'n13',
    'n15',
    'n16',
    'n17',
    'n18',
  ],
  behavioral: [
    'n01',
    'n05',
    'n07',
    'n08',
    'n19',
    'n23',
    'n24',
    'n25',
    'n31',
    'n38',
    'n44',
    'n49',
    'n51',
  ],
  social: [
    'n01',
    'n17',
    'n18',
    'n04',
    'n20',
    'n21',
    'n22',
    'n23',
    'n47',
    'n48',
    'n30',
    'n36',
    'n41',
  ],
  eligibility: ['n01', 'n41', 'n42', 'n43', 'n46', 'n45', 'n39', 'n40', 'n18', 'n04', 'n02'],
  agents: AGENT_LENS_NODES,
};

/**
 * Build lens node sets for any patient's node array.
 * Derives membership purely from each node's .lens property. No patient-ID checks.
 * An empty domain falls back to the MEMBER ANCHOR ONLY (graceful absence) — never
 * the whole graph, so a member with e.g. no SDOH barriers renders a clean
 * member-only Social projection instead of the entire graph.
 */
export function buildLensNodeSets(nodes: GraphNode[]): Record<LensType, string[]> {
  const all = nodes.map((n) => n.id);
  const memberId = nodes.find((n) => n.type === 'Member')?.id ?? nodes[0]?.id;
  const memberOnly = memberId ? [memberId] : [];
  const byLens = (l: LensType): string[] => {
    const ids = nodes.filter((n) => (n.lens as string[]).includes(l)).map((n) => n.id);
    return ids.length > 0 ? ids : memberOnly;
  };
  return {
    all,
    clinical: byLens('clinical'),
    behavioral: byLens('behavioral'),
    social: byLens('social'),
    eligibility: byLens('eligibility'),
    agents: byLens('agents'),
  };
}

// ── Lens registry ─────────────────────────────────────────────────────────────
// One descriptor per lens surface. Domain lenses are universal; relationship
// lenses are derived per-patient from the member's relationship edges and are
// simply absent when the member has no dependent / caregiver.

export type LensKind = 'all' | 'domain' | 'relationship';

export interface LensDescriptor {
  /** Stable id: a LensType for domains, or `dep:<nodeId>` / `car:<nodeId>` for relationships. */
  id: string;
  /** Short label for the lens bar. */
  label: string;
  /** Legend label (person name + role for relationships). */
  legendLabel: string;
  color: string;
  kind: LensKind;
  /** Nodes this lens renders (always member-anchored). */
  nodeIds: string[];
  count: number;
  /** Cypher template family — a domain LensType, or 'relationship'. */
  cypherLens: LensType | 'relationship';
  /** Relationship role, when kind === 'relationship'. */
  role?: 'Dependent' | 'Caregiver';
}

/** Relationship edge type → role + color family. Keyed on EDGE type, not node type. */
const REL_ROLE: Record<
  string,
  { role: 'Dependent' | 'Caregiver'; family: 'dependent' | 'caregiver' }
> = {
  PARENT_OF: { role: 'Dependent', family: 'dependent' },
  CAREGIVER_FOR: { role: 'Caregiver', family: 'caregiver' },
  INFORMAL_CAREGIVER_FOR: { role: 'Caregiver', family: 'caregiver' },
};

/** Color ramps — hue encodes the RELATIONSHIP KIND; lightness steps disambiguate multiples. */
const REL_RAMP: Record<'dependent' | 'caregiver', string[]> = {
  dependent: ['#ec4899', '#f472b6', '#db2777', '#f9a8d4'],
  caregiver: ['#a855f7', '#c084fc', '#9333ea', '#d8b4fe'],
};

/** Authored curated node-sets for the golden graph, keyed by relationship target id. */
const CURATED_REL_NODESETS: Record<string, string[]> = {
  n15: SOFIA_LENS_NODES, // Maria's authored pediatric (Sophia) thread — preserved verbatim
};

const firstName = (label: string): string => {
  const t = (label || '').trim();
  return t.split(/\s+/)[0] || t;
};

const DOMAIN_ORDER = ['all', 'clinical', 'behavioral', 'social', 'eligibility', 'agents'];

/**
 * Build the full ordered lens registry for a patient's graph.
 * Domain lenses come first (fixed order), then any derived relationship lenses
 * (dependents before caregivers). Pure — no patient-ID branches; Maria's curated
 * pediatric thread is applied as authored DATA via CURATED_REL_NODESETS.
 */
export function buildLensRegistry(nodes: GraphNode[], edges: GraphEdge[]): LensDescriptor[] {
  const memberId = nodes.find((n) => n.type === 'Member')?.id ?? nodes[0]?.id ?? '';
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sets = buildLensNodeSets(nodes);
  const memberOnly = memberId ? [memberId] : [];

  // ── Domain lenses (from the authored lensDefinitions meta) ──────────────────
  const domainMeta = new Map(lensDefinitions.map((ld) => [ld.id, ld]));
  const domains: LensDescriptor[] = DOMAIN_ORDER.filter((id) => domainMeta.has(id)).map((id) => {
    const ld = domainMeta.get(id)!;
    const lt = id as LensType;
    const nodeIds = sets[lt] ?? memberOnly;
    return {
      id,
      label: ld.label,
      legendLabel: ld.label,
      color: ld.color,
      kind: (id === 'all' ? 'all' : 'domain') as LensKind,
      nodeIds,
      count: nodeIds.length,
      cypherLens: lt,
    };
  });

  // ── Relationship lenses (derived from member-anchored relationship edges) ───
  const familyIdx: Record<'dependent' | 'caregiver', number> = { dependent: 0, caregiver: 0 };
  const relationships: LensDescriptor[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.source !== memberId) continue;
    const spec = REL_ROLE[(e.type || '').toUpperCase()];
    if (!spec) continue;
    const target = nodeById.get(e.target);
    if (!target || seen.has(target.id)) continue;
    seen.add(target.id);

    const idx = familyIdx[spec.family]++;
    const color = REL_RAMP[spec.family][idx % REL_RAMP[spec.family].length];

    let nodeIds: string[];
    if (CURATED_REL_NODESETS[target.id]) {
      nodeIds = CURATED_REL_NODESETS[target.id].filter((id) => nodeById.has(id));
    } else {
      // member + relationship person + the person's one-hop neighborhood
      const closure = new Set<string>([...memberOnly, target.id]);
      for (const e2 of edges) {
        if (e2.source === target.id) closure.add(e2.target);
        else if (e2.target === target.id) closure.add(e2.source);
      }
      nodeIds = [...closure].filter((id) => nodeById.has(id));
    }

    const name = firstName(target.label);
    relationships.push({
      id: `${spec.family === 'dependent' ? 'dep' : 'car'}:${target.id}`,
      label: `${name} · ${spec.role}`,
      legendLabel: `${name} · ${spec.role}`,
      color,
      kind: 'relationship',
      nodeIds,
      count: nodeIds.length,
      cypherLens: 'relationship',
      role: spec.role,
    });
  }
  // dependents before caregivers, otherwise discovery order (stable)
  relationships.sort((a, b) => (a.role === b.role ? 0 : a.role === 'Dependent' ? -1 : 1));

  // Phase 4 — for NON-golden members, merge the per-person relationship lenses into ONE
  // household lens: member + every household person + the findings each connects to.
  // Maria (golden) keeps her authored per-person (Sofia) thread untouched.
  const memberGolden = memberId ? nodeById.get(memberId)?.sublabel === DEMO_MEMBER_ID : false;
  if (!memberGolden && relationships.length > 0) {
    // 42 CFR Part 2 / minimum-necessary: a consent-pending or locked household node
    // (e.g. a household person whose consent is not ACTIVE, or their gated findings)
    // is not disclosed into the member's household view.
    const hhSensitive = (id: string): boolean => {
      const n = nodeById.get(id) as unknown as Parameters<typeof isSensitive>[0] | undefined;
      return Boolean(n && isSensitive(n));
    };
    const ids = new Set<string>(memberOnly);
    for (const r of relationships)
      r.nodeIds.forEach((id) => {
        if (!hhSensitive(id)) ids.add(id);
      });
    const householdIds = [...ids];
    const household: LensDescriptor = {
      id: 'household',
      label: `Household · ${relationships.length}`,
      legendLabel: `Household · ${relationships.map((r) => r.legendLabel).join(' · ')}`,
      color: '#a855f7',
      kind: 'relationship',
      nodeIds: householdIds,
      count: householdIds.length,
      cypherLens: 'relationship',
    };
    return [...domains, household];
  }

  return [...domains, ...relationships];
}

// ── Minimal positional interface shared with the canvas SimNode ────────────────
export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
}

/**
 * Applies the Behavioral Health lens radial layout to a set of positioned nodes.
 *
 * Story told:
 *   Anchor screenings (Edinburgh PND n38 left, Zarit n51 right)
 *   → risk targets (PostpartumRisk n24, CaregiverBurden n31) inner arc below
 *   → episodes (PostpartumHealth n08, CareGap n05, PreDiabetic n07) mid-ring top
 *   → remaining BH nodes in outer arc
 *
 * Node IDs are Maria's authored IDs — when a non-Maria patient's graph is rendered,
 * nodeById.get() simply returns undefined for absent IDs and those slots are skipped,
 * so the layout degrades gracefully to the outer-arc for all present nodes.
 */
export function applyBehavioralLayout(
  nodes: PositionedNode[],
  cx: number,
  cy: number,
  maxR: number
): void {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const nonCenter = nodes.filter((n) => n.id !== 'n01');

  const anchorR = Math.min(maxR * 0.55, 170);
  const innerArcR = Math.min(maxR * 0.42, 130);
  const midR = Math.min(maxR * 0.72, 210);
  const outerR2 = Math.min(maxR * 0.92, 265);

  // Anchor screenings: Edinburgh PND left, Zarit right
  const pin = (id: string, x: number, y: number) => {
    const n = nodeById.get(id);
    if (!n) return;
    n.x = x;
    n.y = y;
    n.fx = x;
    n.fy = y;
  };
  pin('n38', cx - anchorR, cy - 40);
  pin('n51', cx + anchorR, cy - 40);
  pin('n24', cx - innerArcR * 0.7, cy + innerArcR * 0.7);
  pin('n31', cx + innerArcR * 0.7, cy + innerArcR * 0.7);
  pin('n08', cx - midR * 0.55, cy - midR * 0.72);
  pin('n05', cx, cy - midR);
  pin('n07', cx + midR * 0.55, cy - midR * 0.72);

  const placed = new Set(['n38', 'n51', 'n24', 'n31', 'n08', 'n05', 'n07', 'n01']);
  const preferredOuter = ['n44', 'n25', 'n19', 'n23', 'n49'];
  const remaining = nonCenter.filter((n) => !placed.has(n.id)).map((n) => n.id);
  const allOuter = [
    ...preferredOuter.filter((id) => remaining.includes(id)),
    ...remaining.filter((id) => !preferredOuter.includes(id)),
  ];
  allOuter.forEach((id, i) => {
    const n = nodeById.get(id);
    if (!n) return;
    const angle = -Math.PI * 0.9 + (i / Math.max(allOuter.length - 1, 1)) * Math.PI * 1.8;
    n.x = cx + outerR2 * Math.cos(angle);
    n.y = cy + outerR2 * Math.sin(angle);
    n.fx = n.x;
    n.fy = n.y;
  });
}

/**
 * Phase 3 — enrich a SPARSE domain lens (≤2 satellites) with the 1-hop causal
 * neighbours (BLOCKS / owner / enables) of its findings, so a lone finding renders
 * as its story (e.g. PHQ-9 → BLOCKS → Spirometry) instead of a single floating dot.
 * Member-anchored, pure, deterministic. Non-golden use only (Maria's lenses are authored).
 */
export function enrichSparseLens(
  lensNodeIds: string[],
  nodes: GraphNode[],
  edges: GraphEdge[]
): string[] {
  const memberId = nodes.find((n) => n.type === 'Member')?.id;
  const satellites = lensNodeIds.filter((id) => id !== memberId);
  if (satellites.length === 0 || satellites.length > 2) return lensNodeIds;
  const sat = new Set(satellites);
  const set = new Set(lensNodeIds);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // 42 CFR Part 2 / minimum-necessary: never surface a consent-sensitive node into a lens
  // it is not natively part of. Guards only NEWLY pulled cross-domain neighbours.
  const sensitive = (id: string): boolean => {
    const n = byId.get(id) as unknown as Parameters<typeof isSensitive>[0] | undefined;
    return Boolean(n && isSensitive(n));
  };
  const CAUSAL = /BLOCKS|BLOCKED_BY|OWNER|OWNED_BY|ENABLES|COMPOUNDS|DRIVES/;
  for (const e of edges) {
    if (!CAUSAL.test((e.type || '').toUpperCase())) continue;
    const add = sat.has(e.source) ? e.target : sat.has(e.target) ? e.source : null;
    if (!add || set.has(add) || !byId.has(add) || sensitive(add)) continue;
    set.add(add);
  }
  return [...set];
}
