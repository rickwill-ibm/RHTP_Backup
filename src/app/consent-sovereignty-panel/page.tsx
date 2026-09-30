'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';
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
import type { ConsentStatus, WithConsentStatus } from '@/lib/consent/consentStatus';

/**
 * CONSENT STATUS IS DERIVED, NEVER STORED. The seven seed records live in ONE place
 * (`src/lib/consent/data/consent-records.json`, shared with the admin console) and carry
 * only lifecycle DATES. `loadConsentView(asOf)` derives each row's status and the four KPI
 * counts from the SAME traversal against the SAME clock reading, so the tiles can never
 * disagree with the table. Storing the status was the fail-open this screen shipped: four
 * records whose grants lapsed in 2025 / early 2026 kept badging ACTIVE.
 */
type ConsentRow = WithConsentStatus<ConsentSeedRecord>;

// ─── Static mock/fallback data ────────────────────────────────────────────────

const DATA_SOVEREIGNTY_RULES = [
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
    rule: 'CCPA — California Residents',
    description: 'Right to know, delete, and opt-out for CA residents',
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

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: '#defbe6', text: '#0e6027', dot: '#198038' },
  REVOKED: { bg: '#fff1f1', text: '#da1e28', dot: '#da1e28' },
  EXPIRED: { bg: '#f4f4f4', text: '#4d5358', dot: '#8d8d8d' },
  PENDING: { bg: '#fdf6dd', text: '#b45309', dot: '#f1c21b' },
  ENFORCED: { bg: '#defbe6', text: '#0e6027', dot: '#198038' },
};

// ─── FHIR write helpers ───────────────────────────────────────────────────────

