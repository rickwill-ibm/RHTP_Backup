/**
 * surveillanceMap — honest mapping between the demo's WIRED detectors (the ~7 that carry a scripted
 * narrative + governed ticket) and the 40-entry program-integrity library, plus the persona routing
 * (F5: clinical vs investigative are distinct authorities, and credible-fraud refers OUT to the State
 * Medicaid agency / MFCU under 42 CFR 455.23 — the demo's audience is that state).
 *
 * CLIENT-SAFE: pure data + pure functions.
 */
import { TICKS_PER_HOUR } from '@/lib/goldenThread/workflow';
import type { TicketStatus, TicketDisposition } from '@/lib/goldenThread/flowSim';

/** Seed-ticket algorithm → the library id it corresponds to. These are the WIRED narratives. */
export const WIRED_LIBRARY_ID: Record<string, string> = {
  'CALENDAR-IMPOSSIBLE': 'CALENDAR-IMPOSSIBLE',
  'UNDERPAY-CONTRACT': 'UNDERPAY-CARC',
  'DENY-DISPARATE-IMPACT': 'FAIRNESS-GUARD',
  'UPCODE-DRIFT': 'EM-LEVEL-DRIFT',
  'COB-TPL': 'COB-GAP',
  'EXCLUDED-PROVIDER': 'EXCLUSION-SCREEN',
  'GOLDCARD-ANOMALY': 'CRITERIA-DRIFT',
};

/** The set of library ids that are wired with a narrative in this demo (everything else is catalog-only). */
export const WIRED_LIBRARY_IDS = new Set(Object.values(WIRED_LIBRARY_ID));
export const isWiredLibraryId = (id: string): boolean => WIRED_LIBRARY_IDS.has(id);
/** Given a seed algorithm, the library id it maps to (falls back to the same string). */
export const libraryIdForAlgorithm = (algo: string): string => WIRED_LIBRARY_ID[algo] ?? algo;

export interface Routing {
  seat: string; // the analyst persona the detection is triggered to
  authority: string; // what that seat may decide (distinct due-process)
  terminal?: string; // an out-of-MCO referral terminal, when applicable
}

/**
 * Route a detection to the right seat. Clinical (medical-necessity) and investigative (FWA) are
 * DIFFERENT authorities; a credible allegation of fraud is referred OUT to the State/MFCU (455.23 is
 * the State agency's authority; the MCO acts under 438.608(a)), not resolved inside the MCO. A §1557
 * disparate-impact finding is a compliance/governance action, NOT a medical-necessity determination.
 */
export function detectionRoute(role: string, lane: string, algo?: string): Routing {
  if (algo === 'DENY-DISPARATE-IMPACT' || algo === 'FAIRNESS-GUARD') {
    return {
      seat: 'Payer · Medical Director + Compliance',
      authority:
        'civil-rights / governance action — suspend the auto-deny rule, reprocess, issue NABDs, run MHPAEA parity; a human governance decision, not a clinician’s medical-necessity call',
    };
  }
  switch (role) {
    case 'payer-md':
      return {
        seat: 'Payer · Medical Director (UM)',
        authority: 'medical-necessity PEND / deny — clinician decides',
      };
    case 'payer-siu':
      return {
        seat: 'Payer · SIU Investigator',
        authority: 'investigate suspected FWA — no autonomous adverse action',
        terminal:
          'credible allegation → State Medicaid agency / MFCU referral · 455.23 (State) suspension; MCO acts under 438.608(a) — human',
      };
    case 'payer-pi':
      return {
        seat: 'Payer · Program-Integrity Analyst',
        authority: lane === 'adverse' ? 'recovery review — human-gated' : 'monitor / self-correct',
      };
    case 'provider-revint':
      return {
        seat: 'Provider · Revenue-Integrity Analyst',
        authority: 'self-directed — provider corrects its own claims',
      };
    case 'provider-coding':
      return {
        seat: 'Provider · Coding & Compliance',
        authority: 'education path — takeback disallowed',
      };
    case 'arbiter':
      return {
        seat: 'Neutral · State TPL / PI Recovery',
        authority: 'independent attestation / third-party recovery',
      };
    default:
      return { seat: role, authority: 'human review' };
  }
}

