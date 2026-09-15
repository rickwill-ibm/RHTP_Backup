'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import AccessDenied from '@/components/admin/AccessDenied';
import {
  DEFAULT_ADMIN_ROLE,
  ADMIN_ROLE_LABELS,
  canView,
  type AdminRole,
} from '@/lib/adminConsoleRoles';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ServiceStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

interface ServiceRow {
  id: string;
  name: string;
  version: string;
  status: ServiceStatus;
  uptime: string;
  lastDeploy: string;
  healthCheck: string;
  latencyMs?: number | null;
}

interface DeployRow {
  version: string;
  date: string;
  deployedBy: string;
  summary: string;
  status: 'SUCCESS' | 'ROLLBACK' | 'IN_PROGRESS';
}

interface IncidentRow {
  id: string;
  severity: 'P1' | 'P2' | 'P3';
  title: string;
  opened: string;
  resolved: string | null;
  rca: string;
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const DEPLOY_LOG: DeployRow[] = [
  {
    version: 'v2.14.1',
    date: '2026-07-14 06:00',
    deployedBy: 'CI/CD (auto)',
    summary: 'FHIR AuditEvent POST fix + consent-sovereignty FHIR R4 badge',
    status: 'SUCCESS',
  },
  {
    version: 'v2.14.0',
    date: '2026-07-10 09:30',
    deployedBy: 'R. Hennessy',
    summary: 'ST-9 End-to-End Test Suite — 114/114 passing',
    status: 'SUCCESS',
  },
  {
    version: 'v2.13.0',
    date: '2026-07-08 14:00',
    deployedBy: 'R. Hennessy',
    summary: 'ST-8 Aggregate Dashboards — MeasureReport + SDOH seeded',
    status: 'SUCCESS',
  },
  {
    version: 'v2.12.1',
    date: '2026-07-05 11:15',
    deployedBy: 'CI/CD (auto)',
    summary: 'Hotfix: CarePlan PUT 422 on empty Annotation array',
    status: 'SUCCESS',
  },
  {
    version: 'v2.12.0',
    date: '2026-07-03 10:00',
    deployedBy: 'R. Hennessy',
    summary: 'ST-7 Benefit Enrollment Coverage read + ServiceRequest write',
    status: 'SUCCESS',
  },
  {
    version: 'v2.11.0',
    date: '2026-06-28 09:00',
    deployedBy: 'R. Hennessy',
    summary: 'ST-6 Household View + Consent Sovereignty FHIR wiring',
    status: 'SUCCESS',
  },
  {
    version: 'v2.10.2',
    date: '2026-06-22 16:30',
    deployedBy: 'CI/CD (auto)',
    summary: 'Rollback: nav group ordering regression in v2.10.1',
    status: 'ROLLBACK',
  },
  {
    version: 'v2.10.1',
    date: '2026-06-22 14:00',
    deployedBy: 'CI/CD (auto)',
    summary: 'Nav group ordering fix — REVERTED due to sidebar regression',
    status: 'ROLLBACK',
  },
];

const INCIDENTS: IncidentRow[] = [
  {
    id: 'INC-042',
    severity: 'P2',
    title: 'Claims Adapter auth token expiry — sync failures',
    opened: '2026-07-14 10:00',
    resolved: null,
    rca: 'Pending',
  },
  {
    id: 'INC-041',
    severity: 'P3',
    title: 'Pharmacy PBM upstream outage — records not flowing',
    opened: '2026-07-14 08:00',
    resolved: null,
    rca: 'Vendor notified',
  },
  {
    id: 'INC-040',
    severity: 'P2',
    title: 'CarePlan PUT 422 error on empty Annotation array',
    opened: '2026-07-05 09:30',
    resolved: '2026-07-05 11:15',
    rca: 'Fixed in v2.12.1',
  },
  {
    id: 'INC-039',
    severity: 'P3',
    title: 'Sidebar nav ordering regression after v2.10.1 deploy',
    opened: '2026-06-22 14:05',
    resolved: '2026-06-22 16:30',
    rca: 'Fixed in v2.10.2',
  },
  {
    id: 'INC-038',
    severity: 'P1',
    title: 'FHIR server OOM — auto-restarted, 4 min downtime',
    opened: '2026-06-10 03:12',
    resolved: '2026-06-10 03:16',
    rca: 'Heap size increased to 4GB',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SVC_PILL: Record<ServiceStatus, string> = {
  HEALTHY: 'bg-[#defbe6] text-[#0e6027]',
  DEGRADED: 'bg-[#fff1e0] text-[#8a3800]',
  DOWN: 'bg-[#fff1f1] text-[#a2191f]',
};

const DEPLOY_PILL: Record<DeployRow['status'], string> = {
  SUCCESS: 'bg-[#defbe6] text-[#0e6027]',
  ROLLBACK: 'bg-[#fff1f1] text-[#a2191f]',
  IN_PROGRESS: 'bg-[#fff1e0] text-[#8a3800]',
};

const SEV_PILL: Record<IncidentRow['severity'], string> = {
  P1: 'bg-[#fff1f1] text-[#a2191f] font-bold',
  P2: 'bg-[#fff1e0] text-[#8a3800]',
  P3: 'bg-[#f4f4f4] text-[#525252]',
};

type Tab = 'services' | 'deployments' | 'incidents';

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SystemHealth() {
  const [adminRole, setAdminRole] = useState<AdminRole>(DEFAULT_ADMIN_ROLE);
  const [tab, setTab] = useState<Tab>('services');
  const [fhirPing, setFhirPing] = useState<{
    status: ServiceStatus;
    latencyMs: number | null;
    version: string;
  }>({
    status: 'HEALTHY',
    latencyMs: null,
    version: '—',
  });
  const [lastMeasureDate, setLastMeasureDate] = useState<string>('—');
  const [isMock, setIsMock] = useState(true);

  useEffect(() => {
    setIsMock(getFhirMockMode());
  }, []);

  // Ping FHIR metadata for live health check
  useEffect(() => {
    if (getFhirMockMode()) return;
    (async () => {
      const t0 = Date.now();
      try {
        const FHIR_BASE = process.env.NEXT_PUBLIC_FHIR_BASE_URL ?? 'http://localhost:8080/fhir';
        const res = await fetch(`${FHIR_BASE}/metadata`, {
          headers: { Accept: 'application/fhir+json' },
        });
        const ms = Date.now() - t0;
        if (res.ok) {
          const meta = await res.json();
          setFhirPing({ status: 'HEALTHY', latencyMs: ms, version: meta.fhirVersion ?? 'R4' });
        } else {
          setFhirPing({ status: 'DEGRADED', latencyMs: ms, version: '—' });
        }
      } catch {
        setFhirPing({ status: 'DOWN', latencyMs: null, version: '—' });
      }
    })();
    // Latest MeasureReport date
    (async () => {
      try {
        const client = getFhirClient();
        const bundle: any = await client.search('MeasureReport', { _count: '1', _sort: '-date' });
        const mr = bundle?.entry?.[0]?.resource;
        if (mr?.date) setLastMeasureDate(mr.date.slice(0, 10));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const services: ServiceRow[] = [
    {
      id: 'svc-fhir',
      name: 'HAPI FHIR Server',
      version: `R4 ${fhirPing.version}`,
      status: isMock ? 'HEALTHY' : fhirPing.status,
      uptime: '99.97%',
      lastDeploy: '2026-07-01',
      healthCheck: isMock ? 'Mock' : `${fhirPing.latencyMs ?? '—'} ms`,
      latencyMs: fhirPing.latencyMs,
    },
    {
      id: 'svc-auth',
      name: 'Auth Service (NextAuth)',
      version: '5.0.0-beta',
      status: 'HEALTHY',
      uptime: '99.99%',
      lastDeploy: '2026-06-15',
      healthCheck: '3 ms',
    },
    {
      id: 'svc-sdoh',
      name: 'SDOH API (Unite Us)',
      version: '2.3.1',
      status: 'HEALTHY',
      uptime: '99.85%',
      lastDeploy: '2026-07-08',
      healthCheck: '112 ms',
    },
    {
      id: 'svc-claims',
      name: 'Claims Adapter',
      version: '1.8.4',
      status: 'DEGRADED',
      uptime: '97.10%',
      lastDeploy: '2026-05-20',
      healthCheck: 'Timeout',
    },
    {
      id: 'svc-notify',
      name: 'Notification Service',
      version: '3.1.0',
      status: 'HEALTHY',
      uptime: '99.91%',
      lastDeploy: '2026-07-10',
      healthCheck: '8 ms',
    },
    {
      id: 'svc-ai',
      name: 'AI Orchestrator (WatsonX)',
      version: '1.2.0',
      status: 'HEALTHY',
      uptime: '99.60%',
      lastDeploy: '2026-07-12',
      healthCheck: '45 ms',
    },
    {
      id: 'svc-pbm',
      name: 'Pharmacy PBM Adapter',
      version: '2.0.1',
      status: 'DOWN',
      uptime: '89.40%',
      lastDeploy: '2026-04-10',
      healthCheck: 'Unreachable',
    },
  ];

  if (!canView(adminRole, 'system-health')) {
    return (
      <AppLayout
        pageTitle="System Health"
        breadcrumbs={[
          { label: 'Admin Console', href: '/admin-console/home' },
          { label: 'System Health' },
        ]}
      >
        <AccessDenied section="System Health" role={ADMIN_ROLE_LABELS[adminRole]} />
      </AppLayout>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'services', label: 'Services' },
    { key: 'deployments', label: 'Deployment Log' },
    { key: 'incidents', label: 'Incidents' },
  ];

  const openIncidents = INCIDENTS.filter((i) => !i.resolved).length;

  return (
    <AppLayout
      pageTitle="System Health"
      breadcrumbs={[
        { label: 'Admin Console', href: '/admin-console/home' },
        { label: 'System Health' },
      ]}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">System Health</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            Uptime dashboards, deployment log, and incident tracker
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
            label: 'Platform Uptime',
            value: '99.94%',
            sub: 'rolling 30-day',
            border: 'border-l-[#24a148]',
          },
          {
            label: 'Avg API Latency',
            value: isMock ? '34 ms' : fhirPing.latencyMs ? `${fhirPing.latencyMs} ms` : '— ms',
            sub: 'FHIR server ping',
            border: 'border-l-[#24a148]',
          },
          {
            label: 'Open Incidents',
            value: openIncidents,
            sub: `${INCIDENTS.length} total`,
            border: openIncidents > 0 ? 'border-l-[#f1c21b]' : 'border-l-[#24a148]',
          },
          {
            label: 'Last Data Refresh',
            value: isMock ? '2026-07-14' : lastMeasureDate,
            sub: 'MeasureReport',
            border: 'border-l-carbon-gray-20',
          },
        ].map((k) => (
          <div
            key={k.label}
            className={`bg-white border border-carbon-gray-20 p-4 border-l-4 ${k.border}`}
          >
            <p className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold mb-1">
              {k.label}
            </p>
            <p className="text-2xl font-bold text-carbon-gray-100">{k.value}</p>
            {k.sub && <p className="text-xs text-carbon-gray-50 mt-0.5">{k.sub}</p>}
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
            {t.key === 'incidents' && openIncidents > 0 && (
              <span className="ml-2 bg-carbon-red text-white text-2xs font-bold px-1.5 py-0.5">
                {openIncidents}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Services tab ── */}
      {tab === 'services' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Service</th>
                <th className="px-4 py-2 text-left font-semibold">Version</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold">Uptime %</th>
                <th className="px-4 py-2 text-left font-semibold">Last Deploy</th>
                <th className="px-4 py-2 text-left font-semibold">Health Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 font-medium text-carbon-gray-100">{s.name}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">{s.version}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 ${SVC_PILL[s.status]}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-mono text-carbon-gray-100">
                    {s.uptime}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                    {s.lastDeploy}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{s.healthCheck}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-carbon-gray-20 text-xs text-carbon-gray-50">
            FHIR Server row pings live metadata endpoint ·{' '}
            {isMock ? 'other rows: mock data' : 'live FHIR ping active'}
          </div>
        </div>
      )}

      {/* ── Deployment Log tab ── */}
      {tab === 'deployments' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Version</th>
                <th className="px-4 py-2 text-left font-semibold">Date</th>
                <th className="px-4 py-2 text-left font-semibold">Deployed By</th>
                <th className="px-4 py-2 text-left font-semibold">Summary</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {DEPLOY_LOG.map((d) => (
                <tr key={d.version + d.date} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 font-mono text-sm font-semibold text-carbon-blue">
                    {d.version}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50 whitespace-nowrap">
                    {d.date}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{d.deployedBy}</td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-100">{d.summary}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 ${DEPLOY_PILL[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Incidents tab ── */}
      {tab === 'incidents' && (
        <div className="bg-white border border-carbon-gray-20">
          {openIncidents > 0 && (
            <div className="px-4 py-3 bg-[#fff8e1] border-b border-[#f1c21b] flex items-center gap-2 text-sm text-[#8a3800]">
              <Icon name="ExclamationTriangleIcon" size={16} />
              <span>
                {openIncidents} open incident{openIncidents > 1 ? 's' : ''} require attention
              </span>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">ID</th>
                <th className="px-4 py-2 text-left font-semibold">Sev</th>
                <th className="px-4 py-2 text-left font-semibold">Title</th>
                <th className="px-4 py-2 text-left font-semibold">Opened</th>
                <th className="px-4 py-2 text-left font-semibold">Resolved</th>
                <th className="px-4 py-2 text-left font-semibold">RCA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {INCIDENTS.map((i) => (
                <tr key={i.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 font-mono text-sm font-semibold text-carbon-gray-100">
                    {i.id}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 ${SEV_PILL[i.severity]}`}>
                      {i.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-100">{i.title}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50 whitespace-nowrap">
                    {i.opened}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono">
                    {i.resolved ? (
                      <span className="text-carbon-gray-50">{i.resolved}</span>
                    ) : (
                      <span className="font-semibold text-[#8a3800]">Open</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{i.rca}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
