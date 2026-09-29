'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import AccessDenied from '@/components/admin/AccessDenied';
import {
  DEFAULT_ADMIN_ROLE,
  ADMIN_ROLE_LABELS,
  canView,
  canEdit,
  type AdminRole,
} from '@/lib/adminConsoleRoles';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MatchPair {
  id: string;
  patientA: { name: string; dob: string; mrn: string };
  patientB: { name: string; dob: string; mrn: string };
  matchScore: number;
  recommendation: 'MERGE' | 'SPLIT' | 'IGNORE';
  status: 'PENDING' | 'RESOLVED';
}

interface ResolvedMatch {
  id: string;
  date: string;
  operator: string;
  action: string;
  patientIds: string;
  notes: string;
}

interface QualityMetric {
  connector: string;
  completeness: number;
  duplicateRate: number;
  errorRate: number;
  lastRun: string;
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const MATCH_QUEUE_MOCK: MatchPair[] = [
  {
    id: 'mq-01',
    patientA: { name: 'M. Redhawk', dob: '1968-04-15', mrn: '…0006' },
    patientB: { name: 'M. Red Hawk', dob: '1968-04-15', mrn: '…0061' },
    matchScore: 94,
    recommendation: 'MERGE',
    status: 'PENDING',
  },
  {
    id: 'mq-02',
    patientA: { name: 'D. Simmons', dob: '1952-08-22', mrn: '…0042' },
    patientB: { name: 'D. Simmons', dob: '1952-08-12', mrn: '…0420' },
    matchScore: 81,
    recommendation: 'SPLIT',
    status: 'PENDING',
  },
  {
    id: 'mq-03',
    patientA: { name: 'T. Begay', dob: '1975-11-03', mrn: '…0055' },
    patientB: { name: 'T. J. Begay', dob: '1975-11-03', mrn: '…0056' },
    matchScore: 88,
    recommendation: 'MERGE',
    status: 'PENDING',
  },
];

const RESOLVED_MOCK: ResolvedMatch[] = [
  {
    id: 'rm-01',
    date: '2026-07-10',
    operator: 'data_engineer',
    action: 'MERGED',
    patientIds: '…0012 + …0121',
    notes: 'Confirmed same patient — name typo in import',
  },
  {
    id: 'rm-02',
    date: '2026-07-08',
    operator: 'data_engineer',
    action: 'IGNORED',
    patientIds: '…0033 + …0034',
    notes: 'Confirmed distinct patients — same last name only',
  },
  {
    id: 'rm-03',
    date: '2026-07-05',
    operator: 'platform_admin',
    action: 'MERGED',
    patientIds: '…0021 + …0210',
    notes: 'MRN duplication from HIE feed — resolved with source system',
  },
];

const QUALITY_METRICS_MOCK: QualityMetric[] = [
  {
    connector: 'Epic EHR',
    completeness: 98.2,
    duplicateRate: 0.3,
    errorRate: 0.1,
    lastRun: '2026-07-14',
  },
  {
    connector: 'Claims Adapter',
    completeness: 94.7,
    duplicateRate: 1.2,
    errorRate: 2.1,
    lastRun: '2026-07-14',
  },
  {
    connector: 'Unite Us SDOH',
    completeness: 99.1,
    duplicateRate: 0.1,
    errorRate: 0.0,
    lastRun: '2026-07-14',
  },
  {
    connector: 'Quest Lab Feed',
    completeness: 97.8,
    duplicateRate: 0.4,
    errorRate: 0.3,
    lastRun: '2026-07-14',
  },
  {
    connector: 'SD State HIE',
    completeness: 91.3,
    duplicateRate: 2.7,
    errorRate: 1.4,
    lastRun: '2026-07-14',
  },
  {
    connector: 'Frontier Community Action CBO',
    completeness: 96.5,
    duplicateRate: 0.8,
    errorRate: 0.5,
    lastRun: '2026-07-13',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MATCH_SCORE_COLOR = (score: number) =>
  score >= 90
    ? 'text-[#a2191f] font-bold'
    : score >= 80
      ? 'text-[#8a3800] font-semibold'
      : 'text-carbon-gray-70';

const REC_PILL: Record<MatchPair['recommendation'], string> = {
  MERGE: 'bg-[#defbe6] text-[#0e6027]',
  SPLIT: 'bg-[#fff1e0] text-[#8a3800]',
  IGNORE: 'bg-[#f4f4f4] text-[#525252]',
};

function qualityBar(value: number, inverse = false) {
  const good = inverse ? value < 1 : value > 95;
  const warn = inverse ? value < 3 : value > 90;
  const color = good ? '#24a148' : warn ? '#f1c21b' : '#da1e28';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-carbon-gray-20 rounded-full overflow-hidden">
        <div
          style={{ width: `${inverse ? Math.min(value * 10, 100) : value}%`, background: color }}
          className="h-full"
        />
      </div>
      <span className="text-xs font-mono text-carbon-gray-100 w-10 text-right">{value}%</span>
    </div>
  );
}

type Tab = 'queue' | 'resolved' | 'metrics';

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DataQuality() {
  const [adminRole, setAdminRole] = useState<AdminRole>(DEFAULT_ADMIN_ROLE);
  const [tab, setTab] = useState<Tab>('queue');
  const [queue, setQueue] = useState<MatchPair[]>(MATCH_QUEUE_MOCK);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (getFhirMockMode()) return;
    // In live mode: fetch patients and run simple name+DOB deduplication heuristic
    (async () => {
      try {
        const client = getFhirClient();
        const bundle: any = await client.search('Patient', { _count: '20' });
        const patients: any[] = (bundle?.entry ?? []).map((e: any) => e.resource);
        // Simple heuristic: flag pairs with same DOB
        const pairs: MatchPair[] = [];
        for (let i = 0; i < patients.length; i++) {
          for (let j = i + 1; j < patients.length; j++) {
            const a = patients[i];
            const b = patients[j];
            if (a.birthDate && a.birthDate === b.birthDate) {
              const nameA = `${a.name?.[0]?.given?.[0]?.[0] ?? '?'}. ${a.name?.[0]?.family ?? '?'}`;
              const nameB = `${b.name?.[0]?.given?.[0]?.[0] ?? '?'}. ${b.name?.[0]?.family ?? '?'}`;
              pairs.push({
                id: `live-${i}-${j}`,
                patientA: { name: nameA, dob: a.birthDate, mrn: `…${(a.id ?? '').slice(-4)}` },
                patientB: { name: nameB, dob: b.birthDate, mrn: `…${(b.id ?? '').slice(-4)}` },
                matchScore: 75,
                recommendation: 'SPLIT',
                status: 'PENDING',
              });
            }
          }
        }
        if (pairs.length > 0) setQueue(pairs.slice(0, 5));
      } catch {
        /* keep mock */
      }
    })();
  }, []);

