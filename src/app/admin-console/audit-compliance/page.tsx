'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import AccessDenied from '@/components/admin/AccessDenied';
import {
  DEFAULT_ADMIN_ROLE,
  ADMIN_ROLE_LABELS,
  canView,
  canFull,
  type AdminRole,
} from '@/lib/adminConsoleRoles';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Types ─────────────────────────────────────────────────────────────────────

type DateRange = '7d' | '30d' | '90d';
type ModuleFilter = 'ALL' | 'Data Connections' | 'Consent' | 'Agent' | 'Identity' | 'System';

interface AuditRow {
  id: string;
  timestamp: string;
  module: ModuleFilter;
  actor: string;
  action: string;
  resource: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const AUDIT_MOCK: AuditRow[] = [
  {
    id: 'au-01',
    timestamp: '2026-07-14 11:02',
    module: 'System',
    actor: 'CI/CD',
    action: 'Deploy',
    resource: 'App v2.14.1',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-02',
    timestamp: '2026-07-14 10:55',
    module: 'Consent',
    actor: 'sarah.johnson',
    action: 'PUT Consent',
    resource: 'Consent/cns-001',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-03',
    timestamp: '2026-07-14 10:45',
    module: 'Agent',
    actor: 'agent-risk-v2',
    action: 'Disenrollment',
    resource: 'Patient/***-0006',
    outcome: 'BLOCKED',
  },
  {
    id: 'au-04',
    timestamp: '2026-07-14 10:35',
    module: 'Data Connections',
    actor: 'system',
    action: 'Sync Failed',
    resource: 'Claims Adapter',
    outcome: 'FAILURE',
  },
  {
    id: 'au-05',
    timestamp: '2026-07-14 10:20',
    module: 'Identity',
    actor: 'unknown',
    action: 'Failed Login',
    resource: 'Auth Service',
    outcome: 'FAILURE',
  },
  {
    id: 'au-06',
    timestamp: '2026-07-14 10:18',
    module: 'Identity',
    actor: 'unknown',
    action: 'Account Lockout',
    resource: 'jenna.park',
    outcome: 'BLOCKED',
  },
  {
    id: 'au-07',
    timestamp: '2026-07-14 10:10',
    module: 'Data Connections',
    actor: 'system',
    action: 'Sync Success',
    resource: 'Quest Lab Feed',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-08',
    timestamp: '2026-07-14 09:55',
    module: 'Agent',
    actor: 'agent-sdoh-v3',
    action: 'Bulk Disclosure',
    resource: 'COHORT-12',
    outcome: 'BLOCKED',
  },
  {
    id: 'au-09',
    timestamp: '2026-07-14 09:30',
    module: 'Consent',
    actor: 'james.whitfield',
    action: 'GET Consent',
    resource: 'Consent/cns-002',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-10',
    timestamp: '2026-07-14 09:00',
    module: 'System',
    actor: 'system',
    action: 'Health Check',
    resource: 'FHIR Server',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-11',
    timestamp: '2026-07-14 08:50',
    module: 'Identity',
    actor: 'sarah.johnson',
    action: 'Login',
    resource: 'Auth Service',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-12',
    timestamp: '2026-07-14 08:30',
    module: 'Consent',
    actor: 'rosa.gutierrez',
    action: 'GET Consent',
    resource: 'Consent/cns-006',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-13',
    timestamp: '2026-07-13 17:00',
    module: 'Agent',
    actor: 'agent-care-plan-v1',
    action: 'Care Plan Update',
    resource: 'CarePlan/cp-001',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-14',
    timestamp: '2026-07-13 16:40',
    module: 'Data Connections',
    actor: 'system',
    action: 'Sync Success',
    resource: 'Epic EHR',
    outcome: 'SUCCESS',
  },
  {
    id: 'au-15',
    timestamp: '2026-07-13 14:20',
    module: 'Identity',
    actor: 'rosa.gutierrez',
    action: 'Logout',
    resource: 'Auth Service',
    outcome: 'SUCCESS',
  },
];

const COMPLIANCE_REPORTS = [
  {
    id: 'cr-hipaa',
    title: 'HIPAA Privacy & Security Summary',
    period: 'Q2 2026',
    lastGenerated: '2026-07-01',
    description: 'Summary of PHI access, disclosures, and safeguard controls',
  },
  {
    id: 'cr-42cfr',
    title: '42 CFR Part 2 Compliance Report',
    period: 'Q2 2026',
    lastGenerated: '2026-07-01',
    description: 'Substance use data access log and consent verification summary',
  },
  {
    id: 'cr-cms',
    title: 'CMS RHTP Attestation Package',
    period: 'Q2 2026',
    lastGenerated: '2026-07-01',
    description: 'Program attestation data: quality measures, consent, outcomes',
  },
  {
    id: 'cr-tribal',
    title: 'Tribal Data Sovereignty Audit',
    period: 'Q2 2026',
    lastGenerated: '2026-06-15',
    description: 'Native American patient data handling and tribal agreement compliance',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const OUTCOME_PILL: Record<AuditRow['outcome'], string> = {
  SUCCESS: 'bg-[#defbe6] text-[#0e6027]',
  FAILURE: 'bg-[#fff1e0] text-[#8a3800]',
  BLOCKED: 'bg-[#fff1f1] text-[#a2191f]',
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
};

const MODULE_OPTIONS: ModuleFilter[] = [
  'ALL',
  'Data Connections',
  'Consent',
  'Agent',
  'Identity',
  'System',
];

const PAGE_SIZE = 25;

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AuditCompliance() {
  const [adminRole, setAdminRole] = useState<AdminRole>(DEFAULT_ADMIN_ROLE);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('ALL');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditRow[]>(AUDIT_MOCK);
  const [isMock, setIsMock] = useState(true);

  useEffect(() => {
    setIsMock(getFhirMockMode());
  }, []);

  useEffect(() => {
    if (getFhirMockMode()) {
      setRows(AUDIT_MOCK);
      return;
    }
    (async () => {
      try {
        const client = getFhirClient();
        const bundle: any = await client.search('AuditEvent', { _count: '100', _sort: '-date' });
        const entries: any[] = (bundle?.entry ?? []).map((e: any) => e.resource);
        if (entries.length > 0) {
          setRows(
            entries.map((r: any, i: number) => ({
              id: r.id ?? `au-${i}`,
              timestamp: r.recorded ? new Date(r.recorded).toLocaleString() : '—',
              module: 'System' as ModuleFilter,
              actor: r.agent?.[0]?.who?.display ?? r.agent?.[0]?.who?.reference ?? 'System',
              action: r.action ?? '—',
              resource: r.entity?.[0]?.what?.reference ?? '—',
              outcome: r.outcome === '0' ? 'SUCCESS' : r.outcome === '4' ? 'FAILURE' : 'BLOCKED',
            }))
          );
        }
      } catch {
        /* keep mock */
      }
    })();
  }, []);

  if (!canView(adminRole, 'audit-compliance')) {
    return (
      <AppLayout
        pageTitle="Audit & Compliance"
        breadcrumbs={[
          { label: 'Admin Console', href: '/admin-console/home' },
          { label: 'Audit & Compliance' },
        ]}
      >
        <AccessDenied section="Audit & Compliance" role={ADMIN_ROLE_LABELS[adminRole]} />
      </AppLayout>
    );
  }

  const filtered = rows.filter((r) => moduleFilter === 'ALL' || r.module === moduleFilter);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);

  function handleExportCSV() {
    const header = 'Timestamp,Module,Actor,Action,Resource,Outcome\n';
    const body = filtered
      .map(
        (r) =>
          `"${r.timestamp}","${r.module}","${r.actor}","${r.action}","${r.resource}","${r.outcome}"`
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rhtp-audit-${dateRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout
      pageTitle="Audit & Compliance"
      breadcrumbs={[
        { label: 'Admin Console', href: '/admin-console/home' },
        { label: 'Audit & Compliance' },
      ]}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">Audit &amp; Compliance</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            Cross-module audit trail and compliance report generation
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
          { label: 'Total Events', value: filtered.length, color: 'border-l-carbon-gray-20' },
          {
            label: 'Successes',
            value: filtered.filter((r) => r.outcome === 'SUCCESS').length,
            color: 'border-l-[#24a148]',
          },
          {
            label: 'Failures',
            value: filtered.filter((r) => r.outcome === 'FAILURE').length,
            color: 'border-l-[#f1c21b]',
          },
          {
            label: 'Blocked',
            value: filtered.filter((r) => r.outcome === 'BLOCKED').length,
            color: 'border-l-[#da1e28]',
          },
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

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1">
          {(['7d', '30d', '90d'] as DateRange[]).map((d) => (
            <button
              key={d}
              onClick={() => {
                setDateRange(d);
                setPage(0);
              }}
              className={`text-xs px-3 py-1.5 font-medium transition-colors ${dateRange === d ? 'bg-carbon-blue text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
            >
              {DATE_RANGE_LABELS[d]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {MODULE_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setModuleFilter(m);
                setPage(0);
              }}
              className={`text-xs px-2.5 py-1.5 font-medium transition-colors ${moduleFilter === m ? 'bg-[#6929c4] text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
            >
              {m}
            </button>
          ))}
        </div>
        {canFull(adminRole, 'audit-compliance') && (
          <button
            onClick={handleExportCSV}
            className="ml-auto text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 flex items-center gap-1.5 transition-colors"
          >
            <Icon name="ArrowDownTrayIcon" size={14} />
            Export CSV
          </button>
        )}
      </div>

      {/* Audit trail table */}
      <div className="bg-white border border-carbon-gray-20 mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
              <th className="px-4 py-2 text-left font-semibold">Timestamp</th>
              <th className="px-4 py-2 text-left font-semibold">Module</th>
              <th className="px-4 py-2 text-left font-semibold">Actor</th>
              <th className="px-4 py-2 text-left font-semibold">Action</th>
              <th className="px-4 py-2 text-left font-semibold">Resource</th>
              <th className="px-4 py-2 text-left font-semibold">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {paged.map((r) => (
              <tr
                key={r.id}
                className={`hover:bg-carbon-gray-10 ${r.outcome === 'BLOCKED' ? 'bg-[#fff8f8]' : ''}`}
              >
                <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50 whitespace-nowrap">
                  {r.timestamp}
                </td>
                <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{r.module}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-100">{r.actor}</td>
                <td className="px-4 py-2.5 text-xs font-medium text-carbon-gray-100">{r.action}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-carbon-blue">{r.resource}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 ${OUTCOME_PILL[r.outcome]}`}>
                    {r.outcome}
                  </span>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-carbon-gray-50">
                  No audit events match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-carbon-gray-20 flex items-center justify-between text-xs text-carbon-gray-50">
          <span>
            {isMock ? 'Mock data' : 'Live FHIR AuditEvent'} · {filtered.length} events · Page{' '}
            {page + 1} of {Math.max(1, pageCount)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 border border-carbon-gray-20 disabled:opacity-40 hover:bg-carbon-gray-10"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="px-2 py-1 border border-carbon-gray-20 disabled:opacity-40 hover:bg-carbon-gray-10"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>

      {/* Compliance reports panel */}
      <h2 className="text-sm font-semibold text-carbon-gray-70 uppercase tracking-widest mb-3">
        Compliance Reports
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {COMPLIANCE_REPORTS.map((r) => (
          <div key={r.id} className="bg-white border border-carbon-gray-20 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm text-carbon-gray-100 mb-1">{r.title}</p>
                <p className="text-xs text-carbon-gray-50 mb-2">{r.description}</p>
                <div className="flex items-center gap-3 text-xs text-carbon-gray-50">
                  <span>
                    Period: <span className="font-medium text-carbon-gray-70">{r.period}</span>
                  </span>
                  <span>
                    Generated: <span className="font-mono">{r.lastGenerated}</span>
                  </span>
                </div>
              </div>
              {canFull(adminRole, 'audit-compliance') && (
                <button className="flex-shrink-0 text-xs px-3 py-1.5 bg-carbon-gray-10 text-carbon-gray-70 border border-carbon-gray-20 hover:bg-carbon-gray-20 flex items-center gap-1.5 transition-colors">
                  <Icon name="ArrowDownTrayIcon" size={14} />
                  Generate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
