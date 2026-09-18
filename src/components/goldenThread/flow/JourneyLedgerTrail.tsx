'use client';
/**
 * JourneyLedgerTrail — the hash-chained NIST evidence band, positioned as the connective tissue
 * directly under the spine. It reuses the ONE NIST color map + the ledgerIntact seal check, renders
 * the GOVERN/MAP/MEASURE/MANAGE legend and the agent(hollow)/human(solid) ring convention, and
 * HIGHLIGHTS the entries belonging to the spine's focused stage — so the trail reads as one thread
 * with the spine, not a detached bar. NOTE: `LedgerEntry.fired` is an ACT key, not a stage key; the
 * payer-ops stage seals its work under UM sub-step keys (intake/eligibility/nurse/rfi/md/…), never
 * under 'payer-ops', so we fold those act keys back to their stage here (presentation-side, no engine
 * change) — otherwise the one governance-critical stage would silently highlight nothing.
 *
 * PRESENTATION-ONLY. CLIENT-SAFE: spine + engine types + nistMap + React only. No `@/lib/evidence`.
 */
import { useEffect, useRef } from 'react';
import { NIST_COLOR } from '@/lib/goldenThread/nistMap';
import {
  PATH,
  PAYER_SUBSTEPS,
  ledgerIntact,
  type SimState,
  type LedgerEntry,
  type NistFn,
} from '@/lib/goldenThread/flowSim';

// Act keys the payer-ops (UM) stage seals under — folded back to the stage for the highlight. Built
// from the real sub-step list plus the terminal UM acts the engine seals (RFI, MD deny, deemed-adverse).
const PAYER_OPS_FIRED = new Set<string>([
  ...PAYER_SUBSTEPS.map((s) => s.key),
  'intake',
  'eligibility',
  'nurse',
  'rfi',
  'md',
  'determination',
  'deemed-adverse',
  'payer-ops',
]);

/** True when a sealed entry belongs to the focused stage (folding UM act keys to payer-ops). */
export function entryBelongsToStage(fired: string, stageKey: string): boolean {
  if (stageKey === 'payer-ops') return PAYER_OPS_FIRED.has(fired);
  return fired === stageKey;
}

export function JourneyLedgerTrail({
  sim,
  focused,
}: {
  sim: SimState;
  focused: number;
}): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const intact = ledgerIntact(sim);
  const stageKey = PATH[Math.max(0, Math.min(PATH.length - 1, focused))]?.stage.key ?? '';
  const shown = sim.ledger.slice(-160);
  const related = shown.filter((e) => entryBelongsToStage(e.fired, stageKey)).length;
  const hasStageMatch = related > 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // When the focused stage has sealed entries, bring the FIRST of them into view (that is the point
    // of the connective highlight). Otherwise only auto-follow the newest if the user is already near
    // the right edge — so a reviewer scrolling left to inspect the chain is not yanked back each tick.
    if (hasStageMatch) {
      const target = el.querySelector<HTMLElement>('[data-stage-lit="1"]');
      if (target) el.scrollLeft = Math.max(0, target.offsetLeft - 48);
      return;
    }
    const nearRight = el.scrollWidth - el.clientWidth - el.scrollLeft < 60;
    if (nearRight) el.scrollLeft = el.scrollWidth;
  }, [sim.ledger.length, stageKey, hasStageMatch]);

  return (
    <section
      className="rounded"
      style={{ background: '#0b1a2b' }}
      aria-label="Journey ledger trail"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <span className="rounded bg-[#13324f] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9fc2e0]">
          Shared Evidence Ledger · hash-chained · append-only
        </span>
        <span
          className="mono text-[10px] font-semibold"
          style={{ color: intact ? '#54d98c' : '#ff8a8a' }}
        >
          {intact ? '● seal intact' : '● seal BROKEN'} · {sim.ledger.length} entries · head{' '}
          {sim.chainHead.toString(16).slice(-6)}
        </span>
        <span className="mono text-[9px] text-[#9fc2e0]">
          {hasStageMatch
            ? `${related} entries for this stage highlighted`
            : 'recent sealed activity highlighted'}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[8px] text-[#9fc2e0]">
          NIST AI-RMF
          {(['GOVERN', 'MAP', 'MEASURE', 'MANAGE'] as NistFn[]).map((fn) => (
            <span key={fn} className="flex items-center gap-0.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: NIST_COLOR[fn] }}
              />
              {fn}
            </span>
          ))}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex items-end gap-[3px] overflow-x-auto px-3 pb-2 pt-3"
        style={{ scrollBehavior: 'auto' }}
      >
        {shown.length === 0 && (
          <span className="py-2 text-[10px] italic text-[#9fc2e0]">
            the evidence record builds as transactions flow — press Play
          </span>
        )}
        {(() => {
          let firstLitSeen = false;
          return shown.map((e: LedgerEntry, i) => {
            const isStage = hasStageMatch && entryBelongsToStage(e.fired, stageKey);
            const isRecent = !hasStageMatch && i >= shown.length - 12;
            const lit = isStage || isRecent;
            const firstStageLit = isStage && !firstLitSeen;
            if (firstStageLit) firstLitSeen = true;
            return (
              <div
                key={e.seq}
                data-stage-lit={firstStageLit ? '1' : undefined}
                className="relative shrink-0 rounded-sm"
                title={`#${e.seq}  ${e.actor} · ${e.fired} ${e.version}\nevidence ${e.tier} → authority ${e.rung} · ${e.decision}\nNIST AI-RMF: ${e.nistFn} · ${e.nistChar} · oversight ${e.oversight}\n${e.reproducible ? 'reproducible' : 'pending'} (AI-RMF aligned, illustrative — not certification)`}
                style={{
                  width: 11,
                  height: lit ? 26 : 18,
                  background: NIST_COLOR[e.nistFn],
                  opacity: lit ? 1 : 0.4,
                  border: e.human ? '1px solid #fff' : '1px solid transparent',
                  boxShadow: e.human ? 'inset 0 0 0 1.5px rgba(255,255,255,.75)' : 'none',
                  outline: isStage ? '2px solid #ffd27a' : 'none',
                }}
              >
                {e.seq % 10 === 0 && (
                  <span className="absolute -top-3 left-0 text-[6px] text-[#7fa8c9]">{e.seq}</span>
                )}
              </div>
            );
          });
        })()}
      </div>
      <p className="px-3 pb-1 text-[8px] italic text-[#6f93b3]">
        Hollow-ring = agent, solid-ring = human-touched. NIST AI-RMF alignment — illustrative, not a
        conformance assessment; NIST does not certify AI systems.
      </p>
    </section>
  );
}
