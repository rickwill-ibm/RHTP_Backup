'use client';
import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientById } from '@/lib/patientRegistry';

// ─── ETG Constants ────────────────────────────────────────────────────────────

const ETG_COLORS = {
  Inpatient: '#da1e28',
  Outpatient: '#0043ce',
  Ancillary: '#8a3ffc',
  Pharmacy: '#009d9a',
  Emergency: '#f1c21b',
};

const ETG_EPISODE_TYPES: Record<
  number,
  { label: string; description: string; start: string; finish: string; duration: string }
> = {
  0: {
    label: 'Type 0',
    description: 'Complete Episode',
    start: 'Clean',
    finish: 'Clean',
    duration: '—',
  },
  1: {
    label: 'Type 1',
    description: 'Full Year — clean start, unknown finish',
    start: 'Clean',
    finish: 'Unknown',
    duration: 'Full Year',
  },
  2: {
    label: 'Type 2',
    description: 'Full Year — unknown start, clean finish',
    start: 'Unknown',
    finish: 'Clean',
    duration: 'Full Year',
  },
  3: {
    label: 'Type 3',
    description: 'Full Year — unknown start & finish',
    start: 'Unknown',
    finish: 'Unknown',
    duration: 'Full Year',
  },
  4: {
    label: 'Type 4',
    description: 'Incomplete — clean start, <1 year',
    start: 'Clean',
    finish: 'Unknown',
    duration: 'Incomplete',
  },
  5: {
    label: 'Type 5',
    description: 'Incomplete — clean finish, <1 year',
    start: 'Unknown',
    finish: 'Clean',
    duration: 'Incomplete',
  },
  6: {
    label: 'Type 6',
    description: 'Incomplete — no clean start or finish',
    start: 'Unknown',
    finish: 'Unknown',
    duration: 'Incomplete',
  },
};

// ─── Mock Episode Data ────────────────────────────────────────────────────────

interface ClinicalEvent {
  seq: number;
  setting: string;
  settingColor: string;
  description: string;
  diagnosis: string;
  provider: string;
  facility: string;
  cost: number;
  date: string;
  claimType: string;
}

interface ETGCostData {
  setting: string;
  actual: number;
  benchmark: number;
  peer: number;
  color: string;
}

interface CaseMixMetric {
  label: string;
  actual: string | number;
  benchmark: string | number;
  flag?: boolean;
}

interface EpisodeDetailData {
  id: string;
  type: string;
  status: 'Active' | 'Closed';
  patientName: string;
  mrn: string;
  age: number;
  gender: string;
  careManager: string;
  totalCost: number;
  targetCost: number;
  variancePct: number;
  varianceAmt: number;
  duration: number;
  utilizationScore: number;
  startDate: string;
  endDate: string | null;
  etgTypeCode: number;
  timeline: { setting: string; date: string; color: string; dotColor: string }[];
  costByCareSetting: { setting: string; cost: number; pct: number; color: string }[];
  etgCostData: ETGCostData[];
  caseMixMetrics: CaseMixMetric[];
  quality: {
    complications: boolean;
    readmission30d: boolean;
    satisfaction: number;
    carePlanAdherence: number;
  };
  clinicalEvents: ClinicalEvent[];
}

