'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import {
  DEFAULT_ADMIN_ROLE,
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_COLORS,
  type AdminRole,
} from '@/lib/adminConsoleRoles';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KpiCard {
  label: string;
  value: string | number;
  sub?: string;
  status: 'green' | 'amber' | 'red' | 'neutral';
  icon: string;
}

interface SectionCard {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: string;
  status: 'green' | 'amber' | 'red';
  phase: 1 | 2 | 3;
}

interface ActivityRow {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  outcome: 'success' | 'warning' | 'error';
}

// ─── Static / mock data ────────────────────────────────────────────────────────

const SECTION_CARDS: SectionCard[] = [
  {
    key: 'data-connections',
    label: 'Data Connections',
    description: 'Connector status, sync logs, manual retry/reprocess',
    href: '/admin-console/data-connections',
    icon: 'ArrowsRightLeftIcon',
    status: 'amber',
    phase: 1,
  },
  {
    key: 'consent-governance',
    label: 'Consent & Governance',
    description: 'Consent records, purpose-of-use, data-use agreements',
    href: '/admin-console/consent-governance',
    icon: 'ShieldCheckIcon',
    status: 'green',
    phase: 1,
  },
  {
    key: 'system-health',
    label: 'System Health',
    description: 'Uptime dashboards, deployment log, incidents',
    href: '/admin-console/system-health',
    icon: 'HeartIcon',
    status: 'green',
    phase: 1,
  },
  {
    key: 'agent-oversight',
    label: 'Agent Oversight',
    description: 'Approve/deny high-risk actions, configure guardrails',
    href: '/admin-console/agent-oversight',
    icon: 'CpuChipIcon',
    status: 'amber',
    phase: 2,
  },
  {
    key: 'identity-access',
    label: 'Identity & Access',
    description: 'Users, roles, access reviews, security event log',
    href: '/admin-console/identity-access',
    icon: 'UserCircleIcon',
    status: 'green',
    phase: 2,
  },
  {
    key: 'data-quality',
    label: 'Data Quality',
    description: 'Review/merge ambiguous entity matches, quality metrics',
    href: '/admin-console/data-quality',
    icon: 'MagnifyingGlassIcon',
    status: 'green',
    phase: 3,
  },
  {
    key: 'audit-compliance',
    label: 'Audit & Compliance',
    description: 'Export audit trails, HIPAA / 42 CFR Part 2 reports',
    href: '/admin-console/audit-compliance',
    icon: 'DocumentMagnifyingGlassIcon',
    status: 'green',
    phase: 3,
  },
];

const MOCK_ACTIVITY: ActivityRow[] = [
  {
    id: 'ae-001',
    timestamp: '2026-07-14 10:48',
    actor: 'SJ (platform_admin)',
    action: 'PUT Consent',
    resource: 'Consent/cns-001',
    outcome: 'success',
  },
  {
    id: 'ae-002',
    timestamp: '2026-07-14 10:32',
    actor: 'SJ (platform_admin)',
    action: 'POST ServiceRequest',
    resource: 'ServiceRequest/sr-012',
    outcome: 'success',
  },
  {
    id: 'ae-003',
    timestamp: '2026-07-14 10:15',
    actor: 'Auto-Agent',
    action: 'Task Approval',
    resource: 'Task/task-042',
    outcome: 'warning',
  },
  {
    id: 'ae-004',
    timestamp: '2026-07-14 09:50',
    actor: 'System',
    action: 'Sync: Claims',
    resource: 'Claims Adapter',
    outcome: 'error',
  },
  {
    id: 'ae-005',
    timestamp: '2026-07-14 09:30',
    actor: 'JW (physician)',
    action: 'GET Patient',
    resource: 'Patient/pat-001',
    outcome: 'success',
  },
];

