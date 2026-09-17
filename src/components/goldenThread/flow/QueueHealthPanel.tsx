'use client';
/**
 * QueueHealthPanel — the SIU-chief's "how big is my backlog / what's breaching" view, extracted whole
 * from the SurveillanceConsole. Every tile is PROJECTED from real ticket state (never fabricated), so
 * this panel can never disagree with the Operations queue about the same key.
 *
 * The "WHAT THIS CONSOLE IS NOT CLAIMING" disclaimers are promoted here to a first-class, EXPANDED
 * section (no longer a collapsed accordion): for a State / public-sector deliverable the disclaimers
 * are load-bearing and must read at a glance.
 *
 * CLIENT-SAFE: shared sim + presentational helpers only. No `@/lib/evidence` barrel.
 */
import { type SimState } from '@/lib/goldenThread/flowSim';
import { NOT_CLAIMING, slaRemaining } from '@/lib/goldenThread/surveillanceMap';
import { dispositionOf, type Detection } from '@/components/goldenThread/flow/LiveDetectionFeed';

export interface QueueHealthPanelProps {
  s: SimState;
  detections: Detection[];
}

export function QueueHealthPanel({ s, detections }: QueueHealthPanelProps): React.ReactElement {
  // Queue health — projected from real state (identical projection to Operations + the feed).
  const disp = detections.map((d) => dispositionOf(d.t));
  const unrouted = disp.filter((x) => x === 'detected').length;
  const inQueue = disp.filter((x) => x === 'routed').length;
  const claimed = disp.filter((x) => x === 'assigned').length;
  const working = disp.filter((x) => x === 'action-proposed').length;
  const clearedReal = s.tickets.filter(
    (t) => t.status === 'Closed' && t.disposition === 'cleared'
  ).length;
  const referredOut = detections.filter((d) => d.t.referSeal !== undefined).length;
  const slas = detections.map((d) => slaRemaining(s.tick, d.t.bornTick, d.t.slaHours).pct);
  const pastSla = slas.filter((p) => p <= 0).length;
  const aging = slas.filter((p) => p > 0 && p < 0.5).length;

  const tiles = [
    { label: 'Unrouted', value: unrouted, color: '#8d8d8d', hint: 'detected, awaiting routing' },
    { label: 'In queue', value: inQueue, color: '#24427e', hint: 'routed · unassigned' },
    { label: 'Claimed', value: claimed, color: '#b45309', hint: 'grabbed by a named analyst' },
    { label: 'Action proposed', value: working, color: '#24a148', hint: 'pending human release' },
    { label: 'Aging (<50%)', value: aging, color: '#b45309', hint: 'SLA window past halfway' },
    { label: 'Past SLA', value: pastSla, color: '#da1e28', hint: 'breached the clock' },
    { label: 'Referred out', value: referredOut, color: '#6929c4', hint: '455.23 → State / MFCU' },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Queue health — the governed backlog, projected from real ticket state */}
      <div className="ed-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-carbon-gray-90">
            Queue health · governed backlog
          </p>
          <span className="text-[9px] text-carbon-gray-40">
            projected from live ticket state · matches Operations
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {tiles.map((m) => (
            <div key={m.label} className="rounded border border-carbon-gray-20 p-2" title={m.hint}>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                {m.label}
              </p>
              <p className="num text-lg" style={{ color: m.color }}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[9px] italic text-carbon-gray-40">
          Segregation of duties: investigative (SIU / FWA) and clinical (medical-necessity) are
          DIFFERENT authorities — a detection is routed to one, never both. Credible fraud refers
          OUT to the State (455.23); the MCO acts under 438.608(a). Cleared — not FWA:{' '}
          <span className="font-semibold not-italic">{clearedReal}</span> (real human closures
          only).
        </p>
      </div>

      {/* Honesty panel — promoted to a first-class, expanded section. For a State / public-sector
          deliverable the disclaimers are load-bearing and must read at a glance, not behind a click. */}
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
