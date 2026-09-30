/**
 * governedAction.ts — Wave-9 "governed analyst ACTIONS + durable ticket lifecycle".
 *
 * A Wave-8 finding (`runAnalysis`) PROPOSES an action; an analyst then TRIGGERS it —
 * an X12 / communication request or a ticket update — and it runs through the SAME
 * governance the recovery DECISION uses: interlock-gated, qualified-human-approved at
 * the HITL gate, executed as a MOCK (fail-closed EDI seam), appended append-only +
 * sealed by the route, exactly-once. High automation, human approves at the gate.
 *
 * REUSE-FIRST — COMPOSITION, not new logic. It reimplements NOTHING:
 *   • the permitted autonomy rung + human requirement ← `evaluateInterlock` (interlock.ts)
 *   • the qualified-human gate                        ← `isNonAutomatedDecider` (decisionGate.ts)
 *   • the payer-facing submission class rule          ← the interlock's `isSubmission` (mirrors FIX-1)
 *   • the weakest-link evidence tier                  ← `computeProcessTier` (tier.ts)
 *   • the MOCK X12/appeal transmission                ← `submissionGateway` seam (fail-closed; not-transmitted)
 *   • the id-idempotent lifecycle append              ← `recordGovernedAction` (financialRecorders.ts)
 *   • the routed ticket / queue hop                   ← `routeEscalation` (escalationRouter.ts, Wave-7)
 * If it grows large it is duplicating one of the above — reuse instead.
 *
 * The durable TICKET LIFECYCLE is the SEQUENCE of append-only `governed-action` entries
 * (proposed → approved → executed | rejected) on the EXISTING evidence spine (pg-backed
 * in production) — NOT a new queue backend (see FAKE_FIDELITY.md). Exactly-once: the
 * id-idempotent recorder no-ops on the deterministic `${actionId}::${status}` id + the
 * caller short-circuits on an existing terminal via `governedActionTerminal`.
 *
 * Pure + deterministic: `now`/`inbox`/`gateway` are injected; no wall-clock, no store IO
 * (the ROUTE owns the store load/save/re-seal and resolves the fail-closed gateway seam).
 * PHI-safe: references / codes / amounts only.
 */
import type { QualifiedReviewer } from '@/lib/authz/credentialing';
import { assertExecutionAuthorised } from './executionAuthority';
import {
  computeProcessTier,
  latestOfType,
  recordGovernedAction,
  type AuthorityRung,
  type EvidenceEntry,
  type EvidenceRecord,
  type EvidenceTier,
  type GovernedActionType,
  type StoredIntegrity,
} from '@/lib/evidence';
import { evaluateInterlock } from '@/lib/agents/governance/interlock';
import { isSubmissionActionType } from '@/lib/agents/governance/decisionGate';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import {
  mockReceiptRef,
  type AppealSubmissionTask,
  type SubmissionGateway,
} from '@/lib/dataSources/submissionGateway';
import type {
  EscalationPolicies,
  EscalationPriority,
  HumanDecision,
  ProposalInbox,
  ProposedAction,
} from '@/lib/agentRuntime';
import { routeEscalation, type RoutedEscalation } from './escalationRouter';

/** A `recovery` draft entry — the one the URL/recoveryId names on a multi-claim record. */
export type RecoveryEntry = Extract<EvidenceEntry, { type: 'recovery' }>;

/**
 * Is this governed action payer-facing SUBMISSION-class? C4: delegates to the SINGLE
 * `isSubmissionActionType` predicate in the governance layer (keyed on actionType) — the
 * SAME source `evaluateInterlock`/`isAutoApprovable` consult, so there is no second,
 * drift-prone submission-class list here.
 */
export function isSubmissionAction(actionType: GovernedActionType): boolean {
  return isSubmissionActionType(actionType);
}

/** Fail-closed error: a submission-class action with no resolvable transport / refs. */
export class GovernedActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernedActionError';
  }
}

/** The PHI-safe references the action keys on (input overrides, else read off the spine). */
export interface GovernedActionInput {
  actionType: GovernedActionType;
  claimId?: string;
  remittanceId?: string;
  authId?: string;
  /**
   * C2: the RESOLVED recovery entry the action is bound to — the one the URL/recoveryId
   * names, NOT `latestOfType(record,'recovery')`. On a multi-claim record with two recovery
   * drafts, the caller (route) passes the entry it looked up by id so the refs, evidence
   * tier and priority bind to THAT recovery, and the action id keys on THAT recoveryId.
   * Omitted → falls back to `latestOfType(record,'recovery')` + `${record.id}-recovery`
   * (single-recovery/back-compat path).
   */
  recovery?: RecoveryEntry;
  /** C2: the recovery id the action id keys on (defaults to the resolved recovery's id). */
  recoveryId?: string;
}

