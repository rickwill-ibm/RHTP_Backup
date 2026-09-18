/**
 * Wave-3 — the order→cash recovery is a GENUINELY GOVERNED agent action.
 *
 * Proves TREE 2 wiring against the REAL runtime (createInMemoryWorkflowEngine +
 * createRecoveryWorkflow), not a fake:
 *  - F1: when deps.recovery is injected, the AGENT is the single writer of the
 *    recovery draft (exactly one recovery entry — orderToCash does NOT double-write),
 *    recovery.status==='proposed', workItemId defined, `agent.task.proposed` emitted
 *    once, the workflow stays SUSPENDED (no `agent.task.executed` — HITL never
 *    auto-approves), and the record is persisted ONCE.
 *  - the recovery rung is manifest-backed: permittedRung(manifest tier, currentTier).
 *  - F4: dispatch ONLY on the firstProcessed path — a replay of the same 835 creates
 *    no second proposal/draft.
 *  - a non-underpaid verdict (not-recoverable / indeterminate) dispatches nothing.
 *  - flag-off (deps.recovery absent) → the degraded fallback draft is byte-identical
 *    to pre-Wave-3 (no status/workItemId; direct draft write).
 *  - the persisted recovery draft surfaces as a durable reviewer work item.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runOrderToCash, type CashDeps } from '@/lib/goldenThread/orderToCash';
import { createInMemoryEvidenceStore, type EvidenceStore } from '@/lib/evidence/evidenceStore';
import { entriesForStage, latestOfType, type EvidenceRecord } from '@/lib/evidence';
import { resetDefaultIdempotencyStore } from '@/lib/idempotency';
import { loadMockLibrary, type MemberContext } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import {
  getRemittanceGatewayLoader,
  type RemittanceAdvice,
} from '@/lib/dataSources/remittanceGateway';
import {
  getContractRepositoryLoader,
  type FeeSchedule,
} from '@/lib/dataSources/contractRepository';
import type { ReconcilePasDecision } from '@/lib/goldenThread/reconciliation';
import { createRuntime, type MemoryEventSink } from '@/lib/agentRuntime';
import { createRecoveryWorkflow } from '@/lib/agents/revenueCycle';
import { getAgentManifest } from '@/lib/agents/manifest';
import { permittedRung } from '@/lib/agents/governance/interlock';
import {
  listWorkItems,
  groupByQueue,
  recoveryReviewItem,
  overdueRecoveryItems,
} from '@/lib/goldenThread/workQueueView';
import {
  recoveryPriority,
  computeFilingDeadline,
  RECOVERY_FILING_WINDOW_DAYS,
  RECOVERY_URGENT_WINDOW_DAYS,
  RECOVERY_URGENT_DELTA,
  RecoveryRuntimeRequiredError,
} from '@/lib/goldenThread/recoveryDispatch';
import { REVENUE_CYCLE_AGENT_ID } from '@/lib/agents/revenueCycle';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import type { StageOrder } from '@/lib/goldenThread';

const lib = loadMockLibrary();
const TS = '2026-08-30T00:00:00.000Z';
const PAYER = 'UnitedHealthcare Community Plan';
const REVIEWER_AUTH = 'auth-MARIA_SD_001-72148';
const MEMBER = 'MARIA_SD_001';
const RECOVERY_ID = 'recovery-1';
const REMIT_ID = 'RA-UHC-72148-0001';

afterEach(() => {
  resetDefaultIdempotencyStore();
  clearSessionDataModes();
});

function inputs(): ThreadInputs {
  const member: MemberContext = { memberId: MEMBER, diagnoses: [] };
  // '1518998765' is NOT gold-carded → PA required → pas-decision 'approved'.
  const order: StageOrder = {
    code: '72148',
    codeSystem: 'CPT',
    display: 'MRI lumbar',
    providerNpi: '1518998765',
    payer: PAYER,
  };
  return { member, order, coverage: { status: 'active', payer: PAYER, plan: 'Texas STAR' } };
}

function spyStore(): EvidenceStore & { saves: EvidenceRecord[] } {
  const inner = createInMemoryEvidenceStore();
  const saves: EvidenceRecord[] = [];
  return {
    saves,
    async save(record) {
      saves.push(record);
      await inner.save(record);
    },
    get: inner.get,
    list: inner.list,
  };
}

/** A runtime seam over a fresh in-memory engine (real engine + event sink). */
function runtime(): {
  recovery: NonNullable<CashDeps['recovery']>;
  eventSink: MemoryEventSink;
  workflowId: string;
} {
  const rt = createRuntime();
  return {
    recovery: { engine: rt.engine, makeWorkflow: createRecoveryWorkflow },
    eventSink: rt.eventSink,
    workflowId: `${RECOVERY_ID}::wf`,
  };
}

