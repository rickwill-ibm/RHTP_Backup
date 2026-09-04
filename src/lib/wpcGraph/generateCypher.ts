// wpcGraph/generateCypher.ts — per-patient, per-lens openCypher generator.
//
// Replaces the hardcoded Maria cypher strings on the Whole Person Care View. The
// query is derived from the visible subgraph (the nodes + edges a lens renders for
// the active patient), plus a one-hop CAUSAL closure so a lens still shows the
// cross-domain story it is about (e.g. an SdohBarrier -[:BLOCKS]-> a CareGap that
// lives on the clinical lens). Pure: no I/O, deterministic, mock/registry data.
//
// NOTE ON CLAIMS: this is a STATIC, registry-derived projection (see builder.ts —
// no DB, no fetch), and it is lens-scoped, NOT consent-scoped. It re-serializes the
// in-memory graph as Cypher; it is not (yet) an output of the live SDE / intelligence
// engines. The wording below is deliberately accurate about that.

import type { GraphNode, GraphEdge } from './types';

export interface GeneratedCypher {
  cypher: string;
  nodeCount: number;
  edgeCount: number;
  description: string;
}

/** Map an internal node.type to a clean, PascalCase Cypher label. */
const NODE_LABEL: Record<string, string> = {
  Member: 'Member',
  CareGap: 'CareGap',
  CodingGap: 'CodingGap',
  SDOHNode: 'SdohBarrier',
  SdohScreening: 'SdohScreening',
  SocialNeed: 'SocialNeed',
  Episode: 'Episode',
  Condition: 'Condition',
  Observation: 'Observation',
  BehavioralHealthObservation: 'BhObservation',
  ScreeningResult: 'ScreeningResult',
  Dependent: 'Dependent',
  HouseholdUnit: 'Household',
  Caregiver: 'Caregiver',
  Coverage: 'Coverage',
  Program: 'Program',
  BenefitStatus: 'BenefitStatus',
  WICStatus: 'BenefitStatus',
  LIHEAPStatus: 'BenefitStatus',
  Agent: 'Agent',
  Provider: 'Provider',
  Organization: 'Organization',
};

const labelFor = (type: string): string =>
  NODE_LABEL[type] ?? (type ? type.replace(/[^A-Za-z0-9]/g, '') || 'Node' : 'Node');

/** Causal relationship types whose target is pulled into a lens even if out-of-lens. */
const CAUSAL_RELS = new Set(['BLOCKS', 'CAREGIVER_FOR', 'INFORMAL_CAREGIVER_FOR']);

/** A short, stable, unique variable name for a node, seeded from its label. */
function assignVars(nodes: GraphNode[], memberId: string): Map<string, string> {
  const varOf = new Map<string, string>();
  const used = new Set<string>();
  varOf.set(memberId, 'm');
  used.add('m');
  for (const n of nodes) {
    if (varOf.has(n.id)) continue;
    const base = labelFor(n.type).charAt(0).toLowerCase() || 'n';
    let v = base;
    let i = 1;
    while (used.has(v)) v = `${base}${++i}`;
    used.add(v);
    varOf.set(n.id, v);
  }
  return varOf;
}

