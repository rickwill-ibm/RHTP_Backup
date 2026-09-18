'use client';
import React from 'react';

const kpis = [
  {
    label: 'Active Referrals',
    value: '24',
    sub: '↑ 3 this week',
    color: 'text-[#0043ce]',
    bg: 'bg-[#d0e2ff]',
  },
  {
    label: 'Pending Assignment',
    value: '7',
    sub: 'Awaiting provider',
    color: 'text-[#b45309]',
    bg: 'bg-[#fdf6dd]',
  },
  {
    label: 'Avg Days to Assign',
    value: '3.2d',
    sub: 'Target: ≤ 5d',
    color: 'text-[#24a148]',
    bg: 'bg-[#defbe6]',
  },
  {
    label: 'Avg Days to Appt',
    value: '11.4d',
    sub: 'Target: ≤ 14d',
    color: 'text-[#24a148]',
    bg: 'bg-[#defbe6]',
  },
  {
    label: 'Completed (30d)',
    value: '41',
    sub: '89% closure rate',
    color: 'text-[#0043ce]',
    bg: 'bg-[#d0e2ff]',
  },
  {
    label: 'No-Show / Cancelled',
    value: '5',
    sub: '10.9% of closed',
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
  },
  {
    label: 'Out-of-Network',
    value: '3',
    sub: 'Require auth review',
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
  },
  {
    label: 'STAT Referrals',
    value: '2',
    sub: 'Require same-day',
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
  },
];

export default function ReferralKPIStrip() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 border-b border-carbon-gray-20 bg-white">
      {kpis?.map((k, i) => (
        <div
          key={k?.label}
          className={`px-4 py-3 flex flex-col gap-0.5 ${i < kpis?.length - 1 ? 'border-r border-carbon-gray-20' : ''}`}
        >
          <span className="text-2xs text-carbon-gray-50 uppercase tracking-wide font-semibold">
            {k?.label}
          </span>
          <span className={`text-xl font-bold tabular-nums ${k?.color}`}>{k?.value}</span>
          <span className="text-2xs text-carbon-gray-50">{k?.sub}</span>
        </div>
      ))}
    </div>
  );
}
