'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { getPatientById, PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { getFhirClient } from '@/lib/services/fhirClient';
import { toast } from 'sonner';
import { buildProgramNBAs, type ProgramNBA } from '@/lib/careTeam/graph/programActions';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const EPISODE_TYPES = [
  {
    type: 'CHF Exacerbation',
    count: 1,
    avgCost: 32650,
    target: 28000,
    variancePct: 16.6,
    p25: 18000,
    median: 18000,
    p75: 18000,
    p90: 18000,
    histogram: [
      { range: '$0-10k', count: 0, status: 'below' },
      { range: '$10-20k', count: 0, status: 'below' },
      { range: '$20-30k', count: 0, status: 'at' },
      { range: '$30-40k', count: 1, status: 'above' },
      { range: '$40-50k', count: 0, status: 'above' },
    ],
    trend: [
      { month: 'Jan', cost: 29000 },
      { month: 'Feb', cost: 30500 },
      { month: 'Mar', cost: 31200 },
      { month: 'Apr', cost: 32000 },
      { month: 'May', cost: 32650 },
    ],
  },
  {
    type: 'Hip Replacement',
    count: 1,
    avgCost: 28450,
    target: 25000,
    variancePct: 13.8,
    p25: 22000,
    median: 24000,
    p75: 26000,
    p90: 30000,
    histogram: [
      { range: '$0-10k', count: 0, status: 'below' },
      { range: '$10-20k', count: 0, status: 'below' },
      { range: '$20-30k', count: 1, status: 'above' },
      { range: '$30-40k', count: 0, status: 'above' },
    ],
    trend: [
      { month: 'Jan', cost: 24000 },
      { month: 'Feb', cost: 25500 },
      { month: 'Mar', cost: 26800 },
      { month: 'Apr', cost: 27500 },
      { month: 'May', cost: 28450 },
    ],
  },
  {
    type: 'Pneumonia',
    count: 1,
    avgCost: 18200,
    target: 20000,
    variancePct: -9.0,
    p25: 18000,
    median: 18000,
    p75: 18000,
    p90: 18000,
    histogram: [
      { range: '$15-20k', count: 1, status: 'at' },
      { range: '$20-25k', count: 0, status: 'above' },
    ],
    trend: [
      { month: 'Jan', cost: 19500 },
      { month: 'Feb', cost: 19200 },
      { month: 'Mar', cost: 18800 },
      { month: 'Apr', cost: 18500 },
      { month: 'May', cost: 18200 },
    ],
  },
  {
    type: 'Diabetes Management',
    count: 1,
    avgCost: 8450,
    target: 12000,
    variancePct: -29.6,
    p25: 7000,
    median: 8000,
    p75: 10000,
    p90: 11000,
    histogram: [
      { range: '$5-10k', count: 1, status: 'below' },
      { range: '$10-15k', count: 0, status: 'at' },
    ],
    trend: [
      { month: 'Jan', cost: 9200 },
      { month: 'Feb', cost: 9000 },
      { month: 'Mar', cost: 8800 },
      { month: 'Apr', cost: 8600 },
      { month: 'May', cost: 8450 },
    ],
  },
  {
    type: 'COPD Exacerbation',
    count: 1,
    avgCost: 24800,
    target: 22000,
    variancePct: 12.7,
    p25: 18000,
    median: 20000,
    p75: 23000,
    p90: 26000,
    histogram: [
      { range: '$20-25k', count: 1, status: 'above' },
      { range: '$25-30k', count: 0, status: 'above' },
    ],
    trend: [
      { month: 'Jan', cost: 22000 },
      { month: 'Feb', cost: 22800 },
      { month: 'Mar', cost: 23500 },
      { month: 'Apr', cost: 24200 },
      { month: 'May', cost: 24800 },
    ],
  },
];

const OUTCOMES_DATA = [
  {
    metric: 'Readmission Rate (30d)',
    value: '8.3%',
    benchmark: '12.0%',
    status: 'good',
    detail: '1 of 12 episodes',
  },
  {
    metric: 'Complication Rate',
    value: '0%',
    benchmark: '5.2%',
    status: 'good',
    detail: '0 of 12 episodes',
  },
  {
    metric: 'Avg Patient Satisfaction',
    value: '4.3/5.0',
    benchmark: '4.1/5.0',
    status: 'good',
    detail: 'Above benchmark',
  },
  {
    metric: 'Avg Care Plan Adherence',
    value: '82%',
    benchmark: '75%',
    status: 'good',
    detail: 'Above target',
  },
  {
    metric: 'SNF Utilization Rate',
    value: '33%',
    benchmark: '28%',
    status: 'warning',
    detail: '4 of 12 episodes',
  },
  {
    metric: 'ER Utilization Rate',
    value: '58%',
    benchmark: '45%',
    status: 'warning',
    detail: '7 of 12 episodes',
  },
];

const TREND_DATA = [
  { month: 'Jan', chf: 29000, hip: 24000, pneumonia: 19500, diabetes: 9200, copd: 22000 },
  { month: 'Feb', chf: 30500, hip: 25500, pneumonia: 19200, diabetes: 9000, copd: 22800 },
  { month: 'Mar', chf: 31200, hip: 26800, pneumonia: 18800, diabetes: 8800, copd: 23500 },
  { month: 'Apr', chf: 32000, hip: 27500, pneumonia: 18500, diabetes: 8600, copd: 24200 },
  { month: 'May', chf: 32650, hip: 28450, pneumonia: 18200, diabetes: 8450, copd: 24800 },
];

const TREND_LINES = [
  { key: 'chf', name: 'CHF Exacerbation', color: '#da1e28' },
  { key: 'hip', name: 'Hip Replacement', color: '#6929c4' },
  { key: 'pneumonia', name: 'Pneumonia', color: '#0043ce' },
  { key: 'diabetes', name: 'Diabetes Mgmt', color: '#24a148' },
  { key: 'copd', name: 'COPD Exacerbation', color: '#b45309' },
];

const MEMBER_RISK_SCORES = [
  {
    memberId: 'M-00412',
    name: 'Dorothy Hale',
    age: 72,
    episodeType: 'CHF Exacerbation',
    rafScore: 2.84,
    hccCount: 7,
    riskTier: 'Very High',
    riskColor: '#da1e28',
    predictedCost: 38200,
    actualCost: 32650,
    costIndex: 0.85,
    chronicConditions: ['CHF', 'CKD Stage 3', 'T2DM', 'Hypertension'],
    riskTrend: 'increasing',
  },
  {
    memberId: 'M-00287',
    name: 'James Whitfield',
    age: 68,
    episodeType: 'Hip Replacement',
    rafScore: 1.62,
    hccCount: 4,
    riskTier: 'High',
    riskColor: '#b45309',
    predictedCost: 31000,
    actualCost: 28450,
    costIndex: 0.92,
    chronicConditions: ['Osteoarthritis', 'Hypertension', 'Obesity'],
    riskTrend: 'stable',
  },
  {
    memberId: 'M-00519',
    name: 'Loretta Simmons',
    age: 64,
    episodeType: 'Pneumonia',
    rafScore: 1.21,
    hccCount: 3,
    riskTier: 'Moderate',
    riskColor: '#0043ce',
    predictedCost: 22000,
    actualCost: 18200,
    costIndex: 0.83,
    chronicConditions: ['COPD', 'Asthma', 'Smoking Hx'],
    riskTrend: 'decreasing',
  },
  {
    memberId: 'M-00334',
    name: 'Robert Chen',
    age: 59,
    episodeType: 'Diabetes Management',
    rafScore: 1.45,
    hccCount: 5,
    riskTier: 'High',
    riskColor: '#b45309',
    predictedCost: 14500,
    actualCost: 8450,
    costIndex: 0.58,
    chronicConditions: ['T2DM', 'Peripheral Neuropathy', 'Hypertension', 'Obesity'],
    riskTrend: 'decreasing',
  },
  {
    memberId: 'M-00601',
    name: 'Ruth Caldwell',
    age: 77,
    episodeType: 'COPD Exacerbation',
    rafScore: 2.31,
    hccCount: 6,
    riskTier: 'Very High',
    riskColor: '#da1e28',
    predictedCost: 29000,
    actualCost: 24800,
    costIndex: 0.86,
    chronicConditions: ['COPD', 'CHF', 'CKD Stage 2', 'Anemia'],
    riskTrend: 'increasing',
  },
];

