'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';
import FinancialKPIGrid from './components/FinancialKPIGrid';
import PmpmTrendChart from './components/PmpmTrendChart';
import CostEnvelopeChart from './components/CostEnvelopeChart';
import HighCostPatientTable from './components/HighCostPatientTable';
import RafRevenuePanel from './components/RafRevenuePanel';
import FinancialActionBar from './components/FinancialActionBar';
import Icon from '@/components/ui/AppIcon';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ─── Braided Funding Data ─────────────────────────────────────────────────────
const FUNDING_STREAMS = [
  {
    id: 'fs-001',
    name: 'Medicaid 1115 Waiver',
    domain: 'Whole Person Care',
    amount: 4200000,
    pct: 38.2,
    programs: ['CHW Outreach', 'Social Needs Screening', 'Care Coordination'],
    outcomes: 'ED visits ↓18%, Care gap closure ↑24%',
    color: '#0043ce',
  },
  {
    id: 'fs-002',
    name: 'SNAP (USDA)',
    domain: 'Food Security',
    amount: 1870000,
    pct: 17.0,
    programs: ['SNAP Enrollment', 'Food Bank Referrals', 'Nutrition Education'],
    outcomes: 'A1C improvement ↓14% in enrolled cohort',
    color: '#b45309',
  },
  {
    id: 'fs-003',
    name: 'HUD Housing Programs',
    domain: 'Housing',
    amount: 1540000,
    pct: 14.0,
    programs: ['Section 8 Vouchers', 'Emergency Housing', 'Housing Navigation'],
    outcomes: 'ED visits ↓50% in housed cohort',
    color: '#da1e28',
  },
  {
    id: 'fs-004',
    name: 'BH Block Grant (SAMHSA)',
    domain: 'Behavioral Health',
    amount: 1980000,
    pct: 18.0,
    programs: ['CCBHC Services', 'Crisis Stabilization', 'Medication Management'],
    outcomes: 'Psych admits ↓50%, 988 connections: 7/mo',
    color: '#6929c4',
  },
  {
    id: 'fs-005',
    name: 'Older Americans Act',
    domain: 'Social Isolation',
    amount: 620000,
    pct: 5.6,
    programs: ['Meals on Wheels', 'Senior Companion', 'Transportation'],
    outcomes: 'PHQ-9 improvement in 44 patients',
    color: '#8a3ffc',
  },
  {
    id: 'fs-006',
    name: 'WIOA / Workforce',
    domain: 'Employment',
    amount: 790000,
    pct: 7.2,
    programs: ['Job Training', 'Vocational Rehab', 'Employment Navigation'],
    outcomes: 'Employment rate ↑12% in 6-month cohort',
    color: '#007d79',
  },
];

const TOTAL_INVESTMENT = FUNDING_STREAMS.reduce((a, f) => a + f.amount, 0);
const TOTAL_SAVINGS = 902000 * 12; // annualized from outcomes linkage

const MONTHLY_BRAIDED = [
  { month: 'Jan', medicaid: 350000, snap: 155000, hud: 128000, bh: 165000, other: 118000 },
  { month: 'Feb', medicaid: 350000, snap: 155000, hud: 128000, bh: 165000, other: 118000 },
  { month: 'Mar', medicaid: 350000, snap: 155000, hud: 128000, bh: 165000, other: 118000 },
  { month: 'Apr', medicaid: 350000, snap: 155000, hud: 128000, bh: 165000, other: 118000 },
  { month: 'May', medicaid: 350000, snap: 155000, hud: 128000, bh: 165000, other: 118000 },
  { month: 'Jun', medicaid: 350000, snap: 155000, hud: 128000, bh: 165000, other: 118000 },
];

type FinancialView = 'clinical' | 'braided';

