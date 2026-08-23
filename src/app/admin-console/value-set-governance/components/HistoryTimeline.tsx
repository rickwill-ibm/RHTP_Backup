'use client';
import React from 'react';
import { STATE_META, type GovernanceEvent } from '../governanceApi';

interface HistoryTimelineProps {
  events: GovernanceEvent[];
}

const ACTION_DOT: Record<GovernanceEvent['action'], string> = {
  submit: 'bg-[#f1c21b]',
  approve: 'bg-[#24a148]',
  reject: 'bg-[#da1e28]',
  retire: 'bg-[#da1e28]',
  supersede: 'bg-[#6929c4]',
};

/** Immutable version-history / audit timeline (newest first). */
export default function HistoryTimeline({ events }: HistoryTimelineProps) {
  return (
    <div className="bg-white border border-carbon-gray-20 p-5">
      <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4">Version History &amp; Audit Timeline</h3>
      <ol className="relative border-l border-carbon-gray-20 ml-2">
        {events.map((e) => (
          <li key={e.id} className="mb-5 ml-4">
            <span className={`absolute -left-1.5 w-3 h-3 rounded-full ${ACTION_DOT[e.action]}`} aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-carbon-gray-50">{e.at}</span>
              <span className="text-xs font-semibold text-carbon-gray-100 uppercase">{e.action}</span>
              <span className="text-xs font-mono text-carbon-gray-70">{e.version}</span>
              <span className="text-xs text-carbon-gray-50">
                {e.fromState ? `${STATE_META[e.fromState].label} → ` : ''}{STATE_META[e.toState].label}
              </span>
            </div>
            <p className="text-xs text-carbon-gray-70 mt-0.5">{e.note}</p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">actor: {e.actor}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