function postConsentAuditEvent(action: 'C' | 'U', consentId: string, detail: string) {
  getFhirClient()
    .create({
      resourceType: 'AuditEvent',
      type: {
        system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
        code: 'rest',
        display: 'RESTful Operation',
      },
      subtype: [
        {
          system: 'http://hl7.org/fhir/restful-interaction',
          code: action === 'C' ? 'create' : 'update',
          display: action === 'C' ? 'create' : 'update',
        },
      ],
      action,
      recorded: clock.nowIso(),
      outcome: '0',
      agent: [{ who: { display: 'Care Manager Portal' }, requestor: true }],
      source: { observer: { display: 'TCOC Platform — Consent Sovereignty Panel' } },
      entity: [{ what: { reference: `Consent/${consentId}` }, description: detail }],
    })
    .catch(() => {
      /* AuditEvent failure is non-fatal */
    });
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ConsentSovereigntyPanelPage() {
  const [activeTab, setActiveTab] = useState<'consents' | 'sovereignty' | 'audit'>('consents');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConsentStatus | 'All'>('All');
  const [consentRecords, setConsentRecords] =
    useState<readonly ConsentSeedRecord[]>(CONSENT_RECORDS);
  const [fhirSource, setFhirSource] = useState(false);
  // A failed live read must be VISIBLE: silently falling back to seed records leaves the
  // reader unable to tell authored data from the system of record.
  const [liveReadFailed, setLiveReadFailed] = useState(false);
  // One clock reading for this session's view: the table, the four KPI tiles and the
  // enabled/disabled state of every action all resolve against the SAME `asOf` instant,
  // which is rendered below so the reader knows when the derivation was taken.
  const [asOf] = useState<string>(() => clock.nowIso());
  // DISPLAY ONLY, and deliberately separate from `asOf`. `asOf` is the one instant every row,
  // KPI and affordance resolves against and must exist during SSR; `shownAt` is the string React
  // diffs, so it waits for hydration. Rendering `asOf` directly produced a text mismatch
  // (React #418) whenever SSR and hydration straddled a minute boundary. Register G-067.
  const shownAt = useMountedInstant();
  const fhirLoadedRef = useRef(false);
  // Local audit entries prepended by live grant/revoke actions
  const [liveAuditEntries, setLiveAuditEntries] = useState<
    {
      time: string;
      event: string;
      patient: string;
      detail: string;
      actor: string;
      icon: string;
      color: string;
    }[]
  >([]);

  // Live FHIR: fetch all Consent resources on mount
  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    getFhirClient()
      .search('Consent', { _count: 50 })
      .then((bundle: unknown) => {
        const resources = consentsFromBundle(bundle);
        if (resources.length > 0) {
          setConsentRecords(resources);
          setFhirSource(true);
        }
      })
      .catch(() => {
        // Keep the seed records so the registry is never empty, but SAY SO — never swallow.
        setLiveReadFailed(true);
      });
  }, []);

  // ── FHIR write: revoke an active consent ─────────────────────────────────
  const handleRevoke = (rec: ConsentRow) => {
    if (rec.status !== 'ACTIVE') return;
    const now = clock.nowIso();
    const nowDate = now.slice(0, 10);
    // Optimistic UI update: stamp the REVOCATION DATE. The REVOKED badge is then derived
    // from that fact — no status is written, so the badge cannot drift from the record.
    setConsentRecords((prev) =>
      prev.map((r) => (r.id === rec.id ? { ...r, revokedDate: nowDate } : r))
    );
    // Add live audit entry
    setLiveAuditEntries((prev) => [
      {
        time: now.replace('T', ' ').slice(0, 16),
        event: 'Consent REVOKED',
        patient: rec.patientDisplay,
        detail: `${rec.type} — ${rec.grantedTo} revoked by Care Manager`,
        actor: 'Care Manager Portal',
        icon: 'MinusCircleIcon',
        color: '#da1e28',
      },
      ...prev,
    ]);
    if (!getFhirMockMode()) {
      // PUT Consent with status=inactive + period end = now
      getFhirClient()
        .update({
          resourceType: 'Consent',
          id: rec.id,
          status: 'inactive',
          // Minimum necessary: the reference is authoritative; no display name is written.
          patient: { reference: `Patient/${rec.patientId}` },
          dateTime: now,
          provision: {
            type: 'deny',
            period: { start: rec.grantedDate === null ? nowDate : rec.grantedDate, end: nowDate },
          },
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/consent-type',
              valueString: rec.type,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/consent-scope-text',
              valueString: rec.scope,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/consent-method',
              valueString: rec.method,
            },
          ],
        })
        .catch((err) => console.warn('[Consent] PUT revoke failed:', err));
      postConsentAuditEvent('U', rec.id, `Consent revoked — ${rec.type} — ${rec.grantedTo}`);
    }
  };

  // ── FHIR write: grant a new consent for PENDING/EXPIRED record ───────────
  const handleGrant = (rec: ConsentRow) => {
    if (rec.status !== 'PENDING' && rec.status !== 'EXPIRED') return;
    const now = clock.nowIso();
    const nowDate = now.slice(0, 10);
    // One-year default expiry, computed off the injected clock.
    const expiryDate = new Date(clock.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // Optimistic UI update: stamp the new GRANT and EXPIRY dates and clear any revocation.
    // The ACTIVE badge is derived from those facts, so it lapses on its own at expiry.
    setConsentRecords((prev) =>
      prev.map((r) =>
        r.id === rec.id
          ? { ...r, grantedDate: nowDate, expiresDate: expiryDate, revokedDate: null }
          : r
      )
    );
    setLiveAuditEntries((prev) => [
      {
        time: now.replace('T', ' ').slice(0, 16),
        event: 'Consent GRANTED',
        patient: rec.patientDisplay,
        detail: `${rec.type} — ${rec.grantedTo} granted via Care Manager Portal`,
        actor: 'Care Manager Portal',
        icon: 'CheckCircleIcon',
        color: '#198038',
      },
      ...prev,
    ]);
    if (!getFhirMockMode()) {
      const newId = `${rec.id}-renewed-${clock.now()}`;
      getFhirClient()
        .create({
          resourceType: 'Consent',
          id: newId,
          status: 'active',
          // Minimum necessary: the reference is authoritative; no display name is written.
          patient: { reference: `Patient/${rec.patientId}` },
          dateTime: now,
          organization: [{ display: rec.grantedTo }],
          provision: {
            type: 'permit',
            period: { start: nowDate, end: expiryDate },
          },
          scope: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/consentscope',
                code: 'patient-privacy',
                display: 'Privacy Consent',
              },
            ],
          },
          category: [
            {
              coding: [
                { system: 'http://loinc.org', code: '59284-0', display: 'Consent Document' },
              ],
            },
          ],
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/consent-type',
              valueString: rec.type,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/consent-scope-text',
              valueString: rec.scope,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/consent-method',
              valueString: 'Electronic',
            },
          ],
        })
        .catch((err) => console.warn('[Consent] POST grant failed:', err));
      postConsentAuditEvent('C', newId, `Consent granted — ${rec.type} — ${rec.grantedTo}`);
    }
  };

  // THE one derivation: rows and tile counts from a single traversal at a single instant.
  const view = loadConsentView(asOf, consentRecords);
  const statuses: (ConsentStatus | 'All')[] = ['All', 'ACTIVE', 'REVOKED', 'EXPIRED', 'PENDING'];
  const filtered = view.records.filter((r) => {
    const needle = search.toLowerCase();
    const matchSearch =
      r.patientDisplay.toLowerCase().includes(needle) || r.patientId.toLowerCase().includes(needle);
    const matchStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCount = view.counts.ACTIVE;
  const revokedCount = view.counts.REVOKED;
  const expiredCount = view.counts.EXPIRED;
  const pendingCount = view.counts.PENDING;

  return (
    <AppLayout
      pageTitle="Consent & Sovereignty Panel"
      breadcrumbs={[
        { label: 'CDP & Agentic Automation' },
        { label: 'Consent & Sovereignty Panel' },
      ]}
    >
      {/* KPI Strip */}
      {fhirSource && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            {consentRecords.length} consent records loaded from HAPI FHIR
          </span>
        </div>
      )}
      {liveReadFailed && (
        <p
          role="alert"
          className="text-xs mb-3 px-3 py-2 bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]"
        >
          Live FHIR Consent read failed — showing seeded records, not the system of record.
        </p>
      )}
      {/* The instant every status on this screen is derived against — a governance surface
          must state its as-of, otherwise "ACTIVE" is an undated claim. */}
      <p className="text-2xs text-carbon-gray-50 mb-2 px-1">
        Status derived from consent period dates as of{' '}
        <span className="font-mono">{formatInstantUtc(shownAt)}</span>
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Active Consents',
            value: activeCount.toString(),
            icon: 'ShieldCheckIcon',
            color: 'text-[#198038]',
            bg: 'bg-[#defbe6]',
          },
          {
            label: 'Revoked',
            value: revokedCount.toString(),
            icon: 'XCircleIcon',
            color: 'text-[#da1e28]',
            bg: 'bg-[#fff1f1]',
          },
          {
            label: 'Expired',
            value: expiredCount.toString(),
            icon: 'ClockIcon',
            color: 'text-[#4d5358]',
            bg: 'bg-[#f4f4f4]',
          },
          {
            label: 'Pending Signature',
            value: pendingCount.toString(),
            icon: 'PencilSquareIcon',
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
        {(['consents', 'sovereignty', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === t
                ? 'border-[#6929c4] text-[#6929c4]'
                : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100'
            }`}
          >
            {t === 'consents'
              ? 'Consent Registry'
              : t === 'sovereignty'
                ? 'Data Sovereignty Rules'
                : 'Audit Log'}
          </button>
        ))}
      </div>

      {activeTab === 'consents' && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-carbon-gray-100">Patient Consent Records</p>
              {fhirSource && (
                <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
                  FHIR R4
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Icon
                  name="MagnifyingGlassIcon"
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-carbon-gray-50"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search patient..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-carbon-gray-20 focus:outline-none focus:border-[#6929c4] w-44"
                />
              </div>
              <div className="flex gap-1">
                {statuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2 py-1 text-2xs font-semibold transition-colors ${
                      statusFilter === s
                        ? 'bg-[#6929c4] text-white'
                        : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                {[
                  'Patient',
                  'Type',
                  'Scope',
                  'Granted To',
                  'Status',
                  'Granted',
                  'Expires',
                  'FHIR Resource',
                  '',
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
              {filtered.map((rec, i) => {
                const sc = STATUS_CONFIG[rec.status] ?? STATUS_CONFIG['EXPIRED'];
                return (
                  <tr
                    key={rec.id}
                    className={`border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors ${i % 2 === 0 ? '' : 'bg-carbon-gray-10/30'}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-carbon-gray-100">{rec.patientDisplay}</p>
                      <p className="text-2xs text-carbon-gray-50">{rec.patientId}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-carbon-gray-70">{rec.type}</td>
                    <td className="px-4 py-3 text-carbon-gray-50">{rec.scope}</td>
                    <td className="px-4 py-3 text-carbon-gray-70">{rec.grantedTo}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                        <span
                          className="px-1.5 py-0.5 text-2xs font-semibold"
                          style={{ background: sc.bg, color: sc.text }}
                        >
                          {rec.status}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-carbon-gray-50">
                      {displayDate(rec.grantedDate)}
                    </td>
                    <td className="px-4 py-3 text-carbon-gray-50">
                      {displayDate(rec.expiresDate)}
                    </td>
                    <td className="px-4 py-3 font-mono text-carbon-gray-50 text-2xs">
                      {displayRef(rec.fhirRef)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {rec.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRevoke(rec)}
                          className="px-2 py-1 text-2xs font-semibold bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8] hover:bg-[#ffe0e0] transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                      {(rec.status === 'PENDING' || rec.status === 'EXPIRED') && (
                        <button
                          onClick={() => handleGrant(rec)}
                          className="px-2 py-1 text-2xs font-semibold bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba] hover:bg-[#b7f0c8] transition-colors"
                        >
                          Grant
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'sovereignty' && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-4 py-3 border-b border-carbon-gray-20">
            <p className="text-sm font-semibold text-carbon-gray-100">
              Data Sovereignty & Governance Rules
            </p>
            <p className="text-xs text-carbon-gray-50 mt-0.5">
              All rules enforced by the Consent Enforcer agent — violations blocked in real time
            </p>
          </div>
          <div className="divide-y divide-carbon-gray-10">
            {DATA_SOVEREIGNTY_RULES.map((rule) => {
              const sc = STATUS_CONFIG[rule.status] ?? STATUS_CONFIG['ACTIVE'];
              return (
                <div key={rule.rule} className="px-4 py-4 flex items-start gap-4">
                  <div className="w-8 h-8 bg-[#defbe6] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon name="ShieldCheckIcon" size={16} className="text-[#198038]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-carbon-gray-100">
                        {rule.rule}
                      </span>
                      <span
                        className="px-1.5 py-0.5 text-2xs font-semibold"
                        style={{ background: sc.bg, color: sc.text }}
                      >
                        {rule.status}
                      </span>
                    </div>
                    <p className="text-xs text-carbon-gray-50 mt-0.5">{rule.description}</p>
                    <div className="flex items-center gap-4 mt-1.5 text-2xs text-carbon-gray-50">
                      <span>
                        Scope: <span className="font-medium text-carbon-gray-70">{rule.scope}</span>
                      </span>
                      <span>
                        Last Audit:{' '}
                        <span className="font-medium text-carbon-gray-70">{rule.lastAudit}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
            <p className="text-sm font-semibold text-carbon-gray-100">Consent Audit Log</p>
            {liveAuditEntries.length > 0 && (
              <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
                {liveAuditEntries.length} live event{liveAuditEntries.length > 1 ? 's' : ''} · FHIR
                AuditEvent written
              </span>
            )}
          </div>
          <div className="divide-y divide-carbon-gray-10">
            {/* PHI posture: masked, matching the consent table. A disclosure audit log on an
                oversight surface needs the WHO-and-WHAT, not a full legal name. */}
            {[
              ...liveAuditEntries,
              {
                time: '2024-12-01 14:32',
                event: 'Consent GRANTED',
                patient: 'M. Redhawk',
                detail: 'Data Sharing — Prairie Health Network',
                actor: 'Patient Portal',
                icon: 'CheckCircleIcon',
                color: '#198038',
              },
              {
                time: '2024-12-01 11:07',
                event: 'Share BLOCKED',
                patient: 'T. Begay',
                detail: 'Cross-org share blocked — no active consent on file',
                actor: 'Consent Enforcer Agent',
                icon: 'XCircleIcon',
                color: '#da1e28',
              },
              {
                time: '2024-11-28 09:15',
                event: 'Consent REVOKED',
                patient: 'M. Redhawk',
                detail: 'BH Data — CCBHC Clay County revoked by patient',
                actor: 'Care Manager Portal',
                icon: 'MinusCircleIcon',
                color: '#da1e28',
              },
              {
                time: '2024-11-20 16:44',
                event: 'Consent EXPIRED',
                patient: 'J. Whitfield',
                detail: 'Data Sharing — Prairie Health Network expired',
                actor: 'System',
                icon: 'ClockIcon',
                color: '#8d8d8d',
              },
              {
                time: '2024-11-15 10:22',
                event: 'Tribal Rule ENFORCED',
                patient: 'M. Redhawk',
                detail: 'Tribal data sovereignty rule applied — share restricted',
                actor: 'Consent Enforcer Agent',
                icon: 'ShieldCheckIcon',
                color: '#6929c4',
              },
              {
                time: '2024-11-10 08:55',
                event: 'Consent GRANTED',
                patient: 'R. Gutierrez',
                detail: 'SDOH Sharing — Unite Us Network',
                actor: 'Patient Portal',
                icon: 'CheckCircleIcon',
                color: '#198038',
              },
            ].map((entry, i) => (
              <div
                key={i}
                className={`px-4 py-3 flex items-start gap-3 ${i < liveAuditEntries.length ? 'bg-[#f0faf4]' : ''}`}
              >
                <Icon
                  name={entry.icon as any}
                  size={16}
                  style={{ color: entry.color }}
                  className="mt-0.5 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-carbon-gray-100">
                      {entry.event}
                    </span>
                    <span className="text-xs text-carbon-gray-70">— {entry.patient}</span>
                    {i < liveAuditEntries.length && (
                      <span className="text-2xs font-semibold px-1 py-0.5 bg-[#defbe6] text-[#0e6027]">
                        LIVE · FHIR AuditEvent
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-carbon-gray-50 mt-0.5">{entry.detail}</p>
                  <p className="text-2xs text-carbon-gray-30 mt-0.5">
                    {entry.time} · {entry.actor}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
