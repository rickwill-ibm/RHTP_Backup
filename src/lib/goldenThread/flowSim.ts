/**
 * flowSim.ts — the client-side OPERATIONAL simulation engine for the Golden-Thread live flow.
 *
 * Deterministic, seeded, integer-tick. Spawns real-time 278 prior-auths + batch 837 claim runs;
 * routes them across the real EDI gateway topology (EHR → provider gateway → payer gateway →
 * payer internal); fires each gate against the REAL Twin-Ladder verdict; walks the payer UM
 * sub-process (intake→eligibility→nurse→pend/RFI→MD→determination→notify — only the MD denies);
 * and mints governed tickets. THREE future-state layers:
 *  • EVIDENCE LEDGER — every resolution appends a sealed, hash-chained, NIST-AI-RMF-tagged entry;
 *    the auditable agentic activity record is BUILT in real time (chain re-derivable = tamper-evident).
 *  • GOLD-CARD BYPASS — a share of trusted-provider 278s (rising with maturity) skip payer UM
 *    entirely (PA WAIVED); the future-state "trusted providers skip the queue".
 *  • KICKBACK LOOPS — pend/RFI and a small share of claim rejects bounce BACK to the provider
 *    (277-RFAI / records / reject) and return — closed-loop, fast agent-to-agent.
 * A MATURITY dial shifts touchless vs human, honestly (adverse/high-dollar/novel always human).
 *
 * VOCABULARY: an auth is PENDED (awaiting records), not "suspended" (that is a claims/PI 455.23
 * payment hold). Only a Medical Director issues a medical-necessity DENY — the agent recommends.
 *
 * CLIENT-SAFE: imports only the barrel-free `@/lib/goldenThread/e2eFlow` spine. Deterministic:
 * seeded mulberry32 + integer ticks, no Date.now / Math.random. The ledger consumes zero RNG.
 */
import {
  STAGES,
  TICKETS,
  scenarioTicketFor,
  OPERATORS,
  actionRequiresHuman,
  type FlowStage,
  type Lane,
  type OpsTicket,
  type StageKey,
  type OpsRole,
} from '@/lib/goldenThread/e2eFlow';
import { nistSpec, deriveOversight, type NistFn, type Oversight } from '@/lib/goldenThread/nistMap';
import { scenarioOf, type ScenarioId } from '@/lib/goldenThread/scenarios';
import {
  classifyRecon,
  RECON_CLASS_SPEC,
  type ReconRecordContent,
  type ReconClass,
} from '@/lib/goldenThread/reconcile';
import {
  appealSteps,
  buildAppealArtifact,
  appealOutcome,
  TICKS_PER_HOUR,
  APPEAL_SLA_HOURS,
  RESPONSE_TICKS,
  SLA_WARN_FRACTION,
  APPEAL_REVIEWER_SEAT,
  APPEAL_RELEASER,
  ARBITER_SEAT,
  type Workflow,
  type WfState,
  type WfNotification,
  type NotificationKind,
} from '@/lib/goldenThread/workflow';

export type { NistFn, Oversight } from '@/lib/goldenThread/nistMap';

export const SIM_LANES: Lane[] = ['emr', 'provider-agent', 'payer', 'payer-agent', 'surveillance'];

export interface PathNode {
  idx: number;
  stage: FlowStage;
  col: number;
  row: number;
}
export const PATH: PathNode[] = [...STAGES]
  .sort((a, b) => a.seq - b.seq)
  .map((stage, idx) => ({
    idx,
    stage,
    col: stage.seq - 1,
    row: Math.max(0, SIM_LANES.indexOf(stage.lane)),
  }));

const LAST_IDX = PATH.length - 1;
const PAS_IDX = PATH.findIndex((p) => p.stage.key === 'pas-submit');
const GOLD_IDX = PATH.findIndex((p) => p.stage.key === 'gold-card');
const CLAIM_IDX = PATH.findIndex((p) => p.stage.key === 'claim');
const RECON_IDX = PATH.findIndex((p) => p.stage.key === 'reconciliation');

// ── Timing (ticks; 1 tick = 250ms at 1×) ─────────────────────────────────────────
export const TICKS_PER_HOP = 5;
const GATE_BEAT = 1;
const HELD_BEAT = 8;
const SUB_BEAT = 3;
export const RT_LEG_TICKS = 2;
export const KB_LEG_TICKS = 3;
const KB_DWELL = 6;
const ACK_TTL = 8;
const AUTO_SPAWN_MIN = 16;
const AUTO_SPAWN_JITTER = 10;
const INFLIGHT_CAP = 26;
const HONESTY_FLOOR = 0.12;