  function handleAction(id: string, action: 'MERGE' | 'SPLIT' | 'IGNORE') {
    setProcessing(id);
    setTimeout(() => {
      setQueue((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'RESOLVED' } : p)));
      setProcessing(null);
    }, 1200);
  }

  if (!canView(adminRole, 'data-quality')) {
    return (
      <AppLayout
        pageTitle="Data Quality"
        breadcrumbs={[
          { label: 'Admin Console', href: '/admin-console/home' },
          { label: 'Data Quality' },
        ]}
      >
        <AccessDenied section="Data Quality" role={ADMIN_ROLE_LABELS[adminRole]} />
      </AppLayout>
    );
  }

  const pendingCount = queue.filter((q) => q.status === 'PENDING').length;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'queue', label: 'Match Queue' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'metrics', label: 'Quality Metrics' },
  ];

  return (
    <AppLayout
      pageTitle="Data Quality"
      breadcrumbs={[
        { label: 'Admin Console', href: '/admin-console/home' },
        { label: 'Data Quality' },
      ]}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">Data Quality</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            Review and resolve ambiguous entity matches, monitor quality metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <select
            value={adminRole}
            onChange={(e) => setAdminRole(e.target.value as AdminRole)}
            className="text-xs border border-carbon-gray-20 bg-white px-2 py-1 focus:outline-none focus:border-carbon-blue"
          >
            {(
              [
                'platform_admin',
                'data_engineer',
                'security_compliance',
                'support_analyst',
                'auditor',
              ] as AdminRole[]
            ).map((r) => (
              <option key={r} value={r}>
                {ADMIN_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Match Queue',
            value: pendingCount,
            color: pendingCount > 0 ? 'border-l-[#f1c21b]' : 'border-l-[#24a148]',
          },
          { label: 'Auto-resolved Today', value: 2, color: 'border-l-[#24a148]' },
          { label: 'Manual Review', value: pendingCount, color: 'border-l-[#f1c21b]' },
          { label: 'Overall Quality', value: '97.1%', color: 'border-l-[#24a148]' },
        ].map((k) => (
          <div
            key={k.label}
            className={`bg-white border border-carbon-gray-20 p-4 border-l-4 ${k.color}`}
          >
            <p className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold mb-1">
              {k.label}
            </p>
            <p className="text-2xl font-bold text-carbon-gray-100">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-carbon-blue text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
          >
            {t.label}
            {t.key === 'queue' && pendingCount > 0 && (
              <span className="ml-2 bg-carbon-red text-white text-2xs font-bold px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Match Queue tab ── */}
      {tab === 'queue' && (
        <div className="space-y-4">
          {queue
            .filter((q) => q.status === 'PENDING')
            .map((pair) => (
              <div key={pair.id} className="bg-white border border-carbon-gray-20 p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[pair.patientA, pair.patientB].map((p, i) => (
                      <div key={i} className="bg-carbon-gray-10 p-3">
                        <p className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold mb-1">
                          Patient {String.fromCharCode(65 + i)}
                        </p>
                        <p className="font-semibold text-carbon-gray-100">{p.name}</p>
                        <p className="text-xs font-mono text-carbon-gray-50 mt-0.5">
                          DOB: {p.dob} · MRN: {p.mrn}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-center">
                      <p className={`text-2xl font-bold ${MATCH_SCORE_COLOR(pair.matchScore)}`}>
                        {pair.matchScore}%
                      </p>
                      <p className="text-xs text-carbon-gray-50">match score</p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 ${REC_PILL[pair.recommendation]}`}
                    >
                      Rec: {pair.recommendation}
                    </span>
                  </div>
                </div>
                {canEdit(adminRole, 'data-quality') && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-carbon-gray-20">
                    <button
                      onClick={() => handleAction(pair.id, 'MERGE')}
                      disabled={!!processing}
                      className="text-xs px-3 py-1.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba] font-semibold hover:bg-[#c6efcd] disabled:opacity-50 transition-colors"
                    >
                      {processing === pair.id ? '…' : 'Merge Records'}
                    </button>
                    <button
                      onClick={() => handleAction(pair.id, 'SPLIT')}
                      disabled={!!processing}
                      className="text-xs px-3 py-1.5 bg-[#fff1e0] text-[#8a3800] border border-[#f1c21b] font-semibold hover:bg-[#fdf6dd] disabled:opacity-50 transition-colors"
                    >
                      {processing === pair.id ? '…' : 'Confirm Distinct'}
                    </button>
                    <button
                      onClick={() => handleAction(pair.id, 'IGNORE')}
                      disabled={!!processing}
                      className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 disabled:opacity-50 transition-colors"
                    >
                      Defer
                    </button>
                  </div>
                )}
              </div>
            ))}
          {pendingCount === 0 && (
            <div className="bg-white border border-carbon-gray-20 p-8 text-center">
              <Icon name="CheckCircleIcon" size={32} className="text-[#24a148] mx-auto mb-2" />
              <p className="text-sm text-carbon-gray-70">
                Match queue is clear — no pending reviews.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Resolved tab ── */}
      {tab === 'resolved' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Date</th>
                <th className="px-4 py-2 text-left font-semibold">Operator</th>
                <th className="px-4 py-2 text-left font-semibold">Action</th>
                <th className="px-4 py-2 text-left font-semibold">Patient IDs</th>
                <th className="px-4 py-2 text-left font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {RESOLVED_MOCK.map((r) => (
                <tr key={r.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">{r.date}</td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{r.operator}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-carbon-gray-100">
                    {r.action}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                    {r.patientIds}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Quality Metrics tab ── */}
      {tab === 'metrics' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Connector</th>
                <th className="px-4 py-2 text-left font-semibold w-48">Completeness</th>
                <th className="px-4 py-2 text-left font-semibold w-40">Duplicate Rate</th>
                <th className="px-4 py-2 text-left font-semibold w-40">Error Rate</th>
                <th className="px-4 py-2 text-left font-semibold">Last Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {QUALITY_METRICS_MOCK.map((m) => (
                <tr key={m.connector} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-3 font-medium text-carbon-gray-100">{m.connector}</td>
                  <td className="px-4 py-3">{qualityBar(m.completeness)}</td>
                  <td className="px-4 py-3">{qualityBar(m.duplicateRate, true)}</td>
                  <td className="px-4 py-3">{qualityBar(m.errorRate, true)}</td>
                  <td className="px-4 py-3 text-xs font-mono text-carbon-gray-50">{m.lastRun}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