export interface GovernedActionContext {
  /** Injected clock (ISO) — no wall-clock is read. */
  now: string;
  /** The analyst agent's granted autonomy tier (drives the interlock rung). */
  manifestTier: AutonomyTier;
  /**
   * The qualified-human decision, when the reviewer supplied one. `null` means no
   * explicit decision — a non-submission action at HOTL/autonomous auto-proceeds (human
   * may veto), while a submission-class action or a HITL/low-rung action stays proposed.
   */
  decision?: HumanDecision | null;
  /**
   * PROOF that `decision.decidedBy` is a qualified reviewer, minted by
   * `@/lib/authz/credentialing.assertReviewerQualified`.
   *
   * REQUIRED to EXECUTE. Adversarial review found this function is a full parallel resolution path:
   * it accepts a `HumanDecision`, runs the interlock, and on `resolved` executes a payer-facing
   * submission and writes `decidedBy` into the durable evidence ledger — calling neither
   * `assertReviewerQualified` nor `assertSignalDecider`, and matching no marker of the E14 gate that
   * exists to catch exactly that. Its only caller qualifies first, so the live path was covered; the
   * FUNCTION was exported, unguarded and unwatched, and the second caller — an ops tool, a batch
   * runner, a test turned utility — would have executed a submission on an unqualified decider with
   * every gate green. The assert now lives here, so a caller cannot forget it.
   */
  reviewer?: QualifiedReviewer | null;
  /**
   * The resolved MOCK submission gateway (the route resolves the fail-closed seam and
   * passes it). Required only to EXECUTE a submission-class action; `null`/absent for
   * internal (provider-notice / ticket-update) actions.
   */
  gateway?: SubmissionGateway | null;
  /** The HITL work-queue port (fresh per-request demo substrate). */
  inbox: ProposalInbox;
  /** The shipped escalation policy set. */
  policies: EscalationPolicies;
  /** The agent's manifest escalation-policy ref. */
  escalationPolicyRef: string;
  /** The read-path integrity attestation, when the caller verified the seal on read. */
  integrity?: StoredIntegrity | null;
  /** Agent id stamped on a routed ticket. */
  agentId?: string;
}

/** The refs a governed action resolves to (PHI-safe; input overrides, else read off the spine). */
export interface GovernedActionRefs {
  claimId?: string;
  remittanceId?: string;
  authId?: string;
}

/**
 * The computed outcome of triggering a governed action — the decision + the executed
 * MOCK receipt + the routed ticket. The CALLER (route) re-applies the lifecycle appends
 * onto the freshly-read latest record via `applyGovernedAction` (lost-update guard).
 */
export interface GovernedActionOutcome {
  actionId: string;
  actionType: GovernedActionType;
  status: 'proposed' | 'executed' | 'rejected';
  rung: AuthorityRung;
  isSubmission: boolean;
  requiresHuman: boolean;
  resolved: boolean;
  refs: GovernedActionRefs;
  decidedBy: string;
  /** The mock submission/notice reference (PHI-safe), present only when executed. */
  ref?: string;
  channel?: 'mock';
  reason: string;
  /** The durable ticket routing (reuse Wave-7). */
  ticket: RoutedEscalation;
}

/**
 * The deterministic action id for a RECOVERY + action type (id-idempotency key). C2: keyed
 * on the recoveryId (not the record id), so two recovery drafts on one multi-claim record
 * produce DISTINCT action ids for the same actionType — neither silently drops the other.
 */
export function governedActionId(recoveryId: string, actionType: GovernedActionType): string {
  return `${recoveryId}-gact-${actionType}`;
}

/** The existing terminal governed-action outcome (executed | rejected) if one is on the spine. */
export function governedActionTerminal(
  record: EvidenceRecord,
  actionId: string
): { status: 'executed' | 'rejected'; ref?: string } | null {
  const executed = record.entries.find(
    (e) => e.type === 'governed-action' && e.id === `${actionId}::executed`
  );
  if (executed && executed.type === 'governed-action') {
    return { status: 'executed', ...(executed.ref !== undefined ? { ref: executed.ref } : {}) };
  }
  const rejected = record.entries.find(
    (e) => e.type === 'governed-action' && e.id === `${actionId}::rejected`
  );
  if (rejected) return { status: 'rejected' };
  return null;
}