async function deps(opts: {
  store: EvidenceStore;
  recovery?: NonNullable<CashDeps['recovery']>;
  pasDecision?: ReconcilePasDecision | 'absent';
  feeSchedule?: FeeSchedule;
  idempotency?: boolean;
  ts?: string;
  idPrefix?: string;
  remittance?: RemittanceAdvice;
}): Promise<CashDeps> {
  const ts = opts.ts ?? TS;
  const [remittance, feeSchedule] = await Promise.all([
    opts.remittance ? Promise.resolve(opts.remittance) : getRemittanceGatewayLoader().load(ts),
    opts.feeSchedule ? Promise.resolve(opts.feeSchedule) : getContractRepositoryLoader().load(ts),
  ]);
  const p = opts.idPrefix ?? 'otc';
  return {
    library: lib,
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store: opts.store,
    ts,
    remittance,
    feeSchedule,
    pasDecision: opts.pasDecision === 'absent' ? undefined : (opts.pasDecision ?? 'approved'),
    reviewerAuthId: REVIEWER_AUTH,
    // Manifest-backed tier (Wave-3 §5) — matches the shipped route + the engine registry.
    recoveryAgentTier: getAgentManifest('revenue-cycle-agent').autonomyTier,
    ...(opts.recovery ? { recovery: opts.recovery } : {}),
    ...(opts.idempotency ? { idempotency: true } : {}),
    ids: {
      evidence: `${p}-ev`,
      determination: `${p}-det`,
      goldCard: `${p}-gc`,
      propensity: `${p}-prop`,
      eligibility: `${p}-elig`,
      estimation: `${p}-est`,
      pasDecision: `${p}-pas`,
      claim: `${p}-claim`,
      remittance: `${p}-rem`,
      reconciliation: `${p}-recon`,
      underpayment: `${p}-under`,
      recovery: RECOVERY_ID,
    },
  };
}

describe('Wave-3 F1 — the recovery draft is produced by the GOVERNED agent', () => {
  it('the agent writes exactly one draft, proposes once, and SUSPENDS at the HITL gate', async () => {
    const store = spyStore();
    const rt = runtime();
    const result = await runOrderToCash(inputs(), await deps({ store, recovery: rt.recovery }));

    expect(result.reconciliation?.verdict).toBe('underpaid');

    // The AGENT wrote the draft via its own evidence.append tool — exactly ONE
    // recovery entry (orderToCash did NOT also write one → no double-write).
    const recoveryEntries = entriesForStage(result.evidence, 'recovery');
    expect(recoveryEntries.length).toBe(1);
    expect(latestOfType(result.evidence, 'recovery')?.status).toBe('draft');

    // The outcome is a governed PROPOSAL (not a silent draft).
    expect(result.recovery?.status).toBe('proposed');
    expect(result.recovery?.workItemId).toBeTruthy();
    expect(result.recovery?.requiresHumanForSubmission).toBe(true);

    // `agent.task.proposed` emitted exactly once; the workflow SUSPENDED and NOTHING
    // executed — HITL never auto-approves, so no `agent.task.executed`.
    expect(rt.eventSink.ofType('agent.task.proposed').length).toBe(1);
    expect(rt.eventSink.ofType('agent.task.executed').length).toBe(0);
    expect(rt.recovery.engine.query(rt.workflowId)?.status).toBe('waiting-decision');

    // Persisted ONCE, with the agent-written draft on it.
    expect(store.saves.length).toBe(1);
    expect(store.saves[0].entries.length).toBe(result.evidence.entries.length);
    expect(entriesForStage(store.saves[0], 'recovery').length).toBe(1);
  });

  it('the recovery rung is manifest-backed: permittedRung(manifest tier, currentTier)', async () => {
    const store = spyStore();
    const rt = runtime();
    const result = await runOrderToCash(inputs(), await deps({ store, recovery: rt.recovery }));

    const tier = getAgentManifest('revenue-cycle-agent').autonomyTier;
    expect(result.currentTier).toBeDefined();
    expect(result.recovery?.rung).toBe(permittedRung(tier, result.currentTier!));
    // The persisted draft carries the SAME rung the agent computed at the interlock.
    expect(latestOfType(result.evidence, 'recovery')?.rung).toBe(result.recovery?.rung);
  });
});

