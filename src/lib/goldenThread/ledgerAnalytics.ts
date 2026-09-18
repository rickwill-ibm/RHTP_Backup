/**
 * ledgerAnalytics.ts — Wave-8 "Ledger Intelligence": a CURATED, deterministic
 * analysis/RCA registry run OVER THE PARTY-SCOPED PROJECTION behind two real GATES.
 *
 * The production concept is a governed pipeline (Planner → Plan-Validate →
 * Code-Generate → Code-Evaluate → Analysis/RCA → Finding → interlock-gated Action →
 * Ticket). This module implements the DEMO backend: a small typed set of curated
 * deterministic analysis templates, each run behind the SAME two gates the pipeline
 * would apply — PLAN-VALIDATE (party scope + a PHI/non-projected reads denylist) and
 * RESULT-EVALUATE (reproducibility). It does NOT execute arbitrary generated code; the
 * curated deterministic analyses ARE the validated/evaluated output. Real generated-code
 * execution is a sandboxed production item — see the Wave-8 row in
 * `src/lib/agentRuntime/FAKE_FIDELITY.md`.
 *
 * REUSE-FIRST — COMPOSITION, not logic. It reimplements nothing (the curated bodies live
 * in `./ledgerAnalyticsTemplates`):
 *   • the action's autonomy rung     ← `evaluateInterlock` (interlock.ts) — NEVER hardcoded
 *   • the weakest-link evidence tier ← `computeProcessTier` (tier.ts)
 *   • the party-scoped PHI-safe view ← `projectForParty` (partyView.ts)
 *   • the routed ticket / queue hop  ← `routeEscalation` (escalationRouter.ts, Wave-7)
 * If it grows large it is duplicating one of the above — reuse instead.
 *
 * PHI-safety: every finding/ticket is stamped with `MASKED_RECORD_REF`; the curated
 * bodies read only PHI-safe structured facts (see the templates file). `projectForParty`
 * binds the party-scoped view each finding corresponds to and proves PHI-safety at the
 * boundary. Determinism: `now` and the `inbox` are injected via `ctx` — no wall-clock.
 */
import { evaluateInterlock } from '@/lib/agents/governance/interlock';
import {
  computeProcessTier,
  latestOfType,
  type AuthorityRung,
  type EvidenceRecord,
  type EvidenceTier,
  type SigningKey,
  type StoredIntegrity,
} from '@/lib/evidence';
import { projectForParty, MASKED_RECORD_REF, type LedgerParty } from '@/lib/evidence/partyView';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type {
  EscalationPolicies,
  EscalationPriority,
  ProposalInbox,
  ProposedAction,
} from '@/lib/agentRuntime';
import { routeEscalation, type RoutedEscalation } from './escalationRouter';
import {
  computeAnalysis,
  PROBE_NOW,
  PRIMARY_NONCE,
  PROBE_NONCE,
  type RawAnalysis,
} from './ledgerAnalyticsTemplates';

export type AnalysisKind = 'rca' | 'verification' | 'integrity';

/** A curated analysis template. `reads` is the PHI-safe field classes it declares. */
export interface AnalysisTemplate {
  id: string;
  label: string;
  party: LedgerParty | 'both';
  kind: AnalysisKind;
  /** Field classes the analysis declares reading — plan-validate checks these. */
  reads: readonly string[];
}

/**
 * Field tokens that are NON-PROJECTED / PHI — an analysis declaring any of these is
 * rejected by plan-validate (it would touch data the party projection masks out).
 */
const PHI_FIELDS: ReadonlySet<string> = new Set([
  'memberId',
  'patientName',
  'clinicalNote',
  'rawEntryId',
]);

/**
 * The curated registry. `denial-rca`, `recovery-verification`, `integrity-check` are the
 * real analyses; `member-cohort-drilldown` demonstrates a PLAN-VALIDATE rejection (it
 * declares PHI reads), and `denial-forecast` demonstrates a RESULT-EVALUATE rejection
 * (its result is not reproducible). `recovery-verification` is payer-scoped, so a
 * provider request for it is rejected out-of-scope.
 */
