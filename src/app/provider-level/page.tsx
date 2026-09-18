'use client';
import React, { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';

type ProgramTab = 'Clinical' | 'BH' | 'CBO';

interface ProviderData {
  id: string;
  name: string;
  type:
    | 'FQHC'
    | 'Rural Hospital'
    | 'PCP Practice'
    | 'Specialist Group'
    | 'BH Org'
    | 'Crisis Center'
    | 'CBO'
    | 'Housing Navigator'
    | 'Food Bank';
  programTab: ProgramTab;
  county: string;
  region: string;
  providers: number;
  patients: number;
  gapClosure: number;
  qualityScore: number;
  gainShare: string;
  gainShareNum: number;
  pmpmCost: number;
  pmpmTarget: number;
  status: 'Active' | 'At Risk';
  regionalAvg: number;
  stateTarget: number;
  activeEpisodes: number;
  closedEpisodes: number;
  episodeTypes: string[];
  // Whole-person metrics
  screeningRate?: number;
  bhAccessRate?: number;
  enrollmentRate?: number;
  completionRate?: number;
}

const ALL_PROVIDERS: ProviderData[] = [
  // Clinical
  {
    id: 'prov-001',
    name: 'Bennett County Health Services',
    type: 'FQHC',
    programTab: 'Clinical',
    county: 'Bennett County',
    region: 'region-west-river',
    providers: 12,
    patients: 8420,
    gapClosure: 71,
    qualityScore: 79,
    gainShare: '$142K',
    gainShareNum: 142000,
    pmpmCost: 412,
    pmpmTarget: 430,
    status: 'Active',
    regionalAvg: 68,
    stateTarget: 75,
    activeEpisodes: 34,
    closedEpisodes: 128,
    episodeTypes: ['Chronic', 'Acute', 'Specialist'],
    screeningRate: 68,
  },
  {
    id: 'prov-002',
    name: 'Winner Regional Medical Center',
    type: 'Rural Hospital',
    programTab: 'Clinical',
    county: 'Tripp County',
    region: 'region-southeast',
    providers: 34,
    patients: 11200,
    gapClosure: 64,
    qualityScore: 72,
    gainShare: '$218K',
    gainShareNum: 218000,
    pmpmCost: 548,
    pmpmTarget: 510,
    status: 'Active',
    regionalAvg: 64,
    stateTarget: 75,
    activeEpisodes: 67,
    closedEpisodes: 203,
    episodeTypes: ['Acute', 'Chronic'],
    screeningRate: 52,
  },
  {
    id: 'prov-003',
    name: 'Oglala Lakota PCP Group',
    type: 'PCP Practice',
    programTab: 'Clinical',
    county: 'Oglala Lakota County',
    region: 'region-west-river',
    providers: 6,
    patients: 3100,
    gapClosure: 78,
    qualityScore: 84,
    gainShare: '$88K',
    gainShareNum: 88000,
    pmpmCost: 388,
    pmpmTarget: 420,
    status: 'Active',
    regionalAvg: 68,
    stateTarget: 75,
    activeEpisodes: 18,
    closedEpisodes: 74,
    episodeTypes: ['Chronic', 'Preventive'],
    screeningRate: 74,
  },
  {
    id: 'prov-004',
    name: 'Winner Community Health FQHC',
    type: 'FQHC',
    programTab: 'Clinical',
    county: 'Tripp County',
    region: 'region-central',
    providers: 9,
    patients: 5640,
    gapClosure: 69,
    qualityScore: 76,
    gainShare: '$104K',
    gainShareNum: 104000,
    pmpmCost: 421,
    pmpmTarget: 430,
    status: 'Active',
    regionalAvg: 70,
    stateTarget: 75,
    activeEpisodes: 29,
    closedEpisodes: 112,
    episodeTypes: ['Chronic', 'Specialist'],
    screeningRate: 61,
  },
  {
    id: 'prov-005',
    name: 'Fall River Specialist Network',
    type: 'Specialist Group',
    programTab: 'Clinical',
    county: 'Fall River County',
    region: 'region-southeast',
    providers: 8,
    patients: 2890,
    gapClosure: 55,
    qualityScore: 62,
    gainShare: '$61K',
    gainShareNum: 61000,
    pmpmCost: 612,
    pmpmTarget: 540,
    status: 'At Risk',
    regionalAvg: 64,
    stateTarget: 75,
    activeEpisodes: 41,
    closedEpisodes: 89,
    episodeTypes: ['Specialist', 'Acute'],
    screeningRate: 38,
  },
  {
    id: 'prov-006',
    name: 'Gregory County Medical Associates',
    type: 'PCP Practice',
    programTab: 'Clinical',
    county: 'Gregory County',
    region: 'region-central',
    providers: 7,
    patients: 4200,
    gapClosure: 73,
    qualityScore: 80,
    gainShare: '$97K',
    gainShareNum: 97000,
    pmpmCost: 398,
    pmpmTarget: 420,
    status: 'Active',
    regionalAvg: 68,
    stateTarget: 75,
    activeEpisodes: 22,
    closedEpisodes: 91,
    episodeTypes: ['Chronic', 'Preventive'],
    screeningRate: 70,
  },
  {
    id: 'prov-007',
    name: 'Avera Sacred Heart CAH',
    type: 'Rural Hospital',
    programTab: 'Clinical',
    county: 'Charles Mix County',
    region: 'region-northeast',
    providers: 18,
    patients: 6100,
    gapClosure: 61,
    qualityScore: 68,
    gainShare: '$133K',
    gainShareNum: 133000,
    pmpmCost: 502,
    pmpmTarget: 490,
    status: 'Active',
    regionalAvg: 58,
    stateTarget: 75,
    activeEpisodes: 48,
    closedEpisodes: 156,
    episodeTypes: ['Acute', 'Chronic'],
    screeningRate: 44,
  },
  {
    id: 'prov-008',
    name: 'Monument Health Cardiology',
    type: 'Specialist Group',
    programTab: 'Clinical',
    county: 'Pennington County',
    region: 'region-southeast',
    providers: 4,
    patients: 1820,
    gapClosure: 82,
    qualityScore: 88,
    gainShare: '$74K',
    gainShareNum: 74000,
    pmpmCost: 467,
    pmpmTarget: 510,
    status: 'Active',
    regionalAvg: 64,
    stateTarget: 75,
    activeEpisodes: 15,
    closedEpisodes: 62,
    episodeTypes: ['Specialist', 'Chronic'],
    screeningRate: 77,
  },
  // BH Network
  {
    id: 'bh-001',
    name: 'West River Behavioral Health Alliance',
    type: 'BH Org',
    programTab: 'BH',
    county: 'Bennett County',
    region: 'region-west-river',
    providers: 8,
    patients: 1840,
    gapClosure: 66,
    qualityScore: 74,
    gainShare: '$48K',
    gainShareNum: 48000,
    pmpmCost: 312,
    pmpmTarget: 340,
    status: 'Active',
    regionalAvg: 62,
    stateTarget: 70,
    activeEpisodes: 22,
    closedEpisodes: 67,
    episodeTypes: ['BH Acute', 'SUD'],
    bhAccessRate: 71,
    screeningRate: 84,
  },
  {
    id: 'bh-002',
    name: 'Southeast SD Crisis Services',
    type: 'Crisis Center',
    programTab: 'BH',
    county: 'Tripp County',
    region: 'region-southeast',
    providers: 5,
    patients: 920,
    gapClosure: 58,
    qualityScore: 65,
    gainShare: '$22K',
    gainShareNum: 22000,
    pmpmCost: 284,
    pmpmTarget: 310,
    status: 'At Risk',
    regionalAvg: 62,
    stateTarget: 70,
    activeEpisodes: 14,
    closedEpisodes: 38,
    episodeTypes: ['Crisis', 'BH Acute'],
    bhAccessRate: 59,
    screeningRate: 78,
  },
  {
    id: 'bh-003',
    name: 'Missouri River Counseling Center',
    type: 'BH Org',
    programTab: 'BH',
    county: 'Gregory County',
    region: 'region-central',
    providers: 11,
    patients: 2310,
    gapClosure: 72,
    qualityScore: 79,
    gainShare: '$61K',
    gainShareNum: 61000,
    pmpmCost: 298,
    pmpmTarget: 340,
    status: 'Active',
    regionalAvg: 62,
    stateTarget: 70,
    activeEpisodes: 31,
    closedEpisodes: 88,
    episodeTypes: ['SUD', 'BH Chronic'],
    bhAccessRate: 76,
    screeningRate: 88,
  },
  {
    id: 'bh-004',
    name: 'Northeast SD Rural Mental Health',
    type: 'BH Org',
    programTab: 'BH',
    county: 'Charles Mix County',
    region: 'region-northeast',
    providers: 6,
    patients: 1120,
    gapClosure: 54,
    qualityScore: 61,
    gainShare: '$28K',
    gainShareNum: 28000,
    pmpmCost: 334,
    pmpmTarget: 310,
    status: 'At Risk',
    regionalAvg: 62,
    stateTarget: 70,
    activeEpisodes: 18,
    closedEpisodes: 44,
    episodeTypes: ['BH Acute', 'Crisis'],
    bhAccessRate: 52,
    screeningRate: 67,
  },
  // CBO Network
  {
    id: 'cbo-001',
    name: 'SD Community Action Partnership',
    type: 'CBO',
    programTab: 'CBO',
    county: 'Bennett County',
    region: 'region-west-river',
    providers: 14,
    patients: 2840,
    gapClosure: 0,
    qualityScore: 0,
    gainShare: '$31K',
    gainShareNum: 31000,
    pmpmCost: 0,
    pmpmTarget: 0,
    status: 'Active',
    regionalAvg: 0,
    stateTarget: 0,
    activeEpisodes: 0,
    closedEpisodes: 0,
    episodeTypes: [],
    enrollmentRate: 74,
    completionRate: 68,
    screeningRate: 91,
  },
  {
    id: 'cbo-002',
    name: 'Southeast SD Housing Navigation',
    type: 'Housing Navigator',
    programTab: 'CBO',
    county: 'Tripp County',
    region: 'region-southeast',
    providers: 7,
    patients: 1240,
    gapClosure: 0,
    qualityScore: 0,
    gainShare: '$18K',
    gainShareNum: 18000,
    pmpmCost: 0,
    pmpmTarget: 0,
    status: 'Active',
    regionalAvg: 0,
    stateTarget: 0,
    activeEpisodes: 0,
    closedEpisodes: 0,
    episodeTypes: [],
    enrollmentRate: 61,
    completionRate: 54,
    screeningRate: 82,
  },
  {
    id: 'cbo-003',
    name: 'Rosebud Area Food Security Network',
    type: 'Food Bank',
    programTab: 'CBO',
    county: 'Todd County',
    region: 'region-northeast',
    providers: 9,
    patients: 1880,
    gapClosure: 0,
    qualityScore: 0,
    gainShare: '$24K',
    gainShareNum: 24000,
    pmpmCost: 0,
    pmpmTarget: 0,
    status: 'Active',
    regionalAvg: 0,
    stateTarget: 0,
    activeEpisodes: 0,
    closedEpisodes: 0,
    episodeTypes: [],
    enrollmentRate: 79,
    completionRate: 71,
    screeningRate: 88,
  },
  {
    id: 'cbo-004',
    name: 'Missouri River Corridor Social Services',
    type: 'CBO',
    programTab: 'CBO',
    county: 'Gregory County',
    region: 'region-central',
    providers: 11,
    patients: 2100,
    gapClosure: 0,
    qualityScore: 0,
    gainShare: '$27K',
    gainShareNum: 27000,
    pmpmCost: 0,
    pmpmTarget: 0,
    status: 'At Risk',
    regionalAvg: 0,
    stateTarget: 0,
    activeEpisodes: 0,
    closedEpisodes: 0,
    episodeTypes: [],
    enrollmentRate: 52,
    completionRate: 44,
    screeningRate: 71,
  },
];

const TYPE_COLORS: Record<string, string> = {
  FQHC: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
  'Rural Hospital': 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
  'PCP Practice': 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
  'Specialist Group': 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  'BH Org': 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]',
  'Crisis Center': 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  CBO: 'bg-[#d9fbfb] text-[#005d5d] border-[#9ef0f0]',
  'Housing Navigator': 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
  'Food Bank': 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
};

