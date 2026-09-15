'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useRouter } from 'next/navigation';

const NETWORK_ORGS = [
  {
    id: 'org-1',
    name: 'Bennett County Health Services',
    type: 'FQHC',
    county: 'Bennett County',
    region: 'region-west-river',
    regionName: 'West River Region',
    providers: 12,
    patients: 8420,
    gapClosure: 71,
    gainShare: '$142K',
    status: 'Active',
    color: 'bg-[#0043ce]',
  },
  {
    id: 'org-2',
    name: 'Winner Regional Medical Center',
    type: 'Rural Hospital',
    county: 'Tripp County',
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
    providers: 34,
    patients: 11200,
    gapClosure: 64,
    gainShare: '$218K',
    status: 'Active',
    color: 'bg-[#6929c4]',
  },
  {
    id: 'org-3',
    name: 'Oglala Lakota PCP Group',
    type: 'PCP Practice',
    county: 'Oglala Lakota County',
    region: 'region-west-river',
    regionName: 'West River Region',
    providers: 6,
    patients: 3100,
    gapClosure: 78,
    gainShare: '$88K',
    status: 'Active',
    color: 'bg-[#24a148]',
  },
  {
    id: 'org-4',
    name: 'Winner Community Health FQHC',
    type: 'FQHC',
    county: 'Tripp County',
    region: 'region-central',
    regionName: 'Missouri River Corridor',
    providers: 9,
    patients: 5640,
    gapClosure: 69,
    gainShare: '$104K',
    status: 'Active',
    color: 'bg-[#0043ce]',
  },
  {
    id: 'org-5',
    name: 'Fall River Specialist Network',
    type: 'Specialist Group',
    county: 'Fall River County',
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
    providers: 8,
    patients: 2890,
    gapClosure: 55,
    gainShare: '$61K',
    status: 'At Risk',
    color: 'bg-[#b45309]',
  },
  {
    id: 'org-6',
    name: 'Gregory County Medical Associates',
    type: 'PCP Practice',
    county: 'Gregory County',
    region: 'region-central',
    regionName: 'Missouri River Corridor',
    providers: 7,
    patients: 4200,
    gapClosure: 73,
    gainShare: '$97K',
    status: 'Active',
    color: 'bg-[#24a148]',
  },
  {
    id: 'org-7',
    name: 'Avera Sacred Heart CAH',
    type: 'Rural Hospital',
    county: 'Charles Mix County',
    region: 'region-northeast',
    regionName: 'Northeast SD Region',
    providers: 18,
    patients: 6100,
    gapClosure: 61,
    gainShare: '$133K',
    status: 'Active',
    color: 'bg-[#6929c4]',
  },
  {
    id: 'org-8',
    name: 'Monument Health Cardiology',
    type: 'Specialist Group',
    county: 'Pennington County',
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
    providers: 4,
    patients: 1820,
    gapClosure: 82,
    gainShare: '$74K',
    status: 'Active',
    color: 'bg-[#24a148]',
  },
];

const TYPE_COLORS: Record<string, string> = {
  FQHC: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
  'Rural Hospital': 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
  'PCP Practice': 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
  'Specialist Group': 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
};

export default function NetworkParticipantsPanel() {
  const router = useRouter();
  const [filterType, setFilterType] = useState('All');
  const types = ['All', 'FQHC', 'Rural Hospital', 'PCP Practice', 'Specialist Group'];

  const filtered =
    filterType === 'All' ? NETWORK_ORGS : NETWORK_ORGS.filter((o) => o.type === filterType);

  const totals = {
    orgs: NETWORK_ORGS.length,
    providers: NETWORK_ORGS.reduce((a, o) => a + o.providers, 0),
    patients: NETWORK_ORGS.reduce((a, o) => a + o.patients, 0),
    gainShare: '$917K',
  };

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="bg-white border border-carbon-gray-20 grid grid-cols-4 divide-x divide-carbon-gray-20">
        {[
          { label: 'Network Organizations', value: totals.orgs, color: 'text-[#0043ce]' },
          { label: 'Total Providers', value: totals.providers, color: 'text-carbon-gray-100' },
          {
            label: 'Total Patients',
            value: totals.patients.toLocaleString(),
            color: 'text-carbon-gray-100',
          },
          { label: 'Total Gain Share YTD', value: totals.gainShare, color: 'text-[#24a148]' },
        ].map((s) => (
          <div key={s.label} className="px-5 py-4">
            <p className="carbon-label">{s.label}</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Click hint */}
      <div className="flex items-center gap-2 text-2xs text-carbon-gray-50 px-1">
        <Icon name="CursorArrowRaysIcon" size={13} className="text-[#0043ce]" />
        <span>Click any provider card to drill into that provider&apos;s attributed panel</span>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-2">
          Filter by Type
        </span>
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 text-xs font-medium border transition-colors ${
              filterType === t
                ? 'bg-[#0043ce] text-white border-[#0043ce]'
                : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Org cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((org) => (
          <div
            key={org.id}
            className="bg-white border border-carbon-gray-20 hover:border-[#97c1ff] hover:shadow-carbon-md transition-all cursor-pointer"
            onClick={() =>
              router.push(
                `/provider-level?region=${org.region}&regionName=${encodeURIComponent(org.regionName)}`
              )
            }
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center gap-3">
              <div
                className={`w-8 h-8 ${org.color} flex items-center justify-center flex-shrink-0`}
              >
                <Icon name="BuildingOffice2Icon" size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-carbon-gray-100 truncate">{org.name}</p>
                <p className="text-xs text-carbon-gray-50">{org.county}</p>
              </div>
              <span
                className={`text-2xs font-semibold px-2 py-0.5 border flex-shrink-0 ${TYPE_COLORS[org.type] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
              >
                {org.type}
              </span>
            </div>

            {/* Metrics */}
            <div className="px-4 py-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Providers</p>
                <p className="text-lg font-bold font-mono text-carbon-gray-100">{org.providers}</p>
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Patients</p>
                <p className="text-lg font-bold font-mono text-carbon-gray-100">
                  {org.patients.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Gap Closure</p>
                <p
                  className={`text-lg font-bold font-mono ${org.gapClosure >= 70 ? 'text-[#24a148]' : org.gapClosure >= 60 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                >
                  {org.gapClosure}%
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 bg-carbon-gray-10 border-t border-carbon-gray-20 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Icon name="CurrencyDollarIcon" size={13} className="text-[#24a148]" />
                <span className="text-xs font-semibold text-[#24a148]">
                  {org.gainShare} gain share YTD
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-2xs font-semibold px-2 py-0.5 ${
                    org.status === 'Active'
                      ? 'bg-[#defbe6] text-[#0e6027]'
                      : 'bg-[#fdf6dd] text-[#b45309]'
                  }`}
                >
                  {org.status}
                </span>
                <Icon name="ChevronRightIcon" size={12} className="text-carbon-gray-30" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
