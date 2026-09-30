'use client';
/**
 * LiveEventTicker — a scrolling LIVE ACTIVITY feed of the run's real narration stream (`s.events`),
 * newest first. This is what makes Play visibly stream: the engine narrates every intake, pass/pend/
 * deny, ticket mint and EDI channel event into `s.events`, and this ticker renders them with a colored
 * dot per kind and the tick clock they fired at. It reads state only — it never fabricates churn (the
 * detection catalogue is single-sourced by Operations), so nothing here can disagree with the queue.
 *
 * NOTE (honesty): this is run NARRATION, not the tamper-evident record — the hash-chained SEALED
 * ledger is a distinct structure (the Operations "Forensic ledger"). This feed shows what is happening;
 * the ledger is what proves it.
 *
 * PHI: `s.events` are txn/ticket-id-level narration carrying no PHI-shaped identifier tokens (no SSN,
 * member-id, MRN or DOB); a scenario hero name (e.g. "Diane Novak (illustrative)") is synthetic and
 * explicitly illustrative, not member PHI. Asserted in test.
 *
 * CLIENT-SAFE: engine types only. No `@/lib/evidence` barrel, no node.
 */
import type { SimEvent, SimState } from '@/lib/goldenThread/flowSim';

const KIND_COLOR: Readonly<Record<SimEvent['kind'], string>> = {
  pass: '#24a148',
  pend: '#b45309',
  deny: '#da1e28',
  ticket: '#24427e',
  edi: '#6929c4',
  info: '#8d8d8d',
  waive: '#0f766e',
  loop: '#5b3fa3',
};

export function LiveEventTicker({
  s,
  cap = 24,
}: {
  s: SimState;
  cap?: number;
}): React.ReactElement {
  const rows = [...s.events].slice(-cap).reverse();
  return (
    <div className="ed-card p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Live activity feed · run narration
        </p>
        <span className="mono text-[9px] text-carbon-gray-40">
          newest first · tick {s.tick} · the sealed record is the Forensic ledger
        </span>
      </div>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto" aria-label="Live activity feed">
        {rows.length === 0 && (
          <li className="text-[10px] italic text-carbon-gray-40">
            no activity yet — press Play to stream the live activity feed
          </li>
        )}
        {rows.map((e, i) => (
          <li
            key={`${e.tick}-${rows.length - i}`}
            className="flex items-center gap-2 text-[10px] text-carbon-gray-80"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: KIND_COLOR[e.kind] }}
            />
            <span className="mono w-14 shrink-0 text-[9px] uppercase text-carbon-gray-50">
              {e.kind}
            </span>
            <span className="mono w-12 shrink-0 text-[9px] text-carbon-gray-40">t{e.tick}</span>
            <span className="truncate">{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