const EPISODE_DATA: Record<string, EpisodeDetailData> = {
  'ep-001': {
    id: 'ep-001',
    type: 'CHF Exacerbation',
    status: 'Active',
    patientName: 'Margaret Okonkwo',
    mrn: 'MRN-204817',
    age: 78,
    gender: 'F',
    careManager: 'Linda Marsh',
    totalCost: 32650,
    targetCost: 28000,
    variancePct: 16.6,
    varianceAmt: 4650,
    duration: 90,
    utilizationScore: 72,
    startDate: '2026-03-14',
    endDate: '2026-06-12',
    etgTypeCode: 0,
    timeline: [
      { setting: 'Inpatient', date: 'Mar 14', color: '#0043ce', dotColor: '#0043ce' },
      { setting: 'SNF', date: 'Mar 19', color: '#6929c4', dotColor: '#6929c4' },
      { setting: 'Home Health', date: 'Apr 2', color: '#24a148', dotColor: '#24a148' },
      { setting: 'Outpatient', date: 'May 14', color: '#24a148', dotColor: '#24a148' },
    ],
    costByCareSetting: [
      { setting: 'Inpatient', cost: 18500, pct: 56.7, color: '#0043ce' },
      { setting: 'SNF', cost: 8200, pct: 25.1, color: '#6929c4' },
      { setting: 'Home Health', cost: 3100, pct: 9.5, color: '#24a148' },
      { setting: 'ER', cost: 2400, pct: 7.4, color: '#da1e28' },
      { setting: 'Outpatient', cost: 450, pct: 1.4, color: '#24a148' },
    ],
    etgCostData: [
      {
        setting: 'Inpatient',
        actual: 18500,
        benchmark: 14200,
        peer: 15800,
        color: ETG_COLORS.Inpatient,
      },
      {
        setting: 'Outpatient',
        actual: 450,
        benchmark: 2100,
        peer: 1800,
        color: ETG_COLORS.Outpatient,
      },
      {
        setting: 'Ancillary',
        actual: 3100,
        benchmark: 3800,
        peer: 3500,
        color: ETG_COLORS.Ancillary,
      },
      {
        setting: 'Pharmacy',
        actual: 1800,
        benchmark: 2200,
        peer: 2000,
        color: ETG_COLORS.Pharmacy,
      },
      {
        setting: 'Emergency',
        actual: 2400,
        benchmark: 1000,
        peer: 1200,
        color: ETG_COLORS.Emergency,
      },
    ],
    caseMixMetrics: [
      { label: 'Episode Duration', actual: '90 days', benchmark: '75 days', flag: true },
      { label: 'Hospitalization', actual: 'Yes', benchmark: '62% of episodes', flag: false },
      { label: 'Readmission (30d)', actual: 'No', benchmark: '12% rate', flag: false },
      { label: 'Hospital Days', actual: 5, benchmark: 4.2, flag: true },
      { label: 'Allowed Amount', actual: '$32,650', benchmark: '$28,000', flag: true },
      { label: 'Paid Amount', actual: '$29,800', benchmark: '$26,500', flag: true },
    ],
    quality: {
      complications: false,
      readmission30d: false,
      satisfaction: 4.5,
      carePlanAdherence: 85,
    },
    clinicalEvents: [
      {
        seq: 1,
        setting: 'ER',
        settingColor: '#da1e28',
        description: 'Emergency Department',
        diagnosis: 'CHF exacerbation, SOB, edema',
        provider: 'Dr. Emergency',
        facility: 'County Hospital ER',
        cost: 2400,
        date: 'Mar 14, 2026',
        claimType: 'Facility',
      },
      {
        seq: 2,
        setting: 'Inpatient',
        settingColor: '#0043ce',
        description: 'Inpatient Admission',
        diagnosis: 'CHF exacerbation — IV diuresis, monitoring',
        provider: 'Dr. Sarah Okonkwo',
        facility: 'County Hospital',
        cost: 18500,
        date: 'Mar 14, 2026',
        claimType: 'Facility',
      },
      {
        seq: 3,
        setting: 'SNF',
        settingColor: '#6929c4',
        description: 'Skilled Nursing Facility',
        diagnosis: 'Post-acute rehab — cardiac rehab protocol',
        provider: 'SNF Care Team',
        facility: 'Riverside SNF',
        cost: 8200,
        date: 'Mar 19, 2026',
        claimType: 'Facility',
      },
      {
        seq: 4,
        setting: 'Home Health',
        settingColor: '#24a148',
        description: 'Home Health Agency',
        diagnosis: 'Wound care, medication management, PT/OT',
        provider: 'Home Health RN',
        facility: 'Rural Home Health',
        cost: 3100,
        date: 'Apr 2, 2026',
        claimType: 'Facility',
      },
      {
        seq: 5,
        setting: 'Outpatient',
        settingColor: '#24a148',
        description: 'Follow-up Office Visit',
        diagnosis: 'CHF follow-up — stable, medication adjustment',
        provider: 'Dr. Sarah Okonkwo',
        facility: 'FQHC Clinic',
        cost: 450,
        date: 'May 14, 2026',
        claimType: 'Professional',
      },
    ],
  },
};

