'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';
import { useAppContext } from '@/lib/appContext';
import { contractName } from '@/lib/contracts';
import {
  BASE,
  REGION_SCALE,
  PROGRAM_MOD,
  ORG_DATA,
  PERIOD_MULT,
  BASE_MEASURES,
  PROGRAM_MEASURES,
  CONTRACT_MOD,
} from './executiveOutcomesData';

// ─── Filter Dimensions ────────────────────────────────────────────────────────

const REGIONS = [
  'All Regions',
  'Oglala Lakota County',
  'Bennett County',
  'Gregory County',
  'Tripp County',
  'Todd County',
  'Jackson County',
];

const PROGRAMS = [
  'All Programs',
  'RHTP — Medicaid 1115 Waiver',
  'RHTP — BH Block Grant (SAMHSA)',
  'RHTP — CHW Outreach Program',
  'RHTP — Social Needs Navigation',
  'RHTP — Value-Based Care',
];

const ORGS = [
  'All Organizations',
  'Oglala Lakota PCP',
  'Monument Cardio',
  'Bennett Co. Health',
  'Gregory Co. Medical',
  'Winner Regional',
  'Fall River Specialists',
];

const PERIODS = ['YTD 2026', 'Q1 2026', 'Q2 2026', 'Q3 2026 (proj)', 'Full Year 2025'];

// ─── Base Data (full-network, full-year) ──────────────────────────────────────

type DashSection = 'population' | 'financial' | 'operational';

// ─── Derived data hook ────────────────────────────────────────────────────────

