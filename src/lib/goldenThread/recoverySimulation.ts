/**
 * recoverySimulation.ts — a PURE, deterministic recovery-policy simulation (Wave-5 UI).
 *
 * It runs a cohort of recovery scenarios through the SAME governance primitives the
 * runtime uses — `reconcile` (verdict + recoverable delta) and `permittedRung` (the
 * Twin-Ladder interlock) — under adjustable POLICY levers, and aggregates the impact.
 * No fabricated numbers: every verdict/rung comes from the real functions.
 *
 * TWIN-LADDER DEMONSTRATION. The interlock is `permittedRung(autonomyTier, evidenceTier)`
 * = min(AUTONOMY_RUNG[tier], TIER_RUNG_CEILING[evidenceTier]). A scenario is `tierCapped`
 * when the evidence ceiling is BELOW the autonomy grant — evidence is the binding
 * constraint, and raising the autonomy lever cannot move it. That is the weakest-link
 * insight the Twin Ladder encodes, made measurable. #495 adds explicit fail-closed probes.
 *
 * Client-safe: imports only pure modules (no node:crypto).
 */
import { reconcile } from './reconciliation';
import type { ReconcileVerdict } from './reconciliation';
import type { Normalized835 } from '@/lib/dataSources/remittanceGateway';
// Wave-13.1 (HIGH-1/HIGH-2): the simulation now routes every scenario through the REAL
// Twin-Ladder interlock GATE (`evaluateInterlock`) and consults the decision-gate
// predicates (`isAdverseCoverageAction` / `isSubmissionActionType`) — recoverability and
// category are derived from the GATE, not from the rung ceiling alone. interlock.ts
// transitively imports only pure modules (decisionGate, tierConfig) so it is
// client-bundle-safe (no node:crypto).
import { evaluateInterlock } from '@/lib/agents/governance/interlock';
import {
  isAdverseCoverageAction,
  isSubmissionActionType,
} from '@/lib/agents/governance/decisionGate';
// Deep import (not the '@/lib/evidence' barrel): this module runs in a client bundle
// (SimulationConsole), and the barrel re-exports ledgerIntegrity → node:crypto.
import { type EvidenceTier, type AuthorityRung } from '@/lib/evidence/tierConfig';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { ProposedAction, EscalationPriority } from '@/lib/agentRuntime/types';
import { evaluateFailProbe } from './recoveryFailScenarios';
import type { FailProbe, FailResult } from './recoveryFailScenarios';

// The public scenario/cohort surface lives in recoveryCohorts.ts (extracted to keep both
// modules within the file-size cap); re-exported here so importers are byte-identical.
export { SCENARIOS, scenarioById, BATCHES, batchById, type SimBatch } from './recoveryCohorts';

export type PasDisposition = 'approved' | 'exempt' | 'denied' | 'more-info';

export interface SimScenario {
  id: string;
  label: string;
  cpt: string;
  service: string;
  contractedAllowed: number;
  paidAmount: number;
  /** Patient-responsibility (PR) adjustment — the only group that reduces payer-owed. */
  prAmount: number;
  /** Contractual write-off (CO) adjustment — never recoverable, shown for realism. */
  coAmount: number;
  pasDecision: PasDisposition;
  /** The evidence tier available for this case (what the reconciled spine supports). */
  evidenceTier: EvidenceTier;
  goldCarded: boolean;
  /** ISO date of the remittance — the timely-filing clock starts here. */
  remittanceDate: string;
  /**
   * Wave-13.1 (HIGH-1/HIGH-2, additive & optional): the code-level `actionType` of the
   * governed recovery action this scenario would drive. Absent → a non-adverse,
   * non-submission recovery DRAFT (the favorable default), so existing scenarios are
   * byte-identical in outcome. An adverse token (recoup/offset/clawback/…) makes the
   * action human-gated regardless of rung — it can NEVER be an autonomous agent draft.
   */
  actionType?: string;
  /**
   * Wave-13.1 (additive & optional): the recovery action is a payer-facing SUBMISSION
   * (x12/appeal). Human-gated regardless of rung. Absent → not a submission.
   */
  isSubmission?: boolean;
  /** #495 (additive, optional): an adversarial fail-closed probe (governance under adversity). */
  fail?: FailProbe;
}

/**
 * The default recovery action when a scenario declares none: a non-adverse,
 * non-submission DRAFT. Chosen so `isAdverseCoverageAction` and `isSubmissionActionType`
 * are BOTH false → a scenario with no `actionType` keeps its prior category exactly.
 */
const DEFAULT_RECOVERY_ACTION_TYPE = 'draft-recovery';

export interface RecoveryPolicy {
  /** The recovery agent's manifest autonomy tier (one ladder of the Twin Ladder). */
  autonomyCeiling: AutonomyTier;
  /** Absolute materiality floor ($) — shortfalls at/under this are immaterial. */
  materialityAbs: number;
  /** Payer appeal window (days from remittance). */
  filingWindowDays: number;
  /** "Today" for the timely-filing computation (deterministic). */
  asOf: string;
}

