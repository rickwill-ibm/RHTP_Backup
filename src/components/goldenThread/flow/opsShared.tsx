'use client';
/**
 * opsShared — the shared exec vocabulary (Twin-Ladder D/A codes + NIST-per-record chips) rendered
 * identically across the live board, Operations, and the workbench, so a record reads the same
 * everywhere. Pulls the ONE NIST map + code labels from `@/lib/goldenThread/nistMap`.
 *
 * CLIENT-SAFE: presentational only; no `@/lib/evidence` barrel.
 */
import {
  NIST_COLOR,
  proofLabel,
  authLabel,
  nistSpec,
  deriveOversight,
  type NistFn,
  type Oversight,
} from '@/lib/goldenThread/nistMap';
import {
  lifecycleOf,
  slaRemaining,
  slaColor,
  ticketActions,
  type LifecycleTone,
  type TicketActionCtx,
  type TicketActionVerb,
} from '@/lib/goldenThread/surveillanceMap';
import type { LiveTicket, TicketStatus } from '@/lib/goldenThread/flowSim';

/**
 * D-tier → A-rung code chips + plain English, with the human-gate flag. `rung` is the action-class
 * CAPABILITY. For an autonomous-action class held below its capability by the earned ceiling, pass
 * `capped` + `now` (the earned rung) — it renders "capability · not yet earned (fleet A{now})" so the
 * chip never asserts an autonomy the fleet has not earned. Human-gated (detect/advise) verdicts are
 * governed by the human gate, not the earned ceiling, so they are never capped.
 */
export function TwinLadderCodes({
  tier,
  rung,
  human,
  size = 'sm',
  capped = false,
  now,
}: {
  tier: string;
  rung: string;
  human: boolean;
  size?: 'sm' | 'md';
  capped?: boolean;
  now?: number;
}): React.ReactElement {
  const chip = size === 'md' ? 'text-[11px] px-1.5 py-0.5' : 'text-[10px] px-1 py-0.5';
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <span
        className={`mono rounded font-bold text-white ${chip}`}
        style={{ background: '#0f766e' }}
        title={`Evidence proof: ${tier} ${proofLabel(tier)}`}
      >
        {tier}
      </span>
      <span className="text-[10px] text-carbon-gray-40">{proofLabel(tier)}</span>
      <span className="text-carbon-gray-40">→</span>
      <span
        className={`mono rounded font-bold text-white ${chip}`}
        style={{ background: human ? '#b45309' : capped ? '#8d8d8d' : '#24427e' }}
        title={`${capped ? 'Capability' : 'Permitted authority'}: ${rung} ${authLabel(rung)}`}
      >
        {rung}
      </span>
      <span className="text-[10px] text-carbon-gray-40">
        {authLabel(rung)}
        {capped ? ' capability' : ''}
      </span>
      {human && (
        <span className="rounded bg-carbon-yellow-light px-1 py-0.5 text-[9px] font-bold uppercase text-[#b45309]">
          human-gated
        </span>
      )}
      {capped && !human && (
        <span className="rounded border border-carbon-gray-30 px-1 py-0.5 text-[9px] font-semibold text-carbon-gray-50">
          not yet earned · fleet A{now ?? 0}
        </span>
      )}
    </span>
  );
}

/** NIST AI-RMF per-record chips: function (colored) · characteristic · oversight — illustrative alignment. */
export function NistChips({
  fn,
  char,
  oversight,
}: {
  fn: NistFn;
  char: string;
  oversight: Oversight;
}): React.ReactElement {
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1 align-middle"
      title="NIST AI-RMF alignment (illustrative, not certification)"
    >
      <span
        className="mono rounded px-1 py-0.5 text-[9px] font-bold text-white"
        style={{ background: NIST_COLOR[fn] }}
      >
        {fn}
      </span>
      <span className="text-[9px] text-carbon-gray-60">{char}</span>
      <span className="rounded border border-carbon-gray-30 px-1 text-[9px] text-carbon-gray-50">
        {oversight}
      </span>
    </span>
  );
}

/** Resolve a `fired` key to its NIST chips. */
export function NistChipsForFired({
  fired,
  human,
  rung,
}: {
  fired: string;
  human: boolean;
  rung: string;
}): React.ReactElement {
  const spec = nistSpec(fired);
  const oversight: Oversight = deriveOversight(human, rung); // single-sourced — no inline rung→oversight ternary
  return <NistChips fn={spec.fn} char={spec.char} oversight={oversight} />;
}

