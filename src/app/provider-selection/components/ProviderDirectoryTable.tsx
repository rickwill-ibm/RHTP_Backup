'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';

import { mockProviders, type Provider } from '@/lib/mockData';

import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useWorkflowMachine } from '@/lib/workflowMachine';

// ─── Provider Network Map ─────────────────────────────────────────────────────
// SD-focused: Bennett County center (43.7°N, 101.7°W)
// 14 SD frontier counties: Bennett, Oglala Lakota, Tripp, Fall River, Gregory,
// Todd, Lyman, Jones, Haakon, Jackson, Shannon, Mellette, Brule, Charles Mix

const SD_PROVIDERS = [
  {
    id: 'sd-prov-001',
    name: 'Prairie Health Services',
    type: 'FQHC',
    city: 'Martin',
    county: 'Bennett',
    lat: 43.18,
    lng: -101.73,
    tier: 'Preferred',
    distance: 12,
    accepting: true,
    specialty: 'Primary Care / Family Medicine',
  },
  {
    id: 'sd-prov-002',
    name: 'Cedar Bluff Regional Healthcare Center',
    type: 'CAH',
    city: 'Winner',
    county: 'Tripp',
    lat: 43.37,
    lng: -99.86,
    tier: 'In-Network',
    distance: 47,
    accepting: true,
    specialty: 'Primary Care / Pulmonology',
  },
  {
    id: 'sd-prov-003',
    name: 'Cedar Valley Critical Access Hospital',
    type: 'Hospital',
    city: 'Yankton',
    county: 'Yankton',
    lat: 42.88,
    lng: -97.39,
    tier: 'Preferred',
    distance: 89,
    accepting: false,
    specialty: 'Nephrology / Geriatrics',
  },
  {
    id: 'sd-prov-004',
    name: 'Riverbend Health Services',
    type: 'CAH',
    city: 'Hot Springs',
    county: 'Fall River',
    lat: 43.43,
    lng: -103.47,
    tier: 'In-Network',
    distance: 112,
    accepting: true,
    specialty: 'Orthopedics / Surgery',
  },
  {
    id: 'sd-prov-005',
    name: 'Summit Regional — Rapid City',
    type: 'Hospital',
    city: 'Rapid City',
    county: 'Pennington',
    lat: 44.08,
    lng: -103.23,
    tier: 'Preferred',
    distance: 147,
    accepting: true,
    specialty: 'Cardiology / Ophthalmology',
  },
  {
    id: 'sd-prov-006',
    name: 'Riverside Medical Associates',
    type: 'FQHC',
    city: 'Gregory',
    county: 'Gregory',
    lat: 43.23,
    lng: -99.43,
    tier: 'In-Network',
    distance: 78,
    accepting: true,
    specialty: 'Gastroenterology / Internal Medicine',
  },
  {
    id: 'sd-prov-007',
    name: 'Tribal Health Program Administration',
    type: 'IHS',
    city: 'Pine Ridge',
    county: 'Oglala Lakota',
    lat: 43.02,
    lng: -102.56,
    tier: 'Preferred',
    distance: 38,
    accepting: true,
    specialty: 'Family Medicine / BH',
  },
  {
    id: 'sd-prov-008',
    name: 'Cedar Valley Metro Hospital',
    type: 'Hospital',
    city: 'Sioux Falls',
    county: 'Minnehaha',
    lat: 43.54,
    lng: -96.73,
    tier: 'Preferred',
    distance: 198,
    accepting: true,
    specialty: 'Endocrinology / Behavioral Health',
  },
  {
    id: 'sd-prov-009',
    name: 'Riverbend Community Health FQHC',
    type: 'FQHC',
    city: 'Winner',
    county: 'Tripp',
    lat: 43.37,
    lng: -99.87,
    tier: 'In-Network',
    distance: 47,
    accepting: true,
    specialty: 'Internal Medicine',
  },
  {
    id: 'sd-prov-010',
    name: 'Frontier Community Action CBO',
    type: 'CBO',
    city: 'Martin',
    county: 'Bennett',
    lat: 43.18,
    lng: -101.72,
    tier: 'Preferred',
    distance: 12,
    accepting: true,
    specialty: 'Social Services / SDOH',
  },
];

