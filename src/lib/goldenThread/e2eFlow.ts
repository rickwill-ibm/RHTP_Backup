/**
 * e2eFlow.ts — the EXTENDED Golden-Thread operations flow model (Phase-G).
 *
 * A depiction of the process — CRD/DTR/PAS extended end-to-end — stretched from the EMR
 * (SMART on FHIR, Epic / Cerner) through the payer's operations and out to the continuous
 * program-integrity surveillance layer. It is the data spine behind the swimlane flow board:
 * lanes (EMR/Provider · Provider Agent · Payer · Payer Agent · Surveillance/Arbiter ·
 * Shared Evidence Ledger) and per-stage detail (actor · decision · audit entry · the REAL
 * Twin-Ladder verdict · notification · control).
 *
 * The OPERATIONS MODEL is woven in at the surveillance & payer-ops stages: a detection
 * becomes a governed TICKET, queued to a named payer- or provider-side operator, pre-loaded
 * with RCA + a recommendation + a Twin-Ladder autonomy verdict (assist / HITL / HOTL /
 * autonomous); the operator (or the agent, when autonomous) triggers an outbound
 * communication; and every step writes an append-only, NIST-aligned forensic-log entry.
 *
 * GOVERNANCE IS REAL: the permitted rung is computed by the actual interlock
 * (`permittedRung` — the weaker of manifest autonomy and the evidence-tier ceiling), and the
 * human-gate is derived from the SAME predicates the runtime consults (`isAdverseCoverageAction`,
 * `isSubmissionActionType`) — never hand-asserted. Adverse provider actions (e.g. a 42 CFR 455.23
 * payment suspension, an auto-deny-rule suspension) are HUMAN determinations, not agent buttons.
 *
 * The scenario data (which provider/payer, which finding) is illustrative seed, PHI-safe (codes /
 * refs / amounts only; provider names are fictional and labelled). Client-safe: no `@/lib/evidence`
 * barrel, no node built-ins. Outbound comms are channel:'mock' — never transmitted.
 */
import { permittedRung, AUTONOMY_RUNG } from '@/lib/agents/governance/interlock';
import {
  isAdverseCoverageAction,
  isSubmissionActionType,
} from '@/lib/agents/governance/decisionGate';
import {
  TIER_RUNG_CEILING,
  RUNG_ORDER,
  type EvidenceTier,
  type AuthorityRung,
} from '@/lib/evidence/tierConfig';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { ScenarioId } from '@/lib/goldenThread/scenarios'; // type-only — scenarios imports nothing from here (no cycle)

// ── Actors, lanes, EMR sources ───────────────────────────────────────────────────
export type Lane = 'emr' | 'provider-agent' | 'payer' | 'payer-agent' | 'surveillance' | 'ledger';
export const LANE_LABEL: Record<Lane, string> = {
  emr: 'EMR / Provider',
  'provider-agent': 'Provider Agent',
  payer: 'Payer / MCO',
  'payer-agent': 'Payer Agent',
  surveillance: 'Surveillance / Arbiter',
  ledger: 'Shared Evidence Ledger',
};
export type EmrSource = 'Epic' | 'Cerner (Oracle Health)';

// ── Twin-Ladder verdict (computed by the REAL interlock) ─────────────────────────
export type Autonomy = 'assist' | 'HITL' | 'HOTL' | 'autonomous';
/** Map an authority rung to the operations autonomy label. */
const RUNG_AUTONOMY: Record<AuthorityRung, Autonomy> = {
  A0: 'assist',
  A1: 'HITL',
  A2: 'HOTL',
  A3: 'autonomous',
};

/**
 * Does this governed action require a qualified human? Derived from the SAME two predicates
 * the runtime gate uses — a payer-facing submission (276/278/275/837-corrected/appeal) or an
 * adverse coverage action. Non-adverse notices and internal ticket updates do not. This is the
 * single source for every OutboundAction.humanGated below — no hand-set booleans.
 */
export function actionRequiresHuman(actionType: string): boolean {
  return isSubmissionActionType(actionType) || isAdverseCoverageAction({ actionType });
}

export interface TwinLadderVerdict {
  evidenceTier: EvidenceTier;
  manifestTier: AutonomyTier;
  permittedRung: AuthorityRung;
  autonomy: Autonomy;
  /** Evidence ceiling lowered the rung below what the agent's autonomy alone would grant. */
  cappedByEvidence: boolean;
  /** Adverse or payer-facing submission → human gate regardless of rung. */
  requiresHuman: boolean;
  reason: string;
}