export type SimCategory =
  | 'recoverable-agent-draft'
  | 'recoverable-manual'
  | 'past-window'
  | 'not-recoverable-pa'
  | 'no-underpayment'
  // Wave-13.1 MED-6 (4): `reconcile` returned `indeterminate` — member liability is not
  // derivable (no recognized X12 group / no contracted rate on file). Fail-closed: no
  // recovery is asserted. Distinct from 'no-underpayment' (a determinable zero shortfall).
  | 'indeterminate';

export const CATEGORY_LABEL: Record<SimCategory, string> = {
  'recoverable-agent-draft': 'Recoverable — agent drafts (human submits)',
  'recoverable-manual': 'Recoverable — manual (evidence too weak / adverse action, human-driven)',
  'past-window': 'Past timely-filing window',
  'not-recoverable-pa': 'Not recoverable — PA not approving',
  'no-underpayment': 'No material underpayment',
  indeterminate: 'Indeterminate — member liability underivable (fail-closed, no recovery)',
};

export interface ScenarioResult {
  scenario: SimScenario;
  verdict: ReconcileVerdict;
  delta: number;
  rung: AuthorityRung;
  timely: boolean;
  recoverable: boolean;
  /** Evidence is the binding constraint (tier ceiling < autonomy grant). */
  tierCapped: boolean;
  category: SimCategory;
  /**
   * Wave-13.1 (HIGH-1/HIGH-2): the interlock GATE outcome for this scenario's recovery
   * action, with NO human decision supplied — may it resolve autonomously right now?
   * Adverse / submission / low-rung (assist/HITL) actions are human-gated → `false`.
   */
  resolved: boolean;
  /** Wave-13.1: the recovery action requires a qualified human regardless of rung. */
  requiresHuman: boolean;
  /** Wave-13.1: the recovery action is an adverse coverage/financial action (money-moving). */
  adverse: boolean;
  /** Wave-13.1: the recovery action is a payer-facing submission (x12/appeal). */
  submission: boolean;
  /**
   * Wave-13.1 (HIGH-3): a payer-facing submission is human-gated regardless of rung —
   * DERIVED from the real interlock on a submission-class action (not a hardcoded literal).
   */
  submissionRequiresHuman: boolean;
  /** #495: the fail-closed outcome, present iff the scenario carries a fail probe. */
  fail?: FailResult;
}

export interface CohortResult {
  results: ScenarioResult[];
  count: number;
  underpaidCount: number;
  identifiedDollars: number;
  recoverableDollars: number;
  pastWindowDollars: number;
  byCategory: Record<SimCategory, number>;
  byRung: Record<AuthorityRung, number>;
  byTier: Record<EvidenceTier, number>;
  /** Of recoverable scenarios, how many are held below their autonomy grant by evidence. */
  tierCappedCount: number;
  /** #495: how many scenarios carried a fail probe that the interlock held fail-closed. */
  failClosedCount: number;
}

