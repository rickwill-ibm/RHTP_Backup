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

interface UserRow {
  id: string;
  name: string;
  npi: string;
  role: string;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  lastLogin: string;
  mfa: boolean;
  fhirRef?: string;
}

interface AccessReview {
  id: string;
  reviewedBy: string;
  date: string;
  usersReviewed: number;
  outcome: string;
  nextReview: string;
}

interface SecurityLogRow {
  id: string;
  timestamp: string;
  user: string;
  eventType: string;
  ip: string;
  outcome: 'SUCCESS' | 'FAILED' | 'BLOCKED';
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const USERS_MOCK: UserRow[] = [
  {
    id: 'usr-001',
    name: 'Sarah Johnson',
    npi: 'NPI-1234567890',
    role: 'care_manager',
    status: 'ACTIVE',
    lastLogin: '2026-07-14 09:15',
    mfa: true,
  },
  {
    id: 'usr-002',
    name: 'Dr. James Whitfield',
    npi: 'NPI-0987654321',
    role: 'physician',
    status: 'ACTIVE',
    lastLogin: '2026-07-14 08:50',
    mfa: true,
  },
  {
    id: 'usr-003',
    name: 'Rosa Gutierrez',
    npi: 'CHW-0012',
    role: 'chw',
    status: 'ACTIVE',
    lastLogin: '2026-07-13 14:22',
    mfa: false,
  },
  {
    id: 'usr-004',
    name: 'Thomas Begay',
    npi: 'CHW-0031',
    role: 'chw',
    status: 'ACTIVE',
    lastLogin: '2026-07-14 07:40',
    mfa: true,
  },
  {
    id: 'usr-005',
    name: 'Admin API Service',
    npi: 'SVC-API-01',
    role: 'service_account',
    status: 'ACTIVE',
    lastLogin: '2026-07-14 11:00',
    mfa: false,
  },
  {
    id: 'usr-006',
    name: 'Marcus Lee',
    npi: 'CM-0045',
    role: 'care_manager',
    status: 'INACTIVE',
    lastLogin: '2026-06-01 10:00',
    mfa: false,
  },
  {
    id: 'usr-007',
    name: 'Jenna Park',
    npi: 'SPEC-0008',
    role: 'specialist',
    status: 'LOCKED',
    lastLogin: '2026-07-10 16:30',
    mfa: true,
  },
];

const REVIEWS_MOCK: AccessReview[] = [
  {
    id: 'rev-04',
    reviewedBy: 'R. Hennessy (platform_admin)',
    date: '2026-07-01',
    usersReviewed: 7,
    outcome: 'All access confirmed appropriate',
    nextReview: '2026-10-01',
  },
  {
    id: 'rev-03',
    reviewedBy: 'R. Hennessy (platform_admin)',
    date: '2026-04-01',
    usersReviewed: 7,
    outcome: 'Deactivated 1 user (Marcus Lee)',
    nextReview: '2026-07-01',
  },
  {
    id: 'rev-02',
    reviewedBy: 'R. Hennessy (platform_admin)',
    date: '2026-01-01',
    usersReviewed: 6,
    outcome: 'All access confirmed appropriate',
    nextReview: '2026-04-01',
  },
  {
    id: 'rev-01',
    reviewedBy: 'R. Hennessy (platform_admin)',
    date: '2025-10-01',
    usersReviewed: 5,
    outcome: 'Added 2 CHW accounts',
    nextReview: '2026-01-01',
  },
];

const SECLOG_MOCK: SecurityLogRow[] = [
  {
    id: 'sl-01',
    timestamp: '2026-07-14 10:55',
    user: 'sarah.johnson',
    eventType: 'Login',
    ip: '10.0.1.42',
    outcome: 'SUCCESS',
  },
  {
    id: 'sl-02',
    timestamp: '2026-07-14 10:20',
    user: 'unknown',
    eventType: 'Failed Login',
    ip: '203.0.113.5',
    outcome: 'FAILED',
  },
  {
    id: 'sl-03',
    timestamp: '2026-07-14 10:19',
    user: 'unknown',
    eventType: 'Failed Login',
    ip: '203.0.113.5',
    outcome: 'FAILED',
  },
  {
    id: 'sl-04',
    timestamp: '2026-07-14 10:18',
    user: 'unknown',
    eventType: 'Account Lockout',
    ip: '203.0.113.5',
    outcome: 'BLOCKED',
  },
  {
    id: 'sl-05',
    timestamp: '2026-07-14 09:50',
    user: 'james.whitfield',
    eventType: 'Login',
    ip: '10.0.1.18',
    outcome: 'SUCCESS',
  },
  {
    id: 'sl-06',
    timestamp: '2026-07-14 09:30',
    user: 'jenna.park',
    eventType: 'MFA Challenge',
    ip: '10.0.1.77',
    outcome: 'FAILED',
  },
  {
    id: 'sl-07',
    timestamp: '2026-07-14 09:30',
    user: 'jenna.park',
    eventType: 'Account Lockout',
    ip: '10.0.1.77',
    outcome: 'BLOCKED',
  },
  {
    id: 'sl-08',
    timestamp: '2026-07-13 17:05',
    user: 'rosa.gutierrez',
    eventType: 'Logout',
    ip: '10.0.2.5',
    outcome: 'SUCCESS',
  },
];

// ─── FHIR Practitioner mapper ───────────────────────────────────────────────────

function mapFhirPractitioner(r: any, idx: number): UserRow {
  const name = r.name?.[0];
  const displayName = name
    ? `${name.prefix?.[0] ? name.prefix[0] + ' ' : ''}${name.given?.[0] ?? ''} ${name.family ?? ''}`.trim()
    : (r.id ?? `user-${idx}`);
  return {
    id: r.id ?? `usr-${idx}`,
    name: displayName,
    npi: r.identifier?.find((id: any) => id.system?.includes('npi'))?.value ?? r.id ?? '—',
    role: r.qualification?.[0]?.code?.coding?.[0]?.display ?? 'Practitioner',
    status: 'ACTIVE',
    lastLogin: '—',
    mfa: false,
    fhirRef: `Practitioner/${r.id}`,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const USER_STATUS_PILL: Record<UserRow['status'], string> = {
  ACTIVE: 'bg-[#defbe6] text-[#0e6027]',
  INACTIVE: 'bg-[#f4f4f4] text-[#525252]',
  LOCKED: 'bg-[#fff1f1] text-[#a2191f]',
};

const SECLOG_PILL: Record<SecurityLogRow['outcome'], string> = {
  SUCCESS: 'bg-[#defbe6] text-[#0e6027]',
  FAILED: 'bg-[#fff1e0] text-[#8a3800]',
  BLOCKED: 'bg-[#fff1f1] text-[#a2191f]',
};

type Tab = 'users' | 'reviews' | 'seclog';

// ─── Component ─────────────────────────────────────────────────────────────────

export default function IdentityAccess() {
  const [adminRole, setAdminRole] = useState<AdminRole>(DEFAULT_ADMIN_ROLE);
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserRow[]>(USERS_MOCK);
  const [secLog, setSecLog] = useState<SecurityLogRow[]>(SECLOG_MOCK);
  const [isMock, setIsMock] = useState(true);

  useEffect(() => {
    setIsMock(getFhirMockMode());
  }, []);

  useEffect(() => {
    if (getFhirMockMode()) {
      setUsers(USERS_MOCK);
      return;
    }
    (async () => {
      try {
        const client = getFhirClient();
        const bundle: any = await client.search('Practitioner', { _count: '20' });
        const entries: any[] = (bundle?.entry ?? []).map((e: any) => e.resource);
        if (entries.length > 0) setUsers(entries.map(mapFhirPractitioner));
      } catch {
        /* keep mock */
      }
    })();
    (async () => {
      try {
        const client = getFhirClient();
        const bundle: any = await client.search('AuditEvent', {
          type: 'security',
          _count: '20',
          _sort: '-date',
        });
        const entries: any[] = (bundle?.entry ?? []).map((e: any) => e.resource);
        if (entries.length > 0) {
          setSecLog(
            entries.map((r: any, i: number) => ({
              id: r.id ?? `sl-${i}`,
              timestamp: r.recorded ? new Date(r.recorded).toLocaleString() : '—',
              user: r.agent?.[0]?.who?.display ?? r.agent?.[0]?.who?.reference ?? '—',
              eventType: r.type?.display ?? r.action ?? '—',
              ip: r.source?.observer?.display ?? '—',
              outcome: r.outcome === '0' ? 'SUCCESS' : r.outcome === '4' ? 'FAILED' : 'BLOCKED',
            }))
          );
        }
      } catch {
        /* keep mock */
      }
    })();
  }, []);

  if (!canView(adminRole, 'identity-access')) {
    return (
      <AppLayout
        pageTitle="Identity & Access"
        breadcrumbs={[
          { label: 'Admin Console', href: '/admin-console/home' },
          { label: 'Identity & Access' },
        ]}
      >
        <AccessDenied section="Identity & Access" role={ADMIN_ROLE_LABELS[adminRole]} />
      </AppLayout>
    );
  }

  // Auditor can only see security log tab
  const visibleTabs: { key: Tab; label: string }[] =
    adminRole === 'auditor'
      ? [{ key: 'seclog', label: 'Security Log' }]
      : [
          { key: 'users', label: 'Users & Roles' },
          { key: 'reviews', label: 'Access Reviews' },
          { key: 'seclog', label: 'Security Log' },
        ];

  const activeTab: Tab = adminRole === 'auditor' ? 'seclog' : tab;

  return (
    <AppLayout
      pageTitle="Identity & Access"
      breadcrumbs={[
        { label: 'Admin Console', href: '/admin-console/home' },
        { label: 'Identity & Access' },
      ]}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">Identity &amp; Access</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            User management, role assignments, access reviews, and security log
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
          {canFull(adminRole, 'identity-access') && (
            <button className="text-xs px-3 py-1.5 bg-carbon-blue text-white font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5">
              <Icon name="PlusIcon" size={14} />
              Create User
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Users', value: users.length, color: 'border-l-carbon-gray-20' },
          {
            label: 'Active',
            value: users.filter((u) => u.status === 'ACTIVE').length,
            color: 'border-l-[#24a148]',
          },
          {
            label: 'Locked',
            value: users.filter((u) => u.status === 'LOCKED').length,
            color: 'border-l-[#da1e28]',
          },
          {
            label: 'MFA Enabled',
            value: users.filter((u) => u.mfa).length,
            color: 'border-l-[#0043ce]',
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
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === t.key ? 'bg-carbon-blue text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Users & Roles tab ── */}
      {activeTab === 'users' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Name</th>
                <th className="px-4 py-2 text-left font-semibold">NPI / ID</th>
                <th className="px-4 py-2 text-left font-semibold">Role</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-left font-semibold">Last Login</th>
                <th className="px-4 py-2 text-left font-semibold">MFA</th>
                {canFull(adminRole, 'identity-access') && (
                  <th className="px-4 py-2 text-left font-semibold">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 font-medium text-carbon-gray-100">{u.name}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">{u.npi}</td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{u.role}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 ${USER_STATUS_PILL[u.status]}`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                    {u.lastLogin}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 ${u.mfa ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fff1e0] text-[#8a3800]'}`}
                    >
                      {u.mfa ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  {canFull(adminRole, 'identity-access') && (
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button className="text-xs px-2 py-0.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10">
                          Edit
                        </button>
                        {u.status === 'ACTIVE' && (
                          <button className="text-xs px-2 py-0.5 bg-[#fff1f1] text-[#a2191f] border border-[#ffb3b8] hover:bg-[#ffd7d9]">
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-carbon-gray-20 text-xs text-carbon-gray-50">
            {isMock ? 'Mock user data' : 'Live FHIR Practitioner resources'}
          </div>
        </div>
      )}

      {/* ── Access Reviews tab ── */}
      {activeTab === 'reviews' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Reviewed By</th>
                <th className="px-4 py-2 text-left font-semibold">Date</th>
                <th className="px-4 py-2 text-right font-semibold">Users Reviewed</th>
                <th className="px-4 py-2 text-left font-semibold">Outcome</th>
                <th className="px-4 py-2 text-left font-semibold">Next Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {REVIEWS_MOCK.map((r) => (
                <tr key={r.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 text-sm text-carbon-gray-100">{r.reviewedBy}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">{r.date}</td>
                  <td className="px-4 py-2.5 text-xs text-right font-mono text-carbon-gray-100">
                    {r.usersReviewed}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{r.outcome}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-blue">{r.nextReview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Security Log tab ── */}
      {activeTab === 'seclog' && (
        <div className="bg-white border border-carbon-gray-20">
          {canFull(adminRole, 'identity-access') && (
            <div className="px-4 py-3 border-b border-carbon-gray-20 flex justify-end">
              <button className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 flex items-center gap-1.5">
                <Icon name="ArrowDownTrayIcon" size={14} />
                Export CSV
              </button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Timestamp</th>
                <th className="px-4 py-2 text-left font-semibold">User</th>
                <th className="px-4 py-2 text-left font-semibold">Event Type</th>
                <th className="px-4 py-2 text-left font-semibold">IP Address</th>
                <th className="px-4 py-2 text-left font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {secLog.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-carbon-gray-10 ${r.outcome === 'BLOCKED' ? 'bg-[#fff8f8]' : ''}`}
                >
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50 whitespace-nowrap">
                    {r.timestamp}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-100">{r.user}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-carbon-gray-100">
                    {r.eventType}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">{r.ip}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 ${SECLOG_PILL[r.outcome]}`}>
                      {r.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-carbon-gray-20 text-xs text-carbon-gray-50">
            {isMock ? 'Mock security log' : 'Live FHIR AuditEvent (type=security)'}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
