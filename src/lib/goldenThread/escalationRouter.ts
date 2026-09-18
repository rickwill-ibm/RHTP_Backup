/**
 * escalationRouter.ts — the thin BRIDGE that routes the Wave-6 escalation SIGNALS
 * through the EXISTING queue / inbox / escalation-as-data engine (Wave-7).
 *
 * This module is GLUE, not logic. It reimplements NOTHING: it composes the machinery
 * that already exists and TAILORS the pieces together for a shared Evidence Record —
 *
 *   • the durable reviewer WorkItem  ← `recoveryReviewItem` (workQueueView.ts)
 *   • the gate + PHI-safe signals    ← `deriveEscalationSignals` (escalationSignals.ts)
 *   • the SLA-breach test            ← `isSlaBreached` (workQueue.ts)
 *   • the next escalation hop        ← `getEscalationTier` + `nextEscalationStep`
 *                                        over the shipped policy set (escalation.ts)
 *   • the HITL work-queue port       ← `ProposalInbox.enqueue` (inbox.ts)
 *   • the per-party notification lens ← partitioning `EscalationSignal.party`
 *
 * NO SLA / escalation / tier / gate / deadline math is invented here. If this file
 * grows large it is duplicating something that already exists — it must stay small.
 *
 * PHI-safety: the queue item exposed to a party is MASKED (the recovery id is
 * `ev-<memberId>-…-recovery` and `WorkItem.memberId` is the real member — both are
 * member-embedding), reusing the Wave-6 `MASKED_RECORD_REF` discipline. The
 * notifications are `EscalationSignal`s, already PHI-safe by construction (references,
 * codes, amounts, rungs — never a memberId). The ProposalInbox record carries the real
 * ids because it is the INTERNAL demo substrate (matching the existing PendingProposal
 * shape the runtime writes); it is never returned across a party boundary.
 *
 * Determinism: `now` and the `inbox` are injected — no wall-clock, no ambient state.
 */
import { latestOfType, type EvidenceRecord, type StoredIntegrity } from '@/lib/evidence';
import { MASKED_RECORD_REF } from '@/lib/evidence/partyView';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import { REVENUE_CYCLE_AGENT_ID } from '@/lib/agents/revenueCycle';
import {
  getEscalationTier,
  nextEscalationStep,
  type EscalationPolicies,
  type EscalationPriority,
  type EscalationStep,
  type PendingProposal,
  type ProposalInbox,
} from '@/lib/agentRuntime';
import { isSlaBreached, type WorkItem } from './workQueue';
import { recoveryReviewItem } from './workQueueView';
import {
  deriveEscalationSignals,
  type EscalationResult,
  type EscalationSignal,
  type ProcessGate,
} from './escalationSignals';

/** PHI-safe projection of a routed WorkItem — member-embedding ids masked out. */
export interface PartyQueueItem {
  /** Masked, member-free record reference (never the real `ev-<memberId>-…` id). */
  recordRef: string;
  queue: WorkItem['queue'];
  disposition: string;
  priority: WorkItem['priority'];
  slaHours: number;
  submittedAt: string;
  dueBy: string;
  /** The action code (`draft-appeal`) — PHI-safe. */
  code: string;
  note: string;
}

/** The per-party notification lens: what each side should see + act on. */
export interface PartyNotifications {
  payer: EscalationSignal[];
  provider: EscalationSignal[];
}

export interface EscalationRouterContext {
  /** Injected clock (ISO) — no wall-clock is read here. */
  now: string;
  /** The HITL work-queue port (demo substrate is the in-memory inbox). */
  inbox: ProposalInbox;
  /** The shipped escalation policy set (reuse `loadEscalationPolicies()`). */
  policies: EscalationPolicies;
  /** The recovery agent's manifest escalation-policy ref (e.g. `'default'`). */
  escalationPolicyRef: string;
  /** The recovery agent's granted autonomy tier (passed through to the signal derivation). */
  manifestTier?: AutonomyTier;
  /** The read-path integrity attestation, when the caller verified the seal on read. */
  integrity?: StoredIntegrity | null;
  /** Agent id stamped on the enqueued proposal (defaults to the revenue-cycle agent). */
  agentId?: string;
  /**
   * Escalation hops already fired against the DURABLE item. The durable read carries no
   * in-memory hop history (the per-request engine's hop counter dies with the request),
   * so this defaults to 0 — the routed step is then the FIRST unattended hop. A durable
   * escalation SWEEP that accumulates hops over persisted deadlines is a production item
   * (the Wave-3/4 `overdueRecoveryItems` follow-up); it would pass its accumulated count
   * here. See FAKE_FIDELITY.md.
   */
  hopsSoFar?: number;
}

