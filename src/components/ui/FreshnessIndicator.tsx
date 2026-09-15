import React from 'react';

interface FreshnessIndicatorProps {
  source: string;
  date: string;
  available?: boolean;
}

export default function FreshnessIndicator({
  source,
  date,
  available = true,
}: FreshnessIndicatorProps) {
  if (!available) {
    return (
      <span className="inline-flex items-center gap-1 text-2xs text-[#da1e28]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#da1e28] inline-block" />
        {source}: unavailable
      </span>
    );
  }
  const parsed = new Date(date);
  const now = new Date('2026-04-15');
  const diffDays = Math.floor((now.getTime() - parsed.getTime()) / 86400000);
  const isFresh = diffDays <= 3;
  const isStale = diffDays > 3 && diffDays <= 14;

  return (
    <span
      className={`inline-flex items-center gap-1 text-2xs ${isFresh ? 'text-[#24a148]' : isStale ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full inline-block ${isFresh ? 'bg-[#24a148]' : isStale ? 'bg-[#f1c21b]' : 'bg-[#da1e28]'}`}
      />
      {source}: {diffDays === 0 ? 'Today' : `${diffDays}d ago`}
    </span>
  );
}
