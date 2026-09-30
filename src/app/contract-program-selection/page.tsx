'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import NetworkParticipantsPanel from './components/NetworkParticipantsPanel';
import ProgramContractPanel from './components/ProgramContractPanel';
import NetworkGraphPanel from './components/NetworkGraphPanel';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

type ActiveView = 'overview' | 'network' | 'contracts';
type ProgramType = 'All' | 'Clinical' | 'BH' | 'Social';

const PROGRAM_KPIS: Record<
  ProgramType,
  Array<{ label: string; value: string; sub: string; color: string; icon: string }>
> = {
  All: [
    {
      label: 'Attributed Lives',
      value: '128,400',
      sub: 'All program types',
      color: '#0043ce',
      icon: 'UserGroupIcon',
    },
    {
      label: 'Clinical Gap Closure',
      value: '68.4%',
      sub: 'Target: 75%',
      color: '#b45309',
      icon: 'CheckCircleIcon',
    },
    {
      label: 'Social Screening Rate',
      value: '61.2%',
      sub: 'PRAPARE completed',
      color: '#198038',
      icon: 'ClipboardDocumentCheckIcon',
    },
    {
      label: 'BH Access Rate',
      value: '64.8%',
      sub: 'Target: 70%',
      color: '#9f1853',
      icon: 'HeartIcon',
    },
    {
      label: 'Shared Savings YTD',
      value: '$4.2M',
      sub: 'All programs',
      color: '#24a148',
      icon: 'CurrencyDollarIcon',
    },
    {
      label: 'Quality Score Δ',
      value: '+8.3 pts',
      sub: 'vs prior year',
      color: '#0043ce',
      icon: 'StarIcon',
    },
  ],
  Clinical: [
    {
      label: 'Clinical Attributed Lives',
      value: '128,400',
      sub: 'Medicare/Medicaid',
      color: '#0043ce',
      icon: 'UserGroupIcon',
    },
    {
      label: 'Gap Closure Rate',
      value: '68.4%',
      sub: 'Target: 75%',
      color: '#b45309',
      icon: 'CheckCircleIcon',
    },
    {
      label: 'HEDIS Composite',
      value: '74.2%',
      sub: '18 of 24 on track',
      color: '#0043ce',
      icon: 'ChartBarIcon',
    },
    {
      label: 'PMPM Cost',
      value: '$412',
      sub: 'Target: $430',
      color: '#24a148',
      icon: 'CurrencyDollarIcon',
    },
    {
      label: 'Clinical Gain Share',
      value: '$3.1M',
      sub: 'YTD earned',
      color: '#24a148',
      icon: 'CurrencyDollarIcon',
    },
    {
      label: 'Participating Orgs',
      value: '312',
      sub: 'FQHCs, hospitals, PCPs',
      color: '#0043ce',
      icon: 'BuildingOffice2Icon',
    },
  ],
  BH: [
    {
      label: 'BH Attributed Lives',
      value: '41,200',
      sub: 'BH program enrollment',
      color: '#9f1853',
      icon: 'UserGroupIcon',
    },
    {
      label: 'BH Access Rate',
      value: '64.8%',
      sub: 'Target: 70%',
      color: '#b45309',
      icon: 'HeartIcon',
    },
    {
      label: 'FUH/FUM Rate',
      value: '58.3%',
      sub: '7-day follow-up',
      color: '#da1e28',
      icon: 'ChartBarIcon',
    },
    {
      label: 'SUD Treatment Rate',
      value: '71.4%',
      sub: 'Initiation + engagement',
      color: '#9f1853',
      icon: 'CheckCircleIcon',
    },
    {
      label: 'BH Gain Share',
      value: '$0.8M',
      sub: 'YTD earned',
      color: '#24a148',
      icon: 'CurrencyDollarIcon',
    },
    {
      label: 'BH Organizations',
      value: '48',
      sub: 'Counseling centers, crisis',
      color: '#9f1853',
      icon: 'BuildingOffice2Icon',
    },
  ],
  Social: [
    {
      label: 'Social Program Lives',
      value: '64,800',
      sub: 'Screened population',
      color: '#198038',
      icon: 'UserGroupIcon',
    },
    {
      label: 'Screening Rate',
      value: '61.2%',
      sub: 'PRAPARE completed',
      color: '#b45309',
      icon: 'ClipboardDocumentCheckIcon',
    },
    {
      label: 'Benefit Enrollment',
      value: '74.1%',
      sub: 'Of eligible screened',
      color: '#198038',
      icon: 'DocumentCheckIcon',
    },
    {
      label: 'Dual-Need Cohort',
      value: '18,240',
      sub: '2+ social domains',
      color: '#0043ce',
      icon: 'UserGroupIcon',
    },
    {
      label: 'Social Gain Share',
      value: '$0.3M',
      sub: 'YTD earned',
      color: '#24a148',
      icon: 'CurrencyDollarIcon',
    },
    {
      label: 'CBO Partners',
      value: '84',
      sub: 'Housing, food, transport',
      color: '#198038',
      icon: 'BuildingOffice2Icon',
    },
  ],
};