/** Compute the REAL Twin-Ladder verdict for a finding/action (mirrors the runtime gate). */
export function verdict(
  manifestTier: AutonomyTier,
  evidenceTier: EvidenceTier,
  opts: { actionType: string; adverse?: boolean } = { actionType: '' }
): TwinLadderVerdict {
  const rung = permittedRung(manifestTier, evidenceTier);
  const adverse = opts.adverse ?? isAdverseCoverageAction({ actionType: opts.actionType });
  const submission = isSubmissionActionType(opts.actionType);
  const autonomyRung = AUTONOMY_RUNG[manifestTier];
  const evidenceCeiling = TIER_RUNG_CEILING[evidenceTier];
  const cappedByEvidence = RUNG_ORDER[evidenceCeiling] < RUNG_ORDER[autonomyRung];
  const lowRung = RUNG_ORDER[rung] <= RUNG_ORDER.A1;
  const requiresHuman = adverse || submission || lowRung;
  let reason: string;
  if (adverse) {
    reason = `Adverse action — a qualified human decides, regardless of rung (permitted ${rung}).`;
  } else if (submission) {
    reason = `Payer-facing submission — human-gated regardless of rung (permitted ${rung}).`;
  } else if (lowRung) {
    // Distinguish the binding constraint truthfully: evidence ceiling vs the agent's own autonomy.
    reason = cappedByEvidence
      ? `Evidence tier ${evidenceTier} caps authority at ${rung} — human-in-the-loop.`
      : `Autonomy tier ${manifestTier} grants only ${rung} — human-in-the-loop.`;
  } else {
    reason = `Autonomy ${manifestTier} on ${evidenceTier} evidence permits ${rung} — agent may act.`;
  }
  return {
    evidenceTier,
    manifestTier,
    permittedRung: rung,
    autonomy: RUNG_AUTONOMY[rung],
    cappedByEvidence,
    requiresHuman,
    reason,
  };
}

// ── The extended flow stages ─────────────────────────────────────────────────────
export type StageKey =
  | 'emr-launch'
  | 'crd'
  | 'gold-card'
  | 'dtr'
  | 'pas-submit'
  | 'payer-ops'
  | 'claim'
  | 'remittance'
  | 'reconciliation'
  | 'recovery'
  | 'surveillance';

export interface FlowStage {
  key: StageKey;
  seq: number;
  lane: Lane;
  label: string;
  actor: string;
  /** One-line decision captured at this stage (PHI-safe). */
  decision: string;
  /** The append-only ledger entry this stage writes. */
  auditEntry: string;
  /** The real Twin-Ladder verdict at this stage. */
  verdict: TwinLadderVerdict;
  /** Per-party notification fired, if any. */
  notification?: { party: 'payer' | 'provider' | 'both'; text: string };
  /** EMR source (only the launch stage). */
  emr?: EmrSource;
  /** True where this stage opens the operations model (tickets). */
  opsStage?: boolean;
}

// ── Operations model: roles, operators, tickets ──────────────────────────────────
export type OpsRole =
  | 'payer-siu'
  | 'payer-pi'
  | 'payer-md'
  | 'payer-um'
  | 'payer-config'
  | 'provider-revint'
  | 'provider-coding'
  | 'arbiter';
export const ROLE_LABEL: Record<OpsRole, string> = {
  'payer-siu': 'Payer · SIU Investigator',
  'payer-pi': 'Payer · Program-Integrity Analyst',
  'payer-md': 'Payer · Medical Director',
  'payer-um': 'Payer · UM Operations',
  'payer-config': 'Payer · Claims Configuration',
  'provider-revint': 'Provider · Revenue-Integrity Analyst',
  'provider-coding': 'Provider · Coding & Compliance',
  arbiter: 'Neutral · State TPL / PI Recovery',
};
export const ROLE_SIDE: Record<OpsRole, 'payer' | 'provider' | 'neutral'> = {
  'payer-siu': 'payer',
  'payer-pi': 'payer',
  'payer-md': 'payer',
  'payer-um': 'payer',
  'payer-config': 'payer',
  'provider-revint': 'provider',
  'provider-coding': 'provider',
  arbiter: 'neutral',
};
export const OPERATORS: Record<OpsRole, string> = {
  'payer-siu': 'J. Okafor',
  'payer-pi': 'D. Reyes',
  'payer-md': 'Dr. S. Patel',
  'payer-um': 'UM Ops (timeliness)',
  'payer-config': 'R. Vance (fee-schedule config)',
  'provider-revint': 'M. Cho',
  'provider-coding': 'A. Nwosu',
  arbiter: 'State TPL / PI Recovery Unit',
};

export interface OutboundAction {
  id: string;
  label: string;
  /** Governed-action type (drives the adverse/submission gate). */
  actionType: string;
  channel: string; // e.g. "EDI 837 / appeal", "provider education letter"
  humanGated: boolean;
}

/** Build an outbound action with its human-gate DERIVED from the engine predicates. */
function outbound(id: string, label: string, actionType: string, channel: string): OutboundAction {
  return { id, label, actionType, channel, humanGated: actionRequiresHuman(actionType) };
}

export interface OpsTicket {
  id: string;
  algorithm: string; // e.g. CALENDAR-IMPOSSIBLE
  title: string;
  role: OpsRole;
  operator: string;
  severity: 'info' | 'action' | 'warning' | 'critical';
  provider: string; // fictional, PHI-safe
  payer: string;
  emr?: EmrSource;
  exposureUsd: number;
  claimRefs: string; // PHI-safe codes/refs
  /** Root-cause analysis, pre-supplied to the operator. */
  rca: string[];
  /** The recommended action, pre-supplied. */
  recommendation: string;
  verdict: TwinLadderVerdict;
  outbound: OutboundAction[];
  slaHours: number;
  submittedAt: string;
}

