/**
 * Work-queue view (reviewer UI).
 *
 * Derives reviewer WorkItems from persisted Evidence Records so the inbox can be
 * reconstructed from the durable store (no separate work-item table needed).
 * Pure derivation + a small async lister over an EvidenceStore.
 */
import { summarize, latestOfType, hasEntryId, type EvidenceRecord } from '@/lib/evidence';
import type { EvidenceStore } from '@/lib/evidence/evidenceStore';
import { buildProposalWorkItem } from '@/lib/agentRuntime';
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

/**
 * Wave-3 (F1 correction #2): a persisted recovery DRAFT is a durable, actionable
 * reviewer item. Derive an `agent-proposal` WorkItem from a `type:'recovery'
 * status:'draft'` evidence entry so the recovery the governed agent produced is
 * visible in the existing reviewer inbox AFTER the request (and its ephemeral engine
 * inbox) are gone. Reuses `buildProposalWorkItem` — the SAME machinery proposeAndWait
 * uses — so it renders alongside live agent proposals unchanged. Additive: the
 * `workItemFromEvidence` derivation above is untouched. Returns `undefined` when the
 * record carries no recovery draft.
 */
/**
 * Wave-4 must-fix 4 — a recovery is TERMINAL (must NOT be re-proposed) once a
 * qualified-human decision resolved it: either the append-only spine carries the
 * deterministic `recovery-decision` marker (`${recoveryId}-decision`, written by
 * recordRecoveryTerminal on BOTH the submit and reject paths) OR the recovery entry
 * status has transitioned off 'draft'. A rejected recovery is as terminal as a
 * submitted one — neither returns to the reviewer inbox. Pure — reads, never mutates.
 */
export function isRecoveryTerminal(
  record: EvidenceRecord,
  recovery: Extract<EvidenceRecord['entries'][number], { type: 'recovery' }>
): boolean {
  if (recovery.status === 'submitted' || recovery.status === 'rejected') return true;
  return hasEntryId(record, `${recovery.id}-decision`);
}

export function recoveryReviewItem(record: EvidenceRecord): WorkItem | undefined {
  const recovery = latestOfType(record, 'recovery');
  if (!recovery || recovery.status !== 'draft') return undefined;
  // must-fix 4: a terminal recovery (a recovery-decision marker exists) drops from
  // the reviewer inbox — a submitted/rejected recovery is never re-proposed.
  if (isRecoveryTerminal(record, recovery)) return undefined;
  return buildProposalWorkItem({
    proposalId: recovery.id,
    memberId: record.memberId,
    action: {
      actionType: recovery.action,
      // MED-NEW: surface the persisted materiality-driven priority (urgent / routine, or
      // the C6 `deadline-unknown` triage sentinel) so the durable reviewer item's
      // priority/slaHours/dueBy reflect urgency instead of a hardcoded 'routine'. The SLA
      // clock treats a non-urgent priority as standard; escalation maps deadline-unknown to
      // the high tier. Falls back to 'routine' for pre-MED-NEW entries.
      priority: recovery.priority ?? 'routine',
      refs: {
        recovery: recovery.id,
        rung: recovery.rung,
        ...(recovery.remittanceId ? { remittance: recovery.remittanceId } : {}),
        // HIGH-2: surface the timely-filing deadline on the durable work item so the
        // reviewer inbox shows when the payer appeal window closes.
        ...(recovery.filingDeadline ? { filingDeadline: recovery.filingDeadline } : {}),
      },
      summary: `Underpayment recovery ${recovery.action} DRAFT (rung ${recovery.rung}) awaiting review`,
    },
    submittedAtMs: Date.parse(recovery.ts),
  });
}

/**
 * Wave-3 HIGH-2 — PURE selector: the recovery work items whose timely-filing
 * deadline has PASSED as of `now`. Reuses `recoveryReviewItem` (the SAME durable
 * derivation the inbox uses), so it ranks alongside live proposals unchanged. A
 * recovery with no persisted `filingDeadline` is excluded (undeterminable). This is
 * the read a scheduler WOULD call to escalate an overdue recovery before its payer
 * appeal window closes.
 *
 * DEFERRED TO WAVE-4 (documented for the coalition-log): wiring an ACTUAL durable
 * sweep / cron that periodically evaluates this selector over the store and escalates
 * (re-prioritizes / re-notifies) is a Wave-4 item. The per-request engine's escalation
 * timers do NOT govern the durable item — they die with the request; only a durable
 * sweep over persisted deadlines can. This function is that sweep's pure core.
 */
export function overdueRecoveryItems(records: EvidenceRecord[], now: string): WorkItem[] {
  const nowMs = Date.parse(now);
  const out: WorkItem[] = [];
  for (const record of records) {
    const recovery = latestOfType(record, 'recovery');
    if (!recovery || recovery.status !== 'draft' || !recovery.filingDeadline) continue;
    // must-fix 4: a terminal recovery (submitted/rejected via the recovery-decision
    // marker) is NEVER overdue — it has already been decided, so the sweep skips it.
    if (isRecoveryTerminal(record, recovery)) continue;
    if (Date.parse(recovery.filingDeadline) >= nowMs) continue; // still within the window
    const item = recoveryReviewItem(record);
    if (item) out.push(item);
  }
  return out;
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
    if (!record) continue;
    items.push(workItemFromEvidence(record, opts));
    // Additive: surface the persisted recovery draft as a durable reviewer item.
    const review = recoveryReviewItem(record);
    if (review) items.push(review);
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
