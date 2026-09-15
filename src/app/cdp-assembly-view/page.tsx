'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';

const DATA_SOURCES = [
  {
    id: 'ds-001',
    name: 'EHR — Cerner Millennium',
    type: 'Clinical',
    status: 'ACTIVE',
    records: 142800,
    lastSync: '2 min ago',
    latency: '1.2s',
    fhirVersion: 'R4',
    quality: 98,
  },
  {
    id: 'ds-002',
    name: 'Claims — CMS Blue Button',
    type: 'Claims',
    status: 'ACTIVE',
    records: 89400,
    lastSync: '8 min ago',
    latency: '3.4s',
    fhirVersion: 'R4',
    quality: 95,
  },
  {
    id: 'ds-003',
    name: 'SDOH — Unite Us Network',
    type: 'Social',
    status: 'ACTIVE',
    records: 34200,
    lastSync: '15 min ago',
    latency: '2.1s',
    fhirVersion: 'R4',
    quality: 91,
  },
  {
    id: 'ds-004',
    name: 'Lab — Quest Diagnostics',
    type: 'Lab',
    status: 'ACTIVE',
    records: 67100,
    lastSync: '4 min ago',
    latency: '0.9s',
    fhirVersion: 'R4',
    quality: 99,
  },
  {
    id: 'ds-005',
    name: 'Pharmacy — Surescripts',
    type: 'Rx',
    status: 'DEGRADED',
    records: 51300,
    lastSync: '42 min ago',
    latency: '8.7s',
    fhirVersion: 'STU3',
    quality: 82,
  },
  {
    id: 'ds-006',
    name: 'ADT — Inpatient Alerts',
    type: 'ADT',
    status: 'ACTIVE',
    records: 12900,
    lastSync: '1 min ago',
    latency: '0.4s',
    fhirVersion: 'R4',
    quality: 97,
  },
  {
    id: 'ds-007',
    name: 'Behavioral Health — CCBHC',
    type: 'BH',
    status: 'ACTIVE',
    records: 8700,
    lastSync: '11 min ago',
    latency: '2.8s',
    fhirVersion: 'R4',
    quality: 94,
  },
  {
    id: 'ds-008',
    name: 'HIE — CommonWell',
    type: 'HIE',
    status: 'PENDING',
    records: 0,
    lastSync: 'Connecting...',
    latency: '—',
    fhirVersion: 'R4',
    quality: 0,
  },
];

const ASSEMBLY_PIPELINE = [
  { stage: 'Ingest', count: 406400, pct: 100, color: '#0043ce' },
  { stage: 'Normalize', count: 401200, pct: 98.7, color: '#0043ce' },
  { stage: 'Deduplicate', count: 389800, pct: 95.9, color: '#198038' },
  { stage: 'Enrich', count: 387100, pct: 95.3, color: '#198038' },
  { stage: 'Validate', count: 384400, pct: 94.6, color: '#198038' },
  { stage: 'Profile Ready', count: 381900, pct: 94.0, color: '#6929c4' },
];

const THROUGHPUT_DATA = [
  { time: '00:00', records: 4200 },
  { time: '04:00', records: 3800 },
  { time: '08:00', records: 8900 },
  { time: '10:00', records: 12400 },
  { time: '12:00', records: 11800 },
  { time: '14:00', records: 13200 },
  { time: '16:00', records: 14100 },
  { time: '18:00', records: 10300 },
  { time: '20:00', records: 7200 },
  { time: '22:00', records: 5100 },
];

const TYPE_COLORS: Record<string, string> = {
  Clinical: '#0043ce',
  Claims: '#198038',
  Social: '#8a3ffc',
  Lab: '#b45309',
  Rx: '#da1e28',
  ADT: '#00539a',
  BH: '#6929c4',
  HIE: '#4d5358',
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: '#defbe6', text: '#0e6027', dot: '#198038' },
  DEGRADED: { bg: '#fdf6dd', text: '#b45309', dot: '#f1c21b' },
  PENDING: { bg: '#d0e2ff', text: '#0043ce', dot: '#4589ff' },
};