/** The disposition lifecycle — honest terminal is "action proposed", never "addressed/resolved" (mock channel). */
export type Disposition = 'detected' | 'routed' | 'assigned' | 'action-proposed' | 'cleared';
export const DISPOSITION_LABEL: Record<Disposition, string> = {
  detected: 'Detected — awaiting routing',
  routed: 'In queue — routed, unassigned',
  assigned: 'Assigned (claimed)',
  'action-proposed': 'Action proposed — pending human release',
  cleared: 'Cleared — not FWA (human)',
};

/**
 * The ticket LIFECYCLE — projected from real engine state (status + disposition), the SINGLE source
 * of truth for how a governed ticket reads on every surface (Reconciliation board, Operations,
 * Surveillance). Answers the operator question the raw "routed / not-routed" flag could not: New →
 * Assigned (in progress) → Under review (action proposed) → Resolved / Escalated / Cleared. There is
 * NO parallel status machine — a workflow-backed ticket's `status`/`disposition` are already projected
 * from its workflow by `syncTicketStatus`, so reading them here stays single-sourced.
 *
 * Escalated is surfaced as its OWN state, not folded into "closed": a DENIED appeal is `Closed` +
 * disposition `escalated` (still an open matter with the arbiter), and reading it as "Resolved" would
 * misrepresent it. This projection keeps it visible as `Escalated → arbiter`.
 */
export type LifecycleTone = 'new' | 'progress' | 'review' | 'resolved' | 'escalated' | 'cleared';
export interface Lifecycle {
  key: 'new' | 'assigned' | 'proposed' | 'resolved' | 'escalated' | 'cleared';
  label: string;
  tone: LifecycleTone;
}
export function lifecycleOf(status: TicketStatus, disposition?: TicketDisposition): Lifecycle {
  switch (status) {
    case 'New':
      return { key: 'new', label: 'New — detected', tone: 'new' };
    case 'Assigned':
      return { key: 'assigned', label: 'Assigned — in progress', tone: 'progress' };
    case 'Proposed':
      return { key: 'proposed', label: 'Under review — action proposed', tone: 'review' };
    case 'Closed':
      if (disposition === 'escalated')
        return { key: 'escalated', label: 'Escalated → arbiter', tone: 'escalated' };
      if (disposition === 'cleared')
        return { key: 'cleared', label: 'Cleared — not FWA', tone: 'cleared' };
      // 'resolved' or an action-proposed close both read as a resolved disposition.
      return { key: 'resolved', label: 'Resolved', tone: 'resolved' };
  }
}

/**
 * SLA remaining for a ticket — single-sourced with the workflow/Operations window
 * (slaHours × TICKS_PER_HOUR ticks). Pure and READ-ONLY: it never mutates state or advances a clock;
 * it projects "time left" from the current tick so the same badge reads identically on every board.
 */
