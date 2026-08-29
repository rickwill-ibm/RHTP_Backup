/**
 * DTR submit-readiness (findings M1/E1/E2).
 *
 * "Met" is reserved for a criterion actually satisfied by coded evidence. An UPLOAD marks a gap
 * "Attached — pending payer review", NOT "Met" (M1). Submission is gated on every REQUIRED group
 * being RESOLVED — met, or attached-with-a-document — never on a trivially-flippable "met" flag
 * or on mere file presence (E2, guards-fail-closed). Pure.
 */
import type { DtrMatchResult, DtrGroup } from '@/lib/pa/pa-types';
import { isGroupResolved } from '@/lib/pa/dtrQuestionnaireResponse';

export type GroupPresentation = 'met' | 'attached-pending' | 'gap';

/** How a group should be presented — an attachment is pending review, not "Met". */
export function groupPresentation(g: DtrGroup): GroupPresentation {
  if (g.status === 'met') return 'met';
  if (g.status === 'pending' && g.uploadedDocumentReference) return 'attached-pending';
  return 'gap';
}

/** Human label for a presentation state. */
export function groupPresentationLabel(p: GroupPresentation): string {
  switch (p) {
    case 'met':
      return 'Met';
    case 'attached-pending':
      return 'Attached — pending payer review';
    default:
      return 'Gap — documentation required';
  }
}

export interface BlockingGroup {
  cpt: string;
  groupId: number;
  title: string;
}

export interface DtrReadiness {
  ready: boolean;
  requiredTotal: number;
  resolved: number;
  blocking: BlockingGroup[];
}

/**
 * Submit readiness across all DTR results. Ready only when every REQUIRED group is resolved.
 * A result set with no required groups at all is NOT auto-ready (nothing was actually established).
 */
export function dtrSubmitReadiness(dtr: DtrMatchResult[]): DtrReadiness {
  let requiredTotal = 0;
  let resolved = 0;
  const blocking: BlockingGroup[] = [];
  for (const d of dtr) {
    for (const g of d.groups) {
      if (g.required === false) continue;
      requiredTotal += 1;
      if (isGroupResolved(g)) resolved += 1;
      else blocking.push({ cpt: d.cptCode, groupId: g.id, title: g.title });
    }
  }
  const ready = requiredTotal > 0 && blocking.length === 0;
  return { ready, requiredTotal, resolved, blocking };
}