// ─── ETG Provider Analysis Data ───────────────────────────────────────────────

interface ProviderRanking {
  rank: number;
  providerId: string;
  name: string;
  specialty: string;
  episodeType: string;
  episodeCount: number;
  avgCost: number;
  peerAvgCost: number;
  costRatio: number;
  performanceScore: number;
  outlierFlag: 'High' | 'Low' | 'Normal';
  costStack: {
    inpatient: number;
    outpatient: number;
    ancillary: number;
    pharmacy: number;
    emergency: number;
  };
  peerStack: {
    inpatient: number;
    outpatient: number;
    ancillary: number;
    pharmacy: number;
    emergency: number;
  };
}

interface ProcedureFrequency {
  procedure: string;
  providerRate: number;
  peerRate: number;
  flag: boolean;
}

interface ReferralPattern {
  referredTo: string;
  specialty: string;
  count: number;
  pct: number;
  avgCostImpact: number;
  concentration: 'High' | 'Medium' | 'Low';
}

const PROVIDER_RANKINGS: ProviderRanking[] = [
  {
    rank: 1,
    providerId: 'PRV-001',
    name: 'Dr. Sarah Okonkwo',
    specialty: 'Cardiology',
    episodeType: 'CHF Exacerbation',
    episodeCount: 14,
    avgCost: 34200,
    peerAvgCost: 28000,
    costRatio: 1.22,
    performanceScore: 58,
    outlierFlag: 'High',
    costStack: { inpatient: 58, outpatient: 4, ancillary: 12, pharmacy: 8, emergency: 18 },
    peerStack: { inpatient: 48, outpatient: 12, ancillary: 14, pharmacy: 10, emergency: 16 },
  },
  {
    rank: 2,
    providerId: 'PRV-002',
    name: 'Dr. Marcus Chen',
    specialty: 'Internal Medicine',
    episodeType: 'CHF Exacerbation',
    episodeCount: 9,
    avgCost: 29800,
    peerAvgCost: 28000,
    costRatio: 1.06,
    performanceScore: 74,
    outlierFlag: 'Normal',
    costStack: { inpatient: 50, outpatient: 10, ancillary: 14, pharmacy: 12, emergency: 14 },
    peerStack: { inpatient: 48, outpatient: 12, ancillary: 14, pharmacy: 10, emergency: 16 },
  },
  {
    rank: 3,
    providerId: 'PRV-003',
    name: 'Dr. Linda Park',
    specialty: 'Cardiology',
    episodeType: 'CHF Exacerbation',
    episodeCount: 11,
    avgCost: 24100,
    peerAvgCost: 28000,
    costRatio: 0.86,
    performanceScore: 91,
    outlierFlag: 'Low',
    costStack: { inpatient: 42, outpatient: 16, ancillary: 16, pharmacy: 14, emergency: 12 },
    peerStack: { inpatient: 48, outpatient: 12, ancillary: 14, pharmacy: 10, emergency: 16 },
  },
  {
    rank: 4,
    providerId: 'PRV-004',
    name: 'Dr. James Whitmore',
    specialty: 'Orthopedics',
    episodeType: 'Hip Replacement',
    episodeCount: 22,
    avgCost: 31500,
    peerAvgCost: 25000,
    costRatio: 1.26,
    performanceScore: 52,
    outlierFlag: 'High',
    costStack: { inpatient: 65, outpatient: 10, ancillary: 16, pharmacy: 6, emergency: 3 },
    peerStack: { inpatient: 55, outpatient: 14, ancillary: 18, pharmacy: 8, emergency: 5 },
  },
  {
    rank: 5,
    providerId: 'PRV-005',
    name: 'Dr. Sarah Johnson',
    specialty: 'Pulmonology',
    episodeType: 'COPD Exacerbation',
    episodeCount: 8,
    avgCost: 21400,
    peerAvgCost: 22000,
    costRatio: 0.97,
    performanceScore: 83,
    outlierFlag: 'Normal',
    costStack: { inpatient: 22, outpatient: 28, ancillary: 16, pharmacy: 30, emergency: 4 },
    peerStack: { inpatient: 25, outpatient: 25, ancillary: 15, pharmacy: 28, emergency: 7 },
  },
];

const PROCEDURE_FREQUENCIES: ProcedureFrequency[] = [
  { procedure: 'Echocardiogram', providerRate: 94, peerRate: 72, flag: true },
  { procedure: 'BNP Lab Panel', providerRate: 88, peerRate: 85, flag: false },
  { procedure: 'Cardiac Catheterization', providerRate: 42, peerRate: 18, flag: true },
  { procedure: 'Chest X-Ray', providerRate: 100, peerRate: 98, flag: false },
  { procedure: 'SNF Placement', providerRate: 71, peerRate: 45, flag: true },
  { procedure: 'Home Health Referral', providerRate: 55, peerRate: 62, flag: false },
];

const REFERRAL_PATTERNS: ReferralPattern[] = [
  {
    referredTo: 'Riverside SNF',
    specialty: 'Skilled Nursing',
    count: 9,
    pct: 64,
    avgCostImpact: 8200,
    concentration: 'High',
  },
  {
    referredTo: 'County Hospital Cardiology',
    specialty: 'Cardiology Consult',
    count: 7,
    pct: 50,
    avgCostImpact: 3400,
    concentration: 'High',
  },
  {
    referredTo: 'Rural Home Health',
    specialty: 'Home Health',
    count: 5,
    pct: 36,
    avgCostImpact: 3100,
    concentration: 'Medium',
  },
  {
    referredTo: 'Valley Imaging Center',
    specialty: 'Radiology',
    count: 12,
    pct: 86,
    avgCostImpact: 1200,
    concentration: 'High',
  },
  {
    referredTo: 'FQHC Clinic',
    specialty: 'Primary Care Follow-up',
    count: 11,
    pct: 79,
    avgCostImpact: 450,
    concentration: 'Medium',
  },
];

// ─── BH Episodes Tab Data ─────────────────────────────────────────────────────

const BH_EPISODE_TYPES = [
  {
    type: 'FUH — Follow-Up After Hospitalization',
    count: 3,
    rate: '78%',
    target: '85%',
    variancePct: -8.2,
    trend: 'decreasing',
    color: '#6929c4',
  },
  {
    type: 'FUM — Follow-Up After ED Visit',
    count: 2,
    rate: '65%',
    target: '80%',
    variancePct: -18.8,
    trend: 'decreasing',
    color: '#da1e28',
  },
  {
    type: 'AMM — Antidepressant Medication Mgmt',
    count: 4,
    rate: '82%',
    target: '75%',
    variancePct: 9.3,
    trend: 'increasing',
    color: '#24a148',
  },
  {
    type: 'IET — Initiation of SUD Treatment',
    count: 2,
    rate: '55%',
    target: '70%',
    variancePct: -21.4,
    trend: 'stable',
    color: '#b45309',
  },
  {
    type: 'CDF — Cardiovascular Monitoring for SUD',
    count: 1,
    rate: '90%',
    target: '85%',
    variancePct: 5.9,
    trend: 'increasing',
    color: '#007d79',
  },
];

