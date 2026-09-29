/**
 * Recovery dispatch seam (Wave-3, F1/F3/E14). Extracted from orderToCash.ts to keep
 * that orchestrator under the file-size cap and to keep the engine plumbing out of
 * the pure-orchestration hot path.
 *
 * When the order→cash path finds an `underpaid` verdict AND a recovery runtime is
 * injected (the SHIPPED route always injects it — E14), it starts the governed
 * Revenue-Cycle recovery workflow through the WorkflowEngine. The AGENT — not
 * orderToCash — is the single writer of the recovery DRAFT (F1): the workflow calls
 * its own allowlisted `evidence.append` tool, which runs the caller's `recordDraft`
 * closure, at propose-time, BEFORE it suspends at the HITL gate. The record mutation
 * lives in the caller's closure so orderToCash stays the owner of its evidence
 * record; this module owns only the engine start + the bounded, fail-closed await
 * for suspension (F3).
 *
 * When NO runtime is injected (existing unit tests / non-agent callers) `buildRecovery`
 * falls back to a direct `recordRecovery` write, byte-identical to pre-Wave-3. The
 * shipped route always supplies a runtime, so the shipped path is agent-governed.
 */
import { recordRecovery, type EvidenceRecord, type EvidenceTier } from '@/lib/evidence';
import { permittedRung, evaluateInterlock } from '@/lib/agents/governance/interlock';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { AuthorityRung } from '@/lib/evidence/tierConfig';
import { isTerminalStatus } from '@/lib/agentRuntime';
import type { EscalationPriority, WorkflowDefinition, WorkflowEngine } from '@/lib/agentRuntime';
import {
  REVENUE_CYCLE_AGENT_ID,
  type RecoveryDeps,
  type RecoveryResult,
  type RecoveryTask,
} from '@/lib/agents/revenueCycle';
import { getDataMode } from '@/lib/config/dataMode';

/**
 * Wave-3 HIGH-2 — configurable timely-filing / payer-appeal window, in DAYS,
 * applied from the remittance date to compute a recovery's `filingDeadline`.
 *
 * ILLUSTRATIVE DEFAULT. The real window is per-MCO / per-line-of-business (Medicaid
 * managed-care appeal windows commonly range ~60–180 days) and MUST be sourced from
 * the payer contract / config before production. Named + documented so it is never a
 * bare literal. Missing a payer appeal window silently loses a recoverable dollar, so
 * the deadline is computed + persisted here; wiring a durable SWEEP/cron that acts on
 * it (via `overdueRecoveryItems`) is an explicit Wave-4 item.
 */
export const RECOVERY_FILING_WINDOW_DAYS = 120;

/** Days-to-deadline at/under which a recovery is URGENT (filing window closing). */
export const RECOVERY_URGENT_WINDOW_DAYS = 14;

/** Underpayment delta (materiality, absolute $) at/above which a recovery is URGENT. */
export const RECOVERY_URGENT_DELTA = 5000;

const MS_PER_DAY = 86_400_000;

/** Compute the ISO filing deadline: remittance date + the configured window. */
export function computeFilingDeadline(
  remittanceDate: string,
  windowDays: number = RECOVERY_FILING_WINDOW_DAYS
): string {
  return new Date(Date.parse(remittanceDate) + windowDays * MS_PER_DAY).toISOString();
}

/** Whole days from `nowIso` until `filingDeadline` (negative once overdue). */
export function daysToDeadline(filingDeadline: string, nowIso: string): number {
  return Math.floor((Date.parse(filingDeadline) - Date.parse(nowIso)) / MS_PER_DAY);
}

/**
 * Materiality-driven recovery priority (HIGH-2 — NEVER a constant): URGENT when the
 * filing window is closing (daysToDeadline ≤ RECOVERY_URGENT_WINDOW_DAYS) OR the
 * underpayment delta is material (|delta| ≥ RECOVERY_URGENT_DELTA); otherwise
 * routine. Pure + deterministic. Drives the RecoveryTask priority (the engine SLA +
 * escalation walk) so a near-deadline / high-dollar recovery is worked first.
 */
export function recoveryPriority(delta: number, days: number): EscalationPriority {
  if (days <= RECOVERY_URGENT_WINDOW_DAYS) return 'urgent';
  if (Math.abs(delta) >= RECOVERY_URGENT_DELTA) return 'urgent';
  return 'routine';
}

/**
 * MED-4: raised when the underpaid recovery path is reached in production
 * `agentRuntime` mode WITHOUT an injected recovery runtime. The governed agent MUST
 * be the writer in production — a missing runtime is a wiring defect, not a license
 * for the ungoverned direct write. Fail-closed, mirroring the tenancy guard.
 */