// ── Maturity dial ────────────────────────────────────────────────────────────────
export const MATURITY_BANDS = [
  { at: 0.0, key: 'pilot', label: 'Pilot', ceiling: 'A1 · HITL' },
  { at: 0.34, key: 'scaling', label: 'Scaling', ceiling: 'A2 · HOTL' },
  { at: 0.67, key: 'trusted', label: 'Trusted', ceiling: 'A2+ · HOTL' },
  { at: 1.0, key: 'autonomous', label: 'Autonomous', ceiling: 'A3 · autonomous' },
] as const;
export function maturityBand(m: number): (typeof MATURITY_BANDS)[number] {
  let band: (typeof MATURITY_BANDS)[number] = MATURITY_BANDS[0];
  for (const b of MATURITY_BANDS) if (m >= b.at) band = b;
  return band;
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const pPendSubmission = (m: number): number => lerp(0.14, 0.02, m);
const pRfiPend = (m: number): number => lerp(0.22, 0.03, m);
const pMdDeny = (m: number): number => lerp(0.07, 0.02, m);
const pTouchless = (m: number): number => lerp(0.15, 0.9, m);
const pGoldCard = (m: number): number => lerp(0.06, 0.34, m); // trusted-provider PA-waiver share
const pClaimReject = (m: number): number => lerp(0.06, 0.015, m);
// F6: share of pended PAs whose 438.210(d) decision clock EXPIRES → deemed-adverse NABD. Maturity
// lowers it (faster turnaround) but NEVER to zero — the due-process safeguard must still fire at full
// autonomy, exactly where a skeptic looks hardest. The floor is the point.
const pDeemedTimeout = (m: number): number => lerp(0.14, 0.05, m);

// ── Exec Twin-Ladder: evidence (proof) earns authority; the weakest link caps it ──
const TIER_ORD: Record<string, number> = { D0: 0, D1: 1, D2: 2, D3: 3 };
// Fleet ceiling: the highest the machine may EVER act, org-wide, at each maturity band.
const FLEET_CEIL: Record<string, number> = { pilot: 1, scaling: 2, trusted: 2, autonomous: 3 };
export const execFleetCeiling = (s: SimState): number =>
  FLEET_CEIL[maturityBand(s.maturity).key] ?? 1;
/** The permitted authority for a txn = weakest link of (proof, fleet ceiling), floored to Advise for adverse. */
/** The SCENARIO cap — the maturity dial answers "what COULD the fleet earn at this stage", not what it HAS. */
export const execScenarioCeiling = (s: SimState): number => execFleetCeiling(s);
/** The EARNED-and-granted ceiling actually in force = min(what was earned+ratified, the scenario cap). */
export const execEarnedCeiling = (s: SimState): number =>
  Math.min(s.earnedCeiling, execFleetCeiling(s));

/**
 * SINGLE SOURCE for the DISPLAYED authority in every view (Operations, workbench, surveillance, live board).
 * An action class has a `permittedRung` capability (what it MAY reach at full maturity). Detection/advisory
 * work (`requiresHuman`) is governed by the HUMAN GATE, not the earned autonomous ceiling — an agent may
 * always detect and advise a human, so it is NOT earned-capped. Only AUTONOMOUS ACTION above "Advise" (A1)
 * is capped by what the fleet has actually EARNED. `oversight` derives from the SHOWN rung via deriveOversight.
 */
export interface DisplayAuthority {
  capability: string; // action-class ceiling, e.g. 'A2'
  shown: string; // current permitted authority = capability, capped by earned for the autonomous-action class
  ceiling: number; // execEarnedCeiling
  capped: boolean; // true only when an autonomous-action class is held below its capability by earned
  gated: boolean; // true when the action is human-gated (detect/advise/submission/adverse)
  oversight: Oversight;
}
export function displayAuthority(
  permittedRung: string,
  requiresHuman: boolean,
  s: SimState
): DisplayAuthority {
  const want = Number(permittedRung.replace(/[^0-9]/g, '')) || 0;
  const ceiling = execEarnedCeiling(s);
  const capApplies = !requiresHuman && want > 1; // only autonomous action above Advise is earned-gated
  const shownN = capApplies ? Math.min(want, ceiling) : want;
  const shown = `A${shownN}`;
  return {
    capability: permittedRung,
    shown,
    ceiling,
    capped: capApplies && shownN < want,
    gated: requiresHuman,
    oversight: deriveOversight(requiresHuman, shown),
  };
}
export function execAuthority(s: SimState, evLevel: number, adverse: boolean): number {
  // Authority binds on what the fleet has EARNED (and a human granted), capped by the scenario band —
  // NOT the raw dial. At cold start everything floors to the provisional A1 until a human ratifies.
  const link = Math.min(evLevel, execEarnedCeiling(s));
  return adverse ? Math.min(link, 1) : link; // adverse/high-dollar/novel: never above "Advise (human decides)"
}
/** The spotlight: one live prior-auth whose trust the exec panel watches get earned. */
export function spotlight(s: SimState): Txn | undefined {
  const live = (t: Txn): boolean => t.phase !== 'done' && t.phase !== 'denied';
  return (
    s.txns.find((t) => t.hero && live(t)) ?? // the scenario's named hero thread wins (Diane)
    s.txns.find((t) => t.id === s.spotlightId && live(t)) ??
    s.txns.find((t) => t.type === 'pa' && live(t) && !t.adverse && t.evLevel >= 1) ??
    s.txns.find((t) => t.type === 'pa' && live(t)) ??
    s.txns.find(live)
  );
}

// ── Payer internal UM sub-process ────────────────────────────────────────────────
export interface SubStep {
  key: string;
  label: string;
  short: string;
  human: boolean;
}
export const PAYER_SUBSTEPS: SubStep[] = [
  { key: 'intake', label: 'Intake / triage', short: 'IN', human: false },
  { key: 'eligibility', label: 'Eligibility & benefits', short: 'ELG', human: false },
  { key: 'nurse', label: 'Clinical / nurse review (InterQual/MCG)', short: 'RN', human: true },
  { key: 'rfi', label: 'Pend — records requested (RFI)', short: 'RFI', human: true },
  { key: 'md', label: 'MD / peer review', short: 'MD', human: true },
  { key: 'determination', label: 'Determination', short: 'DET', human: false },
  { key: 'notify', label: 'Notification (278 response)', short: 'NTF', human: false },
];
const EXPRESS_STEPS: SubStep[] = PAYER_SUBSTEPS.filter((s) => !s.human);

export type TxnKind = '278' | '837';
export type Gate = 'pass' | 'pend' | 'deny';
export type TxnPhase = 'transit' | 'gate' | 'roundtrip' | 'held' | 'subflow' | 'done' | 'denied';
export type KbPhase = 'none' | 'toProvider' | 'atProvider' | 'toPayer';
export type KbReason = '277-RFAI' | 'reject' | 'cert-attestation';

// ── Real-world transaction mix — each type routes through the stages that write its evidence ──
export type TxnType =
  'elig' | 'status' | 'pa' | 'claimP' | 'claimI' | 'claimD' | 'remit' | 'appeal';
export interface TxnTypeMeta {
  label: string; // plain + EDI, e.g. "Eligibility (270/271)"
  edi: string;
  kind: TxnKind; // behavioral family for existing branches
  startKey: StageKey;
  stopKey: StageKey;
  shape: 'circle' | 'roundsq' | 'diamond' | 'chevron' | 'moneysq' | 'shield';
  color: string;
  letter: string;
  light: boolean; // small/dim (high-volume, low-drama)
  human?: boolean; // always-human (appeal)
  // NOTE: NIST function is NOT carried here — it is single-sourced per sealed record from NIST_SPEC
  // (keyed by what fired), so there is exactly one work→NIST-function map in this engine.
}
export const TXN_TYPE_META: Record<TxnType, TxnTypeMeta> = {
  elig: {
    label: 'Eligibility',
    edi: '270/271',
    kind: '278',
    startKey: 'emr-launch',
    stopKey: 'crd',
    shape: 'diamond',
    color: '#0e7490',
    letter: 'EL',
    light: true,
  },
  status: {
    label: 'Claim status',
    edi: '276/277',
    kind: '837',
    startKey: 'remittance',
    stopKey: 'remittance',
    shape: 'chevron',
    color: '#475569',
    letter: 'ST',
    light: true,
  },
  pa: {
    label: 'Prior auth',
    edi: '278',
    kind: '278',
    startKey: 'emr-launch',
    stopKey: 'surveillance',
    shape: 'circle',
    color: '#0f766e',
    letter: 'PA',
    light: false,
  },
  claimP: {
    label: 'Claim · professional',
    edi: '837P',
    kind: '837',
    startKey: 'claim',
    stopKey: 'surveillance',
    shape: 'roundsq',
    color: '#5b3fa3',
    letter: 'P',
    light: false,
  },
  claimI: {
    label: 'Claim · institutional',
    edi: '837I',
    kind: '837',
    startKey: 'claim',
    stopKey: 'surveillance',
    shape: 'roundsq',
    color: '#6d28d9',
    letter: 'I',
    light: false,
  },
  claimD: {
    label: 'Claim · dental',
    edi: '837D',
    kind: '837',
    startKey: 'claim',
    stopKey: 'surveillance',
    shape: 'roundsq',
    color: '#7c3aed',
    letter: 'D',
    light: false,
  },
  remit: {
    label: 'Remittance',
    edi: '835',
    kind: '837',
    startKey: 'remittance',
    stopKey: 'reconciliation',
    shape: 'moneysq',
    color: '#24a148',
    letter: '$',
    light: true,
  },
  appeal: {
    label: 'Appeal / dispute',
    edi: 'appeal',
    kind: '278',
    startKey: 'recovery',
    stopKey: 'surveillance',
    shape: 'shield',
    color: '#b45309',
    letter: 'AP',
    light: false,
    human: true,
  },
};
const idxOf = (k: StageKey): number => PATH.findIndex((p) => p.stage.key === k);
const isClaimType = (t: TxnType): boolean => t === 'claimP' || t === 'claimI' || t === 'claimD';
// Real-world real-time inbound mix (by count): eligibility (270/271) dominates the wire, claim-status
// (276/277) is the next heaviest, prior-auth (278) is a modest high-touch stream, appeals a trickle.
// 837 CLAIMS arrive in batch runs (runBatch837), and 835 REMITTANCE pulses on the payment cycle
// (runRemitCycle) — neither is real-time, so neither is in the per-tick auto-spawn mix.
const AUTO_MIX: Array<[TxnType, number]> = [
  ['elig', 52],
  ['status', 28],
  ['pa', 14], // illustrative cadence — PA share raised so the shadow-concordance climb is visible in demo time
  ['appeal', 2],
];
const REMIT_CYCLE = 220; // ticks between 835 remittance pulses (payment cycle, not real-time)
const FAIRNESS_CYCLE = 260; // ticks between §1557 four-fifths cohort screens (a cohort stat, not per-txn)
const REMIT_BATCH = 6;
function pickType(s: SimState): TxnType {
  const total = AUTO_MIX.reduce((a, [, w]) => a + w, 0);
  let r = mulberry(s) * total;
  for (const [t, w] of AUTO_MIX) {
    r -= w;
    if (r < 0) return t;
  }
  return 'elig';
}

export interface Txn {
  id: string;
  kind: TxnKind;
  type: TxnType; // real-world transaction type (drives token shape/color + evidence route)
  batchId?: string;
  idx: number;
  targetIdx: number;
  stopIdx: number; // the stage this type's journey ends at (from TXN_TYPE_META.stopKey)
  phase: TxnPhase;
  progress: number;
  phaseStart: number;
  bornTick: number;
  gates: Record<number, Gate>;
  rtLeg: number;
  steps: SubStep[];
  sub: number;
  subDwell: number;
  subPended: boolean;
  express: boolean;
  touchedHuman: boolean;
  mustHuman: boolean;
  goldCarded: boolean;
  disputed: boolean; // F4: an underpayment was found at reconciliation → routes through the dispute (recovery) lane
  deemAdverse: boolean; // F6: this pended PA's decision clock will expire → human-issued deemed-adverse NABD
  // exec Twin-Ladder (evidence earns authority; weakest link; hard human floor)
  evLevel: number; // 0..3 PROOF reached (ratchets up as evidence hardens)
  authLevel: number; // 0..3 permitted authority NOW (weakest link, floored for adverse)
  authUnlockTick: number; // tick authority last ROSE (drives the unlock pulse); -1 default
  adverse: boolean; // always-human cohort (adverse / high-dollar / novel)
  // kickback return-leg
  kbPhase: KbPhase;
  kbReason?: KbReason;
  kbStart: number;
  kbResumeSub: number;
  // scenario extensions (Diane MA showcase)
  hero?: boolean; // the spotlighted, named hero thread for a scenario walkthrough
  certGap?: boolean; // ADMINISTRATIVE (non-clinical) pend: payer has no current provider attestation on file
  evidenceRef?: string; // stable anchor to the member's reusable evidence record (Step 3 attaches here)
  certPendStart?: number; // tick the cert-attestation pend launched (STABLE — unlike kbStart which resets per leg)
  jeopardyFlagged?: boolean; // the clock-jeopardy detector fired for this thread (single-fire)
  jeopardyTicketKey?: string; // the live ticket key the detector minted (so Path-A resolution can close it)
}

// ── Evidence ledger (NIST-AI-RMF-tagged, hash-chained, append-only) ───────────────
// The NIST map + oversight derivation live in the SINGLE shared source `@/lib/goldenThread/nistMap`,
// used identically by the engine and every view — so there is exactly one work→NIST-function map.
export interface LedgerEntry {
  seq: number;
  tick: number;
  actor: string;
  human: boolean;
  fired: string;
  version: string;
  tier: string;
  rung: string;
  decision: string;
  nistFn: NistFn; // AI-RMF FUNCTION this act contributes to (single-sourced from NIST_SPEC)
  nistChar: string; // trustworthiness CHARACTERISTIC it supports (illustrative alignment)
  oversight: Oversight; // human-oversight mode on this act (HITL / HOTL / none)
  prevHash: number;
  hash: number;
  reproducible: boolean;
}

export interface SimEvent {
  tick: number;
  kind: 'pass' | 'pend' | 'deny' | 'ticket' | 'edi' | 'info' | 'waive' | 'loop';
  text: string;
}
export interface AckPulse {
  id: string;
  label: string;
  tick: number;
  ok: boolean;
}
export type TicketStatus = 'New' | 'Assigned' | 'Proposed' | 'Closed';
export type TicketDisposition = 'action-proposed' | 'resolved' | 'cleared' | 'escalated';
export interface LiveTicket {
  key: string;
  ref: string;
  algorithm: string;
  title: string;
  role: string;
  operator: string;
  severity: OpsTicket['severity'];
  exposureUsd: number;
  slaHours: number;
  bornTick: number;
  status: TicketStatus;
  assignedTo?: string;
  disposition?: TicketDisposition; // set as the analyst works it
  sealSeq: number; // the ledger seq of the sealed detection that minted this ticket (provenance link)
  closedTick?: number;
  proposedLabels?: string[]; // governed outbounds already proposed (idempotency)
  reconRecordSeq?: number; // when a ticket was routed FROM a recon record, its reconLedger seq (back-link)
  routedSeal?: number; // the ledger seq of the sealed ROUTING event (detection → seat queue) — set by routeDetection
  referSeal?: number; // the ledger seq of the sealed REFER-OUT event (SIU credible-fraud → State/MFCU · 455.23)
}

/**
 * One row of the reconciliation sub-ledger — the recon agent's per-claim audit trail. It is its own
 * append-only, hash-chained record (own prevHash/hash, re-derivable = tamper-evident, checked by
 * reconIntact and ANDed into the earned-authority integrity gate), and it is LINKED BOTH WAYS to the
 * main NIST ledger: `mainSealSeq` points at the reconciliation-stage seal that fired for this claim,
 * and a handoff routed from this record stamps the target ticket's `reconRecordSeq`. One thread, two
 * levels of detail — not two disconnected ledgers.
 */
export interface ReconRecord extends ReconRecordContent {
  seq: number;
  tick: number;
  claimId: string; // the raw claim id this record hashes/verifies against (its own field — NOT parsed from a display string)
  mainSealSeq: number; // the main-ledger seq of this claim's reconciliation-stage seal (provenance up)
  routed?: boolean; // a governed handoff has been proposed from this record
  recoveredUsd?: number; // set when a modelled 835 posts on an ACCEPTED appeal — realized recovery (not hashed)
  prevHash: number;
  hash: number;
}

export interface SimState {
  scenario: ScenarioId; // the active operating-book scenario (vocabulary + seed); default 'wa-medicaid'
  tick: number;
  rngState: number;
  seed: number;
  maturity: number;
  spotlightId: string | null;
  spawnSeq: number;
  batchSeq: number;
  ticketSeq: number;
  ackSeq: number;
  ledgerSeq: number;
  chainHead: number;
  nextAutoSpawn: number;
  txns: Txn[];
  events: SimEvent[];
  acks: AckPulse[];
  tickets: LiveTicket[];
  ledger: LedgerEntry[];
  completions: number[];
  recent: boolean[]; // rolling touchless outcomes
  recentGc: boolean[]; // rolling gold-card-waiver outcomes
  counters: {
    inFlight: number;
    approved: number;
    pended: number;
    denied: number;
    touchless: number;
    manualTouch: number;
    waived: number;
  };
  typeCounts: Record<TxnType, number>; // completed count by transaction type (the real-world mix, observed)
  nextRemit: number; // next tick an 835 remittance pulse fires
  nextFairness: number; // next tick a §1557 cohort fairness screen fires
  fairness: { ratio: number; n: number; flagged: boolean; tick: number } | null; // last cohort screen result
  addressed: string[]; // ticket refs for which a governed action has been PROPOSED (the disposition step)
  // ── EARNED AUTHORITY (fleet) — authority is EARNED + human-GRANTED; a breach REVOKES it automatically ──
  earnedCeiling: number; // 0..3 — the fleet authority actually earned AND granted (provisional A1 at cold start)
  earnedLookback: number; // acts queued for re-review after a revocation (fail-closed look-back)
  earnedEvents: EarnedEvent[]; // receipts strip, most-recent first — every ceiling move carries a reason + seal
  earnedEventSeq: number;
  lastRevokeTick: number; // drives the "slammed shut" window in the exec panel; -1 default
  shadow: { agree: number; total: number }; // shadow concordance — did the agent's proposal match the human's decision?
  // ── RECONCILIATION sub-ledger (recon agent's per-claim audit trail; own hash chain, main-linked) ──
  reconLedger: ReconRecord[];
  reconSeq: number;
  reconHead: number; // running hash head of the recon chain (own tamper-evidence)
  // ── WORKFLOWS + NOTIFICATIONS (a governed action DOES something: artifact, timeline, queue, response) ──
  workflows: Workflow[];
  notifications: WfNotification[];
  wfSeq: number;
  notifSeq: number;
}

// ── Earned-authority receipts + eligibility (pure, derived from REAL counters) ──────
export interface EarnedEvent {
  seq: number;
  tick: number;
  kind: 'provisional' | 'grant' | 'revoke';
  from: number;
  to: number;
  reason: string;
  by: string;
}
export interface EarnGate {
  label: string;
  met: boolean;
  detail: string;
}
export interface Eligibility {
  nextRung: number;
  eligible: boolean;
  gates: EarnGate[];
  blockedByScenario: boolean; // eligible on evidence, but the scenario cap won't allow it yet
}

function mulberry(s: SimState): number {
  const a = (s.rngState | 0) + 0x6d2b79f5;
  s.rngState = a | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function mixHash(prev: number, parts: Array<string | number | boolean>): number {
  let h = prev | 0;
  const push = (n: number): void => {
    h = Math.imul(h ^ n, 0x01000193) | 0;
  };
  push(0x9e3779b1);
  for (const p of parts) {
    const str = String(p);
    for (let i = 0; i < str.length; i += 1) push(str.charCodeAt(i));
  }
  return h >>> 0;
}
/** Cap the live-ticket window, but NEVER evict a ticket backing a non-terminal workflow (else an
 *  in-flight appeal's queue item vanishes under load — the "action produces nothing" bug relapsing).
 *  With no workflows this is identical to the old newest-12 truncation, so warm-up is byte-identical. */
function capTickets(s: SimState, max = 12): void {
  if (s.tickets.length <= max) return;
  const prot = new Set(
    s.workflows
      .filter((w) => w.state !== 'accepted' && w.state !== 'denied' && w.state !== 'rejected')
      .map((w) => w.ticketKey)
  );
  let budget = max - s.tickets.filter((t) => prot.has(t.key)).length;
  s.tickets = s.tickets.filter((t) => {
    if (prot.has(t.key)) return true;
    if (budget > 0) {
      budget -= 1;
      return true;
    }
    return false;
  });
}
function pushEvent(s: SimState, e: SimEvent): void {
  s.events.unshift(e);
  if (s.events.length > 60) s.events.length = 60;
}
function pushAck(s: SimState, label: string, ok: boolean): void {
  s.ackSeq += 1;
  s.acks.unshift({ id: `ack-${s.ackSeq}`, label, tick: s.tick, ok });
  if (s.acks.length > 10) s.acks.length = 10;
}
interface SealArgs {
  actor: string;
  human: boolean;
  fired: string;
  version: string;
  tier: string;
  rung: string;
  decision: string;
  reproducible?: boolean;
}
function seal(s: SimState, e: SealArgs): void {
  s.ledgerSeq += 1;
  const prevHash = s.chainHead;
  const spec = nistSpec(e.fired); // NIST AI-RMF specifics on every record (function + characteristic)
  // LEDGER HONESTY: an AGENT (non-human) act can never be recorded above what the fleet has EARNED. The
  // stated rung is the action-class ceiling; the EXERCISED authority is capped by execEarnedCeiling. So at
  // A0 the record shows agent acts at A0 — it cannot claim an autonomous A2 before A2 was earned + granted.
  if (!e.human) {
    const want = Number(e.rung.replace(/[^0-9]/g, '')) || 0;
    const capped = Math.min(want, execEarnedCeiling(s));
    // Only AUTONOMOUS ACTION above "Advise" (A1) is earned-capped. An agent may ALWAYS detect and advise a
    // human — that work is governed by the human gate, not the earned autonomous ceiling — so A1 detection/
    // advisory seals (clock-jeopardy, fairness-screen) are NOT clamped down to A0. This is single-sourced
    // with displayAuthority's `capApplies = !requiresHuman && want > 1`, so a ticket's A1 badge and its
    // sealed provenance row agree instead of contradicting each other.
    if (want > 1 && /^A[0-3]$/.test(e.rung) && capped !== want) {
      // Clamp the rung AND the version's autonomy token so the record is internally consistent — an A0 act
      // must not carry a HOTL/autonomous version tag. oversight (below) is derived from the clamped rung.
      const autoTok =
        capped >= 3 ? 'autonomous' : capped >= 2 ? 'HOTL' : capped >= 1 ? 'HITL' : 'watch';
      const tierPart = e.version.includes('·') ? e.version.split('·')[1] : e.tier;
      e = { ...e, rung: `A${capped}`, version: `${autoTok}·${tierPart}` };
    }
  }
  const oversight = deriveOversight(e.human, e.rung); // human-oversight mode, single-sourced
  const reproducible = e.reproducible ?? true;
  // Every field the record displays or asserts is inside the hash — incl. `human` (the solid/hollow
  // ring, who decided) and `reproducible` — so "any edit breaks the chain on re-read" holds for all of them.
  const hash = mixHash(prevHash, [
    s.ledgerSeq,
    s.tick,
    e.actor,
    e.human,
    e.fired,
    e.version,
    e.tier,
    e.rung,
    e.decision,
    spec.fn,
    spec.char,
    oversight,
    reproducible,
  ]);
  s.chainHead = hash;
  s.ledger.push({
    seq: s.ledgerSeq,
    tick: s.tick,
    actor: e.actor,
    human: e.human,
    fired: e.fired,
    version: e.version,
    tier: e.tier,
    rung: e.rung,
    decision: e.decision,
    nistFn: spec.fn,
    nistChar: spec.char,
    oversight,
    prevHash,
    hash,
    reproducible,
  });
  if (s.ledger.length > 400) s.ledger.shift(); // window; integrity re-derives from ledger[0].prevHash
}
function sealStage(s: SimState, node: PathNode, decision: string): void {
  const v = node.stage.verdict;
  seal(s, {
    actor: v.requiresHuman ? 'human:reviewer' : `agent:${node.stage.key}`,
    human: v.requiresHuman,
    fired: node.stage.key,
    version: `${v.autonomy}·${v.evidenceTier}`,
    tier: v.evidenceTier,
    rung: v.permittedRung,
    decision,
    reproducible: decision !== 'PEND',
  });
}

// Seed warm-up: a go-live operational environment is NOT empty — it opens with an existing book. We warm
// the deterministic engine so the ledger, in-flight transactions, counters, tickets and the shadow-
// concordance record are REAL and chain-valid on first paint. Authority still starts at A0 (no autonomous
// acts occur during warm-up; nothing is auto-granted) — the environment is warm, the trust is not.
const SEED_WARMUP = 620;
export function createSim(
  seed = 20260914,
  warmTicks = SEED_WARMUP,
  scenario: ScenarioId = 'wa-medicaid'
): SimState {
  const s: SimState = {
    scenario,
    tick: 0,
    rngState: seed,
    seed,
    maturity: 0,
    spotlightId: null,
    spawnSeq: 0,
    batchSeq: 0,
    ticketSeq: 0,
    ackSeq: 0,
    ledgerSeq: 0,
    chainHead: 0x601d,
    nextAutoSpawn: 2,
    txns: [],
    events: [{ tick: 0, kind: 'info', text: 'Operational simulation ready — press Play.' }],
    acks: [],
    tickets: [],
    ledger: [],
    completions: [],
    recent: [],
    recentGc: [],
    counters: {
      inFlight: 0,
      approved: 0,
      pended: 0,
      denied: 0,
      touchless: 0,
      manualTouch: 0,
      waived: 0,
    },
    typeCounts: { elig: 0, status: 0, pa: 0, claimP: 0, claimI: 0, claimD: 0, remit: 0, appeal: 0 },
    nextRemit: REMIT_CYCLE,
    nextFairness: 40, // first §1557 cohort screen fires early (pacing) — then every FAIRNESS_CYCLE
    fairness: null,
    addressed: [],
    // Cold start: TRUST STARTS AT ZERO. The machine begins at A0 — watch only, no action — and must EARN
    // every rung. It watches in shadow, proves concordance with human decisions, and a human grants A0→A1
    // (advise) → A2 (sign-off) → A3 (autonomous). Nothing is provisional; nothing is assumed.
    earnedCeiling: 0,
    earnedLookback: 0,
    earnedEvents: [
      {
        seq: 1,
        tick: 0,
        kind: 'provisional',
        from: 0,
        to: 0,
        reason:
          'Cold start — A0 · watch only. Nothing earned. The machine watches in shadow and must earn A1 by proving it agrees with humans.',
        by: 'system',
      },
    ],
    earnedEventSeq: 1,
    lastRevokeTick: -1,
    shadow: { agree: 0, total: 0 },
    reconLedger: [],
    reconSeq: 0,
    reconHead: RECON_CHAIN_SEED,
    workflows: [],
    notifications: [],
    wfSeq: 0,
    notifSeq: 0,
  };
  for (let i = 0; i < warmTicks; i += 1) advance(s); // warm the book (deterministic; no auto-grant)
  if (warmTicks > 0) {
    // Seed a visible in-flight population so the operational board opens busy: PAs mid-journey, coverage
    // and status inquiries, and a claims batch adjudicating. Spread them across stages by advancing between.
    for (let i = 0; i < 12; i += 1) {
      spawnTxn(s, i % 3 === 0 ? 'pa' : i % 3 === 1 ? 'elig' : 'status');
      advance(s);
      advance(s);
    }
    runBatch837(s, 8); // a claims batch in flight
    for (let i = 0; i < 40; i += 1) advance(s); // let the burst fan out across the swimlanes
    // The book is warm (ledger, in-flight txns, tickets are real prior operation) — but the TRUST is not.
    // Reset live shadow concordance to zero so A1 is EARNED ON SCREEN: the audience watches the agent prove
    // it agrees with humans, live, before the first grant. Pre-accrued concordance would hand A1 on a plate.
    s.shadow = { agree: 0, total: 0 };
    seedReconWarm(s); // warm the recon sub-ledger (RNG-free; no main-ledger seal/ticket → pin unchanged)
    pushEvent(s, {
      tick: s.tick,
      kind: 'info',
      text: `Warm operational environment — ${s.ledgerSeq} sealed records from prior operation. Live shadow validation begins now; authority starts at A0.`,
    });
    // Scenario hero: Diane's named PA thread — gated on 'diane-ma', so the default 'wa-medicaid' stream is
    // byte-identical (this branch never runs for the default). Seeded AFTER the warm-up/burst block.
    if (s.scenario === 'diane-ma') seedHeroThread(s);
  }
  return s;
}

/**
 * Seed the scenario's named hero PA (Diane). It is a prior-auth with an ADMINISTRATIVE certification gap
 * (payer has no current attestation on file) — NOT a clinical question. Path A only in Step 1: deemAdverse
 * is pinned false, so no fabricated denial ever renders against a named organization here. Spotlighted.
 */
function seedHeroThread(s: SimState): void {
  spawnTxn(s, 'pa');
  const t = s.txns[s.txns.length - 1];
  if (!t) return;
  t.hero = true;
  t.certGap = true;
  t.deemAdverse = false; // Step 1 builds Path A only — the hero never deems adverse
  t.evidenceRef = `evrec:${t.id}`; // stable anchor for the reusable evidence record (Step 3 attaches here)
  s.spotlightId = t.id;
  pushEvent(s, {
    tick: s.tick,
    kind: 'info',
    text: `Hero thread minted — ${scenarioOf(s).member?.name ?? 'member'} · expedited PA · evidence record ${t.evidenceRef}`,
  });
}

export function setMaturity(s: SimState, m: number): SimState {
  s.maturity = Math.max(0, Math.min(1, m));
  return s;
}

function resolveGate(s: SimState, node: PathNode): Gate {
  const v = node.stage.verdict;
  if (!v.requiresHuman) return 'pass';
  if (node.stage.key === 'payer-ops') return 'pass';
  return mulberry(s) < pPendSubmission(s.maturity) ? 'pend' : 'pass';
}

const ticketByAlgo = (algo: string): OpsTicket | undefined =>
  TICKETS.find((x) => x.algorithm === algo);
function mintTicket(s: SimState, reason: string, algo?: string): void {
  // The seeded TICKETS catalogue is WA-Medicaid content. A scenario that does not seed them (diane-ma)
  // keeps its Operations/Surveillance queue clean rather than showing Medicaid tickets under an MA header
  // — those tabs are re-grounded in a later step when the scenario's own tickets are built.
  if (!scenarioOf(s).seedMedicaidTickets) return;
  // F3: when a specific finding fires, mint the ticket that MATCHES it (right algorithm → right
  // persona → right RCA), so the minted ticket is not decoupled from what actually fired. Generic
  // surveillance completions round-robin the integrity catalogue.
  const t = (algo ? ticketByAlgo(algo) : undefined) ?? TICKETS[s.ticketSeq % TICKETS.length];
  s.ticketSeq += 1;
  s.tickets.unshift({
    key: `LT-${String(s.ticketSeq).padStart(4, '0')}`,
    ref: t.id,
    algorithm: t.algorithm,
    title: t.title,
    role: t.role,
    operator: t.operator,
    severity: t.severity,
    exposureUsd: t.exposureUsd,
    slaHours: t.slaHours,
    bornTick: s.tick,
    status: 'New',
    sealSeq: s.ledgerSeq, // link the ticket to the sealed detection record that just fired
  });
  capTickets(s);
  pushEvent(s, {
    tick: s.tick,
    kind: 'ticket',
    text: `${t.id} minted → ${t.operator} (${reason})`,
  });
}

// ── Clock-jeopardy detector + scenario ticket (Diane MA · Beat 8) ─────────────────
const JEOPARDY_TICKS = 6; // fire well before the ~12-tick cert kickback resolves — caught BEFORE expiry

/** Mint a scenario-specific ticket (bypasses the WA-Medicaid seedMedicaidTickets gate). Idempotent per ref. */
function mintScenarioTicket(s: SimState, ticketId: string): string | undefined {
  const t = scenarioTicketFor(s.scenario, ticketId);
  if (!t) return undefined;
  if (s.tickets.some((x) => x.ref === ticketId && x.status !== 'Closed')) return undefined;
  s.ticketSeq += 1;
  const key = `LT-${String(s.ticketSeq).padStart(4, '0')}`;
  s.tickets.unshift({
    key,
    ref: t.id,
    algorithm: t.algorithm,
    title: t.title,
    role: t.role,
    operator: t.operator,
    severity: t.severity,
    exposureUsd: t.exposureUsd,
    slaHours: t.slaHours,
    bornTick: s.tick,
    status: 'New',
    sealSeq: s.ledgerSeq,
  });
  capTickets(s);
  pushEvent(s, {
    tick: s.tick,
    kind: 'ticket',
    text: `${t.id} minted → ${t.operator} (clock-jeopardy · advisory)`,
  });
  return key;
}

/** Deterministic clock-jeopardy detector: flags the hero's cert-gap pend BEFORE expiry and mints an advisory
 *  UM-ops ticket. No RNG (tick threshold only). Single-fire per thread. */
function checkClockJeopardy(s: SimState): void {
  for (const txn of s.txns) {
    if (!txn.hero || !txn.certGap || txn.jeopardyFlagged) continue;
    if (txn.kbReason !== 'cert-attestation' || txn.kbPhase === 'none') continue;
    if (txn.certPendStart === undefined || s.tick - txn.certPendStart < JEOPARDY_TICKS) continue;
    txn.jeopardyFlagged = true;
    seal(s, {
      actor: 'agent:surveillance',
      human: false,
      fired: 'clock-jeopardy',
      version: 'HOTL·D1',
      tier: 'D1',
      rung: 'A1',
      decision: `CLOCK-JEOPARDY — expedited 72h clock at risk on an administrative cert gap (${scenarioOf(s).clockCite}); advise UM ops. Preemptive early-warning, NOT a determination.`,
    });
    pushEvent(s, {
      tick: s.tick,
      kind: 'ticket',
      text: `${txn.id} · clock-jeopardy detected before expiry — advisory ticket → UM ops`,
    });
    txn.jeopardyTicketKey = mintScenarioTicket(s, 'TKT-DIANE-CLK');
  }
}

/** Path-A resolution closes the advisory ticket honestly — caught early, resolved within clock. */
function closeJeopardyTicket(s: SimState, txn: Txn): void {
  if (!txn.jeopardyTicketKey) return;
  const t = s.tickets.find((x) => x.key === txn.jeopardyTicketKey);
  if (!t || t.status === 'Closed') return;
  t.status = 'Closed';
  t.disposition = 'resolved';
  t.closedTick = s.tick;
  seal(s, {
    actor: 'human:UM',
    human: true,
    fired: 'governed-action',
    version: 'HITL·D2',
    tier: 'D2',
    rung: 'A1',
    decision:
      'CLOCK-JEOPARDY CLOSED — resolved within clock; provider attestation located in the member evidence record (no clinical determination touched)',
  });
  pushEvent(s, {
    tick: s.tick,
    kind: 'info',
    text: `${t.ref} closed — cert gap resolved within clock (attestation in evidence record)`,
  });
}

// ── Reconciliation sub-ledger — the recon agent's per-claim audit trail ───────────
const RECON_CHAIN_SEED = 0x5ec04ec0;
const RECON_WINDOW = 400;

/**
 * Append one recon record for a claim reaching reconciliation. PURE of the RNG stream — the class is
 * derived from `classifyRecon` off the claim id (mixHash-free; no mulberry draw) and pinned to
 * `underpayment` when the engine's existing `disputed` roll fired, so the sub-ledger stays consistent
 * with the recovery routing. It appends to `s.reconLedger` and adds NO main-ledger seal and NO ticket,
 * so the default warm-start pin (chainHead/ledgerSeq/tick/tickets) is byte-identical. `mainSealSeq`
 * links up to the reconciliation-stage seal that already fired for this claim (bidirectional provenance).
 */
function reconHashOf(
  seq: number,
  tick: number,
  claimId: string,
  c: ReconRecordContent,
  prevHash: number
): number {
  // Chain over the audit-bearing fields — any edit to a recorded value breaks the chain on re-read. The id
  // is a first-class stored field (claimId), never parsed back out of a formatted display string.
  return mixHash(prevHash, [
    seq,
    tick,
    claimId,
    c.reconClass,
    c.group,
    c.carc,
    c.rarc,
    c.billedUsd,
    c.contractedUsd,
    c.paidUsd,
    c.deltaUsd,
    c.side,
    c.handoffRole ?? '',
  ]);
}
function pushReconRecord(
  s: SimState,
  id: string,
  disputed: boolean,
  patternProvider?: string
): void {
  if (s.reconLedger.some((r) => r.claimId === id)) return; // once per claim id (exact field match)
  const content = classifyRecon({
    id,
    tick: s.tick,
    disputed,
    scenario: s.scenario,
    patternProvider,
  });
  s.reconSeq += 1;
  const prevHash = s.reconHead;
  const hash = reconHashOf(s.reconSeq, s.tick, id, content, prevHash);
  s.reconHead = hash;
  const rec: ReconRecord = {
    ...content,
    claimRef: `${content.claimRef} · ${id}`,
    seq: s.reconSeq,
    tick: s.tick,
    claimId: id,
    mainSealSeq: s.ledgerSeq,
    prevHash,
    hash,
  };
  s.reconLedger.push(rec);
  if (s.reconLedger.length > RECON_WINDOW) s.reconLedger.shift();
}
function recordReconciliation(s: SimState, txn: Txn, disputed: boolean): void {
  pushReconRecord(s, txn.id, disputed);
}

/**
 * Warm the reconciliation sub-ledger so the board opens on a real operating portfolio (adversarial-
 * before MED: the live batch alone is ~6 claims — too few for insights or a systematic pattern). RNG-
 * FREE (classification is id-hash-derived) and it adds no main-ledger seal / no ticket, so the default
 * warm-start pin (chainHead/ledgerSeq/tick/tickets) is byte-identical. A designed CLUSTER of
 * underpayments on one provider/CPT gives the systematic-pattern + fee-schedule-config insights real
 * signal. `disputed` here is the modelled distribution, not the live recovery roll.
 */
const RECON_WARM_N = 64;
const RECON_CLUSTER_PROVIDER = 'Olympic Multispecialty Group (illustrative)';
function seedReconWarm(s: SimState): void {
  for (let i = 0; i < RECON_WARM_N; i += 1) {
    const id = `wclm-${String(i).padStart(4, '0')}`;
    // A designed cluster (indices 8..15) are underpayments on ONE provider/CPT — a mis-loaded fee
    // schedule — so the pattern & config insights fire; the rest is the id-hash distribution.
    const inCluster = i >= 8 && i <= 15;
    pushReconRecord(s, id, inCluster, inCluster ? RECON_CLUSTER_PROVIDER : undefined);
  }
}

/** Re-derive the recon chain — genuine tamper-evidence for the sub-ledger (mirrors ledgerIntact). */
export function reconIntact(s: SimState): boolean {
  let prev = s.reconLedger.length > 0 ? s.reconLedger[0].prevHash : RECON_CHAIN_SEED;
  for (const r of s.reconLedger) {
    if (r.prevHash !== prev) return false;
    if (reconHashOf(r.seq, r.tick, r.claimId, r, prev) !== r.hash) return false;
    prev = r.hash;
  }
  return true;
}

/** Re-derive ONE recon record's hash from its stored fields (local integrity re-check). */
export function verifyReconEntry(s: SimState, seq: number): boolean {
  const i = s.reconLedger.findIndex((r) => r.seq === seq);
  if (i < 0) return false;
  const r = s.reconLedger[i];
  const prev = i === 0 ? r.prevHash : s.reconLedger[i - 1].hash;
  if (prev !== r.prevHash) return false;
  return reconHashOf(r.seq, r.tick, r.claimId, r, prev) === r.hash;
}

// ── Governed recon handoffs — route a recon finding to the right seat as ONE Operations ticket ─────
// Single queue (adversarial-before): a handoff mints/advances a real Operations ticket (visible in both
// the recon board AND Operations), sealed via the SAME governed-action path (earned-gate + submission
// human-gate), back-linked to the recon record. Two-sided seat model: provider-side classes route to
// provider seats; payer-side classes route to payer seats — neither acts inside the other institution.
interface HandoffMeta {
  algo: string;
  title: string;
  label: string;
  slaHours: number;
}
const RECON_HANDOFF: Partial<Record<ReconClass, HandoffMeta>> = {
  underpayment: {
    algo: 'UNDERPAY-RECOVERY',
    title: 'Underpayment — governed appeal to payer',
    label: 'Payment dispute / reconsideration (appeal)',
    slaHours: 72,
  },
  overpayment: {
    algo: 'OVERPAY-RETURN',
    title: 'Identified overpayment — 60-day report-and-return',
    label: 'Report-and-return identified overpayment',
    slaHours: 48,
  },
  'bundling-downcode': {
    algo: 'BUNDLE-REVIEW',
    title: 'Bundling / downcode — coding review',
    label: 'Coding review — unbundling assessment',
    slaHours: 96,
  },
  'timely-filing': {
    algo: 'TIMELY-FILING',
    title: 'Timely-filing denial — process root-cause',
    label: 'Provider process note — filing-lag root cause',
    slaHours: 120,
  },
  'member-liability-review': {
    algo: 'MEMBER-LIABILITY',
    title: 'Medicaid member-liability — review',
    label: 'Member-liability review (Medicaid balance-bill guard)',
    slaHours: 72,
  },
};

/** Route ONE recon record to its seat as a governed Operations ticket. Idempotent per record; a user
 *  action (never called in advance()) so it never perturbs the warm-start pin. Provider ⇄ payer safe. */
export function routeReconHandoff(s: SimState, reconSeq: number, by = 'human:recon'): SimState {
  if (!scenarioOf(s).seedMedicaidTickets) return s; // recon book is WA-Medicaid content; suppressed under other scenarios
  const rec = s.reconLedger.find((r) => r.seq === reconSeq);
  if (!rec || rec.routed || !rec.handoffRole) return s;
  // SINGLE ENTRY for the underpayment class: it gets the full appeal WORKFLOW, not a bare handoff seal —
  // so one dispute never carries two overlapping governance artifacts.
  if (rec.reconClass === 'underpayment') return startAppealWorkflow(s, reconSeq, by);
  const meta = RECON_HANDOFF[rec.reconClass];
  if (!meta) return s;
  const spec = RECON_CLASS_SPEC[rec.reconClass];
  rec.routed = true;
  s.ticketSeq += 1;
  const key = `LT-${String(s.ticketSeq).padStart(4, '0')}`;
  const role = rec.handoffRole as OpsRole;
  const ticket: LiveTicket = {
    key,
    ref: `RCLM-${rec.seq}`,
    algorithm: meta.algo,
    title: meta.title,
    role,
    operator: OPERATORS[role] ?? rec.handoffRole,
    severity: rec.severity,
    exposureUsd: Math.abs(rec.deltaUsd),
    slaHours: meta.slaHours,
    bornTick: s.tick,
    status: 'New',
    sealSeq: s.ledgerSeq,
    reconRecordSeq: rec.seq,
  };
  s.tickets.unshift(ticket);
  capTickets(s);
  pushEvent(s, {
    tick: s.tick,
    kind: 'ticket',
    text: `RCLM-${rec.seq} · ${rec.reconClass} → ${role} (recon handoff)`,
  });
  // Seal the governed action. GATE = the governance PREDICATE (submission/adverse) OR the class flag — the
  // predicate is the source of truth, never a hand-set boolean alone (adversarial-after HIGH): so 'appeal',
  // 'overpayment-return', 'balance-bill-review' are human-gated by decisionGate itself. proposeOutbound also
  // clamps to the earned ceiling. A class with no outbound (timely-filing) seals an internal advisory note so
  // the ticket's sealSeq points at a REAL record, not some other act's head.
  if (spec.actionType) {
    proposeOutbound(s, key, meta.label, actionRequiresHuman(spec.actionType) || spec.humanGated);
  } else {
    seal(s, {
      actor: 'agent:recon',
      human: false,
      fired: 'reconciliation',
      version: 'HOTL·D2',
      tier: 'D2',
      rung: 'A1',
      decision: `${meta.label} — advisory note (no payer-facing submission; root-cause the provider filing lag)`,
    });
  }
  ticket.sealSeq = s.ledgerSeq; // point the provenance back-link at the action/note just sealed
  return s;
}

/** Route a SYSTEMATIC PATTERN (aggregate, not per-claim) to the payer seat that owns it: a uniform
 *  underpayment cluster → payer-config (mis-loaded fee schedule, reprocess); any other repeated
 *  concentration → payer-pi/SIU (FWA signal). Advisory A1 — opening a case / config change is human. */
export function routeReconPattern(
  s: SimState,
  kind: 'fee-schedule-config' | 'fwa-signal',
  provider: string,
  carc: string,
  count: number,
  amountUsd: number,
  by = 'human:recon'
): SimState {
  if (!scenarioOf(s).seedMedicaidTickets) return s; // suppressed under non-default scenarios (WA-Medicaid book)
  const role: OpsRole = kind === 'fee-schedule-config' ? 'payer-config' : 'payer-pi';
  // Ref is per (role, carc, provider) — each provider's concentration is its own pattern/ticket, so two
  // providers sharing a CARC do not collapse to one (or read as already-routed on the board).
  const ref = `RPAT-${role}-${carc}-${provider.slice(0, 10)}`.replace(/[^A-Za-z0-9-]/g, '');
  if (s.tickets.some((t) => t.ref === ref && t.status !== 'Closed')) return s; // idempotent per pattern
  s.ticketSeq += 1;
  const key = `LT-${String(s.ticketSeq).padStart(4, '0')}`;
  s.tickets.unshift({
    key,
    ref,
    algorithm: kind === 'fee-schedule-config' ? 'FEE-SCHEDULE-CONFIG' : 'RECON-PATTERN-FWA',
    title:
      kind === 'fee-schedule-config'
        ? `Systematic underpayment — mis-loaded fee schedule (${carc}, ${count} claims)`
        : `Systematic adjustment pattern — integrity review (${carc}, ${count} claims)`,
    role,
    operator: OPERATORS[role],
    severity: 'warning',
    exposureUsd: Math.round(amountUsd),
    slaHours: 48,
    bornTick: s.tick,
    status: 'New',
    sealSeq: s.ledgerSeq,
  });
  capTickets(s);
  // Advisory detection seal (A1) — an agent may always detect + advise; the reprocess / case-open is human.
  seal(s, {
    actor: 'agent:recon-pattern',
    human: false,
    fired: kind === 'fee-schedule-config' ? 'fee-schedule-config' : 'recon-pattern',
    version: 'HOTL·D2',
    tier: 'D2',
    rung: 'A1',
    decision:
      kind === 'fee-schedule-config'
        ? `SYSTEMATIC UNDERPAYMENT — ${carc} on ${count} claims (${provider}) points to a mis-loaded fee-schedule version → payer Claims Config to reprocess. Advisory; the config change and any reprocess are human decisions.`
        : `RECON PATTERN — ${carc} concentrated on ${count} claims (${provider}) → payer Program-Integrity review. Advisory; opening a case is a human determination.`,
  });
  pushEvent(s, {
    tick: s.tick,
    kind: 'ticket',
    text: `${ref} · systematic ${carc} pattern → ${role} (advisory)`,
  });
  return s;
}

// ── Appeal WORKFLOW engine — a governed action that actually DOES something ────────────────────────
// Single source of truth: a workflow-driven ticket's status is PROJECTED from the workflow state here;
// there is no parallel status machine on the ticket. Determinism-safe: no workflow exists during
// createSim warm-up, so stepWorkflows() is a no-op there and adds no seal / draws no RNG → pin holds.
function ticketStatusFor(wf: Workflow): TicketStatus {
  switch (wf.state) {
    case 'assembling':
    case 'awaiting-review':
      return 'Assigned';
    case 'awaiting-release':
    case 'released':
    case 'awaiting-response':
      return 'Proposed';
    case 'accepted':
    case 'denied':
    case 'rejected':
      return 'Closed';
  }
}
function syncTicketStatus(s: SimState, wf: Workflow): void {
  const t = s.tickets.find((x) => x.key === wf.ticketKey);
  if (!t) return;
  t.status = ticketStatusFor(wf);
  if (t.status === 'Closed') {
    // 'cleared' means false-positive/nothing-owed — a DENIED appeal is the opposite (still an open matter,
    // escalated to the arbiter), so it must not read as cleared. accepted→resolved, denied→escalated, rejected→cleared.
    t.disposition =
      wf.state === 'accepted' ? 'resolved' : wf.state === 'denied' ? 'escalated' : 'cleared';
    t.closedTick = s.tick;
  }
}
function notify(s: SimState, to: string, kind: NotificationKind, ref: string, text: string): void {
  s.notifSeq += 1;
  s.notifications.unshift({
    id: `N-${String(s.notifSeq).padStart(4, '0')}`,
    to,
    kind,
    ref,
    text,
    tick: s.tick,
    read: false,
  });
  if (s.notifications.length > 40) s.notifications.length = 40;
}
/** Complete one workflow step: seal a provenance record, stamp actor/tick/sealSeq, mark done. Idempotent. */
function completeStep(
  s: SimState,
  wf: Workflow,
  key: string,
  actor: string,
  human: boolean,
  rung: string,
  decision: string
): void {
  const step = wf.steps.find((st) => st.key === key);
  if (!step || step.done) return; // idempotent per (workflow, step)
  seal(s, {
    actor,
    human,
    fired: 'governed-action',
    version: `${human ? 'HITL' : 'HOTL'}·D2`,
    tier: 'D2',
    rung,
    decision,
  });
  step.done = true;
  step.actor = actor;
  step.tick = s.tick;
  step.sealSeq = s.ledgerSeq;
}
export function dismissNotification(s: SimState, id: string): SimState {
  const n = s.notifications.find((x) => x.id === id);
  if (n) n.read = true;
  return s;
}

/** Start the underpayment→appeal workflow on a recon record. Mints/uses the provider-revint ticket,
 *  auto-runs the agent assemble step (produces the packet artifact), and queues it for review. */
export function startAppealWorkflow(s: SimState, reconSeq: number, by = 'human:recon'): SimState {
  if (!scenarioOf(s).seedMedicaidTickets) return s;
  const rec = s.reconLedger.find((r) => r.seq === reconSeq);
  if (!rec || rec.reconClass !== 'underpayment') return s;
  if (s.workflows.some((w) => w.reconSeq === reconSeq)) return s; // idempotent per record
  // find the linked provider-revint ticket, or mint one (the appeal handoff ticket)
  let ticket = s.tickets.find((t) => t.reconRecordSeq === reconSeq);
  if (!ticket) {
    s.ticketSeq += 1;
    const key = `LT-${String(s.ticketSeq).padStart(4, '0')}`;
    ticket = {
      key,
      ref: `RCLM-${rec.seq}`,
      algorithm: 'UNDERPAY-RECOVERY',
      title: 'Underpayment — governed appeal to payer',
      role: 'provider-revint',
      operator: OPERATORS['provider-revint'],
      severity: 'action',
      exposureUsd: Math.abs(rec.deltaUsd),
      slaHours: APPEAL_SLA_HOURS,
      bornTick: s.tick,
      status: 'New',
      sealSeq: s.ledgerSeq,
      reconRecordSeq: rec.seq,
    };
    s.tickets.unshift(ticket);
    capTickets(s);
  }
  rec.routed = true;
  s.wfSeq += 1;
  const id = `WF-${String(s.wfSeq).padStart(4, '0')}`;
  const claimRef = rec.claimRef.split(' · ').slice(0, 3).join(' · ');
  const wf: Workflow = {
    id,
    kind: 'underpayment-appeal',
    ticketKey: ticket.key,
    reconSeq: rec.seq,
    provider: rec.provider,
    payer: rec.payer,
    amountUsd: Math.abs(rec.deltaUsd),
    state: 'assembling',
    steps: appealSteps(),
    artifact: buildAppealArtifact({
      provider: rec.provider,
      payer: rec.payer,
      amountUsd: Math.abs(rec.deltaUsd),
      carc: rec.carc,
      claimRef,
      variancePct: rec.variancePct,
    }),
    routedTick: s.tick,
    slaHours: APPEAL_SLA_HOURS,
  };
  s.workflows.push(wf);
  // agent assembles the packet (advisory A1 — an agent drafts; it decides nothing)
  completeStep(
    s,
    wf,
    'assemble',
    'agent:recon',
    false,
    'A1',
    `Appeal packet assembled for ${claimRef} ($${Math.round(wf.amountUsd).toLocaleString()} in dispute) — draft, not transmitted`
  );
  wf.state = 'awaiting-review';
  syncTicketStatus(s, wf);
  notify(
    s,
    APPEAL_REVIEWER_SEAT,
    'approval-needed',
    id,
    `Appeal ready for review — ${claimRef} · $${Math.round(wf.amountUsd).toLocaleString()} in dispute`
  );
  pushEvent(s, {
    tick: s.tick,
    kind: 'ticket',
    text: `${id} · appeal packet assembled → ${APPEAL_REVIEWER_SEAT} review queue`,
  });
  return s;
}
/** Reviewer approves (→ awaiting a separate releaser) or rejects (→ closed, never released). */
export function reviewAppeal(
  s: SimState,
  wfId: string,
  by: string,
  approve: boolean,
  note?: string
): SimState {
  const wf = s.workflows.find((w) => w.id === wfId);
  if (!wf || wf.state !== 'awaiting-review') return s;
  if (approve) {
    wf.reviewer = by;
    completeStep(
      s,
      wf,
      'review',
      `human:${by}`,
      true,
      'A1',
      `Revenue-Integrity review APPROVED — cleared for authorized release${note ? ` · ${note}` : ''}`
    );
    wf.state = 'awaiting-release';
    syncTicketStatus(s, wf);
    notify(
      s,
      APPEAL_RELEASER,
      'approval-needed',
      wfId,
      `Appeal reviewed — authorize release to ${wf.payer} · $${Math.round(wf.amountUsd).toLocaleString()}`
    );
    pushEvent(s, {
      tick: s.tick,
      kind: 'info',
      text: `${wfId} · review approved → awaiting authorized release`,
    });
  } else {
    completeStep(
      s,
      wf,
      'review',
      `human:${by}`,
      true,
      'A1',
      `Review REJECTED — draft not released${note ? ` · ${note}` : ''}`
    );
    wf.state = 'rejected';
    syncTicketStatus(s, wf);
    notify(s, APPEAL_REVIEWER_SEAT, 'resolved', wfId, `Appeal rejected internally — not released`);
  }
  return s;
}
/** Authorized releaser submits to the payer. SUBMISSION → human-gated ALWAYS; SoD: releaser ≠ reviewer. */
export function releaseAppeal(s: SimState, wfId: string, by: string): SimState {
  const wf = s.workflows.find((w) => w.id === wfId);
  if (!wf || wf.state !== 'awaiting-release') return s;
  if (wf.reviewer && by === wf.reviewer) return s; // segregation of duties: the releaser must differ from the reviewer
  wf.releaser = by;
  // A payer-facing submission — sealed human-gated regardless of earned rung; mock channel, not transmitted.
  completeStep(
    s,
    wf,
    'release',
    `human:${by}`,
    true,
    'A1',
    `RELEASED to ${wf.payer} — dispute/appeal submitted (mock channel, not transmitted). Awaiting payer response.`
  );
  wf.state = 'awaiting-response';
  wf.respondTick = s.tick + RESPONSE_TICKS;
  syncTicketStatus(s, wf);
  notify(
    s,
    APPEAL_REVIEWER_SEAT,
    'released',
    wfId,
    `Appeal released to ${wf.payer} — awaiting response`
  );
  pushEvent(s, {
    tick: s.tick,
    kind: 'info',
    text: `${wfId} · released to payer (mock) — awaiting modelled response`,
  });
  return s;
}

/** advance()-time sweep: resolve released appeals with a MODELLED payer response, and fire SLA warnings.
 *  RNG-FREE (accept/deny is a hash of the workflow id; timing is integer ticks). No-op with no workflows,
 *  so it never runs during warm-up → the determinism pin is untouched. */
function stepWorkflows(s: SimState): void {
  if (s.workflows.length === 0) return;
  for (const wf of s.workflows) {
    // SLA warning (once) for anything still waiting on a human
    if (
      !wf.slaWarned &&
      (wf.state === 'awaiting-review' || wf.state === 'awaiting-release') &&
      s.tick - wf.routedTick >= Math.round(wf.slaHours * TICKS_PER_HOUR * SLA_WARN_FRACTION)
    ) {
      wf.slaWarned = true;
      notify(
        s,
        wf.state === 'awaiting-review' ? APPEAL_REVIEWER_SEAT : APPEAL_RELEASER,
        'sla-warning',
        wf.id,
        `SLA at risk — appeal ${wf.id} still awaiting action`
      );
    }
    // Modelled payer response (deterministic, NOT a timer-to-Resolved flip)
    if (
      wf.state === 'awaiting-response' &&
      wf.respondTick !== undefined &&
      s.tick >= wf.respondTick
    ) {
      const outcome = appealOutcome(wf.id);
      if (outcome === 'accepted') {
        // a MODELLED 835 adjustment posts — only NOW is the amount "recovered" (honesty invariant)
        completeStep(
          s,
          wf,
          'response',
          'agent:payer-response',
          false,
          'A1',
          `PAYER ACCEPTED — modelled 835 adjustment posts; $${Math.round(wf.amountUsd).toLocaleString()} reprocessed to contract (mock, not transmitted)`
        );
        wf.recoveredUsd = wf.amountUsd;
        // back-write the realized recovery to the recon record so the sub-ledger reflects it and the
        // board's "Recoverable" KPI nets it out (no double-truth: identified vs realized).
        if (wf.reconSeq !== undefined) {
          const rr = s.reconLedger.find((r) => r.seq === wf.reconSeq);
          if (rr) rr.recoveredUsd = wf.amountUsd;
        }
        wf.state = 'accepted';
        notify(
          s,
          APPEAL_REVIEWER_SEAT,
          'response-received',
          wf.id,
          `Appeal ACCEPTED — $${Math.round(wf.amountUsd).toLocaleString()} recovered (modelled 835)`
        );
      } else {
        completeStep(
          s,
          wf,
          'response',
          'agent:payer-response',
          false,
          'A1',
          `PAYER DENIED the appeal — routed to arbiter (appeal-of-appeal / State TPL·PI recovery)`
        );
        wf.state = 'denied';
        // route the denial to the neutral arbiter seat as a fresh work-item
        s.ticketSeq += 1;
        const akey = `LT-${String(s.ticketSeq).padStart(4, '0')}`;
        s.tickets.unshift({
          key: akey,
          ref: `ARB-${wf.id}`,
          algorithm: 'APPEAL-DENIED',
          title: `Appeal denied — arbiter review (${wf.payer})`,
          role: ARBITER_SEAT,
          operator: OPERATORS['arbiter'],
          severity: 'warning',
          exposureUsd: Math.round(wf.amountUsd),
          slaHours: 120,
          bornTick: s.tick,
          status: 'New',
          sealSeq: s.ledgerSeq,
          reconRecordSeq: wf.reconSeq,
        });
        capTickets(s);
        notify(
          s,
          ARBITER_SEAT,
          'assigned',
          wf.id,
          `Denied appeal → arbiter (appeal-of-appeal) · $${Math.round(wf.amountUsd).toLocaleString()}`
        );
      }
      syncTicketStatus(s, wf);
      pushEvent(s, {
        tick: s.tick,
        kind: outcome === 'accepted' ? 'waive' : 'deny',
        text: `${wf.id} · payer ${outcome} (modelled)`,
      });
    }
  }
  if (s.workflows.length > 24) s.workflows.splice(0, s.workflows.length - 24); // window
}

function spawnTxn(s: SimState, type: TxnType, batchId?: string): void {
  s.spawnSeq += 1;
  const meta = TXN_TYPE_META[type];
  const startIdx = idxOf(meta.startKey);
  const stopIdx = idxOf(meta.stopKey);
  // appeals are always-human by definition; other types draw an adverse/high-dollar/novel cohort.
  const must = meta.human === true || mulberry(s) < HONESTY_FLOOR;
  s.txns.push({
    id: `${type}-${String(s.spawnSeq).padStart(4, '0')}`,
    kind: meta.kind,
    type,
    batchId,
    idx: startIdx,
    targetIdx: startIdx,
    stopIdx,
    phase: 'gate',
    progress: 1,
    phaseStart: s.tick,
    bornTick: s.tick,
    gates: {},
    rtLeg: 0,
    steps: PAYER_SUBSTEPS,
    sub: 0,
    subDwell: SUB_BEAT,
    subPended: false,
    express: false,
    touchedHuman: meta.human === true, // an appeal is a human act from the start
    mustHuman: must,
    goldCarded: false,
    disputed: false,
    deemAdverse: false,
    evLevel: 0,
    authLevel: 0,
    authUnlockTick: -1,
    adverse: must,
    kbPhase: 'none',
    kbStart: 0,
    kbResumeSub: 0,
  });
  s.counters.inFlight += 1;
}

/** Ratchet a txn's PROOF as it clears a stage; authority follows as the weakest link (pulse on rise). */
function bumpProof(s: SimState, txn: Txn, node: PathNode): void {
  txn.evLevel = Math.max(txn.evLevel, TIER_ORD[node.stage.verdict.evidenceTier] ?? 0);
  const auth = execAuthority(s, txn.evLevel, txn.adverse);
  if (auth > txn.authLevel) txn.authUnlockTick = s.tick;
  txn.authLevel = auth;
}

export function spawn278(s: SimState): SimState {
  spawnTxn(s, 'pa');
  pushEvent(s, {
    tick: s.tick,
    kind: 'info',
    text: `278 prior-auth received via provider gateway (real-time)`,
  });
  return s;
}
const CLAIM_MIX: TxnType[] = ['claimP', 'claimP', 'claimI', 'claimD']; // professional-heavy, per real book
export function runBatch837(s: SimState, n = 12): SimState {
  s.batchSeq += 1;
  const batchId = `BATCH-${String(s.batchSeq).padStart(3, '0')}`;
  const reject = 1 + Math.floor(mulberry(s) * 2);
  for (let i = 0; i < n - reject; i += 1) spawnTxn(s, CLAIM_MIX[i % CLAIM_MIX.length], batchId);
  pushEvent(s, {
    tick: s.tick,
    kind: 'edi',
    text: `837 claim file received (${n}: P/I/D) → 999 Accepted · ${reject} rejected (front-end edits)`,
  });
  pushAck(s, '999', true);
  pushAck(s, '277CA', reject === 0);
  return s;
}
/** 835 remittance advice posts on the payment cycle (a pulse of claims paid), not in real time. */
export function runRemitCycle(s: SimState, n = REMIT_BATCH): SimState {
  for (let i = 0; i < n; i += 1) spawnTxn(s, 'remit');
  pushEvent(s, {
    tick: s.tick,
    kind: 'edi',
    text: `835 remittance advice posted (${n}) — payment cycle`,
  });
  pushAck(s, '835', true);
  return s;
}
/**
 * §1557 four-fifths / disparate-impact screen — a COHORT statistic, not a per-transaction test.
 * It reads accumulated decision outcomes and seals ONE `fairness-screen` record referencing the
 * cohort n and the four-fifths ratio; it raises a Medical-Director finding only when ratio < 0.80.
 * Illustrative (the cohort split is modeled, not from real member data) and honestly labelled.
 */
export function runFairnessScreen(s: SimState): SimState {
  const decided = s.counters.approved + s.counters.denied;
  if (decided < 8) return s; // not enough cohort volume yet — a ratio on n<8 is meaningless
  const denyRate = s.counters.denied / decided;
  // Illustrative §1557 four-fifths ratio for the protected (behavioral-health) cohort: it hovers just
  // above the 0.80 line and is pulled DOWN as the book's denial rate rises, with honest period-to-period
  // variance — so it periodically breaches 0.80 at ANY maturity (the safeguard is never hidden). Grounded
  // in accumulated deny data (denyRate) + a seeded per-period term; the cohort split is modeled, not real.
  const base = 0.86 - denyRate * 1.2;
  const periodVar = (mulberry(s) - 0.5) * 0.14;
  const ratio = Number(Math.max(0.6, Math.min(0.98, base + periodVar)).toFixed(2)); // four-fifths ratio
  const flagged = ratio < 0.8;
  s.fairness = { ratio, n: decided, flagged, tick: s.tick };
  seal(s, {
    actor: 'agent:surveillance-fairness',
    human: false,
    fired: 'fairness-screen',
    version: 'HOTL·D1',
    tier: 'D1',
    rung: 'A1', // a signal that ADVISES a human — never an autonomous rule change
    decision: flagged
      ? `§1557 four-fifths ratio ${ratio.toFixed(2)} < 0.80 · BH cohort n=${decided} → Medical-Director review (no rule change auto-applied)`
      : `§1557 four-fifths ratio ${ratio.toFixed(2)} ≥ 0.80 · BH cohort n=${decided} — within tolerance`,
    reproducible: true,
  });
  pushEvent(s, {
    tick: s.tick,
    kind: flagged ? 'pend' : 'info',
    text: flagged
      ? `Fairness screen — §1557 disparate-impact signal (ratio ${ratio.toFixed(2)}, n=${decided}) → Medical Director`
      : `Fairness screen — within four-fifths tolerance (ratio ${ratio.toFixed(2)}, n=${decided})`,
  });
  if (flagged) mintTicket(s, 'disparate-impact', 'DENY-DISPARATE-IMPACT');
  // FAIL-CLOSED: a §1557 breach automatically REVOKES earned authority (no human needed to LOSE it) —
  // but only if the fleet had earned above the provisional floor (hysteresis: nothing to lose at A1).
  if (flagged)
    revokeAuthority(s, `§1557 four-fifths ${ratio.toFixed(2)} < 0.80 (BH cohort n=${decided})`);
  return s;
}

/**
 * EARNED AUTHORITY — the fleet EARNS eligibility against gates computed from REAL counters, a human GRANTS
 * the promotion (never automatic), and a breach REVOKES it automatically. "Motion has to be earned."
 * All pure/deterministic: reads counters, never Date.now/Math.random.
 */
export function earnedEligibility(s: SimState): Eligibility {
  const nextRung = Math.min(s.earnedCeiling + 1, 3);
  const scenario = execFleetCeiling(s);
  const conc = s.shadow.total > 0 ? s.shadow.agree / s.shadow.total : 0;
  const concN = s.shadow.total;
  // Zero autonomous adverse — computed from the ledger (a live count that COULD trip), not asserted.
  const advMet = !s.ledger.some(
    (e) => !e.human && e.rung === 'A3' && /adverse|deny|denied|NABD/i.test(e.decision)
  );
  // Chain integrity (tamper-evidence). Re-derives BOTH hash chains — the main NIST ledger AND the
  // reconciliation sub-ledger — so a tampered recon audit row also fails the gate (fail-closed extends
  // to the recon trail; it is not a second, ungoverned ledger). Decision-replay is illustrative.
  const integrityMet = ledgerIntact(s) && reconIntact(s);
  const fairMet = !!s.fairness && !s.fairness.flagged;
  const gates: EarnGate[] = [];
  // The EARNING signal is rung-aware. The first climbs are earned by SHADOW CONCORDANCE (the agent proving
  // it agrees with humans), NOT by autonomous volume — so A0→A1 is reachable without waiting on the fairness
  // cohort clock. Fairness gates A2+; sustained autonomous volume gates A3.
  if (nextRung <= 2) {
    const need = nextRung === 1 ? 4 : 10;
    const thr = nextRung === 1 ? 0.9 : 0.92;
    const concMet = concN >= need && conc >= thr;
    gates.push({
      label: 'Shadow concordance — agent agrees with humans',
      met: concMet,
      detail: `${(conc * 100).toFixed(0)}% agree (n=${concN}) · need ≥${(thr * 100).toFixed(0)}% at n≥${need}`,
    });
  } else {
    const track = s.counters.touchless;
    const need = 24;
    gates.push({
      label: 'Sustained autonomous track record',
      met: track >= need,
      detail: `${track} / ${need} touchless resolutions, reproducible`,
    });
  }
  if (nextRung >= 2) {
    gates.push({
      label: 'Fairness held (last screen, illustrative)',
      met: fairMet,
      detail: s.fairness
        ? `§1557 ratio ${s.fairness.ratio.toFixed(2)} ${fairMet ? '≥' : '<'} 0.80 · BH cohort`
        : 'awaiting first cohort screen',
    });
  }
  gates.push({
    label: 'Zero autonomous adverse (from ledger)',
    met: advMet,
    detail: advMet ? 'no agent-issued adverse in the record' : 'agent adverse found — blocked',
  });
  gates.push({
    label: 'Chain integrity (tamper-evident)',
    met: integrityMet,
    detail: integrityMet ? 'ledger re-derives · replay illustrative' : 'integrity check FAILED',
  });
  const gatesMet = gates.every((g) => g.met);
  const canGrow = nextRung > s.earnedCeiling;
  const blockedByScenario = canGrow && gatesMet && nextRung > scenario;
  const eligible = canGrow && gatesMet && nextRung <= scenario;
  return { nextRung, eligible, gates, blockedByScenario };
}

/** Human GRANT — a governed act. Raises the earned ceiling one rung IF eligible; seals a human-attributed record. */
export function grantPromotion(s: SimState, by = 'human:governance'): SimState {
  const e = earnedEligibility(s);
  if (!e.eligible) return s;
  const from = s.earnedCeiling;
  const to = e.nextRung;
  s.earnedCeiling = to;
  const clearedLookback = s.earnedLookback; // re-ratification dispositions any open revocation look-back
  s.earnedLookback = 0;
  s.earnedEventSeq += 1;
  s.earnedEvents.unshift({
    seq: s.earnedEventSeq,
    tick: s.tick,
    kind: 'grant',
    from,
    to,
    reason: `Ratified A${from}→A${to}: eligibility gates met, human-granted${clearedLookback > 0 ? ` · ${clearedLookback}-act look-back dispositioned` : ''}`,
    by,
  });
  if (s.earnedEvents.length > 12) s.earnedEvents.length = 12;
  seal(s, {
    actor: by,
    human: true,
    fired: 'governed-action',
    version: `GRANT·A${to}`,
    tier: 'D3',
    rung: `A${to}`,
    decision: `Authority ceiling raised A${from}→A${to} — human-ratified (eligibility gates met; promotion is never automatic)`,
    reproducible: true,
  });
  pushEvent(s, {
    tick: s.tick,
    kind: 'waive',
    text: `Authority earned: A${from}→A${to} ratified by ${by}`,
  });
  return s;
}

/** Automatic REVOCATION (fail-closed). Drops the earned ceiling, freezes promotions, opens a look-back. */
export function revokeAuthority(s: SimState, reason: string): SimState {
  if (s.earnedCeiling <= 1) return s; // provisional floor stays — nothing elevated to lose (avoids thrash)
  const from = s.earnedCeiling;
  const to = from - 1;
  s.earnedCeiling = to;
  s.lastRevokeTick = s.tick;
  const recall = Math.max(1, Math.round(s.counters.touchless * 0.1)); // acts taken under earned authority → re-review
  s.earnedLookback += recall;
  s.earnedEventSeq += 1;
  s.earnedEvents.unshift({
    seq: s.earnedEventSeq,
    tick: s.tick,
    kind: 'revoke',
    from,
    to,
    reason,
    by: 'auto:fail-closed',
  });
  if (s.earnedEvents.length > 12) s.earnedEvents.length = 12;
  seal(s, {
    actor: 'auto:fail-closed',
    human: false,
    fired: 'surveillance',
    version: `REVOKE·A${to}`,
    tier: 'D1',
    rung: `A${to}`,
    decision: `Authority ceiling dropped A${from}→A${to} — ${reason}; promotions frozen; ${s.earnedLookback} acts queued for look-back`,
    reproducible: true,
  });
  pushEvent(s, {
    tick: s.tick,
    kind: 'deny',
    text: `Authority revoked A${from}→A${to} (fail-closed): ${reason}`,
  });
  return s;
}

/**
 * A governed outbound proposed from the analyst workbench, keyed to a LIVE ticket. This ACTUALLY
 * appends a sealed record to the live ledger (so the "sealed records" count moves and the claim is
 * true) AND advances the ticket to Proposed: human-gated → `proposed` (pending human release, A1);
 * non-adverse → `executed` (A2). Nothing is transmitted — channel is mock.
 */
export function proposeOutbound(
  s: SimState,
  key: string,
  label: string,
  humanGated: boolean
): SimState {
  const t = s.tickets.find((x) => x.key === key);
  if (!t || t.status === 'Closed') return s; // never seal against a closed/evicted ticket
  if (!t.proposedLabels) t.proposedLabels = [];
  if (t.proposedLabels.includes(label)) return s; // idempotent per (ticket, action) — no double-seal
  t.proposedLabels.push(label);
  if (!s.addressed.includes(t.ref)) s.addressed.push(t.ref);
  // EARNED-GATE (single behavioral source): autonomous EXECUTION of a non-adverse action requires the fleet
  // to have EARNED A2. Below that — even for a non-gated action — it seals as a human-released PROPOSAL, so
  // the ledger can never show an "A0/A1 … EXECUTED" agent act. This binds the ENGINE, not just the UI.
  const autoEarned = execEarnedCeiling(s) >= 2;
  const gated = humanGated || !autoEarned;
  const unearned = !humanGated && !autoEarned;
  seal(s, {
    actor: gated ? 'human:analyst' : 'agent:workbench',
    human: gated,
    fired: 'governed-action',
    version: gated ? 'HITL·D2' : 'HOTL·D2',
    tier: 'D2',
    rung: gated ? 'A1' : 'A2',
    decision: gated
      ? `${label} — PROPOSED (pending human release${unearned ? '; fleet has not earned autonomous authority (now A' + execEarnedCeiling(s) + ')' : ''})`
      : `${label} — EXECUTED (non-adverse, mock channel)`,
    reproducible: true,
  });
  t.status = 'Proposed';
  t.disposition = 'action-proposed';
  pushEvent(s, {
    tick: s.tick,
    kind: gated ? 'pend' : 'info',
    text: `${t.ref} · ${label} ${gated ? 'proposed → pending human release' : 'recorded (non-adverse)'}`,
  });
  return s;
}
/**
 * Close a case from the workbench — the loop's terminal step. 'resolved' = the proposed governed
 * action is the disposition; 'cleared' = the analyst dispositions it not-FWA. Either way a CLOSURE
 * record is APPENDED to the ledger (evidence is never deleted — closing seals, it does not remove).
 */
export function closeCase(
  s: SimState,
  key: string,
  disposition: 'resolved' | 'cleared',
  by: string,
  reason?: string
): SimState {
  const t = s.tickets.find((x) => x.key === key);
  if (!t || t.status === 'Closed') return s;
  t.status = 'Closed';
  t.disposition = disposition;
  t.closedTick = s.tick;
  // 'resolved' does NOT claim the action "stands" — the governed outbound was only PROPOSED (pending
  // human release). The rationale, when supplied, is sealed into the record (required for critical clears).
  const base =
    disposition === 'cleared'
      ? `CASE CLOSED — cleared, not FWA (human disposition)`
      : `CASE CLOSED — dispositioned (any proposed action remains pending human release)`;
  const decision = reason ? `${base} · rationale: ${reason}` : base;
  seal(s, {
    actor: `human:${by}`,
    human: true,
    fired: 'governed-action',
    version: 'HITL·D2',
    tier: 'D2',
    rung: 'A2',
    decision,
    reproducible: true,
  });
  pushEvent(s, {
    tick: s.tick,
    kind: 'info',
    text: `${t.ref} · case closed — ${disposition} (${by})`,
  });
  return s;
}
export function grabTicket(s: SimState, key: string, by: string): SimState {
  const t = s.tickets.find((x) => x.key === key);
  if (t && t.status === 'New') {
    t.status = 'Assigned';
    t.assignedTo = by;
    pushEvent(s, { tick: s.tick, kind: 'info', text: `${t.ref} grabbed → assigned to ${by}` });
  }
  return s;
}
/**
 * Route a surveillance detection into its seat's governed QUEUE — a REAL, sealed governance event, not
 * a caption. Appends a `routing` record (agent-orchestrated, HOTL·A1 advisory — routing is not an
 * autonomous action over a member, so it seals at advise-level and is never earned-clamped) and, for a
 * credible-fraud SIU detection, a second `refer-out` record (a HUMAN referral under 42 CFR 455.23 —
 * the State agency's suspension authority; the MCO acts under 438.608(a)). Re-points the ticket's
 * sealSeq at the routing row so "Triggered to {seat}" is re-verifiable provenance rather than a label.
 * Idempotent per ticket. UI-only (never called during createSim/advance) → determinism pin unaffected.
 */
export function routeDetection(
  s: SimState,
  key: string,
  seat: string,
  authority: string,
  referOut?: string
): SimState {
  const t = s.tickets.find((x) => x.key === key);
  if (!t || t.status !== 'New' || t.routedSeal !== undefined) return s; // idempotent; only an un-routed New ticket routes
  seal(s, {
    actor: 'agent:surveillance',
    human: false,
    fired: 'routing',
    version: 'HOTL·D2',
    tier: 'D2',
    rung: 'A1',
    decision: `ROUTED → ${seat}; authority: ${authority}; SLA ${t.slaHours}h; segregation-of-duties: investigative (SIU/FWA) ≠ clinical (medical-necessity) authorities`,
    reproducible: true,
  });
  t.routedSeal = s.ledgerSeq;
  t.sealSeq = s.ledgerSeq; // the routing row now backs this detection's "Triggered to …" provenance
  if (referOut) {
    seal(s, {
      actor: 'human:SIU',
      human: true,
      fired: 'refer-out',
      version: 'HITL·D2',
      tier: 'D2',
      rung: 'A2',
      decision: `REFER-OUT → ${referOut}`,
      reproducible: true,
    });
    t.referSeal = s.ledgerSeq;
  }
  pushEvent(s, {
    tick: s.tick,
    kind: 'info',
    text: `${t.ref} routed → ${seat}${referOut ? ' · referred out (455.23)' : ''}`,
  });
  return s;
}
/**
 * Reproduce ONE ledger entry: re-derive its hash from its stored fields against the prior link and
 * confirm the chain holds at that entry. A genuine local integrity re-check (deterministic) — not a
 * full detection-replay engine. Returns true iff the entry's stored hash matches the re-derivation.
 */
export function verifyEntry(s: SimState, seq: number): boolean {
  const i = s.ledger.findIndex((e) => e.seq === seq);
  if (i < 0) return false;
  const e = s.ledger[i];
  const prev = i === 0 ? e.prevHash : s.ledger[i - 1].hash;
  if (prev !== e.prevHash) return false; // the chain link into this entry must hold
  const hash = mixHash(prev, [
    e.seq,
    e.tick,
    e.actor,
    e.human,
    e.fired,
    e.version,
    e.tier,
    e.rung,
    e.decision,
    e.nistFn,
    e.nistChar,
    e.oversight,
    e.reproducible,
  ]);
  return hash === e.hash;
}

function beginNext(s: SimState, txn: Txn): void {
  if (txn.idx >= txn.stopIdx) {
    txn.phase = 'done';
    txn.phaseStart = s.tick;
    s.counters.inFlight -= 1;
    s.counters.approved += 1;
    s.typeCounts[txn.type] += 1;
    if (txn.touchedHuman) s.counters.manualTouch += 1;
    else s.counters.touchless += 1;
    s.recent.push(!txn.touchedHuman);
    if (s.recent.length > 16) s.recent.shift();
    s.completions.push(s.tick);
    // Only journeys that actually reach the surveillance lane get the continuous-watch seal; a
    // share of those surface a governed ticket. Light lookups (elig/status) close without either.
    if (txn.stopIdx === LAST_IDX) {
      seal(s, {
        actor: 'agent:surveillance',
        human: false,
        fired: 'surveillance',
        version: 'HOTL·D2',
        tier: 'D2',
        rung: 'A2',
        decision: 'SEALED',
      });
      if (mulberry(s) < 0.5) mintTicket(s, 'surveillance');
    }
    return;
  }
  if (txn.idx === PAS_IDX) {
    txn.phase = 'roundtrip';
    txn.rtLeg = 0;
    txn.phaseStart = s.tick;
    pushAck(s, 'TA1', true);
    return;
  }
  // F4: a CLEAN txn (approved PA or clean claim, no underpayment) skips the recovery/dispute lane and
  // goes straight to surveillance — only DISPUTED (underpaid) items and first-class appeals traverse
  // recovery and seal a dispute-packet record. Stops 100% of claims/PAs implying a payment dispute.
  if (txn.idx === RECON_IDX && txn.stopIdx > RECON_IDX && !txn.disputed) {
    txn.phase = 'transit';
    txn.progress = 0;
    txn.targetIdx = idxOf('surveillance');
    return;
  }
  txn.phase = 'transit';
  txn.progress = 0;
  txn.targetIdx = txn.idx + 1;
}

function enterSubStep(s: SimState, txn: Txn): void {
  const step = txn.steps[txn.sub];
  txn.subDwell = SUB_BEAT;
  if (step.human) txn.touchedHuman = true;
  // seal the sub-step act
  seal(s, {
    actor: step.human ? 'human:UM' : 'agent:payer-ops',
    human: step.human,
    fired: step.key,
    version: 'HOTL·D2',
    tier: 'D2',
    rung: 'A2',
    decision: step.short,
    reproducible: step.key !== 'rfi',
  });
  // A certGap (hero) FORCES the pend deterministically; the `||` short-circuits so non-certGap txns still
  // draw mulberry exactly as before (default stream unchanged).
  if (step.key === 'rfi' && !txn.subPended && (txn.certGap || mulberry(s) < pRfiPend(s.maturity))) {
    s.counters.pended += 1;
    txn.subPended = true;
    if (txn.certGap) {
      // ADMINISTRATIVE certification gap — the PAYER has no current provider attestation on file. This is
      // NOT a clinical records request: a distinct credentialing/attestation kickback. Path A only in Step 1
      // (deemAdverse pinned false), so no fabricated denial ever renders against a named organization.
      txn.deemAdverse = false;
      txn.kbReason = 'cert-attestation';
      txn.certPendStart = s.tick; // STABLE clock anchor (kbStart resets per kickback leg; this does not)
      seal(s, {
        actor: 'agent:payer-ops',
        human: false,
        fired: 'rfi',
        version: 'HOTL·D2',
        tier: 'D2',
        rung: 'A2',
        decision: scenarioOf(s).certKickbackSeal,
      });
      pushEvent(s, {
        tick: s.tick,
        kind: 'loop',
        text: `${txn.id} · payer UM — PEND: ${scenarioOf(s).certPendReason}`,
      });
    } else {
      // F6: does this pend's decision clock EXPIRE before records return? (floored so it still fires at full
      // maturity — the due-process safeguard must remain visible).
      txn.deemAdverse = mulberry(s) < pDeemedTimeout(s.maturity);
      txn.kbReason = '277-RFAI';
      seal(s, {
        actor: 'agent:payer-ops',
        human: false,
        fired: 'rfi',
        version: 'HOTL·D2',
        tier: 'D2',
        rung: 'A2',
        decision: '277-RFAI OUT',
      });
      pushEvent(s, {
        tick: s.tick,
        kind: 'loop',
        text: `${txn.id} · payer UM — PEND, 277-RFAI back to provider (agent↔agent)`,
      });
    }
    // launch the KICKBACK loop
    txn.kbPhase = 'toProvider';
    txn.kbStart = s.tick;
    txn.kbResumeSub = txn.sub;
  }
  // The cert-gap hero is a Path-A save (administrative fix, clinician approves in time) — it never takes a
  // medical-necessity deny in Step 1. `!txn.certGap &&` short-circuits BEFORE the roll, so non-cert txns draw
  // mulberry identically (default stream unchanged); only the hero (diane-ma) skips the draw.
  if (step.key === 'md' && !txn.certGap && mulberry(s) < pMdDeny(s.maturity)) {
    txn.adverse = true;
    txn.phase = 'denied';
    txn.phaseStart = s.tick;
    s.counters.inFlight -= 1;
    s.counters.denied += 1;
    if (txn.touchedHuman) s.counters.manualTouch += 1;
    seal(s, {
      actor: 'human:MD',
      human: true,
      fired: 'md',
      version: 'HITL·D1',
      tier: 'D1',
      rung: 'A1',
      decision: 'MEDICAL-NECESSITY DENY (MD-issued)',
    });
    // A determination is its own sealed record + event; it does not mint a surveillance/integrity ticket
    // (no matching finding). Minting one would decouple the ticket from what fired.
    pushEvent(s, {
      tick: s.tick,
      kind: 'deny',
      text: `${txn.id} · MD peer review — medical-necessity DENY (MD-issued → ${scenarioOf(s).denyAppeal})`,
    });
  }
}

/** One logical tick — deterministic; the ONLY ordering authority. */
export function advance(s: SimState): SimState {
  s.tick += 1;

  // 835 remittance posts on the payment cycle (a pulse, not real-time)
  if (s.tick >= s.nextRemit && s.counters.inFlight < INFLIGHT_CAP) {
    runRemitCycle(s);
    s.nextRemit = s.tick + REMIT_CYCLE;
  }
  // §1557 four-fifths cohort fairness screen (a cohort statistic on accumulated outcomes)
  if (s.tick >= s.nextFairness) {
    runFairnessScreen(s);
    s.nextFairness = s.tick + FAIRNESS_CYCLE;
  }

  if (s.tick >= s.nextAutoSpawn && s.counters.inFlight < INFLIGHT_CAP) {
    const type = pickType(s);
    spawnTxn(s, type);
    const m = TXN_TYPE_META[type];
    pushEvent(s, {
      tick: s.tick,
      kind: type === 'pa' ? 'info' : 'edi',
      text: `${m.label} (${m.edi}) received via provider gateway${type === 'pa' ? ' (real-time)' : ''}`,
    });
    s.nextAutoSpawn = s.tick + AUTO_SPAWN_MIN + Math.floor(mulberry(s) * AUTO_SPAWN_JITTER);
  }

  for (const txn of s.txns) {
    if (txn.phase === 'done' || txn.phase === 'denied') continue;

    // ── kickback return-leg (bidirectional loop back to the provider) ──────────
    if (txn.kbPhase !== 'none') {
      if (txn.kbPhase === 'toProvider') {
        if (s.tick - txn.kbStart >= KB_LEG_TICKS) {
          txn.kbPhase = 'atProvider';
          txn.kbStart = s.tick;
        }
      } else if (txn.kbPhase === 'atProvider') {
        if (s.tick - txn.kbStart >= KB_DWELL) {
          txn.kbPhase = 'toPayer';
          txn.kbStart = s.tick;
          // The return leg must match what was requested: a credentialing/attestation lookup returns an
          // attestation, NOT clinical 275 records — otherwise the administrative-gap thesis is contradicted.
          const returnDecision =
            txn.kbReason === 'reject'
              ? 'CORRECTED'
              : txn.kbReason === 'cert-attestation'
                ? 'ATTESTATION ON FILE (credentialing/PractitionerRole · DocumentReference)'
                : 'RECORDS';
          const returnKind =
            txn.kbReason === 'reject'
              ? 'corrected claim'
              : txn.kbReason === 'cert-attestation'
                ? 'credentialing attestation returned'
                : '275 records';
          seal(s, {
            actor: 'agent:provider',
            human: false,
            fired: 'records',
            version: 'HOTL·D2',
            tier: 'D2',
            rung: 'A2',
            decision: returnDecision,
          });
          pushEvent(s, {
            tick: s.tick,
            kind: 'loop',
            text: `${txn.id} · provider responded (${returnKind}) — loop closing`,
          });
        }
      } else if (txn.kbPhase === 'toPayer') {
        if (s.tick - txn.kbStart >= KB_LEG_TICKS) {
          txn.kbPhase = 'none';
          if (txn.kbReason === '277-RFAI' || txn.kbReason === 'cert-attestation') {
            if (txn.deemAdverse) {
              // The decision clock expired before the pend cleared. This is a DEEMED adverse determination —
              // but the member notice is issued by a HUMAN (UM), never an agent auto-deny, and never
              // mislabeled as a clinical medical-necessity denial. The citation + notice name are scenario-aware.
              txn.adverse = true;
              txn.phase = 'denied';
              txn.phaseStart = s.tick;
              s.counters.inFlight -= 1;
              s.counters.denied += 1;
              s.counters.manualTouch += 1; // RFI already made this human-touched
              seal(s, {
                actor: 'human:UM',
                human: true,
                fired: 'deemed-adverse',
                version: 'HITL·D1',
                tier: 'D1',
                rung: 'A1',
                decision: scenarioOf(s).deemedAdverseDecision,
              });
              // A due-process determination is its own sealed record + event — not a surveillance ticket.
              pushEvent(s, {
                tick: s.tick,
                kind: 'deny',
                text: `${txn.id} · decision clock expired — DEEMED-ADVERSE, human-issued ${scenarioOf(s).adverseNotice} (never an agent auto-deny)`,
              });
            } else {
              txn.phase = 'subflow';
              txn.phaseStart = s.tick;
              txn.subDwell = SUB_BEAT;
              // The cert-attestation pend cleared within the clock (Path A) — close the advisory jeopardy ticket.
              if (txn.kbReason === 'cert-attestation') closeJeopardyTicket(s, txn);
            }
          } else {
            beginNext(s, txn); // corrected claim resumes forward
          }
        }
      }
      continue;
    }

    if (txn.phase === 'transit') {
      txn.progress += 1 / TICKS_PER_HOP;
      if (txn.progress >= 1) {
        txn.idx = txn.targetIdx;
        txn.progress = 1;
        txn.phase = 'gate';
        txn.phaseStart = s.tick;
        pushEvent(s, {
          tick: s.tick,
          kind: 'info',
          text: `${txn.id} → ${PATH[txn.idx].stage.label}`,
        });
      }
      continue;
    }

    if (txn.phase === 'roundtrip') {
      if (s.tick - txn.phaseStart >= RT_LEG_TICKS) {
        txn.rtLeg += 1;
        txn.phaseStart = s.tick;
        if (txn.rtLeg >= 3) {
          txn.phase = 'transit';
          txn.progress = 0;
          txn.targetIdx = txn.idx + 1;
        }
      }
      continue;
    }

    if (txn.phase === 'held') {
      if (s.tick - txn.phaseStart >= HELD_BEAT) beginNext(s, txn);
      continue;
    }

    if (txn.phase === 'subflow') {
      if (s.tick - txn.phaseStart < txn.subDwell) continue;
      if (txn.kbPhase !== 'none') continue; // a kickback just launched this tick
      if (txn.sub >= txn.steps.length - 1) {
        pushAck(s, '278 resp', true);
        seal(s, {
          actor: 'agent:payer-ops',
          human: false,
          fired: 'determination',
          version: 'HOTL·D2',
          tier: 'D2',
          rung: 'A2',
          decision: 'SEALED',
        });
        // SHADOW CONCORDANCE at the UM determination (fires once per PA, mid-flow) — while still earning to
        // A2 the agent PROPOSES and a human decides; concordant = a clean determination (no pend divergence).
        if (execEarnedCeiling(s) < 2 && txn.type === 'pa') {
          s.shadow.total += 1;
          // Concordant = the agent's proposal matched the human's call. A clean approval, a legitimate
          // records-pend, AND a correct deferral of an adverse/high-dollar case to a human are all agreement.
          // The one divergence modeled is a deemed-adverse timeout — the case the agent let a clock expire on.
          if (!txn.deemAdverse) s.shadow.agree += 1;
        }
        beginNext(s, txn);
        continue;
      }
      txn.sub += 1;
      txn.phaseStart = s.tick;
      enterSubStep(s, txn);
      continue;
    }

    if (txn.phase === 'gate') {
      if (s.tick - txn.phaseStart < GATE_BEAT) continue;
      const node = PATH[txn.idx];
      let gate = txn.gates[txn.idx];
      if (!gate) {
        gate = resolveGate(s, node);
        if (
          isClaimType(txn.type) &&
          txn.idx === RECON_IDX &&
          mulberry(s) < lerp(0.3, 0.08, s.maturity)
        )
          gate = 'pend';
        txn.gates[txn.idx] = gate;
        const tier = `${node.stage.verdict.evidenceTier}→${node.stage.verdict.permittedRung}`;
        if (gate === 'pass') {
          const who = node.stage.verdict.requiresHuman ? 'human-approved' : 'agent';
          pushEvent(s, {
            tick: s.tick,
            kind: 'pass',
            text: `${txn.id} · ${node.stage.label} — PASS (${who}, ${tier})`,
          });
        } else if (gate === 'pend') {
          pushEvent(s, {
            tick: s.tick,
            kind: 'pend',
            text: `${txn.id} · ${node.stage.label} — PEND (human-gated submission)`,
          });
        }
        // gold-card decision (prior-auth only): a share of trusted providers get PA WAIVED
        if (node.stage.key === 'gold-card' && txn.type === 'pa') {
          // Autonomous PA-waiver (no human) requires the fleet to have EARNED A3 authority — otherwise the
          // provider still routes to payer UM. RNG is drawn regardless (stable stream), then gated on earned.
          const gcRoll = !txn.mustHuman && mulberry(s) < pGoldCard(s.maturity);
          // A thread with an administrative cert-gap can NEVER be gold-carded: you cannot waive PA for a
          // provider whose certification attestation is not even on file. This is both domain-correct and the
          // twin of the express gate — it keeps the Diane cert-gap/clock-jeopardy narrative intact at the
          // autonomous band (A3). RNG (mulberry above) is drawn regardless → determinism-neutral on the
          // default book (no certGap txns there).
          txn.goldCarded = gcRoll && execEarnedCeiling(s) >= 3 && !txn.certGap;
          s.recentGc.push(txn.goldCarded);
          if (s.recentGc.length > 16) s.recentGc.shift();
          if (txn.goldCarded) {
            pushEvent(s, {
              tick: s.tick,
              kind: 'waive',
              text: `${txn.id} · gold-card criteria met — PA WAIVED (no payer UM, no human)`,
            });
            seal(s, {
              actor: 'agent:gold-card',
              human: false,
              fired: 'gold-card',
              version: 'autonomous·D3',
              tier: 'D3',
              rung: 'A3',
              decision: 'PA WAIVED',
            });
          } else {
            sealStage(s, node, 'PASS');
          }
        } else if (txn.type === 'status') {
          // F3: a 276/277 is a read-only claim-status lookup — it writes ONE `status` record and
          // touches neither remittance (835 posted) nor reconciliation (the underpayment delta).
          seal(s, {
            actor: 'agent:status',
            human: false,
            fired: 'status',
            version: 'HOTL·D2',
            tier: 'D2',
            rung: 'A2',
            decision: '277 — claim status read (informational, no authority exercised)',
          });
        } else if (node.stage.key !== 'payer-ops') {
          sealStage(s, node, gate.toUpperCase());
        }
        bumpProof(s, txn, node); // proof ratchets up → authority follows as the weakest link
      }

      // payer operations → gold-card bypass, or the UM subflow
      if (node.stage.key === 'payer-ops') {
        if (txn.goldCarded) {
          s.counters.waived += 1;
          pushAck(s, '278 resp', true);
          beginNext(s, txn); // straight to claim; touchedHuman stays false
          continue;
        }
        // Touchless (autonomous resolution) is UNLOCKED only once the fleet has EARNED A2 (act with
        // sign-off) or above. Below that the machine runs the full human path — it proposes, a human
        // decides (shadow) — so "A0 watch / A1 advise" is TRUE, not a label. RNG drawn regardless (stable).
        const expRoll = !txn.mustHuman && mulberry(s) < pTouchless(s.maturity);
        // An administrative cert-gap hero (Diane) MUST traverse the full human UM path — the cert pend,
        // certPendStart anchor and clock-jeopardy detector all live in the `rfi` substep, which express
        // skips. Pinning `!txn.certGap` guarantees the Path-A/clock-jeopardy story survives even after the
        // fleet earns A2 (express eligibility). RNG (mulberry above) is drawn regardless, so this is
        // determinism-neutral on the default book (no certGap txns there).
        txn.express = expRoll && execEarnedCeiling(s) >= 2 && !txn.certGap;
        txn.steps = txn.express ? EXPRESS_STEPS : PAYER_SUBSTEPS;
        txn.sub = 0;
        txn.subPended = false;
        txn.phase = 'subflow';
        txn.phaseStart = s.tick;
        enterSubStep(s, txn);
        continue;
      }
      if (gate === 'pend') {
        s.counters.pended += 1;
        txn.phase = 'held';
        txn.phaseStart = s.tick;
        if (txn.idx === RECON_IDX) {
          txn.disputed = true; // F4: an underpayment delta → this claim routes through the dispute (recovery) lane
          recordReconciliation(s, txn, true); // recon sub-ledger: the underpayment audit row (RNG-free)
          const rec = s.reconLedger[s.reconLedger.length - 1];
          mintTicket(s, 'underpayment', 'UNDERPAY-CONTRACT');
          // SINGLE LOOP (adversarial-after HIGH): the auto-minted Operations ticket IS this recon record's
          // handoff — stamp the back-link and mark the record routed so the recon board shows it resolved
          // (one ticket, one appeal), never offering a second "Draft appeal" that would double-mint.
          if (
            rec &&
            s.tickets[0]?.algorithm === 'UNDERPAY-CONTRACT' &&
            s.tickets[0]?.bornTick === s.tick
          ) {
            s.tickets[0].reconRecordSeq = rec.seq;
            rec.routed = true;
          }
        }
        continue;
      }
      // a CLEAN claim (or an 835 remittance pulse) reaching reconciliation still gets a recon audit row
      // (paid-at-contract / write-off / overpayment / etc.) — reconciliation CONFIRMS payment, it is not
      // only about exceptions, and the 835 pulse keeps the board LIVE each payment cycle. RNG-free; no seal.
      if ((isClaimType(txn.type) || txn.type === 'remit') && txn.idx === RECON_IDX)
        recordReconciliation(s, txn, false);
      // pass — but a small share of 837 claims kick back (reject → corrected claim)
      if (
        isClaimType(txn.type) &&
        txn.idx === CLAIM_IDX &&
        mulberry(s) < pClaimReject(s.maturity)
      ) {
        txn.kbPhase = 'toProvider';
        txn.kbReason = 'reject';
        txn.kbStart = s.tick;
        seal(s, {
          actor: 'agent:adjudication',
          human: false,
          fired: 'claim',
          version: 'autonomous·D2',
          tier: 'D2',
          rung: 'A2',
          decision: 'REJECT→277CA',
        });
        pushEvent(s, {
          tick: s.tick,
          kind: 'loop',
          text: `${txn.id} · claim reject (277CA) back to provider — corrected claim loop`,
        });
        continue;
      }
      beginNext(s, txn);
      continue;
    }
  }

  checkClockJeopardy(s); // Beat 8 — flag the hero's cert-gap pend before expiry (deterministic; diane-ma only)
  stepWorkflows(s); // resolve released appeals with a modelled payer response + SLA warnings (RNG-free; no-op with no workflows)

  const sp = spotlight(s);
  s.spotlightId = sp ? sp.id : null;
  s.acks = s.acks.filter((a) => s.tick - a.tick <= ACK_TTL);
  s.txns = s.txns.filter(
    (t) => !((t.phase === 'done' || t.phase === 'denied') && s.tick - t.phaseStart > 5)
  );
  return s;
}

// ── Selectors ────────────────────────────────────────────────────────────────────
export function throughputPerMin(s: SimState): number {
  const from = s.tick - 60;
  const n = s.completions.filter((t) => t >= from).length;
  return Math.round((n / 60) * 240);
}
export function touchlessPct(s: SimState): number {
  // Touchless AUTO-APPROVAL of determinations requires an EARNED A2+. Below that the machine is in
  // watch/advise — humans decide — so the honest rate is 0, even though lightweight lookups auto-complete.
  if (execEarnedCeiling(s) < 2) return 0;
  if (s.recent.length === 0) return 0;
  return Math.round((s.recent.filter(Boolean).length / s.recent.length) * 100);
}
export function pctWaived(s: SimState): number {
  if (s.recentGc.length === 0) return 0;
  return Math.round((s.recentGc.filter(Boolean).length / s.recentGc.length) * 100);
}
export function pendRate(s: SimState): number {
  const total = s.counters.approved + s.counters.denied;
  return total === 0 ? 0 : Math.round((s.counters.pended / (total + s.counters.pended)) * 100);
}
export function slaAtRisk(s: SimState): number {
  const SPAN = 120;
  return s.tickets.filter((t) => 1 - (s.tick - t.bornTick) / SPAN < 0.2).length;
}
/** Re-derive the hash-chain over the retained window; true iff every link matches (tamper-evident). */
export function ledgerIntact(s: SimState): boolean {
  if (s.ledger.length === 0) return true;
  let h = s.ledger[0].prevHash;
  for (const e of s.ledger) {
    const hash = mixHash(h, [
      e.seq,
      e.tick,
      e.actor,
      e.human,
      e.fired,
      e.version,
      e.tier,
      e.rung,
      e.decision,
      e.nistFn,
      e.nistChar,
      e.oversight,
      e.reproducible,
    ]);
    if (hash !== e.hash) return false;
    h = hash;
  }
  return true;
}
