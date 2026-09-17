'use client';
/**
 * SurveillanceConsole — the operational surveillance layer over the ONE shared sim, and the FRONT of a
 * governed pipeline: a detection is a work item that enters a NAMED seat queue under an SLA, is claimed
 * by a named person under segregation of duties, and every routing hop is SEALED to the ledger. The
 * workbench is reachable only THROUGH that queue (route → claim → open).
 *
 * This is now a THIN SHELL: it owns the run transport + the summary tiles (persisted above the tabs)
 * and the shared `<BoardTabs>` sub-tab primitive that switches between three full-width child panels —
 * the live detection feed, the detector library (with the party lens), and queue health. Dispositions
 * are PROJECTED from real ticket state (never fabricated), so the child panels can never disagree with
 * the Operations queue about the same key.
 *
 * CLIENT-SAFE: shared sim + library data + presentational helpers only. No `@/lib/evidence` barrel.
 */
import { useState } from 'react';
import { ALGORITHMS } from '@/lib/surveillance/library';
import { TICKETS as SEED_TICKETS, type OpsTicket } from '@/lib/goldenThread/e2eFlow';
import { isWiredLibraryId } from '@/lib/goldenThread/surveillanceMap';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { BoardTabs, tabPanelProps } from '@/components/goldenThread/flow/BoardTabs';
import {
  LiveDetectionFeed,
  type Detection,
  type Side,
} from '@/components/goldenThread/flow/LiveDetectionFeed';
import { DetectorLibraryPanel } from '@/components/goldenThread/flow/DetectorLibraryPanel';
import { QueueHealthPanel } from '@/components/goldenThread/flow/QueueHealthPanel';

const seedByRef = (ref: string): OpsTicket | undefined => SEED_TICKETS.find((t) => t.id === ref);

export interface SurveillanceConsoleProps {
  op: OperatingSim;
  onOpenTicket?: (seedTicketId: string, side: Side, liveKey?: string) => void;
}

type SubView = 'queue' | 'library' | 'health';

export function SurveillanceConsole({
  op,
  onOpenTicket,
}: SurveillanceConsoleProps): React.ReactElement {
  const s = op.sim;
  const [subView, setSubView] = useState<SubView>('queue');

  // Live detections = the OPEN governed tickets the run has minted, joined to the seed narrative.
  const detections: Detection[] = s.tickets
    .map((t) => ({ t, seed: seedByRef(t.ref) }))
    .filter((d): d is Detection => !!d.seed && d.t.status !== 'Closed');
  const wiredCount = ALGORITHMS.filter((a) => isWiredLibraryId(a.id)).length;

  const tabs = [
    { key: 'queue' as const, label: 'Live queue', badge: detections.length },
    { key: 'library' as const, label: 'Detector library' },
    { key: 'health' as const, label: 'Queue health' },
  ];

  return (
    <div className="space-y-4">
      {/* Transport + honesty — persisted in the shell above the sub-tabs */}
      <div className="ed-card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={op.play}
            className="rounded bg-carbon-blue px-3 py-1 text-xs font-semibold text-white hover:bg-carbon-blue-hover"
          >
            {op.running ? '❚❚ Pause run' : '▶ Play surveillance run'}
          </button>
          <button
            type="button"
            onClick={op.step}
            className="rounded border border-carbon-gray-30 px-2 py-1 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10"
          >
            ⏭ Step
          </button>
          <span className="mono text-[11px] text-carbon-gray-60">
            {detections.length} live detections · tick {s.tick}
          </span>
        </div>
        <span className="rounded border border-carbon-yellow bg-carbon-yellow-light px-2 py-0.5 text-[10px] text-[#b45309]">
          Illustrative event cadence — production detectors run as scheduled batch / near-real-time
          analytics
        </span>
      </div>

      {/* Summary — persisted in the shell above the sub-tabs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            { label: 'Catalog detectors', value: String(ALGORITHMS.length), color: '#24427e' },
            { label: 'Scripted (narrative)', value: String(wiredCount), color: '#0f766e' },
            { label: 'Flagged detections', value: String(detections.length), color: '#5b3fa3' },
            { label: 'Sealed records', value: String(s.ledgerSeq), color: '#b45309' },
          ] as const
        ).map((tile) => (
          <div key={tile.label} className="ed-card p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
              {tile.label}
            </p>
            <p className="num text-xl" style={{ color: tile.color }}>
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {/* Sub-tabs — shared BoardTabs primitive (sub level, pill style) */}
      <BoardTabs
        tabs={tabs}
        active={subView}
        onChange={setSubView}
        ariaLabel="Surveillance views"
        level="sub"
      />

      <div {...tabPanelProps('Surveillance views', subView)}>
        {subView === 'queue' && (
          <LiveDetectionFeed op={op} s={s} detections={detections} onOpenTicket={onOpenTicket} />
        )}
        {subView === 'library' && <DetectorLibraryPanel detections={detections} />}
        {subView === 'health' && <QueueHealthPanel s={s} detections={detections} />}
      </div>
    </div>
  );
}
