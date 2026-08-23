/**
 * HITL work-queue reuse. An agent proposal is an `agent-proposal` work-queue
 * item in the EXISTING goldenThread queue — NOT a second inbox (DP-3). It reuses
 * the `WorkItem` shape and the CMS SLA math (`slaHours`) so the existing reviewer
 * inbox (`groupByQueue`) renders it with PA items unchanged.
 *
 * The ProposalInbox port is what the runtime writes to; the in-memory
 * implementation is the test/demo backing. A production router persists the
 * proposal as an ADR-005 evidence record and derives the WorkItem the same way
 * (owned by the agents-behavior module, not here).
 */
import { slaHours } from '@/lib/workflow/paMachine';
import type { QueueName, WorkItem } from '@/lib/goldenThread/workQueue';
import type { EscalationPriority, ProposedAction } from './types';

/** Escalation priority -> the PA SLA class used for the work item's display clock. */
function slaClass(priority: EscalationPriority): 'expedited' | 'standard' {
  return priority === 'urgent' ? 'expedited' : 'standard';
}

function addHoursIso(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3600_000).toISOString();
}

/**
 * Build an `agent-proposal` WorkItem for the reviewer inbox. `code` carries the
 * action type (PHI-safe), `evidenceId` carries the proposalId, `note` the
 * code-level summary. dueBy uses the same epoch math as `routeToQueue`.
 */
export function buildProposalWorkItem(input: {
  proposalId: string;
  memberId: string;
  action: ProposedAction;
  submittedAtMs: number;
  queue?: QueueName;
}): WorkItem {
  const priority = slaClass(input.action.priority);
  const hours = slaHours(priority);
  const submittedAt = new Date(input.submittedAtMs).toISOString();
  return {
    queue: input.queue ?? 'agent-proposal',
    disposition: 'agent-proposal',
    priority,
    slaHours: hours,
    submittedAt,
    dueBy: addHoursIso(submittedAt, hours),
    evidenceId: input.proposalId,
    memberId: input.memberId,
    code: input.action.actionType,
    note: input.action.summary ?? `Agent proposal (${input.action.priority}) awaiting review.`,
  };
}

/** A pending agent proposal held in the inbox until a human decides. */
export interface PendingProposal {
  proposalId: string;
  workflowId: string;
  memberId: string;
  agentId: string;
  item: WorkItem;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
}

/**
 * The HITL work-queue port. `enqueue` posts a proposal; `resolve` records the
 * human decision; `list` / `pending` back the reviewer view. Reuse, not a new
 * inbox: items are goldenThread WorkItems in the `agent-proposal` queue.
 */
export interface ProposalInbox {
  enqueue(p: PendingProposal): Promise<void>;
  resolve(proposalId: string, decision: 'approved' | 'rejected', decidedBy: string): Promise<void>;
  get(proposalId: string): Promise<PendingProposal | undefined>;
  list(): Promise<PendingProposal[]>;
  pending(): Promise<PendingProposal[]>;
}

/** In-memory ProposalInbox (tests + demo). */
export function createMemoryProposalInbox(): ProposalInbox {
  const byId = new Map<string, PendingProposal>();
  return {
    async enqueue(p) {
      byId.set(p.proposalId, { ...p });
    },
    async resolve(proposalId, decision, decidedBy) {
      const p = byId.get(proposalId);
      if (!p) return;
      p.status = decision;
      p.decidedBy = decidedBy;
    },
    async get(proposalId) {
      const p = byId.get(proposalId);
      return p ? { ...p } : undefined;
    },
    async list() {
      return [...byId.values()].map((p) => ({ ...p }));
    },
    async pending() {
      return [...byId.values()].filter((p) => p.status === 'pending').map((p) => ({ ...p }));
    },
  };
}