/** The materiality-driven recovery priority persisted on the RESOLVED recovery (routine fallback). */
function actionPriority(recovery: RecoveryEntry | undefined): EscalationPriority {
  return recovery?.priority ?? 'routine';
}

/**
 * Resolve the PHI-safe refs the action keys on — the input overrides, else read them off
 * the RESOLVED recovery draft (the one the URL names — C2), then the latest remittance.
 * NEVER re-derived from clinical data; references / amounts only.
 */
function resolveRefs(
  record: EvidenceRecord,
  recovery: RecoveryEntry | undefined,
  input: GovernedActionInput
): GovernedActionRefs {
  const remittance = latestOfType(record, 'remittance');
  const claimId =
    input.claimId ?? recovery?.taskClaimId ?? latestOfType(record, 'claim-submission')?.claimId;
  const remittanceId = input.remittanceId ?? recovery?.remittanceId ?? remittance?.remittanceId;
  const authId = input.authId ?? recovery?.taskAuthId ?? recovery?.authId;
  return {
    ...(claimId !== undefined ? { claimId } : {}),
    ...(remittanceId !== undefined ? { remittanceId } : {}),
    ...(authId !== undefined ? { authId } : {}),
  };
}

/** The evidence tier that caps the rung: the RESOLVED recovery's tier, else weakest-link. */
function evidenceTierOf(record: EvidenceRecord, recovery: RecoveryEntry | undefined): EvidenceTier {
  return recovery?.taskEvidenceTier ?? computeProcessTier(record);
}

/**
 * Trigger a governed analyst ACTION over a shared Evidence Record. Pure aside from the
 * injected `inbox.enqueue` (ticket routing) and the injected mock `gateway.submitAppeal`
 * (submission-class execution). It DECIDES via the twin-ladder interlock (rung + human
 * requirement), EXECUTES the mock action on approval, and ROUTES the durable ticket — but
 * it does NOT touch the store. The route applies the returned outcome's lifecycle appends
 * onto the freshly-read latest record (via `applyGovernedAction`) and owns save/re-seal.
 *
 * Governance (mirrors the recovery decision + FIX-1): a payer-facing X12/appeal is
 * submission-class → human-gated regardless of rung → executes ONLY with a qualified
 * human. Assist / awaiting-human → `proposed` (surfaced, not executed). HOTL/autonomous
 * on a non-submission action → auto-proceeds (human may veto with an explicit reject).
 */
export async function runGovernedAction(
  record: EvidenceRecord,
  input: GovernedActionInput,
  ctx: GovernedActionContext
): Promise<GovernedActionOutcome> {
  // C2: bind to the RESOLVED recovery the URL names (else the single-recovery fallback).
  const recovery = input.recovery ?? latestOfType(record, 'recovery');
  const recoveryId = input.recoveryId ?? recovery?.id ?? `${record.id}-recovery`;
  const actionId = governedActionId(recoveryId, input.actionType);
  const isSubmission = isSubmissionAction(input.actionType);
  const decision = ctx.decision ?? null;
  const refs = resolveRefs(record, recovery, input);
  const priority = actionPriority(recovery);

  const action: ProposedAction = {
    actionType: input.actionType,
    priority,
    isSubmission,
  };
  const il = evaluateInterlock({
    manifestTier: ctx.manifestTier,
    evidenceTier: evidenceTierOf(record, recovery),
    action,
    humanDecision: decision,
    isSubmission,
  });

  // Route the durable ticket (reuse Wave-7) — the lifecycle entries are the durable
  // record; the routed queue item mirrors the runtime engine's own placement.
  const ticket = await routeEscalation(record, {
    now: ctx.now,
    inbox: ctx.inbox,
    policies: ctx.policies,
    escalationPolicyRef: ctx.escalationPolicyRef,
    manifestTier: ctx.manifestTier,
    integrity: ctx.integrity ?? null,
    ...(ctx.agentId !== undefined ? { agentId: ctx.agentId } : {}),
  });

  const decidedBy = decision?.decidedBy ?? 'system';
  const commonOut = {
    actionId,
    actionType: input.actionType,
    rung: il.permittedRung,
    isSubmission,
    requiresHuman: il.requiresHuman,
    resolved: il.resolved,
    refs,
    decidedBy,
    reason: il.reason,
    ticket,
  } as const;

  // A qualified-human REJECT (veto) → terminal 'rejected', no execution.
  if (decision?.decision === 'rejected') {
    return { ...commonOut, status: 'rejected', decidedBy: decision.decidedBy };
  }

  // Not resolved by the interlock (assist / awaiting a qualified human, or a submission
  // without a qualified human) → SURFACE ONLY as 'proposed'; nothing is executed.
  if (!il.resolved) {
    return { ...commonOut, status: 'proposed' };
  }

  // APPROVED (or auto-proceeded at HOTL/autonomous for a non-submission action):
  // EXECUTE the MOCK action and capture its not-transmitted receipt.
  assertExecutionAuthorised(ctx.decision, ctx.reviewer); // see ./executionAuthority.ts
  const ref = executeMock(input.actionType, isSubmission, refs, ctx);
  return { ...commonOut, status: 'executed', ref, channel: 'mock' };
}

