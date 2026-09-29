/**
 * escalationSignals.ts — notification / escalation-gate derivation for the dual-party
 * Evidence Ledger (Wave-6).
 *
 * From a shared Evidence Record's recovery lifecycle + the twin-ladder interlock, derive
 * (1) the current PROCESS GATE over the authority-ladder semantics (assist/hitl/hotl/
 * autonomous) and (2) the PHI-safe NOTIFICATIONS each party (payer / provider) should see
 * and act on. This is a pure DERIVATION of what each side SHOULD be shown — it does NOT
 * deliver notifications and NEVER mutates the ledger.
 *
 * REUSE, never re-derive: the permitted rung comes from `evaluateInterlock` (the ONE
 * governance definition of the twin-ladder), the process tier from `computeProcessTier`,
 * the timely-filing math from `daysToDeadline` + `RECOVERY_URGENT_WINDOW_DAYS`, and the
 * terminal test from `isRecoveryTerminal`. No governance / tier / deadline math is
 * reimplemented here; this module only MAPS those results to a gate + party notifications.
 *
 * Determinism: `now` is injected via `ctx` (no wall-clock). Every message is PHI-safe
 * (references, codes, amounts, rungs — never a memberId / name / clinical free-text).
 */
import { evaluateInterlock } from '@/lib/agents/governance/interlock';
import { effectiveAutonomy, PROCESS_GATE_OF } from '@/lib/goldenThread/nistMap';
import {
  computeProcessTier,
  latestOfType,
  type AuthorityRung,
  type EvidenceRecord,
  type EvidenceTier,
  type StoredIntegrity,
} from '@/lib/evidence';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import { daysToDeadline, RECOVERY_URGENT_WINDOW_DAYS } from './recoveryDispatch';
import { isRecoveryTerminal } from './workQueueView';

/**
 * The process gate over the authority-ladder semantics (weakest → strongest).
 *
 * NOMINAL ON PURPOSE, not a `.toLowerCase()` of `EffectiveAutonomy`. `gate` crosses an HTTP boundary —
 * `/api/evidence/[id]` returns it inside `analysis.routed`, a client renders the raw token, and a test
 * fixture pins the literal `'hitl'` — so deriving it by string transform would change an API body with
 * no compile-time signal. The values come from `PROCESS_GATE_OF` in nistMap, one explicit table, so
 * widening the vocabulary is a type error there rather than a silent wire change here.
 */
export type ProcessGate = 'assist' | 'hitl' | 'hotl' | 'autonomous';

/** Notification severity (informational → tamper-critical). */
export type SignalSeverity = 'info' | 'action' | 'warning' | 'critical';

/** Who should see a notification. `both` = the shared-ledger signal (either party). */
export type SignalParty = 'payer' | 'provider' | 'both';

export interface EscalationSignal {
  /** A stable code for the signal kind (never free-text PHI). */
  kind: string;
  party: SignalParty;
  severity: SignalSeverity;
  /** PHI-safe message (references / codes / amounts / rungs only). */
  message: string;
}

export interface EscalationContext {
  /** Injected clock (ISO) — no wall-clock is read here. */
  now: string;
  /** The recovery agent's GRANTED autonomy tier (defaults to the manifest tier, HITL). */
  manifestTier?: AutonomyTier;
  /** The read-path integrity attestation, when the caller verified the seal on read. */
  integrity?: StoredIntegrity | null;
}

export interface EscalationResult {
  gate: ProcessGate;
  signals: EscalationSignal[];
}

/** Authority rung → process-gate vocabulary (A0 assist … A3 autonomous). */
const RUNG_GATE: Readonly<Record<AuthorityRung, ProcessGate>> = Object.freeze({
  A0: PROCESS_GATE_OF[effectiveAutonomy('A0')] as ProcessGate,
  A1: PROCESS_GATE_OF[effectiveAutonomy('A1')] as ProcessGate,
  A2: PROCESS_GATE_OF[effectiveAutonomy('A2')] as ProcessGate,
  A3: PROCESS_GATE_OF[effectiveAutonomy('A3')] as ProcessGate,
});

/**
 * The revenue-cycle recovery agent's granted autonomy when the caller does not supply one.
 * Mirrors the agent manifest tier (HITL — a payer-facing recovery submission is human-gated
 * at every rung); the route passes the resolved manifest tier explicitly.
 */