function synthRemittance(s: SimScenario): Normalized835 {
  const adjustments = (
    [
      { group: 'CO', amount: s.coAmount },
      { group: 'PR', amount: s.prAmount },
    ] as Normalized835['adjustments']
  ).filter((a) => a.amount > 0);
  return {
    remittanceId: `SIM-RA-${s.id}`,
    claimRef: `SIM-CLM-${s.id}`,
    payer: 'UnitedHealthcare Community Plan',
    code: s.cpt,
    billedAmount: s.contractedAllowed,
    paidAmount: s.paidAmount,
    adjustments,
    carcCodes: [],
    rarcCodes: [],
    carcGroups: adjustments.map((a) => a.group),
    paidDate: s.remittanceDate,
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Math.floor(ms / 86_400_000);
}

/**
 * Run one scenario through the REAL reconcile + the REAL Twin-Ladder interlock GATE.
 *
 * HIGH-1/HIGH-2: recoverability and category are derived from the interlock GATE
 * (`il.resolved` / `il.requiresHuman` + whether the action is adverse), NOT from the rung
 * ceiling alone. The key invariant the adversarial review demands: an ADVERSE recovery
 * action (recoupment / offset / clawback / …) is human-gated regardless of rung and can
 * NEVER be categorized `recoverable-agent-draft` — even at A3 / D3.
 */
export function simulateScenario(s: SimScenario, policy: RecoveryPolicy): ScenarioResult {
  const rec = reconcile({
    pasDecision: s.pasDecision,
    contractedAllowed: s.contractedAllowed,
    remittance: synthRemittance(s),
    toleranceAbs: policy.materialityAbs,
  });

  const priority: EscalationPriority = 'routine';
  const action: ProposedAction = {
    actionType: s.actionType ?? DEFAULT_RECOVERY_ACTION_TYPE,
    priority,
    ...(s.isSubmission ? { isSubmission: true } : {}),
  };
  const il = evaluateInterlock({
    manifestTier: policy.autonomyCeiling,
    evidenceTier: s.evidenceTier,
    action,
    humanDecision: null,
    ...(s.isSubmission ? { isSubmission: true } : {}),
  });
  const adverse = isAdverseCoverageAction(action);
  const submission = s.isSubmission === true || isSubmissionActionType(action.actionType);
  const rung = il.permittedRung;
  const tierCapped = il.cappedByEvidence;

  // HIGH-3: a payer-facing submission is human-gated regardless of rung — derive that
  // fact from the REAL interlock on a submission-class action rather than asserting a
  // hardcoded literal in the UI. (Always true; now provably so, at the current tier/tier.)
  const submissionGate = evaluateInterlock({
    manifestTier: policy.autonomyCeiling,
    evidenceTier: s.evidenceTier,
    action: { actionType: 'x12-837-corrected', priority: 'high' },
    humanDecision: null,
    isSubmission: true,
  });
  const submissionRequiresHuman = submissionGate.requiresHuman;

  const timely = daysBetween(s.remittanceDate, policy.asOf) <= policy.filingWindowDays;

  let category: SimCategory;
  let recoverable = false;
  if (rec.verdict === 'underpaid') {
    if (!timely) {
      category = 'past-window';
    } else if (adverse) {
      // Interlock GATE: an adverse recovery action can NEVER auto-resolve on autonomy —
      // it is a recoverable shortfall, but only a qualified human may act on it. Manual,
      // regardless of rung (this is the fail-closed path the review demanded).
      recoverable = true;
      category = 'recoverable-manual';
    } else {
      recoverable = true;
      // Evidence too weak to license anything above assist (A0) → manual; otherwise the
      // agent may draft (a human still submits — submission is human-gated).
      category = rung === 'A0' ? 'recoverable-manual' : 'recoverable-agent-draft';
    }
  } else if (rec.verdict === 'not-recoverable') {
    category = 'not-recoverable-pa';
  } else if (rec.verdict === 'indeterminate') {
    category = 'indeterminate';
  } else {
    category = 'no-underpayment';
  }

  const base: ScenarioResult = {
    scenario: s,
    verdict: rec.verdict,
    delta: rec.delta,
    rung,
    timely,
    recoverable,
    tierCapped,
    category,
    resolved: il.resolved,
    requiresHuman: il.requiresHuman,
    adverse,
    submission,
    submissionRequiresHuman,
  };
  return s.fail ? { ...base, fail: evaluateFailProbe(s.fail, s.evidenceTier) } : base;
}

const EMPTY_CAT: Record<SimCategory, number> = {
  'recoverable-agent-draft': 0,
  'recoverable-manual': 0,
  'past-window': 0,
  'not-recoverable-pa': 0,
  'no-underpayment': 0,
  indeterminate: 0,
};

/** Aggregate a cohort under a policy — all figures derived from the real functions. */
export function simulateCohort(
  scenarios: readonly SimScenario[],
  policy: RecoveryPolicy
): CohortResult {
  const results = scenarios.map((s) => simulateScenario(s, policy));
  const byCategory = { ...EMPTY_CAT };
  const byRung: Record<AuthorityRung, number> = { A0: 0, A1: 0, A2: 0, A3: 0 };
  const byTier: Record<EvidenceTier, number> = { D0: 0, D1: 0, D2: 0, D3: 0 };
  let identifiedDollars = 0;
  let recoverableDollars = 0;
  let pastWindowDollars = 0;
  let underpaidCount = 0;
  let tierCappedCount = 0;
  let failClosedCount = 0;

  for (const r of results) {
    byCategory[r.category] += 1;
    byRung[r.rung] += 1;
    byTier[r.scenario.evidenceTier] += 1;
    const materialShortfall = r.verdict === 'underpaid' && r.delta > 0 ? r.delta : 0;
    identifiedDollars += materialShortfall;
    if (r.verdict === 'underpaid') underpaidCount += 1;
    if (r.recoverable) {
      recoverableDollars += r.delta;
      if (r.tierCapped) tierCappedCount += 1;
    }
    if (r.category === 'past-window') pastWindowDollars += r.delta;
    if (r.fail?.blocked) failClosedCount += 1;
  }

  return {
    results,
    count: results.length,
    underpaidCount,
    identifiedDollars: round2(identifiedDollars),
    recoverableDollars: round2(recoverableDollars),
    pastWindowDollars: round2(pastWindowDollars),
    byCategory,
    byRung,
    byTier,
    tierCappedCount,
    failClosedCount,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The recovery agent ships at HITL; these are the demo policy defaults. */
export const DEFAULT_POLICY: RecoveryPolicy = {
  autonomyCeiling: 'HITL',
  materialityAbs: 25,
  filingWindowDays: 120,
  asOf: '2026-09-12T00:00:00.000Z',
};
