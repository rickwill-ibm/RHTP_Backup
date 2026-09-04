'use client';

/**
 * Patient Access — CMS-0057-F Patient Access API.
 * Member view: Coverage, Conditions, and Prior Authorization status.
 * In demo/mock mode (NEXT_PUBLIC_USE_MOCK_DATA=true) seeded data is used
 * directly — no FHIR server required.
 * Responds to activePatientId changes from the global patient switcher.
 */
import { useCallback, useEffect, useState } from 'react';
import { fhirGet, getJson } from '@/lib/client/bff';
import {
  toCoverageVM,
  toConditionVM,
  toPaStatusVM,
  type CoverageVM,
  type ConditionVM,
  type PaStatusVM,
} from '@/lib/fhir/viewModels';
import { flag } from '@/lib/flags/flags';
import AppLayout from '@/components/AppLayout';
import { useDemoStore } from '@/uhg/store/demoStore';
import { resolveToCanonicalFhirPatientId } from '@/lib/patientRegistry';

// ── Per-patient mock data (demo mode) ─────────────────────────────────────────

type PatientMock = { coverage: CoverageVM[]; conditions: ConditionVM[]; pa: PaStatusVM[] };

const PATIENT_MOCK: Record<string, PatientMock> = {
  MARIA_SD_001: {
    coverage: [
      {
        id: 'cov-1',
        type: 'Medicaid Managed Care',
        payer: 'South Dakota Medicaid',
        status: 'active',
        period: '01/01/2024 – 12/31/2026',
      },
      {
        id: 'cov-2',
        type: 'Supplemental Dental',
        payer: 'DentaQuest',
        status: 'active',
        period: '01/01/2025 – 12/31/2025',
      },
    ],
    conditions: [
      {
        id: 'cond-1',
        display: 'Type 2 Diabetes Mellitus',
        clinicalStatus: 'active',
        recordedDate: '03/12/2021',
      },
      {
        id: 'cond-2',
        display: 'Chronic Low Back Pain',
        clinicalStatus: 'active',
        recordedDate: '11/05/2022',
      },
      {
        id: 'cond-3',
        display: 'Hypertension',
        clinicalStatus: 'active',
        recordedDate: '07/18/2020',
      },
      {
        id: 'cond-4',
        display: 'Food Insecurity (SDOH Z59.4)',
        clinicalStatus: 'active',
        recordedDate: '01/09/2024',
      },
      {
        id: 'cond-5',
        display: 'Caregiver Burden (Z63.9)',
        clinicalStatus: 'active',
        recordedDate: '05/22/2024',
      },
    ],
    pa: [
      {
        id: 'dev-cr-approved',
        service: 'MRI Lumbar Spine w/o Contrast (CPT 72148)',
        status: 'approved',
        denialReasons: [],
        authNumber: 'AUTH-2026-08-MRI',
        requestedDate: '08/12/2026',
      },
      {
        id: 'pa-denied-001',
        service: 'Outpatient Bariatric Consultation (CPT 43644)',
        status: 'denied',
        denialReasons: [
          'BMI documentation not on file',
          'Behavioral health pre-clearance required',
        ],
        authNumber: 'AUTH-2026-06-BAR',
        requestedDate: '06/03/2026',
      },
    ],
  },
  'patient-001': {
    coverage: [
      {
        id: 'cov-1',
        type: 'Medicaid Managed Care',
        payer: 'UnitedHealthcare Community Plan',
        status: 'active',
        period: '01/01/2024 – 12/31/2026',
      },
    ],
    conditions: [
      {
        id: 'cond-1',
        display: 'Congestive Heart Failure',
        clinicalStatus: 'active',
        recordedDate: '06/14/2020',
      },
      {
        id: 'cond-2',
        display: 'Chronic Kidney Disease',
        clinicalStatus: 'active',
        recordedDate: '02/28/2022',
      },
      {
        id: 'cond-3',
        display: 'Type 2 Diabetes Mellitus',
        clinicalStatus: 'active',
        recordedDate: '11/03/2019',
      },
    ],
    pa: [
      {
        id: 'pa-mgo-001',
        service: 'Echocardiogram (CPT 93306)',
        status: 'approved',
        denialReasons: [],
        authNumber: 'AUTH-2026-04-ECHO',
        requestedDate: '04/10/2026',
      },
    ],
  },
  'patient-002': {
    coverage: [
      {
        id: 'cov-1',
        type: 'Medicaid Fee-for-Service',
        payer: 'Texas Medicaid (TMHP)',
        status: 'active',
        period: '07/01/2025 – 06/30/2027',
      },
    ],
    conditions: [
      {
        id: 'cond-1',
        display: 'Major Depressive Disorder',
        clinicalStatus: 'active',
        recordedDate: '09/05/2021',
      },
      {
        id: 'cond-2',
        display: 'Opioid Use Disorder',
        clinicalStatus: 'active',
        recordedDate: '03/17/2023',
      },
      {
        id: 'cond-3',
        display: 'Hypertension',
        clinicalStatus: 'active',
        recordedDate: '01/12/2020',
      },
    ],
    pa: [
      {
        id: 'pa-dh-001',
        service: 'Inpatient Psychiatric Admission (CPT 99221)',
        status: 'pended' as PaStatusVM['status'],
        denialReasons: [],
        authNumber: 'AUTH-2026-07-PSY',
        requestedDate: '07/22/2026',
      },
    ],
  },
};