export interface ForensicEntry {
  ts: string;
  actor: string; // human id or "agent:<id>"
  algorithm: string;
  firedRule: string;
  ruleVersion: string;
  evidenceTier: EvidenceTier;
  permittedRung: AuthorityRung;
  decision: string;
  reproduced: boolean;
  ref: string;
}

// ── Multi-payer / multi-provider seed book (illustrative, PHI-safe) ───────────────
// Provider names are FICTIONAL and labelled — never a real entity next to an allegation.
// Scale honours the client's "Cleveland-Clinic-scale integrated system" ask illustratively.
export const PAYERS = [
  'UnitedHealthcare Community Plan',
  'Molina Healthcare of WA',
  'Wellpoint WA (formerly Amerigroup)',
] as const;
export const PROVIDERS = [
  {
    name: 'Cascadia Integrated Health System (illustrative)',
    kind: 'Integrated system · Cleveland-Clinic-scale: 400+ rendering NPIs / 1 TIN',
    emr: 'Epic' as EmrSource,
    safetyNet: false,
  },
  {
    name: 'Olympic Multispecialty Group (illustrative)',
    kind: 'Mid-size group · 40 NPIs',
    emr: 'Cerner (Oracle Health)' as EmrSource,
    safetyNet: false,
  },
  {
    name: 'Rainier Community Health FQHC (illustrative)',
    kind: 'Safety-net · FQHC',
    emr: 'Epic' as EmrSource,
    safetyNet: true,
  },
] as const;

// ── The extended flow, seeded (each verdict computed by the REAL interlock) ───────
// CRD/DTR/PAS stretched from the EHR (SMART on FHIR, Epic/Cerner) through payer ops
// to continuous surveillance. Front stages earn autonomy on clean, non-adverse
// evidence; every payer↔provider submission and every adverse action is human-gated —
// the verdicts below are not asserted, they fall out of permittedRung + the gate.
export const STAGES: FlowStage[] = [
  {
    key: 'emr-launch',
    seq: 1,
    lane: 'emr',
    emr: 'Epic',
    label: 'EMR launch — SMART on FHIR',
    actor: 'Provider @ Epic (SMART on FHIR launch; CRD via CDS Hooks)',
    decision: 'Member context launched from the EHR; order-to-cash thread opened.',
    auditEntry:
      'SMART launch captured (iss, patient ref masked, encounter); thread id minted; provenance = EHR context.',
    verdict: verdict('HOTL', 'D2', { actionType: '' }),
    notification: {
      party: 'provider',
      text: 'Thread opened from Epic — agents attached in read/assist.',
    },
  },
  {
    key: 'crd',
    seq: 2,
    lane: 'payer-agent',
    label: 'CRD — Coverage Requirements Discovery',
    actor: 'Payer Agent · CRD service (Da Vinci)',
    decision: 'Payer discloses coverage requirements for the order back to the provider.',
    auditEntry:
      'CRD response sealed: PA-required flag, documentation rules; policy version pinned. (Denial-rate context is a provider-agent analytic overlay, not a CRD card payload element.)',
    verdict: verdict('autonomous', 'D3', { actionType: '' }),
  },
  {
    key: 'gold-card',
    seq: 3,
    lane: 'payer-agent',
    label: 'Gold-card fold — PA waiver',
    actor: 'Payer Agent · Gold-Card program',
    decision:
      'Provider meets the payer gold-card program criteria — prior auth waived per published policy.',
    auditEntry:
      'goldCardApplied=true; provider approval-rate + lookback + service class vs published criteria; policy version pinned. Favorable (non-adverse) determination.',
    // Waiving PA is favorable/non-adverse and deterministic against published criteria; note gold-carding
    // is modelled on state gold-card statutes (a commercial construct), applied here via MCO policy.
    verdict: verdict('autonomous', 'D3', { actionType: '' }),
    notification: {
      party: 'both',
      text: 'Prior auth waived for this order — gold-card criteria met.',
    },
  },
  {
    key: 'dtr',
    seq: 4,
    lane: 'provider-agent',
    label: 'DTR — Documentation Templates & Rules',
    actor: 'Provider Agent · DTR',
    decision: 'Structured documentation assembled in the EHR; completeness and propensity scored.',
    auditEntry:
      'DTR QuestionnaireResponse sealed; completeness score, deficiency flags. (Propensity-to-approve is a provider-agent analytic overlay, not a DTR field.)',
    verdict: verdict('HOTL', 'D2', { actionType: '' }),
  },
  {
    key: 'pas-submit',
    seq: 5,
    lane: 'provider-agent',
    label: 'PAS — Prior-Auth Submission',
    actor: 'Provider Agent · PAS (X12 278 / FHIR)',
    decision: 'PAS bundle prepared; transmission staged for authorized human release.',
    auditEntry:
      '278 bundle built and sealed; awaiting authorized release — agent will not transmit autonomously.',
    verdict: verdict('autonomous', 'D3', { actionType: 'x12-278' }),
    notification: {
      party: 'provider',
      text: 'PAS ready — one click to release; submission is human-gated by design.',
    },
  },
  {
    key: 'payer-ops',
    seq: 6,
    lane: 'payer',
    label: 'Payer operations — pend / review / edit',
    actor: 'Payer · UM operations + Payer Agent',
    decision:
      'Payer operates on the PAS: auth pended for additional clinical records (CMS-0057-F clock running; any timeframe extension requires member notice).',
    auditEntry:
      'Determination = pend; specific denial/pend reason to the provider; decision-timeframe clock started (72h expedited / 7 cal-days standard). On clock expiry the request becomes a DEEMED adverse determination (42 CFR 438.210(d)/438.404) → human-issued NABD, never a silent auto-deny; named reviewer assigned.',
    verdict: verdict('HOTL', 'D1', { actionType: '' }),
    notification: { party: 'both', text: 'Authorization pended — additional records requested.' },
  },
  {
    key: 'claim',
    seq: 7,
    lane: 'payer',
    label: 'Claim (837) → adjudication',
    actor: 'Payer Agent · adjudication',
    decision: 'Claim adjudicated against benefits and contract; EOB assembled.',
    auditEntry:
      '837 received; adjudication result sealed: allowed vs billed, benefit application, edits applied.',
    verdict: verdict('autonomous', 'D2', { actionType: '' }),
  },
  {
    key: 'remittance',
    seq: 8,
    lane: 'payer',
    label: 'Remittance (835)',
    actor: 'Payer · Remittance',
    decision: '835 posted; adjustment groups and CARC/RARC applied.',
    auditEntry:
      'Posted/sealed remittance (settlement artifact) — not the raw 835 as-received (D0-D1): paid amount, adjustment groups (CO/PR), CARC/RARC, check/EFT trace.',
    verdict: verdict('autonomous', 'D2', { actionType: '' }),
  },
  {
    key: 'reconciliation',
    seq: 9,
    lane: 'provider-agent',
    label: 'Reconciliation — the delta',
    actor: 'Provider Agent · Reconciliation',
    decision:
      '835 reconciled against the loaded contracted rate — an underpayment delta is detected.',
    auditEntry:
      'Reconciliation sealed: allowed vs loaded contracted rate, CO adjustment beyond the contractual write-down, variance %; arithmetic reproducible.',
    verdict: verdict('HOTL', 'D2', { actionType: '' }),
    notification: { party: 'provider', text: 'Underpayment detected on this remittance.' },
  },
  {
    key: 'recovery',
    seq: 10,
    lane: 'provider-agent',
    label: 'Recovery — governed dispute',
    actor: 'Provider Agent · Recovery',
    decision:
      'Payment dispute / reconsideration drafted from the reconciled delta; transmission human-gated regardless of rung.',
    auditEntry:
      'Dispute (appeal) packet assembled and sealed; proposed→(awaiting approval); no autonomous payer-facing transmission.',
    verdict: verdict('autonomous', 'D3', { actionType: 'appeal' }),
    notification: { party: 'provider', text: 'Dispute ready for authorized release.' },
  },
  {
    key: 'surveillance',
    seq: 11,
    lane: 'surveillance',
    opsStage: true,
    label: 'Surveillance — continuous program integrity',
    actor: 'Surveillance agents · continuous run',
    decision:
      'Algorithms run continuously over the sealed ledger; detections become governed tickets.',
    auditEntry:
      'Detection run sealed: algorithms evaluated, findings, tickets minted to role-queues; no adverse auto-action.',
    verdict: verdict('HOTL', 'D2', { actionType: '' }),
    notification: { party: 'both', text: 'New governed tickets queued from the surveillance run.' },
  },
];

