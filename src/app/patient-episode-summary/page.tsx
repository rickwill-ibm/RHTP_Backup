'use client';
import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAppContext } from '@/lib/appContext';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientById, PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Mock Data ────────────────────────────────────────────────────────────────

interface Episode {
  id: string;
  type: string;
  anchorEvent: string;
  anchorDate: string;
  startDate: string;
  endDate: string | null;
  status: 'Active' | 'Closed';
  totalCost: number;
  targetCost: number;
  variancePct: number;
  careSettings: string[];
  duration: number;
  careManager: string;
}

const EPISODES_BY_PATIENT: Record<string, Episode[]> = {
  'pt-001': [
    {
      id: 'ep-001',
      type: 'CHF Exacerbation',
      anchorEvent: 'Inpatient Admission — CHF',
      anchorDate: '2026-03-14',
      startDate: '2026-03-14',
      endDate: null,
      status: 'Active',
      totalCost: 32650,
      targetCost: 28000,
      variancePct: 16.6,
      careSettings: ['ER', 'Inpatient', 'SNF', 'Home Health', 'Outpatient'],
      duration: 47,
      careManager: 'Sarah Johnson',
    },
    {
      id: 'ep-002',
      type: 'CHF Exacerbation',
      anchorEvent: 'Inpatient Admission — CHF',
      anchorDate: '2025-08-10',
      startDate: '2025-08-10',
      endDate: '2025-11-07',
      status: 'Closed',
      totalCost: 26800,
      targetCost: 28000,
      variancePct: -4.3,
      careSettings: ['ER', 'Inpatient', 'Home Health', 'Outpatient'],
      duration: 89,
      careManager: 'Sarah Johnson',
    },
    {
      id: 'ep-003',
      type: 'Diabetes Management',
      anchorEvent: 'Office Visit — Diabetes Follow-up',
      anchorDate: '2025-01-15',
      startDate: '2025-01-15',
      endDate: '2025-07-13',
      status: 'Closed',
      totalCost: 9200,
      targetCost: 12000,
      variancePct: -23.3,
      careSettings: ['Outpatient', 'Lab', 'Pharmacy'],
      duration: 179,
      careManager: 'Sarah Johnson',
    },
  ],
  'pt-002': [
    {
      id: 'ep-004',
      type: 'Hip Replacement',
      anchorEvent: 'Elective Inpatient — Hip Arthroplasty',
      anchorDate: '2026-05-10',
      startDate: '2026-05-10',
      endDate: null,
      status: 'Active',
      totalCost: 28450,
      targetCost: 25000,
      variancePct: 13.8,
      careSettings: ['Inpatient', 'SNF', 'Home Health', 'Outpatient'],
      duration: 22,
      careManager: 'Sarah Johnson',
    },
    {
      id: 'ep-005',
      type: 'Pneumonia',
      anchorEvent: 'Inpatient Admission — Pneumonia',
      anchorDate: '2024-12-01',
      startDate: '2024-12-01',
      endDate: '2025-02-27',
      status: 'Closed',
      totalCost: 17400,
      targetCost: 20000,
      variancePct: -13.0,
      careSettings: ['ER', 'Inpatient', 'Outpatient'],
      duration: 88,
      careManager: 'Sarah Johnson',
    },
  ],
  'pt-003': [
    {
      id: 'ep-006',
      type: 'COPD Exacerbation',
      anchorEvent: 'Inpatient Admission — COPD',
      anchorDate: '2026-05-18',
      startDate: '2026-05-18',
      endDate: null,
      status: 'Active',
      totalCost: 12400,
      targetCost: 22000,
      variancePct: -43.6,
      careSettings: ['ER', 'Inpatient', 'Outpatient'],
      duration: 14,
      careManager: 'Sarah Johnson',
    },
  ],
  'pt-004': [
    {
      id: 'ep-007',
      type: 'Pneumonia',
      anchorEvent: 'Inpatient Admission — Pneumonia',
      anchorDate: '2026-05-23',
      startDate: '2026-05-23',
      endDate: null,
      status: 'Active',
      totalCost: 8200,
      targetCost: 20000,
      variancePct: -59.0,
      careSettings: ['ER', 'Inpatient'],
      duration: 9,
      careManager: 'Sarah Johnson',
    },
  ],
  'pt-005': [
    {
      id: 'ep-008',
      type: 'Diabetes Management',
      anchorEvent: 'Office Visit — Diabetes Follow-up',
      anchorDate: '2026-04-01',
      startDate: '2026-04-01',
      endDate: null,
      status: 'Active',
      totalCost: 8450,
      targetCost: 12000,
      variancePct: -29.6,
      careSettings: ['Outpatient', 'Lab', 'Pharmacy'],
      duration: 61,
      careManager: 'Sarah Johnson',
    },
    {
      id: 'ep-009',
      type: 'Diabetes Management',
      anchorEvent: 'Office Visit — Diabetes Follow-up',
      anchorDate: '2025-04-01',
      startDate: '2025-04-01',
      endDate: '2025-09-27',
      status: 'Closed',
      totalCost: 10200,
      targetCost: 12000,
      variancePct: -15.0,
      careSettings: ['Outpatient', 'Lab', 'Pharmacy'],
      duration: 179,
      careManager: 'Sarah Johnson',
    },
  ],
  'pt-006': [
    {
      id: 'ep-010',
      type: 'CHF Exacerbation',
      anchorEvent: 'Inpatient Admission — CHF',
      anchorDate: '2025-12-01',
      startDate: '2025-12-01',
      endDate: '2026-03-01',
      status: 'Closed',
      totalCost: 31200,
      targetCost: 28000,
      variancePct: 11.4,
      careSettings: ['ER', 'Inpatient', 'SNF', 'Home Health', 'Outpatient'],
      duration: 90,
      careManager: 'Sarah Johnson',
    },
  ],
};

