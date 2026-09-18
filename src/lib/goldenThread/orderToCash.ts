/**
 * Order→Cash orchestrator (Wave-1, twin-ladder governed).
 *
 * Extends the Financial Clearance thread past adjudication into the cash cycle:
 * PA decision → claim submission → 835 remittance → reconciliation → (on a
 * material underpayment) a recovery DRAFT. It calls the UNCHANGED
 * runFinancialClearance hot path first, then appends the continuation onto that
 * record and persists ONCE.
 *
 * Governance:
 *   - The evidence process tier is RECOMPUTED fresh at the authority check (never
 *     a cached/stored value) as the WEAKEST-LINK (minimum) tier over the recovery
 *     decision's DECISION-CRITICAL INPUTS: every evidence entry EXCEPT the raw
 *     `remittance` entries the reconciliation consumed (superseded by the D2
 *     finding; excluded by matching remittanceId). It is NOT filtered by stage —
 *     the D1 auth basis (pas-decision), eligibility, and coverage-determination all
 *     cap recovery, so a denied auth or a weak determination holds autonomy back.
 *   - The recovery rung is permittedRung(recoveryAgentTier, currentTier) — the
 *     weakest link of the twin ladders — and is recorded for audit only.
 *   - FIX-1: the recovery is a DRAFT only. Submission (any payer-facing / money-
 *     moving action) is human-gated regardless of rung: evaluateInterlock with
 *     isSubmission:true drives `requiresHumanForSubmission`, which is always true.
 *     Nothing here auto-submits.
 *
 * Pure orchestration over injected data + deps; deterministic (caller supplies ts
 * and ids). A recovery draft is built ONLY on an `underpaid` verdict.
 */
import {
  appendEntry,
  computeProcessTier,
  recordPasDecision,
  recordClaimSubmission,
  recordRemittance,
  recordReconciliation,
  sealRecord,
  verifyLedgerIntegrity,
  summarize,
  type EvidenceTier,
  type EvidenceRecord,
  type LedgerSeal,
  type SigningKey,
} from '@/lib/evidence';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { RemittanceAdvice, Normalized835 } from '@/lib/dataSources/remittanceGateway';
import type { FeeSchedule } from '@/lib/dataSources/contractRepository';
import { getIdempotencyStore, IDEMPOTENCY_CONSUMERS } from '@/lib/idempotency';
import type { TenantScope } from '@/lib/security/tenant';
import {
  runFinancialClearance,
  type OrchestratorDeps,
  type ThreadResult,
} from './threadOrchestrator';
import type { ThreadInputs } from './fromFhirBundle';
import { reconcile, type ReconcileResult, type ReconcilePasDecision } from './reconciliation';
import { dedupedResult } from './orderToCashDedupe';
import { buildRecovery, type RecoveryRuntime, type RecoveryOutcome } from './recoveryDispatch';
import { requireTenantScope, TenantScopeRequiredError } from './tenantStamp';
import { getDataMode } from '@/lib/config/dataMode';