// ── Operations tickets, seeded across payers/providers/role-queues (illustrative) ─
// A detection → a governed ticket → a named operator, pre-loaded with RCA +
// recommendation + a REAL Twin-Ladder verdict + the outbound actions available.
// Each ticket's verdict is computed against its most-privileged proposed action so the
// governance badge matches the buttons. Adverse actions (455.23 suspension, rule
// suspension, gold-card revocation, recoupment) are HUMAN determinations described in the
// recommendation — never agent-executable buttons. Amounts/refs are PHI-safe seed.
export const TICKETS: OpsTicket[] = [
  {
    id: 'TKT-4471',
    algorithm: 'CALENDAR-IMPOSSIBLE',
    title: 'Temporally impossible service volume — single rendering NPI',
    role: 'payer-siu',
    operator: OPERATORS['payer-siu'],
    severity: 'critical',
    provider: 'Cascadia Integrated Health System (illustrative) · NPI 1▪▪▪▪▪▪7',
    payer: 'UnitedHealthcare Community Plan',
    emr: 'Epic',
    exposureUsd: 5_100,
    claimRefs:
      '17 encounters (08/03–08/07) · peak day 08/04 = 31.5 service-hrs · CPT 99215 + 99417 (or G2212 per Medicaid prolonged-svc policy)',
    rca: [
      "On the peak day (08/04) one rendering NPI's encounters sum to 31.5 time-based service-hours across overlapping visits — a literal impossibility (the same minute cannot be billed on two patients); 17 flagged encounters span 08/03–08/07.",
      'No split/shared-visit (FS) or supervising-provider modifier on the overlaps — rules out legitimate team billing under one NPI.',
      'Rule out FIRST the benign differential: an NPI-attribution / data-aggregation artifact (TIN↔NPI rollup, group-vs-individual NPI mapping, timezone/timestamp aggregation) is the common non-fraud cause before this is a fraud case.',
      'Direct $ on the flagged claims is ~$5.1k; true exposure is the pattern across the provider book — extrapolate only via a statistically-valid sample, not from these 17 claims.',
    ],
    recommendation:
      'Open SIU case. Request medical records (277-RFAI/ADR; 275 attachment intake) on the flagged encounters. Recommend a 42 CFR 455.23 credible-allegation payment-suspension REVIEW and an HCA-OPI / MFCU referral — both human determinations, not agent actions. Do NOT recoup pending review.',
    verdict: verdict('HOTL', 'D2', { actionType: 'x12-275' }),
    outbound: [
      outbound('ob-275', 'Request medical records (ADR / 275 intake)', 'x12-275', 'EDI 275 (mock)'),
      outbound('ob-notice', 'Notice of review to provider', 'provider-notice', 'letter (mock)'),
      outbound('ob-upd', 'Update ticket', 'ticket-update', 'ticket (mock)'),
    ],
    slaHours: 24,
    submittedAt: '2026-09-14T13:22:00Z',
  },
  {
    id: 'TKT-4472',
    algorithm: 'UNDERPAY-CONTRACT',
    title: 'Contractual underpayment — allowed below loaded fee schedule',
    role: 'provider-revint',
    operator: OPERATORS['provider-revint'],
    severity: 'action',
    provider: 'Olympic Multispecialty Group (illustrative) · NPI 1▪▪▪▪▪▪2',
    payer: 'Molina Healthcare of WA',
    emr: 'Cerner (Oracle Health)',
    exposureUsd: 12_340,
    claimRefs: '9 claims · allowed 18.6% below contracted rate · CO-45 over-adjustment',
    rca: [
      'Adjudicated allowed amount sits 18.6% below the loaded contracted fee schedule on 9 claims for the CPT/locality/effective-date.',
      'The 835 CAS shows a CO-45 write-off exceeding the contract-permitted adjustment — CO-45 is the normal billed-minus-allowed write-off, so the signal is the over-adjustment, not its presence. No PR group → a plan-side shortfall, not member cost-share.',
      'A shortfall this uniform points at a mis-loaded fee-schedule version — it almost never stops at 9 claims; widen to every claim on this code since the fee-schedule effective date.',
    ],
    recommendation:
      'File a provider payment dispute / reconsideration (appeal) citing the contracted rate — do NOT resubmit a corrected claim (nothing is wrong with the provider claim; an 837-corrected risks duplicate / timely-filing resets). Widen the population to the whole code, route the root cause to payer fee-schedule config, and track the dispute-deadline clock.',
    verdict: verdict('autonomous', 'D3', { actionType: 'appeal' }),
    outbound: [
      outbound(
        'ob-appeal',
        'Draft & release payment dispute',
        'appeal',
        'dispute/reconsideration packet (mock)'
      ),
      outbound('ob-upd', 'Update ticket', 'ticket-update', 'ticket (mock)'),
    ],
    slaHours: 72,
    submittedAt: '2026-09-14T09:05:00Z',
  },
  {
    id: 'TKT-4473',
    algorithm: 'DENY-DISPARATE-IMPACT',
    title: 'Denial disparate-impact screen (§1557) — behavioral-health cohort',
    role: 'payer-md',
    operator: OPERATORS['payer-md'],
    severity: 'action',
    provider: 'Rainier Community Health FQHC (illustrative) · NPI 1▪▪▪▪▪▪9',
    payer: 'Wellpoint WA (formerly Amerigroup)',
    emr: 'Epic',
    exposureUsd: 0,
    claimRefs:
      'cohort n=214 · approval 59% vs peer 78% · four-fifths ratio 0.756 (<0.80) · svc: behavioral health',
    rca: [
      'Approval-rate ratio is 59% (FQHC cohort) ÷ 78% (peer cohort) = 0.756, below the four-fifths (0.80) adverse-impact screen — stated on favorable (approval) rates, the correct basis, not on the raw denial %.',
      'This is an adverse-impact SIGNAL under ACA §1557 (Medicaid coverage), not the EEOC employment rule; the cohort is behavioral-health-skewed, so an MHPAEA NQTL parity review is also indicated.',
      'It is only a signal until case-mix / acuity risk-adjustment is applied — the disparate-impact label does not attach before confounder control. The surveillance layer surfaces the pattern; it reverses no individual determination.',
      'Distinguish the denial class first: administrative denials may auto-deny, but a medical-necessity denial requires a qualified physician decider at the point of denial (42 CFR 438.210(b)(3)). "MD review before further denials" concedes the prior BH denials may have lacked a clinician decider — the likely root cause; re-review against BH criteria (ASAM / LOCUS-CALOCUS or the plan\'s).',
    ],
    recommendation:
      'Medical-director review before further auto-denials in this cohort; run the risk-adjusted re-analysis. If denials were improper: reprocess the wrongly-denied claims and issue each member a Notice of Adverse Benefit Determination with appeal / State fair-hearing rights (42 CFR 438 Subpart F), plus a Medicaid MCO parity analysis (42 CFR 438 Subpart K; §1557 via 45 CFR Part 92). Suspending the auto-deny rule is a human governance action — not an agent button. If SUD records are in scope, apply 42 CFR Part 2 consent/segmentation before surfacing member-level detail. Exposure is regulatory + reprocessing, not a single $ figure.',
    verdict: verdict('HITL', 'D1', { actionType: 'provider-notice', adverse: true }),
    outbound: [
      outbound('ob-notice', 'Notice of review (provider)', 'provider-notice', 'letter (mock)'),
      outbound('ob-upd', 'Update ticket', 'ticket-update', 'ticket (mock)'),
    ],
    slaHours: 48,
    submittedAt: '2026-09-14T11:40:00Z',
  },
  {
    id: 'TKT-4474',
    algorithm: 'UPCODE-DRIFT',
    title: 'E/M level distribution drift vs specialty benchmark',
    role: 'provider-coding',
    operator: OPERATORS['provider-coding'],
    severity: 'action',
    provider: 'Cascadia Integrated Health System (illustrative) · dept 042 · NPI 1▪▪▪▪▪▪4',
    payer: 'UnitedHealthcare Community Plan',
    emr: 'Epic',
    exposureUsd: 47_800,
    claimRefs: 'E/M 99204/99205 share +14 pts vs specialty benchmark (rolling 90d)',
    rca: [
      'New-patient level-4/5 E/M share (99204/99205) rose 14 points above the specialty benchmark over 90 days with no corresponding MDM/acuity shift in the linked documentation.',
      'Drift is provider-cohort-wide, not a single coder — points to EHR template / prompt behavior rather than fraud intent.',
      'Pre-bill: the flagged claims have not yet been transmitted — this is a shift-left catch, not a post-pay takeback.',
    ],
    recommendation:
      'Route to coding & compliance for a dual-coded, statistically-valid sample audit against a target accuracy threshold — the automated "no MDM/acuity shift" read is a hypothesis the audit confirms before any action. Issue an internal clinician-education action (non-adverse); do NOT initiate takeback. Escalation ladder if drift persists post-education: focused prepay review → self-disclose any already-paid claims under the 60-day overpayment rule. Re-baseline after remediation.',
    verdict: verdict('HOTL', 'D2', { actionType: 'provider-notice' }),
    outbound: [
      outbound(
        'ob-notice',
        'Issue coding-education action',
        'provider-notice',
        'internal education (mock)'
      ),
      outbound('ob-upd', 'Update ticket', 'ticket-update', 'ticket (mock)'),
    ],
    slaHours: 120,
    submittedAt: '2026-09-13T16:10:00Z',
  },
  {
    id: 'TKT-4475',
    algorithm: 'GOLDCARD-ANOMALY',
    title: 'Gold-carded provider — waived orders drifting from criteria',
    role: 'payer-pi',
    operator: OPERATORS['payer-pi'],
    severity: 'action',
    provider: 'Olympic Multispecialty Group (illustrative) · NPI 1▪▪▪▪▪▪2',
    payer: 'Molina Healthcare of WA',
    emr: 'Cerner (Oracle Health)',
    exposureUsd: 9_200,
    claimRefs: '6 PA-waived orders · 3 outside published gold-card criteria',
    rca: [
      'A gold-carded provider submitted PA-waived orders where 3 of 6 fall outside the published gold-card service criteria.',
      'The provider does not decide the waiver — the payer gold-card engine applied it to out-of-criteria orders, so a payer-side config/scope defect is a co-equal root cause with any provider drift.',
      'No coverage was denied — the waiver simply should not have applied; recent and narrow, so sampling and config review are warranted, not revocation.',
    ],
    recommendation:
      'PI-analyst sample review of the out-of-criteria orders AND a gold-card engine configuration review (why did the waiver mis-scope?). Request attachments (275). Move the gold-card status along a documented ladder with notice + appeal rights (monitoring → probation → revocation) — never revoke without human review.',
    verdict: verdict('HOTL', 'D2', { actionType: 'x12-275' }),
    outbound: [
      outbound(
        'ob-275',
        'Request records (ADR / 277-RFAI · 275 intake)',
        'x12-275',
        'EDI request / 275 intake (mock)'
      ),
      outbound('ob-upd', 'Update ticket', 'ticket-update', 'ticket (mock)'),
    ],
    slaHours: 96,
    submittedAt: '2026-09-13T10:28:00Z',
  },
  {
    id: 'TKT-4476',
    algorithm: 'COB-TPL',
    title: 'Coordination of benefits — Medicaid as payer of last resort',
    role: 'arbiter',
    operator: OPERATORS['arbiter'],
    severity: 'warning',
    provider: 'Cascadia Integrated Health System (illustrative) · NPI 1▪▪▪▪▪▪7',
    payer: 'Apple Health (Medicaid) · commercial primary present',
    emr: 'Epic',
    exposureUsd: 6_750,
    claimRefs:
      'member w/ commercial primary + Apple Health · Medicaid paid where commercial was primary',
    rca: [
      'The member has employer/commercial coverage (primary) alongside Apple Health (secondary); Medicaid paid on services where the commercial plan was primary.',
      'Medicaid is payer of last resort (42 CFR 433.139; SSA §1902(a)(25)) — this is a third-party-liability recovery obligation, resolved by the State TPL process, not a negotiated "arbiter" and not a QHIN.',
      'The shortfall is provable per date of service from the shared ledger under minimum-necessary — no cross-payer PHI beyond the claim references is exposed.',
    ],
    recommendation:
      'Route to the State TPL unit for post-payment recovery from the commercial primary — no unilateral recoupment against the provider. Branch: if this is instead intentional same-service double-billing, refer to SIU as a duplicate-billing case rather than closing it as COB.',
    verdict: verdict('HITL', 'D2', { actionType: 'provider-notice' }),
    outbound: [
      outbound(
        'ob-notice',
        'Notify provider + open TPL case',
        'provider-notice',
        'letter / TPL referral (mock)'
      ),
      outbound('ob-upd', 'Update ticket', 'ticket-update', 'ticket (mock)'),
    ],
    slaHours: 72,
    submittedAt: '2026-09-12T14:55:00Z',
  },
  {
    id: 'TKT-4477',
    algorithm: 'EXCLUDED-PROVIDER',
    title: 'Billing tied to an OIG-LEIE / SAM-excluded (or state-terminated) provider',
    role: 'payer-pi',
    operator: OPERATORS['payer-pi'],
    severity: 'critical',
    provider: 'Rendering NPI 1▪▪▪▪▪▪3 (illustrative) · candidate OIG-LEIE match',
    payer: 'UnitedHealthcare Community Plan',
    emr: 'Epic',
    exposureUsd: 22_400,
    claimRefs: 'NPI candidate-matched to OIG LEIE · 12 claims paid after exclusion effective date',
    rca: [
      'A rendering NPI candidate-matches an OIG-LEIE / SAM exclusion (or a state termination); 12 claims were paid after the exclusion effective date.',
      'Items or services furnished, ordered, or prescribed by an excluded provider are non-payable by federal health-care programs and are recoverable — screening exclusion lists is a mandatory Medicaid program-integrity control.',
      'Match must be verified (name + NPI + DOB) before action — a homonym / same-name false-positive is the common failure mode of list screening.',
    ],
    recommendation:
      'Verify the exclusion match to rule out a false-positive (name + NPI + DOB). If confirmed: suspend future payments, recover the post-exclusion payments (overpayments — report-and-return within 60 days, 42 USC 1320a-7k(d) / ACA §6402), and refer to HCA Office of Program Integrity / MFCU per the mandatory obligation, with provider notice and appeal rights. Payment suspension and recovery are human determinations, not agent buttons.',
    verdict: verdict('HOTL', 'D2', { actionType: 'x12-275' }),
    outbound: [
      outbound(
        'ob-275',
        'Request verification records (ADR / 277-RFAI · 275 intake)',
        'x12-275',
        'EDI request / 275 intake (mock)'
      ),
      outbound('ob-notice', 'Notice of review to provider', 'provider-notice', 'letter (mock)'),
      outbound('ob-upd', 'Update ticket', 'ticket-update', 'ticket (mock)'),
    ],
    slaHours: 24,
    submittedAt: '2026-09-12T08:15:00Z',
  },
];