const PROGRAM_COLORS: Record<ProgramType, string> = {
  All: '#0043ce',
  Clinical: '#0043ce',
  BH: '#9f1853',
  Social: '#198038',
};

const PROGRAM_LABELS: Record<ProgramType, { icon: string; description: string }> = {
  All: {
    icon: '🏥',
    description: 'All program types — Clinical, Behavioral Health, and Social programs combined',
  },
  Clinical: {
    icon: '🩺',
    description: 'Clinical VBC — FQHCs, hospitals, PCP practices, specialist groups',
  },
  BH: {
    icon: '🧠',
    description: 'Behavioral Health — BH orgs, crisis centers, SUD treatment, counseling',
  },
  Social: {
    icon: '🤝',
    description: 'Social Programs — CBOs, housing navigators, food banks, CHW organizations',
  },
};

export default function ContractProgramSelectionPage() {
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [programType, setProgramType] = useState<ProgramType>('All');
  const router = useRouter();

  const VIEWS: Array<{ key: ActiveView; label: string; icon: string }> = [
    { key: 'overview', label: 'Program Overview', icon: '🏥' },
    { key: 'network', label: 'Network Participants', icon: '🔗' },
    { key: 'contracts', label: 'Value-Based Contracts', icon: '📋' },
  ];

  const kpis = PROGRAM_KPIS[programType];
  const programColor = PROGRAM_COLORS[programType];

  return (
    <AppLayout
      pageTitle="Rural Health Transformation Program"
      breadcrumbs={[{ label: 'RHTP Platform' }, { label: 'Program Overview' }]}
      contextBanner={
        <div className="bg-[#defbe6] border-b border-[#a7f0ba] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0e6027]">
            State Medicaid Agency: State HHS Agency
          </span>
          <span className="text-xs text-[#0e6027]">Program Year: 2026</span>
          <span className="text-xs text-[#0e6027]">Covered Counties: 14 SD Rural Counties</span>
          <span className="text-xs text-[#0e6027]">Status: Active — Performance Period Q2</span>
          <button
            onClick={() => router.push('/region-view')}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[#0e6027] hover:text-[#0043ce] transition-colors"
          >
            View Regions →
          </button>
          <span className="text-xs text-carbon-gray-50">Data as of May 29, 2026</span>
        </div>
      }
    >
      {/* Program-type filter bar */}
      <div className="bg-white border-b border-carbon-gray-20 px-6 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-carbon-gray-50 uppercase tracking-widest mr-1">
          Program Type:
        </span>
        {(['All', 'Clinical', 'BH', 'Social'] as ProgramType[]).map((pt) => {
          const cfg = PROGRAM_LABELS[pt];
          const isActive = programType === pt;
          return (
            <button
              key={pt}
              onClick={() => setProgramType(pt)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-colors"
              style={
                isActive
                  ? {
                      backgroundColor: PROGRAM_COLORS[pt],
                      color: '#fff',
                      borderColor: PROGRAM_COLORS[pt],
                    }
                  : { backgroundColor: '#fff', color: '#6f6f6f', borderColor: '#e0e0e0' }
              }
            >
              <span>{cfg.icon}</span>
              {pt === 'All'
                ? 'All Programs'
                : pt === 'BH'
                  ? 'Behavioral Health'
                  : pt === 'Social'
                    ? 'Social Programs'
                    : 'Clinical'}
            </button>
          );
        })}
        <span className="text-2xs text-carbon-gray-50 ml-2">
          {PROGRAM_LABELS[programType].description}
        </span>
      </div>

      {/* Multi-domain KPI strip */}
      <div className="bg-white border-b border-carbon-gray-20 grid grid-cols-3 lg:grid-cols-6 divide-x divide-carbon-gray-20">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="px-4 py-3 flex items-start gap-2.5">
            <div className="w-7 h-7 flex items-center justify-center bg-carbon-gray-10 flex-shrink-0 mt-0.5">
              <Icon name={kpi.icon as any} size={14} style={{ color: kpi.color }} />
            </div>
            <div>
              <p
                className="font-mono text-base font-bold leading-tight"
                style={{ color: kpi.color }}
              >
                {kpi.value}
              </p>
              <p className="text-2xs font-semibold text-carbon-gray-100 leading-tight">
                {kpi.label}
              </p>
              <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* View Tabs */}
      <div className="flex gap-0 border-b border-carbon-gray-20 bg-white px-6">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setActiveView(v.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeView === v.key
                ? 'border-[#0f62fe] text-[#0f62fe]'
                : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100'
            }`}
          >
            <span>{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (
        <div className="px-6 pb-6 space-y-4 pt-4">
          <NetworkGraphPanel programType={programType} />
          <ProgramContractPanel programType={programType} />
        </div>
      )}

      {activeView === 'network' && (
        <div className="px-6 pb-6">
          <NetworkParticipantsPanel />
        </div>
      )}

      {activeView === 'contracts' && (
        <div className="px-6 pb-6">
          <ProgramContractPanel showFull programType={programType} />
        </div>
      )}
    </AppLayout>
  );
}

export type ContractFilters = {
  search: string;
  program: string;
  performance: string;
};