export interface CashDeps extends OrchestratorDeps {
  remittance: RemittanceAdvice;
  feeSchedule: FeeSchedule;
  /**
   * FINDING 2: the payer's PA adjudication OUTCOME, threaded in as a scenario/deps
   * fact — NEVER derived from a necessity classification (netRequiresPA means "PA
   * is required", not "the payer approved"). When absent it is treated fail-safe
   * as non-approving (no recovery); it is NEVER defaulted to 'approved'.
   */
  pasDecision?: ReconcilePasDecision;
  /** Caller-supplied, deterministic reviewer authorization id (never minted here). */
  reviewerAuthId: string;
  /** The recovery agent's manifest autonomy tier (one ladder of the twin-ladder cap). */
  recoveryAgentTier: AutonomyTier;
  /**
   * Wave-3 (F1/E14): the governed Revenue-Cycle recovery runtime — a WorkflowEngine
   * plus the workflow factory (route injects `createRecoveryWorkflow`). When present
   * (the SHIPPED route ALWAYS injects it), the AGENT is the single writer of the
   * recovery draft: on an `underpaid` verdict orderToCash dispatches the recovery
   * workflow, which writes the draft via its OWN allowlisted `evidence.append` tool
   * and suspends at the HITL gate. Absent → the degraded no-runtime fallback below
   * writes the draft directly (byte-identical to pre-Wave-3; non-agent callers only).
   */
  recovery?: RecoveryRuntime;
  /** Optional materiality override for the reconciliation tolerance. */
  materiality?: { abs?: number; pct?: number };
  /**
   * ADDITIVE (optional-defaulted): the timely-filing / payer-appeal window in DAYS,
   * threaded to the recovery draft's filing-deadline computation. Absent → the global
   * RECOVERY_FILING_WINDOW_DAYS default (byte-identical when unset). A policy preset may
   * set it per line-of-business.
   */
  filingWindowDays?: number;
  /**
   * W2-3 (tenancy): the acting principal's resolved tenant scope. When present,
   * the orchestrator enforces the tenant boundary (fail-closed, THROWS before any
   * save) and stamps the resolved tenant onto every financial entry. Absent in the
   * non-tenanted (mock, no-actor) path → behavior unchanged.
   */
  actorScope?: TenantScope;
  /**
   * W2-1 (integrity): the ledger signing key. When present, the record is sealed
   * after the continuation and an independent `integrity` block is exposed on the
   * result. The seal is provenance/tamper-evidence ONLY — it never affects the tier
   * or rung. Absent → no seal, no integrity block (unchanged).
   */
  signer?: SigningKey;
  /** Caller-supplied seal timestamp (never minted). Defaults to `deps.ts`. */
  sealTs?: string;
  /**
   * W2-2 (idempotency): when true, dedupe on the payer-side business keys
   * (`${claimRef}:${remittanceId}`) so a replay of the same 835 does not append a
   * second reconciliation/recovery. Caller-controlled (the route enables it behind
   * the flag); absent/false → no dedupe (unchanged).
   */
  idempotency?: boolean;
  ids: OrchestratorDeps['ids'] & {
    pasDecision: string;
    claim: string;
    remittance: string;
    reconciliation: string;
    underpayment: string;
    recovery: string;
  };
}

export interface CashResult extends ThreadResult {
  /**
   * The reconciliation verdict for the processed 835. OMITTED on a dedupe replay
   * (FINDING 3): a deduped result must NOT surface a live `underpaid` verdict a
   * consumer could mistake for a fresh finding — a replay is not a new adjudication.
   */
  reconciliation?: ReconcileResult;
  /**
   * Process tier at the recovery-authority check: recomputed fresh as the
   * weakest-link (minimum) tier over the decision-critical inputs (all entries
   * except the consumed raw remittance). Never cached. OMITTED on a dedupe replay.
   */
  currentTier?: EvidenceTier;
  /**
   * The recovery outcome for an `underpaid` verdict. On the governed runtime path
   * (deps.recovery present — the shipped route) it carries `status:'proposed'` + the
   * durable `workItemId`; the degraded no-runtime fallback omits those (additive).
   * OMITTED entirely on a non-underpaid verdict or a dedupe replay.
   */
  recovery?: RecoveryOutcome;
  /**
   * W2-2: true when this 835 (claimRef:remittanceId) was already processed — the
   * continuation is a no-op replay (no second reconciliation/recovery appended,
   * nothing re-persisted). Absent/false on the first (real) processing.
   */
  deduped?: boolean;
  /**
   * W2-1: independent integrity/provenance attestation over the sealed record.
   * Present only when a signer was supplied. Recomputed via verifyLedgerIntegrity
   * (the ledger is untrusted on read) — it is ORTHOGONAL to `currentTier`/rung and
   * NEVER lifts the tier.
   */
  integrity?: { intact: boolean; signed: boolean; alg: LedgerSeal['alg']; keyId: string };
}

