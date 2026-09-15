'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import AccessDenied from '@/components/admin/AccessDenied';
import {
  DEFAULT_ADMIN_ROLE,
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_COLORS,
  canView,
  canEdit,
  type AdminRole,
} from '@/lib/adminConsoleRoles';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Connector {
  id: string;
  name: string;
  type: string;
  status: 'LIVE' | 'DEGRADED' | 'DOWN';
  lastSync: string;
  recordsPerDay: number;
  orgId?: string;
}

interface SyncLogEntry {
  id: string;
  timestamp: string;
  connector: string;
  records: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  message: string;
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const CONNECTORS_MOCK: Connector[] = [
  {
    id: 'conn-01',
    name: 'Epic EHR',
    type: 'EHR',
    status: 'LIVE',
    lastSync: '2026-07-14 11:02',
    recordsPerDay: 1240,
  },
  {
    id: 'conn-02',
    name: 'Claims Adapter',
    type: 'Claims',
    status: 'DEGRADED',
    lastSync: '2026-07-14 10:35',
    recordsPerDay: 890,
  },
  {
    id: 'conn-03',
    name: 'Unite Us SDOH',
    type: 'SDOH',
    status: 'LIVE',
    lastSync: '2026-07-14 11:00',
    recordsPerDay: 320,
  },
  {
    id: 'conn-04',
    name: 'Bennett County CBO',
    type: 'CBO',
    status: 'LIVE',
    lastSync: '2026-07-14 10:58',
    recordsPerDay: 145,
  },
  {
    id: 'conn-05',
    name: 'Quest Lab Feed',
    type: 'Lab',
    status: 'LIVE',
    lastSync: '2026-07-14 10:55',
    recordsPerDay: 560,
  },
  {
    id: 'conn-06',
    name: 'Pharmacy PBM',
    type: 'Pharmacy',
    status: 'DOWN',
    lastSync: '2026-07-14 08:12',
    recordsPerDay: 0,
  },
  {
    id: 'conn-07',
    name: 'SD State HIE',
    type: 'HIE',
    status: 'LIVE',
    lastSync: '2026-07-14 10:59',
    recordsPerDay: 430,
  },
  {
    id: 'conn-08',
    name: 'State Registry SDOH',
    type: 'State Registry',
    status: 'LIVE',
    lastSync: '2026-07-14 11:01',
    recordsPerDay: 210,
  },
];

const SYNC_LOG_MOCK: SyncLogEntry[] = [
  {
    id: 'sl-01',
    timestamp: '2026-07-14 11:02',
    connector: 'Epic EHR',
    records: 142,
    status: 'SUCCESS',
    message: 'Full sync completed normally',
  },
  {
    id: 'sl-02',
    timestamp: '2026-07-14 11:00',
    connector: 'Unite Us SDOH',
    records: 38,
    status: 'SUCCESS',
    message: 'Incremental sync — 38 new observations',
  },
  {
    id: 'sl-03',
    timestamp: '2026-07-14 10:58',
    connector: 'Bennett County CBO',
    records: 12,
    status: 'SUCCESS',
    message: 'ServiceRequest updates received',
  },
  {
    id: 'sl-04',
    timestamp: '2026-07-14 10:35',
    connector: 'Claims Adapter',
    records: 77,
    status: 'PARTIAL',
    message: 'Timeout on 23 records; 77 processed successfully',
  },
  {
    id: 'sl-05',
    timestamp: '2026-07-14 10:15',
    connector: 'Claims Adapter',
    records: 0,
    status: 'FAILED',
    message: 'Connection refused — auth token expired',
  },
  {
    id: 'sl-06',
    timestamp: '2026-07-14 10:10',
    connector: 'Quest Lab Feed',
    records: 64,
    status: 'SUCCESS',
    message: 'Lab results batch processed',
  },
  {
    id: 'sl-07',
    timestamp: '2026-07-14 08:12',
    connector: 'Pharmacy PBM',
    records: 0,
    status: 'FAILED',
    message: 'Host unreachable — upstream outage reported',
  },
  {
    id: 'sl-08',
    timestamp: '2026-07-14 08:00',
    connector: 'SD State HIE',
    records: 55,
    status: 'SUCCESS',
    message: 'Daily ADT feed processed',
  },
];

// Volume data for SVG bar chart (connector → daily records last 7 days)
const VOLUME_SERIES = [
  { name: 'Epic EHR', color: '#0043ce', values: [1180, 1220, 1090, 1300, 1150, 1200, 1240] },
  { name: 'Claims', color: '#f1c21b', values: [900, 870, 950, 800, 0, 820, 890] },
  { name: 'SDOH', color: '#24a148', values: [290, 310, 320, 280, 300, 315, 320] },
  { name: 'Lab', color: '#6929c4', values: [500, 530, 480, 560, 520, 540, 560] },
  { name: 'HIE', color: '#005d5d', values: [400, 420, 380, 440, 410, 430, 430] },
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_PILL: Record<Connector['status'], string> = {
  LIVE: 'bg-[#defbe6] text-[#0e6027]',
  DEGRADED: 'bg-[#fff1e0] text-[#8a3800]',
  DOWN: 'bg-[#fff1f1] text-[#a2191f]',
};

const SYNC_PILL: Record<SyncLogEntry['status'], string> = {
  SUCCESS: 'bg-[#defbe6] text-[#0e6027]',
  PARTIAL: 'bg-[#fff1e0] text-[#8a3800]',
  FAILED: 'bg-[#fff1f1] text-[#a2191f]',
};

type Tab = 'connectors' | 'synclog' | 'volume';

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DataConnections() {
  const [adminRole, setAdminRole] = useState<AdminRole>(DEFAULT_ADMIN_ROLE);
  const [tab, setTab] = useState<Tab>('connectors');
  const [connectors, setConnectors] = useState<Connector[]>(CONNECTORS_MOCK);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(true);

  useEffect(() => {
    setIsMock(getFhirMockMode());
  }, []);

  useEffect(() => {
    if (getFhirMockMode()) {
      setConnectors(CONNECTORS_MOCK);
      return;
    }
    // Live mode: enrich connector names from FHIR Organizations
    (async () => {
      try {
        const client = getFhirClient();
        const bundle: any = await client.search('Organization', { _count: '20' });
        const orgs: any[] = (bundle?.entry ?? []).map((e: any) => e.resource);
        if (orgs.length > 0) {
          setConnectors((prev) =>
            prev.map((c, i) => ({
              ...c,
              name: orgs[i]?.name ?? c.name,
              orgId: orgs[i]?.id,
            }))
          );
        }
      } catch {
        /* keep mock */
      }
    })();
  }, []);

  function handleRetry(id: string) {
    setRetrying(id);
    setTimeout(() => {
      setConnectors((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: 'LIVE', lastSync: new Date().toLocaleString() } : c
        )
      );
      setRetrying(null);
    }, 1800);
  }

  if (!canView(adminRole, 'data-connections')) {
    return (
      <AppLayout
        pageTitle="Data Connections"
        breadcrumbs={[
          { label: 'Admin Console', href: '/admin-console/home' },
          { label: 'Data Connections' },
        ]}
      >
        <AccessDenied section="Data Connections" role={ADMIN_ROLE_LABELS[adminRole]} />
      </AppLayout>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'connectors', label: 'Connectors' },
    { key: 'synclog', label: 'Sync Log' },
    { key: 'volume', label: 'Data Volume' },
  ];

  return (
    <AppLayout
      pageTitle="Data Connections"
      breadcrumbs={[
        { label: 'Admin Console', href: '/admin-console/home' },
        { label: 'Data Connections' },
      ]}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">Data Connections</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            Connector status, sync logs, and data volume trends
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
          { label: 'Total Connectors', value: connectors.length, status: 'neutral' },
          {
            label: 'Live',
            value: connectors.filter((c) => c.status === 'LIVE').length,
            status: 'green',
          },
          {
            label: 'Degraded',
            value: connectors.filter((c) => c.status === 'DEGRADED').length,
            status: 'amber',
          },
          {
            label: 'Down',
            value: connectors.filter((c) => c.status === 'DOWN').length,
            status: 'red',
          },
        ].map((k) => (
          <div
            key={k.label}
            className={`bg-white border border-carbon-gray-20 p-4 border-l-4 ${
              k.status === 'green'
                ? 'border-l-[#24a148]'
                : k.status === 'amber'
                  ? 'border-l-[#f1c21b]'
                  : k.status === 'red'
                    ? 'border-l-[#da1e28]'
                    : 'border-l-carbon-gray-20'
            }`}
          >
            <p className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold mb-1">
              {k.label}
            </p>
            <p className="text-2xl font-bold text-carbon-gray-100">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-carbon-blue text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Connectors tab ── */}
      {tab === 'connectors' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Connector</th>
                <th className="px-4 py-2 text-left font-semibold">Type</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-left font-semibold">Last Sync</th>
                <th className="px-4 py-2 text-right font-semibold">Records/Day</th>
                {canEdit(adminRole, 'data-connections') && (
                  <th className="px-4 py-2 text-left font-semibold">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {connectors.map((c) => (
                <tr key={c.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-3 font-medium text-carbon-gray-100">{c.name}</td>
                  <td className="px-4 py-3 text-xs text-carbon-gray-50">{c.type}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 ${STATUS_PILL[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-carbon-gray-50 font-mono">{c.lastSync}</td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-carbon-gray-100">
                    {c.recordsPerDay.toLocaleString()}
                  </td>
                  {canEdit(adminRole, 'data-connections') && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRetry(c.id)}
                          disabled={retrying === c.id || c.status === 'LIVE'}
                          className="text-xs px-2.5 py-1 bg-carbon-blue text-white font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {retrying === c.id ? 'Retrying…' : 'Retry'}
                        </button>
                        <button className="text-xs px-2.5 py-1 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
                          Pause
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-carbon-gray-20 text-xs text-carbon-gray-50">
            {isMock
              ? 'Mock connector data'
              : 'Connector names from live FHIR Organization resources'}
          </div>
        </div>
      )}

      {/* ── Sync Log tab ── */}
      {tab === 'synclog' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Timestamp</th>
                <th className="px-4 py-2 text-left font-semibold">Connector</th>
                <th className="px-4 py-2 text-right font-semibold">Records</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-left font-semibold">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {SYNC_LOG_MOCK.map((row) => (
                <tr key={row.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50 whitespace-nowrap">
                    {row.timestamp}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium text-carbon-gray-100">
                    {row.connector}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-right text-carbon-gray-100">
                    {row.records.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 ${SYNC_PILL[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Data Volume tab (SVG bar chart) ── */}
      {tab === 'volume' && (
        <div className="bg-white border border-carbon-gray-20 p-6">
          <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4">
            Daily Record Volume — Last 7 Days
          </h3>
          <div className="flex gap-1 items-end h-48 mb-2">
            {DAYS.map((day, di) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex flex-col-reverse gap-0.5" style={{ height: '180px' }}>
                  {VOLUME_SERIES.map((s) => {
                    const maxVal = Math.max(...VOLUME_SERIES.flatMap((x) => x.values));
                    const h = Math.round((s.values[di] / maxVal) * 160);
                    return (
                      <div
                        key={s.name}
                        title={`${s.name}: ${s.values[di].toLocaleString()}`}
                        style={{
                          height: `${h}px`,
                          background: s.color,
                          minHeight: s.values[di] > 0 ? '2px' : '0',
                        }}
                        className="w-full"
                      />
                    );
                  })}
                </div>
                <span className="text-xs text-carbon-gray-50">{day}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-4">
            {VOLUME_SERIES.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: s.color }}
                />
                <span className="text-xs text-carbon-gray-70">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