const DEFAULT_EPISODES: Episode[] = [
  {
    id: 'ep-default',
    type: 'Chronic Care Management',
    anchorEvent: 'Office Visit — Chronic Care',
    anchorDate: '2026-01-15',
    startDate: '2026-01-15',
    endDate: null,
    status: 'Active',
    totalCost: 6800,
    targetCost: 10000,
    variancePct: -32.0,
    careSettings: ['Outpatient', 'Lab', 'Pharmacy'],
    duration: 137,
    careManager: 'Sarah Johnson',
  },
];

const CARE_SETTING_COLORS: Record<string, string> = {
  ER: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  Inpatient: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
  SNF: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
  'Home Health': 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
  Outpatient: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
  Lab: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
  Pharmacy: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
  Procedure: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
};

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${dt.getUTCFullYear()}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function PatientEpisodeSummaryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { useMockData } = useAppContext();
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const activePatient = getPatientById(activePatientId);

  // URL params take priority; fall back to active patient from registry
  const patientId = searchParams.get('patientId') || '';
  const patientName = searchParams.get('patientName') || activePatient?.name || 'Patient';
  const mrn = searchParams.get('mrn') || activePatient?.ehrMrn || '';
  const fromPanel = searchParams.get('from') === 'panel';

  // Live FHIR: fetch EpisodeOfCare for the active patient
  const [fhirEpisodes, setFhirEpisodes] = useState<Episode[] | null>(null);

  useEffect(() => {
    if (getFhirMockMode() || useMockData) {
      setFhirEpisodes(null);
      return;
    }
    const fhirId = PLATFORM_TO_FHIR_ID_MAP[activePatientId];
    if (!fhirId) return;
    getFhirClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .search('EpisodeOfCare', { patient: `Patient/${fhirId}`, _count: 10 } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((bundle: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: Episode[] = (bundle.entry ?? []).map((e: any, i: number) => {
          const r = e.resource;
          const rawStatus: string = r.status ?? 'active';
          const status: 'Active' | 'Closed' =
            rawStatus === 'active' || rawStatus === 'waitlist' ? 'Active' : 'Closed';
          const typeDisplay: string =
            r.type?.[0]?.coding?.[0]?.display ?? r.type?.[0]?.text ?? 'Episode of Care';
          const start: string = r.period?.start ?? new Date().toISOString().slice(0, 10);
          const end: string | null = r.period?.end ?? null;
          const durationDays = end
            ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
            : Math.round((Date.now() - new Date(start).getTime()) / 86400000);
          return {
            id: r.id ?? `fhir-ep-${i}`,
            type: typeDisplay,
            anchorEvent: typeDisplay,
            anchorDate: start,
            startDate: start,
            endDate: end,
            status,
            totalCost: 0,
            targetCost: 0,
            variancePct: 0,
            careSettings: [],
            duration: durationDays,
            careManager: r.careManager?.display ?? 'Care Manager',
          };
        });
        if (mapped.length > 0) setFhirEpisodes(mapped);
      })
      .catch(() => {
        /* silent — fall back to static data */
      });
  }, [activePatientId, useMockData]);

  // Active data source: FHIR episodes in live mode (if fetched), else static lookup
  const episodes = fhirEpisodes ?? (EPISODES_BY_PATIENT[patientId] || DEFAULT_EPISODES);
  const activeEps = episodes.filter((e) => e.status === 'Active');
  const closedEps = episodes.filter((e) => e.status === 'Closed');
  const totalCost = episodes.reduce((a, e) => a + e.totalCost, 0);
  const avgVariance = episodes.reduce((a, e) => a + e.variancePct, 0) / (episodes.length || 1);

  const breadcrumbs: { label: string; href?: string }[] = [
    { label: 'RHTP Overview', href: '/contract-program-selection' },
    { label: 'Panel & Cohort', href: '/panel-cohort-view' },
    { label: patientName },
    { label: 'Episodes' },
  ];

  return (
    <AppLayout
      pageTitle={`${patientName} — Episode Summary`}
      breadcrumbs={breadcrumbs}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-medium text-[#0043ce]">Patient: {patientName}</span>
          {mrn && <span className="text-xs text-[#0043ce] font-mono">{mrn}</span>}
          <span className="text-xs text-[#0043ce]">Care Manager: Sarah Johnson</span>
          <span className="text-xs text-[#0043ce]">Contract: Medicare MSSP Track 3</span>
        </div>
      }
    >
      {/* KPI Strip */}
      <div className="bg-white border-b border-carbon-gray-20 grid grid-cols-4 divide-x divide-carbon-gray-20">
        {[
          { label: 'Total Episodes', value: episodes.length, color: 'text-[#0043ce]' },
          {
            label: 'Active Episodes',
            value: activeEps.length,
            color: activeEps.length > 0 ? 'text-[#b45309]' : 'text-[#24a148]',
          },
          { label: 'Closed Episodes', value: closedEps.length, color: 'text-[#24a148]' },
          {
            label: 'Avg Cost Variance',
            value: `${avgVariance >= 0 ? '+' : ''}${avgVariance.toFixed(1)}%`,
            color: avgVariance > 0 ? 'text-[#da1e28]' : 'text-[#24a148]',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="px-6 py-4">
            <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">{kpi.label}</p>
            <p className={`text-2xl font-bold font-mono mt-0.5 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Active Episodes */}
        {activeEps.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#b45309] inline-block" />
              Active Episodes ({activeEps.length})
            </h3>
            <div className="space-y-3">
              {activeEps.map((ep) => (
                <EpisodeCard
                  key={ep.id}
                  episode={ep}
                  patientName={patientName}
                  mrn={mrn}
                  router={router}
                />
              ))}
            </div>
          </div>
        )}

        {/* Historical Episodes */}
        {closedEps.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#24a148] inline-block" />
              Historical Episodes ({closedEps.length})
            </h3>
            <div className="space-y-3">
              {closedEps.map((ep) => (
                <EpisodeCard
                  key={ep.id}
                  episode={ep}
                  patientName={patientName}
                  mrn={mrn}
                  router={router}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function EpisodeCard({
  episode,
  patientName,
  mrn,
  router,
}: {
  episode: Episode;
  patientName: string;
  mrn: string;
  router: ReturnType<typeof useRouter>;
}) {
  const overTarget = episode.variancePct > 0;
  const costPct = Math.min((episode.totalCost / episode.targetCost) * 100, 150);

  return (
    <div
      className="bg-white border border-carbon-gray-20 hover:border-[#97c1ff] transition-colors cursor-pointer group"
      onClick={() =>
        router.push(
          `/episode-detail?episodeId=${episode.id}&patientName=${encodeURIComponent(patientName)}&mrn=${mrn}&episodeType=${encodeURIComponent(episode.type)}`
        )
      }
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-carbon-gray-100 group-hover:text-[#0043ce]">
                {episode.type}
              </h4>
              <StatusBadge
                label={episode.status}
                variant={episode.status === 'Active' ? 'warning' : 'success'}
                size="sm"
              />
            </div>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              Anchor: <span className="font-medium text-carbon-gray-70">{episode.anchorEvent}</span>{' '}
              — {formatDate(episode.anchorDate)}
            </p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              {formatDate(episode.startDate)} →{' '}
              {episode.endDate ? formatDate(episode.endDate) : 'Ongoing'} · {episode.duration} days
            </p>
          </div>
          <div className="flex items-center gap-6 flex-shrink-0">
            <div className="text-right">
              <p className="text-2xs text-carbon-gray-50">Total Cost</p>
              <p
                className={`text-base font-bold font-mono ${overTarget ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
              >
                ${episode.totalCost.toLocaleString()}
              </p>
              <p className="text-2xs text-carbon-gray-50 font-mono">
                target ${episode.targetCost.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xs text-carbon-gray-50">Variance</p>
              <p
                className={`text-base font-bold font-mono ${overTarget ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
              >
                {overTarget ? '+' : ''}
                {episode.variancePct.toFixed(1)}%
              </p>
            </div>
            <button className="text-2xs font-semibold text-[#0043ce] hover:underline flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              View Detail <Icon name="ArrowRightIcon" size={11} />
            </button>
          </div>
        </div>

        {/* Cost bar */}
        <div className="mt-3">
          <div className="h-1.5 bg-carbon-gray-20 w-full">
            <div
              className={`h-full transition-all ${overTarget ? 'bg-[#da1e28]' : 'bg-[#24a148]'}`}
              style={{ width: `${Math.min(costPct, 100)}%` }}
            />
          </div>
          <p className="text-2xs text-carbon-gray-50 mt-0.5">{costPct.toFixed(0)}% of target</p>
        </div>

        {/* Care settings */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {episode.careSettings.map((cs) => (
            <span
              key={cs}
              className={`text-2xs font-medium px-1.5 py-0.5 border ${CARE_SETTING_COLORS[cs] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
            >
              {cs}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PatientEpisodeSummaryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-carbon-gray-50 text-sm">
          Loading episodes...
        </div>
      }
    >
      <PatientEpisodeSummaryContent />
    </Suspense>
  );
}