/** Generate a member-anchored openCypher query for a given node/edge subgraph. */
export function generateCypher(opts: {
  memberId: string;
  memberName: string;
  lensLabel: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}): GeneratedCypher {
  const { memberId, memberName, lensLabel, nodes, edges } = opts;

  if (!nodes.length) {
    return {
      cypher: `// No ${lensLabel} data in scope for ${memberName}\nMATCH (m:Member {id: '${memberId}'})\nRETURN m`,
      nodeCount: 0,
      edgeCount: 0,
      description: `No ${lensLabel.toLowerCase()} nodes are in scope for this member.`,
    };
  }

  const member = nodes.find((n) => n.type === 'Member') ?? nodes[0];
  const varOf = assignVars(nodes, member.id);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const nWord = (n: number): string => `${n} node${n === 1 ? '' : 's'}`;
  const rWord = (n: number): string => `${n} relationship${n === 1 ? '' : 's'}`;
  const header = [
    `// Whole Person Care · ${lensLabel} lens · ${memberName} (${memberId})`,
    `// ${nWord(nodes.length)} · ${rWord(edges.length)} · static per-patient projection (mock data)`,
  ];
  const clauses: string[] = [`MATCH (${varOf.get(member.id)}:Member {id: '${memberId}'})`];

  // A node's label is declared the first time its var is bound in a MATCH.
  const declared = new Set<string>([member.id]);
  const declLabel = (id: string): string => {
    const v = varOf.get(id)!;
    if (declared.has(id)) return v;
    declared.add(id);
    return `${v}:${labelFor(nodeById.get(id)?.type ?? '')}`;
  };

  // Member-anchored edges first (they read as the member's story), then the rest.
  const memberEdges = edges.filter((e) => e.source === member.id || e.target === member.id);
  const otherEdges = edges.filter((e) => e.source !== member.id && e.target !== member.id);

  for (const e of [...memberEdges, ...otherEdges]) {
    if (!varOf.has(e.source) || !varOf.has(e.target)) continue;
    const rel = (e.type || e.label || 'RELATED_TO').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    clauses.push(`MATCH (${declLabel(e.source)})-[:${rel}]->(${declLabel(e.target)})`);
  }

  // Any visible node with no in-scope edge — bind it so RETURN is complete.
  for (const n of nodes) {
    if (declared.has(n.id)) continue;
    declared.add(n.id);
    clauses.push(`MATCH (${varOf.get(n.id)}:${labelFor(n.type)})  // ${n.label}`);
  }

  const order = [member.id, ...nodes.map((n) => n.id).filter((id) => id !== member.id)];
  clauses.push(`RETURN ${order.map((id) => varOf.get(id)!).join(', ')}`);

  const relTypes = Array.from(
    new Set(edges.map((e) => (e.type || e.label || '').toUpperCase()).filter(Boolean))
  );
  const description =
    `Static per-patient projection of ${memberName}'s ${lensLabel.toLowerCase()} subgraph — ` +
    `${nWord(nodes.length)} across ${relTypes.length} relationship type${relTypes.length === 1 ? '' : 's'}` +
    (relTypes.length
      ? ` (${relTypes.slice(0, 4).join(', ')}${relTypes.length > 4 ? '…' : ''}).`
      : '.');

  return {
    cypher: [...header, ...clauses].join('\n'),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    description,
  };
}

/**
 * Generate a lens' Cypher from an explicit, pre-resolved node set (the same nodes the
 * canvas renders for that lens). A one-hop CAUSAL closure (BLOCKS / CAREGIVER_FOR)
 * still pulls a barrier's far endpoint in so the cross-domain story survives even when
 * that endpoint lives on another lens. Works for domain and relationship lenses alike.
 */
export function buildLensCypher(
  allNodes: GraphNode[],
  allEdges: GraphEdge[],
  lens: { id: string; label: string; nodeIds: string[] },
  opts: { memberId: string; memberName: string }
): GeneratedCypher {
  const baseIds = new Set<string>(lens.nodeIds);
  if (opts.memberId) baseIds.add(opts.memberId);
  if (baseIds.size === 0) {
    const anyMember = allNodes.find((n) => n.type === 'Member');
    if (anyMember) baseIds.add(anyMember.id);
  }

  // In-lens edges (both endpoints), plus causal edges with one endpoint in-lens.
  const edges = allEdges.filter((e) => {
    const s = baseIds.has(e.source);
    const t = baseIds.has(e.target);
    if (s && t) return true;
    if (!(s || t)) return false;
    const rel = (e.type || e.label || '').toUpperCase();
    return CAUSAL_RELS.has(rel);
  });

  const closure = new Set(baseIds);
  for (const e of edges) {
    closure.add(e.source);
    closure.add(e.target);
  }
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const nodes = [...closure]
    .map((id) => nodeById.get(id))
    .filter((n): n is GraphNode => Boolean(n));
  const validIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => validIds.has(e.source) && validIds.has(e.target));

  return generateCypher({
    memberId: opts.memberId,
    memberName: opts.memberName,
    lensLabel: lens.label,
    nodes,
    edges: validEdges,
  });
}