export interface SlaRemaining {
  pct: number;
  label: string;
}
export function slaRemaining(nowTick: number, bornTick: number, slaHours: number): SlaRemaining {
  const span = Math.max(1, slaHours * TICKS_PER_HOUR);
  const pct = Math.max(0, 1 - (nowTick - bornTick) / span);
  if (pct <= 0) return { pct: 0, label: 'PAST DUE' };
  const remH = slaHours * pct;
  const hh = Math.floor(remH);
  const mm = Math.floor((remH - hh) * 60);
  return { pct, label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}
export const slaColor = (pct: number): string =>
  pct > 0.5 ? '#24a148' : pct > 0.2 ? '#b45309' : '#da1e28';

/**
 * ticketActions — the SINGLE source of truth for "what can an operator do to this ticket right now",
 * rendered identically by the shared <TicketActionBar> on the Process-flow, Operations and Surveillance
 * surfaces. It is a PROJECTION, not a second transition authority:
 *   • grab/route are the only INLINE verbs — both are non-adverse (a claim, and an agent-orchestrated
 *     routing that seals at advise-level A1). They can never execute an adverse or payer↔provider action.
 *   • every DISPOSITION (propose / resolve / clear / draft-appeal) is DEFERRED to the Party Workbench
 *     via `open`, because the workbench is where the engine's own human-gate (actionRequiresHuman +
 *     the earned-ceiling clamp in proposeOutbound) and the reviewer≠releaser SoD (workflow.ts) live.
 *     This map therefore NEVER computes a gate and NEVER decides a workflow-owned transition.
 *   • a workflow-backed ticket defers WHOLESALE: its next legal move belongs to the WfState machine,
 *     so the coarse queue only ever offers `open` for it.
 * Surveillance is a MONITORING lens: it may route/grab a *New* detection, but it defers every
 * disposition — so an Assigned/Proposed item there shows only `open` (no cross-queue mutation).
 * "Assigned" and "Proposed" are never dead-ends: `open` is always present until the ticket is Closed.
 */
export type TicketActionVerb = 'grab' | 'route' | 'open';
export type ActionSurface = 'flow' | 'operations' | 'surveillance' | 'workbench';
export interface TicketActionCtx {
  surface: ActionSurface;
  routed: boolean; // t.routedSeal !== undefined — a New detection already sealed a routing event
  hasWorkflow: boolean; // s.workflows carries one for this ticket → the WfState machine owns transitions
}
export interface TicketAction {
  verb: TicketActionVerb;
  label: string; // a standard healthcare-operations label
  inline: boolean; // true → execute on this surface (grab/route); false → open the workbench to act
  primary?: boolean;
  title?: string; // hover explanation
}
export function ticketActions(status: TicketStatus, ctx: TicketActionCtx): TicketAction[] {
  if (status === 'Closed') return []; // terminal — the disposition is sealed; nothing to do
  const open = (label: string, title: string): TicketAction => ({
    verb: 'open',
    label,
    inline: false,
    primary: true,
    title,
  });
  // A workflow-backed ticket's next move (review / release / respond, reviewer≠releaser) is the
  // WfState machine's — defer wholesale rather than adjudicate it from the coarse status.
  if (ctx.hasWorkflow)
    return [open('Open in workbench →', 'Governed workflow in progress — act in the workbench')];
  if (status === 'New') {
    const acts: TicketAction[] = [];
    if (!ctx.routed)
      acts.push({
        verb: 'route',
        label: 'Route to seat',
        inline: true,
        title:
          'Seal a governed routing event and place this detection in the accountable seat’s queue',
      });
    acts.push({
      verb: 'grab',
      label: 'Grab',
      inline: true,
      primary: true,
      title: 'Claim this detection (New → Assigned) and start its SLA clock',
    });
    acts.push(open('Open in workbench →', 'Open the analyst workbench for this detection'));
    return acts;
  }
  // Surveillance defers all disposition — once claimed/proposed, the only affordance is to open it.
  if (ctx.surface === 'surveillance')
    return [open('Open in workbench →', 'Disposition is made in the analyst workbench')];
  if (status === 'Assigned')
    return [
      open('Work in workbench →', 'Propose the governed action (human-gated) in the workbench'),
    ];
  // Proposed — under review; release/resolve/clear are human determinations made in the workbench.
  return [
    open('Review / release →', 'Release, resolve or clear this proposed action in the workbench'),
  ];
}

/** What this console is explicitly NOT claiming (shown in the UI, per the honesty gate). Count-free
 * on purpose — the summary tiles carry the live catalog / scripted numbers so nothing can drift. */
export const NOT_CLAIMING = [
  'Not a bank of live models — a few detectors carry a scripted narrative here; the rest are the reference catalog (mostly rules/edits, no live analysis). See the catalog vs scripted counts above.',
  'Not real-time per-record detection — production runs as scheduled batch / near-real-time analytics; the cadence here is illustrative.',
  'Not executed actions — outbound is proposed and pending a human release on a mock channel; nothing is transmitted.',
  'Not cryptographic non-repudiation — the live seal is an illustrative hash chain (detects naive edits on re-read); production uses HMAC-SHA256 / server-side signing.',
  'Not a conformance assessment — NIST AI-RMF fields show alignment only; NIST does not certify AI systems.',
];
