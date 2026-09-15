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
  canFull,
  type AdminRole,
} from '@/lib/adminConsoleRoles';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PendingAction {
  id: string;
  agentId: string;
  actionType: string;
  patient: string;
  riskScore: number;
  requested: string;
  detail: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
}

interface Guardrail {
  id: string;
  actionType: string;
  threshold: string;
  min: string;
  max: string;
  lastChangedBy: string;
  lastChanged: string;
}

interface AgentActivityRow {
  id: string;
  timestamp: string;
  agentId: string;
  action: string;
  patient: string;
  outcome: 'success' | 'warning' | 'error' | 'blocked';
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const PENDING_MOCK: PendingAction[] = [
  {
    id: 'pa-001',
    agentId: 'agent-risk-v2',
    actionType: 'Automatic Dis-enrollment',
    patient: '***-0006',
    riskScore: 91,
    requested: '2026-07-14 10:45',
    detail:
      'Risk model triggered auto-disenrollment for high-risk patient based on 3 missed visits + ER admission',
    status: 'PENDING',
  },
  {
    id: 'pa-002',
    agentId: 'agent-referral-v1',
    actionType: 'Override Referral Denial',
    patient: '***-0042',
    riskScore: 78,
    requested: '2026-07-14 10:30',
    detail:
      'Agent proposes overriding payer denial for specialist referral based on SDOH risk factors',
    status: 'PENDING',
  },
  {
    id: 'pa-003',
    agentId: 'agent-sdoh-v3',
    actionType: 'Mass SDOH Disclosure',
    patient: 'COHORT-12',
    riskScore: 85,
    requested: '2026-07-14 09:55',
    detail:
      'Bulk SDOH data share to 3 CBOs for 12-patient cohort — exceeds single-record threshold',
    status: 'PENDING',
  },
];

const GUARDRAILS_MOCK: Guardrail[] = [
  {
    id: 'gr-01',
    actionType: 'Auto-disenrollment',
    threshold: 'Risk score ≥ 90',
    min: '80',
    max: '100',
    lastChangedBy: 'platform_admin',
    lastChanged: '2026-07-01',
  },
  {
    id: 'gr-02',
    actionType: 'Referral Override',
    threshold: 'Risk score ≥ 75',
    min: '60',
    max: '95',
    lastChangedBy: 'security_compliance',
    lastChanged: '2026-06-15',
  },
  {
    id: 'gr-03',
    actionType: 'Bulk SDOH Disclosure',
    threshold: '> 10 patients',
    min: '5',
    max: '20',
    lastChangedBy: 'platform_admin',
    lastChanged: '2026-06-20',
  },
  {
    id: 'gr-04',
    actionType: 'Consent Auto-grant',
    threshold: 'Never (disabled)',
    min: 'N/A',
    max: 'N/A',
    lastChangedBy: 'security_compliance',
    lastChanged: '2026-05-01',
  },
  {
    id: 'gr-05',
    actionType: 'Care Plan Auto-close',
    threshold: '90 days inactive',
    min: '60',
    max: '180',
    lastChangedBy: 'platform_admin',
    lastChanged: '2026-07-10',
  },
];

const ACTIVITY_MOCK: AgentActivityRow[] = [
  {
    id: 'aa-01',
    timestamp: '2026-07-14 11:05',
    agentId: 'agent-risk-v2',
    action: 'Risk Assessment',
    patient: '***-0006',
    outcome: 'success',
  },
  {
    id: 'aa-02',
    timestamp: '2026-07-14 10:50',
    agentId: 'agent-sdoh-v3',
    action: 'SDOH Flag — Food',
    patient: '***-0031',
    outcome: 'success',
  },
  {
    id: 'aa-03',
    timestamp: '2026-07-14 10:45',
    agentId: 'agent-risk-v2',
    action: 'Disenrollment Trigger',
    patient: '***-0006',
    outcome: 'warning',
  },
  {
    id: 'aa-04',
    timestamp: '2026-07-14 10:30',
    agentId: 'agent-referral-v1',
    action: 'Referral Override Req',
    patient: '***-0042',
    outcome: 'warning',
  },
  {
    id: 'aa-05',
    timestamp: '2026-07-14 09:55',
    agentId: 'agent-sdoh-v3',
    action: 'Bulk SDOH Disclosure Req',
    patient: 'COHORT-12',
    outcome: 'blocked',
  },
  {
    id: 'aa-06',
    timestamp: '2026-07-14 09:30',
    agentId: 'agent-care-plan-v1',
    action: 'Care Plan Update',
    patient: '***-0001',
    outcome: 'success',
  },
  {
    id: 'aa-07',
    timestamp: '2026-07-14 09:00',
    agentId: 'agent-risk-v2',
    action: 'Monthly Batch Scoring',
    patient: 'COHORT-38',
    outcome: 'success',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const RISK_COLOR = (score: number) =>
  score >= 85
    ? 'text-[#a2191f] font-bold'
    : score >= 70
      ? 'text-[#8a3800] font-semibold'
      : 'text-carbon-gray-70';

const OUTCOME_PILL: Record<AgentActivityRow['outcome'], string> = {
  success: 'bg-[#defbe6] text-[#0e6027]',
  warning: 'bg-[#fff1e0] text-[#8a3800]',
  error: 'bg-[#fff1f1] text-[#a2191f]',
  blocked: 'bg-[#f4f4f4] text-[#525252] font-semibold',
};

type Tab = 'pending' | 'guardrails' | 'activity';

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AgentOversight() {
  const [adminRole, setAdminRole] = useState<AdminRole>(DEFAULT_ADMIN_ROLE);
  const [tab, setTab] = useState<Tab>('pending');
  const [actions, setActions] = useState<PendingAction[]>(PENDING_MOCK);
  const [activityRows, setActivityRows] = useState<AgentActivityRow[]>(ACTIVITY_MOCK);
  const [isMock, setIsMock] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    setIsMock(getFhirMockMode());
  }, []);

  useEffect(() => {
    if (getFhirMockMode()) return;
    (async () => {
      try {
        const client = getFhirClient();
        const bundle: any = await client.search('AuditEvent', { _count: '20', _sort: '-date' });
        const entries: any[] = (bundle?.entry ?? []).map((e: any) => e.resource);
        if (entries.length > 0) {
          setActivityRows(
            entries.slice(0, 10).map((r: any, i: number) => ({
              id: r.id ?? `aa-${i}`,
              timestamp: r.recorded ? new Date(r.recorded).toLocaleString() : '—',
              agentId: r.agent?.[0]?.who?.display ?? 'System',
              action: r.action ?? '—',
              patient: r.entity?.[0]?.what?.reference
                ? `***-${r.entity[0].what.reference.slice(-4)}`
                : '—',
              outcome: r.outcome === '0' ? 'success' : r.outcome === '4' ? 'warning' : 'error',
            }))
          );
        }
      } catch {
        /* keep mock */
      }
    })();
  }, []);

  function handleDecision(id: string, decision: 'APPROVED' | 'DENIED') {
    setProcessing(id);
    setTimeout(() => {
      setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status: decision } : a)));
      setProcessing(null);
    }, 1200);
  }

  if (!canView(adminRole, 'agent-oversight')) {
    return (
      <AppLayout
        pageTitle="Agent Oversight"
        breadcrumbs={[
          { label: 'Admin Console', href: '/admin-console/home' },
          { label: 'Agent Oversight' },
        ]}
      >
        <AccessDenied section="Agent Oversight" role={ADMIN_ROLE_LABELS[adminRole]} />
      </AppLayout>
    );
  }

  const pendingCount = actions.filter((a) => a.status === 'PENDING').length;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Pending Approval' },
    { key: 'guardrails', label: 'Guardrails' },
    { key: 'activity', label: 'Activity Log' },
  ];

  return (
    <AppLayout
      pageTitle="Agent Oversight"
      breadcrumbs={[
        { label: 'Admin Console', href: '/admin-console/home' },
        { label: 'Agent Oversight' },
      ]}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">Agent Oversight</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            Approve/deny high-risk agent actions, configure guardrails, review activity log
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

      {/* Alert banner */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-[#fff8e1] border border-[#f1c21b] text-sm text-[#8a3800]">
          <Icon name="ExclamationTriangleIcon" size={18} />
          <span className="font-semibold">
            {pendingCount} high-risk agent action{pendingCount > 1 ? 's' : ''} pending your review
          </span>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Pending Approval',
            value: pendingCount,
            color: pendingCount > 0 ? 'border-l-[#f1c21b]' : 'border-l-[#24a148]',
          },
          {
            label: 'Approved Today',
            value: actions.filter((a) => a.status === 'APPROVED').length,
            color: 'border-l-[#24a148]',
          },
          {
            label: 'Denied Today',
            value: actions.filter((a) => a.status === 'DENIED').length,
            color: 'border-l-[#da1e28]',
          },
          {
            label: 'Active Guardrails',
            value: GUARDRAILS_MOCK.filter((g) => g.threshold !== 'Never (disabled)').length,
            color: 'border-l-carbon-gray-20',
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

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-carbon-blue text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
          >
            {t.label}
            {t.key === 'pending' && pendingCount > 0 && (
              <span className="ml-2 bg-carbon-red text-white text-2xs font-bold px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Pending Approval tab ── */}
      {tab === 'pending' && (
        <div className="space-y-4">
          {actions
            .filter((a) => a.status === 'PENDING')
            .map((a) => (
              <div key={a.id} className="bg-white border border-carbon-gray-20 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-mono text-carbon-gray-50">{a.agentId}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-[#fff1f1] text-[#a2191f]">
                        {a.actionType}
                      </span>
                      <span className={`text-xs px-2 py-0.5 ${RISK_COLOR(a.riskScore)}`}>
                        Risk: {a.riskScore}/100
                      </span>
                      <span className="text-xs text-carbon-gray-50 ml-auto">{a.requested}</span>
                    </div>
                    <p className="text-sm text-carbon-gray-100 mb-1">
                      <span className="text-carbon-gray-50 mr-2">Patient:</span>
                      <span className="font-mono font-medium">{a.patient}</span>
                    </p>
                    <p className="text-xs text-carbon-gray-70">{a.detail}</p>
                  </div>
                  {canEdit(adminRole, 'agent-oversight') && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDecision(a.id, 'APPROVED')}
                        disabled={!!processing}
                        className="px-4 py-2 text-sm font-semibold bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba] hover:bg-[#c6efcd] disabled:opacity-50 transition-colors"
                      >
                        {processing === a.id ? '…' : '✓ Approve'}
                      </button>
                      <button
                        onClick={() => handleDecision(a.id, 'DENIED')}
                        disabled={!!processing}
                        className="px-4 py-2 text-sm font-semibold bg-[#fff1f1] text-[#a2191f] border border-[#ffb3b8] hover:bg-[#ffd7d9] disabled:opacity-50 transition-colors"
                      >
                        {processing === a.id ? '…' : '✕ Deny'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          {/* Resolved actions */}
          {actions.filter((a) => a.status !== 'PENDING').length > 0 && (
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-4 py-3 border-b border-carbon-gray-20">
                <h3 className="text-sm font-semibold text-carbon-gray-70">Resolved Today</h3>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-carbon-gray-20">
                  {actions
                    .filter((a) => a.status !== 'PENDING')
                    .map((a) => (
                      <tr key={a.id} className="hover:bg-carbon-gray-10">
                        <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                          {a.agentId}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-carbon-gray-100">{a.actionType}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                          {a.patient}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 ${a.status === 'APPROVED' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fff1f1] text-[#a2191f]'}`}
                          >
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {pendingCount === 0 && actions.filter((a) => a.status !== 'PENDING').length === 0 && (
            <div className="bg-white border border-carbon-gray-20 p-8 text-center text-sm text-carbon-gray-50">
              No pending actions — all agent requests have been reviewed.
            </div>
          )}
        </div>
      )}

      {/* ── Guardrails tab ── */}
      {tab === 'guardrails' && (
        <div className="bg-white border border-carbon-gray-20">
          {canFull(adminRole, 'agent-oversight') && (
            <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
              <span className="text-xs text-carbon-gray-50">
                Changes to guardrails require step-up MFA confirmation
              </span>
              <button className="text-xs px-3 py-1.5 bg-carbon-blue text-white font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5">
                <Icon name="PencilSquareIcon" size={14} />
                Edit Thresholds
              </button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Action Type</th>
                <th className="px-4 py-2 text-left font-semibold">Current Threshold</th>
                <th className="px-4 py-2 text-left font-semibold">Min</th>
                <th className="px-4 py-2 text-left font-semibold">Max</th>
                <th className="px-4 py-2 text-left font-semibold">Last Changed By</th>
                <th className="px-4 py-2 text-left font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {GUARDRAILS_MOCK.map((g) => (
                <tr key={g.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 font-medium text-carbon-gray-100">{g.actionType}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-100">
                    {g.threshold}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">{g.min}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">{g.max}</td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{g.lastChangedBy}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                    {g.lastChanged}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Activity Log tab ── */}
      {tab === 'activity' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Timestamp</th>
                <th className="px-4 py-2 text-left font-semibold">Agent</th>
                <th className="px-4 py-2 text-left font-semibold">Action</th>
                <th className="px-4 py-2 text-left font-semibold">Patient</th>
                <th className="px-4 py-2 text-left font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {activityRows.map((r) => (
                <tr key={r.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50 whitespace-nowrap">
                    {r.timestamp}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-blue">{r.agentId}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-carbon-gray-100">
                    {r.action}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-70">{r.patient}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 ${OUTCOME_PILL[r.outcome]}`}
                    >
                      {r.outcome.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-carbon-gray-20 text-xs text-carbon-gray-50">
            {isMock ? 'Mock activity data' : 'Live FHIR AuditEvent resources'}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