export class RecoveryRuntimeRequiredError extends Error {
  constructor() {
    super(
      'recovery runtime required in production agentRuntime mode: refusing the ungoverned ' +
        'direct recovery write (deps.recovery absent)'
    );
    this.name = 'RecoveryRuntimeRequiredError';
  }
}

/**
 * The recovery runtime seam injected into CashDeps by the app entry (route.ts): the
 * WorkflowEngine to start the workflow on, and the workflow factory bound to a
 * RecoveryDeps (so the caller supplies the governed `recordDraft` effect). Keeping
 * this a factory (not a prebuilt definition) lets orderToCash close the effect over
 * its own mutable evidence record — the agent then writes THAT record via its tool.
 */
export interface RecoveryRuntime {
  engine: WorkflowEngine;
  makeWorkflow: (deps: RecoveryDeps) => WorkflowDefinition<RecoveryTask, RecoveryResult>;
}

/**
 * The recovery outcome surfaced on the CashResult. `status`/`workItemId` are present
 * only on the governed runtime path; the degraded fallback omits them (additive).
 */
export interface RecoveryOutcome {
  action: 'draft-appeal';
  rung: AuthorityRung;
  /** FIX-1: always true — a payer-facing submission is human-gated regardless of rung. */
  requiresHumanForSubmission: boolean;
  /** Wave-3 F1: 'proposed' when the governed agent dispatched the draft through the runtime. */
  status?: 'proposed';
  /**
   * Wave-3 HIGH-1: the DURABLE work-item id — the evidence recovery id (the SAME id
   * `recoveryReviewItem` uses as its proposalId), NEVER the engine's ephemeral
   * awaiting-proposal id (which belongs to a discarded per-request engine). Present
   * only on the governed runtime path.
   */
  workItemId?: string;
  /**
   * Wave-3 HIGH-2: the timely-filing / payer-appeal deadline (ISO) computed for this
   * recovery. Present on the governed runtime path (and the fallback); a scheduler /
   * reviewer reads it to know when the appeal window closes.
   */
  filingDeadline?: string;
}

/** The max microtask turns we poll for the workflow to reach `waiting-decision`. */
const SUSPENSION_TURN_CAP = 200;

/**
 * Await (bounded, fail-closed) the workflow reaching the HITL suspension. Mirrors
 * tests/agents/helpers.ts `waitFor`: poll the engine snapshot across microtask turns
 * and THROW if it never suspends — we NEVER return a "dispatched" recovery for a
 * workflow that silently failed or never reached the gate (F3).
 */
export async function awaitSuspension(engine: WorkflowEngine, workflowId: string): Promise<void> {
  for (let i = 0; i < SUSPENSION_TURN_CAP; i++) {
    const snapshot = engine.query(workflowId);
    if (snapshot?.status === 'waiting-decision') return;
    // ANY terminal status, not just `failed`. This tested `failed` alone, so a workflow that
    // completed or was abandoned fell through the whole turn cap and threw "never suspended within
    // N turns" — a wrong diagnosis on a fail-closed path a route maps to a 500. `isTerminalStatus`
    // is the single vocabulary, so the next status added is caught here by construction.
    if (isTerminalStatus(snapshot?.status)) {
      throw new Error(
        `recovery workflow ${workflowId} reached ${snapshot?.status} before proposing: ` +
          (snapshot?.error ?? 'no error recorded')
      );
    }
    await Promise.resolve();
  }
  throw new Error(
    `recovery workflow ${workflowId} never suspended at waiting-decision within ${SUSPENSION_TURN_CAP} turns`
  );
}

/**
 * Start the governed recovery workflow and await it reaching the HITL gate. By the
 * time this resolves, the agent's own `evidence.append` tool has run the caller's
 * `recordDraft` closure (the draft is on the caller's record) and the proposal is
 * enqueued + `agent.task.proposed` emitted once.
 *
 * HIGH-1: the DURABLE work-item id returned for `recovery.workItemId` is the evidence
 * recovery id (`args.recoveryId`) — the SAME id `recoveryReviewItem` derives its
 * proposalId from — NEVER the engine's ephemeral `awaitingProposalId`
 * (`${recoveryId}::wf::p0`), which belongs to this per-request engine and is discarded
 * at the request boundary (returning it produced a dead pointer). We still REQUIRE the
 * engine to have suspended WITH an awaiting proposal (fail-closed) before surfacing the
 * durable id — that proves the agent actually proposed — but the ephemeral id itself
 * never crosses the request boundary.
 */
