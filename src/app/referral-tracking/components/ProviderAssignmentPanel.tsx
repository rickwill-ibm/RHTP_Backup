'use client';
import React from 'react';

// Provider assignment status derived from mock referrals
const providerStats = [
  {
    providerId: 'prov-001',
    name: 'Dr. Amara Osei',
    specialty: 'Cardiology',
    tier: 'Preferred',
    activeReferrals: 3,
    completedReferrals: 8,
    pendingAssignment: 0,
    avgDaysToAppt: 6.2,
    noShowRate: 0.08,
    qualityScore: 94,
  },
  {
    providerId: 'prov-003',
    name: 'Dr. Marcus Weatherington',
    specialty: 'Pulmonology',
    tier: 'In-Network',
    activeReferrals: 1,
    completedReferrals: 3,
    pendingAssignment: 0,
    avgDaysToAppt: 13.0,
    noShowRate: 0.12,
    qualityScore: 82,
  },
  {
    providerId: 'prov-004',
    name: 'Dr. Priya Venkataraman',
    specialty: 'Nephrology',
    tier: 'Preferred',
    activeReferrals: 1,
    completedReferrals: 2,
    pendingAssignment: 1,
    avgDaysToAppt: 0,
    noShowRate: 0.05,
    qualityScore: 97,
  },
  {
    providerId: 'prov-006',
    name: 'Dr. Fatima Al-Rashidi',
    specialty: 'Ophthalmology',
    tier: 'Preferred',
    activeReferrals: 0,
    completedReferrals: 4,
    pendingAssignment: 0,
    avgDaysToAppt: 7.0,
    noShowRate: 0.06,
    qualityScore: 89,
  },
  {
    providerId: 'prov-007',
    name: 'Dr. Thomas Kaczmarek',
    specialty: 'Gastroenterology',
    tier: 'In-Network',
    activeReferrals: 1,
    completedReferrals: 2,
    pendingAssignment: 0,
    avgDaysToAppt: 15.0,
    noShowRate: 0.1,
    qualityScore: 80,
  },
  {
    providerId: 'prov-008',
    name: 'Dr. Nkechi Eze-Williams',
    specialty: 'Endocrinology',
    tier: 'Out-of-Network',
    activeReferrals: 0,
    completedReferrals: 1,
    pendingAssignment: 0,
    avgDaysToAppt: 6.0,
    noShowRate: 0.0,
    qualityScore: 88,
  },
  {
    providerId: 'prov-009',
    name: 'Dr. Carlos Mendez-Ruiz',
    specialty: 'Cardiology',
    tier: 'In-Network',
    activeReferrals: 0,
    completedReferrals: 3,
    pendingAssignment: 0,
    avgDaysToAppt: 7.0,
    noShowRate: 0.09,
    qualityScore: 85,
  },
  {
    providerId: 'prov-005',
    name: 'Dr. Jerome Blackwood',
    specialty: 'Orthopedics',
    tier: 'In-Network',
    activeReferrals: 0,
    completedReferrals: 2,
    pendingAssignment: 0,
    avgDaysToAppt: 7.0,
    noShowRate: 0.15,
    qualityScore: 78,
  },
];

function TierDot({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    Preferred: 'bg-[#24a148]',
    'In-Network': 'bg-[#0043ce]',
    'Out-of-Network': 'bg-[#da1e28]',
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${map[tier] ?? 'bg-carbon-gray-40'}`} />
  );
}

export default function ProviderAssignmentPanel() {
  return (
    <div className="bg-white border border-carbon-gray-20">
      <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-carbon-gray-100">Provider Assignment Status</h2>
        <span className="text-2xs text-carbon-gray-50 uppercase tracking-wide font-semibold">
          Per Provider
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              {[
                'Provider',
                'Specialty',
                'Tier',
                'Active',
                'Completed',
                'Pending',
                'Avg Days',
                'No-Show',
                'Quality',
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providerStats.map((p) => (
              <tr
                key={p.providerId}
                className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
              >
                <td className="px-3 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                  {p.name}
                </td>
                <td className="px-3 py-2.5 text-carbon-gray-70 whitespace-nowrap">{p.specialty}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <TierDot tier={p.tier} />
                    <span className="text-xs text-carbon-gray-70">{p.tier}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${p.activeReferrals > 2 ? 'text-[#b45309]' : 'text-carbon-gray-70'}`}
                  >
                    {p.activeReferrals}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-carbon-gray-70 tabular-nums">
                  {p.completedReferrals}
                </td>
                <td className="px-3 py-2.5">
                  {p.pendingAssignment > 0 ? (
                    <span className="inline-flex items-center text-2xs font-semibold px-1.5 py-0.5 bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]">
                      {p.pendingAssignment}
                    </span>
                  ) : (
                    <span className="text-xs text-carbon-gray-40">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-carbon-gray-70">
                  {p.avgDaysToAppt > 0 ? (
                    `${p.avgDaysToAppt}d`
                  ) : (
                    <span className="text-carbon-gray-40">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`font-mono text-xs tabular-nums ${p.noShowRate >= 0.12 ? 'text-[#da1e28] font-semibold' : 'text-carbon-gray-70'}`}
                  >
                    {(p.noShowRate * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${p.qualityScore >= 90 ? 'text-[#24a148]' : p.qualityScore >= 80 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                  >
                    {p.qualityScore}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
