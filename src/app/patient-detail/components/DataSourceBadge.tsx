'use client';
import React, { useState, useRef, useEffect } from 'react';

export interface DataSource {
  name: string;
  lastSync: string; // ISO date string or 'today'
  daysAgo: number; // 0 = today
}

export interface DataSourceGroup {
  type: string;
  sources: DataSource[];
}

type FreshnessStatus = 'live' | 'fresh' | 'stale' | 'outdated';

function getStatus(daysAgo: number): FreshnessStatus {
  if (daysAgo === 0) return 'live';
  if (daysAgo <= 7) return 'fresh';
  if (daysAgo <= 14) return 'stale';
  return 'outdated';
}

function getStatusLabel(status: FreshnessStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'fresh':
      return 'Fresh';
    case 'stale':
      return 'Stale';
    case 'outdated':
      return 'Outdated';
  }
}

function getStatusDot(status: FreshnessStatus): string {
  switch (status) {
    case 'live':
    case 'fresh':
      return 'bg-[#24a148]';
    case 'stale':
      return 'bg-[#f1c21b]';
    case 'outdated':
      return 'bg-[#da1e28]';
  }
}

function getStatusText(status: FreshnessStatus): string {
  switch (status) {
    case 'live':
    case 'fresh':
      return 'text-[#24a148]';
    case 'stale':
      return 'text-[#b45309]';
    case 'outdated':
      return 'text-[#da1e28]';
  }
}

/** Rollup = worst status across all sources */
function getRollupStatus(sources: DataSource[]): FreshnessStatus {
  const statuses = sources.map((s) => getStatus(s.daysAgo));
  if (statuses.includes('outdated')) return 'outdated';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('fresh')) return 'fresh';
  return 'live';
}

function getBadgeBg(status: FreshnessStatus): string {
  switch (status) {
    case 'live':
    case 'fresh':
      return 'bg-[#defbe6] text-[#0e6027] border-[#24a148]';
    case 'stale':
      return 'bg-[#fef3c7] text-[#92400e] border-[#f1c21b]';
    case 'outdated':
      return 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28]';
  }
}

function formatSyncLabel(daysAgo: number): string {
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return '1d ago';
  return `${daysAgo}d ago`;
}

interface Props {
  group: DataSourceGroup;
}

export default function DataSourceBadge({ group }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const rollup = getRollupStatus(group.sources);
  const badgeClass = getBadgeBg(rollup);
  const bestSync = Math.min(...group.sources.map((s) => s.daysAgo));
  const syncLabel = formatSyncLabel(bestSync);
  const isSingle = group.sources.length === 1;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-2xs font-semibold transition-all hover:opacity-80 ${badgeClass}`}
        aria-expanded={open}
      >
        <span>{group.type}</span>
        {!isSingle && (
          <span className="bg-white bg-opacity-60 rounded px-1 font-mono">
            {group.sources.length}
          </span>
        )}
        <span className="opacity-70">{syncLabel}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-carbon-gray-20 shadow-lg rounded min-w-[260px]">
          <div className="px-3 py-2 border-b border-carbon-gray-10 bg-carbon-gray-10">
            <span className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
              {group.type} Sources
            </span>
          </div>
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-carbon-gray-10">
                <th className="text-left px-3 py-1.5 text-carbon-gray-50 font-medium">Source</th>
                <th className="text-left px-3 py-1.5 text-carbon-gray-50 font-medium">Last Sync</th>
                <th className="text-left px-3 py-1.5 text-carbon-gray-50 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {group.sources.map((src) => {
                const status = getStatus(src.daysAgo);
                return (
                  <tr
                    key={src.name}
                    className="border-b border-carbon-gray-10 last:border-0 hover:bg-carbon-gray-10"
                  >
                    <td className="px-3 py-2 font-medium text-carbon-gray-100">{src.name}</td>
                    <td className="px-3 py-2 text-carbon-gray-70 font-mono">
                      {formatSyncLabel(src.daysAgo)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${getStatusText(status)}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(status)}`} />
                        {getStatusLabel(status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
