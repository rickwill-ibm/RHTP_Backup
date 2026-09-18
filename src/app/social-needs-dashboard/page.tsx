'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';

const FUNNEL_DATA = [
  { name: 'Panel Attributed', value: 4847, fill: '#0043ce' },
  { name: 'Screened (PRAPARE/AHC)', value: 3291, fill: '#6929c4' },
  { name: 'Unmet Need Identified', value: 1847, fill: '#b45309' },
  { name: 'Social Task Created', value: 1612, fill: '#da1e28' },
  { name: 'CBO Referral Accepted', value: 1289, fill: '#8a3ffc' },
  { name: 'Need Resolved', value: 891, fill: '#198038' },
];

const DOMAIN_PREVALENCE = [
  { domain: 'Food Insecurity', count: 687, pct: 37.2 },
  { domain: 'Housing Instability', count: 521, pct: 28.2 },
  { domain: 'Transportation', count: 412, pct: 22.3 },
  { domain: 'Financial Strain', count: 389, pct: 21.1 },
  { domain: 'Social Isolation', count: 298, pct: 16.1 },
  { domain: 'Employment', count: 187, pct: 10.1 },
];

const DUAL_NEED_TREND = [
  { month: 'Jan', clinical_only: 312, social_only: 187, dual_need: 298 },
  { month: 'Feb', clinical_only: 298, social_only: 201, dual_need: 321 },
  { month: 'Mar', clinical_only: 287, social_only: 214, dual_need: 347 },
  { month: 'Apr', clinical_only: 271, social_only: 228, dual_need: 368 },
  { month: 'May', clinical_only: 259, social_only: 241, dual_need: 389 },
  { month: 'Jun', clinical_only: 244, social_only: 253, dual_need: 412 },
];

const REGION_DATA = [
  { region: 'Jackson', screeningRate: 72, unmetNeeds: 487, topNeed: 'Food Insecurity' },
  { region: 'Clay', screeningRate: 68, unmetNeeds: 312, topNeed: 'Housing' },
  { region: 'Platte', screeningRate: 81, unmetNeeds: 198, topNeed: 'Transportation' },
  { region: 'Cass', screeningRate: 61, unmetNeeds: 287, topNeed: 'Food Insecurity' },
  { region: 'Ray', screeningRate: 54, unmetNeeds: 156, topNeed: 'Social Isolation' },
];

const RHTP_PROGRAMS = [
  'All RHTP Programs',
  'RHTP — Medicaid 1115 Waiver',
  'RHTP — BH Block Grant (SAMHSA)',
  'RHTP — CHW Outreach Program',
  'RHTP — Social Needs Navigation',
];

const REGIONS = [
  'All Regions',
  'Jackson County',
  'Clay County',
  'Platte County',
  'Cass County',
  'Ray County',
];

const PROVIDERS = [
  'All Providers / Networks',
  'Truman Medical Centers',
  "Saint Luke's Health System",
  "Children's Mercy",
  'KCCHC (FQHC)',
  'Rural Health Network — Ray/Cass',
];

// ─── Per-region scale factors (applied when a single region is selected) ─────
const REGION_SCALE: Record<string, number> = {
  'Jackson County': 0.22,
  'Clay County': 0.16,
  'Platte County': 0.12,
  'Cass County': 0.18,
  'Ray County': 0.09,
};

// Per-provider scale factors
const PROVIDER_SCALE: Record<string, number> = {
  'Truman Medical Centers': 0.31,
  "Saint Luke's Health System": 0.27,
  "Children's Mercy": 0.18,
  'KCCHC (FQHC)': 0.13,
  'Rural Health Network — Ray/Cass': 0.09,
};

// Program scale factors
const PROGRAM_SCALE: Record<string, number> = {
  'RHTP — Medicaid 1115 Waiver': 0.48,
  'RHTP — BH Block Grant (SAMHSA)': 0.19,
  'RHTP — CHW Outreach Program': 0.16,
  'RHTP — Social Needs Navigation': 0.14,
};

function scaleFunnel(base: typeof FUNNEL_DATA, factor: number) {
  return base.map((d) => ({ ...d, value: Math.round(d.value * factor) }));
}

function scaleDomains(base: typeof DOMAIN_PREVALENCE, factor: number) {
  const total = Math.round(3291 * factor);
  return base.map((d) => ({
    ...d,
    count: Math.round(d.count * factor),
    pct: total > 0 ? parseFloat((((d.count * factor) / total) * 100).toFixed(1)) : 0,
  }));
}