// ── Scenario-specific tickets (not the WA-Medicaid catalogue) ─────────────────────
// A scenario's own governed tickets. Diane's clock-jeopardy detection (Beat 8) mints TKT-DIANE-CLK to UM
// operations (the TIMELINESS owner — not the Medical Director). It is ADVISORY: a preemptive early-warning on
// an administrative cert gap, D1→A1 (advise, human-gated). Real org names carry "(illustrative)"; the gap is
// payer-owned (no provider fault). Outbound is empty here — the resolver's governed actions are Step 3.
export const SCENARIO_TICKETS: Partial<Record<ScenarioId, OpsTicket[]>> = {
  'diane-ma': [
    {
      id: 'TKT-DIANE-CLK',
      algorithm: 'CLOCK-JEOPARDY',
      title: 'Expedited PA clock at risk — provider certification not on file',
      role: 'payer-um',
      operator: OPERATORS['payer-um'],
      severity: 'warning',
      provider: 'Cleveland Clinic (illustrative)',
      payer: 'Elevance Health / Anthem BCBS Ohio (illustrative)',
      emr: 'Epic',
      exposureUsd: 0, // timeliness / due-process exposure — not a dollar figure
      claimRefs:
        'member ref •••• (masked) · expedited PA 278 · evidence record linked · 42 CFR 422.572 (72h)',
      rca: [
        'The pend is ADMINISTRATIVE, not clinical: the payer has no current provider attestation/certification on file for this rendering provider and service line. No coverage question is in dispute.',
        'The required certification is already captured in the member’s evidence record (Da Vinci CRD/DTR data product) — this is a linkage gap, not a missing document. Link it; do not chase a fax.',
        'False-positive discipline: rule out a benign attestation already in flight (275/DocumentReference returning) before escalating — an in-flight return closes the gap without action.',
      ],
      recommendation:
        'Resolve the certification linkage from the evidence record (credentialing/PractitionerRole · DocumentReference) and re-release the 278 within the 72-hour expedited window. Escalate to UM (timeliness), never an auto-deny. The clinical determination stays with the Medical Director. This is a preemptive advisory — it does not itself decide anything.',
      verdict: verdict('HOTL', 'D1', { actionType: '' }),
      outbound: [], // Step 3 (the resolver) supplies governed actions
      slaHours: 3, // remaining expedited window (illustrative — decoupled from the SLA-bar tick model)
      submittedAt: '2026-09-15T00:00:00Z',
    },
  ],
};