const BH_OUTCOMES = [
  {
    metric: 'BH Follow-Up Rate (7d post-discharge)',
    value: '78%',
    benchmark: '85%',
    status: 'warning',
    detail: '7 of 9 BH episodes',
  },
  {
    metric: 'SUD Treatment Initiation Rate',
    value: '55%',
    benchmark: '70%',
    status: 'warning',
    detail: '2 of 4 SUD episodes',
  },
  {
    metric: 'Antidepressant Adherence (6-month)',
    value: '82%',
    benchmark: '75%',
    status: 'good',
    detail: 'Above benchmark',
  },
  {
    metric: 'BH-Related ED Visits (30d)',
    value: '2',
    benchmark: '1.5 avg',
    status: 'warning',
    detail: 'Slightly above avg',
  },
  {
    metric: 'Crisis Diversions (30d)',
    value: '4',
    benchmark: '—',
    status: 'good',
    detail: 'ED diversions via CSU/Mobile',
  },
  {
    metric: 'BH Care Plan Completion',
    value: '71%',
    benchmark: '68%',
    status: 'good',
    detail: 'Above benchmark',
  },
];

const BH_PROVIDER_DATA = [
  {
    name: 'LCSW Denise Park',
    role: 'BH Counselor',
    bhAccessRate: '88%',
    fuhRate: '82%',
    fumRate: '70%',
    patients: 4,
    trend: 'increasing',
  },
  {
    name: 'PsyD Robert Chen',
    role: 'Psychologist',
    bhAccessRate: '75%',
    fuhRate: '78%',
    fumRate: '65%',
    patients: 3,
    trend: 'stable',
  },
  {
    name: 'LMFT Sandra Osei',
    role: 'BH Counselor',
    bhAccessRate: '91%',
    fuhRate: '90%',
    fumRate: '80%',
    patients: 2,
    trend: 'increasing',
  },
];

// ─── Social Program Outcomes Tab Data ────────────────────────────────────────

const SOCIAL_PROGRAM_OUTCOMES = [
  {
    program: 'SNAP Enrollment',
    domain: 'Food Security',
    enrolled: 3,
    completed: 3,
    completionRate: '100%',
    avgDaysToEnroll: 7,
    costImpact: '$702/mo benefit',
    outcome: 'A1C improvement in 2 of 3 patients',
    trend: 'increasing',
    color: '#007d79',
  },
  {
    program: 'Housing Navigation',
    domain: 'Housing',
    enrolled: 2,
    completed: 1,
    completionRate: '50%',
    avgDaysToEnroll: 21,
    costImpact: 'Avoided 1 ED visit',
    outcome: '1 patient stably housed',
    trend: 'stable',
    color: '#0043ce',
  },
  {
    program: 'LIHEAP Utilities',
    domain: 'Utilities',
    enrolled: 1,
    completed: 1,
    completionRate: '100%',
    avgDaysToEnroll: 14,
    costImpact: '$180/mo benefit',
    outcome: 'Medication adherence improved',
    trend: 'stable',
    color: '#6929c4',
  },
  {
    program: 'CHW Home Visit Program',
    domain: 'Care Coordination',
    enrolled: 5,
    completed: 4,
    completionRate: '80%',
    avgDaysToEnroll: 3,
    costImpact: 'Est. $4,200 cost avoidance',
    outcome: '4 of 5 patients met care plan goals',
    trend: 'increasing',
    color: '#198038',
  },
  {
    program: 'BH Engagement (12-week)',
    domain: 'Behavioral Health',
    enrolled: 3,
    completed: 2,
    completionRate: '67%',
    avgDaysToEnroll: 10,
    costImpact: 'Reduced BH ED visits by 50%',
    outcome: 'Depression scores improved in 2 patients',
    trend: 'increasing',
    color: '#b45309',
  },
];

const SDOH_COST_IMPACT = [
  { month: 'Jan', withSdoh: 18200, withoutSdoh: 22400 },
  { month: 'Feb', withSdoh: 17800, withoutSdoh: 22100 },
  { month: 'Mar', withSdoh: 17200, withoutSdoh: 21800 },
  { month: 'Apr', withSdoh: 16500, withoutSdoh: 21500 },
  { month: 'May', withSdoh: 15900, withoutSdoh: 21200 },
];

