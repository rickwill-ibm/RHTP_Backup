/**
 * Work-queue view (reviewer UI).
 *
 * Derives reviewer WorkItems from persisted Evidence Records so the inbox can be
 * reconstructed from the durable store (no separate work-item table needed).
 * Pure derivation + a small async lister over an EvidenceStore.
 */
import { summarize, latestOfType, type EvidenceRecord } from '@/lib/evidence';
import type { EvidenceStore } from '@/lib/evidence/evidenceStore';
import { routeToQueue, type WorkItem, type QueueName } from './workQueue';

export function workItemFromEvidence(
  record: EvidenceRecord,
  opts?: { priority?: 'expedited' | 'standard' }
): WorkItem {
  const summary = summarize(record);
  const prop = latestOfType(record, 'propensity');
  const netOutcome = summary.netOutcome === 'undetermined' ? 'no-policy-found' : summary.netOutcome;
  return routeToQueue({
    netOutcome,
    requiresPA: summary.requiresPA,
    propensity: prop ? { score: prop.score, band: prop.band } : undefined,
    priority: opts?.priority ?? 'standard',
    submittedAt: record.createdAt,
    evidenceId: record.id,
    memberId: record.memberId,
    code: record.order.code,
  });
}

/** List all work items from the store (newest-persisted first is caller's concern). */
export async function listWorkItems(
  store: EvidenceStore,
  opts?: { priority?: 'expedited' | 'standard' }
): Promise<WorkItem[]> {
  const ids = await store.list();
  const items: WorkItem[] = [];
  for (const id of ids) {
    const record = await store.get(id);
    if (record) items.push(workItemFromEvidence(record, opts));
  }
  return items;
}

/** Group work items by queue for the inbox display. */
export function groupByQueue(items: WorkItem[]): Record<QueueName, WorkItem[]> {
  const groups: Record<QueueName, WorkItem[]> = {
    'auto-cleared': [],
    'ready-to-submit': [],
    'high-risk-review': [],
    'denied-appeal': [],
    'more-info': [],
    'agent-proposal': [],
    escalated: [],
  };
  for (const it of items) groups[it.queue].push(it);
  return groups;
}