export async function dispatchRecoveryDraft(
  runtime: RecoveryRuntime,
  args: { recDeps: RecoveryDeps; memberId: string; task: RecoveryTask; recoveryId: string }
): Promise<{ workItemId: string }> {
  const workflow = runtime.makeWorkflow(args.recDeps);
  const handle = runtime.engine.start(workflow, {
    memberId: args.memberId,
    input: args.task,
    workflowId: `${args.recoveryId}::wf`,
    correlationId: `corr::${args.recoveryId}`,
  });
  await awaitSuspension(runtime.engine, handle.workflowId);
  // Fail-closed: the engine MUST have suspended with an awaiting proposal (the agent
  // proposed). We check the ephemeral id's presence but do NOT surface it.
  const awaitingProposalId = runtime.engine.query(handle.workflowId)?.awaitingProposalId;
  if (!awaitingProposalId) {
    throw new Error(
      `recovery workflow ${handle.workflowId} suspended without an awaiting proposal id`
    );
  }
  // The durable pointer is the evidence recovery id, not the ephemeral proposal id.
  return { workItemId: args.recoveryId };
}

/** Inputs the order→cash path threads into the recovery draft (refs/amounts only). */
export interface BuildRecoveryArgs {
  record: EvidenceRecord;
  /** Present on the SHIPPED path — the governed agent writes the draft. Absent → fallback. */
  runtime?: RecoveryRuntime;
  recoveryAgentTier: AutonomyTier;
  currentTier: EvidenceTier;
  delta: number;
  remittanceId: string;
  /**
   * HIGH-2: the remittance date (ISO) the underpayment was found on — the anchor for
   * the timely-filing deadline (`remittanceDate + RECOVERY_FILING_WINDOW_DAYS`).
   */
  remittanceDate: string;
  claimId: string;
  reviewerAuthId: string;
  memberId: string;
  recoveryId: string;
  ts: string;
  tenant?: string;
  /**
   * ADDITIVE (optional-defaulted): the timely-filing / payer-appeal window in DAYS to
   * apply from the remittance date. Absent → RECOVERY_FILING_WINDOW_DAYS (the prior
   * global default), so the computed `filingDeadline` is byte-identical when unset.
   * A caller (e.g. a policy preset) may narrow/widen the window per line-of-business.
   */
  filingWindowDays?: number;
}

/**
 * Produce the recovery DRAFT + outcome for an underpaid verdict.
 *
 * F1 (governed path — `runtime` present): dispatch the Revenue-Cycle workflow. Its
 * own `evidence.append` tool runs the `recordDraft` closure (over `args.record`) at
 * the interlock-permitted rung, then it suspends at the HITL gate. This function
 * does NOT call recordRecovery directly on this path — the agent is the single
 * writer. Returns `status:'proposed'` + the durable `workItemId`.
 *
 * Degraded fallback (`runtime` absent — existing unit tests / non-agent callers):
 * write the draft directly, byte-identical to pre-Wave-3 behavior.
 */