function scaleTrend(base: typeof DUAL_NEED_TREND, factor: number) {
  return base.map((d) => ({
    ...d,
    clinical_only: Math.round(d.clinical_only * factor),
    social_only: Math.round(d.social_only * factor),
    dual_need: Math.round(d.dual_need * factor),
  }));
}

export default function SocialNeedsDashboardPage() {
  const [activeTab, setActiveTab] = useState<'funnel' | 'domains' | 'dual' | 'regions'>('funnel');
  const [rhtpProgram, setRhtpProgram] = useState(RHTP_PROGRAMS[0]);
  const [fhirSource, setFhirSource] = useState(false);
  const [fhirObsCount, setFhirObsCount] = useState(0);
  const fhirLoadedRef = useRef(false);

  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    getFhirClient()
      .search('Observation', { _count: 20 })
      .then((bundle: any) => {
        const count = (bundle?.entry ?? [])
          .map((e: any) => e?.resource)
          .filter(Boolean)
          .filter(
            (r: any) =>
              r?.resourceType === 'Observation' &&
              r?.extension?.some(
                (x: any) => x.url?.includes('obs-type') && x.valueString === 'sdoh-prevalence'
              )
          ).length;
        if (count > 0) {
          setFhirObsCount(count);
          setFhirSource(true);
        }
      })
      .catch(() => {});
  }, []);
  const [region, setRegion] = useState(REGIONS[0]);
  const [provider, setProvider] = useState(PROVIDERS[0]);

  const isFiltered =
    rhtpProgram !== RHTP_PROGRAMS[0] || region !== REGIONS[0] || provider !== PROVIDERS[0];

  // ── Derive a combined scale factor from active selections ──────────────────
  const scaleFactor = (() => {
    let f = 1.0;
    if (region !== REGIONS[0]) f *= REGION_SCALE[region] ?? 1;
    if (provider !== PROVIDERS[0]) f *= PROVIDER_SCALE[provider] ?? 1;
    if (rhtpProgram !== RHTP_PROGRAMS[0]) f *= PROGRAM_SCALE[rhtpProgram] ?? 1;
    // Re-normalise: if region + provider both selected, avoid double-squashing below 5%
    return Math.max(f, 0.03);
  })();

  // ── Filtered datasets ──────────────────────────────────────────────────────
  const funnelData = isFiltered ? scaleFunnel(FUNNEL_DATA, scaleFactor) : FUNNEL_DATA;
  const domainData = isFiltered ? scaleDomains(DOMAIN_PREVALENCE, scaleFactor) : DOMAIN_PREVALENCE;
  const trendData = isFiltered ? scaleTrend(DUAL_NEED_TREND, scaleFactor) : DUAL_NEED_TREND;

  // Regional view: filter to selected region, then scale unmetNeeds by the full factor
  const regionData = (
    region !== REGIONS[0]
      ? REGION_DATA.filter((r) => r.region === region.replace(' County', ''))
      : REGION_DATA
  ).map((r) => ({
    ...r,
    unmetNeeds: Math.max(1, Math.round(r.unmetNeeds * scaleFactor)),
  }));

  // ── Filtered KPIs ─────────────────────────────────────────────────────────
  const panelSize = Math.round(4847 * scaleFactor);
  const screened = funnelData[1]?.value ?? 0;
  const unmetNeeds = funnelData[2]?.value ?? 0;
  const dualNeed = trendData[trendData.length - 1]?.dual_need ?? 0;
  const screeningRate =
    screened > 0 && panelSize > 0 ? ((screened / panelSize) * 100).toFixed(1) : '0.0';
  const screenedStr = screened > 0 ? screened.toLocaleString() : '0';

  return (
    <AppLayout
      pageTitle="Social Needs Population Dashboard"
      breadcrumbs={[
        { label: 'RHTP Program', href: '/contract-program-selection' },
        { label: 'Social Needs Dashboard' },
      ]}
    >
      {fhirSource && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            {fhirObsCount} SDOH domain Observations verified in HAPI FHIR
          </span>
        </div>
      )}
      {/* ── Context & Filter Banner ─────────────────────────────────────────── */}
      <div className="bg-[#edf5ff] border border-[#0043ce] p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <div className="flex items-center gap-1.5">
            <Icon name="InformationCircleIcon" size={15} style={{ color: '#0043ce' }} />
            <span className="text-xs font-semibold text-[#001d6c]">Population Context</span>
          </div>
          <span className="text-xs text-[#0043ce]">
            Screening and social needs data for the{' '}
            <strong>RHTP-attributed Medicaid/Medicare population</strong> in South Dakota. Use
            filters below to scope by RHTP program, region, or provider network.
          </span>
          {isFiltered && (
            <button
              onClick={() => {
                setRhtpProgram(RHTP_PROGRAMS[0]);
                setRegion(REGIONS[0]);
                setProvider(PROVIDERS[0]);
              }}
              className="ml-auto text-2xs font-semibold text-[#0043ce] underline hover:no-underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {/* RHTP Program filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-2xs font-semibold text-[#0043ce] uppercase tracking-wide whitespace-nowrap">
              RHTP Program
            </label>
            <select
              value={rhtpProgram}
              onChange={(e) => setRhtpProgram(e.target.value)}
              className="text-xs border border-[#0043ce] bg-white text-carbon-gray-100 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#0043ce]"
            >
              {RHTP_PROGRAMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {/* Region filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-2xs font-semibold text-[#0043ce] uppercase tracking-wide whitespace-nowrap">
              Region
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="text-xs border border-[#0043ce] bg-white text-carbon-gray-100 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#0043ce]"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {/* Provider filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-2xs font-semibold text-[#0043ce] uppercase tracking-wide whitespace-nowrap">
              Provider / Network
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="text-xs border border-[#0043ce] bg-white text-carbon-gray-100 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#0043ce]"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Active scope summary */}
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-2xs bg-[#0043ce] text-white px-2 py-0.5 font-medium">
            {rhtpProgram === RHTP_PROGRAMS[0] ? 'All RHTP Programs' : rhtpProgram}
          </span>
          <span className="text-2xs bg-[#0043ce] text-white px-2 py-0.5 font-medium">
            {region === REGIONS[0] ? 'All Regions' : region}
          </span>
          <span className="text-2xs bg-[#0043ce] text-white px-2 py-0.5 font-medium">
            {provider === PROVIDERS[0] ? 'All Providers' : provider}
          </span>
          <span className="text-2xs text-[#0043ce] px-2 py-0.5 border border-[#0043ce]">
            Panel: {panelSize.toLocaleString()} attributed lives · Data as of Jun 2026
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          {
            label: 'Screening Rate',
            value: `${screeningRate}%`,
            sub: 'Target: 80%',
            color: '#b45309',
            icon: 'ClipboardDocumentCheckIcon',
          },
          {
            label: 'Patients w/ Unmet Needs',
            value: unmetNeeds.toLocaleString(),
            sub: `${screened > 0 ? ((unmetNeeds / screened) * 100).toFixed(1) : 0}% of screened`,
            color: '#da1e28',
            icon: 'ExclamationTriangleIcon',
          },
          {
            label: 'Dual-Need Cohort',
            value: dualNeed.toLocaleString(),
            sub: 'Clinical + social gaps',
            color: '#6929c4',
            icon: 'UserGroupIcon',
          },
          {
            label: 'Social Referral Completion',
            value:
              (funnelData[4]?.value ?? 0) > 0
                ? `${(((funnelData[5]?.value ?? 0) / (funnelData[4]?.value ?? 1)) * 100).toFixed(1)}%`
                : '—',
            sub:
              (funnelData[4]?.value ?? 0) > 0
                ? `${funnelData[5]?.value ?? 0} of ${funnelData[4]?.value ?? 0} referrals resolved`
                : 'No referrals in scope',
            color: '#198038',
            icon: 'CheckBadgeIcon',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-carbon-gray-20 p-4 flex items-start gap-3"
          >
            <div className="w-8 h-8 flex items-center justify-center bg-carbon-gray-10 flex-shrink-0">
              <Icon name={kpi.icon as any} size={16} style={{ color: kpi.color }} />
            </div>
            <div>
              <p className="font-mono text-xl font-bold leading-tight" style={{ color: kpi.color }}>
                {kpi.value}
              </p>
              <p className="text-xs font-semibold text-carbon-gray-100">{kpi.label}</p>
              <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tab Nav */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'funnel', label: 'Screening Funnel' },
          { key: 'domains', label: 'Need Prevalence' },
          { key: 'dual', label: 'Dual-Need Cohort' },
          { key: 'regions', label: 'Regional View' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 text-xs font-semibold border transition-colors ${activeTab === tab.key ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Screening Funnel */}
      {activeTab === 'funnel' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white border border-carbon-gray-20 p-4">
            <p className="text-sm font-semibold text-carbon-gray-100 mb-1">
              Social Referral Funnel
            </p>
            <p className="text-2xs text-carbon-gray-50 mb-4">
              Each stage shows count and % of the <strong>attributed panel</strong> (
              {rhtpProgram === RHTP_PROGRAMS[0] ? 'all RHTP programs' : rhtpProgram}
              {region !== REGIONS[0] ? `, ${region}` : ''}
              {provider !== PROVIDERS[0] ? `, ${provider}` : ''}).
            </p>
            <div className="space-y-2">
              {funnelData.map((item, idx) => {
                const pct =
                  funnelData[0].value > 0
                    ? Math.round((item.value / funnelData[0].value) * 100)
                    : 0;
                return (
                  <div key={item.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-carbon-gray-70">{item.name}</span>
                      <span className="font-mono font-bold text-carbon-gray-100">
                        {item.value.toLocaleString()}{' '}
                        <span className="text-carbon-gray-50 font-normal">({pct}% of panel)</span>
                      </span>
                    </div>
                    <div className="h-6 bg-carbon-gray-10 relative">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: item.fill }}
                      />
                    </div>
                    {idx < funnelData.length - 1 && (
                      <div className="text-2xs text-carbon-gray-50 text-right mt-0.5">
                        Drop-off: {funnelData[idx].value - funnelData[idx + 1].value} (
                        {funnelData[idx].value > 0
                          ? Math.round(
                              ((funnelData[idx].value - funnelData[idx + 1].value) /
                                funnelData[idx].value) *
                                100
                            )
                          : 0}
                        %)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white border border-carbon-gray-20 p-4">
            <p className="text-sm font-semibold text-carbon-gray-100 mb-4">Funnel Metrics</p>
            <div className="space-y-3">
              {(
                [
                  {
                    label: 'Screening Completion Rate',
                    value:
                      panelSize > 0
                        ? `${(((funnelData[1]?.value ?? 0) / panelSize) * 100).toFixed(1)}%`
                        : '—',
                    target: '80%',
                    color: '#b45309',
                  },
                  {
                    label: 'Need Identification Rate',
                    value:
                      (funnelData[1]?.value ?? 0) > 0
                        ? `${(((funnelData[2]?.value ?? 0) / (funnelData[1]?.value ?? 1)) * 100).toFixed(1)}%`
                        : '—',
                    target: '—',
                    color: '#da1e28',
                  },
                  {
                    label: 'Task Creation Rate',
                    value:
                      (funnelData[2]?.value ?? 0) > 0
                        ? `${(((funnelData[3]?.value ?? 0) / (funnelData[2]?.value ?? 1)) * 100).toFixed(1)}%`
                        : '—',
                    target: '95%',
                    color: '#0043ce',
                  },
                  {
                    label: 'CBO Acceptance Rate',
                    value:
                      (funnelData[3]?.value ?? 0) > 0
                        ? `${(((funnelData[4]?.value ?? 0) / (funnelData[3]?.value ?? 1)) * 100).toFixed(1)}%`
                        : '—',
                    target: '85%',
                    color: '#6929c4',
                  },
                  {
                    label: 'Resolution Rate',
                    value:
                      (funnelData[4]?.value ?? 0) > 0
                        ? `${(((funnelData[5]?.value ?? 0) / (funnelData[4]?.value ?? 1)) * 100).toFixed(1)}%`
                        : '—',
                    target: '75%',
                    color: '#198038',
                  },
                ] as { label: string; value: string; target: string; color: string }[]
              ).map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between py-2 border-b border-carbon-gray-10"
                >
                  <span className="text-xs text-carbon-gray-70">{m.label}</span>
                  <div className="flex items-center gap-3">
                    {m.target !== '—' && (
                      <span className="text-2xs text-carbon-gray-50">Target: {m.target}</span>
                    )}
                    <span className="font-mono font-bold text-sm" style={{ color: m.color }}>
                      {m.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Domain Prevalence */}
      {activeTab === 'domains' && (
        <div className="bg-white border border-carbon-gray-20 p-4">
          <p className="text-sm font-semibold text-carbon-gray-100 mb-1">
            Most Prevalent Social Needs — Attributed Panel
          </p>
          <p className="text-2xs text-carbon-gray-50 mb-4">
            Count and % of <strong>screened patients ({screenedStr})</strong> within the selected
            scope ({rhtpProgram === RHTP_PROGRAMS[0] ? 'all RHTP programs' : rhtpProgram}
            {region !== REGIONS[0] ? `, ${region}` : ''}). Patients may have multiple needs.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              key={`domains::${rhtpProgram}::${region}::${provider}`}
              data={domainData}
              layout="vertical"
              margin={{ left: 20, right: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="domain" tick={{ fontSize: 11 }} width={130} />
              <Tooltip formatter={(v: any) => [`${v} patients`, 'Count']} />
              <Bar dataKey="count" fill="#0043ce" radius={[0, 2, 2, 0]}>
                <LabelList
                  dataKey="pct"
                  position="right"
                  formatter={(v: any) => `${v}% of screened`}
                  style={{ fontSize: 11, fill: '#6f6f6f' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dual-Need Cohort */}
      {activeTab === 'dual' && (
        <div className="space-y-4">
          <div className="bg-[#f6f2ff] border border-[#8a3ffc] p-4">
            <div className="flex items-start gap-3">
              <Icon name="UserGroupIcon" size={20} style={{ color: '#6929c4' }} />
              <div>
                <p className="text-sm font-semibold text-[#31135e]">
                  Dual-Need Cohort — {dualNeed.toLocaleString()} Patients
                </p>
                <p className="text-xs text-[#6929c4] mt-0.5">
                  Patients with both open clinical care gaps AND unmet social needs within the
                  selected RHTP scope (
                  {rhtpProgram === RHTP_PROGRAMS[0] ? 'all programs' : rhtpProgram}
                  {region !== REGIONS[0] ? `, ${region}` : ''}). Highest-cost, highest-opportunity
                  group. Average PMPM: $1,847 vs $634 for single-need patients.
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-carbon-gray-20 p-4">
            <p className="text-sm font-semibold text-carbon-gray-100 mb-4">
              Dual-Need Cohort Growth Trend
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart key={`dual::${rhtpProgram}::${region}::${provider}`} data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="dual_need"
                  stroke="#6929c4"
                  strokeWidth={2.5}
                  name="Dual-Need (Clinical + Social)"
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="clinical_only"
                  stroke="#0043ce"
                  strokeWidth={1.5}
                  name="Clinical Only"
                  strokeDasharray="4 2"
                />
                <Line
                  type="monotone"
                  dataKey="social_only"
                  stroke="#b45309"
                  strokeWidth={1.5}
                  name="Social Only"
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Regional View */}
      {activeTab === 'regions' && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-4 py-3 border-b border-carbon-gray-20">
            <p className="text-sm font-semibold text-carbon-gray-100">Social Needs by Region</p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              Screening rate vs 80% target per county within the selected RHTP program scope
              {provider !== PROVIDERS[0] ? ` — unmet needs scoped to ${provider}` : ''}.
            </p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Region / County
                </th>
                <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Screening Rate
                </th>
                <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Unmet Needs
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Top Need
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">
                  vs 80% Target
                </th>
              </tr>
            </thead>
            <tbody>
              {regionData.map((r) => (
                <tr
                  key={r.region}
                  className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-carbon-gray-100">{r.region} County</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="font-mono font-bold"
                      style={{
                        color:
                          r.screeningRate >= 75
                            ? '#0e6027'
                            : r.screeningRate >= 65
                              ? '#b45309'
                              : '#da1e28',
                      }}
                    >
                      {r.screeningRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-bold text-carbon-gray-100">
                    {r.unmetNeeds}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-2xs font-bold bg-[#fff1f1] text-[#da1e28]">
                      {r.topNeed}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-carbon-gray-10">
                        <div
                          className="h-full"
                          style={{
                            width: `${(r.screeningRate / 80) * 100}%`,
                            backgroundColor:
                              r.screeningRate >= 75
                                ? '#24a148'
                                : r.screeningRate >= 65
                                  ? '#f1c21b'
                                  : '#da1e28',
                          }}
                        />
                      </div>
                      <span className="text-2xs text-carbon-gray-50 w-12 text-right">
                        {r.screeningRate}/80%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