/** Compute the reconciliation verdict for the primary 835 (pure — no append). */
function reconcilePrimary(remit: Normalized835, deps: CashDeps): ReconcileResult {
  const contracted = deps.feeSchedule.lookup(remit.code, remit.payer);
  return reconcile({
    // Fail-safe: an absent PA disposition is treated as non-approving so no
    // recovery can arise; it is NEVER defaulted to 'approved' (FINDING 2).
    pasDecision: deps.pasDecision ?? 'more-info',
    contractedAllowed: contracted?.contractedAllowed,
    remittance: remit,
    toleranceAbs: deps.materiality?.abs,
    tolerancePct: deps.materiality?.pct,
  });
}

export async function runOrderToCash(inputs: ThreadInputs, deps: CashDeps): Promise<CashResult> {
  // (a) UNCHANGED hot path. Run it WITHOUT a store so persistence happens ONCE,
  // here, on the extended record (below).
  const base = await runFinancialClearance(inputs, { ...deps, store: undefined });
  let record = base.evidence;

  const remittances = deps.remittance.remittances;
  const remit = remittances[0];

  // W2-3 TENANCY (deps-gated, fail-closed). Resolve the member's tenant against the
  // actor's scope and THROW before any append/idempotency-claim/save when denied —
  // no ledger row is written for a cross-tenant / absent-claim actor. Runs BEFORE
  // the idempotency claim so a denied request never consumes a dedupe marker. In
  // mock/demo the demo scope matches the demo tenant → tenant='tenant-demo'
  // (unchanged demo). Absent actorScope → undefined (no stamp, unchanged).
  let tenant: string | undefined;
  if (deps.actorScope) {
    tenant = requireTenantScope(inputs.member.memberId, deps.actorScope).tenant;
  } else if (getDataMode('tenancy') === 'production') {
    // FINDING 5: fail-closed. In production a caller MUST supply an actor tenant
    // scope — otherwise the financial entries would be written unstamped with NO
    // tenant-boundary check. Throw before any append/idempotency-claim/save so no
    // ledger row is written. In mock/seeded an absent scope stays permissive (the
    // demo is unchanged) — the non-tenanted path below simply writes no stamp.
    throw new TenantScopeRequiredError('no actor tenant scope supplied in production tenancy mode');
  }

  // W2-2 IDEMPOTENCY (deps-gated). Dedupe on the payer-side business keys
  // (claimRef:remittanceId) — NEVER the synthetic per-request `evId`/`deps.ids.*`
  // (those change every request → dedupe no-op).
  //
  // FINDING 2 (mark-before-commit / silent loss): the durable marker is CLAIMED
  // only AFTER a successful `deps.store.save` (below), so a save FAILURE never
  // leaves a processed marker — a replay REPROCESSES rather than returning a
  // deduped no-op that silently drops a recoverable underpayment. Here we take a
  // read-only PROBE to short-circuit the common benign replay without redoing the
  // continuation or writing a duplicate ledger row.
  const idem = deps.idempotency ? getIdempotencyStore() : null;
  const dedupeKey = `${remit.claimRef}:${remit.remittanceId}`;
  if (idem && (await idem.isProcessed(IDEMPOTENCY_CONSUMERS.orderToCashRemittance, dedupeKey))) {
    return dedupedResult(base, deps);
  }

  // (b) continuation. FINDING 2: the PA adjudication OUTCOME is a caller-supplied
  // input, NEVER synthesized from netRequiresPA. Record it only when supplied (we
  // never fabricate an 'approved'); when absent, reconcile sees a non-approving
  // disposition so no recovery can arise (fail-safe). authId is caller-supplied.
  const pasDecision = deps.pasDecision;
  if (pasDecision !== undefined) {
    record = recordPasDecision(record, {
      id: deps.ids.pasDecision,
      ts: deps.ts,
      authId: deps.reviewerAuthId,
      decision: pasDecision,
      tenant,
    });
  }

  record = recordClaimSubmission(record, {
    id: deps.ids.claim,
    ts: deps.ts,
    orderId: base.evidence.id,
    authId: deps.reviewerAuthId,
    claimId: deps.ids.claim,
    claimRef: remit.claimRef,
    total: remit.billedAmount,
    tenant,
  });

  // Record EVERY raw 835 received on the spine as D0 evidence (the primary claim's
  // remittance plus any other remittances that arrived and are not yet reconciled).
  // Only the primary (remit) is reconciled below; the rest remain raw D0 inputs and
  // legitimately hold recovery authority back until they too are reconciled.
  remittances.forEach((r, i) => {
    record = recordRemittance(record, {
      id: i === 0 ? deps.ids.remittance : `${deps.ids.remittance}-${i}`,
      ts: deps.ts,
      claimId: i === 0 ? deps.ids.claim : undefined,
      remittanceId: r.remittanceId,
      paidAmount: r.paidAmount,
      adjustments: r.adjustments,
      carcCodes: r.carcCodes,
      rarcCodes: r.rarcCodes,
      carcGroups: r.carcGroups,
      tenant,
    });
  });

  // FINDING 3: a missing contracted rate is UNDERIVABLE, never 0 — reconcilePrimary
  // passes undefined through so reconcile returns 'indeterminate' (no lift, no
  // recovery) rather than fabricating an 'overpaid' from a phantom $0 allowed amount.
  const reconciliation = reconcilePrimary(remit, deps);
  record = recordReconciliation(record, {
    id: deps.ids.reconciliation,
    ts: deps.ts,
    verdict: reconciliation.verdict,
    contractedAllowed: reconciliation.contractedAllowed,
    paidAmount: reconciliation.paidAmount,
    delta: reconciliation.delta,
    toleranceApplied: reconciliation.toleranceApplied,
    claimId: deps.ids.claim,
    remittanceId: remit.remittanceId,
    tenant,
  });

  if (reconciliation.verdict === 'underpaid') {
    record = appendEntry(record, {
      id: deps.ids.underpayment,
      ts: deps.ts,
      stage: 'reconciliation',
      actor: 'system',
      claimId: deps.ids.claim,
      remittanceId: remit.remittanceId,
      type: 'underpayment',
      delta: reconciliation.delta,
      basis: 'payer-underpayment',
      ...(tenant !== undefined ? { tenant } : {}),
    });
  }

  // (c) tier RECOMPUTED fresh at the authority check (never cached) as the
  // WEAKEST-LINK (minimum) over the recovery decision's DECISION-CRITICAL INPUTS:
  // every evidence entry EXCEPT the raw `remittance` entries the reconciliation
  // consumed (identified by remittanceId — the raw payer statement is superseded
  // by the reconciled D2 finding). This is NOT stage-filtered: the D1 auth basis
  // (pas-decision), eligibility, and coverage-determination all cap recovery, so a
  // denied auth or a weak determination — or any un-reconciled raw remittance still
  // on the spine — holds recovery autonomy back.
  //
  // W2-4: the consumed raw remittance is superseded by the reconciled finding —
  // and therefore excluded from the decision-critical set — ONLY when the
  // reconciliation actually LIFTED it to a D2 finding. Gate on
  // `liftsTierTo === 'D2'`; the sole D2 verdict that is NOT a superseding finding
  // is 'not-recoverable' (a real shortfall under a non-approving PA — reconciled
  // but yielding no recoverable finding), so it is explicitly NOT excluded. On
  // 'indeterminate' (liftsTierTo === null) there is no finding at all. In both
  // non-lift cases the raw remittance's honest D0 holds the tier — no silent lift.
  const lifted =
    reconciliation.liftsTierTo === 'D2' && reconciliation.verdict !== 'not-recoverable';
  const consumedRemittanceId = remit.remittanceId;
  const decisionCritical: EvidenceRecord = lifted
    ? {
        ...record,
        entries: record.entries.filter(
          (e) => !(e.type === 'remittance' && e.remittanceId === consumedRemittanceId)
        ),
      }
    : record;
  const currentTier = computeProcessTier(decisionCritical);

  // (d) recovery: DRAFT only, on an underpaid verdict. Rung is the twin-ladder
  // weakest link. Submission is human-gated regardless of rung (FIX-1).
  //
  // F1 (the governed agent is the SINGLE writer of the draft): when `deps.recovery`
  // is injected (the SHIPPED route always injects it — E14), buildRecovery DISPATCHES
  // the Revenue-Cycle recovery workflow through the engine. The workflow writes the
  // draft via its OWN allowlisted `evidence.append` tool (which runs the recordDraft
  // closure over `record`) at propose-time, then suspends at the HITL gate — so by
  // the time buildRecovery returns, the agent-written draft is on `record`.
  // orderToCash does NOT call recordRecovery directly on this path. Absent
  // deps.recovery → the degraded fallback writes the draft directly (unit tests).
  //
  // F4 (no duplicate proposals on replay): this block is reached only when the
  // idempotency probe above did NOT short-circuit — a benign 835 replay returns the
  // deduped envelope before here, so it never dispatches a second proposal/draft.
  let recovery: CashResult['recovery'];
  if (reconciliation.verdict === 'underpaid') {
    const built = await buildRecovery({
      record,
      runtime: deps.recovery,
      recoveryAgentTier: deps.recoveryAgentTier,
      currentTier,
      delta: reconciliation.delta,
      remittanceId: remit.remittanceId,
      remittanceDate: remit.paidDate,
      claimId: deps.ids.claim,
      reviewerAuthId: deps.reviewerAuthId,
      memberId: inputs.member.memberId,
      recoveryId: deps.ids.recovery,
      ts: deps.ts,
      tenant,
      // ADDITIVE (optional-defaulted): thread the policy filing window through to the
      // recovery draft's deadline; absent → the global default (unchanged).
      filingWindowDays: deps.filingWindowDays,
    });
    record = built.record;
    recovery = built.recovery;
  }

  // (e) W2-1 INTEGRITY (deps-gated). Seal the completed record's chain head and
  // expose an INDEPENDENT integrity attestation. The seal is tamper-evidence /
  // provenance ONLY — it is verified live (the ledger is untrusted on read) and it
  // NEVER touches `currentTier` or the rung (computed above, before the seal). The
  // sealed record is what we persist, so the seal travels with the ledger row.
  let integrity: CashResult['integrity'];
  if (deps.signer) {
    const seal = sealRecord(record, deps.signer, deps.sealTs ?? deps.ts);
    record = { ...record, seal };
    const v = verifyLedgerIntegrity(record, seal, deps.signer);
    integrity = { intact: v.intact, signed: v.signed, alg: seal.alg, keyId: seal.keyId };
  }

  // (f) persist ONCE (the sealed record when a seal was produced). This happens
  // BEFORE the idempotency marker is claimed (FINDING 2): a save failure propagates
  // here with NO marker written, so a replay reprocesses and no recoverable finding
  // is silently lost.
  if (deps.store) await deps.store.save(record);

  // (g) W2-2 CLAIM the durable marker — AFTER the successful save. The atomic
  // check-and-set is the real dedupe boundary; a loser here (a concurrent replay
  // that also passed the read-only probe above and also persisted) returns the
  // deduped envelope. ACCEPTED RESIDUAL: that concurrent-replay race can produce a
  // duplicate human-gated DRAFT (both winners persisted before either claimed).
  // That is a rare, human-reviewed duplicate — not a silent financial loss — and is
  // the sanctioned minimum-viable fix; a single-transaction marker+ledger write
  // (exactly-once) is tracked as Wave-3.
  if (idem) {
    const { firstProcessed } = await idem.markProcessed(
      IDEMPOTENCY_CONSUMERS.orderToCashRemittance,
      dedupeKey
    );
    if (!firstProcessed) return dedupedResult(base, deps);
  }

  return {
    ...base,
    summary: summarize(record),
    evidence: record,
    reconciliation,
    currentTier,
    ...(recovery ? { recovery } : {}),
    ...(integrity ? { integrity } : {}),
  };
}