const DEFAULT_EPISODE: EpisodeDetailData = {
  id: 'ep-default',
  type: 'Episode of Care',
  status: 'Active',
  patientName: 'Patient',
  mrn: 'MRN-000000',
  age: 70,
  gender: 'F',
  careManager: 'Angela Torres',
  totalCost: 22000,
  targetCost: 20000,
  variancePct: 10.0,
  varianceAmt: 2000,
  duration: 60,
  utilizationScore: 75,
  startDate: '2026-04-01',
  endDate: null,
  etgTypeCode: 4,
  timeline: [
    { setting: 'Inpatient', date: 'Apr 1', color: '#0043ce', dotColor: '#0043ce' },
    { setting: 'Home Health', date: 'Apr 10', color: '#24a148', dotColor: '#24a148' },
    { setting: 'Outpatient', date: 'May 1', color: '#24a148', dotColor: '#24a148' },
  ],
  costByCareSetting: [
    { setting: 'Inpatient', cost: 14000, pct: 63.6, color: '#0043ce' },
    { setting: 'Home Health', cost: 5000, pct: 22.7, color: '#24a148' },
    { setting: 'Outpatient', cost: 3000, pct: 13.6, color: '#24a148' },
  ],
  etgCostData: [
    {
      setting: 'Inpatient',
      actual: 14000,
      benchmark: 12000,
      peer: 13000,
      color: ETG_COLORS.Inpatient,
    },
    {
      setting: 'Outpatient',
      actual: 3000,
      benchmark: 2500,
      peer: 2800,
      color: ETG_COLORS.Outpatient,
    },
    {
      setting: 'Ancillary',
      actual: 5000,
      benchmark: 4200,
      peer: 4600,
      color: ETG_COLORS.Ancillary,
    },
    { setting: 'Pharmacy', actual: 0, benchmark: 800, peer: 600, color: ETG_COLORS.Pharmacy },
    { setting: 'Emergency', actual: 0, benchmark: 500, peer: 400, color: ETG_COLORS.Emergency },
  ],
  caseMixMetrics: [
    { label: 'Episode Duration', actual: '60 days', benchmark: '55 days', flag: true },
    { label: 'Hospitalization', actual: 'Yes', benchmark: '58% of episodes', flag: false },
    { label: 'Readmission (30d)', actual: 'No', benchmark: '10% rate', flag: false },
    { label: 'Hospital Days', actual: 4, benchmark: 3.8, flag: false },
    { label: 'Allowed Amount', actual: '$22,000', benchmark: '$20,000', flag: true },
    { label: 'Paid Amount', actual: '$20,500', benchmark: '$19,000', flag: true },
  ],
  quality: {
    complications: false,
    readmission30d: false,
    satisfaction: 4.2,
    carePlanAdherence: 80,
  },
  clinicalEvents: [
    {
      seq: 1,
      setting: 'Inpatient',
      settingColor: '#0043ce',
      description: 'Inpatient Admission',
      diagnosis: 'Acute care episode',
      provider: 'Attending Physician',
      facility: 'County Hospital',
      cost: 14000,
      date: 'Apr 1, 2026',
      claimType: 'Facility',
    },
    {
      seq: 2,
      setting: 'Home Health',
      settingColor: '#24a148',
      description: 'Home Health',
      diagnosis: 'Post-acute care',
      provider: 'Home Health RN',
      facility: 'Rural Home Health',
      cost: 5000,
      date: 'Apr 10, 2026',
      claimType: 'Facility',
    },
    {
      seq: 3,
      setting: 'Outpatient',
      settingColor: '#24a148',
      description: 'Follow-up Visit',
      diagnosis: 'Routine follow-up',
      provider: 'Primary Care',
      facility: 'FQHC Clinic',
      cost: 3000,
      date: 'May 1, 2026',
      claimType: 'Professional',
    },
  ],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  icon,
  overTarget,
}: {
  label: string;
  value: string;
  sub: string;
  icon: string;
  overTarget?: boolean;
}) {
  return (
    <div className="bg-white border border-carbon-gray-20 px-5 py-4">
      <div className="flex items-start justify-between">
        <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
          {label}
        </p>
        <Icon name={icon as any} size={16} className="text-carbon-gray-30" />
      </div>
      <p
        className={`text-3xl font-bold font-mono mt-2 ${overTarget === true ? 'text-[#da1e28]' : overTarget === false ? 'text-[#24a148]' : 'text-carbon-gray-100'}`}
      >
        {value}
      </p>
      <p className="text-2xs text-carbon-gray-50 mt-1">{sub}</p>
    </div>
  );
}