export const ANALYSES: readonly AnalysisTemplate[] = Object.freeze([
  {
    id: 'denial-rca',
    label: 'Denial root-cause (CARC groups + front-end gate)',
    party: 'both',
    kind: 'rca',
    reads: ['carcCodes', 'carcGroups', 'adjustments', 'deficiencies'],
  },
  {
    id: 'recovery-verification',
    label: 'Recovery verification (re-reconcile vs recorded)',
    party: 'payer',
    kind: 'verification',
    reads: ['reconciliation', 'adjustments', 'pasDecision'],
  },
  {
    id: 'integrity-check',
    label: 'Ledger integrity attestation',
    party: 'both',
    kind: 'integrity',
    reads: ['seal', 'chainHead'],
  },
  {
    id: 'member-cohort-drilldown',
    label: 'Member cohort drill-down (out of projection scope)',
    party: 'payer',
    kind: 'rca',
    reads: ['carcGroups', 'memberId', 'clinicalNote'],
  },
  {
    id: 'denial-forecast',
    label: 'Live denial-likelihood forecast (non-reproducible)',
    party: 'both',
    kind: 'rca',
    reads: ['propensity', 'carcGroups'],
  },
  {
    // A2: a SECOND eval-reject demo — non-reproducible on the injected NONCE axis (not the
    // clock). Proves the strengthened result-evaluate gate perturbs more than the clock.
    id: 'nonce-probe-demo',
    label: 'Nonce-dependent probe (non-reproducible)',
    party: 'both',
    kind: 'rca',
    reads: ['nonce'],
  },
]);

export interface AnalysisContext {
  /** Injected clock (ISO) — no wall-clock is read. */
  now: string;
  /** The analyst agent's granted autonomy tier (drives the interlock rung). */
  manifestTier: AutonomyTier;
  /** The HITL work-queue port (fresh per-request demo substrate). */
  inbox: ProposalInbox;
  /** The shipped escalation policy set. */
  policies: EscalationPolicies;
  /** The agent's manifest escalation-policy ref. */
  escalationPolicyRef: string;
  /** The read-path integrity attestation, when the caller verified the seal on read. */
  integrity?: StoredIntegrity | null;
  /** The verifier key, when available — lets integrity-check re-run verifyLedgerIntegrity. */
  verifier?: SigningKey | null;
  /** Agent id stamped on a routed ticket. */
  agentId?: string;
}

/** A PHI-safe finding (references / codes / amounts only). */
export interface AnalysisFinding {
  analysisId: string;
  kind: AnalysisKind;
  party: LedgerParty;
  recordRef: string;
  tier: EvidenceTier;
  summary: string;
  /** A disagreement / tamper the analysis surfaced. */
  anomaly: boolean;
  data: Record<string, unknown>;
}

/** A proposed action whose autonomy rung comes from the interlock (never hardcoded). */
export interface ProposedActionResult {
  actionType: string;
  priority: EscalationPriority;
  isSubmission: boolean;
  rung: AuthorityRung;
  requiresHuman: boolean;
  resolved: boolean;
  reason: string;
}

/** A ticket opened on a gate rejection / anomaly / tamper, routed via Wave-7. */
export interface AnalysisTicket {
  kind: 'plan-rejected' | 'eval-rejected' | 'anomaly' | 'tamper';
  reason: string;
  /** The routed escalation (gate, PHI-safe signals, per-party lens, queue placement). */
  routed: RoutedEscalation;
}

export interface AnalysisRun {
  analysisId: string;
  party: LedgerParty;
  outcome: 'ok' | 'plan-rejected' | 'eval-rejected';
  finding?: AnalysisFinding;
  action?: ProposedActionResult;
  ticket?: AnalysisTicket;
}

/** PLAN-VALIDATE: out-of-party-scope or a PHI/non-projected read → a rejection reason. */
function validatePlan(template: AnalysisTemplate, party: LedgerParty): string | null {
  if (template.party !== 'both' && template.party !== party) {
    return `analysis '${template.id}' is scoped to ${template.party}; requested by ${party} (out of scope)`;
  }
  const phi = template.reads.filter((f) => PHI_FIELDS.has(f));
  if (phi.length > 0) {
    return `analysis '${template.id}' would read non-projected/PHI field(s): ${phi.join(', ')}`;
  }
  return null;
}