export default function FinancialDashboardPage() {
  const [view, setView] = useState<FinancialView>('clinical');
  const [fhirSource, setFhirSource] = useState(false);
  const fhirLoadedRef = useRef(false);

  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    // Verify aggregate data presence via any EXEC MeasureReport
    getFhirClient()
      .search('MeasureReport', { _count: 10 })
      .then((bundle: any) => {
        const found = (bundle?.entry ?? []).some((e: any) =>
          e?.resource?.extension?.some(
            (x: any) => x.url?.includes('measure-program') && x.valueString === 'EXEC'
          )
        );
        if (found) setFhirSource(true);
      })
      .catch(() => {});
  }, []);

  return (
    <AppLayout
      pageTitle="Financial Dashboard — Medicare MSSP Track 3"
      breadcrumbs={[
        { label: 'Contracts', href: '/contract-program-selection' },
        { label: 'Medicare MSSP Track 3', href: '/panel-cohort-view' },
        { label: 'Financial Dashboard' },
      ]}
      contextBanner={
        <div className="bg-[#fdf6dd] border-b border-[#f1c21b] px-6 py-2 flex items-center gap-6">
          <span className="text-xs font-semibold text-[#b45309]">
            ⚠ PMPM currently $847.32 vs $890.00 target — 4.8% below
          </span>
          <span className="text-xs text-[#b45309]">Q1 2026 reconciliation pending with CMS</span>
          <span className="ml-auto text-xs text-carbon-gray-50">Data as of Apr 15, 2026</span>
        </div>
      }
    >
      {fhirSource && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            Aggregate MeasureReport resources verified in HAPI FHIR
          </span>
        </div>
      )}
      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setView('clinical')}
          className={`px-4 py-2 text-xs font-semibold border transition-colors ${view === 'clinical' ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
        >
          Clinical VBC
        </button>
        <button
          onClick={() => setView('braided')}
          className={`px-4 py-2 text-xs font-semibold border transition-colors flex items-center gap-1.5 ${view === 'braided' ? 'bg-[#6929c4] text-white border-[#6929c4]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
        >
          <Icon name="LinkIcon" size={13} />
          Braided Funding
        </button>
      </div>

      {/* Clinical VBC View */}
      {view === 'clinical' && (
        <>
          <FinancialKPIGrid />
          <FinancialActionBar />
          <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-3 gap-4 mb-4">
            <div className="xl:col-span-2">
              <PmpmTrendChart />
            </div>
            <div>
              <RafRevenuePanel />
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-2 gap-4 mb-4">
            <CostEnvelopeChart />
            <HighCostPatientTable />
          </div>
        </>
      )}

      {/* Braided Funding View */}
      {view === 'braided' && (
        <div className="space-y-4">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: 'Total Braided Investment',
                value: `$${(TOTAL_INVESTMENT / 1000000).toFixed(1)}M`,
                sub: 'Annualized, 6 funding streams',
                color: '#0043ce',
                icon: 'CurrencyDollarIcon',
              },
              {
                label: 'Clinical Cost Avoidance',
                value: `$${(TOTAL_SAVINGS / 1000000).toFixed(1)}M`,
                sub: 'Estimated annualized savings',
                color: '#198038',
                icon: 'ArrowTrendingDownIcon',
              },
              {
                label: 'ROI Ratio',
                value: '2.47x',
                sub: '$1 invested → $2.47 saved',
                color: '#6929c4',
                icon: 'ChartBarIcon',
              },
              {
                label: 'Funding Streams',
                value: '6',
                sub: 'Federal + state sources',
                color: '#007d79',
                icon: 'LinkIcon',
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
                  <p
                    className="font-mono text-xl font-bold leading-tight"
                    style={{ color: kpi.color }}
                  >
                    {kpi.value}
                  </p>
                  <p className="text-xs font-semibold text-carbon-gray-100">{kpi.label}</p>
                  <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Funding Stream Table */}
            <div className="xl:col-span-2 bg-white border border-carbon-gray-20">
              <div className="px-4 py-3 border-b border-carbon-gray-20">
                <p className="text-sm font-semibold text-carbon-gray-100">
                  Funding Streams — Investment & Outcomes
                </p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                    <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">
                      Funding Source
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">
                      Domain
                    </th>
                    <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">
                      Investment
                    </th>
                    <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">
                      % of Total Program Investment
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">
                      Outcomes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FUNDING_STREAMS.map((fs) => (
                    <tr
                      key={fs.id}
                      className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: fs.color }}
                          />
                          <span className="font-medium text-carbon-gray-100">{fs.name}</span>
                        </div>
                        <div className="ml-4 mt-1 flex flex-wrap gap-1">
                          {fs.programs.slice(0, 2).map((p) => (
                            <span
                              key={p}
                              className="text-2xs px-1.5 py-0.5 bg-carbon-gray-10 text-carbon-gray-50"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 text-2xs font-bold text-white"
                          style={{ backgroundColor: fs.color }}
                        >
                          {fs.domain}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-carbon-gray-100">
                        ${(fs.amount / 1000000).toFixed(1)}M
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold" style={{ color: fs.color }}>
                          {fs.pct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-2xs text-carbon-gray-70">{fs.outcomes}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-carbon-gray-10 border-t border-carbon-gray-20 font-semibold">
                    <td className="px-4 py-3 text-carbon-gray-100">Total</td>
                    <td />
                    <td className="px-4 py-3 text-right font-mono font-bold text-carbon-gray-100">
                      ${(TOTAL_INVESTMENT / 1000000).toFixed(1)}M
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-carbon-gray-100">
                      100%
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pie Chart */}
            <div className="bg-white border border-carbon-gray-20 p-4">
              <p className="text-sm font-semibold text-carbon-gray-100 mb-3">Investment Mix</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={FUNDING_STREAMS}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ pct }) => `${pct}%`}
                    labelLine={false}
                  >
                    {FUNDING_STREAMS.map((fs, idx) => (
                      <Cell key={idx} fill={fs.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`$${(v / 1000000).toFixed(1)}M`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {FUNDING_STREAMS.map((fs) => (
                  <div key={fs.id} className="flex items-center gap-2 text-2xs">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: fs.color }}
                    />
                    <span className="text-carbon-gray-70 flex-1 truncate">{fs.name}</span>
                    <span className="font-mono font-bold" style={{ color: fs.color }}>
                      {fs.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly Stacked Bar */}
          <div className="bg-white border border-carbon-gray-20 p-4">
            <p className="text-sm font-semibold text-carbon-gray-100 mb-4">
              Monthly Braided Funding — 2026 YTD
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={MONTHLY_BRAIDED}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip formatter={(v: any) => [`$${(v / 1000).toFixed(0)}K`]} />
                <Legend />
                <Bar dataKey="medicaid" stackId="a" fill="#0043ce" name="Medicaid 1115" />
                <Bar dataKey="snap" stackId="a" fill="#b45309" name="SNAP" />
                <Bar dataKey="hud" stackId="a" fill="#da1e28" name="HUD" />
                <Bar dataKey="bh" stackId="a" fill="#6929c4" name="BH Block Grant" />
                <Bar dataKey="other" stackId="a" fill="#007d79" name="Other" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