export default function CdpAssemblyViewPage() {
  const [activeTab, setActiveTab] = useState<'sources' | 'pipeline' | 'throughput'>('sources');
  const [search, setSearch] = useState('');

  const filtered = DATA_SOURCES.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.type.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = DATA_SOURCES.filter((s) => s.status === 'ACTIVE').length;
  const totalRecords = DATA_SOURCES.reduce((a, c) => a + c.records, 0);
  const avgQuality = Math.round(
    DATA_SOURCES.filter((s) => s.quality > 0).reduce((a, c) => a + c.quality, 0) /
      DATA_SOURCES.filter((s) => s.quality > 0).length
  );

  return (
    <AppLayout
      pageTitle="CDP Assembly View"
      breadcrumbs={[{ label: 'CDP & Agentic Automation' }, { label: 'CDP Assembly View' }]}
    >
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Active Sources',
            value: `${activeCount}/${DATA_SOURCES.length}`,
            icon: 'CircleStackIcon',
            color: 'text-[#0043ce]',
            bg: 'bg-[#d0e2ff]',
          },
          {
            label: 'Total Records',
            value: totalRecords.toLocaleString(),
            icon: 'DocumentStackIcon',
            color: 'text-[#198038]',
            bg: 'bg-[#defbe6]',
          },
          {
            label: 'Profile Ready',
            value: '381,900',
            icon: 'UserGroupIcon',
            color: 'text-[#6929c4]',
            bg: 'bg-[#f6f2ff]',
          },
          {
            label: 'Avg Data Quality',
            value: `${avgQuality}%`,
            icon: 'ShieldCheckIcon',
            color: 'text-[#b45309]',
            bg: 'bg-[#fdf6dd]',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-carbon-gray-20 p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 ${kpi.bg} flex items-center justify-center flex-shrink-0`}>
              <Icon name={kpi.icon as any} size={20} className={kpi.color} />
            </div>
            <div>
              <p className="text-xs text-carbon-gray-50">{kpi.label}</p>
              <p className="text-xl font-bold text-carbon-gray-100">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-carbon-gray-20">
        {(['sources', 'pipeline', 'throughput'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === t
                ? 'border-[#0043ce] text-[#0043ce]'
                : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100'
            }`}
          >
            {t === 'sources'
              ? 'Data Sources'
              : t === 'pipeline'
                ? 'Assembly Pipeline'
                : 'Throughput'}
          </button>
        ))}
      </div>

      {activeTab === 'sources' && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20">
            <p className="text-sm font-semibold text-carbon-gray-100">Connected Data Sources</p>
            <div className="relative">
              <Icon
                name="MagnifyingGlassIcon"
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-carbon-gray-50"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sources..."
                className="pl-8 pr-3 py-1.5 text-xs border border-carbon-gray-20 focus:outline-none focus:border-[#0043ce] w-52"
              />
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                {[
                  'Source',
                  'Type',
                  'Status',
                  'Records',
                  'Last Sync',
                  'Latency',
                  'FHIR',
                  'Quality',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left font-semibold text-carbon-gray-70 uppercase tracking-wide text-2xs"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((src, i) => {
                const sc = STATUS_CONFIG[src.status];
                return (
                  <tr
                    key={src.id}
                    className={`border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors ${i % 2 === 0 ? '' : 'bg-carbon-gray-10/30'}`}
                  >
                    <td className="px-4 py-3 font-medium text-carbon-gray-100">{src.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 text-2xs font-semibold"
                        style={{
                          background: TYPE_COLORS[src.type] + '22',
                          color: TYPE_COLORS[src.type],
                        }}
                      >
                        {src.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                        <span
                          className="px-1.5 py-0.5 text-2xs font-semibold"
                          style={{ background: sc.bg, color: sc.text }}
                        >
                          {src.status}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-carbon-gray-70">
                      {src.records > 0 ? src.records.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-carbon-gray-50">{src.lastSync}</td>
                    <td className="px-4 py-3 font-mono text-carbon-gray-70">{src.latency}</td>
                    <td className="px-4 py-3 text-carbon-gray-50">{src.fhirVersion}</td>
                    <td className="px-4 py-3">
                      {src.quality > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-carbon-gray-20 w-16">
                            <div
                              className="h-full"
                              style={{
                                width: `${src.quality}%`,
                                background:
                                  src.quality >= 95
                                    ? '#198038'
                                    : src.quality >= 85
                                      ? '#f1c21b'
                                      : '#da1e28',
                              }}
                            />
                          </div>
                          <span className="font-semibold text-carbon-gray-70">{src.quality}%</span>
                        </div>
                      ) : (
                        <span className="text-carbon-gray-30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="bg-white border border-carbon-gray-20 p-6">
          <p className="text-sm font-semibold text-carbon-gray-100 mb-6">
            Assembly Pipeline — Record Flow
          </p>
          <div className="space-y-4">
            {ASSEMBLY_PIPELINE.map((stage, i) => (
              <div key={stage.stage} className="flex items-center gap-4">
                <div className="w-28 text-right text-xs font-semibold text-carbon-gray-70">
                  {stage.stage}
                </div>
                <div className="flex-1 h-8 bg-carbon-gray-10 relative">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${stage.pct}%`, background: stage.color, opacity: 0.85 }}
                  />
                  <span className="absolute inset-0 flex items-center px-3 text-xs font-bold text-white mix-blend-difference">
                    {stage.count.toLocaleString()}
                  </span>
                </div>
                <div className="w-16 text-xs font-semibold text-carbon-gray-70 text-right">
                  {stage.pct}%
                </div>
                {i < ASSEMBLY_PIPELINE.length - 1 && (
                  <div className="absolute left-[calc(28px+112px+16px)] mt-8"></div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 p-3 bg-[#defbe6] border border-[#a7f0ba] flex items-center gap-2">
            <Icon name="CheckCircleIcon" size={16} className="text-[#198038]" />
            <span className="text-xs font-medium text-[#0e6027]">
              94.0% of ingested records are profile-ready — 22,500 records filtered for quality or
              deduplication
            </span>
          </div>
        </div>
      )}

      {activeTab === 'throughput' && (
        <div className="bg-white border border-carbon-gray-20 p-6">
          <p className="text-sm font-semibold text-carbon-gray-100 mb-4">
            Records Processed — Last 24 Hours
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={THROUGHPUT_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Records']} />
              <Line
                type="monotone"
                dataKey="records"
                stroke="#0043ce"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </AppLayout>
  );
}
