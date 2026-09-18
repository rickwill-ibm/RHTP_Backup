'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';

const RHTP_KPIS = [
  {
    key: 'kpi-pop',
    label: 'Population Covered',
    value: '47,832',
    sub: 'Attributed Medicaid lives',
    color: 'text-[#0043ce]',
    icon: 'UserGroupIcon',
    trend: '+2,140 YTD',
    trendUp: true,
  },
  {
    key: 'kpi-gaps',
    label: 'Open Care Gaps',
    value: '8,241',
    sub: '3,190 high priority',
    color: 'text-[#da1e28]',
    icon: 'ExclamationTriangleIcon',
    trend: '-612 this quarter',
    trendUp: false,
  },
  {
    key: 'kpi-closure',
    label: 'Care Gap Closure Rate',
    value: '68.4%',
    sub: 'Target: 75% by Q4',
    color: 'text-[#b45309]',
    icon: 'CheckCircleIcon',
    trend: '+4.2% vs last quarter',
    trendUp: true,
  },
  {
    key: 'kpi-incentive',
    label: 'Quality Incentive Pool',
    value: '$3.2M',
    sub: 'Estimated available',
    color: 'text-[#24a148]',
    icon: 'CurrencyDollarIcon',
    trend: '$1.1M earned YTD',
    trendUp: true,
  },
  {
    key: 'kpi-savings',
    label: 'Projected Shared Savings',
    value: '$1.84M',
    sub: 'Based on current trajectory',
    color: 'text-[#24a148]',
    icon: 'BanknotesIcon',
    trend: 'On track for full earn',
    trendUp: true,
  },
];

export default function RuralHealthKPIStrip() {
  return (
    <div className="bg-white border border-carbon-gray-20 mx-6 mt-4 mb-4">
      {/* Program header */}
      <div className="px-5 py-3 border-b border-carbon-gray-20 bg-[#f0f4ff] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0043ce] flex items-center justify-center">
            <Icon name="BuildingOffice2Icon" size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-carbon-gray-100">
              Rural Health Transformation Program
            </p>
            <p className="text-xs text-carbon-gray-50">
              South Dakota DHSS · State Medicaid Initiative · Value-Based Care
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xs font-semibold px-2 py-1 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            ✓ Active Program
          </span>
          <span className="text-2xs font-semibold px-2 py-1 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]">
            Medicaid MCO
          </span>
          <span className="text-2xs text-carbon-gray-50">Contract Period: Jan 2026 – Dec 2028</span>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 divide-x divide-carbon-gray-20">
        {RHTP_KPIS.map((k) => (
          <div key={k.key} className="px-5 py-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name={k.icon as any} size={13} className="text-carbon-gray-50" />
              <p className="carbon-label">{k.label}</p>
            </div>
            <p className={`text-2xl font-bold tabular-nums mt-1 font-mono ${k.color}`}>{k.value}</p>
            <p className="text-xs text-carbon-gray-50 mt-0.5">{k.sub}</p>
            <p
              className={`text-2xs mt-1 font-medium ${k.trendUp ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
            >
              {k.trendUp ? '↑' : '↓'} {k.trend}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
