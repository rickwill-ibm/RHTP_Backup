'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';

const OUTCOMES_DATA = [
  {
    intervention: 'Housing Stability',
    clinicalOutcome: 'ED Visit Reduction',
    patientsIntervened: 89,
    baselineRate: 4.2,
    postRate: 2.1,
    reduction: 50,
    costSavings: 187400,
    timeToEffect: '6 months',
    evidence: 'Strong',
    domain: 'Housing',
  },
  {
    intervention: 'Food Security (SNAP)',
    clinicalOutcome: 'A1C Improvement',
    patientsIntervened: 124,
    baselineRate: 9.1,
    postRate: 7.8,
    reduction: 14,
    costSavings: 94200,
    timeToEffect: '3 months',
    evidence: 'Moderate',
    domain: 'Food',
  },
  {
    intervention: 'BH Counseling (CCBHC)',
    clinicalOutcome: 'Inpatient Psych Admit Reduction',
    patientsIntervened: 67,
    baselineRate: 1.8,
    postRate: 0.9,
    reduction: 50,
    costSavings: 312000,
    timeToEffect: '4 months',
    evidence: 'Strong',
    domain: 'BH',
  },
  {
    intervention: 'Transport Benefit',
    clinicalOutcome: 'Missed Appointment Rate',
    patientsIntervened: 156,
    baselineRate: 28,
    postRate: 11,
    reduction: 61,
    costSavings: 48700,
    timeToEffect: '1 month',
    evidence: 'Strong',
    domain: 'Transport',
  },
  {
    intervention: 'CHW Outreach',
    clinicalOutcome: 'Care Gap Closure Rate',
    patientsIntervened: 203,
    baselineRate: 41,
    postRate: 67,
    reduction: -26,
    costSavings: 221000,
    timeToEffect: '3 months',
    evidence: 'Moderate',
    domain: 'Care Coord',
  },
  {
    intervention: 'Social Isolation Program',
    clinicalOutcome: 'Depression Screening (PHQ-9)',
    patientsIntervened: 44,
    baselineRate: 14.2,
    postRate: 9.8,
    reduction: 31,
    costSavings: 38900,
    timeToEffect: '6 months',
    evidence: 'Emerging',
    domain: 'Social',
  },
];

const ROI_TREND = [
  { month: 'Jan', investment: 48000, savings: 62000 },
  { month: 'Feb', investment: 51000, savings: 71000 },
  { month: 'Mar', investment: 54000, savings: 89000 },
  { month: 'Apr', investment: 57000, savings: 112000 },
  { month: 'May', investment: 61000, savings: 134000 },
  { month: 'Jun', investment: 64000, savings: 158000 },
];

const DOMAIN_COLORS: Record<string, string> = {
  Housing: '#da1e28',
  Food: '#b45309',
  BH: '#6929c4',
  Transport: '#0043ce',
  'Care Coord': '#198038',
  Social: '#8a3ffc',
};

const EVIDENCE_CONFIG: Record<string, { bg: string; text: string }> = {
  Strong: { bg: '#defbe6', text: '#0e6027' },
  Moderate: { bg: '#fdf6dd', text: '#b45309' },
  Emerging: { bg: '#d0e2ff', text: '#0043ce' },
};

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

// Domains included per program (all others are excluded when a program is selected)
const PROGRAM_DOMAINS: Record<string, string[]> = {
  'RHTP — Medicaid 1115 Waiver': ['Housing', 'Food', 'Transport'],
  'RHTP — BH Block Grant (SAMHSA)': ['BH', 'Social'],
  'RHTP — CHW Outreach Program': ['Care Coord', 'Food'],
  'RHTP — Social Needs Navigation': ['Housing', 'Social', 'Transport'],
};

// Regional scale factors (fraction of total attributed panel in each county)
const REGION_SCALE: Record<string, number> = {
  'Jackson County': 0.22,
  'Clay County': 0.16,
  'Platte County': 0.12,
  'Cass County': 0.18,
  'Ray County': 0.09,
};