/** Compact exec legend that "pops" — the D/A code key, reused wherever codes appear. */
export function ExecLegendMini(): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-carbon-gray-20 bg-carbon-gray-10 px-2 py-1 text-[9px]">
      <span className="font-bold uppercase tracking-wide text-carbon-gray-50">Legend</span>
      <span className="flex items-center gap-1">
        <span className="mono rounded px-1 font-bold text-white" style={{ background: '#0f766e' }}>
          D0–D3
        </span>
        <span className="text-carbon-gray-60">proof: Unproven → Ironclad</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="mono rounded px-1 font-bold text-white" style={{ background: '#24427e' }}>
          A0–A3
        </span>
        <span className="text-carbon-gray-60">authority: Watch → Act on its own</span>
      </span>
      <span className="flex items-center gap-1">
        {(['GOVERN', 'MAP', 'MEASURE', 'MANAGE'] as NistFn[]).map((fn) => (
          <span key={fn} className="flex items-center gap-0.5">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: NIST_COLOR[fn] }}
            />
            <span className="text-carbon-gray-50">{fn}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

/** Tone → chip color for the lifecycle pill. Open work is blue/amber; escalated is red (an open
 *  matter with the arbiter, NOT green); resolved is green; cleared/new are neutral gray. */
const LIFECYCLE_COLOR: Record<LifecycleTone, string> = {
  new: '#8d8d8d',
  progress: '#24427e',
  review: '#b45309',
  resolved: '#24a148',
  escalated: '#da1e28',
  cleared: '#8d8d8d',
};

/**
 * LifecycleChip — the single, shared way a governed ticket's STATUS reads on every board. Replaces the
 * old binary "routed / not-routed" caption with the real operator lifecycle (New → Assigned → Under
 * review → Resolved / Escalated / Cleared), a READ-ONLY SLA badge (time-left, never a mutation), and
 * an honest actor tag (detection is agentic A1 advisory; the action is a human determination). Every
 * field is PROJECTED from the ticket's own engine state — this component asserts nothing the ledger
 * does not already hold.
 */
export function LifecycleChip({
  t,
  nowTick,
  showSla = true,
}: {
  t: LiveTicket;
  nowTick: number;
  showSla?: boolean;
}): React.ReactElement {
  const lc = lifecycleOf(t.status, t.disposition);
  const open = t.status !== 'Closed';
  const sla = open ? slaRemaining(nowTick, t.bornTick, t.slaHours) : undefined;
  // Actor tag is deliberately understated so it can never over-claim: a `Proposed` action may have
  // been human-released OR (once the fleet earns A2) autonomously executed — the ledger row carries
  // that distinction, so the chip says only "action proposed" rather than asserting a human gate that
  // may be false. A `New` ticket has been agent-detected but not yet actioned by anyone.
  const actorTag =
    t.status === 'New'
      ? 'agent-detected · awaiting action'
      : t.status === 'Assigned'
        ? 'claimed · human-owned'
        : t.status === 'Proposed'
          ? 'action proposed'
          : 'human-dispositioned';
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <span
        className="mono rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
        style={{ background: LIFECYCLE_COLOR[lc.tone] }}
        title={`Lifecycle: ${lc.label}`}
      >
        {lc.label}
      </span>
      {showSla && sla && (
        <span
          className="mono rounded bg-white px-1 py-0.5 text-[9px] font-semibold"
          style={{ border: `1px solid ${slaColor(sla.pct)}`, color: slaColor(sla.pct) }}
          title="SLA remaining (read-only projection)"
        >
          {sla.label === 'PAST DUE' ? '⏱ PAST DUE' : `⏱ ${sla.label}`}
        </span>
      )}
      <span
        className="rounded border border-carbon-gray-30 px-1 py-0.5 text-[9px] font-semibold text-carbon-gray-50"
        title="Detection is agentic (A1 advisory); any action is a human determination"
      >
        {actorTag}
      </span>
    </span>
  );
}

/**
 * TicketActionBar — the ONE governed action row for a ticket, shown identically on the Process-flow,
 * Operations and Surveillance surfaces. It renders whatever `ticketActions` (surveillanceMap) permits
 * for the ticket's status + context and calls back with the chosen verb; it holds NO policy itself. The
 * only INLINE verbs are grab/route (non-adverse); every disposition is `open` (→ the workbench, where
 * the engine's human-gate and reviewer≠releaser SoD live). A Closed ticket shows a sealed tag, not a
 * dead end. This replaces the three surfaces' parallel action slices with a single source.
 */
export function TicketActionBar({
  status,
  ctx,
  onAct,
}: {
  status: TicketStatus;
  ctx: TicketActionCtx;
  onAct: (verb: TicketActionVerb) => void;
}): React.ReactElement {
  const acts = ticketActions(status, ctx);
  if (acts.length === 0)
    return (
      <span
        className="rounded border border-carbon-gray-20 px-1.5 py-0.5 text-[9px] font-semibold text-carbon-gray-40"
        title="Terminal — the disposition is sealed on the ledger"
      >
        ✓ sealed
      </span>
    );
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {acts.map((a) => {
        const cls = a.inline
          ? a.verb === 'route'
            ? 'bg-[#24427e] text-white hover:opacity-90'
            : 'bg-[#b45309] text-white hover:opacity-90'
          : a.primary
            ? 'bg-carbon-blue text-white hover:bg-carbon-blue-hover'
            : 'border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10';
        return (
          <button
            key={a.verb + a.label}
            type="button"
            onClick={() => onAct(a.verb)}
            title={a.title}
            className={`rounded px-2 py-0.5 text-[9px] font-semibold ${cls}`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

export const HONEST_NIST_NOTE =
  'NIST fields show AI-RMF alignment — illustrative, not a conformance assessment; NIST does not certify AI systems. Subcategory conformance lives on the NIST AI-RMF tab.';