const SD_COUNTIES_14 = [
  'Bennett',
  'Oglala Lakota',
  'Tripp',
  'Fall River',
  'Gregory',
  'Todd',
  'Lyman',
  'Jones',
  'Haakon',
  'Jackson',
  'Shannon',
  'Mellette',
  'Brule',
  'Charles Mix',
];

const SD_HIGHWAYS = [
  { name: 'SD Hwy 18', from: 'Martin', to: 'Hot Springs', miles: 112 },
  { name: 'US-83', from: 'Winner', to: 'Pierre', miles: 89 },
  { name: 'I-90', from: 'Rapid City', to: 'Sioux Falls', miles: 351 },
];

function NetworkTierBadge({ tier }: { tier: Provider['networkTier'] }) {
  const map = {
    Preferred: 'bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]',
    'In-Network': 'bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]',
    'Out-of-Network': 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]',
  };
  return (
    <span className={`inline-flex items-center text-2xs font-semibold px-2 py-0.5 ${map[tier]}`}>
      {tier}
    </span>
  );
}

// ─── Referral Workflow Chip ───────────────────────────────────────────────────
function ReferralWorkflowChip({ providerId }: { providerId: string }) {
  const { getWorkflowStatus, getWorkflow } = useWorkflowMachine();
  const status = getWorkflowStatus('provider-referral', `ref-${providerId}`);
  const wf = getWorkflow('provider-referral', `ref-${providerId}`);

  if (status === 'idle') return null;

  const cfg = {
    'in-progress': {
      cls: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
      label: `Referral — Step ${wf?.currentStep ?? 1}/3`,
    },
    'awaiting-review': {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Awaiting EMR Submission',
    },
    completed: { cls: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]', label: 'Referral Submitted' },
    rejected: { cls: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]', label: 'Referral Cancelled' },
    idle: { cls: '', label: '' },
  } as const;

  const c = cfg[status];
  return (
    <span className={`inline-flex items-center text-2xs font-semibold px-2 py-0.5 border ${c.cls}`}>
      {c.label}
    </span>
  );
}

function CostPercentileBar({ pct }: { pct: number }) {
  const color = pct <= 33 ? 'bg-[#24a148]' : pct <= 66 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-carbon-gray-20">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`text-xs font-mono tabular-nums ${pct <= 33 ? 'text-[#24a148]' : pct <= 66 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
      >
        {pct}th
      </span>
    </div>
  );
}

function QualityScoreDisplay({ score }: { score: number }) {
  const color = score >= 90 ? 'text-[#24a148]' : score >= 80 ? 'text-[#b45309]' : 'text-[#da1e28]';
  return <span className={`font-mono text-sm font-semibold tabular-nums ${color}`}>{score}</span>;
}