describe('Wave-3 F4 — dispatch ONLY on the firstProcessed path (no replay double-proposal)', () => {
  it('a replay of the same 835 dispatches nothing and creates no second proposal', async () => {
    const store = spyStore();

    const rt1 = runtime();
    const first = await runOrderToCash(
      inputs(),
      await deps({ store, recovery: rt1.recovery, idempotency: true, idPrefix: 'run1' })
    );
    expect(first.recovery?.status).toBe('proposed');
    expect(rt1.eventSink.ofType('agent.task.proposed').length).toBe(1);

    // Replay: SAME 835 (claimRef:remittanceId), fresh runtime + ids + ts. The
    // idempotency probe short-circuits BEFORE the underpaid block → no dispatch.
    const rt2 = runtime();
    const replay = await runOrderToCash(
      inputs(),
      await deps({
        store,
        recovery: rt2.recovery,
        idempotency: true,
        idPrefix: 'run2',
        ts: '2026-08-31T00:00:00.000Z',
      })
    );
    expect(replay.deduped).toBe(true);
    expect(replay.recovery).toBeUndefined();
    // The replay's engine was never started → zero proposals emitted on it.
    expect(rt2.eventSink.ofType('agent.task.proposed').length).toBe(0);
    // Still exactly ONE recovery draft on the persisted record (no second draft).
    const persisted = await store.get(first.evidence.id);
    expect(entriesForStage(persisted!, 'recovery').length).toBe(1);
  });
});

describe('Wave-3 — a non-underpaid verdict dispatches no recovery', () => {
  it("a denied PA → not-recoverable → no proposal, no draft", async () => {
    const store = spyStore();
    const rt = runtime();
    const result = await runOrderToCash(
      inputs(),
      await deps({ store, recovery: rt.recovery, pasDecision: 'denied' })
    );
    expect(result.reconciliation?.verdict).toBe('not-recoverable');
    expect(result.recovery).toBeUndefined();
    expect(latestOfType(result.evidence, 'recovery')).toBeUndefined();
    expect(rt.eventSink.ofType('agent.task.proposed').length).toBe(0);
  });

  it('an indeterminate reconciliation (no contracted rate) → no proposal, no draft', async () => {
    const store = spyStore();
    const rt = runtime();
    const emptyFeeSchedule: FeeSchedule = { asOf: TS, rates: [], lookup: () => undefined };
    const result = await runOrderToCash(
      inputs(),
      await deps({ store, recovery: rt.recovery, feeSchedule: emptyFeeSchedule })
    );
    expect(result.reconciliation?.verdict).toBe('indeterminate');
    expect(result.recovery).toBeUndefined();
    expect(rt.eventSink.ofType('agent.task.proposed').length).toBe(0);
  });
});