export default function OutcomesLinkagePage() {
  const [activeTab, setActiveTab] = useState<'table' | 'roi' | 'scatter'>('table');
  const [rhtpProgram, setRhtpProgram] = useState(RHTP_PROGRAMS[0]);
  const [fhirSource, setFhirSource] = useState(false);
  const [fhirRoiCount, setFhirRoiCount] = useState(0);
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
                (x: any) => x.url?.includes('obs-type') && x.valueString === 'outcomes-roi'
              )
          ).length;
        if (count > 0) {
          setFhirRoiCount(count);
          setFhirSource(true);
        }
      })
      .catch(() => {});
  }, []);
  const [region, setRegion] = useState(REGIONS[0]);

  const isFiltered = rhtpProgram !== RHTP_PROGRAMS[0] || region !== REGIONS[0];

  // ── Derive filtered + scaled outcomes data ────────────────────────────────
  const regionScale = region !== REGIONS[0] ? (REGION_SCALE[region] ?? 1) : 1;

  const filteredOutcomes = OUTCOMES_DATA.filter(
    (row) =>
      rhtpProgram === RHTP_PROGRAMS[0] || (PROGRAM_DOMAINS[rhtpProgram] ?? []).includes(row.domain)
  ).map((row) => ({
    ...row,
    patientsIntervened: Math.max(1, Math.round(row.patientsIntervened * regionScale)),
    costSavings: Math.round(row.costSavings * regionScale),
  }));

  // ROI trend scaled by region AND proportionally by program scope
  // Program scale = fraction of total savings attributable to selected program's domains
  const programSavingsFraction = (() => {
    if (rhtpProgram === RHTP_PROGRAMS[0]) return 1;
    const inScopeTotal = OUTCOMES_DATA.filter((r) =>
      (PROGRAM_DOMAINS[rhtpProgram] ?? []).includes(r.domain)
    ).reduce((a, r) => a + r.costSavings, 0);
    const grandTotal = OUTCOMES_DATA.reduce((a, r) => a + r.costSavings, 0);
    return grandTotal > 0 ? inScopeTotal / grandTotal : 1;
  })();

  const scaledRoiTrend = ROI_TREND.map((d) => ({
    ...d,
    investment: Math.round(d.investment * regionScale * programSavingsFraction),
    savings: Math.round(d.savings * regionScale * programSavingsFraction),
  }));

  const totalPatients = filteredOutcomes.reduce((a, c) => a + c.patientsIntervened, 0);
  const totalSavings = filteredOutcomes.reduce((a, c) => a + c.costSavings, 0);

  // ROI = total savings from filtered outcomes ÷ estimated investment (from scaled trend)
  // Using filteredOutcomes savings as numerator ensures program scope affects the ratio
  const totalInvestment = scaledRoiTrend.reduce((a, d) => a + d.investment, 0);
  const roiRatio = totalInvestment > 0 ? (totalSavings / totalInvestment).toFixed(2) : '—';

  // Avg ED Diversion Rate — weighted by patients from Housing + BH rows in filtered set
  // Uses patient-weighted average so region (which scales patientsIntervened) affects the result
  const edRows = filteredOutcomes.filter((r) => r.domain === 'Housing' || r.domain === 'BH');
  const edTotalPatients = edRows.reduce((a, r) => a + r.patientsIntervened, 0);
  const avgEdDiversionRate =
    edTotalPatients > 0
      ? Math.round(
          edRows.reduce((a, r) => a + Math.abs(r.reduction) * r.patientsIntervened, 0) /
            edTotalPatients
        )
      : null;
  const edDiversionLabel =
    edRows.length > 0
      ? edRows.map((r) => (r.domain === 'Housing' ? 'Housing' : 'BH')).join(' + ') +
        ` (${edTotalPatients} patients)`
      : 'No ED-related interventions in scope';

  return (
    <AppLayout
      pageTitle="Outcomes Linkage — Social to Clinical ROI"
      breadcrumbs={[
        { label: 'RHTP Program', href: '/contract-program-selection' },
        { label: 'Analytics & Outcomes', href: '/executive-outcomes-dashboard' },
        { label: 'Outcomes Linkage' },
      ]}
    >
      {fhirSource && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            {fhirRoiCount} ROI Intervention Observations verified in HAPI FHIR
          </span>
        </div>
      )}
      {/* ── Context & Filter Banner ─────────────────────────────────────────── */}
      <div className="bg-[#defbe6] border border-[#198038] p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <div className="flex items-center gap-1.5">
            <Icon name="InformationCircleIcon" size={15} style={{ color: '#198038' }} />
            <span className="text-xs font-semibold text-[#0e6027]">Population Context</span>
          </div>
          <span className="text-xs text-[#198038]">
            ROI data reflects social interventions delivered to the{' '}
            <strong>RHTP-attributed Medicaid/Medicare population</strong> in South Dakota. Savings
            are estimated clinical cost avoidance over a 6-month measurement window. Use filters to
            scope by RHTP program or region.
          </span>
          {isFiltered && (
            <button
              onClick={() => {
                setRhtpProgram(RHTP_PROGRAMS[0]);
                setRegion(REGIONS[0]);
              }}
              className="ml-auto text-2xs font-semibold text-[#198038] underline hover:no-underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {/* RHTP Program filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-2xs font-semibold text-[#198038] uppercase tracking-wide whitespace-nowrap">
              RHTP Program
            </label>
            <select
              value={rhtpProgram}
              onChange={(e) => setRhtpProgram(e.target.value)}
              className="text-xs border border-[#198038] bg-white text-carbon-gray-100 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#198038]"
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
            <label className="text-2xs font-semibold text-[#198038] uppercase tracking-wide whitespace-nowrap">
              Region
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="text-xs border border-[#198038] bg-white text-carbon-gray-100 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#198038]"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Active scope summary */}
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-2xs bg-[#198038] text-white px-2 py-0.5 font-medium">
            {rhtpProgram === RHTP_PROGRAMS[0] ? 'All RHTP Programs' : rhtpProgram}
          </span>
          <span className="text-2xs bg-[#198038] text-white px-2 py-0.5 font-medium">
            {region === REGIONS[0] ? 'All Regions' : region}
          </span>
          <span className="text-2xs text-[#198038] px-2 py-0.5 border border-[#198038]">
            {totalPatients} patients intervened · Jan–Jun 2026 · Estimated savings: $
            {(totalSavings / 1000).toFixed(0)}K
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          {
            label: 'Total Patients Intervened',
            value: totalPatients.toLocaleString(),
            sub: `Across ${filteredOutcomes.length} intervention${filteredOutcomes.length !== 1 ? 's' : ''}`,
            color: '#0043ce',
            icon: 'UserGroupIcon',
          },
          {
            label: 'Estimated Cost Savings',
            value: `$${(totalSavings / 1000).toFixed(0)}K`,
            sub: 'Annualized, 6-month window',
            color: '#198038',
            icon: 'CurrencyDollarIcon',
          },
          {
            label: 'Avg ED Diversion Rate',
            value: avgEdDiversionRate !== null ? `${avgEdDiversionRate}%` : 'N/A',
            sub: edDiversionLabel,
            color: '#da1e28',
            icon: 'ArrowUturnLeftIcon',
          },
          {
            label: 'ROI Ratio',
            value: `${roiRatio}x`,
            sub: '$1 invested → savings returned',
            color: '#6929c4',
            icon: 'ChartBarIcon',
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

      {/* Executive Narrative */}
      <div className="bg-[#d0e2ff] border border-[#0043ce] p-4 mb-4 flex items-start gap-3">
        <Icon name="LightBulbIcon" size={18} style={{ color: '#0043ce' }} />
        <div>
          <p className="text-xs font-semibold text-[#001d6c]">Executive Story</p>
          <p className="text-xs text-[#0043ce] mt-0.5">
            South Dakota DHSS social interventions across housing, food, behavioral health, and
            transportation — delivered through RHTP-funded programs (
            {rhtpProgram === RHTP_PROGRAMS[0] ? 'all programs' : rhtpProgram}
            {region !== REGIONS[0] ? `, ${region}` : ''}) — generated an estimated{' '}
            <strong>${(totalSavings / 1000).toFixed(0)}K in clinical cost avoidance</strong> over 6
            months — a {roiRatio}x return on social program investment.
            {filteredOutcomes.find((r) => r.domain === 'Housing')
              ? ` Housing stability alone reduced ED visits by ${filteredOutcomes.find((r) => r.domain === 'Housing')?.reduction}% for ${filteredOutcomes.find((r) => r.domain === 'Housing')?.patientsIntervened} patients.`
              : ''}
          </p>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'table', label: 'Intervention Outcomes' },
          { key: 'roi', label: 'Investment vs Savings' },
          { key: 'scatter', label: 'Savings by Domain' },
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

      {/* Intervention Table */}
      {activeTab === 'table' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Social Intervention
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Clinical Outcome
                </th>
                <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Patients
                </th>
                <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Baseline
                </th>
                <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Post</th>
                <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Change
                </th>
                <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Cost Savings
                </th>
                <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
                  Evidence
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOutcomes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-carbon-gray-50">
                    No interventions recorded for the selected program scope.
                  </td>
                </tr>
              ) : (
                filteredOutcomes.map((row, idx) => {
                  const ev = EVIDENCE_CONFIG[row.evidence];
                  const domainColor = DOMAIN_COLORS[row.domain];
                  const isImprovement = row.reduction > 0;
                  return (
                    <tr
                      key={idx}
                      className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: domainColor }}
                          />
                          <span className="font-medium text-carbon-gray-100">
                            {row.intervention}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-carbon-gray-70">{row.clinicalOutcome}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-carbon-gray-100">
                        {row.patientsIntervened}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-carbon-gray-70">
                        {row.baselineRate}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-carbon-gray-70">
                        {row.postRate}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="font-mono font-bold"
                          style={{ color: isImprovement ? '#0e6027' : '#da1e28' }}
                        >
                          {isImprovement ? '↓' : '↑'} {Math.abs(row.reduction)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#198038]">
                        ${(row.costSavings / 1000).toFixed(0)}K
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="px-2 py-0.5 text-2xs font-bold"
                          style={{ backgroundColor: ev.bg, color: ev.text }}
                        >
                          {row.evidence}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-carbon-gray-10 border-t border-carbon-gray-20 font-semibold">
                <td className="px-4 py-3 text-carbon-gray-100" colSpan={2}>
                  Total ({filteredOutcomes.length} interventions)
                </td>
                <td className="px-4 py-3 text-center font-mono">{totalPatients}</td>
                <td colSpan={3} />
                <td className="px-4 py-3 text-right font-mono font-bold text-[#198038]">
                  ${(totalSavings / 1000).toFixed(0)}K
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ROI Trend */}
      {activeTab === 'roi' && (
        <div className="bg-white border border-carbon-gray-20 p-4">
          <p className="text-sm font-semibold text-carbon-gray-100 mb-1">
            Social Program Investment vs Clinical Cost Savings — 2026
          </p>
          <p className="text-2xs text-carbon-gray-50 mb-4">
            Monthly RHTP social program spend vs estimated clinical cost avoidance (
            {rhtpProgram === RHTP_PROGRAMS[0] ? 'all programs' : rhtpProgram}
            {region !== REGIONS[0] ? `, ${region}` : ''}).
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart key={`roi::${rhtpProgram}::${region}`} data={scaledRoiTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v: any) => [`$${(v / 1000).toFixed(0)}K`]} />
              <Legend />
              <Line
                type="monotone"
                dataKey="savings"
                stroke="#198038"
                strokeWidth={2.5}
                name="Clinical Cost Savings"
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="investment"
                stroke="#0043ce"
                strokeWidth={2}
                name="Social Program Investment"
                strokeDasharray="5 3"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Savings by Domain */}
      {activeTab === 'scatter' && (
        <div className="bg-white border border-carbon-gray-20 p-4">
          <p className="text-sm font-semibold text-carbon-gray-100 mb-4">
            Cost Savings by Intervention Domain
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              key={`${rhtpProgram}::${region}`}
              data={filteredOutcomes.map((d) => ({
                name: d.intervention,
                savings: d.costSavings,
                domain: d.domain,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v: any) => [`$${(v / 1000).toFixed(0)}K`, 'Savings']} />
              <Bar dataKey="savings" radius={[2, 2, 0, 0]}>
                {filteredOutcomes.map((d, i) => (
                  <Cell key={i} fill={DOMAIN_COLORS[d.domain] ?? '#198038'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AppLayout>
  );
}
