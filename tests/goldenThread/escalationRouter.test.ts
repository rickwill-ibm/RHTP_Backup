/**
 * escalationRouter.ts — the Wave-7 BRIDGE that routes the Wave-6 escalation signals
 * through the EXISTING queue / inbox / escalation-as-data engine.
 *
 * Proves the bridge COMPOSES (never re-derives): the durable WorkItem comes from
 * `recoveryReviewItem`, the gate/signals from `deriveEscalationSignals`, the SLA breach
 * from `isSlaBreached`, and the next hop from the shipped policy set via
 * `getEscalationTier` + `nextEscalationStep`. Proves the enqueue reuses the existing
 * `ProposalInbox`, the per-party lens partitions `EscalationSignal.party`, the exposed
 * queue item is PHI-safe (member-embedding ids masked), and the result is deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordRecovery,
  recordRecoveryTerminal,
  type EvidenceRecord,
} from '@/lib/evidence';
import { MASKED_RECORD_REF } from '@/lib/evidence/partyView';
import { createMemoryProposalInbox, loadEscalationPolicies } from '@/lib/agentRuntime';
import { REVENUE_CYCLE_AGENT_ID } from '@/lib/agents/revenueCycle';
import { deriveEscalationSignals } from '@/lib/goldenThread/escalationSignals';
import { routeEscalation, type EscalationRouterContext } from '@/lib/goldenThread/escalationRouter';

const MEMBER = 'MARIA_SD_001';
const REC_ID = `ev-${MEMBER}-72148-1756512000000`;
const RECOVERY_ID = `${REC_ID}-recovery`;
const NOW = '2026-06-01T00:00:00.000Z';
const HOUR = 3_600_000;

function baseRecord(): EvidenceRecord {
  return createEvidenceRecord({
    id: REC_ID,
    memberId: MEMBER,
    order: { code: '72148' },
    createdAt: NOW,
  });
}

function withDraft(priority: 'urgent' | 'high' | 'routine' = 'routine'): EvidenceRecord {
  return recordRecovery(baseRecord(), {
    id: RECOVERY_ID,
    ts: NOW,
    action: 'draft-appeal',
    rung: 'A1',
    remittanceId: 'rem-1',
    priority,
    taskEvidenceTier: 'D3',
  });
}

function ctx(over: Partial<EscalationRouterContext> = {}): EscalationRouterContext {
  return {
    now: NOW,
    inbox: createMemoryProposalInbox(),
    policies: loadEscalationPolicies(),
    escalationPolicyRef: 'default',
    manifestTier: 'HITL',
    ...over,
  };
}

describe('routeEscalation — reuse-first bridge', () => {
  it('no recovery draft → no queue item, no hop, empty notifications (composes recoveryReviewItem)', async () => {
    const r = await routeEscalation(baseRecord(), ctx());
    expect(r.queueItem).toBeNull();
    expect(r.escalationStep).toBeNull();
    expect(r.gate).toBe('assist');
    expect(r.notifications).toEqual({ payer: [], provider: [] });
  });

  it('recovery draft within SLA → routed agent-proposal item + per-party lens; no hop', async () => {
    const r = await routeEscalation(withDraft(), ctx());
    expect(r.queueItem).not.toBeNull();
    expect(r.queueItem?.queue).toBe('agent-proposal');
    expect(r.escalationStep).toBeNull();
    // Per-party lens partitions EscalationSignal.party (payer action / provider info).
    expect(r.notifications.payer.some((s) => s.kind === 'reviewer-action-required')).toBe(true);
    expect(r.notifications.provider.some((s) => s.kind === 'recovery-in-progress')).toBe(true);
  });

  it('the exposed queue item is PHI-safe — the member-embedding recovery id is masked', async () => {
    const r = await routeEscalation(withDraft(), ctx());
    expect(r.queueItem?.recordRef).toBe(MASKED_RECORD_REF);
    // The whole routed result never leaks the member id (embedded in ev-<member>-…-recovery).
    expect(JSON.stringify(r)).not.toContain(MEMBER);
  });

  it('enqueues through the EXISTING ProposalInbox with the real ids (internal substrate)', async () => {
    const inbox = createMemoryProposalInbox();
    await routeEscalation(withDraft(), ctx({ inbox }));
    const pending = await inbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      proposalId: RECOVERY_ID,
      agentId: REVENUE_CYCLE_AGENT_ID,
      status: 'pending',
    });
    expect(pending[0].item.queue).toBe('agent-proposal');
  });

  it('SLA breached → next hop from the shipped policy set; item moves to the escalated queue', async () => {
    // routine → standard SLA (168h). Advance well past the due date to breach it.
    const inbox = createMemoryProposalInbox();
    const breached = new Date(Date.parse(NOW) + 200 * HOUR).toISOString();
    const r = await routeEscalation(withDraft('routine'), ctx({ now: breached, inbox }));
    expect(r.escalationStep).toMatchObject({
      kind: 'escalate',
      level: 0,
      target: 'assigned-reviewer',
      slaHours: 72,
    });
    expect(r.queueItem?.queue).toBe('escalated');
    // The escalated placement is what the inbox holds too.
    expect((await inbox.pending())[0].item.queue).toBe('escalated');
  });

  it('SLA breached with the hierarchy exhausted → park (never silent expiry)', async () => {
    const breached = new Date(Date.parse(NOW) + 200 * HOUR).toISOString();
    // routine hierarchy has one level; hopsSoFar=1 exhausts it → park.
    const r = await routeEscalation(withDraft('routine'), ctx({ now: breached, hopsSoFar: 1 }));
    expect(r.escalationStep?.kind).toBe('park');
  });

  it('reuses a pre-derived EscalationResult instead of re-deriving (route computes signals once)', async () => {
    const rec = withDraft();
    const pre = deriveEscalationSignals(rec, { now: NOW, manifestTier: 'HITL' });
    const r = await routeEscalation(rec, ctx(), pre);
    expect(r.gate).toBe(pre.gate);
    expect(r.signals).toBe(pre.signals);
  });

  it('a terminal recovery drops from the routed queue (reuses isRecoveryTerminal via recoveryReviewItem)', async () => {
    let rec = withDraft();
    rec = recordRecoveryTerminal(rec, {
      recoveryId: RECOVERY_ID,
      ts: NOW,
      status: 'submitted',
      decidedBy: 'reviewer-1',
      decidedAt: NOW,
    });
    const r = await routeEscalation(rec, ctx());
    expect(r.queueItem).toBeNull();
    // …but the terminal notification still surfaces to both parties.
    expect(r.notifications.payer.some((s) => s.kind === 'recovery-terminal')).toBe(true);
  });

  it('is deterministic (now + inbox injected)', async () => {
    const rec = withDraft();
    const a = await routeEscalation(rec, ctx());
    const b = await routeEscalation(rec, ctx());
    expect(a).toEqual(b);
  });
});