const MOCK_ALERTS = [
  {
    id: 'alt-1',
    severity: 'amber',
    message: 'Claims Adapter sync failing — last success 26 min ago',
    section: 'Data Connections',
  },
  {
    id: 'alt-2',
    severity: 'amber',
    message: '3 agent actions pending human approval',
    section: 'Agent Oversight',
  },
  {
    id: 'alt-3',
    severity: 'green',
    message: 'HAPI FHIR server healthy — metadata responding normally',
    section: 'System Health',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-[#24a148]',
  amber: 'bg-[#f1c21b]',
  red: 'bg-[#da1e28]',
};

const STATUS_PILL: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-[#defbe6] text-[#0e6027]',
  amber: 'bg-[#fff1e0] text-[#8a3800]',
  red: 'bg-[#fff1f1] text-[#a2191f]',
};

const STATUS_LABEL: Record<'green' | 'amber' | 'red', string> = {
  green: 'Healthy',
  amber: 'Warning',
  red: 'Down',
};

const OUTCOME_PILL: Record<ActivityRow['outcome'], string> = {
  success: 'bg-[#defbe6] text-[#0e6027]',
  warning: 'bg-[#fff1e0] text-[#8a3800]',
  error: 'bg-[#fff1f1] text-[#a2191f]',
};

const KPISTATUS_BAR: Record<KpiCard['status'], string> = {
  green: 'border-l-4 border-[#24a148]',
  amber: 'border-l-4 border-[#f1c21b]',
  red: 'border-l-4 border-[#da1e28]',
  neutral: 'border-l-4 border-carbon-gray-20',
};

// ─── Admin Role Selector ───────────────────────────────────────────────────────

const ROLE_OPTIONS: AdminRole[] = [
  'platform_admin',
  'data_engineer',
  'security_compliance',
  'support_analyst',
  'auditor',
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AdminConsoleHome() {
  const [adminRole, setAdminRole] = useState<AdminRole>(DEFAULT_ADMIN_ROLE);
  const [isMock, setIsMock] = useState(true);
  const [kpis, setKpis] = useState<KpiCard[]>([
    {
      label: 'Active Connectors',
      value: '—',
      sub: 'of 8 configured',
      status: 'neutral',
      icon: 'ArrowsRightLeftIcon',
    },
    {
      label: 'Active Consents',
      value: '—',
      sub: 'FHIR R4 live count',
      status: 'neutral',
      icon: 'ShieldCheckIcon',
    },
    {
      label: 'System Uptime',
      value: '—',
      sub: 'rolling 30-day',
      status: 'neutral',
      icon: 'HeartIcon',
    },
    {
      label: 'Open Alerts',
      value: '—',
      sub: 'require attention',
      status: 'neutral',
      icon: 'BellAlertIcon',
    },
  ]);
  const [activity, setActivity] = useState<ActivityRow[]>(MOCK_ACTIVITY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setIsMock(getFhirMockMode());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let consentCount = 4;
      if (!getFhirMockMode()) {
        try {
          const client = getFhirClient();
          const bundle: any = await client.search('Consent', {
            status: 'active',
            _summary: 'count',
          });
          if (!cancelled) consentCount = bundle?.total ?? 4;
        } catch {
          /* fall through to mock */
        }
      }

      // AuditEvents from FHIR
      let activityRows: ActivityRow[] = MOCK_ACTIVITY;
      if (!getFhirMockMode()) {
        try {
          const client = getFhirClient();
          const bundle: any = await client.search('AuditEvent', { _count: '5', _sort: '-date' });
          const entries: any[] = bundle?.entry ?? [];
          if (entries.length > 0) {
            activityRows = entries.map((e: any, i: number) => {
              const r = e.resource;
              return {
                id: r.id ?? `ae-${i}`,
                timestamp: r.recorded ? new Date(r.recorded).toLocaleString() : '—',
                actor: r.agent?.[0]?.who?.display ?? r.agent?.[0]?.who?.reference ?? 'System',
                action: r.action ?? '—',
                resource: r.entity?.[0]?.what?.reference ?? '—',
                outcome: r.outcome === '0' ? 'success' : r.outcome === '4' ? 'warning' : 'error',
              };
            });
          }
        } catch {
          /* use mock */
        }
      }

      if (!cancelled) {
        setActivity(activityRows);
        setKpis([
          {
            label: 'Active Connectors',
            value: '6 / 8',
            sub: 'of 8 configured',
            status: 'amber',
            icon: 'ArrowsRightLeftIcon',
          },
          {
            label: 'Active Consents',
            value: consentCount,
            sub: 'FHIR R4 live count',
            status: 'green',
            icon: 'ShieldCheckIcon',
          },
          {
            label: 'System Uptime',
            value: '99.94%',
            sub: 'rolling 30-day',
            status: 'green',
            icon: 'HeartIcon',
          },
          {
            label: 'Open Alerts',
            value: MOCK_ALERTS.filter((a) => a.severity !== 'green').length,
            sub: 'require attention',
            status: 'amber',
            icon: 'BellAlertIcon',
          },
        ]);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const roleColor = ADMIN_ROLE_COLORS[adminRole];

  return (
    <AppLayout
      pageTitle="Admin Console"
      breadcrumbs={[{ label: 'Admin Console' }, { label: 'Home Dashboard' }]}
    >
      {/* ── Header strip ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">Admin Console</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            Platform operations, governance, and oversight
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          {/* Admin role switcher for demo */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-carbon-gray-50">Demo role:</span>
            <select
              value={adminRole}
              onChange={(e) => setAdminRole(e.target.value as AdminRole)}
              className="text-xs border border-carbon-gray-20 bg-white text-carbon-gray-100 px-2 py-1 focus:outline-none focus:border-carbon-blue"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ADMIN_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <span
            className="text-xs font-semibold px-2 py-1"
            style={{ background: roleColor.bg, color: roleColor.text }}
          >
            {ADMIN_ROLE_LABELS[adminRole]}
          </span>
        </div>
      </div>

      {/* ── Alert feed ── */}
      <div className="space-y-2 mb-6">
        {MOCK_ALERTS.map((a) => (
          <div
            key={a.id}
            className={`flex items-center gap-3 px-4 py-2.5 border text-sm ${
              a.severity === 'amber'
                ? 'bg-[#fff8e1] border-[#f1c21b] text-[#8a3800]'
                : a.severity === 'red'
                  ? 'bg-[#fff1f1] border-[#da1e28] text-[#a2191f]'
                  : 'bg-[#f0fdf4] border-[#a7f0ba] text-[#0e6027]'
            }`}
          >
            <Icon
              name={a.severity === 'green' ? 'CheckCircleIcon' : 'ExclamationTriangleIcon'}
              size={16}
            />
            <span className="flex-1">{a.message}</span>
            <span className="text-xs font-medium opacity-70">{a.section}</span>
          </div>
        ))}
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`bg-white border border-carbon-gray-20 p-4 ${KPISTATUS_BAR[k.status]}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold">
                {k.label}
              </span>
              <Icon name={k.icon as any} size={16} className="text-carbon-gray-50" />
            </div>
            <p className="text-2xl font-bold text-carbon-gray-100">
              {loading ? <span className="animate-pulse text-carbon-gray-30">—</span> : k.value}
            </p>
            {k.sub && <p className="text-xs text-carbon-gray-50 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Section cards grid ── */}
      <h2 className="text-sm font-semibold text-carbon-gray-70 uppercase tracking-widest mb-3">
        Console Sections
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {SECTION_CARDS.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="bg-white border border-carbon-gray-20 p-5 hover:border-carbon-blue hover:shadow-sm transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-carbon-gray-10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#d0e2ff] transition-colors">
                <Icon
                  name={s.icon as any}
                  size={18}
                  className="text-carbon-gray-70 group-hover:text-carbon-blue"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-carbon-gray-100">{s.label}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[s.status]}`} />
                  <span
                    className={`text-2xs font-semibold px-1.5 py-0.5 ml-auto ${STATUS_PILL[s.status]}`}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
                <p className="text-xs text-carbon-gray-50 leading-relaxed">{s.description}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-carbon-gray-50">Phase {s.phase}</span>
              <span className="text-xs font-medium text-carbon-blue group-hover:underline">
                Open →
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Recent activity ── */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20">
          <h2 className="text-sm font-semibold text-carbon-gray-100">Recent Activity</h2>
          <span className="text-xs text-carbon-gray-50">
            {isMock ? 'Mock data' : 'Live FHIR AuditEvent'}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
              <th className="px-4 py-2 text-left font-semibold">Timestamp</th>
              <th className="px-4 py-2 text-left font-semibold">Actor</th>
              <th className="px-4 py-2 text-left font-semibold">Action</th>
              <th className="px-4 py-2 text-left font-semibold">Resource</th>
              <th className="px-4 py-2 text-left font-semibold">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {activity.map((row) => (
              <tr key={row.id} className="hover:bg-carbon-gray-10">
                <td className="px-4 py-2.5 text-xs text-carbon-gray-50 font-mono whitespace-nowrap">
                  {row.timestamp}
                </td>
                <td className="px-4 py-2.5 text-xs text-carbon-gray-100">{row.actor}</td>
                <td className="px-4 py-2.5 text-xs text-carbon-gray-100 font-medium">
                  {row.action}
                </td>
                <td className="px-4 py-2.5 text-xs text-carbon-gray-50 font-mono">
                  {row.resource}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 ${OUTCOME_PILL[row.outcome]}`}
                  >
                    {row.outcome.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
