/**
 * workflow.ts — the recipient-facing WORKFLOW model: what a governed action actually DOES.
 *
 * A click no longer just seals a line. It instantiates a typed workflow whose steps produce a
 * rendered (mock, not-transmitted) ARTIFACT, advance a provenance-linked STATUS TIMELINE, land as a
 * work-item in the recipient seat's QUEUE, and fire NOTIFICATIONS — then the recipient acts, and a
 * MODELLED payer response (accept/deny) resolves it. Honesty guardrails baked in:
 *   • a submission (release to payer) is ALWAYS human-gated regardless of earned rung;
 *   • the RELEASER must differ from the REVIEWER (segregation of duties);
 *   • "recovered $" is asserted ONLY after a modelled 835 adjustment posts on accept — never on a
 *     mere release. Until then the amount is "in dispute / exposure identified".
 *   • the payer response is a MODELLED accept/deny branch (deterministic, seeded), never a timer flip.
 *
 * PURE + CLIENT-SAFE: no engine import, no `@/lib/evidence` barrel, no node. The single client-side
 * re-expression of the server governed-action lifecycle (governedAction.ts / escalationRouter.ts /
 * workQueue.ts, which are node-only) — same vocabulary (proposed→approved→executed|rejected, queue
 * hop, mock fail-closed submission), cited as the real backing.
 *
 * DETERMINISM: all timing is integer-tick (TICKS_PER_HOUR); the accept/deny decision is a pure hash
 * of the workflow id (no RNG). Workflows are created only by USER actions, never in createSim warm-up,
 * so none of this touches the warm-start determinism pin.
 */
import { hashStr } from '@/lib/goldenThread/reconcile';

export const TICKS_PER_HOUR = 2; // integer-tick clock: 1 SLA hour = 2 sim ticks (deterministic, no wall-clock)
export const APPEAL_SLA_HOURS = 72; // 42 CFR appeal window (illustrative)
export const RESPONSE_TICKS = 10; // ticks a released appeal waits for the modelled payer response
export const SLA_WARN_FRACTION = 0.75; // fraction of SLA elapsed before a warning fires

/** The workflow lifecycle. The single source of truth for a workflow-driven ticket's status is
 *  derived from THIS via ticketStatusFor() in the engine — there is no parallel status machine. */
export type WfState =
  | 'assembling' //         agent is building the packet (auto)
  | 'awaiting-review' //    in the reviewer's queue (human)
  | 'awaiting-release' //   reviewed; awaiting a SEPARATE authorizer to release (human, submission)
  | 'released' //           submitted to the payer (mock, not transmitted)
  | 'awaiting-response' //  released; awaiting the modelled payer response
  | 'accepted' //           payer accepted → a modelled 835 adjustment posts (recovery is now real)
  | 'denied' //             payer denied → routed to the arbiter (appeal-of-appeal) path
  | 'rejected'; //          the reviewer rejected the draft internally (never released)

export type WfStepKind = 'agent' | 'human' | 'submission' | 'response';

export interface WfStep {
  key: string;
  label: string;
  owner: string; // seat id, 'agent', or 'payer' (the modelled counterparty)
  kind: WfStepKind;
  done: boolean;
  actor?: string; // who actually acted (human id / agent id) — sealed
  tick?: number;
  sealSeq?: number; // main-ledger seq of this step's sealed record (provenance)
  note?: string;
}

export interface WorkflowArtifact {
  kind: 'appeal-packet';
  title: string;
  headerLines: string[]; // to/from/refs (PHI-safe)
  bodyLines: string[]; // the argument (contract cite, delta, CARC)
  transmitted: false; // ALWAYS false — mock channel
  channelNote: string;
}