function BHEpisodesTab() {
  return (
    <div className="space-y-5">
      {/* BH Episode Scorecard */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-carbon-gray-100">BH Episode Scorecard</h3>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              HEDIS BH measures — rates vs targets for active panel
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xs px-2 py-0.5 bg-[#f6f2ff] text-[#6929c4] font-semibold">
              BH Program
            </span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <tr>
              {['BH MEASURE', 'EPISODES', 'RATE', 'TARGET', 'VARIANCE', 'TREND'].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {BH_EPISODE_TYPES.map((ep) => {
              const over = ep.variancePct > 0;
              const trendIcon =
                ep.trend === 'increasing'
                  ? 'ArrowTrendingUpIcon'
                  : ep.trend === 'decreasing'
                    ? 'ArrowTrendingDownIcon'
                    : 'MinusIcon';
              return (
                <tr key={ep.type} className="hover:bg-[#f4f4f4] transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ep.color }}
                      />
                      <span className="text-sm font-medium text-carbon-gray-100">{ep.type}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm tabular-nums">{ep.count}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm font-bold tabular-nums text-carbon-gray-100">
                      {ep.rate}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm tabular-nums text-carbon-gray-70">
                      {ep.target}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`font-mono text-sm font-semibold ${over ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                    >
                      {over ? '+' : ''}
                      {ep.variancePct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <Icon
                        name={trendIcon as any}
                        size={16}
                        className={
                          ep.trend === 'increasing'
                            ? 'text-[#24a148]'
                            : ep.trend === 'decreasing'
                              ? 'text-[#da1e28]'
                              : 'text-carbon-gray-50'
                        }
                      />
                      <span className="text-xs capitalize text-carbon-gray-70">{ep.trend}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* BH Outcomes */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-5 py-4 border-b border-carbon-gray-20">
          <h3 className="text-sm font-semibold text-carbon-gray-100">BH Outcomes Dashboard</h3>
          <p className="text-2xs text-carbon-gray-50 mt-0.5">
            Quality metrics for BH episodes across the panel
          </p>
        </div>
        <div className="divide-y divide-carbon-gray-20">
          {BH_OUTCOMES.map((row) => {
            const good = row.status === 'good';
            return (
              <div key={row.metric} className="px-5 py-4 flex items-center gap-4">
                <div
                  className={`w-2 h-8 flex-shrink-0 ${good ? 'bg-[#24a148]' : 'bg-[#b45309]'}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-carbon-gray-100">{row.metric}</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">{row.detail}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className={`text-base font-bold font-mono ${good ? 'text-[#24a148]' : 'text-[#b45309]'}`}
                  >
                    {row.value}
                  </p>
                  <p className="text-2xs text-carbon-gray-50">Benchmark: {row.benchmark}</p>
                </div>
                <Icon
                  name={good ? 'CheckCircleIcon' : 'ExclamationTriangleIcon'}
                  size={18}
                  className={good ? 'text-[#24a148]' : 'text-[#b45309]'}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* BH Provider Performance */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-5 py-4 border-b border-carbon-gray-20">
          <h3 className="text-sm font-semibold text-carbon-gray-100">BH Provider Performance</h3>
          <p className="text-2xs text-carbon-gray-50 mt-0.5">
            BH access rate, FUH/FUM rates by BH provider
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <tr>
              {[
                'PROVIDER',
                'ROLE',
                'PATIENTS',
                'BH ACCESS RATE',
                'FUH RATE',
                'FUM RATE',
                'TREND',
              ].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {BH_PROVIDER_DATA.map((p) => (
              <tr key={p.name} className="hover:bg-[#f4f4f4] transition-colors">
                <td className="px-5 py-4">
                  <p className="text-sm font-medium text-carbon-gray-100">{p.name}</p>
                </td>
                <td className="px-5 py-4">
                  <span className="text-2xs font-bold px-2 py-0.5 bg-[#f6f2ff] text-[#6929c4]">
                    {p.role}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="font-mono text-sm tabular-nums">{p.patients}</span>
                </td>
                <td className="px-5 py-4">
                  <span className="font-mono text-sm font-bold text-[#6929c4]">
                    {p.bhAccessRate}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="font-mono text-sm tabular-nums text-carbon-gray-100">
                    {p.fuhRate}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="font-mono text-sm tabular-nums text-carbon-gray-100">
                    {p.fumRate}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1">
                    <Icon
                      name={
                        p.trend === 'increasing'
                          ? 'ArrowTrendingUpIcon'
                          : p.trend === 'decreasing'
                            ? 'ArrowTrendingDownIcon'
                            : 'MinusIcon'
                      }
                      size={14}
                      className={
                        p.trend === 'increasing'
                          ? 'text-[#24a148]'
                          : p.trend === 'decreasing'
                            ? 'text-[#da1e28]'
                            : 'text-carbon-gray-50'
                      }
                    />
                    <span className="text-xs capitalize text-carbon-gray-70">{p.trend}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SocialProgramOutcomesTab() {
  const { addReferralTasks, addOpsTask } = useAppContext();
  const { nbas, suppressed } = buildProgramNBAs(SOCIAL_PROGRAM_OUTCOMES);
  const [actModal, setActModal] = useState<ProgramNBA | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const runPlay = () => {
    if (!actModal) return;
    const n = actModal;
    if (n.cohort.length > 0) {
      addReferralTasks(
        n.cohort.map((c, i) => ({
          id: `prog-${n.id}-${c.patientId}-${Date.now()}-${i}`,
          patientId: c.patientId,
          citizenName: c.name,
          action: n.type === 'reengage' ? `Re-engage ${n.program}` : `Enroll in ${n.program}`,
          category: c.category,
          cboName: n.program,
          keystone: c.keystone,
          status: 'pending' as const,
          source: 'manual' as const,
          createdAt: new Date().toISOString(),
        }))
      );
    }
    addOpsTask({
      id: `prog-ops-${n.id}-${Date.now()}`,
      type: 'program',
      title: n.title,
      targetName: n.program,
      detail: `${n.headline} · ${n.cohort.length} citizen action${n.cohort.length !== 1 ? 's' : ''}`,
      status: 'requested',
      createdAt: new Date().toISOString(),
    });
    toast.success(`${n.title} — play launched`, {
      description: `${n.cohort.length} citizen referral${n.cohort.length !== 1 ? 's' : ''} + ops decision logged`,
    });
    setResult(
      `${n.title}: created ${n.cohort.length} referral${n.cohort.length !== 1 ? 's' : ''} on the CHW Social queue + logged 1 ops decision.`
    );
    setActModal(null);
  };
  return (
    <div className="space-y-5">
      {/* Program Next Best Actions — graph-evidenced, keystone-prioritized */}
      {nbas.length > 0 && (
        <div className="bg-white border border-[#c1d9ff]">
          <div className="px-4 py-2.5 bg-[#edf5ff] border-b border-carbon-gray-20 flex items-center gap-2 flex-wrap">
            <Icon name="CpuChipIcon" size={15} className="text-[#0043ce]" />
            <p className="text-sm font-semibold text-[#0043ce]">Program Next Best Actions</p>
            <span className="text-2xs text-carbon-gray-50">
              graph-evidenced · keystone-prioritized · each drives a set of actions
            </span>
          </div>
          {result && (
            <div className="px-4 py-2 bg-[#defbe6] border-b border-[#a7f0ba] flex items-center gap-2">
              <Icon name="CheckCircleIcon" size={13} className="text-[#0e6027] flex-shrink-0" />
              <span className="text-2xs text-[#0e6027] font-medium">{result}</span>
            </div>
          )}
          <div className="divide-y divide-carbon-gray-20">
            {nbas.map((n) => {
              const tc =
                n.type === 'expand' ? '#0043ce' : n.type === 'scale' ? '#198038' : '#b45309';
              return (
                <div key={n.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-carbon-gray-100">{n.title}</span>
                      <span
                        className="text-2xs font-bold px-1.5 py-0.5 text-white"
                        style={{ background: tc }}
                      >
                        {n.headline}
                      </span>
                      {n.dollars && (
                        <span className="text-2xs font-bold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027]">
                          {n.dollars}
                        </span>
                      )}
                      <span
                        className={`text-2xs font-semibold px-1.5 py-0.5 ${n.confidence === 'High' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
                      >
                        {n.confidence}
                      </span>
                    </div>
                    <p className="text-2xs text-carbon-gray-70 mt-0.5">
                      <span className="font-semibold">Why now:</span> {n.whyNow}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-2xs text-carbon-gray-50">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="UserCircleIcon" size={10} /> {n.owner}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-[#6929c4]">
                        <Icon name="CpuChipIcon" size={10} /> {n.agent}
                      </span>
                      <span>·</span>
                      <span>
                        {n.cohort.length} citizen{n.cohort.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {n.actions.map((a) => (
                        <span
                          key={a}
                          className="text-2xs px-1.5 py-0.5 bg-carbon-gray-10 text-carbon-gray-70 border border-carbon-gray-20"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setActModal(n)}
                    className="px-3 py-1.5 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#002d9c] whitespace-nowrap flex-shrink-0 flex items-center gap-1"
                  >
                    <Icon name="BoltIcon" size={10} /> Run play
                  </button>
                </div>
              );
            })}
          </div>
          {suppressed.length > 0 && (
            <div className="px-4 py-2 border-t border-carbon-gray-20 bg-carbon-gray-10">
              <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1">
                Suppressed by evidence engine ({suppressed.length})
              </p>
              {suppressed.map((sup, i) => (
                <p key={i} className="text-2xs text-carbon-gray-50">
                  <span className="line-through">{sup.title}</span> — {sup.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {actModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-lg shadow-2xl max-h-[90vh] overflow-auto">
            <div className="px-6 py-4 border-b border-carbon-gray-20 bg-[#edf5ff] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="CpuChipIcon" size={15} className="text-[#0043ce]" />
                <p className="text-sm font-semibold text-[#0043ce]">{actModal.title}</p>
              </div>
              <button
                onClick={() => setActModal(null)}
                className="text-carbon-gray-50 hover:text-carbon-gray-100"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 text-xs">
              <p className="text-carbon-gray-70">
                <span className="font-semibold">{actModal.headline}</span> · {actModal.whyNow}
              </p>
              <div>
                <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1">
                  Evidence
                </p>
                {actModal.evidence.map((e, i) => (
                  <p key={i} className="text-2xs text-carbon-gray-70 flex items-center gap-1.5">
                    <Icon name="CheckCircleIcon" size={10} className="text-[#0e6027]" /> {e}
                  </p>
                ))}
              </div>
              <div>
                <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1">
                  Citizen cohort ({actModal.cohort.length})
                </p>
                {actModal.cohort.length === 0 && (
                  <p className="text-2xs text-carbon-gray-50">
                    Panel-level decision — no individual citizens.
                  </p>
                )}
                {actModal.cohort.map((c, i) => (
                  <div
                    key={c.patientId + i}
                    className="text-2xs text-carbon-gray-70 flex items-center gap-2 py-0.5"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-carbon-gray-50">· {c.label}</span>
                    {c.keystone && (
                      <span className="text-2xs font-bold px-1 bg-[#fff1f1] text-[#a2191f]">
                        keystone
                      </span>
                    )}
                    {c.blockedGaps.length > 0 && (
                      <span className="text-carbon-gray-50">
                        unblocks: {c.blockedGaps.join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1">
                  Actions this play fires
                </p>
                {actModal.actions.map((a) => (
                  <p key={a} className="text-2xs text-carbon-gray-70 flex items-center gap-1.5">
                    <Icon name="BoltIcon" size={10} className="text-[#0043ce]" /> {a}
                  </p>
                ))}
              </div>
              <p className="text-2xs font-mono text-carbon-gray-50 bg-carbon-gray-10 px-2 py-1 break-all">
                {actModal.cypher}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-carbon-gray-20 bg-carbon-gray-10 flex items-center justify-end gap-2">
              <button
                onClick={() => setActModal(null)}
                className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 bg-white hover:bg-carbon-gray-10"
              >
                Cancel
              </button>
              <button
                onClick={runPlay}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0043ce] hover:bg-[#002d9c]"
              >
                <Icon name="BoltIcon" size={12} /> Run play — {actModal.cohort.length} referral
                {actModal.cohort.length !== 1 ? 's' : ''} + 1 ops decision
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Program Completion Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {SOCIAL_PROGRAM_OUTCOMES.map((prog) => (
          <div key={prog.program} className="bg-white border border-carbon-gray-20 p-4">
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-2 h-10 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: prog.color }}
              />
              <div className="flex-1">
                <p className="text-xs font-semibold text-carbon-gray-100">{prog.program}</p>
                <span
                  className="text-2xs font-bold px-1.5 py-0.5 text-white"
                  style={{ backgroundColor: prog.color }}
                >
                  {prog.domain}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-2xs mb-3">
              <div>
                <span className="text-carbon-gray-50">Enrolled</span>
                <p className="font-mono font-bold text-carbon-gray-100">{prog.enrolled}</p>
              </div>
              <div>
                <span className="text-carbon-gray-50">Completed</span>
                <p className="font-mono font-bold text-carbon-gray-100">{prog.completed}</p>
              </div>
              <div>
                <span className="text-carbon-gray-50">Completion Rate</span>
                <p className="font-mono font-bold" style={{ color: prog.color }}>
                  {prog.completionRate}
                </p>
              </div>
              <div>
                <span className="text-carbon-gray-50">Avg Days to Enroll</span>
                <p className="font-mono font-bold text-carbon-gray-100">{prog.avgDaysToEnroll}d</p>
              </div>
            </div>
            {/* Completion bar */}
            <div className="mb-3">
              <div className="h-2 bg-carbon-gray-20 w-full rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: prog.completionRate, backgroundColor: prog.color }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-start gap-1.5">
                <Icon
                  name="CurrencyDollarIcon"
                  size={11}
                  className="text-[#198038] flex-shrink-0 mt-0.5"
                />
                <span className="text-2xs text-carbon-gray-70">{prog.costImpact}</span>
              </div>
              <div className="flex items-start gap-1.5">
                <Icon
                  name="ArrowTrendingUpIcon"
                  size={11}
                  className="text-[#0043ce] flex-shrink-0 mt-0.5"
                />
                <span className="text-2xs text-carbon-gray-70">{prog.outcome}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SDOH Cost Impact Chart */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1">
          SDOH Intervention — Cost Impact
        </h3>
        <p className="text-2xs text-carbon-gray-50 mb-4">
          Estimated avg episode cost: patients with active SDOH interventions vs without (Jan–May
          2026)
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={SDOH_COST_IMPACT} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="withSdoh"
                name="With SDOH Intervention"
                stroke="#007d79"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="withoutSdoh"
                name="Without SDOH Intervention"
                stroke="#da1e28"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            {
              label: 'Avg Cost Reduction',
              value: '$5,300',
              sub: 'With SDOH vs without (May)',
              color: 'text-[#007d79]',
            },
            {
              label: 'Total Enrolled',
              value: '14',
              sub: 'Across all social programs',
              color: 'text-[#0043ce]',
            },
            {
              label: 'Est. Cost Avoidance',
              value: '$26,500',
              sub: 'Cumulative Jan–May 2026',
              color: 'text-[#198038]',
            },
          ].map((s) => (
            <div key={s.label} className="bg-carbon-gray-10 px-4 py-3 text-center">
              <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs font-semibold text-carbon-gray-100 mt-0.5">{s.label}</p>
              <p className="text-2xs text-carbon-gray-50">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ETG Provider Analysis Tab ────────────────────────────────────────────────

const ETG_COLORS = {
  Inpatient: '#da1e28',
  Outpatient: '#0043ce',
  Ancillary: '#8a3ffc',
  Pharmacy: '#009d9a',
  Emergency: '#f1c21b',
};

function ProviderCostStackBar({
  stack,
  label,
}: {
  stack: {
    inpatient: number;
    outpatient: number;
    ancillary: number;
    pharmacy: number;
    emergency: number;
  };
  label: string;
}) {
  const segments = [
    { key: 'Inpatient', pct: stack.inpatient, color: ETG_COLORS.Inpatient },
    { key: 'Outpatient', pct: stack.outpatient, color: ETG_COLORS.Outpatient },
    { key: 'Ancillary', pct: stack.ancillary, color: ETG_COLORS.Ancillary },
    { key: 'Pharmacy', pct: stack.pharmacy, color: ETG_COLORS.Pharmacy },
    { key: 'Emergency', pct: stack.emergency, color: ETG_COLORS.Emergency },
  ];
  return (
    <div>
      <p className="text-2xs text-carbon-gray-50 mb-1">{label}</p>
      <div className="flex h-3 w-full overflow-hidden rounded-sm">
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
            title={`${seg.key}: ${seg.pct}%`}
          />
        ))}
      </div>
    </div>
  );
}

function ETGProviderAnalysisTab() {
  const [selectedProvider, setSelectedProvider] = useState<ProviderRanking>(PROVIDER_RANKINGS[0]);

  const procChartData = PROCEDURE_FREQUENCIES.map((p) => ({
    procedure: p.procedure.length > 20 ? p.procedure.slice(0, 18) + '…' : p.procedure,
    'Provider Rate': p.providerRate,
    'Peer Rate': p.peerRate,
  }));

  return (
    <div className="space-y-5">
      {/* Provider Ranking Table */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-carbon-gray-100">
              Provider Ranking by Episode Type
            </h3>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              Cost ratio vs ETG benchmark — click a row to view cost stack comparison
            </p>
          </div>
          <div className="flex items-center gap-3 text-2xs">
            {[
              { label: 'High Outlier', color: '#da1e28' },
              { label: 'Normal', color: '#24a148' },
              { label: 'Low Outlier', color: '#0043ce' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                <span className="text-carbon-gray-70">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <tr>
              {[
                'Rank',
                'Provider',
                'Episode Type',
                'Episodes',
                'Avg Cost',
                'Peer Avg',
                'Cost Ratio',
                'Perf. Score',
                'Cost Stack vs Peers',
                'Outlier',
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {PROVIDER_RANKINGS.map((prov) => {
              const isSelected = selectedProvider.providerId === prov.providerId;
              const outlierStyle =
                prov.outlierFlag === 'High'
                  ? 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]'
                  : prov.outlierFlag === 'Low'
                    ? 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]'
                    : 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]';
              const ratioColor =
                prov.costRatio > 1.15
                  ? 'text-[#da1e28]'
                  : prov.costRatio < 0.9
                    ? 'text-[#24a148]'
                    : 'text-[#b45309]';
              return (
                <tr
                  key={prov.providerId}
                  className={`transition-colors cursor-pointer ${isSelected ? 'bg-[#edf5ff]' : 'hover:bg-[#f4f4f4]'}`}
                  onClick={() => setSelectedProvider(prov)}
                >
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm font-bold text-carbon-gray-50">
                      #{prov.rank}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-carbon-gray-100">{prov.name}</p>
                    <p className="text-2xs text-carbon-gray-50">{prov.specialty}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs text-carbon-gray-70 whitespace-nowrap">
                      {prov.episodeType}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm tabular-nums">{prov.episodeCount}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm tabular-nums font-semibold text-carbon-gray-100">
                      ${prov.avgCost.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm tabular-nums text-carbon-gray-70">
                      ${prov.peerAvgCost.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`font-mono text-sm font-bold tabular-nums ${ratioColor}`}>
                      {prov.costRatio.toFixed(2)}×
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-carbon-gray-20 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${prov.performanceScore}%`,
                            backgroundColor:
                              prov.performanceScore >= 80
                                ? '#24a148'
                                : prov.performanceScore >= 65
                                  ? '#b45309'
                                  : '#da1e28',
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-carbon-gray-100">
                        {prov.performanceScore}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 min-w-[160px]">
                    <div className="space-y-1">
                      <ProviderCostStackBar stack={prov.costStack} label="Provider" />
                      <ProviderCostStackBar stack={prov.peerStack} label="Peers" />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`text-2xs font-semibold px-2 py-0.5 border rounded-sm ${outlierStyle}`}
                    >
                      {prov.outlierFlag}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected Provider Detail */}
      <div className="bg-[#edf5ff] border border-[#97c1ff] px-4 py-2 flex items-center gap-2">
        <Icon name="InformationCircleIcon" size={14} className="text-[#0043ce]" />
        <span className="text-xs text-[#0043ce] font-medium">
          Showing detail for: {selectedProvider.name} — {selectedProvider.episodeType}
        </span>
      </div>

      {/* Procedure Frequency + Referral Pattern */}
      <div className="grid grid-cols-2 gap-4">
        {/* Procedure Frequency */}
        <div className="bg-white border border-carbon-gray-20 px-5 py-5">
          <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1">
            Procedure Frequency vs Peer Group
          </h3>
          <p className="text-2xs text-carbon-gray-50 mb-4">
            Rate of procedure use for same ETG — {selectedProvider.name}
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={procChartData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                barCategoryGap="20%"
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 110]}
                />
                <YAxis type="category" dataKey="procedure" tick={{ fontSize: 10 }} width={110} />
                <Tooltip formatter={(v: number) => [`${v}%`, '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Provider Rate" fill="#0043ce" radius={[0, 2, 2, 0]} />
                <Bar dataKey="Peer Rate" fill="#b45309" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1.5">
            {PROCEDURE_FREQUENCIES.filter((p) => p.flag).map((p) => (
              <div
                key={p.procedure}
                className="flex items-center gap-2 bg-[#fff1f1] border border-[#ffb3b8] px-3 py-1.5"
              >
                <Icon
                  name="ExclamationCircleIcon"
                  size={12}
                  className="text-[#da1e28] flex-shrink-0"
                />
                <span className="text-2xs text-[#da1e28] font-medium">
                  {p.procedure}: {p.providerRate}% vs peer {p.peerRate}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Referral Pattern Panel */}
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-5 py-4 border-b border-carbon-gray-20">
            <h3 className="text-sm font-semibold text-carbon-gray-100">
              Referral Pattern Analysis
            </h3>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              Providers involved in {selectedProvider.name}'s episodes — referral concentration
            </p>
          </div>
          <div className="divide-y divide-carbon-gray-20">
            {REFERRAL_PATTERNS.map((ref) => {
              const concColor =
                ref.concentration === 'High'
                  ? 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]'
                  : ref.concentration === 'Medium'
                    ? 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]'
                    : 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]';
              return (
                <div
                  key={ref.referredTo}
                  className="px-5 py-3.5 flex items-center gap-3 hover:bg-[#f4f4f4] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-carbon-gray-100">{ref.referredTo}</p>
                      <span
                        className={`text-2xs font-semibold px-1.5 py-0.5 border rounded-sm ${concColor}`}
                      >
                        {ref.concentration}
                      </span>
                    </div>
                    <p className="text-2xs text-carbon-gray-50 mt-0.5">
                      {ref.specialty} · {ref.count} referrals
                    </p>
                    <div className="mt-1.5 h-1.5 bg-carbon-gray-20 w-full">
                      <div className="h-full bg-[#0043ce]" style={{ width: `${ref.pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold font-mono text-carbon-gray-100">{ref.pct}%</p>
                    <p className="text-2xs text-carbon-gray-50">of episodes</p>
                    <p className="text-2xs font-mono text-carbon-gray-70 mt-0.5">
                      +${ref.avgCostImpact.toLocaleString()} avg
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-3 bg-[#f4f4f4] border-t border-carbon-gray-20">
            <p className="text-2xs text-carbon-gray-50">
              <Icon
                name="ExclamationTriangleIcon"
                size={11}
                className="inline text-[#b45309] mr-1"
              />
              High concentration referrals may indicate referral pattern bias or possible collusion
              — review recommended
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type TabKey =
  | 'efficiency-scorecard'
  | 'outcomes-dashboard'
  | 'trend-analysis'
  | 'etg-provider-analysis'
  | 'bh-episodes'
  | 'social-program-outcomes';

// ─── FHIR Encounter row shape ─────────────────────────────────────────────────
interface FhirEncounterRow {
  id: string;
  date: string;
  type: string;
  setting: string;
  provider: string;
  reason: string;
  status: string;
}

function EpisodicManagementContent() {
  const router = useRouter();
  const { useMockData } = useAppContext();
  const { activeCitizenId: activePatientId } = useActiveCitizen();
  const patient = getPatientById(activePatientId);
  const [activeTab, setActiveTab] = useState<TabKey>('efficiency-scorecard');

  // ── FHIR Encounter fetch ─────────────────────────────────────────────────────
  const [fhirEncounters, setFhirEncounters] = useState<FhirEncounterRow[]>([]);
  const [encounterLoading, setEncounterLoading] = useState(false);

  useEffect(() => {
    if (useMockData) {
      setFhirEncounters([]);
      return;
    }
    const fhirId = PLATFORM_TO_FHIR_ID_MAP[activePatientId];
    if (!fhirId) return;
    setEncounterLoading(true);
    getFhirClient()
      .search('Encounter', { patient: fhirId, _count: 20, _sort: '-date' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((bundle: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entries: any[] = bundle.entry ?? [];
        const rows: FhirEncounterRow[] = entries
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => e.resource)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((r: any) => r?.resourceType === 'Encounter')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((enc: any) => ({
            id: enc.id ?? '',
            date: enc.period?.start?.split('T')[0] ?? '',
            type: enc.type?.[0]?.text ?? enc.class?.display ?? 'Encounter',
            setting:
              enc.class?.code === 'PHN'
                ? 'Phone'
                : enc.class?.code === 'AMB'
                  ? 'Outpatient'
                  : 'Inpatient',
            provider:
              enc.participant?.[0]?.individual?.display ?? enc.serviceProvider?.display ?? '—',
            reason: enc.reasonCode?.[0]?.text ?? '',
            status: enc.status ?? 'finished',
          }));
        if (rows.length > 0) setFhirEncounters(rows);
      })
      .catch(() => {
        /* fall through to static data */
      })
      .finally(() => setEncounterLoading(false));
  }, [activePatientId, useMockData]);

  const totalEpisodes = EPISODE_TYPES.reduce((a, e) => a + e.count, 0);
  const activeEpisodes = 1;
  const avgCost = Math.round(
    EPISODE_TYPES.reduce((a, e) => a + e.avgCost * e.count, 0) / totalEpisodes
  );
  const avgVariance = EPISODE_TYPES.reduce((a, e) => a + e.variancePct, 0) / EPISODE_TYPES.length;

  const tabs: { key: TabKey; label: string; icon: string; domain?: string }[] = [
    { key: 'efficiency-scorecard', label: 'Efficiency Scorecard', icon: 'TableCellsIcon' },
    { key: 'outcomes-dashboard', label: 'Outcomes Dashboard', icon: 'HeartIcon' },
    { key: 'trend-analysis', label: 'Trend Analysis', icon: 'ArrowTrendingUpIcon' },
    { key: 'etg-provider-analysis', label: 'ETG Provider Analysis', icon: 'UserGroupIcon' },
    { key: 'bh-episodes', label: 'BH Episodes', icon: 'BrainIcon', domain: 'BH' },
    {
      key: 'social-program-outcomes',
      label: 'Social Program Outcomes',
      icon: 'HomeIcon',
      domain: 'Social',
    },
  ];

  return (
    <AppLayout
      pageTitle="Episodic Management Analytics"
      breadcrumbs={[
        { label: 'Care Manager', href: '/care-manager' },
        { label: 'Patient Panel' },
        { label: 'Episodic Management Analytics' },
      ]}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-medium text-[#0043ce]">
            Care Manager: {patient?.careManager ?? 'Sarah Johnson'}
          </span>
          <span className="text-xs text-[#0043ce]">
            Contract: {patient?.contract ?? 'Medicaid RHTP Track 3'}
          </span>
          <span className="text-xs text-[#0043ce]">
            Track and analyze episodes of care across your patient panel
          </span>
        </div>
      }
    >
      {/* Panel scope strip (panel-level analytics — not a single pinned patient) */}
      <div className="bg-[#001141] border-b border-[#003a75] px-6 py-2.5 flex items-center gap-4 flex-wrap">
        <div className="w-7 h-7 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
          <Icon name="UserGroupIcon" size={14} className="text-white" />
        </div>
        <span className="text-xs font-semibold text-white">Patient Panel</span>
        <span className="text-2xs text-[#a8c8e8]">
          Episodic management across your attributed panel
        </span>
        <span className="text-2xs text-[#a8c8e8] ml-auto">
          {totalEpisodes} episodes · {MEMBER_RISK_SCORES.length} risk-profiled members
        </span>
      </div>
      {/* KPI Strip */}
      <div className="bg-white border-b border-carbon-gray-20 grid grid-cols-4 divide-x divide-carbon-gray-20">
        {[
          {
            label: 'Total Episodes',
            value: totalEpisodes,
            icon: 'ClipboardDocumentListIcon',
            color: 'text-[#0043ce]',
          },
          {
            label: 'Active Episodes',
            value: activeEpisodes,
            icon: 'BoltIcon',
            color: 'text-[#b45309]',
          },
          {
            label: 'Avg Cost',
            value: `$${avgCost.toLocaleString()}`,
            icon: 'CurrencyDollarIcon',
            color: 'text-carbon-gray-100',
          },
          {
            label: 'Avg Variance',
            value: `${avgVariance >= 0 ? '+' : ''}${avgVariance.toFixed(1)}%`,
            icon: 'ArrowTrendingUpIcon',
            color: avgVariance > 0 ? 'text-[#da1e28]' : 'text-[#24a148]',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="px-6 py-4 flex items-center gap-3">
            <Icon name={kpi.icon as any} size={20} className="text-carbon-gray-30 flex-shrink-0" />
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">{kpi.label}</p>
              <p className={`text-2xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Tab bar */}
        <div className="bg-white border border-carbon-gray-20 px-4 py-3 flex items-center gap-1 flex-wrap">
          {tabs.map((tab) => {
            const domainStyle =
              tab.domain === 'BH'
                ? activeTab === tab.key
                  ? 'bg-[#6929c4] text-white'
                  : 'text-[#6929c4] hover:bg-[#f6f2ff]'
                : tab.domain === 'Social'
                  ? activeTab === tab.key
                    ? 'bg-[#007d79] text-white'
                    : 'text-[#007d79] hover:bg-[#d9fbfb]'
                  : activeTab === tab.key
                    ? 'bg-[#0043ce] text-white'
                    : 'text-carbon-gray-70 hover:bg-carbon-gray-10 hover:text-carbon-gray-100';
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${domainStyle}`}
              >
                <Icon name={tab.icon as any} size={14} />
                {tab.label}
                {tab.domain && (
                  <span
                    className={`text-2xs px-1.5 py-0.5 font-bold rounded-sm ${activeTab === tab.key ? 'bg-white/20 text-white' : tab.domain === 'BH' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-[#d9fbfb] text-[#007d79]'}`}
                  >
                    {tab.domain}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Efficiency Scorecard Tab */}
        {activeTab === 'efficiency-scorecard' && (
          <div className="space-y-4">
            {/* Episode Efficiency Table */}
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-carbon-gray-100">
                    Episode Efficiency Scorecard
                  </h3>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">
                    Performance metrics by episode type with trend indicators
                  </p>
                </div>
                <button className="flex items-center gap-1.5 text-xs font-semibold text-[#0043ce] border border-[#0043ce] px-3 py-1.5 hover:bg-[#d0e2ff] transition-colors">
                  <Icon name="ArrowDownTrayIcon" size={13} /> Export
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {['EPISODE TYPE', 'COUNT', 'AVG COST', 'TARGET', 'VARIANCE', 'TREND'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-5 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-20">
                  {EPISODE_TYPES.map((ep) => {
                    const over = ep.variancePct > 0;
                    return (
                      <tr key={ep.type} className="hover:bg-[#f4f4f4] transition-colors">
                        <td className="px-5 py-4">
                          <span className="text-sm font-medium text-carbon-gray-100">
                            {ep.type}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm tabular-nums">{ep.count}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm tabular-nums font-semibold text-carbon-gray-100">
                            ${ep.avgCost.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm tabular-nums text-carbon-gray-70">
                            ${ep.target.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`font-mono text-sm font-semibold ${over ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                          >
                            {over ? '+' : ''}
                            {ep.variancePct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Icon
                              name={over ? 'ArrowTrendingUpIcon' : 'ArrowTrendingDownIcon'}
                              size={16}
                              className={over ? 'text-[#da1e28]' : 'text-[#24a148]'}
                            />
                            {/* Mini sparkline */}
                            <div className="flex items-end gap-0.5 h-5">
                              {ep.trend.map((t, i) => {
                                const maxVal = Math.max(...ep.trend.map((x) => x.cost));
                                const minVal = Math.min(...ep.trend.map((x) => x.cost));
                                const range = maxVal - minVal || 1;
                                const h = Math.round(((t.cost - minVal) / range) * 16) + 4;
                                return (
                                  <div
                                    key={i}
                                    className={`w-1.5 ${over ? 'bg-[#da1e28]' : 'bg-[#24a148]'} opacity-70`}
                                    style={{ height: `${h}px` }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── FHIR Encounters Panel — live mode only ─────────────────── */}
            {!useMockData && (
              <div className="bg-white border border-carbon-gray-20">
                <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center gap-3">
                  <Icon name="CalendarDaysIcon" size={15} className="text-[#0043ce]" />
                  <div>
                    <h3 className="text-sm font-semibold text-carbon-gray-100">
                      FHIR Encounters — {patient?.name ?? activePatientId}
                    </h3>
                    <p className="text-2xs text-carbon-gray-50 mt-0.5">
                      Recent encounters read from HAPI FHIR R4
                    </p>
                  </div>
                  {encounterLoading && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-[#0043ce]">
                      <span className="w-2 h-2 rounded-full border border-[#0043ce] border-t-transparent animate-spin" />
                      Loading…
                    </span>
                  )}
                  {!encounterLoading && fhirEncounters.length > 0 && (
                    <span className="ml-auto text-xs font-medium text-[#198038]">
                      ✓ {fhirEncounters.length} encounters from FHIR
                    </span>
                  )}
                </div>
                {fhirEncounters.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                      <tr>
                        {['DATE', 'TYPE', 'SETTING', 'PROVIDER', 'REASON', 'STATUS'].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-carbon-gray-20">
                      {fhirEncounters.map((enc) => (
                        <tr key={enc.id} className="hover:bg-carbon-gray-10 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-carbon-gray-70">
                            {enc.date}
                          </td>
                          <td className="px-4 py-3 text-xs text-carbon-gray-100 font-medium">
                            {enc.type}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-2xs font-semibold px-2 py-0.5 ${enc.setting === 'Phone' ? 'bg-[#d9fbfb] text-[#007d79]' : enc.setting === 'Outpatient' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#fff1f1] text-[#da1e28]'}`}
                            >
                              {enc.setting}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-carbon-gray-70">{enc.provider}</td>
                          <td className="px-4 py-3 text-xs text-carbon-gray-70">{enc.reason}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-2xs font-semibold px-2 py-0.5 ${enc.status === 'finished' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fdf6dd] text-[#b45309]'}`}
                            >
                              {enc.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : !encounterLoading ? (
                  <div className="px-5 py-8 text-center text-carbon-gray-50 text-sm">
                    No FHIR encounters found for this patient. Switch to Mock Data mode to see
                    static episode data.
                  </div>
                ) : null}
              </div>
            )}

            {/* Individual Member Risk Score Section */}
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-carbon-gray-100">
                    Individual Member Risk Score
                  </h3>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">
                    Risk-adjusted member profiles — RAF scores, HCC burden, and cost index by
                    episode
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 text-2xs">
                    {[
                      { label: 'Very High', color: '#da1e28' },
                      { label: 'High', color: '#b45309' },
                      { label: 'Moderate', color: '#0043ce' },
                    ].map((tier) => (
                      <div key={tier.label} className="flex items-center gap-1">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: tier.color }}
                        />
                        <span className="text-carbon-gray-70">{tier.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {[
                      'MEMBER',
                      'EPISODE TYPE',
                      'RAF SCORE',
                      'HCC COUNT',
                      'RISK TIER',
                      'PREDICTED COST',
                      'ACTUAL COST',
                      'COST INDEX',
                      'CHRONIC CONDITIONS',
                      'RISK TREND',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-20">
                  {MEMBER_RISK_SCORES.map((member) => {
                    const costIndexColor =
                      member.costIndex >= 1.0
                        ? '#da1e28'
                        : member.costIndex >= 0.85
                          ? '#b45309'
                          : '#24a148';
                    const trendIcon =
                      member.riskTrend === 'increasing'
                        ? 'ArrowTrendingUpIcon'
                        : member.riskTrend === 'decreasing'
                          ? 'ArrowTrendingDownIcon'
                          : 'MinusIcon';
                    const trendColor =
                      member.riskTrend === 'increasing'
                        ? 'text-[#da1e28]'
                        : member.riskTrend === 'decreasing'
                          ? 'text-[#24a148]'
                          : 'text-carbon-gray-50';
                    return (
                      <tr key={member.memberId} className="hover:bg-[#f4f4f4] transition-colors">
                        <td className="px-4 py-4">
                          <p className="text-sm font-medium text-carbon-gray-100">{member.name}</p>
                          <p className="text-2xs text-carbon-gray-50 font-mono">
                            {member.memberId} · Age {member.age}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs text-carbon-gray-70">{member.episodeType}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono text-sm font-bold tabular-nums"
                              style={{ color: member.riskColor }}
                            >
                              {member.rafScore.toFixed(2)}
                            </span>
                            <div className="w-16 h-1.5 bg-carbon-gray-20 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min((member.rafScore / 3.5) * 100, 100)}%`,
                                  backgroundColor: member.riskColor,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono text-sm tabular-nums font-semibold text-carbon-gray-100">
                            {member.hccCount}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className="inline-flex items-center px-2 py-0.5 text-2xs font-semibold rounded-sm text-white"
                            style={{ backgroundColor: member.riskColor }}
                          >
                            {member.riskTier}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono text-sm tabular-nums text-carbon-gray-70">
                            ${member.predictedCost.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono text-sm tabular-nums font-semibold text-carbon-gray-100">
                            ${member.actualCost.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono text-sm font-bold tabular-nums"
                              style={{ color: costIndexColor }}
                            >
                              {member.costIndex.toFixed(2)}
                            </span>
                            <span className="text-2xs text-carbon-gray-50">
                              {member.costIndex < 1.0 ? 'under' : 'over'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1">
                            {member.chronicConditions.map((cond) => (
                              <span
                                key={cond}
                                className="inline-flex items-center px-1.5 py-0.5 text-2xs bg-carbon-gray-10 text-carbon-gray-70 border border-carbon-gray-20 rounded-sm"
                              >
                                {cond}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className={`flex items-center gap-1 ${trendColor}`}>
                            <Icon name={trendIcon as any} size={15} />
                            <span className="text-xs font-medium capitalize">
                              {member.riskTrend}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Risk Adjustment Summary Footer */}
              <div className="px-5 py-4 border-t border-carbon-gray-20 bg-[#f4f4f4] grid grid-cols-4 gap-4">
                {[
                  {
                    label: 'Avg RAF Score',
                    value: (
                      MEMBER_RISK_SCORES.reduce((a, m) => a + m.rafScore, 0) /
                      MEMBER_RISK_SCORES.length
                    ).toFixed(2),
                    sub: 'Panel average',
                    color: 'text-[#6929c4]',
                  },
                  {
                    label: 'Very High Risk Members',
                    value: MEMBER_RISK_SCORES.filter(
                      (m) => m.riskTier === 'Very High'
                    ).length.toString(),
                    sub: 'Require intensive mgmt',
                    color: 'text-[#da1e28]',
                  },
                  {
                    label: 'Avg Cost Index',
                    value: (
                      MEMBER_RISK_SCORES.reduce((a, m) => a + m.costIndex, 0) /
                      MEMBER_RISK_SCORES.length
                    ).toFixed(2),
                    sub: '<1.0 = under predicted',
                    color: 'text-[#24a148]',
                  },
                  {
                    label: 'Rising Risk Members',
                    value: MEMBER_RISK_SCORES.filter(
                      (m) => m.riskTrend === 'increasing'
                    ).length.toString(),
                    sub: 'Proactive outreach needed',
                    color: 'text-[#b45309]',
                  },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs font-semibold text-carbon-gray-100 mt-0.5">
                      {stat.label}
                    </p>
                    <p className="text-2xs text-carbon-gray-50">{stat.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Outcomes Dashboard Tab */}
        {activeTab === 'outcomes-dashboard' && (
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-5 py-4 border-b border-carbon-gray-20">
              <h3 className="text-sm font-semibold text-carbon-gray-100">Outcomes Dashboard</h3>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">
                Quality metrics aggregated across all episodes
              </p>
            </div>
            <div className="divide-y divide-carbon-gray-20">
              {OUTCOMES_DATA.map((row) => {
                const good = row.status === 'good';
                return (
                  <div key={row.metric} className="px-5 py-4 flex items-center gap-4">
                    <div
                      className={`w-2 h-8 flex-shrink-0 ${good ? 'bg-[#24a148]' : 'bg-[#b45309]'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-carbon-gray-100">{row.metric}</p>
                      <p className="text-2xs text-carbon-gray-50 mt-0.5">{row.detail}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p
                        className={`text-base font-bold font-mono ${good ? 'text-[#24a148]' : 'text-[#b45309]'}`}
                      >
                        {row.value}
                      </p>
                      <p className="text-2xs text-carbon-gray-50">Benchmark: {row.benchmark}</p>
                    </div>
                    <Icon
                      name={good ? 'CheckCircleIcon' : 'ExclamationTriangleIcon'}
                      size={18}
                      className={good ? 'text-[#24a148]' : 'text-[#b45309]'}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trend Analysis Tab */}
        {activeTab === 'trend-analysis' && (
          <div className="bg-white border border-carbon-gray-20 px-5 py-5">
            <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1">
              Cost Variance Trend by Episode Type
            </h3>
            <p className="text-2xs text-carbon-gray-50 mb-4">
              Average episode cost over time (Jan–May 2026)
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={TREND_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {TREND_LINES.map((line) => (
                    <Line
                      key={line.key}
                      type="monotone"
                      dataKey={line.key}
                      name={line.name}
                      stroke={line.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-3">
              {EPISODE_TYPES.map((ep) => {
                const over = ep.variancePct > 0;
                const firstVal = ep.trend[0].cost;
                const lastVal = ep.trend[ep.trend.length - 1].cost;
                const changePct = ((lastVal - firstVal) / firstVal) * 100;
                return (
                  <div key={ep.type} className="bg-carbon-gray-10 px-3 py-2.5">
                    <p className="text-2xs font-semibold text-carbon-gray-70 truncate">{ep.type}</p>
                    <p
                      className={`text-sm font-bold font-mono mt-1 ${over ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                    >
                      {changePct >= 0 ? '+' : ''}
                      {changePct.toFixed(1)}%
                    </p>
                    <p className="text-2xs text-carbon-gray-50">5-month trend</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ETG Provider Analysis Tab */}
        {activeTab === 'etg-provider-analysis' && <ETGProviderAnalysisTab />}

        {/* BH Episodes Tab */}
        {activeTab === 'bh-episodes' && <BHEpisodesTab />}

        {/* Social Program Outcomes Tab */}
        {activeTab === 'social-program-outcomes' && <SocialProgramOutcomesTab />}
      </div>
    </AppLayout>
  );
}

export default function EpisodicManagementAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-carbon-gray-50 text-sm">
          Loading analytics...
        </div>
      }
    >
      <EpisodicManagementContent />
    </Suspense>
  );
}