const TYPE_DOT: Record<string, string> = {
  FQHC: '#0043ce',
  'Rural Hospital': '#6929c4',
  'PCP Practice': '#24a148',
  'Specialist Group': '#b45309',
  'BH Org': '#9f1853',
  'Crisis Center': '#da1e28',
  CBO: '#005d5d',
  'Housing Navigator': '#24a148',
  'Food Bank': '#b45309',
};

const TAB_CONFIG: Record<
  ProgramTab,
  { color: string; label: string; description: string; icon: string }
> = {
  Clinical: {
    color: '#0043ce',
    label: 'Clinical Network',
    description: 'FQHCs, hospitals, PCP practices — clinical VBC accountability',
    icon: '🏥',
  },
  BH: {
    color: '#9f1853',
    label: 'BH Network',
    description: 'Behavioral health orgs, crisis centers — BH access & quality',
    icon: '🧠',
  },
  CBO: {
    color: '#005d5d',
    label: 'CBO Network',
    description: 'Community orgs, housing navigators, food banks — social program delivery',
    icon: '🤝',
  },
};

function ThreeWayBenchmark({
  value,
  regional,
  state,
  label,
}: {
  value: number;
  regional: number;
  state: number;
  label: string;
}) {
  const max = Math.max(value, regional, state, 100);
  return (
    <div className="space-y-1.5">
      <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
        {label}
      </p>
      {[
        { name: 'This Org', val: value, color: '#0043ce' },
        { name: 'Regional Avg', val: regional, color: '#6929c4' },
        { name: 'Program Target', val: state, color: '#24a148' },
      ].map((b) => (
        <div key={b.name} className="flex items-center gap-2">
          <span className="text-2xs text-carbon-gray-50 w-24 flex-shrink-0">{b.name}</span>
          <div className="flex-1 h-2 bg-carbon-gray-20">
            <div
              className="h-full transition-all"
              style={{ width: `${(b.val / max) * 100}%`, backgroundColor: b.color }}
            />
          </div>
          <span
            className="text-xs font-mono font-semibold w-10 flex-shrink-0"
            style={{ color: b.color }}
          >
            {b.val}%
          </span>
        </div>
      ))}
    </div>
  );
}

function ProgramNetworksContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const regionId = searchParams.get('region') || '';
  const regionName = searchParams.get('regionName') || 'All Regions';

  const [activeTab, setActiveTab] = useState<ProgramTab>('Clinical');
  const [filterType, setFilterType] = useState('All');

  const allProviders = regionId
    ? ALL_PROVIDERS.filter((p) => p.region === regionId)
    : ALL_PROVIDERS;

  const tabProviders = allProviders.filter((p) => p.programTab === activeTab);

  const typeOptions = ['All', ...Array.from(new Set(tabProviders.map((p) => p.type)))];
  const filtered =
    filterType === 'All' ? tabProviders : tabProviders.filter((p) => p.type === filterType);

  // Reset filter when tab changes
  React.useEffect(() => {
    setFilterType('All');
  }, [activeTab]);

  const totalPatients = tabProviders.reduce((a, p) => a + p.patients, 0);
  const avgGapClosure =
    activeTab === 'Clinical'
      ? Math.round(tabProviders.reduce((a, p) => a + p.gapClosure, 0) / (tabProviders.length || 1))
      : 0;
  const avgBhAccess =
    activeTab === 'BH'
      ? Math.round(
          tabProviders.reduce((a, p) => a + (p.bhAccessRate || 0), 0) / (tabProviders.length || 1)
        )
      : 0;
  const avgEnrollment =
    activeTab === 'CBO'
      ? Math.round(
          tabProviders.reduce((a, p) => a + (p.enrollmentRate || 0), 0) / (tabProviders.length || 1)
        )
      : 0;
  const totalGainShare = tabProviders.reduce((a, p) => a + p.gainShareNum, 0);

  const breadcrumbs = regionId
    ? [
        { label: 'RHTP Overview', href: '/contract-program-selection' },
        { label: 'Regions', href: '/region-view' },
        { label: regionName },
      ]
    : [
        { label: 'RHTP Overview', href: '/contract-program-selection' },
        { label: 'Program Networks' },
      ];

  const tabColor = TAB_CONFIG[activeTab].color;

  return (
    <AppLayout
      pageTitle={regionId ? `${regionName} — Program Networks` : 'Program Networks'}
      breadcrumbs={breadcrumbs}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0043ce]">Region: {regionName}</span>
          <span className="text-xs text-[#0043ce]">
            {allProviders.length} Total Participating Organizations
          </span>
          <span className="text-xs text-[#0043ce] font-medium">Clinical · BH · CBO Networks</span>
          <span className="ml-auto text-xs text-carbon-gray-50">Data as of May 29, 2026</span>
        </div>
      }
    >
      {/* Program type tabs */}
      <div className="flex gap-0 border-b border-carbon-gray-20 bg-white px-6">
        {(Object.keys(TAB_CONFIG) as ProgramTab[]).map((tab) => {
          const cfg = TAB_CONFIG[tab];
          const count = allProviders.filter((p) => p.programTab === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors`}
              style={{
                borderBottomColor: activeTab === tab ? cfg.color : 'transparent',
                color: activeTab === tab ? cfg.color : '#6f6f6f',
              }}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
              <span
                className="text-2xs font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: activeTab === tab ? cfg.color : '#e0e0e0',
                  color: activeTab === tab ? '#fff' : '#6f6f6f',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      <div className="px-6 py-2 bg-carbon-gray-10 border-b border-carbon-gray-20">
        <p className="text-xs text-carbon-gray-50">{TAB_CONFIG[activeTab].description}</p>
      </div>

      {/* KPI strip */}
      <div className="bg-white border-b border-carbon-gray-20 grid grid-cols-4 divide-x divide-carbon-gray-20">
        <div className="px-6 py-4">
          <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Attributed Lives</p>
          <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: tabColor }}>
            {totalPatients.toLocaleString()}
          </p>
        </div>
        {activeTab === 'Clinical' && (
          <>
            <div className="px-6 py-4">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                Avg Gap Closure
              </p>
              <p
                className={`text-2xl font-bold font-mono mt-0.5 ${avgGapClosure >= 75 ? 'text-[#24a148]' : avgGapClosure >= 65 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
              >
                {avgGapClosure}%
              </p>
            </div>
            <div className="px-6 py-4">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                Avg Quality Score
              </p>
              <p className="text-2xl font-bold font-mono mt-0.5 text-[#0043ce]">
                {Math.round(
                  tabProviders.reduce((a, p) => a + p.qualityScore, 0) / (tabProviders.length || 1)
                )}
              </p>
            </div>
          </>
        )}
        {activeTab === 'BH' && (
          <>
            <div className="px-6 py-4">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                Avg BH Access Rate
              </p>
              <p
                className={`text-2xl font-bold font-mono mt-0.5 ${avgBhAccess >= 70 ? 'text-[#24a148]' : avgBhAccess >= 55 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
              >
                {avgBhAccess}%
              </p>
            </div>
            <div className="px-6 py-4">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                Avg Screening Rate
              </p>
              <p className="text-2xl font-bold font-mono mt-0.5 text-[#9f1853]">
                {Math.round(
                  tabProviders.reduce((a, p) => a + (p.screeningRate || 0), 0) /
                    (tabProviders.length || 1)
                )}
                %
              </p>
            </div>
          </>
        )}
        {activeTab === 'CBO' && (
          <>
            <div className="px-6 py-4">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                Avg Enrollment Rate
              </p>
              <p
                className={`text-2xl font-bold font-mono mt-0.5 ${avgEnrollment >= 70 ? 'text-[#24a148]' : avgEnrollment >= 55 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
              >
                {avgEnrollment}%
              </p>
            </div>
            <div className="px-6 py-4">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                Avg Completion Rate
              </p>
              <p className="text-2xl font-bold font-mono mt-0.5 text-[#005d5d]">
                {Math.round(
                  tabProviders.reduce((a, p) => a + (p.completionRate || 0), 0) /
                    (tabProviders.length || 1)
                )}
                %
              </p>
            </div>
          </>
        )}
        <div className="px-6 py-4">
          <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
            Total Gain Share YTD
          </p>
          <p className="text-2xl font-bold font-mono mt-0.5 text-[#24a148]">
            ${(totalGainShare / 1000).toFixed(0)}K
          </p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Benchmarking panel — Clinical only */}
        {activeTab === 'Clinical' && (
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="ChartBarIcon" size={15} className="text-[#0043ce]" />
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                Provider Benchmarking — Gap Closure Rate
              </h3>
              <span className="ml-auto text-2xs text-carbon-gray-50">
                This Org / Regional Avg / Program Target
              </span>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 lg:grid-cols-4 gap-6">
              {filtered.slice(0, 4).map((p) => (
                <ThreeWayBenchmark
                  key={p.id}
                  value={p.gapClosure}
                  regional={p.regionalAvg}
                  state={p.stateTarget}
                  label={p.name.split(' ').slice(0, 2).join(' ')}
                />
              ))}
            </div>
          </div>
        )}

        {/* BH benchmarking */}
        {activeTab === 'BH' && (
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="ChartBarIcon" size={15} style={{ color: '#9f1853' }} />
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                BH Network Benchmarking — Access Rate
              </h3>
              <span className="ml-auto text-2xs text-carbon-gray-50">
                BH Access Rate / Screening Rate / Program Target (70%)
              </span>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 lg:grid-cols-4 gap-6">
              {filtered.slice(0, 4).map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
                    {p.name.split(' ').slice(0, 2).join(' ')}
                  </p>
                  {[
                    { name: 'BH Access', val: p.bhAccessRate || 0, color: '#9f1853' },
                    { name: 'Screening', val: p.screeningRate || 0, color: '#6929c4' },
                    { name: 'Target', val: 70, color: '#24a148' },
                  ].map((b) => (
                    <div key={b.name} className="flex items-center gap-2">
                      <span className="text-2xs text-carbon-gray-50 w-20 flex-shrink-0">
                        {b.name}
                      </span>
                      <div className="flex-1 h-2 bg-carbon-gray-20">
                        <div
                          className="h-full"
                          style={{ width: `${b.val}%`, backgroundColor: b.color }}
                        />
                      </div>
                      <span
                        className="text-xs font-mono font-semibold w-10 flex-shrink-0"
                        style={{ color: b.color }}
                      >
                        {b.val}%
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CBO benchmarking */}
        {activeTab === 'CBO' && (
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="ChartBarIcon" size={15} style={{ color: '#005d5d' }} />
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                CBO Network Benchmarking — Enrollment & Completion
              </h3>
              <span className="ml-auto text-2xs text-carbon-gray-50">
                Enrollment Rate / Completion Rate / Screening Rate
              </span>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 lg:grid-cols-4 gap-6">
              {filtered.slice(0, 4).map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
                    {p.name.split(' ').slice(0, 2).join(' ')}
                  </p>
                  {[
                    { name: 'Enrollment', val: p.enrollmentRate || 0, color: '#005d5d' },
                    { name: 'Completion', val: p.completionRate || 0, color: '#0043ce' },
                    { name: 'Screening', val: p.screeningRate || 0, color: '#24a148' },
                  ].map((b) => (
                    <div key={b.name} className="flex items-center gap-2">
                      <span className="text-2xs text-carbon-gray-50 w-20 flex-shrink-0">
                        {b.name}
                      </span>
                      <div className="flex-1 h-2 bg-carbon-gray-20">
                        <div
                          className="h-full"
                          style={{ width: `${b.val}%`, backgroundColor: b.color }}
                        />
                      </div>
                      <span
                        className="text-xs font-mono font-semibold w-10 flex-shrink-0"
                        style={{ color: b.color }}
                      >
                        {b.val}%
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-2">
            Filter by Type
          </span>
          {typeOptions.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1 text-xs font-medium border transition-colors ${
                filterType === t
                  ? 'text-white border-transparent'
                  : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
              }`}
              style={filterType === t ? { backgroundColor: tabColor } : {}}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Organization table */}
        <div className="bg-white border border-carbon-gray-20 overflow-x-auto">
          <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
            <p className="text-sm font-semibold text-carbon-gray-100">
              {filtered.length} Organization{filtered.length !== 1 ? 's' : ''}
            </p>
            <p className="text-2xs text-carbon-gray-50">
              {activeTab === 'Clinical'
                ? 'Click a row to view care team members at this organization'
                : activeTab === 'BH'
                  ? 'Click a row to view BH counselors and supervisors'
                  : 'Click a row to view CHW supervisors and program staff'}
            </p>
          </div>
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Organization
                </th>
                <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Patients
                </th>
                {activeTab === 'Clinical' && (
                  <>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      Gap Closure
                    </th>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      Quality Score
                    </th>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      vs Regional
                    </th>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      vs Target
                    </th>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      Screening Rate
                    </th>
                  </>
                )}
                {activeTab === 'BH' && (
                  <>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      BH Access Rate
                    </th>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      Screening Rate
                    </th>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      Episodes
                    </th>
                  </>
                )}
                {activeTab === 'CBO' && (
                  <>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      Enrollment Rate
                    </th>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      Completion Rate
                    </th>
                    <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                      Screening Rate
                    </th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Gain Share
                </th>
                <th className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {filtered.map((prov) => {
                const vsRegional = prov.gapClosure - prov.regionalAvg;
                const vsState = prov.gapClosure - prov.stateTarget;
                return (
                  <tr
                    key={prov.id}
                    className="hover:bg-[#edf5ff] transition-colors cursor-pointer group"
                    onClick={() =>
                      router.push(
                        `/physician-view?provider=${prov.id}&providerName=${encodeURIComponent(prov.name)}&region=${regionId}&regionName=${encodeURIComponent(regionName)}`
                      )
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TYPE_DOT[prov.type] || '#6f6f6f' }}
                        />
                        <div>
                          <p className="font-medium text-carbon-gray-100 group-hover:text-[#0043ce] whitespace-nowrap">
                            {prov.name}
                          </p>
                          <p className="text-2xs text-carbon-gray-50">
                            {prov.county} · {prov.providers} staff
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 border ${TYPE_COLORS[prov.type] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
                      >
                        {prov.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm tabular-nums">
                        {prov.patients.toLocaleString()}
                      </span>
                    </td>
                    {activeTab === 'Clinical' && (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-carbon-gray-20">
                              <div
                                className="h-full"
                                style={{
                                  width: `${prov.gapClosure}%`,
                                  backgroundColor:
                                    prov.gapClosure >= 75
                                      ? '#24a148'
                                      : prov.gapClosure >= 65
                                        ? '#0043ce'
                                        : '#b45309',
                                }}
                              />
                            </div>
                            <span
                              className={`text-xs font-mono font-semibold ${prov.gapClosure >= 75 ? 'text-[#24a148]' : prov.gapClosure >= 65 ? 'text-[#0043ce]' : 'text-[#b45309]'}`}
                            >
                              {prov.gapClosure}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-mono text-sm tabular-nums ${prov.qualityScore >= 80 ? 'text-[#24a148]' : prov.qualityScore >= 70 ? 'text-[#0043ce]' : 'text-[#b45309]'}`}
                          >
                            {prov.qualityScore}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-mono font-semibold ${vsRegional >= 0 ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                          >
                            {vsRegional >= 0 ? '+' : ''}
                            {vsRegional}pp
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-mono font-semibold ${vsState >= 0 ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                          >
                            {vsState >= 0 ? '+' : ''}
                            {vsState}pp
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-carbon-gray-70">
                            {prov.screeningRate}%
                          </span>
                        </td>
                      </>
                    )}
                    {activeTab === 'BH' && (
                      <>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-mono font-semibold ${(prov.bhAccessRate || 0) >= 70 ? 'text-[#24a148]' : (prov.bhAccessRate || 0) >= 55 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                          >
                            {prov.bhAccessRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-carbon-gray-70">
                            {prov.screeningRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-carbon-gray-100">
                            {prov.activeEpisodes} active
                          </span>
                        </td>
                      </>
                    )}
                    {activeTab === 'CBO' && (
                      <>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-mono font-semibold ${(prov.enrollmentRate || 0) >= 70 ? 'text-[#24a148]' : (prov.enrollmentRate || 0) >= 55 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                          >
                            {prov.enrollmentRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-mono font-semibold ${(prov.completionRate || 0) >= 65 ? 'text-[#24a148]' : 'text-[#b45309]'}`}
                          >
                            {prov.completionRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-carbon-gray-70">
                            {prov.screeningRate}%
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-[#24a148]">{prov.gainShare}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 ${prov.status === 'Active' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fdf6dd] text-[#b45309]'}`}
                      >
                        {prov.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

export default function ProgramNetworksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-carbon-gray-50 text-sm">
          Loading program networks...
        </div>
      }
    >
      <ProgramNetworksContent />
    </Suspense>
  );
}
