'use client';
import React from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import { STATE_META, type ValueSetVersion } from '../governanceApi';

interface VersionListProps {
  versions: ValueSetVersion[];
  selectedId: string | null;
  onSelect: (versionId: string) => void;
}

/** Lists every governed value-set version with its lifecycle state + active badge. */
export default function VersionList({ versions, selectedId, onSelect }: VersionListProps) {
  return (
    <div
      className="bg-white border border-carbon-gray-20"
      role="table"
      aria-label="Value-set versions"
    >
      <div
        className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase grid grid-cols-12 px-4 py-2 font-semibold"
        role="row"
      >
        <span className="col-span-2" role="columnheader">
          Version
        </span>
        <span className="col-span-3" role="columnheader">
          State
        </span>
        <span className="col-span-3" role="columnheader">
          Effective
        </span>
        <span className="col-span-4" role="columnheader">
          Submitted / Approved
        </span>
      </div>
      <ul className="divide-y divide-carbon-gray-20">
        {versions.map((v) => {
          const meta = STATE_META[v.state];
          const selected = v.versionId === selectedId;
          return (
            <li key={v.versionId} role="row">
              <button
                type="button"
                onClick={() => onSelect(v.versionId)}
                aria-pressed={selected}
                className={`w-full text-left grid grid-cols-12 items-center px-4 py-3 hover:bg-carbon-gray-10 focus:outline-none focus:ring-2 focus:ring-carbon-blue ${selected ? 'bg-[#edf5ff]' : ''}`}
              >
                <span
                  className="col-span-2 font-mono font-semibold text-carbon-gray-100"
                  role="cell"
                >
                  {v.version}
                </span>
                <span className="col-span-3 flex items-center gap-2" role="cell">
                  <StatusBadge label={meta.label} variant={meta.variant} size="sm" />
                  {v.isActive && <StatusBadge label="Current" variant="success" size="sm" />}
                </span>
                <span className="col-span-3 text-xs font-mono text-carbon-gray-50" role="cell">
                  {v.effectiveDate}
                </span>
                <span className="col-span-4 text-xs text-carbon-gray-70" role="cell">
                  {v.submittedByName ? `by ${v.submittedByName}` : '—'}
                  {v.approvedByName ? ` · appr ${v.approvedByName}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