function useDerivedData(
  region: string,
  program: string,
  org: string,
  period: string,
  contract: string
) {
  return useMemo(() => {
    const regionScale = region === 'All Regions' ? 1 : (REGION_SCALE[region] ?? 0.17);
    const progMod = PROGRAM_MOD[program] ?? { closureBoost: 0, gainMod: 1, operationalMod: 1 };
    const cMod = CONTRACT_MOD[contract] ?? { livesMod: 1, gainMod: 1, closureBoost: 0 };
    const periodMult = PERIOD_MULT[period] ?? 1;

    const scaledLives = Math.round(
      BASE.totalLives * (region === 'All Regions' ? 1 : regionScale) * cMod.livesMod
    );
    const scaledGapsClosed = Math.round(
      BASE.gapsClosed * (region === 'All Regions' ? 1 : regionScale) * periodMult * cMod.livesMod
    );
    const scaledGapsOpen = Math.round(
      BASE.gapsOpen * (region === 'All Regions' ? 1 : regionScale) * periodMult * cMod.livesMod
    );
    const closureRate = Math.min(
      99,
      +(
        BASE.closureRate +
        progMod.closureBoost +
        cMod.closureBoost +
        (region === 'All Regions' ? 0 : (regionScale - 0.17) * 15)
      ).toFixed(1)
    );
    const gainShareKtd = Math.round(
      BASE.gainShare *
        (region === 'All Regions' ? 1 : regionScale) *
        progMod.gainMod *
        periodMult *
        cMod.gainMod
    );
    const sharedSavings = Math.round(
      BASE.sharedSavings *
        (region === 'All Regions' ? 1 : regionScale) *
        progMod.gainMod *
        periodMult
    );
    const incentivePayments = Math.round(
      BASE.incentivePayments * (region === 'All Regions' ? 1 : regionScale) * periodMult
    );
    const avoidedLeakage = Math.round(
      BASE.avoidedLeakage * (region === 'All Regions' ? 1 : regionScale) * periodMult
    );

    const refCompletion = +(BASE.referralCompletion * progMod.operationalMod).toFixed(0);
    const responseTime = +(BASE.specialistResponseDays / progMod.operationalMod).toFixed(1);
    const providerPart = +Math.min(
      99,
      BASE.providerParticipation * (region === 'All Regions' ? 1 : 0.95 + regionScale)
    ).toFixed(0);
    const ptEngagement = +(
      BASE.patientEngagement *
      progMod.operationalMod *
      (region === 'All Regions' ? 1 : 0.92 + regionScale)
    ).toFixed(0);

    // Closure trend — scale & shift per filters
    const closureTrend = [
      {
        month: 'Jan',
        closed: Math.round(820 * regionScale * periodMult),
        open: Math.round(9200 * regionScale),
        rate: +(58 + progMod.closureBoost).toFixed(1),
      },
      {
        month: 'Feb',
        closed: Math.round(940 * regionScale * periodMult),
        open: Math.round(9100 * regionScale),
        rate: +(61 + progMod.closureBoost).toFixed(1),
      },
      {
        month: 'Mar',
        closed: Math.round(1100 * regionScale * periodMult),
        open: Math.round(8900 * regionScale),
        rate: +(63 + progMod.closureBoost).toFixed(1),
      },
      {
        month: 'Apr',
        closed: Math.round(1280 * regionScale * periodMult),
        open: Math.round(8600 * regionScale),
        rate: +(65 + progMod.closureBoost).toFixed(1),
      },
      {
        month: 'May',
        closed: Math.round(1420 * regionScale * periodMult),
        open: Math.round(8241 * regionScale),
        rate: closureRate,
      },
      {
        month: 'Jun (proj)',
        closed: Math.round(1580 * regionScale * periodMult),
        open: Math.round(7900 * regionScale),
        rate: Math.min(99, +(closureRate + 2.5).toFixed(1)),
      },
    ];

    const gainShareTrend = [
      {
        month: 'Jan',
        earned: Math.round(180 * regionScale * progMod.gainMod * periodMult),
        projected: Math.round(200 * regionScale * progMod.gainMod),
      },
      {
        month: 'Feb',
        earned: Math.round(210 * regionScale * progMod.gainMod * periodMult),
        projected: Math.round(230 * regionScale * progMod.gainMod),
      },
      {
        month: 'Mar',
        earned: Math.round(240 * regionScale * progMod.gainMod * periodMult),
        projected: Math.round(260 * regionScale * progMod.gainMod),
      },
      {
        month: 'Apr',
        earned: Math.round(230 * regionScale * progMod.gainMod * periodMult),
        projected: Math.round(280 * regionScale * progMod.gainMod),
      },
      {
        month: 'May',
        earned: Math.round(240 * regionScale * progMod.gainMod * periodMult),
        projected: Math.round(300 * regionScale * progMod.gainMod),
      },
      {
        month: 'Jun (proj)',
        earned: 0,
        projected: Math.round(320 * regionScale * progMod.gainMod),
      },
    ];

    // Measures — filter by program if specific; add regional adjustment to current scores
    const regionAdj = region === 'All Regions' ? 0 : (regionScale - 0.17) * 20;
    const programMeasureKeys = PROGRAM_MEASURES[program];
    const measures = BASE_MEASURES.filter(
      (m) => !programMeasureKeys || programMeasureKeys.includes(m.measure)
    ).map((m) => ({
      ...m,
      current: Math.min(
        99,
        Math.max(30, Math.round(m.current + regionAdj + progMod.closureBoost / 2))
      ),
    }));

    // Network table — filter by org or show all
    const networkRows =
      org === 'All Organizations'
        ? Object.entries(ORG_DATA).map(([name, d]) => ({ org: name, ...d }))
        : [{ org, ...ORG_DATA[org]! }];

    // Benchmarks for financial panel
    const benchmarkPmpm = BASE.benchmarkPmpm;
    const actualPmpm = Math.round(BASE.actualPmpm * progMod.gainMod);
    const savingsAnnual = Math.round(((benchmarkPmpm - actualPmpm) * scaledLives * 12) / 1000);

    return {
      scaledLives,
      scaledGapsClosed,
      scaledGapsOpen,
      closureRate,
      gainShareKtd,
      sharedSavings,
      incentivePayments,
      avoidedLeakage,
      refCompletion,
      responseTime,
      providerPart,
      ptEngagement,
      closureTrend,
      gainShareTrend,
      measures,
      networkRows,
      benchmarkPmpm,
      actualPmpm,
      savingsAnnual,
    };
  }, [region, program, org, period, contract]);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExecutiveOutcomesDashboardPage() {
  const { useMockData, setUseMockData, selectedContractId } = useAppContext();
  const [activeSection, setActiveSection] = useState<DashSection>('population');

  // Filters
  const [region, setRegion] = useState(REGIONS[0]);
  const [program, setProgram] = useState(PROGRAMS[0]);
  const [org, setOrg] = useState(ORGS[0]);
  const [period, setPeriod] = useState(PERIODS[0]);

  // FHIR live mode state
  const [fhirMeasureCount, setFhirMeasureCount] = useState(0);
  const fhirLoadedRef = useRef(false);

  useEffect(() => {
    if (useMockData || getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    getFhirClient()
      .search('MeasureReport', { _count: 50 })
      .then((bundle: any) => {
        const count = (bundle?.entry ?? [])
          .map((e: any) => e?.resource)
          .filter(Boolean)
          .filter((r: any) => r?.resourceType === 'MeasureReport').length;
        if (count > 0) setFhirMeasureCount(count);
      })
      .catch(() => {});
  }, [useMockData]);

  const d = useDerivedData(region, program, org, period, selectedContractId ?? 'contract-001');

  // Chart keys — force remount when filters change
  const chartKey = `${region}|${program}|${org}|${period}`;

  // ── Metric cards helper
  const MetricCard = ({
    label,
    value,
    sub,
    color,
    icon,
    trend,
    up,
  }: {
    label: string;
    value: string;
    sub: string;
    color: string;
    icon: string;
    trend: string;
    up: boolean;
  }) => (
    <div className="bg-white border border-carbon-gray-20 px-5 py-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon name={icon as any} size={13} className="text-carbon-gray-50" />
        <p className="carbon-label">{label}</p>
      </div>
      <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</p>
      <p className="text-xs text-carbon-gray-50 mt-0.5">{sub}</p>
      <p className={`text-2xs mt-1 font-medium ${up ? 'text-[#24a148]' : 'text-[#da1e28]'}`}>
        {up ? '↑' : '↓'} {trend}
      </p>
    </div>
  );

  const isFiltered =
    region !== 'All Regions' ||
    program !== 'All Programs' ||
    org !== 'All Organizations' ||
    period !== 'YTD 2026';

  return (
    <AppLayout
      pageTitle="Executive Rural Health Outcomes Dashboard"
      breadcrumbs={[
        { label: 'RHTP Platform', href: '/contract-program-selection' },
        { label: 'Executive Dashboard' },
      ]}
      contextBanner={
        <div className="bg-[#161616] border-b border-carbon-gray-80 px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-white">
            {contractName(selectedContractId)} · South Dakota RHTP
          </span>
          <span className="text-xs text-carbon-gray-30">
            {region === 'All Regions' ? '14 Counties' : region} · {d.scaledLives.toLocaleString()}{' '}
            Lives
            {org !== 'All Organizations' ? ` · ${org}` : ' · 18 Organizations'}
          </span>
          <span className="text-xs text-carbon-gray-30">{period}</span>
          <span className="ml-auto text-xs text-carbon-gray-50">As of May 29, 2026</span>
        </div>
      }
    >
      {/* ── Data Source + Mode Toggle ──────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-2.5 border-b border-carbon-gray-20 bg-carbon-gray-10 flex-wrap">
        <div className="flex items-center gap-2">
          {useMockData ? (
            <span className="text-2xs font-semibold px-2 py-0.5 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]">
              MOCK DATA
            </span>
          ) : (
            <span className="text-2xs font-semibold px-2 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
              {fhirMeasureCount > 0 ? `FHIR R4 · ${fhirMeasureCount} MeasureReport` : 'FHIR R4'}
            </span>
          )}
          <button
            onClick={() => setUseMockData(!useMockData)}
            className="text-2xs text-[#0043ce] underline hover:text-[#002d9c] font-medium"
          >
            Switch to {useMockData ? 'Production (FHIR)' : 'Mock Data'}
          </button>
        </div>
        {isFiltered && (
          <button
            onClick={() => {
              setRegion(REGIONS[0]);
              setProgram(PROGRAMS[0]);
              setOrg(ORGS[0]);
              setPeriod(PERIODS[0]);
            }}
            className="text-2xs text-[#da1e28] underline hover:text-[#a2191f] font-medium ml-auto"
          >
            ✕ Clear Filters
          </button>
        )}
      </div>

      {/* ── Filter Bar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-carbon-gray-20 bg-white flex-wrap">
        <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-1">
          Filter:
        </span>
        {[
          { label: 'Region', value: region, options: REGIONS, set: setRegion },
          { label: 'Program', value: program, options: PROGRAMS, set: setProgram },
          { label: 'Org', value: org, options: ORGS, set: setOrg },
          { label: 'Period', value: period, options: PERIODS, set: setPeriod },
        ].map((f) => (
          <div key={f.label} className="flex items-center gap-1.5">
            <label className="text-2xs text-carbon-gray-50">{f.label}</label>
            <select
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="text-xs border border-carbon-gray-30 bg-white px-2 py-1 pr-6 text-carbon-gray-100 focus:outline-none focus:ring-1 focus:ring-[#0f62fe] min-w-[140px]"
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* ── Section Tabs ──────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-carbon-gray-20 bg-white px-6">
        {[
          { key: 'population' as DashSection, label: 'Population Health', icon: 'UserGroupIcon' },
          {
            key: 'financial' as DashSection,
            label: 'Financial Performance',
            icon: 'CurrencyDollarIcon',
          },
          { key: 'operational' as DashSection, label: 'Operational Metrics', icon: 'ChartBarIcon' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeSection === tab.key
                ? 'border-[#0f62fe] text-[#0f62fe]'
                : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100'
            }`}
          >
            <Icon name={tab.icon as any} size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* ── Population Health ─────────────────────────────────────── */}
        {activeSection === 'population' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Care Gaps Closed"
                value={d.scaledGapsClosed.toLocaleString()}
                sub={period}
                color="text-[#24a148]"
                icon="CheckCircleIcon"
                trend={`${Math.round(d.scaledGapsClosed * 0.18).toLocaleString()} vs prior period`}
                up={true}
              />
              <MetricCard
                label="Open Care Gaps"
                value={d.scaledGapsOpen.toLocaleString()}
                sub="Remaining"
                color="text-[#da1e28]"
                icon="ExclamationTriangleIcon"
                trend={`${Math.round(d.scaledGapsOpen * 0.07).toLocaleString()} closed this quarter`}
                up={false}
              />
              <MetricCard
                label="Closure Rate"
                value={`${d.closureRate}%`}
                sub="Target: 75%"
                color="text-[#b45309]"
                icon="ChartBarIcon"
                trend={`${d.closureRate >= 68 ? '+' : ''}${(d.closureRate - 64).toFixed(1)}% vs Q1`}
                up={d.closureRate >= 64}
              />
              <MetricCard
                label="Quality Score"
                value={`${(3.8 + (d.closureRate - 68.4) * 0.02).toFixed(1)}★`}
                sub="STARS Rating"
                color="text-[#f1c21b]"
                icon="StarIcon"
                trend="+0.3 vs prior year"
                up={true}
              />
            </div>

            {/* Closure trend */}
            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-carbon-gray-100">
                    Care Gap Closure Rate Trend
                  </h3>
                  <p className="text-xs text-carbon-gray-50">
                    {region !== 'All Regions' ? region : 'All Regions'} ·{' '}
                    {program !== 'All Programs' ? program : 'All Programs'}
                  </p>
                </div>
                <span className="text-2xs font-semibold px-2 py-1 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
                  Target: 75% by Q4
                </span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart key={`closure-${chartKey}`} data={d.closureTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="rate"
                    stroke="#24a148"
                    fill="#defbe6"
                    name="Closure Rate %"
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="closed"
                    stroke="#0043ce"
                    fill="#d0e2ff"
                    name="Gaps Closed"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Quality Measures */}
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="ChartBarIcon" size={15} className="text-[#6929c4]" />
                  <h3 className="text-sm font-semibold text-carbon-gray-100">
                    Quality Measure Performance
                  </h3>
                </div>
                {program !== 'All Programs' && (
                  <span className="text-2xs text-carbon-gray-50">Filtered to {program}</span>
                )}
              </div>
              <div className="divide-y divide-carbon-gray-20">
                {d.measures.map((m) => {
                  const pct = Math.min((m.current / m.target) * 100, 100);
                  const onTrack = m.current >= m.target * 0.95;
                  return (
                    <div key={m.measure} className="px-5 py-3 flex items-center gap-4">
                      <div className="w-28 flex-shrink-0">
                        <p className="text-xs font-semibold text-carbon-gray-100">{m.name}</p>
                        <p className="text-2xs font-mono text-carbon-gray-50">{m.measure}</p>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 h-2 bg-carbon-gray-20 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${onTrack ? 'bg-[#24a148]' : 'bg-[#b45309]'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-carbon-gray-70 flex-shrink-0 w-20 text-right">
                            {m.current}% / {m.target}%
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 flex-shrink-0 ${
                          m.program === 'HEDIS'
                            ? 'bg-[#d0e2ff] text-[#0043ce]'
                            : m.program === 'STARS'
                              ? 'bg-[#f6f2ff] text-[#6929c4]'
                              : 'bg-[#fdf6dd] text-[#b45309]'
                        }`}
                      >
                        {m.program}
                      </span>
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 flex-shrink-0 ${
                          onTrack ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fdf6dd] text-[#b45309]'
                        }`}
                      >
                        {onTrack ? 'On Track' : 'At Risk'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Financial Performance ─────────────────────────────────── */}
        {activeSection === 'financial' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Gain Share Earned"
                value={`$${(d.gainShareKtd / 1000).toFixed(2)}M`}
                sub={period}
                color="text-[#24a148]"
                icon="CurrencyDollarIcon"
                trend={`On track for $${((d.gainShareKtd * 1.67) / 1000).toFixed(2)}M annualized`}
                up={true}
              />
              <MetricCard
                label="Shared Savings"
                value={`$${d.sharedSavings}K`}
                sub="Realized"
                color="text-[#24a148]"
                icon="BanknotesIcon"
                trend={`+$${Math.round(d.sharedSavings * 0.15)}K vs prior period`}
                up={true}
              />
              <MetricCard
                label="Incentive Payments"
                value={`$${d.incentivePayments}K`}
                sub="Quality bonuses"
                color="text-[#0043ce]"
                icon="TrophyIcon"
                trend="Q2 payment pending"
                up={true}
              />
              <MetricCard
                label="Avoided Leakage"
                value={`$${d.avoidedLeakage}K`}
                sub="Out-of-network saves"
                color="text-[#6929c4]"
                icon="ShieldCheckIcon"
                trend="-18% leakage rate"
                up={false}
              />
            </div>

            {/* Gain share trend */}
            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-carbon-gray-100">
                    Gain Share Earned vs Projected ($K)
                  </h3>
                  <p className="text-xs text-carbon-gray-50">
                    {region !== 'All Regions' ? region : 'All Regions'} ·{' '}
                    {program !== 'All Programs' ? program : 'All Programs'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-2xs">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2 bg-[#24a148] inline-block" /> Earned
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2 bg-[#d0e2ff] inline-block" /> Projected
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart key={`gainshare-${chartKey}`} data={d.gainShareTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `$${v}K`} />
                  <Bar dataKey="projected" fill="#d0e2ff" name="Projected" />
                  <Bar dataKey="earned" fill="#24a148" name="Earned" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Shared savings model */}
            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4">
                Shared Savings Model — Performance vs Benchmark
                {isFiltered && (
                  <span className="text-carbon-gray-50 font-normal text-xs ml-2">
                    (adjusted for {region !== 'All Regions' ? region : program})
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    label: 'Benchmark PMPM',
                    value: `$${d.benchmarkPmpm}`,
                    sub: 'State-set target',
                    color: 'bg-carbon-gray-10 border-carbon-gray-20',
                  },
                  {
                    label: 'Actual PMPM',
                    value: `$${d.actualPmpm}`,
                    sub: `$${d.benchmarkPmpm - d.actualPmpm} below benchmark`,
                    color: 'bg-[#defbe6] border-[#a7f0ba]',
                  },
                  {
                    label: 'Savings Generated',
                    value: `$${(d.savingsAnnual / 1000).toFixed(2)}M`,
                    sub: 'Annualized projection',
                    color: 'bg-[#defbe6] border-[#a7f0ba]',
                  },
                ].map((item) => (
                  <div key={item.label} className={`border px-4 py-4 ${item.color}`}>
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-1">
                      {item.label}
                    </p>
                    <p className="text-2xl font-bold font-mono text-carbon-gray-100">
                      {item.value}
                    </p>
                    <p className="text-xs text-carbon-gray-50 mt-0.5">{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Operational Metrics ───────────────────────────────────── */}
        {activeSection === 'operational' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Referral Completion"
                value={`${d.refCompletion}%`}
                sub="Specialist tasks"
                color="text-[#0043ce]"
                icon="ArrowsRightLeftIcon"
                trend="+6% vs prior period"
                up={true}
              />
              <MetricCard
                label="Specialist Response Time"
                value={`${d.responseTime}d`}
                sub="Avg days to accept"
                color="text-[#24a148]"
                icon="ClockIcon"
                trend="-0.8d vs Q1"
                up={false}
              />
              <MetricCard
                label="Provider Participation"
                value={`${d.providerPart}%`}
                sub="Active in network"
                color="text-[#24a148]"
                icon="UserGroupIcon"
                trend="+2 orgs joined"
                up={true}
              />
              <MetricCard
                label="Patient Engagement"
                value={`${Math.min(99, d.ptEngagement)}%`}
                sub="Outreach response"
                color="text-[#b45309]"
                icon="PhoneIcon"
                trend="+3% vs Q1"
                up={true}
              />
            </div>

            {/* Network performance table */}
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="BuildingOffice2Icon" size={15} className="text-[#0043ce]" />
                  <h3 className="text-sm font-semibold text-carbon-gray-100">
                    Network Organization Performance
                  </h3>
                </div>
                {org !== 'All Organizations' && (
                  <span className="text-2xs text-carbon-gray-50">Filtered: {org}</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                      <th className="px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
                        Organization
                      </th>
                      <th className="px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
                        Type
                      </th>
                      <th className="px-4 py-2.5 text-right text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
                        Patients
                      </th>
                      <th className="px-4 py-2.5 text-right text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
                        Gap Closure
                      </th>
                      <th className="px-4 py-2.5 text-right text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
                        Gain Share {period}
                      </th>
                      <th className="px-4 py-2.5 text-center text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon-gray-20">
                    {d.networkRows.map((row) => (
                      <tr key={row.org} className="hover:bg-carbon-gray-10 transition-colors">
                        <td className="px-4 py-3 font-medium text-carbon-gray-100">{row.org}</td>
                        <td className="px-4 py-3 text-carbon-gray-50">{row.type}</td>
                        <td className="px-4 py-3 text-right font-mono text-carbon-gray-100">
                          {row.patients.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`font-bold font-mono ${row.closure >= 70 ? 'text-[#24a148]' : row.closure >= 60 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                          >
                            {row.closure}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-[#24a148]">
                          ${row.gainShare}K
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-2xs font-semibold px-2 py-0.5 ${
                              row.closure >= 70
                                ? 'bg-[#defbe6] text-[#0e6027]'
                                : 'bg-[#fdf6dd] text-[#b45309]'
                            }`}
                          >
                            {row.closure >= 70 ? 'On Track' : 'At Risk'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rollup narrative */}
            <div className="bg-[#f0f4ff] border border-[#97c1ff] px-5 py-4">
              <div className="flex items-start gap-3">
                <Icon
                  name="InformationCircleIcon"
                  size={18}
                  className="text-[#0043ce] flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold text-[#0043ce] mb-1">
                    How Individual Interventions Roll Up to Network Outcomes
                  </p>
                  <p className="text-xs text-carbon-gray-70 leading-relaxed">
                    Each patient intervention — a cardiology referral, an A1C lab order, a
                    specialist consultation — closes a care gap that contributes to the network's
                    HEDIS/STARS quality score. Higher quality scores unlock the gain-share pool. The
                    RHTP platform tracks every intervention from referral creation through evidence
                    submission to EDW reporting, creating a closed-loop quality improvement cycle
                    that directly drives state Medicaid incentive payments.
                    {isFiltered && (
                      <>
                        {' '}
                        Metrics above reflect the{' '}
                        <strong>{region !== 'All Regions' ? region : 'all-region'}</strong>{' '}
                        {program !== 'All Programs' ? (
                          <>
                            , <strong>{program}</strong>
                          </>
                        ) : (
                          ''
                        )}{' '}
                        view for <strong>{period}</strong>.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