/** The proposed action's autonomy rung comes from the interlock — never hardcoded. */
function proposeAction(
  record: EvidenceRecord,
  act: RawAnalysis['action'],
  ctx: AnalysisContext
): ProposedActionResult {
  // Single-source the evidence tier from the persisted recovery draft when present, else
  // the recomputed weakest-link tier — the SAME discipline the Wave-6 signals use.
  const evidenceTier: EvidenceTier =
    latestOfType(record, 'recovery')?.taskEvidenceTier ?? computeProcessTier(record);
  const action: ProposedAction = {
    actionType: act.actionType,
    priority: act.priority,
    isSubmission: act.isSubmission,
  };
  const il = evaluateInterlock({
    manifestTier: ctx.manifestTier,
    evidenceTier,
    action,
    isSubmission: act.isSubmission,
  });
  return {
    actionType: act.actionType,
    priority: act.priority,
    isSubmission: act.isSubmission,
    rung: il.permittedRung,
    requiresHuman: il.requiresHuman,
    resolved: il.resolved,
    reason: il.reason,
  };
}

/** Open a ticket by routing through the Wave-7 escalation router (reuse, no new queue). */
async function openTicket(
  record: EvidenceRecord,
  ctx: AnalysisContext,
  kind: AnalysisTicket['kind'],
  reason: string
): Promise<AnalysisTicket> {
  const routed = await routeEscalation(record, {
    now: ctx.now,
    inbox: ctx.inbox,
    policies: ctx.policies,
    escalationPolicyRef: ctx.escalationPolicyRef,
    manifestTier: ctx.manifestTier,
    integrity: ctx.integrity ?? null,
    agentId: ctx.agentId,
  });
  return { kind, reason, routed };
}

/**
 * Run a curated analysis over the party-scoped projection behind the two gates.
 * Deterministic given (`record`, `party`, `analysisId`, `ctx`). PHI-safe outputs.
 */
export async function runAnalysis(
  record: EvidenceRecord,
  party: LedgerParty,
  analysisId: string,
  ctx: AnalysisContext
): Promise<AnalysisRun> {
  const template = ANALYSES.find((a) => a.id === analysisId);

  // (a) PLAN-VALIDATE — unknown / out-of-scope / PHI-unsafe → reject + open a ticket.
  if (!template) {
    return {
      analysisId,
      party,
      outcome: 'plan-rejected',
      ticket: await openTicket(record, ctx, 'plan-rejected', `unknown analysis '${analysisId}'`),
    };
  }
  const planReject = validatePlan(template, party);
  if (planReject) {
    return {
      analysisId,
      party,
      outcome: 'plan-rejected',
      ticket: await openTicket(record, ctx, 'plan-rejected', planReject),
    };
  }

  // (b) run the curated analysis over the party-scoped PHI-safe projection.
  const view = projectForParty(record, party, { integrity: ctx.integrity ?? null });
  const primary = computeAnalysis(template, record, ctx, ctx.now, PRIMARY_NONCE);

  // (c) RESULT-EVALUATE — A2: re-run under TWO perturbed axes (a distinct clock AND a
  // distinct injected nonce) that a correct, reproducible analysis MUST ignore. A result
  // that folds EITHER the clock or the nonce into its output differs between the runs and is
  // rejected — so the gate catches nonce/live-state dependence a clock-only probe would miss.
  const probe = computeAnalysis(template, record, ctx, PROBE_NOW, PROBE_NONCE);
  if (JSON.stringify(primary) !== JSON.stringify(probe)) {
    return {
      analysisId,
      party,
      outcome: 'eval-rejected',
      ticket: await openTicket(
        record,
        ctx,
        'eval-rejected',
        `result not reproducible — '${template.id}' depends on non-deterministic/live state`
      ),
    };
  }

  // (d) finding (PHI-safe) + interlock-gated action + a ticket on anomaly/tamper.
  const finding: AnalysisFinding = {
    analysisId: template.id,
    kind: template.kind,
    party,
    recordRef: MASKED_RECORD_REF,
    tier: view.header.tier,
    summary: primary.summary,
    anomaly: primary.anomaly,
    data: primary.data,
  };
  const action = proposeAction(record, primary.action, ctx);
  const run: AnalysisRun = { analysisId: template.id, party, outcome: 'ok', finding, action };
  if (primary.anomaly) {
    const kind = template.kind === 'integrity' ? 'tamper' : 'anomaly';
    run.ticket = await openTicket(record, ctx, kind, primary.summary);
  }
  return run;
}