export interface RoutedEscalation {
  /** The process gate over the authority ladder (from `deriveEscalationSignals`). */
  gate: ProcessGate;
  /** The full PHI-safe signal set (from `deriveEscalationSignals`). */
  signals: EscalationSignal[];
  /** Per-party notification lens derived from `EscalationSignal.party`. */
  notifications: PartyNotifications;
  /** The routed, PHI-safe queue item — `null` when the record carries no recovery draft. */
  queueItem: PartyQueueItem | null;
  /**
   * The next escalation hop, present ONLY when the item's SLA is breached as of `now`
   * (computed via the EXISTING `getEscalationTier` + `nextEscalationStep`). `null` while
   * the item is within its SLA (or when there is no item).
   */
  escalationStep: EscalationStep | null;
}

/** Partition the shared signals into the payer / provider lenses (`both` reaches each). */
function partitionByParty(signals: EscalationSignal[]): PartyNotifications {
  return {
    payer: signals.filter((s) => s.party === 'payer' || s.party === 'both'),
    provider: signals.filter((s) => s.party === 'provider' || s.party === 'both'),
  };
}

/** Mask the member-embedding fields off a WorkItem before it crosses a party boundary. */
function maskQueueItem(item: WorkItem): PartyQueueItem {
  return {
    recordRef: MASKED_RECORD_REF,
    queue: item.queue,
    disposition: item.disposition,
    priority: item.priority,
    slaHours: item.slaHours,
    submittedAt: item.submittedAt,
    dueBy: item.dueBy,
    code: item.code,
    note: item.note,
  };
}

/** The persisted materiality-driven priority the tier lookup keys on (routine fallback). */
function recoveryPriorityOf(record: EvidenceRecord): EscalationPriority {
  return latestOfType(record, 'recovery')?.priority ?? 'routine';
}

/**
 * Route a shared Evidence Record's recovery signals through the existing engine.
 *
 * Composes (never re-derives): the gate + signals (`deriveEscalationSignals`, reused
 * from `pre` when the caller already derived them so the route computes them once), the
 * durable WorkItem (`recoveryReviewItem`), the SLA-breach test (`isSlaBreached`) and the
 * next hop (`getEscalationTier` + `nextEscalationStep`). Places the item on the existing
 * `escalated` `QueueName` on breach — exactly as the runtime engine does — enqueues it
 * through the injected `ProposalInbox`, and returns a PHI-safe, per-party view.
 *
 * Pure aside from the single `inbox.enqueue` port write (the demo substrate is a fresh
 * in-memory inbox per request, so the enqueue is idempotent-by-id and mutates no shared
 * or durable state). Returns `queueItem: null` / `escalationStep: null` when the record
 * carries no recovery draft.
 */
export async function routeEscalation(
  record: EvidenceRecord,
  ctx: EscalationRouterContext,
  pre?: EscalationResult
): Promise<RoutedEscalation> {
  // (1) gate + signals — reuse the caller's derivation when supplied (route computes once).
  const { gate, signals } =
    pre ??
    deriveEscalationSignals(record, {
      now: ctx.now,
      manifestTier: ctx.manifestTier,
      integrity: ctx.integrity,
    });
  const notifications = partitionByParty(signals);

  // (2) the durable reviewer WorkItem — reuse `recoveryReviewItem` (do not re-derive).
  const item = recoveryReviewItem(record);
  if (!item) {
    return { gate, signals, notifications, queueItem: null, escalationStep: null };
  }

  // (3) SLA breach → the next escalation hop from the SHIPPED policy set. No SLA or
  // escalation math is invented: `isSlaBreached` decides breach, `getEscalationTier` +
  // `nextEscalationStep` decide the hop. On an `escalate` hop the item moves to the
  // existing `escalated` QueueName — mirroring the runtime engine's own placement.
  let placed = item;
  let escalationStep: EscalationStep | null = null;
  if (isSlaBreached(item, ctx.now)) {
    const tier = getEscalationTier(
      ctx.policies,
      ctx.escalationPolicyRef,
      recoveryPriorityOf(record)
    );
    escalationStep = nextEscalationStep(tier, ctx.hopsSoFar ?? 0);
    if (escalationStep.kind === 'escalate') placed = { ...item, queue: 'escalated' };
  }

  // (4) enqueue through the EXISTING ProposalInbox port (internal demo substrate — it
  // carries the real ids the runtime's PendingProposal shape uses; never returned to a
  // party). A durable queue backend stays a production item (FAKE_FIDELITY.md).
  const proposal: PendingProposal = {
    proposalId: placed.evidenceId,
    workflowId: `${placed.evidenceId}::wf`,
    memberId: placed.memberId,
    agentId: ctx.agentId ?? REVENUE_CYCLE_AGENT_ID,
    item: placed,
    status: 'pending',
  };
  await ctx.inbox.enqueue(proposal);

  // (5) PHI-safe, per-party view — the queue item is masked before it crosses the boundary.
  return { gate, signals, notifications, queueItem: maskQueueItem(placed), escalationStep };
}