// Custom tooltip for the stacked bar chart
function ETGBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-carbon-gray-100 text-white text-xs p-3 shadow-lg rounded-sm min-w-[160px]">
      <p className="font-semibold mb-2 text-carbon-gray-10">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center justify-between gap-3 mb-0.5">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: entry.fill || entry.color }}
            />
            <span className="text-carbon-gray-30">{entry.name}</span>
          </div>
          <span className="font-mono font-semibold">${Number(entry.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function ETGCostAnalysisTab({ ep }: { ep: EpisodeDetailData }) {
  const etgInfo = ETG_EPISODE_TYPES[ep.etgTypeCode] || ETG_EPISODE_TYPES[0];

  // Build chart data: one row per setting with actual/benchmark/peer
  const chartData = ep.etgCostData.map((d) => ({
    setting: d.setting,
    'This Episode': d.actual,
    'ETG Benchmark': d.benchmark,
    'Peer Average': d.peer,
  }));

  // Cost driver callouts: settings where actual > benchmark by >20%
  const costDrivers = ep.etgCostData.filter((d) => d.benchmark > 0 && d.actual / d.benchmark > 1.2);

  return (
    <div className="space-y-5">
      {/* Episode Type Classification */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              ETG Episode Type Classification
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-[#8a3ffc] text-white text-sm font-bold px-3 py-1.5 rounded-sm">
                <Icon name="TagIcon" size={14} />
                {etgInfo.label}
              </span>
              <div>
                <p className="text-sm font-semibold text-carbon-gray-100">{etgInfo.description}</p>
                <p className="text-2xs text-carbon-gray-50 mt-0.5">
                  Start: <span className="font-medium text-carbon-gray-70">{etgInfo.start}</span>
                  <span className="mx-2">·</span>
                  Finish: <span className="font-medium text-carbon-gray-70">{etgInfo.finish}</span>
                  {etgInfo.duration !== '—' && (
                    <>
                      <span className="mx-2">·</span>
                      Duration:{' '}
                      <span className="font-medium text-carbon-gray-70">{etgInfo.duration}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-2xs">
            {[
              { label: 'This Episode', color: '#0043ce' },
              { label: 'ETG Benchmark', color: '#24a148' },
              { label: 'Peer Average', color: '#b45309' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
                <span className="text-carbon-gray-70">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cost Driver Callouts */}
      {costDrivers.length > 0 && (
        <div className="space-y-2">
          {costDrivers.map((driver) => {
            const ratio = (driver.actual / driver.benchmark).toFixed(1);
            return (
              <div
                key={driver.setting}
                className="bg-[#fff1f1] border border-[#ffb3b8] px-4 py-3 flex items-center gap-3"
              >
                <Icon
                  name="ExclamationTriangleIcon"
                  size={16}
                  className="text-[#da1e28] flex-shrink-0"
                />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-[#da1e28]">
                    {driver.setting} cost {ratio}× ETG benchmark
                  </span>
                  <span className="text-xs text-carbon-gray-70 ml-2">
                    Actual: ${driver.actual.toLocaleString()} vs Benchmark: $
                    {driver.benchmark.toLocaleString()} (+$
                    {(driver.actual - driver.benchmark).toLocaleString()})
                  </span>
                </div>
                <span className="text-2xs font-semibold bg-[#da1e28] text-white px-2 py-0.5 rounded-sm">
                  Cost Driver
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Three-column stacked bar comparison */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1">
          Cost Comparison by Care Setting
        </h3>
        <p className="text-2xs text-carbon-gray-50 mb-4">
          This episode vs ETG benchmark vs peer average — grouped by care setting
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              barCategoryGap="25%"
              barGap={2}
            >
              <XAxis dataKey="setting" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ETGBarTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="This Episode" fill="#0043ce" radius={[2, 2, 0, 0]} />
              <Bar dataKey="ETG Benchmark" fill="#24a148" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Peer Average" fill="#b45309" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Case-Mix Metrics */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-5 py-4 border-b border-carbon-gray-20">
          <h3 className="text-sm font-semibold text-carbon-gray-100">Case-Mix Metrics</h3>
          <p className="text-2xs text-carbon-gray-50 mt-0.5">
            Episode characteristics vs ETG benchmark for this episode type
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-carbon-gray-20">
          {ep.caseMixMetrics.map((metric) => (
            <div key={metric.label} className="px-5 py-4">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-1">
                {metric.label}
              </p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className={`text-lg font-bold font-mono ${metric.flag ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                >
                  {metric.actual}
                </span>
                {metric.flag && <Icon name="ArrowUpIcon" size={12} className="text-[#da1e28]" />}
              </div>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">
                Benchmark:{' '}
                <span className="font-medium text-carbon-gray-70">{metric.benchmark}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type EpisodeTab = 'overview' | 'etg-cost-analysis';

function EpisodeDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const episodeId = searchParams.get('episodeId') || '';
  const patientNameParam = searchParams.get('patientName') || '';
  const mrn = searchParams.get('mrn') || '';
  const episodeTypeParam = searchParams.get('episodeType') || '';

  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const activePatient = getPatientById(activePatientId);

  const ep = EPISODE_DATA[episodeId] || {
    ...DEFAULT_EPISODE,
    patientName: patientNameParam || DEFAULT_EPISODE.patientName,
    mrn: mrn || DEFAULT_EPISODE.mrn,
    type: episodeTypeParam || DEFAULT_EPISODE.type,
  };

  // Override patient identity fields from registry if available
  const displayName = activePatient?.name || ep.patientName;
  const displayMrn = activePatient?.ehrMrn || ep.mrn;
  const displayAge = activePatient?.age || ep.age;
  const displayGender = activePatient?.gender || ep.gender;
  const displayLocation = activePatient?.location || '';
  const displayPcp = activePatient?.pcp || '';
  const displayCareManager = activePatient?.careManager || ep.careManager;

  const [activeTab, setActiveTab] = useState<EpisodeTab>('overview');

  const overTarget = ep.variancePct > 0;
  const costPct = Math.min((ep.totalCost / ep.targetCost) * 100, 150);

  const breadcrumbs = [
    { label: 'RHTP Overview', href: '/contract-program-selection' },
    { label: 'Panel & Cohort', href: '/panel-cohort-view' },
    { label: displayName, href: '/patient-detail' },
    {
      label: 'Episodes',
      href: `/patient-episode-summary?patientId=${activePatientId}&patientName=${encodeURIComponent(displayName)}&mrn=${displayMrn}`,
    },
    { label: ep.type },
  ];

  const tabs: { key: EpisodeTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Episode Overview', icon: 'ClipboardDocumentListIcon' },
    { key: 'etg-cost-analysis', label: 'ETG Cost Analysis', icon: 'ChartBarIcon' },
  ];

  return (
    <AppLayout pageTitle="Episode Detail" breadcrumbs={breadcrumbs}>
      {/* Episode Header */}
      <div className="bg-white border-b border-carbon-gray-20 px-6 py-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-carbon-gray-100">{ep.type}</h2>
              <StatusBadge
                label={ep.status}
                variant={ep.status === 'Active' ? 'warning' : 'success'}
                size="sm"
              />
            </div>
            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
              <button
                onClick={() => router.push('/patient-detail')}
                className="flex items-center gap-1 text-xs font-semibold text-[#0043ce] hover:underline"
              >
                <Icon name="UserIcon" size={13} />
                {displayName}
                <Icon name="ArrowTopRightOnSquareIcon" size={11} className="ml-0.5 opacity-70" />
              </button>
              <span className="flex items-center gap-1 text-xs text-carbon-gray-70 font-mono">
                <Icon name="IdentificationIcon" size={13} /> {displayMrn}
              </span>
              <span className="flex items-center gap-1 text-xs text-carbon-gray-70">
                <Icon name="CalendarIcon" size={13} /> {displayAge}y {displayGender}
              </span>
              {displayLocation && (
                <span className="flex items-center gap-1 text-xs text-carbon-gray-70">
                  <Icon name="MapPinIcon" size={13} /> {displayLocation}
                </span>
              )}
              {displayPcp && (
                <span className="flex items-center gap-1 text-xs text-carbon-gray-70">
                  <Icon name="BuildingOfficeIcon" size={13} /> {displayPcp}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xs text-carbon-gray-50">Care Manager</p>
            <p className="text-sm font-semibold text-carbon-gray-100">{displayCareManager}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Four KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            label="Total Cost"
            value={`$${ep.totalCost.toLocaleString()}`}
            sub={`Target: $${ep.targetCost.toLocaleString()}`}
            icon="CurrencyDollarIcon"
            overTarget={overTarget}
          />
          <KPICard
            label="Cost Variance"
            value={`${overTarget ? '+' : ''}${ep.variancePct.toFixed(1)}%`}
            sub={`$${ep.varianceAmt.toLocaleString()} ${overTarget ? 'over' : 'under'}`}
            icon="ArrowTrendingUpIcon"
            overTarget={overTarget}
          />
          <KPICard label="Duration" value={`${ep.duration}`} sub="days" icon="ClockIcon" />
          <KPICard
            label="Utilization Score"
            value={`${ep.utilizationScore}`}
            sub="out of 100"
            icon="ChartBarIcon"
          />
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-carbon-gray-20">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-[#0043ce] text-[#0043ce]'
                  : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100'
              }`}
            >
              <Icon name={tab.icon as any} size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Episode Timeline */}
            <div className="bg-white border border-carbon-gray-20 px-6 py-5">
              <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4">Episode Timeline</h3>
              <div className="flex items-center justify-between text-xs text-carbon-gray-50 mb-3">
                <div>
                  <p className="text-2xs text-carbon-gray-50">Episode Start</p>
                  <p className="text-sm font-semibold text-carbon-gray-100">
                    {new Date(ep.startDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xs text-carbon-gray-50">Duration</p>
                  <p className="text-sm font-semibold text-carbon-gray-100">{ep.duration} days</p>
                </div>
                <div className="text-right">
                  <p className="text-2xs text-carbon-gray-50">Episode End</p>
                  <p className="text-sm font-semibold text-carbon-gray-100">
                    {ep.endDate
                      ? new Date(ep.endDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })
                      : 'Ongoing'}
                  </p>
                </div>
              </div>
              {/* Timeline bar */}
              <div className="relative mt-2 mb-6">
                <div className="h-1 bg-[#0043ce] w-full" />
                <div className="flex justify-between mt-1">
                  {ep.timeline.map((t, i) => (
                    <div
                      key={t.setting}
                      className="flex flex-col items-center"
                      style={{ width: `${100 / ep.timeline.length}%` }}
                    >
                      <div
                        className="w-3 h-3 rounded-full border-2 border-white -mt-2.5"
                        style={{ backgroundColor: t.dotColor }}
                      />
                      <p className="text-2xs font-semibold text-carbon-gray-100 mt-1 whitespace-nowrap">
                        {t.setting}
                      </p>
                      <p className="text-2xs text-carbon-gray-50">{t.date}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost Accumulation Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-carbon-gray-70">Cost Accumulation</p>
                  <p className="text-xs font-mono font-semibold text-carbon-gray-100">
                    ${ep.totalCost.toLocaleString()} / ${ep.targetCost.toLocaleString()}
                  </p>
                </div>
                <div className="h-8 bg-carbon-gray-20 w-full relative overflow-hidden">
                  <div
                    className={`h-full flex items-center justify-center text-white text-xs font-bold transition-all ${overTarget ? 'bg-gradient-to-r from-[#da1e28] via-[#0043ce] to-[#6929c4]' : 'bg-[#0043ce]'}`}
                    style={{ width: `${Math.min(costPct, 100)}%` }}
                  >
                    {costPct.toFixed(0)}% of target
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-2xs text-carbon-gray-50">Variance from target:</p>
                  <p
                    className={`text-2xs font-semibold font-mono ${overTarget ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                  >
                    {overTarget ? '+' : ''}
                    {ep.variancePct.toFixed(1)}% (${ep.varianceAmt.toLocaleString()})
                  </p>
                </div>
              </div>

              {/* Care Settings Legend */}
              <div className="mt-4 pt-4 border-t border-carbon-gray-20">
                <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
                  CARE SETTINGS
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'ER', color: '#da1e28' },
                    { label: 'Inpatient', color: '#0043ce' },
                    { label: 'SNF', color: '#6929c4' },
                    { label: 'Home Health', color: '#24a148' },
                    { label: 'Outpatient', color: '#24a148' },
                    { label: 'Procedure', color: '#6929c4' },
                    { label: 'Lab', color: '#0043ce' },
                    { label: 'Medication', color: '#24a148' },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-2xs text-carbon-gray-70">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cost by Care Setting + Quality Metrics */}
            <div className="grid grid-cols-2 gap-4">
              {/* Cost by Care Setting */}
              <div className="bg-white border border-carbon-gray-20 px-5 py-4">
                <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4">
                  Cost by Care Setting
                </h3>
                <div className="space-y-3">
                  {ep.costByCareSetting.map((cs) => (
                    <div key={cs.setting}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cs.color }}
                          />
                          <span className="text-sm text-carbon-gray-100">{cs.setting}</span>
                        </div>
                        <span className="text-sm font-semibold font-mono text-carbon-gray-100">
                          ${cs.cost.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 bg-carbon-gray-20 w-full">
                        <div
                          className="h-full"
                          style={{ width: `${cs.pct}%`, backgroundColor: cs.color }}
                        />
                      </div>
                      <p className="text-2xs text-carbon-gray-50 mt-0.5">
                        {cs.pct.toFixed(1)}% of total
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality Metrics */}
              <div className="bg-white border border-carbon-gray-20 px-5 py-4">
                <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4">Quality Metrics</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-carbon-gray-10 px-4 py-3">
                    <span className="text-sm text-carbon-gray-100">Complications</span>
                    <span
                      className={`text-sm font-semibold ${ep.quality.complications ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                    >
                      {ep.quality.complications ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-carbon-gray-10 px-4 py-3">
                    <span className="text-sm text-carbon-gray-100">30-Day Readmission</span>
                    <span
                      className={`text-sm font-semibold ${ep.quality.readmission30d ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                    >
                      {ep.quality.readmission30d ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-carbon-gray-100">Patient Satisfaction</span>
                      <span className="text-sm font-semibold text-carbon-gray-100">
                        {ep.quality.satisfaction}/5.0
                      </span>
                    </div>
                    <div className="h-2 bg-carbon-gray-20 w-full">
                      <div
                        className="h-full bg-[#0043ce]"
                        style={{ width: `${(ep.quality.satisfaction / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-carbon-gray-100">Care Plan Adherence</span>
                      <span className="text-sm font-semibold text-carbon-gray-100">
                        {ep.quality.carePlanAdherence}%
                      </span>
                    </div>
                    <div className="h-2 bg-carbon-gray-20 w-full">
                      <div
                        className="h-full bg-[#24a148]"
                        style={{ width: `${ep.quality.carePlanAdherence}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Clinical Events */}
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-5 py-4 border-b border-carbon-gray-20">
                <h3 className="text-sm font-semibold text-carbon-gray-100">Clinical Events</h3>
              </div>
              <div className="divide-y divide-carbon-gray-20">
                {ep.clinicalEvents.map((evt) => (
                  <div
                    key={evt.seq}
                    className="px-5 py-4 flex items-start gap-4 hover:bg-[#f4f4f4] transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                      style={{ backgroundColor: evt.settingColor }}
                    >
                      {evt.seq}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-carbon-gray-100">{evt.setting}</p>
                        <span className="text-2xs text-carbon-gray-50">— {evt.description}</span>
                      </div>
                      <p className="text-xs text-carbon-gray-70 mt-0.5">{evt.diagnosis}</p>
                      <p className="text-2xs text-carbon-gray-50 mt-0.5">
                        Provider: {evt.provider} · Facility: {evt.facility}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold font-mono text-carbon-gray-100">
                        ${evt.cost.toLocaleString()}
                      </p>
                      <p className="text-2xs text-carbon-gray-50">{evt.date}</p>
                      <span className="text-2xs text-carbon-gray-50">{evt.claimType}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* FHIR Encounters — live from HAPI FHIR when in Live mode */}
            {activePatient?.recentEncounters && activePatient.recentEncounters.length > 0 && (
              <div className="bg-white border border-[#a7f0ba]">
                <div className="px-5 py-3 border-b border-[#a7f0ba] bg-[#defbe6] flex items-center gap-2">
                  <Icon name="ServerIcon" size={14} className="text-[#198038]" />
                  <h3 className="text-sm font-semibold text-[#0e6027]">
                    FHIR Encounters ({activePatient.recentEncounters.length})
                  </h3>
                  <span className="ml-auto text-2xs text-[#0e6027] font-mono">
                    Live · HAPI FHIR R4
                  </span>
                </div>
                <div className="divide-y divide-carbon-gray-10">
                  {activePatient.recentEncounters.map((enc) => (
                    <div key={enc.id} className="px-5 py-3 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-carbon-gray-100">
                            {enc.type}
                          </span>
                          <span className="text-2xs px-1.5 py-0.5 bg-[#d0e2ff] text-[#0043ce]">
                            {enc.setting}
                          </span>
                          <span className="text-2xs font-mono text-carbon-gray-30">{enc.date}</span>
                        </div>
                        {enc.provider && (
                          <p className="text-xs text-carbon-gray-50 mt-0.5">
                            Provider: {enc.provider}
                          </p>
                        )}
                        {enc.reason && <p className="text-xs text-carbon-gray-50">{enc.reason}</p>}
                      </div>
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 flex-shrink-0 ${enc.status === 'finished' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fdf6dd] text-[#b45309]'}`}
                      >
                        {enc.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ETG Cost Analysis Tab */}
        {activeTab === 'etg-cost-analysis' && <ETGCostAnalysisTab ep={ep} />}
      </div>
    </AppLayout>
  );
}

export default function EpisodeDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-carbon-gray-50 text-sm">
          Loading episode...
        </div>
      }
    >
      <EpisodeDetailContent />
    </Suspense>
  );
}
