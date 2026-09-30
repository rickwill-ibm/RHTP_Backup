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
import * as clock from '@/lib/clock'; // injected clock seam — the only wall-clock read
import { formatInstantUtc, useMountedInstant } from '@/lib/client/useMountedInstant';
import {
  CONSENT_RECORDS,
  consentsFromBundle,
  displayDate,
  displayRef,
  loadConsentView,
  type ConsentSeedRecord,
} from '@/lib/consent/consentRecords';
import { deriveConsentStatus } from '@/lib/consent/consentStatus';
import type { ConsentStatus } from '@/lib/consent/consentStatus';

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * CONSENT STATUS IS DERIVED, NEVER STORED. The seven seed records live in ONE place
 * (`src/lib/consent/data/consent-records.json`, shared with the Consent & Sovereignty
 * Panel) and carry only lifecycle DATES. `loadConsentView(asOf)` derives each row's status
 * and the KPI counts from the SAME traversal against the SAME clock reading, so the tiles
 * can never disagree with the table. A stored status was the fail-open this screen shipped:
 * four records whose grants lapsed in 2025 / early 2026 kept badging ACTIVE.
 */

interface SovereigntyRule {
  rule: string;
  description: string;
  status: string;
  scope: string;
  lastAudit: string;
}

/**
 * A partner data-use agreement. Same rule as a consent: NO stored status. Two rows here
 * shipped a hardcoded ACTIVE against expiry dates of 2026-01-15 and 2026-06-01 — an admin
 * reading ACTIVE would authorise a disclosure under a lapsed BAA.
 */
