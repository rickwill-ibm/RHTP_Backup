// careTeam/visitPlan.ts — NBA-driven home-visit plan, for every citizen.
// Maria: keystone bundle from the knowledge graph (BLOCKS traversal).
// Other citizens: derived from their registry social needs (graceful degradation).

import { keystones, totalUnblockedGaps } from './graph/keystones';
import { citizenNeeds } from './graph/resources';
import { DEMO_MEMBER_ID } from '../config/demoDefaults';

export interface VisitPlanItem {
  id: string;
  label: string;
  domain: 'Social';
  keystone?: boolean;
  impact?: string;
}

export interface VisitPlan {
  items: VisitPlanItem[];
  keystoneNote?: string;
}

const NEED_ACTION: Record<string, string> = {
  Transportation: 'Arrange NEMT transportation',
  Food: 'Submit SNAP / food assistance referral',
  Housing: 'Initiate housing navigator referral',
  Financial: 'Submit benefit enrollment (SNAP/WIC/LIHEAP)',
  'Behavioral Health': 'Coordinate BH engagement / follow-up',
  'Social Isolation': 'Connect to community / Area Agency on Aging',
  Employment: 'Refer to employment services',
};

export function visitPlanFor(patientId: string): VisitPlan {
  if (patientId === DEMO_MEMBER_ID) {
    const ks = keystones();
    const items: VisitPlanItem[] = [
      ...ks.map((k, i) => ({
        id: `ks-${i}`,
        label: `Arrange ${k.barrier.replace(/ Barrier$/i, '').toLowerCase()} support`,
        domain: 'Social' as const,
        keystone: true,
        impact: `Unblocks ${k.blockedGaps.join(', ')}`,
      })),
      { id: 'snap', label: 'Submit SNAP renewal + WIC re-enrollment', domain: 'Social', impact: 'Food access' },
      { id: 'prapare', label: 'Complete PRAPARE social needs screening', domain: 'Social' },
      { id: 'liheap', label: 'LIHEAP utility assistance application', domain: 'Social' },
    ];
    return {
      items,
      keystoneNote: `Keystone actions unblock ${totalUnblockedGaps()} clinical gap(s) the care manager is tracking.`,
    };
  }

  // Registry-derived plan for every other citizen
  const needs = citizenNeeds(patientId);
  const items: VisitPlanItem[] = needs.map((n, i) => ({
    id: `need-${i}`,
    label: NEED_ACTION[n.category] ?? `Address ${n.label}`,
    domain: 'Social',
    impact: `${n.label} · ${n.severity}`,
  }));
  items.push({ id: 'prapare', label: 'Complete PRAPARE social needs screening', domain: 'Social' });
  items.push({ id: 'goals', label: 'Review whole-person care plan goals', domain: 'Social' });
  return { items };
}