/** Resolve a ticket ref to its seed — searches the WA catalogue AND every scenario's tickets. */
const ALL_SEED_TICKETS: OpsTicket[] = [
  ...TICKETS,
  ...(Object.values(SCENARIO_TICKETS).flat().filter(Boolean) as OpsTicket[]),
];
export function seedTicketByRef(ref: string): OpsTicket | undefined {
  return ALL_SEED_TICKETS.find((t) => t.id === ref);
}
export function scenarioTicketFor(scenario: ScenarioId, id: string): OpsTicket | undefined {
  return (SCENARIO_TICKETS[scenario] ?? []).find((t) => t.id === id);
}

// ── Forensic log seed (append-only, NIST-aligned agent-activity record) ───────────
// Each entry: who acted (human id or agent:<id> + rung), what fired + version, the
// evidence tier → permitted rung, the decision + reason, whether it was reproduced.
export const FORENSIC: ForensicEntry[] = [
  {
    ts: '2026-09-14T13:22:04Z',
    actor: 'agent:surveillance-siu@A2',
    algorithm: 'CALENDAR-IMPOSSIBLE',
    firedRule: 'temporal-impossibility.v3',
    ruleVersion: '3.1.0',
    evidenceTier: 'D2',
    permittedRung: 'A2',
    decision: 'Finding raised → TKT-4471 minted to Payer · SIU; no adverse action taken.',
    reproduced: true,
    ref: 'ev-4471',
  },
  {
    ts: '2026-09-14T13:31:12Z',
    actor: 'J. Okafor (SIU)',
    algorithm: 'CALENDAR-IMPOSSIBLE',
    firedRule: 'manual-review.open-case',
    ruleVersion: '—',
    evidenceTier: 'D2',
    permittedRung: 'A2',
    decision:
      'Human opened SIU case; approved records request (submission, human-gated); 455.23 suspension referred to SIU/compliance (PI) determination with MD clinical consult; recoupment withheld.',
    reproduced: false,
    ref: 'ev-4471',
  },
  {
    ts: '2026-09-14T11:40:33Z',
    actor: 'agent:surveillance-fairness@A1',
    algorithm: 'DENY-DISPARATE-IMPACT',
    firedRule: 'four-fifths-approval-ratio.v2',
    ruleVersion: '2.4.1',
    evidenceTier: 'D1',
    permittedRung: 'A1',
    decision:
      'Adverse-impact signal (§1557) raised → TKT-4473 to Payer · Medical Director; adverse cap enforced (A1), no rule change auto-applied, pending risk-adjustment.',
    reproduced: true,
    ref: 'ev-4473',
  },
  {
    ts: '2026-09-14T09:05:47Z',
    actor: 'agent:recovery@A3',
    algorithm: 'UNDERPAY-CONTRACT',
    firedRule: 'contractual-shortfall.v5',
    ruleVersion: '5.0.2',
    evidenceTier: 'D3',
    permittedRung: 'A3',
    decision:
      'Underpayment computed (arithmetic-undisputed); dispute DRAFTED only — submission held for human release.',
    reproduced: true,
    ref: 'ev-4472',
  },
  {
    ts: '2026-09-13T16:10:20Z',
    actor: 'agent:surveillance-coding@A2',
    algorithm: 'UPCODE-DRIFT',
    firedRule: 'em-distribution-drift.v4',
    ruleVersion: '4.2.0',
    evidenceTier: 'D2',
    permittedRung: 'A2',
    decision:
      'Pre-bill drift flagged → TKT-4474 to Provider · Coding; education path recommended, takeback disallowed.',
    reproduced: true,
    ref: 'ev-4474',
  },
  {
    ts: '2026-09-12T14:55:09Z',
    actor: 'agent:surveillance-tpl@A1',
    algorithm: 'COB-TPL',
    firedRule: 'payer-of-last-resort.v2',
    ruleVersion: '2.1.0',
    evidenceTier: 'D2',
    permittedRung: 'A1',
    decision:
      'COB/TPL obligation surfaced → TKT-4476 to State TPL; recovery from third party, no provider recoupment.',
    reproduced: true,
    ref: 'ev-4476',
  },
  {
    ts: '2026-09-12T08:15:41Z',
    actor: 'agent:surveillance-screen@A2',
    algorithm: 'EXCLUDED-PROVIDER',
    firedRule: 'leie-sam-screen.v6',
    ruleVersion: '6.0.0',
    evidenceTier: 'D2',
    permittedRung: 'A2',
    decision:
      'Candidate LEIE match raised → TKT-4477 to Payer · PI; verification required before any recovery, MFCU referral flagged. No autonomous suspension.',
    reproduced: true,
    ref: 'ev-4477',
  },
];