interface DuaRow {
  partner: string;
  agreementType: string;
  signedDate: string;
  expiresDate: string;
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const SOVEREIGNTY_RULES: SovereigntyRule[] = [
  {
    rule: 'BH 42 CFR Part 2',
    description: 'Substance use records require explicit consent before any disclosure',
    status: 'ENFORCED',
    scope: 'All BH data',
    lastAudit: '2024-12-01',
  },
  {
    rule: 'HIPAA Minimum Necessary',
    description: 'Only minimum necessary data shared per request purpose',
    status: 'ENFORCED',
    scope: 'All data types',
    lastAudit: '2024-12-01',
  },
  {
    rule: 'Tribal Data Sovereignty',
    description: 'Native American patient data governed by tribal agreements',
    status: 'ENFORCED',
    scope: 'Tribal members',
    lastAudit: '2024-11-15',
  },
  {
    rule: 'CCPA — CA Residents',
    description: 'Right to know, delete, and opt-out for California residents',
    status: 'ENFORCED',
    scope: 'CA residents',
    lastAudit: '2024-11-30',
  },
  {
    rule: 'Cross-Org Sharing Block',
    description: 'No data shared outside RHTP network without explicit consent',
    status: 'ENFORCED',
    scope: 'All patients',
    lastAudit: '2024-12-01',
  },
  {
    rule: 'Pediatric Data Protection',
    description: 'Patients under 18 require guardian consent for all sharing',
    status: 'ENFORCED',
    scope: 'Minors',
    lastAudit: '2024-11-20',
  },
];

const DUA_MOCK: DuaRow[] = [
  {
    partner: 'Prairie Health Network',
    agreementType: 'BAA + DUA',
    signedDate: '2023-01-15',
    expiresDate: '2026-01-15',
  },
  {
    partner: 'CCBHC — Clay County',
    agreementType: 'BH DUA',
    signedDate: '2022-09-01',
    expiresDate: '2024-09-01',
  },
  {
    partner: 'Unite Us Network',
    agreementType: 'SDOH Data Share',
    signedDate: '2024-02-10',
    expiresDate: '2027-02-10',
  },
  {
    partner: 'Jackson County Memorial',
    agreementType: 'BAA',
    signedDate: '2023-06-01',
    expiresDate: '2026-06-01',
  },
  {
    partner: 'RHTP Research Registry',
    agreementType: 'Research DUA',
    signedDate: '2024-01-01',
    expiresDate: '2027-01-01',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<ConsentStatus, string> = {
  ACTIVE: 'bg-[#defbe6] text-[#0e6027]',
  REVOKED: 'bg-[#fff1f1] text-[#a2191f]',
  EXPIRED: 'bg-[#f4f4f4] text-[#525252]',
  PENDING: 'bg-[#fff1e0] text-[#8a3800]',
};

const DUA_PILL: Record<ConsentStatus, string> = STATUS_PILL;

/** A DUA's status, derived from its dates by the SAME function the consent rows use. */
function duaStatus(dua: DuaRow, asOf: string): ConsentStatus {
  return deriveConsentStatus(
    { grantedDate: dua.signedDate, expiresDate: dua.expiresDate, revokedDate: null },
    asOf
  );
}

type Tab = 'records' | 'rules' | 'dua';

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ConsentGovernance() {
  const [adminRole, setAdminRole] = useState<AdminRole>(DEFAULT_ADMIN_ROLE);
  const [tab, setTab] = useState<Tab>('records');
  const [records, setRecords] = useState<readonly ConsentSeedRecord[]>(CONSENT_RECORDS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConsentStatus | 'ALL'>('ALL');
  // One clock reading for this session's view: table rows, KPI tiles and the Revoke
  // affordance all resolve against the SAME `asOf` instant, rendered below.
  const [asOf] = useState<string>(() => clock.nowIso());
  // DISPLAY ONLY, and deliberately separate from `asOf`. `asOf` is the one instant every row,
  // KPI and affordance resolves against and must exist during SSR; `shownAt` is the string React
  // diffs, so it waits for hydration. Rendering `asOf` directly produced a text mismatch
  // (React #418) whenever SSR and hydration straddled a minute boundary. Register G-067.
  const shownAt = useMountedInstant();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(true);
  // A failed live read must be VISIBLE: a governance table silently falling back to seed
  // records is a fail-quiet — the reader cannot tell authored data from the system of record.
  const [liveReadFailed, setLiveReadFailed] = useState(false);

  useEffect(() => {
    setIsMock(getFhirMockMode());
  }, []);

  useEffect(() => {
    if (getFhirMockMode()) {
      setRecords(CONSENT_RECORDS);
      return;
    }
    (async () => {
      try {
        const bundle: unknown = await getFhirClient().search('Consent', { _count: '50' });
        const live = consentsFromBundle(bundle);
        if (live.length > 0) setRecords(live);
      } catch {
        // Keep the seed records so the table is never empty, but SAY SO — never swallow.
        setLiveReadFailed(true);
      }
    })();
  }, []);

  if (!canView(adminRole, 'consent-governance')) {
    return (
      <AppLayout
        pageTitle="Consent & Governance"
        breadcrumbs={[
          { label: 'Admin Console', href: '/admin-console/home' },
          { label: 'Consent & Governance' },
        ]}
      >
        <AccessDenied section="Consent & Governance" role={ADMIN_ROLE_LABELS[adminRole]} />
      </AppLayout>
    );
  }

  // THE one derivation: rows and tile counts from a single traversal at a single instant.
  const view = loadConsentView(asOf, records);
  const filtered = view.records.filter((r) => {
    const needle = search.toLowerCase();
    const matchSearch =
      !search ||
      r.patientDisplay.toLowerCase().includes(needle) ||
      r.grantedTo.toLowerCase().includes(needle) ||
      r.id.toLowerCase().includes(needle);
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'records', label: 'Consent Records' },
    { key: 'rules', label: 'Data Sovereignty' },
    { key: 'dua', label: 'Partner DUAs' },
  ];

  return (
    <AppLayout
      pageTitle="Consent & Governance"
      breadcrumbs={[
        { label: 'Admin Console', href: '/admin-console/home' },
        { label: 'Consent & Governance' },
      ]}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">Consent &amp; Governance</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            Consent records, purpose-of-use, and data-use agreements
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
          {canFull(adminRole, 'consent-governance') && (
            <button className="text-xs px-3 py-1.5 bg-carbon-blue text-white font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5">
              <Icon name="PlusIcon" size={14} />
              New Consent
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      {liveReadFailed && (
        <p
          role="alert"
          className="text-xs mb-3 px-3 py-2 bg-[#fff1f1] text-[#a2191f] border border-[#ffb3b8]"
        >
          Live FHIR Consent read failed — showing seeded records, not the system of record.
        </p>
      )}
      {/* The instant every status on this screen is derived against — a governance surface
          must state its as-of, otherwise "ACTIVE" is an undated claim. */}
      <p className="text-xs text-carbon-gray-50 mb-2">
        Status derived from consent period dates as of{' '}
        <span className="font-mono">{formatInstantUtc(shownAt)}</span>
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Records', value: view.records.length, color: 'border-l-carbon-gray-20' },
          { label: 'Active', value: view.counts.ACTIVE, color: 'border-l-[#24a148]' },
          { label: 'Expired', value: view.counts.EXPIRED, color: 'border-l-[#8d8d8d]' },
          { label: 'Revoked', value: view.counts.REVOKED, color: 'border-l-[#da1e28]' },
          { label: 'Pending', value: view.counts.PENDING, color: 'border-l-[#f1c21b]' },
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
          </button>
        ))}
      </div>

      {/* ── Consent Records tab ── */}
      {tab === 'records' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Search patient, partner, or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm border border-carbon-gray-20 px-3 py-1.5 w-64 focus:outline-none focus:border-carbon-blue"
            />
            <div className="flex gap-1">
              {(['ALL', 'ACTIVE', 'REVOKED', 'EXPIRED', 'PENDING'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-xs px-3 py-1.5 font-medium transition-colors ${statusFilter === s ? 'bg-carbon-blue text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-carbon-gray-20">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                  <th className="px-4 py-2 text-left font-semibold">Patient</th>
                  <th className="px-4 py-2 text-left font-semibold">MRN</th>
                  <th className="px-4 py-2 text-left font-semibold">Type</th>
                  <th className="px-4 py-2 text-left font-semibold">Granted To</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Expires</th>
                  <th className="px-4 py-2 text-left font-semibold">FHIR Ref</th>
                  {canFull(adminRole, 'consent-governance') && (
                    <th className="px-4 py-2 text-left font-semibold">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-gray-20">
                {filtered.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr
                      className="hover:bg-carbon-gray-10 cursor-pointer"
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    >
                      <td className="px-4 py-2.5 font-medium text-carbon-gray-100">
                        {r.patientDisplay}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                        {r.mrnMasked}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{r.type}</td>
                      <td className="px-4 py-2.5 text-xs text-carbon-gray-100">{r.grantedTo}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 ${STATUS_PILL[r.status]}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                        {displayDate(r.expiresDate)}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-carbon-blue">
                        {displayRef(r.fhirRef)}
                      </td>
                      {canFull(adminRole, 'consent-governance') && (
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1">
                            <button className="text-xs px-2 py-0.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10">
                              Edit
                            </button>
                            {r.status === 'ACTIVE' && (
                              <button className="text-xs px-2 py-0.5 bg-[#fff1f1] text-[#a2191f] border border-[#ffb3b8] hover:bg-[#ffd7d9]">
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {expanded === r.id && (
                      <tr className="bg-[#f0f4ff]">
                        <td
                          colSpan={canFull(adminRole, 'consent-governance') ? 8 : 7}
                          className="px-6 py-4"
                        >
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <span className="text-carbon-gray-50 font-semibold uppercase tracking-wide">
                                Scope
                              </span>
                              <p className="mt-0.5 text-carbon-gray-100">{r.scope}</p>
                            </div>
                            <div>
                              <span className="text-carbon-gray-50 font-semibold uppercase tracking-wide">
                                Method
                              </span>
                              <p className="mt-0.5 text-carbon-gray-100">{r.method}</p>
                            </div>
                            <div>
                              <span className="text-carbon-gray-50 font-semibold uppercase tracking-wide">
                                Granted
                              </span>
                              <p className="mt-0.5 text-carbon-gray-100">
                                {displayDate(r.grantedDate)}
                              </p>
                            </div>
                            <div>
                              <span className="text-carbon-gray-50 font-semibold uppercase tracking-wide">
                                Purpose
                              </span>
                              <p className="mt-0.5 text-carbon-gray-100">
                                Treatment / Care Coordination
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-carbon-gray-50">
                      No records match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-carbon-gray-20 text-xs text-carbon-gray-50">
              {isMock ? 'Mock consent data' : `Live FHIR — ${records.length} Consent resources`} ·
              Click a row to expand details
            </div>
          </div>
        </>
      )}

      {/* ── Data Sovereignty Rules tab ── */}
      {tab === 'rules' && (
        <div className="bg-white border border-carbon-gray-20">
          <div
            className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between cursor-pointer"
            onClick={() => setRulesOpen(!rulesOpen)}
          >
            <h3 className="text-sm font-semibold text-carbon-gray-100">
              Active Data Sovereignty Rules
            </h3>
            <Icon
              name={rulesOpen ? 'ChevronDownIcon' : 'ChevronRightIcon'}
              size={16}
              className="text-carbon-gray-50"
            />
          </div>
          {rulesOpen && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                  <th className="px-4 py-2 text-left font-semibold">Rule</th>
                  <th className="px-4 py-2 text-left font-semibold">Description</th>
                  <th className="px-4 py-2 text-left font-semibold">Scope</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Last Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-gray-20">
                {SOVEREIGNTY_RULES.map((r) => (
                  <tr key={r.rule} className="hover:bg-carbon-gray-10">
                    <td className="px-4 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                      {r.rule}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-carbon-gray-70 max-w-xs">
                      {r.description}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-carbon-gray-50">{r.scope}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold px-2 py-0.5 bg-[#defbe6] text-[#0e6027]">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                      {r.lastAudit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Partner DUA tab ── */}
      {tab === 'dua' && (
        <div className="bg-white border border-carbon-gray-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 text-carbon-gray-70 text-xs uppercase">
                <th className="px-4 py-2 text-left font-semibold">Partner</th>
                <th className="px-4 py-2 text-left font-semibold">Agreement Type</th>
                <th className="px-4 py-2 text-left font-semibold">Signed</th>
                <th className="px-4 py-2 text-left font-semibold">Expires</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {DUA_MOCK.map((d) => {
                const status = duaStatus(d, asOf);
                return (
                  <tr key={d.partner} className="hover:bg-carbon-gray-10">
                    <td className="px-4 py-2.5 font-medium text-carbon-gray-100">{d.partner}</td>
                    <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{d.agreementType}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                      {d.signedDate}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-carbon-gray-50">
                      {d.expiresDate}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 ${DUA_PILL[status]}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