/**
 * Execute the MOCK action, returning a PHI-safe, not-transmitted reference. A
 * submission-class action reuses the fail-closed `submissionGateway` seam (production
 * `load()` throws BEFORE any transmission; the mock returns a deterministic ref with
 * `channel:'mock'`, `transmitted:false`). An internal action (provider-notice /
 * ticket-update) has no transport — its "execution" is the durable lifecycle entry, so
 * the ref is a deterministic internal handle. NOTHING is transmitted to a real X12
 * clearinghouse.
 */
function executeMock(
  actionType: GovernedActionType,
  isSubmission: boolean,
  refs: GovernedActionRefs,
  ctx: GovernedActionContext
): string {
  if (isSubmission) {
    if (refs.claimId === undefined || refs.remittanceId === undefined) {
      throw new GovernedActionError(
        `governed-action '${actionType}': a submission requires resolvable claim + remittance refs`
      );
    }
    if (!ctx.gateway) {
      throw new GovernedActionError(
        `governed-action '${actionType}': the submission gateway seam is unavailable (fail-closed)`
      );
    }
    const task: AppealSubmissionTask = {
      claimId: refs.claimId,
      remittanceId: refs.remittanceId,
      ...(refs.authId !== undefined ? { authId: refs.authId } : {}),
    };
    return ctx.gateway.submitAppeal(task).submissionRef;
  }
  // Internal action: deterministic, not-transmitted handle (no clearinghouse). PHI-safe at
  // the source (FIX-1) — the same masked-ref minting as the submission path, so a
  // member-embedding claimId is never rendered in the governed-action outcome ref.
  return mockReceiptRef(`${actionType}-mock`, refs);
}

/**
 * Re-apply a governed-action outcome's DURABLE lifecycle appends onto a record (the
 * freshly-read latest, in the route — lost-update guard). The append-only lifecycle is:
 *   proposed → approved → executed  (approval + execution)
 *   proposed → rejected             (qualified-human veto)
 *   proposed                        (surfaced only)
 * Each stage is id-idempotent (`recordGovernedAction` no-ops on the deterministic
 * `${actionId}::${status}` id), so re-applying onto the latest is exactly-once and a
 * concurrent unrelated append is preserved. Pure — returns a NEW record.
 */
export function applyGovernedAction(
  record: EvidenceRecord,
  outcome: GovernedActionOutcome,
  ts: string,
  opts?: { actor?: string; tenant?: string }
): EvidenceRecord {
  const stageArgs = {
    actionId: outcome.actionId,
    ts,
    actionType: outcome.actionType,
    decidedBy: outcome.decidedBy,
    rung: outcome.rung,
    isSubmission: outcome.isSubmission,
    ...(outcome.refs.claimId !== undefined ? { claimId: outcome.refs.claimId } : {}),
    ...(outcome.refs.remittanceId !== undefined ? { remittanceId: outcome.refs.remittanceId } : {}),
    ...(outcome.refs.authId !== undefined ? { authId: outcome.refs.authId } : {}),
    ...(opts?.actor !== undefined ? { actor: opts.actor } : {}),
    ...(opts?.tenant !== undefined ? { tenant: opts.tenant } : {}),
  };
  let r = recordGovernedAction(record, { ...stageArgs, status: 'proposed' });
  if (outcome.status === 'rejected') {
    return recordGovernedAction(r, { ...stageArgs, status: 'rejected' });
  }
  if (outcome.status === 'executed') {
    r = recordGovernedAction(r, { ...stageArgs, status: 'approved' });
    r = recordGovernedAction(r, {
      ...stageArgs,
      status: 'executed',
      channel: 'mock',
      ...(outcome.ref !== undefined ? { ref: outcome.ref } : {}),
    });
  }
  return r;
}