// Fallback for any patient not in the map
const DEFAULT_MOCK: PatientMock = {
  coverage: [
    { id: 'cov-1', type: 'Medicaid Managed Care', payer: 'State Medicaid', status: 'active' },
  ],
  conditions: [],
  pa: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const isMockMode = () =>
  typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true' : false;

interface Bundle {
  entry?: { resource?: Record<string, unknown> }[];
}

interface SessionStatus {
  authenticated: boolean;
  patient?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PatientAccessPage(): React.ReactElement {
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [sessionPatient, setSessionPatient] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageVM[]>([]);
  const [conditions, setConditions] = useState<ConditionVM[]>([]);
  const [paStatus, setPaStatus] = useState<PaStatusVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMock = useCallback((patientId: string) => {
    const mock = PATIENT_MOCK[patientId] ?? DEFAULT_MOCK;
    setCoverage(mock.coverage);
    setConditions(mock.conditions);
    setPaStatus(mock.pa);
  }, []);

  const loadLive = useCallback(async (patientId: string) => {
    setLoading(true);
    setError(null);
    const canonicalPatientId = resolveToCanonicalFhirPatientId(patientId) ?? patientId;
    const cov = await fhirGet<Bundle>(`Coverage?beneficiary=Patient/${canonicalPatientId}`);
    const cond = await fhirGet<Bundle>(`Condition?subject=Patient/${canonicalPatientId}`);
    const pa = await fhirGet<Bundle>(`ClaimResponse?patient=Patient/${canonicalPatientId}`);
    if (cov.data) setCoverage((cov.data.entry ?? []).map((e) => toCoverageVM(e.resource ?? {})));
    if (cond.data)
      setConditions((cond.data.entry ?? []).map((e) => toConditionVM(e.resource ?? {})));
    if (pa.data) setPaStatus((pa.data.entry ?? []).map((e) => toPaStatusVM(e.resource ?? {})));
    const firstErr = cov.error ?? cond.error ?? pa.error;
    if (firstErr) setError(firstErr.issue?.[0]?.diagnostics ?? 'Failed to load health records.');
    setLoading(false);
  }, []);

  // Re-run whenever the patient switcher changes
  useEffect(() => {
    if (isMockMode()) {
      setAuthed(true);
      setSessionPatient(resolveToCanonicalFhirPatientId(activePatientId) ?? activePatientId);
      loadMock(activePatientId);
      return;
    }
    getJson<SessionStatus>('/api/auth/session').then((r) => {
      const ok = !!r.data?.authenticated;
      setAuthed(ok);
      setSessionPatient(r.data?.patient ?? null);
      if (ok) void loadLive(r.data?.patient ?? activePatientId);
    });
  }, [activePatientId, loadMock, loadLive]);

  if (!flag('patientAccess')) {
    return (
      <AppLayout>
        <main className="p-6 text-sm text-slate-600">Patient Access is not enabled.</main>
      </AppLayout>
    );
  }

  if (authed === false) {
    return (
      <AppLayout>
        <main className="mx-auto max-w-[1100px] px-6 py-8">
          <h1 className="text-lg font-bold text-gray-900">Patient Access</h1>
          <p className="mt-2 text-sm text-gray-500">
            Sign in to view your coverage, conditions, and prior authorization status.
          </p>
          <a
            href="/api/auth/login"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1669c1] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f52a0] transition-colors"
          >
            Sign in
          </a>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 pt-4 pb-0">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Patient Access</h1>
            <p className="text-xs text-gray-500">
              Coverage · Conditions · Prior Authorization status · CMS-0057-F compliant
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
              Selected: <span className="text-gray-800">{activePatientId}</span>
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${sessionPatient === activePatientId ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
            >
              Session: <span className="text-gray-800">{sessionPatient ?? '—'}</span>
            </span>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
              CMS-0057-F
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1100px] px-6 py-8 pb-24 space-y-5">
        {sessionPatient && sessionPatient !== activePatientId && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-bold">Patient context mismatch</span> — selected patient is{' '}
            <span className="font-mono font-bold">{activePatientId}</span> but current session is{' '}
            <span className="font-mono font-bold">{sessionPatient}</span>. This page may show
            session-scoped data instead of the selected patient.
          </div>
        )}

        {/* Consent context */}
        <ConsentCard />

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-bold">Unable to load records</span> — {error}
          </div>
        )}

        {loading && <p className="text-sm text-gray-400">Loading health records…</p>}

        {/* Coverage */}
        <Section title="Coverage" count={coverage.length}>
          {coverage.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-gray-100">
              {coverage.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3 gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.type || 'Coverage'}</p>
                    <p className="text-xs text-gray-500">
                      {c.payer}
                      {c.period ? ` · ${c.period}` : ''}
                    </p>
                  </div>
                  <StatusBadge label={c.status} color={c.status === 'active' ? 'green' : 'gray'} />
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Conditions */}
        <Section title="Conditions" count={conditions.length}>
          {conditions.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-gray-100">
              {conditions.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3 gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.display}</p>
                    {c.recordedDate && (
                      <p className="text-xs text-gray-400">Recorded {c.recordedDate}</p>
                    )}
                  </div>
                  <StatusBadge
                    label={c.clinicalStatus}
                    color={c.clinicalStatus === 'active' ? 'blue' : 'gray'}
                  />
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Prior Authorization */}
        <Section title="Prior Authorization Status" count={paStatus.length}>
          {paStatus.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-gray-100">
              {paStatus.map((p) => (
                <div key={p.id} className="py-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {p.service || 'Service'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.authNumber ? `Auth # ${p.authNumber}` : ''}
                        {p.requestedDate ? ` · Requested ${p.requestedDate}` : ''}
                      </p>
                    </div>
                    <StatusBadge
                      label={p.status}
                      color={
                        p.status === 'approved' ? 'green' : p.status === 'denied' ? 'red' : 'amber'
                      }
                    />
                  </div>
                  {p.denialReasons.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {p.denialReasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-red-700">
                          <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold">
                            ✗
                          </span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </main>
    </AppLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConsentCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Data Access &amp; Consent
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-4 text-sm">
        {[
          { label: 'Consent Status', value: 'Active' },
          { label: 'Purpose of Use', value: 'Patient Request' },
          { label: 'Scope', value: 'patient/*.read' },
          { label: 'Regulation', value: '42 CFR Part 2' },
        ].map((row) => (
          <div key={row.label}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {row.label}
            </p>
            <p className="mt-0.5 font-semibold text-gray-800">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</h2>
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500">
          {count}
        </span>
      </div>
      <div className="px-4 pb-1">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="py-4 text-sm text-gray-400">No records.</p>;
}

const BADGE_COLORS: Record<string, string> = {
  green: 'bg-green-50 text-green-700 border-green-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  gray: 'bg-gray-100 text-gray-500 border-gray-200',
};

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize flex-shrink-0 ${BADGE_COLORS[color] ?? BADGE_COLORS.gray}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