export interface Workflow {
  id: string;
  kind: 'underpayment-appeal';
  ticketKey: string; // the LiveTicket this is the detail of (single-source; ticket.status is derived)
  reconSeq?: number; // recon sub-ledger back-link
  provider: string;
  payer: string;
  amountUsd: number; // the delta in dispute (NOT "recovered" until accepted)
  recoveredUsd?: number; // set ONLY when a modelled 835 posts on accept
  state: WfState;
  steps: WfStep[];
  artifact: WorkflowArtifact;
  routedTick: number; // clock anchor = the user action that created it (never the seed tick)
  slaHours: number;
  reviewer?: string; // SoD: releaser must differ from this
  releaser?: string;
  respondTick?: number; // tick the modelled response is due (set at release)
  slaWarned?: boolean;
}

export type NotificationKind =
  'assigned' | 'approval-needed' | 'released' | 'response-received' | 'resolved' | 'sla-warning';
export interface WfNotification {
  id: string;
  to: string; // recipient seat
  kind: NotificationKind;
  ref: string; // workflow id / ticket ref
  text: string;
  tick: number;
  read: boolean;
}

/** The provider seats for the appeal path — reviewer and a DISTINCT releaser (segregation of duties). */
export const APPEAL_REVIEWER_SEAT = 'provider-revint';
export const APPEAL_RELEASER = 'human:provider-authorizer'; // a separate authorized releaser (four-eyes)
export const ARBITER_SEAT = 'arbiter';

/** The step template for an underpayment appeal (provider drafts → reviews → releases → payer responds). */
export function appealSteps(): WfStep[] {
  return [
    {
      key: 'assemble',
      label: 'Assemble dispute packet (277 + contract cite + Δ)',
      owner: 'agent:recon',
      kind: 'agent',
      done: false,
    },
    {
      key: 'review',
      label: 'Revenue-Integrity review',
      owner: APPEAL_REVIEWER_SEAT,
      kind: 'human',
      done: false,
    },
    {
      key: 'release',
      label: 'Authorize + release to payer (submission)',
      owner: APPEAL_RELEASER,
      kind: 'submission',
      done: false,
    },
    {
      key: 'response',
      label: 'Payer response (modelled)',
      owner: 'payer',
      kind: 'response',
      done: false,
    },
  ];
}

/** Build the mock appeal-packet artifact (PHI-safe, clearly not transmitted). */
export function buildAppealArtifact(args: {
  provider: string;
  payer: string;
  amountUsd: number;
  carc: string;
  claimRef: string;
  variancePct: number;
}): WorkflowArtifact {
  const { provider, payer, amountUsd, carc, claimRef, variancePct } = args;
  return {
    kind: 'appeal-packet',
    title: 'Payment dispute / reconsideration — underpayment',
    headerLines: [
      `To: ${payer} · Provider Disputes`,
      `From: ${provider} · Revenue Integrity`,
      `Re: ${claimRef} · EDI 277/appeal`,
    ],
    bodyLines: [
      `Adjudicated allowed amount is ${variancePct}% below the loaded contracted rate on this claim.`,
      `The 835 CAS shows ${carc} — a write-off exceeding the contract-permitted adjustment (no PR group; a plan-side shortfall).`,
      `Requested remedy: reprocess to the contracted rate and remit the underpaid balance of $${Math.round(amountUsd).toLocaleString()}.`,
      `Enclosures: contracted fee-schedule excerpt (version/effective-date), 835 remittance line, claim detail.`,
    ],
    transmitted: false,
    channelNote: 'Mock channel · not transmitted — prototype on seed data.',
  };
}

/** MODELLED payer response — deterministic accept/deny from the workflow id (NOT a timer flip, no RNG).
 *  ~68% accepted (a documented underpayment with a contract cite usually reprocesses). Uses the FULL
 *  32-bit hash as a fraction (well-distributed for sequential ids, unlike low-bits mod 100). */
function mix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
export function appealOutcome(id: string): 'accepted' | 'denied' {
  return mix32(hashStr(`${id}#outcome`)) / 4294967296 < 0.68 ? 'accepted' : 'denied';
}