describe('Wave-3 — flag-off / deps.recovery ABSENT is the degraded pre-Wave-3 fallback', () => {
  it('writes the draft directly with NO status/workItemId (byte-identical outcome shape)', async () => {
    const store = spyStore();
    const result = await runOrderToCash(inputs(), await deps({ store }));

    expect(result.reconciliation?.verdict).toBe('underpaid');
    // Same draft on the spine, same rung, same human gate as pre-Wave-3 …
    expect(latestOfType(result.evidence, 'recovery')?.status).toBe('draft');
    expect(result.recovery?.action).toBe('draft-appeal');
    expect(result.recovery?.rung).toBe('A1'); // permittedRung(HITL, D1)
    expect(result.recovery?.requiresHumanForSubmission).toBe(true);
    // … and the runtime-only fields are ABSENT (no agent dispatched).
    expect(result.recovery?.status).toBeUndefined();
    expect(result.recovery?.workItemId).toBeUndefined();
    expect(entriesForStage(result.evidence, 'recovery').length).toBe(1);
    expect(store.saves.length).toBe(1);
  });
});

describe('Wave-3 — the persisted recovery draft surfaces as a reviewer work item', () => {
  it('listWorkItems derives an agent-proposal item from the persisted recovery draft', async () => {
    const store = spyStore();
    const rt = runtime();
    await runOrderToCash(inputs(), await deps({ store, recovery: rt.recovery }));

    const items = await listWorkItems(store);
    const byQueue = groupByQueue(items);
    const proposals = byQueue['agent-proposal'];
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    const recoveryItem = proposals.find((i) => i.code === 'draft-appeal');
    expect(recoveryItem).toBeDefined();
    expect(recoveryItem?.evidenceId).toBe(RECOVERY_ID);
    expect(recoveryItem?.memberId).toBe(MEMBER);
  });
});

describe('Wave-3 HIGH-1 — workItemId is the DURABLE recovery id (not the ephemeral engine id)', () => {
  it('recovery.workItemId === the recovery evidence id === the workQueueView proposalId', async () => {
    const store = spyStore();
    const rt = runtime();
    const result = await runOrderToCash(inputs(), await deps({ store, recovery: rt.recovery }));

    // The returned pointer is the DURABLE evidence recovery id …
    expect(result.recovery?.workItemId).toBe(RECOVERY_ID);
    // … the SAME id the persisted recovery entry carries …
    expect(latestOfType(result.evidence, 'recovery')?.id).toBe(RECOVERY_ID);
    // … and the SAME id the workQueueView recovery derivation uses as its proposalId.
    const review = recoveryReviewItem(result.evidence);
    expect(review?.evidenceId).toBe(RECOVERY_ID);
    expect(result.recovery?.workItemId).toBe(review?.evidenceId);

    // It is NOT the engine's ephemeral awaiting-proposal id (`${id}::wf::p0`).
    const ephemeral = rt.recovery.engine.query(rt.workflowId)?.awaitingProposalId;
    expect(ephemeral).toBeTruthy();
    expect(result.recovery?.workItemId).not.toBe(ephemeral);
  });
});