function ProviderDetailPanel({
  provider,
  onClose,
  onInitiateReferral,
}: {
  provider: Provider;
  onClose: () => void;
  onInitiateReferral: (provider: Provider) => void;
}) {
  const [activeTab, setActiveTab] = useState<'profile' | 'performance' | 'referral'>('profile');
  const [referralConfirmed, setReferralConfirmed] = useState(false);
  const [referralNote, setReferralNote] = useState('');
  const [referralUrgency, setReferralUrgency] = useState<'Routine' | 'Urgent' | 'STAT'>('Routine');
  const [referralId, setReferralId] = useState('');
  const [submittedAt, setSubmittedAt] = useState('');

  // Mock performance history data
  const performanceHistory = [
    { period: 'Q1 2025', quality: 82, cost: 68, satisfaction: 87, referrals: 14 },
    { period: 'Q2 2025', quality: 85, cost: 62, satisfaction: 89, referrals: 18 },
    {
      period: 'Q3 2025',
      quality: provider.qualityScore - 4,
      cost: provider.costPercentile + 3,
      satisfaction: provider.patientSatisfaction - 2,
      referrals: 21,
    },
    {
      period: 'Q4 2025',
      quality: provider.qualityScore - 2,
      cost: provider.costPercentile - 2,
      satisfaction: provider.patientSatisfaction,
      referrals: 19,
    },
    {
      period: 'Q1 2026',
      quality: provider.qualityScore,
      cost: provider.costPercentile,
      satisfaction: provider.patientSatisfaction,
      referrals: 23,
    },
  ];

  const qualityDomains = [
    { label: 'Preventive Care', score: Math.min(100, provider.qualityScore + 3), benchmark: 82 },
    {
      label: 'Chronic Disease Mgmt',
      score: Math.min(100, provider.qualityScore - 2),
      benchmark: 79,
    },
    { label: 'Care Coordination', score: Math.min(100, provider.qualityScore + 1), benchmark: 80 },
    { label: 'Patient Engagement', score: provider.patientSatisfaction, benchmark: 84 },
    {
      label: 'Medication Adherence',
      score: Math.min(100, provider.qualityScore - 5),
      benchmark: 76,
    },
  ];

  const maxQuality = Math.max(...performanceHistory.map((h) => h.quality));
  const chartHeight = 80;

  const tabs = [
    { id: 'profile' as const, label: 'Profile' },
    { id: 'performance' as const, label: 'Performance' },
    { id: 'referral' as const, label: 'Refer' },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white border-l border-carbon-gray-20 shadow-carbon-lg z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-carbon-gray-20 bg-carbon-gray-10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-[#0f62fe] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">
              {provider.name
                .split(' ')
                .map((w) => w[0])
                .slice(1, 3)
                .join('')}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-carbon-gray-100 truncate">{provider.name}</h3>
            <p className="text-2xs text-carbon-gray-50 truncate">{provider.specialty}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 flex-shrink-0"
        >
          <Icon name="XMarkIcon" size={18} />
        </button>
      </div>

      {/* Status strip */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-carbon-gray-20 bg-white flex-shrink-0">
        <span
          className={`inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 ${
            provider.networkTier === 'Preferred'
              ? 'bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]'
              : provider.networkTier === 'In-Network'
                ? 'bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]'
                : 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]'
          }`}
        >
          {provider.networkTier}
        </span>
        {provider.vbcAligned && (
          <span className="text-2xs px-1.5 py-0.5 bg-[#d0e2ff] text-[#0043ce] font-semibold border border-[#97c1ff]">
            VBC Aligned
          </span>
        )}
        <span
          className={`ml-auto inline-flex items-center gap-1 text-2xs font-semibold ${provider.acceptingNewPatients ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
        >
          <Icon
            name={provider.acceptingNewPatients ? 'CheckCircleIcon' : 'ClockIcon'}
            size={13}
            className={
              provider.acceptingNewPatients ? 'text-[#24a148] mt-0.5' : 'text-[#b45309] mt-0.5'
            }
          />
          {provider.acceptingNewPatients ? 'Accepting Patients' : 'Not Accepting — Waitlist'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-carbon-gray-20 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? 'text-[#0f62fe] border-b-2 border-[#0f62fe] bg-white'
                : 'text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <div className="p-5 space-y-5">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  key: 'pd-qual',
                  label: 'Quality Score',
                  value: provider.qualityScore.toString(),
                  color:
                    provider.qualityScore >= 90
                      ? 'text-[#24a148]'
                      : provider.qualityScore >= 80
                        ? 'text-[#b45309]'
                        : 'text-[#da1e28]',
                },
                {
                  key: 'pd-cost',
                  label: 'Cost %ile',
                  value: `${provider.costPercentile}th`,
                  color:
                    provider.costPercentile <= 33
                      ? 'text-[#24a148]'
                      : provider.costPercentile <= 66
                        ? 'text-[#b45309]'
                        : 'text-[#da1e28]',
                },
                {
                  key: 'pd-stars',
                  label: 'Stars Rating',
                  value: provider.starsRating.toString(),
                  color: 'text-[#f1c21b]',
                },
              ].map((s) => (
                <div
                  key={s.key}
                  className="bg-carbon-gray-10 border border-carbon-gray-20 px-3 py-2.5 text-center"
                >
                  <p className={`text-xl font-bold font-mono tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Accepting status detail */}
            <div
              className={`rounded-none border px-4 py-3 ${provider.acceptingNewPatients ? 'bg-[#defbe6] border-[#a7f0ba]' : 'bg-[#fff8e1] border-[#f1c21b]'}`}
            >
              <div className="flex items-start gap-2">
                <Icon
                  name={provider.acceptingNewPatients ? 'CheckCircleIcon' : 'ClockIcon'}
                  size={16}
                  className={
                    provider.acceptingNewPatients
                      ? 'text-[#24a148] mt-0.5'
                      : 'text-[#b45309] mt-0.5'
                  }
                />
                <div>
                  <p
                    className={`text-xs font-semibold ${provider.acceptingNewPatients ? 'text-[#0e6027]' : 'text-[#b45309]'}`}
                  >
                    {provider.acceptingNewPatients
                      ? 'Currently Accepting New Patients'
                      : 'Not Accepting — Waitlist Available'}
                  </p>
                  <p className="text-2xs text-carbon-gray-70 mt-0.5">
                    {provider.acceptingNewPatients
                      ? `Avg wait time: ${provider.avgWaitDays} days · Patient satisfaction: ${provider.patientSatisfaction}%`
                      : `Estimated waitlist: ${provider.avgWaitDays + 14}–${provider.avgWaitDays + 30} days · Contact office to join waitlist`}
                  </p>
                </div>
              </div>
            </div>

            {/* Provider details */}
            <div className="space-y-0">
              {[
                { key: 'pd-npi', label: 'NPI', value: provider.npi },
                {
                  key: 'pd-facility',
                  label: 'Affiliated Facility',
                  value: provider.affiliatedFacility,
                },
                {
                  key: 'pd-address',
                  label: 'Address',
                  value: `${provider.address}, ${provider.city}, ${provider.state} ${provider.zip}`,
                },
                { key: 'pd-phone', label: 'Phone', value: provider.phone },
                {
                  key: 'pd-board',
                  label: 'Board Certified',
                  value: provider.boardCertified ? 'Yes' : 'No',
                },
                { key: 'pd-wait', label: 'Avg Wait Time', value: `${provider.avgWaitDays} days` },
                {
                  key: 'pd-sat',
                  label: 'Patient Satisfaction',
                  value: `${provider.patientSatisfaction}%`,
                },
                { key: 'pd-langs', label: 'Languages', value: provider.languagesSpoken.join(', ') },
                { key: 'pd-dist', label: 'Distance', value: `${provider.distance} miles` },
              ].map((f) => (
                <div
                  key={f.key}
                  className="flex justify-between items-start gap-2 py-2 border-b border-carbon-gray-20 last:border-0"
                >
                  <span className="text-2xs text-carbon-gray-50 flex-shrink-0">{f.label}</span>
                  <span className="text-xs font-medium text-carbon-gray-100 text-right">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PERFORMANCE TAB ── */}
        {activeTab === 'performance' && (
          <div className="p-5 space-y-5">
            {/* Trend chart */}
            <div>
              <p className="text-xs font-semibold text-carbon-gray-100 mb-3">
                Quality Score Trend (5 Quarters)
              </p>
              <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-4">
                <div className="flex items-end gap-2 h-20">
                  {performanceHistory.map((h, i) => {
                    const barH = Math.round((h.quality / 100) * chartHeight);
                    const isLast = i === performanceHistory.length - 1;
                    return (
                      <div
                        key={`bar-${h.period}`}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <span className="text-2xs font-mono text-carbon-gray-70">{h.quality}</span>
                        <div
                          className={`h-full ${isLast ? 'bg-[#0f62fe]' : 'bg-[#97c1ff]'}`}
                          style={{ height: `${barH}px` }}
                        />
                        <span
                          className="text-2xs text-carbon-gray-50 whitespace-nowrap"
                          style={{ fontSize: '9px' }}
                        >
                          {h.period}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quality domain breakdown */}
            <div>
              <p className="text-xs font-semibold text-carbon-gray-100 mb-3">
                Quality Domain Scores vs. Benchmark
              </p>
              <div className="space-y-2.5">
                {qualityDomains.map((d) => (
                  <div key={`qd-${d.label}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-2xs text-carbon-gray-70">{d.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xs text-carbon-gray-50">
                          Benchmark: {d.benchmark}
                        </span>
                        <span
                          className={`text-2xs font-semibold font-mono ${d.score >= d.benchmark ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                        >
                          {d.score}
                        </span>
                      </div>
                    </div>
                    <div className="relative h-2 bg-carbon-gray-20">
                      {/* Benchmark marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-carbon-gray-70 z-10"
                        style={{ left: `${d.benchmark}%` }}
                      />
                      <div
                        className={`h-full ${d.score >= d.benchmark ? 'bg-[#24a148]' : 'bg-[#da1e28]'}`}
                        style={{ width: `${d.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quarterly summary table */}
            <div>
              <p className="text-xs font-semibold text-carbon-gray-100 mb-2">
                Quarterly Performance Summary
              </p>
              <div className="border border-carbon-gray-20 overflow-hidden">
                <table className="w-full text-2xs">
                  <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                    <tr>
                      {['Period', 'Quality', 'Cost %ile', 'Satisfaction', 'Referrals'].map((h) => (
                        <th
                          key={`ph-${h}`}
                          className="px-2 py-2 text-left font-semibold text-carbon-gray-70 uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon-gray-20">
                    {performanceHistory.map((h, i) => (
                      <tr
                        key={`pr-${h.period}`}
                        className={i === performanceHistory.length - 1 ? 'bg-[#edf5ff]' : ''}
                      >
                        <td className="px-2 py-2 font-medium text-carbon-gray-100">{h.period}</td>
                        <td
                          className={`px-2 py-2 font-mono font-semibold ${h.quality >= 85 ? 'text-[#24a148]' : h.quality >= 75 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                        >
                          {h.quality}
                        </td>
                        <td
                          className={`px-2 py-2 font-mono ${h.cost <= 33 ? 'text-[#24a148]' : h.cost <= 66 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                        >
                          {h.cost}th
                        </td>
                        <td className="px-2 py-2 font-mono text-carbon-gray-70">
                          {h.satisfaction}%
                        </td>
                        <td className="px-2 py-2 font-mono text-carbon-gray-70">{h.referrals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── REFERRAL TAB ── */}
        {activeTab === 'referral' && (
          <div className="p-5 space-y-4">
            {referralConfirmed ? (
              <div className="space-y-4">
                {/* Receipt header */}
                <div className="flex flex-col items-center py-6 gap-3 text-center border-b border-carbon-gray-20">
                  <div className="w-14 h-14 bg-[#defbe6] flex items-center justify-center">
                    <Icon name="CheckCircleIcon" size={32} className="text-[#24a148]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-carbon-gray-100">Referral Submitted</p>
                    <p className="text-xs text-carbon-gray-50 mt-1">
                      Your referral has been confirmed and logged.
                    </p>
                  </div>
                </div>

                {/* Confirmation receipt */}
                <div className="bg-[#defbe6] border border-[#a7f0ba] px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-2xs font-semibold text-[#0e6027] uppercase tracking-wide">
                      Confirmation Receipt
                    </p>
                    <span className="text-2xs font-mono font-bold text-[#0e6027]">
                      {referralId}
                    </span>
                  </div>
                  <div className="flex justify-between text-2xs border-t border-[#a7f0ba] pt-2">
                    <span className="text-carbon-gray-70">Submitted</span>
                    <span className="font-medium text-carbon-gray-100">{submittedAt}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Provider</span>
                    <span className="font-medium text-carbon-gray-100">{provider.name}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Specialty</span>
                    <span className="font-medium text-carbon-gray-100">{provider.specialty}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Network</span>
                    <span className="font-medium text-carbon-gray-100">{provider.networkTier}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Urgency</span>
                    <span
                      className={`font-bold ${referralUrgency === 'STAT' ? 'text-[#da1e28]' : referralUrgency === 'Urgent' ? 'text-[#b45309]' : 'text-[#0e6027]'}`}
                    >
                      {referralUrgency}
                    </span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Est. Wait</span>
                    <span className="font-medium text-carbon-gray-100">
                      {provider.avgWaitDays} days
                    </span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Facility</span>
                    <span className="font-medium text-carbon-gray-100 text-right max-w-[180px]">
                      {provider.affiliatedFacility}
                    </span>
                  </div>
                  {referralNote.trim() && (
                    <div className="border-t border-[#a7f0ba] pt-2">
                      <p className="text-2xs text-carbon-gray-70 mb-1">Clinical Note</p>
                      <p className="text-2xs text-carbon-gray-100 italic leading-relaxed">
                        {referralNote}
                      </p>
                    </div>
                  )}
                </div>

                {/* Status indicator */}
                <div className="bg-[#d0e2ff] border border-[#97c1ff] px-3 py-2.5 flex items-center gap-2">
                  <Icon name="ClockIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
                  <p className="text-2xs text-[#0043ce]">
                    Referral is pending provider acceptance. You will be notified when the
                    appointment is scheduled.
                  </p>
                </div>

                {/* Actions */}
                <button
                  className="carbon-btn-primary w-full justify-center py-2.5"
                  onClick={() => {
                    onInitiateReferral(provider);
                    onClose();
                  }}
                >
                  <Icon name="ArrowTopRightOnSquareIcon" size={15} />
                  Open Full Referral Journey
                </button>
                <button
                  className="carbon-btn-secondary w-full justify-center py-2"
                  onClick={() => {
                    setReferralConfirmed(false);
                    setReferralId('');
                    setSubmittedAt('');
                  }}
                >
                  Edit Referral Details
                </button>
              </div>
            ) : (
              <>
                {/* Provider summary for referral */}
                <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#0f62fe] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-xs">
                      {provider.name
                        .split(' ')
                        .map((w) => w[0])
                        .slice(1, 3)
                        .join('')}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-carbon-gray-100">{provider.name}</p>
                    <p className="text-2xs text-carbon-gray-50">
                      {provider.specialty} · {provider.networkTier}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p
                      className={`text-2xs font-semibold ${provider.acceptingNewPatients ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                    >
                      {provider.acceptingNewPatients ? '✓ Accepting' : '✗ Waitlist'}
                    </p>
                    <p className="text-2xs text-carbon-gray-50">~{provider.avgWaitDays}d wait</p>
                  </div>
                </div>

                {!provider.acceptingNewPatients && (
                  <div className="bg-[#fff8e1] border border-[#f1c21b] px-3 py-2.5 flex items-start gap-2">
                    <Icon
                      name="ExclamationTriangleIcon"
                      size={14}
                      className="text-[#b45309] mt-0.5 flex-shrink-0"
                    />
                    <p className="text-2xs text-[#b45309]">
                      This provider is not currently accepting new patients. A referral can still be
                      submitted — the patient will be placed on the waitlist.
                    </p>
                  </div>
                )}

                {/* Urgency selector */}
                <div>
                  <label className="block text-xs font-semibold text-carbon-gray-100 mb-2">
                    Referral Urgency
                  </label>
                  <div className="flex gap-2">
                    {(['Routine', 'Urgent', 'STAT'] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => setReferralUrgency(u)}
                        className={`flex-1 py-2 text-xs font-semibold border transition-colors ${
                          referralUrgency === u
                            ? u === 'STAT'
                              ? 'bg-[#da1e28] text-white border-[#da1e28]'
                              : u === 'Urgent'
                                ? 'bg-[#f1c21b] text-[#161616] border-[#f1c21b]'
                                : 'bg-[#0f62fe] text-white border-[#0f62fe]'
                            : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clinical note */}
                <div>
                  <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                    Clinical Note{' '}
                    <span className="text-carbon-gray-50 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={referralNote}
                    onChange={(e) => setReferralNote(e.target.value)}
                    placeholder="Reason for referral, relevant clinical context, specific concerns..."
                    rows={4}
                    className="w-full border border-carbon-gray-20 bg-carbon-gray-10 px-3 py-2 text-xs text-carbon-gray-100 placeholder-carbon-gray-50 focus:outline-none focus:border-[#0f62fe] resize-none"
                  />
                </div>

                {/* Referral summary */}
                <div className="bg-[#edf5ff] border border-[#97c1ff] px-4 py-3 space-y-1.5">
                  <p className="text-2xs font-semibold text-[#0043ce] uppercase tracking-wide">
                    Referral Summary
                  </p>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Provider</span>
                    <span className="font-medium text-carbon-gray-100">{provider.name}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Specialty</span>
                    <span className="font-medium text-carbon-gray-100">{provider.specialty}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Network</span>
                    <span className="font-medium text-carbon-gray-100">{provider.networkTier}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Urgency</span>
                    <span
                      className={`font-semibold ${referralUrgency === 'STAT' ? 'text-[#da1e28]' : referralUrgency === 'Urgent' ? 'text-[#b45309]' : 'text-[#0043ce]'}`}
                    >
                      {referralUrgency}
                    </span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-carbon-gray-70">Est. Wait</span>
                    <span className="font-medium text-carbon-gray-100">
                      {provider.avgWaitDays} days
                    </span>
                  </div>
                </div>

                {/* Confirm action */}
                <button
                  className="carbon-btn-primary w-full justify-center py-2.5"
                  onClick={() => {
                    const id = `REF-${Date.now().toString(36).toUpperCase().slice(-6)}`;
                    const now = new Date();
                    const ts =
                      now.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }) +
                      ' · ' +
                      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    setReferralId(id);
                    setSubmittedAt(ts);
                    setReferralConfirmed(true);
                    toast.success(`Referral to ${provider.name} confirmed (${referralUrgency})`);
                  }}
                >
                  <Icon name="CheckCircleIcon" size={16} />
                  Confirm Referral
                </button>
                <button
                  className="carbon-btn-secondary w-full justify-center py-2"
                  onClick={() => {
                    onInitiateReferral(provider);
                    onClose();
                  }}
                >
                  <Icon name="ArrowTopRightOnSquareIcon" size={15} />
                  Full Referral Journey
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
const ProviderDirectoryTable: React.FC<{
  filters?: import('@/app/provider-selection/page').ProviderFilters;
}> = ({ filters }) => {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const { startWorkflow } = useWorkflowMachine();
  const [fhirNetworkCount, setFhirNetworkCount] = useState<{
    practitioners: number;
    orgs: number;
  } | null>(null);
  const fhirLoadedRef = useRef(false);

  // Live FHIR: verify network Practitioners + Organizations on mount
  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    Promise.all([
      getFhirClient().search('Practitioner', { _count: 50, active: 'true' }),
      getFhirClient().search('Organization', { _count: 50 }),
    ])
      .then(([pracBundle, orgBundle]: [any, any]) => {
        const practitioners = (pracBundle?.entry ?? []).filter(
          (e: any) => e?.resource?.resourceType === 'Practitioner'
        ).length;
        const orgs = (orgBundle?.entry ?? []).filter(
          (e: any) => e?.resource?.resourceType === 'Organization'
        ).length;
        if (practitioners > 0 || orgs > 0) setFhirNetworkCount({ practitioners, orgs });
      })
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  const providers: Provider[] = useMemo(() => {
    let list: Provider[] = [...mockProviders];
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.specialty.toLowerCase().includes(q) ||
          p.affiliatedFacility.toLowerCase().includes(q)
      );
    }
    if (filters?.specialty && filters.specialty !== 'All Specialties') {
      list = list.filter((p) => p.specialty === filters.specialty);
    }
    if (filters?.tier && filters.tier !== 'All Tiers') {
      list = list.filter((p) => p.networkTier === filters.tier);
    }
    if (filters?.accepting) {
      list = list.filter((p) => p.acceptingNewPatients);
    }
    if (filters?.vbcOnly) {
      list = list.filter((p) => p.vbcAligned);
    }
    if (filters?.sort === 'Quality Score') {
      list = list.sort((a, b) => b.qualityScore - a.qualityScore);
    } else if (filters?.sort === 'Cost Percentile') {
      list = list.sort((a, b) => a.costPercentile - b.costPercentile);
    } else if (filters?.sort === 'Wait Time') {
      list = list.sort((a, b) => a.avgWaitDays - b.avgWaitDays);
    } else if (filters?.sort === 'Distance') {
      list = list.sort((a, b) => a.distance - b.distance);
    }
    return list;
  }, [filters]);

  const handleInitiateReferral = (provider: Provider) => {
    startWorkflow('provider-referral', `ref-${provider.id}`, provider.name, 'care_manager');
  };

  return (
    <>
      {/* FHIR network verification badge */}
      {fhirNetworkCount !== null && (
        <div className="px-4 py-2 flex items-center gap-2 bg-[#f0fdf4] border border-[#a7f0ba] mb-2">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            Network verified · {fhirNetworkCount.practitioners} practitioners ·{' '}
            {fhirNetworkCount.orgs} organizations
          </span>
        </div>
      )}
      {/* Table */}
      <div className="border border-carbon-gray-20 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1fr_auto] bg-carbon-gray-10 border-b border-carbon-gray-20 px-4 py-2.5 gap-4">
          {[
            'Provider',
            'Specialty / Facility',
            'Network Tier',
            'Quality',
            'Cost %ile',
            'Wait',
            '',
          ].map((h) => (
            <span
              key={`th-${h}`}
              className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
            >
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {providers.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-carbon-gray-50">
            No providers match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-carbon-gray-20">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1fr_auto] px-4 py-3 gap-4 items-center cursor-pointer hover:bg-[#edf5ff] transition-colors group"
                onClick={() => setSelectedProvider(provider)}
              >
                {/* Provider name + status */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-[#0f62fe] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-xs">
                      {provider.name
                        .split(' ')
                        .map((w) => w[0])
                        .slice(1, 3)
                        .join('')}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-carbon-gray-100 truncate group-hover:text-[#0f62fe]">
                      {provider.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <ReferralWorkflowChip providerId={provider.id} />
                      {provider.vbcAligned && (
                        <span className="text-2xs px-1 py-0 bg-[#d0e2ff] text-[#0043ce] font-semibold border border-[#97c1ff]">
                          VBC
                        </span>
                      )}
                      <span
                        className={`text-2xs font-medium ${provider.acceptingNewPatients ? 'text-[#24a148]' : 'text-[#b45309]'}`}
                      >
                        {provider.acceptingNewPatients ? '● Accepting' : '○ Waitlist'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Specialty / Facility */}
                <div className="min-w-0">
                  <p className="text-xs text-carbon-gray-100 truncate">{provider.specialty}</p>
                  <p className="text-2xs text-carbon-gray-50 truncate">
                    {provider.affiliatedFacility}
                  </p>
                </div>

                {/* Network Tier */}
                <div>
                  <NetworkTierBadge tier={provider.networkTier} />
                </div>

                {/* Quality */}
                <div>
                  <QualityScoreDisplay score={provider.qualityScore} />
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">{provider.starsRating}★</p>
                </div>

                {/* Cost Percentile */}
                <div>
                  <CostPercentileBar pct={provider.costPercentile} />
                </div>

                {/* Wait */}
                <div>
                  <span className="text-xs font-mono text-carbon-gray-100">
                    {provider.avgWaitDays}d
                  </span>
                  <p className="text-2xs text-carbon-gray-50">{provider.distance} mi</p>
                </div>

                {/* Action */}
                <div>
                  <button
                    className="text-2xs font-semibold text-[#0f62fe] hover:underline whitespace-nowrap"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProvider(provider);
                    }}
                  >
                    View →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer count */}
        <div className="px-4 py-2 border-t border-carbon-gray-20 bg-carbon-gray-10">
          <span className="text-2xs text-carbon-gray-50">
            {providers.length} provider{providers.length !== 1 ? 's' : ''} shown
          </span>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedProvider && (
        <ProviderDetailPanel
          provider={selectedProvider}
          onClose={() => setSelectedProvider(null)}
          onInitiateReferral={handleInitiateReferral}
        />
      )}
    </>
  );
};

export default ProviderDirectoryTable;
