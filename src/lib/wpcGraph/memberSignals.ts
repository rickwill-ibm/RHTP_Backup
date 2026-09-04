// wpcGraph/memberSignals.ts — derive the action-signal strip + the "blocked" headline
// from ANY member's own graph, so the Whole Person Care view tells that member's
// actionable story (what's open · why it's stuck · what to do) instead of the golden
// demo's hardcoded Maria signals. The authored golden signals stay for Maria.

import type { GraphNode, GraphEdge, ActiveSignal, LensType } from '@/lib/wholePersonGraphData';
import { topAttentionGap } from './attention';

const str = (v: unknown): string => (v == null ? '' : String(v));
const sevRank = (s: string): number =>
  s === 'HIGH' ? 3 : s === 'MODERATE' ? 2 : s === 'LOW' ? 1 : 0;

/** Find the barrier→gap BLOCKS edge and its endpoints, if any. */
export function topBlock(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { barrier: GraphNode; gap: GraphNode } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    if ((e.type || '').toUpperCase() !== 'BLOCKS') continue;
    const barrier = byId.get(e.source);
    const gap = byId.get(e.target);
    if (barrier && gap) return { barrier, gap };
  }
  return null;
}

/**
 * The one-line headline for the "All" lens: the member's dominant blocked-gap story
 * ("Transportation (HIGH) → BLOCKS A1c Recheck"), or a clean member-anchored line.
 */
export function memberBannerText(
  nodes: GraphNode[],
  edges: GraphEdge[],
  memberName: string
): string {
  const blk = topBlock(nodes, edges);
  if (blk) {
    const sev = str(blk.barrier.properties?.severity);
    const sevTag = sev ? ` (${sev})` : '';
    return `${blk.barrier.label}${sevTag} → BLOCKS ${blk.gap.label} · Click node or edge for the chain`;
  }
  const gaps = nodes.filter((n) => n.type === 'CareGap');
  if (gaps.length)
    return `${memberName} · ${gaps.length} open care gap${gaps.length === 1 ? '' : 's'} · Click node or edge for properties`;
  return `${memberName} · member-anchored whole-person graph · Click node or edge for properties`;
}

/**
 * Derive up to 5 action signals from a member's graph: the most-overdue care gap,
 * the barrier→gap blocker (the "how it's blocked" story), an eligibility/benefit
 * action, and a behavioral screening. Absent categories are simply skipped.
 */
export function buildMemberSignals(
  nodes: GraphNode[],
  edges: GraphEdge[],
  authored = false
): ActiveSignal[] {
  const member = nodes.find((n) => n.type === 'Member');
  const memberId = member?.id;
  const out: ActiveSignal[] = [];

  // 1. Finding gap. Derived members: the gap the attention scorer ranks highest, so the
  //    headline matches the graph's red act node (not merely the oldest gap — which made
  //    a COPD member wrongly lead with an unrelated retinal exam). Golden: authored order.
  const gap0 = authored
    ? [...nodes.filter((n) => n.type === 'CareGap')].sort(
        (a, b) => Number(b.properties?.daysOpen ?? 0) - Number(a.properties?.daysOpen ?? 0)
      )[0]
    : topAttentionGap(nodes, edges);
  if (gap0) {
    out.push({
      id: 'ms-gap',
      type: 'CARE_GAP_DEADLINE_APPROACHING',
      label: `${gap0.label}${gap0.sublabel ? ` · ${gap0.sublabel}` : ''}`,
      detail: `Open care gap${gap0.properties?.domain ? ` · ${str(gap0.properties.domain)} domain` : ''} — click to trace the chain`,
      urgency: 'critical',
      relatedNodeIds: [gap0.id, memberId].filter(Boolean) as string[],
      action: 'View Chain',
      targetLens: 'clinical',
      chainNodeIds: [memberId, gap0.id].filter(Boolean) as string[],
    });
  }

  // 2. Barrier → gap blocker (the "how is it blocked" story) → warning.
  const blk = topBlock(nodes, edges);
  if (blk) {
    const sev = str(blk.barrier.properties?.severity);
    out.push({
      id: 'ms-block',
      type: 'BARRIER_BLOCKING_GAP',
      label: `${blk.barrier.label} → ${blk.gap.label}`,
      detail: `${blk.barrier.label}${sev ? ` (${sev})` : ''} is blocking ${blk.gap.label} — resolve the barrier to close the gap`,
      urgency: 'warning',
      relatedNodeIds: [blk.barrier.id, blk.gap.id, memberId].filter(Boolean) as string[],
      action: 'Act',
      targetLens: 'social',
      chainNodeIds: [blk.barrier.id, blk.gap.id],
    });
  } else {
    // No explicit block — surface the top SDOH barrier so the social story still shows.
    const barrier = [...nodes.filter((n) => n.type === 'SDOHNode')].sort(
      (a, b) => sevRank(str(b.properties?.severity)) - sevRank(str(a.properties?.severity))
    )[0];
    if (barrier) {
      out.push({
        id: 'ms-barrier',
        type: 'SDOH_BARRIER',
        label: `${barrier.label}${barrier.properties?.severity ? ` · ${str(barrier.properties.severity)}` : ''}`,
        detail: `SDOH barrier on record — assess impact on open care gaps`,
        urgency: 'warning',
        relatedNodeIds: [barrier.id, memberId].filter(Boolean) as string[],
        action: 'View',
        targetLens: 'social',
      });
    }
  }

  // 3. Eligibility / benefit action if the member has one.
  const elig = nodes.find(
    (n) => n.type !== 'Member' && (n.lens as string[]).includes('eligibility')
  );
  if (elig) {
    out.push({
      id: 'ms-elig',
      type: 'BENEFIT_ACTION',
      label: `${elig.label}${elig.sublabel ? ` · ${elig.sublabel}` : ''}`,
      detail: `Coverage / benefit item — review enrollment and obligations`,
      urgency: 'info',
      relatedNodeIds: [elig.id, memberId].filter(Boolean) as string[],
      action: 'View',
      targetLens: 'eligibility',
    });
  }

  // 4. Behavioral screening if present.
  const bh = nodes.find((n) => n.type !== 'Member' && (n.lens as string[]).includes('behavioral'));
  if (bh) {
    out.push({
      id: 'ms-bh',
      type: 'BH_SCREENING',
      label: `${bh.label}${bh.sublabel ? ` · ${bh.sublabel}` : ''}`,
      detail: `Behavioral health item — screening / follow-up context`,
      urgency: 'info',
      relatedNodeIds: [bh.id, memberId].filter(Boolean) as string[],
      action: 'View',
      targetLens: 'behavioral' as LensType,
    });
  }

  return out.slice(0, 5);
}