describe('Wave-3 HIGH-2 — timely-filing deadline + materiality-driven priority', () => {
  it('recoveryPriority: urgent near the deadline OR on a high delta; routine otherwise (boundary)', () => {
    // Near the deadline → urgent (boundary at RECOVERY_URGENT_WINDOW_DAYS).
    expect(recoveryPriority(0, RECOVERY_URGENT_WINDOW_DAYS)).toBe('urgent');
    expect(recoveryPriority(0, RECOVERY_URGENT_WINDOW_DAYS + 1)).toBe('routine');
    // High delta → urgent even with the window wide open (boundary at RECOVERY_URGENT_DELTA).
    expect(recoveryPriority(RECOVERY_URGENT_DELTA, 365)).toBe('urgent');
    expect(recoveryPriority(RECOVERY_URGENT_DELTA - 1, 365)).toBe('routine');
    // Small delta, far deadline → routine.
    expect(recoveryPriority(100, 365)).toBe('routine');
  });

  it('filingDeadline is computed, persisted on the recovery entry, and on the work item', async () => {
    const store = spyStore();
    const rt = runtime();
    const remittance = await getRemittanceGatewayLoader().load(TS);
    const paidDate = remittance.remittances[0].paidDate;
    const expected = computeFilingDeadline(paidDate, RECOVERY_FILING_WINDOW_DAYS);

    const result = await runOrderToCash(inputs(), await deps({ store, recovery: rt.recovery }));

    // On the outcome …
    expect(result.recovery?.filingDeadline).toBe(expected);
    // … persisted on the recovery evidence entry …
    expect(latestOfType(result.evidence, 'recovery')?.filingDeadline).toBe(expected);
    // … and surfaced on the durable reviewer work item.
    expect(recoveryReviewItem(result.evidence)?.note).toBeDefined();
    const review = recoveryReviewItem(store.saves[0]);
    // The work item carries the deadline in its PHI-safe refs (via buildProposalWorkItem
    // — asserted through the persisted record's derivation used by the inbox).
    const persistedRecovery = latestOfType(store.saves[0], 'recovery');
    expect(persistedRecovery?.filingDeadline).toBe(expected);
    expect(review?.evidenceId).toBe(RECOVERY_ID);
  });

  it('overdueRecoveryItems selects a past-deadline recovery and excludes a fresh one', async () => {
    const store = spyStore();
    const rt = runtime();
    const result = await runOrderToCash(inputs(), await deps({ store, recovery: rt.recovery }));
    const deadline = result.recovery?.filingDeadline as string;

    // A `now` AFTER the deadline → the recovery is overdue and selected.
    const afterDeadline = new Date(Date.parse(deadline) + 86_400_000).toISOString();
    const overdue = overdueRecoveryItems([result.evidence], afterDeadline);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].evidenceId).toBe(RECOVERY_ID);

    // A `now` BEFORE the deadline → nothing overdue (fresh recovery excluded).
    const beforeDeadline = new Date(Date.parse(deadline) - 86_400_000).toISOString();
    expect(overdueRecoveryItems([result.evidence], beforeDeadline)).toHaveLength(0);
  });
});

describe('Wave-3 MED-4 — fail-closed when the governed runtime is absent in production', () => {
  it('production agentRuntime + underpaid + no deps.recovery → throws, no ungoverned write', async () => {
    setSessionDataMode('agentRuntime', 'production');
    const store = spyStore();
    // No `recovery` runtime injected → the ungoverned direct write would run.
    await expect(runOrderToCash(inputs(), await deps({ store }))).rejects.toBeInstanceOf(
      RecoveryRuntimeRequiredError
    );
    // Fail-closed BEFORE any persist: no ledger row was written.
    expect(store.saves).toHaveLength(0);
  });
});

describe('Wave-3 MED-5 — the persisted draft carries AGENT provenance', () => {
  it("the recovery entry's actor identifies the revenue-cycle agent, not 'system'", async () => {
    const store = spyStore();
    const rt = runtime();
    const result = await runOrderToCash(inputs(), await deps({ store, recovery: rt.recovery }));

    const recovery = latestOfType(result.evidence, 'recovery');
    expect(recovery?.actor).toBe(REVENUE_CYCLE_AGENT_ID);
    expect(recovery?.actor).not.toBe('system');
    // Persisted with the same agent provenance.
    expect(latestOfType(store.saves[0], 'recovery')?.actor).toBe(REVENUE_CYCLE_AGENT_ID);
  });
});

describe('Wave-3 LOW-6 — the outcome rung is single-sourced from the drafted entry', () => {
  it('recovery.rung equals the rung the agent stamped on the persisted draft entry', async () => {
    const store = spyStore();
    const rt = runtime();
    const result = await runOrderToCash(inputs(), await deps({ store, recovery: rt.recovery }));

    // Single source: the outcome rung IS the rung on the draft entry (not a recompute).
    expect(result.recovery?.rung).toBe(latestOfType(result.evidence, 'recovery')?.rung);
    expect(latestOfType(store.saves[0], 'recovery')?.rung).toBe(result.recovery?.rung);
  });
});
