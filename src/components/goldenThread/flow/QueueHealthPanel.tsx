'use client';
/**
 * QueueHealthPanel — the SIU-chief's "how big is my backlog / what's breaching" view. It is now LIVE:
 * open detections are grouped by their accountable SEAT (from detectionRoute), and each seat's row is
 * RECOMPUTED FROM `s.tick` on every render — oldest-open age, worst SLA %, and the aging / past-due
 * counts all move while Play runs. Every value is PROJECTED from real ticket state (never fabricated),
 * so this panel can never disagree with the Operations queue about the same key.
 *
 * The "WHAT THIS CONSOLE IS NOT CLAIMING" disclaimers stay a first-class, EXPANDED honesty block: for
 * a State / public-sector deliverable the disclaimers are load-bearing and must read at a glance.
 *
 * CLIENT-SAFE: shared sim + pure surveillance/workflow helpers only. No `@/lib/evidence` barrel.
 */
import { type SimState } from '@/lib/goldenThread/flowSim';
import { TICKS_PER_HOUR } from '@/lib/goldenThread/workflow';
import {
  NOT_CLAIMING,
  detectionRoute,
  slaRemaining,
  slaColor,
} from '@/lib/goldenThread/surveillanceMap';
import { type Detection } from '@/components/goldenThread/flow/LiveDetectionFeed';

export interface QueueHealthPanelProps {
  s: SimState;
  detections: Detection[];
}

interface SeatHealth {
  seat: string;
  count: number;
  oldestOpenHours: number; // s.tick − min(bornTick) → hours
  worstSlaPct: number; // the most-breached SLA in the seat's queue
  aging: number; // 0 < pct < 0.5
  pastDue: number; // pct <= 0
}

/** Group the OPEN detections by accountable seat and project each seat's health from s.tick. */
function seatHealth(s: SimState, detections: Detection[]): SeatHealth[] {
  const bySeat = new Map<string, Detection[]>();
  for (const d of detections) {
    const seat = detectionRoute(d.t.role, 'adverse', d.t.algorithm).seat;
    const list = bySeat.get(seat) ?? [];
    list.push(d);
    bySeat.set(seat, list);
  }
  const rows: SeatHealth[] = [];
  for (const [seat, list] of bySeat) {
    const oldestBorn = Math.min(...list.map((d) => d.t.bornTick));
    const slas = list.map((d) => slaRemaining(s.tick, d.t.bornTick, d.t.slaHours).pct);
    rows.push({
      seat,
      count: list.length,
      oldestOpenHours: Math.max(0, s.tick - oldestBorn) / TICKS_PER_HOUR,
      worstSlaPct: Math.min(...slas),
      aging: slas.filter((p) => p > 0 && p < 0.5).length,
      pastDue: slas.filter((p) => p <= 0).length,
    });
  }
  // Worst-off seats first: most breached SLA, then oldest open.
  return rows.sort(
    (a, b) => a.worstSlaPct - b.worstSlaPct || b.oldestOpenHours - a.oldestOpenHours
  );
}

export function QueueHealthPanel({ s, detections }: QueueHealthPanelProps): React.ReactElement {
  const seats = seatHealth(s, detections);
  const clearedReal = s.tickets.filter(
    (t) => t.status === 'Closed' && t.disposition === 'cleared'
  ).length;

  return (
    <div className="space-y-4">
      {/* Per-seat queue health — grouped by accountable seat, recomputed from s.tick every render. */}
      <div className="ed-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-carbon-gray-90">
            Queue health · by accountable seat
          </p>
          <span className="text-[9px] text-carbon-gray-40">
            live working set · recomputed from tick {s.tick} · matches Operations
          </span>
        </div>
        <p className="mb-2 text-[9px] italic text-carbon-gray-40">
          These are the OPEN queue window (the live working set Operations holds, bounded) — not the
          cumulative volume worked. Total throughput is the sealed-records count; this view is
          &ldquo;what is in the queue right now,&rdquo; so under sustained load it reads the working
          set, not a growing backlog.
        </p>
        {seats.length === 0 ? (
          <p className="text-[10px] italic text-carbon-gray-40">
            no open detections in any seat queue — press Play to mint governed work
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[9px] uppercase tracking-wide text-carbon-gray-50">
                  <th className="py-1 pr-2 font-semibold">Seat</th>
                  <th className="py-1 pr-2 font-semibold">Open</th>
                  <th className="py-1 pr-2 font-semibold">Oldest open</th>
                  <th className="py-1 pr-2 font-semibold">Worst SLA</th>
                  <th className="py-1 pr-2 font-semibold">Aging</th>
                  <th className="py-1 font-semibold">Past due</th>
                </tr>
              </thead>
              <tbody>
                {seats.map((r) => (
                  <tr key={r.seat} className="border-t border-carbon-gray-10 align-top">
                    <td className="py-1.5 pr-2 text-[10px] font-semibold text-carbon-gray-80">
                      {r.seat}
                    </td>
                    <td className="num py-1.5 pr-2 text-[11px] text-carbon-gray-70">{r.count}</td>
                    <td className="mono py-1.5 pr-2 text-[10px] text-carbon-gray-70">
                      {r.oldestOpenHours.toFixed(1)}h
                    </td>
                    <td className="num py-1.5 pr-2 text-[11px] font-bold">
                      <span style={{ color: slaColor(r.worstSlaPct) }}>
                        {Math.round(r.worstSlaPct * 100)}%
                      </span>
                    </td>
                    <td className="num py-1.5 pr-2 text-[11px] text-[#b45309]">{r.aging}</td>
                    <td className="num py-1.5 text-[11px] text-[#da1e28]">{r.pastDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-[9px] italic text-carbon-gray-40">
          Segregation of duties: investigative (SIU / FWA) and clinical (medical-necessity) are
          DIFFERENT authorities — a detection is routed to one seat, never both. Credible fraud
          refers OUT to the State (455.23); the MCO acts under 438.608(a). Cleared — not FWA:{' '}
          <span className="font-semibold not-italic">{clearedReal}</span> (real human closures
          only).
        </p>
      </div>

      {/* Honesty panel — first-class, expanded. For a State / public-sector deliverable the disclaimers
          are load-bearing and must read at a glance, not behind a click. */}
      <div className="rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-70">
          What this console is NOT claiming
        </p>
        <ul className="mt-1.5 space-y-1">
          {NOT_CLAIMING.map((line) => (
            <li key={line} className="flex gap-1.5 text-[10px] text-carbon-gray-70">
              <span className="text-carbon-gray-40">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
