// wpcGraph/storySteps.ts — derive a member's decision narrative (variable length).
// Canonical beats: Finding → Why now → Do this → Who → Blocked by, extended by any
// additional critical findings. Generic for ANY member (never keyed on patient id);
// reuses buildMemberSignals + topBlock. Pure.

import type { GraphNode, GraphEdge } from './types';
import { buildMemberSignals, topBlock } from './memberSignals';
import { isOverdue, daysOpenOf, daysToDeadline, severityRank } from './derivationPrimitives';

export type StepTone = 'critical' | 'warning' | 'neutral' | 'done';

export interface StoryStep {
  key: string;
  label: string;
  value: string;
  tag?: string;
  tone: StepTone;
  relatedNodeIds?: string[];
}

const toneFromUrgency = (u: string): StepTone =>
  u === 'critical'
    ? 'critical'
    : u === 'warning'
      ? 'warning'
      : u === 'success'
        ? 'done'
        : 'neutral';

const tagFromType = (t?: string): string | undefined =>
  t
    ? t
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\s+/g, '')
    : undefined;

export function buildStorySteps(
  nodes: GraphNode[],
  edges: GraphEdge[],
  authored = false
): StoryStep[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const signals = buildMemberSignals(nodes, edges, authored);
  const block = topBlock(nodes, edges);

  if (!signals.length && !block) {
    return [
      { key: 'finding', label: 'FINDING', value: 'No active findings on file', tone: 'done' },
    ];
  }

  const steps: StoryStep[] = [];
  const top = signals[0];

  // 1 · Finding
  if (top) {
    steps.push({
      key: 'finding',
      label: 'FINDING',
      value: top.label,
      tone: toneFromUrgency(top.urgency),
      relatedNodeIds: top.relatedNodeIds,
    });
  }

  // 2 · Why now (timing on the finding's primary care gap)
  const gap = top
    ? top.relatedNodeIds
        .map((id) => byId.get(id))
        .find((n): n is GraphNode => n?.type === 'CareGap')
    : undefined;
  if (gap) {
    if (isOverdue(gap)) {
      steps.push({
        key: 'why-now',
        label: 'WHY NOW',
        value: `${daysOpenOf(gap)} DAYS PAST DUE`,
        tag: 'OVERDUE',
        tone: 'critical',
        relatedNodeIds: [gap.id],
      });
    } else {
      const d = gap.validUntilDays ?? daysToDeadline(gap);
      if (d != null) {
        steps.push({
          key: 'why-now',
          label: 'WHY NOW',
          value: `${d} DAYS TO DEADLINE`,
          tag: 'HEDIS',
          tone: d <= 14 ? 'warning' : 'neutral',
          relatedNodeIds: [gap.id],
        });
      } else {
        steps.push({
          key: 'why-now',
          label: 'WHY NOW',
          value: `OPEN ${daysOpenOf(gap)} DAYS`,
          tone: 'neutral',
          relatedNodeIds: [gap.id],
        });
      }
    }
  }

  // 3 · Do this (action)
  if (top) {
    const doMap: Record<string, string> = {
      'View Chain': 'Trace the blocking chain',
      Act: 'Act now to resolve',
      View: 'Review in context',
    };
    steps.push({
      key: 'do-this',
      label: 'DO THIS',
      value: doMap[top.action] ?? (top.action || 'Review'),
      tag: tagFromType(top.type),
      tone: 'neutral',
      relatedNodeIds: top.relatedNodeIds,
    });
  }

  // 4 · Who (owner / route)
  const owner = gap ? String(gap.properties.assignedTo ?? '') : '';
  const provider = nodes.find((n) => n.type === 'Provider');
  steps.push({
    key: 'who',
    label: 'WHO',
    value: owner || provider?.label || 'Care team',
    tag: 'OWNER',
    tone: 'neutral',
  });

  // 5 · Blocked by (barrier → gap, or clean)
  if (block) {
    const sev = String(block.barrier.properties.severity ?? '');
    steps.push({
      key: 'blocked-by',
      label: 'BLOCKED BY',
      value: `${block.barrier.label} blocks ${block.gap.label}`,
      tag: sev || undefined,
      tone: severityRank(sev) >= 3 ? 'critical' : 'warning',
      relatedNodeIds: [block.barrier.id, block.gap.id],
    });
  } else {
    steps.push({
      key: 'blocked-by',
      label: 'BLOCKED BY',
      value: 'Nothing blocking — no barrier on file',
      tone: 'done',
    });
  }

  // Variable length — one extra beat per additional critical finding (cap 2).
  signals
    .slice(1)
    .filter((s) => s.urgency === 'critical')
    .slice(0, 2)
    .forEach((s, i) => {
      steps.push({
        key: `also-${i + 1}`,
        label: 'ALSO',
        value: s.label,
        tag: tagFromType(s.type),
        tone: 'critical',
        relatedNodeIds: s.relatedNodeIds,
      });
    });

  return steps;
}