const DEFAULT_RECOVERY_TIER: AutonomyTier = 'HITL';

/**
 * Derive the current process gate + the notifications each party should see from a shared
 * Evidence Record. Priority of signals: a failed integrity check is the most severe
 * (critical, both parties); then the recovery lifecycle (terminal → info; draft → payer
 * action + provider info); then the timely-filing window (past → escalate; closing →
 * warning). Pure + deterministic.
 */
export function deriveEscalationSignals(
  record: EvidenceRecord,
  ctx: EscalationContext
): EscalationResult {
  const signals: EscalationSignal[] = [];

  // (1) Integrity / tamper — the most severe gate. A failed read-path verification is a
  // CRITICAL escalation to BOTH parties: the shared ledger is untrusted until resolved.
  if (ctx.integrity && (!ctx.integrity.intact || !ctx.integrity.signed)) {
    signals.push({
      kind: 'integrity-failed',
      party: 'both',
      severity: 'critical',
      message:
        'Evidence ledger integrity verification failed — tamper suspected; do not act on this record.',
    });
  }

  const recovery = latestOfType(record, 'recovery');
  if (!recovery) {
    // No recovery action on the record → nothing to gate on the recovery ladder.
    return { gate: 'assist', signals };
  }

  // Reconstruct the permitted rung from the SAME twin-ladder inputs the dispatch used: the
  // evidence tier single-sourced from the persisted draft (falling back to the recomputed
  // weakest-link tier) and the recovery agent's granted autonomy. `evaluateInterlock` is
  // the one governance definition — no rung math is recomputed here.
  const evidenceTier: EvidenceTier = recovery.taskEvidenceTier ?? computeProcessTier(record);
  const manifestTier = ctx.manifestTier ?? DEFAULT_RECOVERY_TIER;
  const interlock = evaluateInterlock({
    manifestTier,
    evidenceTier,
    action: {
      actionType: recovery.action,
      priority: recovery.priority ?? 'routine',
      isSubmission: true,
    },
    isSubmission: true,
  });
  const gate = RUNG_GATE[interlock.permittedRung];

  // (2) Terminal recovery → an informational notification (no action needed). A submitted
  // appeal is a MOCK, not-transmitted receipt (FAKE_FIDELITY.md row 6) — labeled honestly.
  if (isRecoveryTerminal(record, recovery)) {
    const marker = latestOfType(record, 'recovery-decision');
    const status = marker?.status ?? (recovery.status === 'submitted' ? 'submitted' : 'rejected');
    signals.push({
      kind: 'recovery-terminal',
      party: 'both',
      severity: 'info',
      message:
        status === 'submitted'
          ? `Recovery appeal submitted (rung ${recovery.rung}; mock channel, not transmitted).`
          : `Recovery appeal rejected (rung ${recovery.rung}); no submission.`,
    });
    return { gate, signals };
  }

  // (3) Recovery draft awaiting a human → HITL + a reviewer-action notification to the
  // PAYER (whose reviewer must decide) and an in-progress info to the PROVIDER (who sees
  // the same shared draft being worked). A payer-facing submission is human-gated at every
  // rung (`interlock.requiresHuman`), so the operative gate is never above HITL.
  signals.push({
    kind: 'reviewer-action-required',
    party: 'payer',
    severity: 'action',
    message: `Recovery appeal draft awaiting reviewer decision (permitted rung ${interlock.permittedRung}).`,
  });
  signals.push({
    kind: 'recovery-in-progress',
    party: 'provider',
    severity: 'info',
    message: 'Recovery appeal drafted and awaiting payer reviewer decision.',
  });

  // (4) Timely-filing window: PAST the deadline → an escalate signal to both parties;
  // CLOSING within the urgent window → a warning. Reuses `daysToDeadline` (no local math).
  if (recovery.filingDeadline) {
    const days = daysToDeadline(recovery.filingDeadline, ctx.now);
    if (days < 0) {
      signals.push({
        kind: 'escalate',
        party: 'both',
        severity: 'warning',
        message: 'Recovery is past the timely-filing window — escalate before the appeal is lost.',
      });
    } else if (days <= RECOVERY_URGENT_WINDOW_DAYS) {
      signals.push({
        kind: 'filing-window-closing',
        party: 'both',
        severity: 'warning',
        message: `Timely-filing window closing in ${days} day(s) — prioritize the reviewer decision.`,
      });
    }
  }

  return { gate, signals };
}