export async function buildRecovery(
  args: BuildRecoveryArgs
): Promise<{ record: EvidenceRecord; recovery: RecoveryOutcome }> {
  const rung = permittedRung(args.recoveryAgentTier, args.currentTier);
  // HIGH-2: compute the timely-filing deadline from the remittance date + the
  // configured window, then drive the priority from materiality (delta) + how close
  // the filing window is — NEVER a constant.
  //
  // ROBUSTNESS: `reqString` guarantees `remittanceDate` is a string but NOT a
  // parseable date; a malformed `paidDate` must NOT throw (`new Date(NaN).toISOString()`
  // → RangeError) and 500 the whole order→cash run. When the date is unparseable we
  // produce a "deadline-unknown" recovery — no `filingDeadline` — and set the priority to
  // the DISTINCT sentinel `'deadline-unknown'` (C6: NOT `'high'`, which is a genuine band —
  // an unknown appeal window is not routine; it needs human triage, and the escalation SLA
  // lookup normalizes the sentinel to the high tier). A parseable date takes materiality.
  //
  // WAVE-4 CONFIG SEAM: `RECOVERY_FILING_WINDOW_DAYS` is a single global (120); real
  // timely-filing windows are per-payer / per-line-of-business and belong in payer
  // config — sourcing them per-payer is a Wave-4 item.
  const filingDeadline = Number.isNaN(Date.parse(args.remittanceDate))
    ? undefined
    : computeFilingDeadline(
        args.remittanceDate,
        args.filingWindowDays ?? RECOVERY_FILING_WINDOW_DAYS
      );
  const priority: EscalationPriority = filingDeadline
    ? recoveryPriority(args.delta, daysToDeadline(filingDeadline, args.ts))
    : 'deadline-unknown';

  if (args.runtime) {
    // The governed effect: the agent's `evidence.append` tool invokes this closure
    // (over the caller's record) at the interlock-permitted rung. It is the ONLY
    // recovery write on the runtime path — the draft is produced BY the agent (F1).
    let record = args.record;
    // LOW-6: the outcome rung is SINGLE-SOURCED from the rung the agent stamped on
    // the draft (the workflow's actual gate.permittedRung), never a second recompute.
    let stampedRung: AuthorityRung | undefined;
    const recDeps: RecoveryDeps = {
      async recordDraft(_task, drawnRung) {
        stampedRung = drawnRung;
        record = recordRecovery(record, {
          id: args.recoveryId,
          ts: args.ts,
          action: 'draft-appeal',
          rung: drawnRung,
          remittanceId: args.remittanceId,
          tenant: args.tenant,
          filingDeadline,
          // MED-NEW: persist the materiality-driven priority on the durable entry so
          // the reviewer work item reflects urgency (not a hardcoded 'routine').
          priority,
          // Wave-4 must-fix 3: persist the EXACT RecoveryTask on the DRAFT so the
          // decision route reconstructs the task by READING these fields — never
          // re-deriving from sibling entries (kills divergence + recomputed-tier
          // authority drift). Refs + amounts only, never member free-text.
          taskClaimId: args.claimId,
          taskAuthId: args.reviewerAuthId,
          taskDelta: args.delta,
          taskEvidenceTier: args.currentTier,
          // MED-5: stamp AGENT provenance — the draft is authored by the
          // revenue-cycle agent through its governed tool call, not 'system'.
          actor: REVENUE_CYCLE_AGENT_ID,
        });
        return { recoveryRef: args.recoveryId };
      },
      // Wave-4 (must-fix 5): the dispatch path only ever DRAFTS + suspends — it never
      // resumes past proposeAndWait on this per-request engine, so submission never
      // runs here. A throwing stub makes a mistaken pre-decision submit fail loud;
      // the real governed submitAppeal is wired by the decision route's resume engine
      // (Tree 2), against the fail-closed submissionGateway seam.
      async submitAppeal() {
        throw new Error(
          'submitAppeal must not run on the dispatch engine: a payer-facing submission ' +
            'runs only on the resume engine (the recovery decision route)'
        );
      },
    };
    const task: RecoveryTask = {
      claimId: args.claimId,
      remittanceId: args.remittanceId,
      authId: args.reviewerAuthId,
      delta: args.delta,
      evidenceTier: args.currentTier,
      priority,
    };
    const { workItemId } = await dispatchRecoveryDraft(args.runtime, {
      recDeps,
      memberId: args.memberId,
      task,
      recoveryId: args.recoveryId,
    });
    return {
      record,
      recovery: {
        action: 'draft-appeal',
        status: 'proposed',
        workItemId,
        // LOW-6: the rung the agent actually stamped (falls back to the recomputed
        // rung only defensively — they are computed from the same twin-ladder inputs).
        rung: stampedRung ?? rung,
        requiresHumanForSubmission: true,
        ...(filingDeadline ? { filingDeadline } : {}),
      },
    };
  }

  // MED-4: fail-closed, mirroring the tenancy guard. On the underpaid path with NO
  // runtime the draft would be written by the UNGOVERNED direct write below. In
  // production `agentRuntime` mode the governed agent MUST be engaged — a missing
  // runtime is a wiring defect, not a license to write an ungoverned recovery. THROW
  // before any write so no ungoverned ledger row is appended. The shipped route ALWAYS
  // injects the runtime, so the governed E2E path never reaches here.
  if (getDataMode('agentRuntime') === 'production') {
    throw new RecoveryRuntimeRequiredError();
  }

  // DEGRADED no-runtime fallback (byte-identical outcome shape to pre-Wave-3, minus
  // the additive filingDeadline). Reached ONLY in non-production / no-runtime mode
  // (existing unit tests / non-agent callers).
  const submissionGate = evaluateInterlock({
    manifestTier: args.recoveryAgentTier,
    evidenceTier: args.currentTier,
    action: { actionType: 'draft-appeal', priority },
    isSubmission: true,
  });
  const record = recordRecovery(args.record, {
    id: args.recoveryId,
    ts: args.ts,
    action: 'draft-appeal',
    rung,
    remittanceId: args.remittanceId,
    tenant: args.tenant,
    filingDeadline,
    // MED-NEW: persist the materiality-driven priority on the durable entry so the
    // reviewer work item reflects urgency (not a hardcoded 'routine').
    priority,
    // Wave-4 must-fix 3: persist the EXACT RecoveryTask on the fallback DRAFT too, so
    // the decision route reconstructs by READING these fields on either dispatch path.
    taskClaimId: args.claimId,
    taskAuthId: args.reviewerAuthId,
    taskDelta: args.delta,
    taskEvidenceTier: args.currentTier,
  });
  return {
    record,
    recovery: {
      action: 'draft-appeal',
      rung,
      requiresHumanForSubmission: submissionGate.requiresHuman,
      ...(filingDeadline ? { filingDeadline } : {}),
    },
  };
}
