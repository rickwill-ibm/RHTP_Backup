'use client';
/**
 * CMS-0057-F API Explorer
 *
 * Interactive Postman-style explorer for every BFF endpoint that proves
 * CMS-0057-F compliance. Six tabs — one per mandate provision plus
 * infrastructure cross-cuts and a Postman Suite configurator.
 * All requests go through the RHTP BFF layer (never directly to FHIR/APIM).
 * Pre-fills from activePatientId.
 */
import { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAppContext } from '@/lib/appContext';
import { resolveToCanonicalFhirPatientId } from '@/lib/patientRegistry';
import PostmanSuiteTab from '@/components/PostmanSuiteTab';

// ── Types ─────────────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST';

interface RequestResult {
  status: number | null;
  latencyMs: number | null;
  body: string | null;
  error: string | null;
}

interface SessionStatus {
  authenticated: boolean;
  patient: string | null;
}

interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string; // may contain {patientId} placeholder
  label: string;
  mandate: string;
  annotation: string;
  buildBody?: (patientId: string) => unknown;
  buildPath?: (patientId: string) => string;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'patient-access', label: 'Patient Access', mandate: '§1' },
  { id: 'provider-access', label: 'Provider Access', mandate: '§2' },
  { id: 'payer-to-payer', label: 'Payer-to-Payer', mandate: '§3' },
  { id: 'prior-auth', label: 'Prior Authorization', mandate: '§4' },
  { id: 'infrastructure', label: 'Infrastructure', mandate: '—' },
  { id: 'postman-suite', label: 'Postman Suite', mandate: '—' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// ── Per-patient PA scenario lookup (mirrors devStubs PATIENT_PROFILES) ─────────

const PATIENT_PA_SCENARIOS: Record<
  string,
  { cptCode: string; procedureName: string; priorPayer: string }
> = {
  MARIA_SD_001: {
    cptCode: '72148',
    procedureName: 'MRI Lumbar Spine w/o Contrast',
    priorPayer: 'Aetna Medicaid SD',
  },
  'PAT-0042': {
    cptCode: '75561',
    procedureName: 'Cardiac MRI w/ and w/o contrast',
    priorPayer: 'UnitedHealthcare Community Plan MO',
  },
  'PAT-0087': {
    cptCode: '93306',
    procedureName: 'Echocardiogram (complete transthoracic)',
    priorPayer: 'Molina Healthcare of South Dakota',
  },
  'PAT-0103': {
    cptCode: '99243',
    procedureName: 'Nephrology office consultation',
    priorPayer: 'Anthem BCBS South Dakota',
  },
  'PAT-0156': {
    cptCode: '99244',
    procedureName: 'Pulmonology office consultation',
    priorPayer: 'Meridian Health Plan SD',
  },
};

function paScenarioFor(patientId: string) {
  return PATIENT_PA_SCENARIOS[patientId] ?? PATIENT_PA_SCENARIOS['MARIA_SD_001'];
}

// ── Per-patient network adequacy context ──────────────────────────────────────
// Derives the state abbreviation and a human-readable location label for the
// active patient so the infrastructure tab is always contextually correct.

const PATIENT_NETWORK_CONTEXT: Record<
  string,
  { state: string; location: string; specialty: string; specialtyLabel: string }
> = {
  MARIA_SD_001: {
    state: 'SD',
    location: 'Martin, Bennett County SD (CAH)',
    specialty: 'Behavioral Health',
    specialtyLabel: 'Behavioral Health — postpartum rural SD gap',
  },
  'PAT-0042': {
    state: 'SD',
    location: 'Ozark Regional FQHC Service Area, SD',
    specialty: 'Pulmonology',
    specialtyLabel: 'Pulmonology — COPD specialist access SD',
  },
  'PAT-0087': {
    state: 'SD',
    location: 'Winner, Tripp County SD',
    specialty: 'Cardiology',
    specialtyLabel: 'Cardiology — CHF specialist access SD',
  },
  'PAT-0103': {
    state: 'SD',
    location: 'Rapid City, Pennington County SD',
    specialty: 'Nephrology',
    specialtyLabel: 'Nephrology — CKD specialist access SD',
  },
  'PAT-0156': {
    state: 'SD',
    location: 'Sioux Falls, Minnehaha County SD',
    specialty: 'Pulmonology',
    specialtyLabel: 'Pulmonology — severe asthma specialist access SD',
  },
};

function networkContextFor(patientId: string) {
  return PATIENT_NETWORK_CONTEXT[patientId] ?? PATIENT_NETWORK_CONTEXT['MARIA_SD_001'];
}

// ── Endpoint definitions ──────────────────────────────────────────────────────

function buildEndpoints(patientId: string): Record<Exclude<TabId, 'postman-suite'>, Endpoint[]> {
  const pa = paScenarioFor(patientId);
  const fhirPatientId = resolveToCanonicalFhirPatientId(patientId) ?? patientId;
  return {
    'patient-access': [
      {
        id: 'pa-session',
        method: 'GET',
        path: '/api/auth/session',
        label: 'Session — who is authenticated',
        mandate: 'CMS-0057-F §1 — Patient Access API',
        annotation:
          'Confirms a valid dev-mock session. In production this validates the SMART bearer token from WSO2 IS.',
      },
      {
        id: 'pa-coverage',
        method: 'GET',
        path: '/api/fhir/Coverage',
        buildPath: () => `/api/fhir/Coverage?beneficiary=Patient/${fhirPatientId}`,
        label: 'Coverage — member plan & period',
        mandate: 'CMS-0057-F §1 — Patient Access API',
        annotation:
          'Returns FHIR R4 Coverage resources for the selected member. Proves coverage data is accessible through the Patient Access API.',
      },
      {
        id: 'pa-conditions',
        method: 'GET',
        path: '/api/fhir/Condition',
        buildPath: () => `/api/fhir/Condition?subject=Patient/${fhirPatientId}`,
        label: 'Conditions — clinical problem list',
        mandate: 'CMS-0057-F §1 — Patient Access API',
        annotation:
          'FHIR R4 Condition bundle. Clinical data accessible to the member — one of the core data classes CMS-0057-F requires.',
      },
      {
        id: 'pa-claimresponse',
        method: 'GET',
        path: '/api/fhir/ClaimResponse',
        buildPath: () => `/api/fhir/ClaimResponse?patient=Patient/${fhirPatientId}`,
        label: 'Prior Auth status + denial reasons',
        mandate: 'CMS-0057-F §1 — Patient Access API',
        annotation:
          'ClaimResponse includes disposition and denial reasons — the CMS-0057-F §1 requirement that members can see why a PA was denied.',
      },
    ],
    'provider-access': [
      {
        id: 'prov-consent',
        method: 'GET',
        path: '/api/consent/provider-access',
        buildPath: (pid) => `/api/consent/provider-access?memberId=${pid}`,
        label: 'Consent check — member opt-out status',
        mandate: 'CMS-0057-F §2 — Provider Access API',
        annotation:
          'Before accessing member data, the provider portal checks consent. Returns optedOut: true/false. Access is blocked and audited if opted out.',
      },
      {
        id: 'prov-match',
        method: 'POST',
        path: '/api/match',
        label: '$member-match — cross-payer identity resolution',
        mandate: 'CMS-0057-F §2 — Provider Access API (Da Vinci PDex)',
        annotation:
          'FHIR $member-match operation. Resolves member identity across payer systems using demographic + coverage parameters. Returns matched patient ID.',
        buildBody: (pid) => ({
          resourceType: 'Parameters',
          parameter: [{ name: 'MemberPatient', resource: { resourceType: 'Patient', id: pid } }],
        }),
      },
      {
        id: 'prov-conditions',
        method: 'GET',
        path: '/api/fhir/Condition',
        buildPath: () => `/api/fhir/Condition?subject=Patient/${fhirPatientId}`,
        label: 'Conditions — under treatment relationship',
        mandate: 'CMS-0057-F §2 — Provider Access API',
        annotation:
          'Same FHIR read as Patient Access but with provider authorization basis. The authz guard enforces treatment-relationship scope and logs elevated audit when applicable.',
      },
    ],
    'payer-to-payer': [
      {
        id: 'p2p-start',
        method: 'POST',
        path: '/api/bulk/start',
        label: `Start bulk export — 5yr history from ${pa.priorPayer}`,
        mandate: 'CMS-0057-F §3 — Payer-to-Payer API',
        annotation: `Initiates an async FHIR Bulk Data export from the prior payer (${pa.priorPayer}). Passes member identity via $member-match Parameters. Returns a jobId. In mock mode returns dev-p2p-job-001 immediately.`,
        buildBody: (pid) => ({
          priorPayer: pa.priorPayer,
          patientId: pid,
          memberMatch: {
            resourceType: 'Parameters',
            parameter: [{ name: 'MemberPatient', resource: { resourceType: 'Patient', id: pid } }],
          },
        }),
      },
      {
        id: 'p2p-status',
        method: 'GET',
        path: '/api/bulk/status',
        buildPath: (pid) =>
          `/api/bulk/status?jobId=dev-p2p-job-001&patientId=${encodeURIComponent(pid)}`,
        label: 'Poll export status — 5yr resource inventory',
        mandate: 'CMS-0057-F §3 — Payer-to-Payer API',
        annotation:
          'Polls the bulk export job. Returns state, coveragePeriod, full resourceCounts (EOB, Coverage, Claim, ClaimResponse, Condition, Medication, Observation, Procedure, Encounter), PA denial history transferred from prior payer, and import impact.',
      },
    ],
    'prior-auth': [
      {
        id: 'pa-crd',
        method: 'POST',
        path: '/api/cds',
        label: `CRD — Coverage Requirements Discovery (CPT ${pa.cptCode})`,
        mandate: 'CMS-0057-F §4 — Prior Authorization API (Da Vinci CRD)',
        annotation: `CDS Hooks order-sign invocation for ${pa.procedureName} (CPT ${pa.cptCode}). Returns patient-specific coverage requirement cards. In mock mode returns seeded cards for the active patient's primary PA scenario.`,
        buildBody: (pid) => ({
          hookId: 'order-sign',
          hookRequest: {
            hook: 'order-sign',
            context: {
              userId: `Practitioner/PRAC_PCP`,
              patientId: pid,
              draftOrders: {
                resourceType: 'Bundle',
                entry: [
                  {
                    resource: {
                      resourceType: 'ServiceRequest',
                      code: {
                        coding: [
                          {
                            system: 'http://www.ama-assn.org/go/cpt',
                            code: pa.cptCode,
                            display: pa.procedureName,
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
      },
      {
        id: 'pa-dtr-package',
        method: 'GET',
        path: '/api/dtr/package',
        buildPath: (_pid) => `/api/dtr/package?cptCode=${pa.cptCode}`,
        label: `DTR — $questionnaire-package (CPT ${pa.cptCode})`,
        mandate:
          'CMS-0057-F §4 — Prior Authorization API (Da Vinci DTR STU3 §questionnaire-package)',
        annotation: `Retrieves the payer's Questionnaire resource for ${pa.procedureName} (CPT ${pa.cptCode}). Step 1 of the Da Vinci DTR flow: fetch questionnaire → prefill from EHR → submit QuestionnaireResponse. Required by DTR STU3 IG before evaluation.`,
      },
      {
        id: 'pa-dtr',
        method: 'POST',
        path: '/api/dtr/evaluate',
        label: `DTR — evaluate documentation requirements (${pa.procedureName})`,
        mandate: 'CMS-0057-F §4 — Prior Authorization API (Da Vinci DTR)',
        annotation: `Step 2: evaluates medical necessity policy for ${pa.procedureName} (CPT ${pa.cptCode}) against the patient's record. Returns per-criterion met/gap status with FHIR evidence references. Consumes the Questionnaire retrieved in the $questionnaire-package step.`,
        buildBody: (pid) => ({
          patientId: pid,
          cptCode: pa.cptCode,
          procedureName: pa.procedureName,
        }),
      },
      {
        id: 'pa-clearance',
        method: 'POST',
        path: '/api/financial-clearance',
        label: 'Financial Clearance — full Golden Thread run',
        mandate:
          'CMS-0057-F §4 — Prior Authorization API (eligibility + medical necessity + PA automation)',
        annotation:
          'Runs the full eligibility → medical necessity → PA determination → cost estimation thread. Returns propensity score, work queue routing, and persisted Evidence Record ID. Gold-card exemption is applied when provider approval rate ≥ 90% — a voluntary payer program, not a §4 mandate requirement.',
        buildBody: (pid) => ({ patientId: pid, orderCode: pa.cptCode, providerNpi: '1730154783' }),
      },
      {
        id: 'pa-submit',
        method: 'POST',
        path: '/api/pas/submit',
        label: `PAS — PA submission without approver (human gate demo)`,
        mandate: 'CMS-0057-F §4 — Prior Authorization API (Da Vinci PAS)',
        annotation:
          'Human gate: without approvedBy the API returns 202 "requires human approval" and does NOT submit. Demonstrates CMS blueprint §4D — AI prepares, human approves.',
        buildBody: (pid) => ({
          patientId: pid,
          claimBundle: {
            resourceType: 'Bundle',
            type: 'collection',
            entry: [
              {
                resource: {
                  resourceType: 'Claim',
                  id: `claim-${pid}`,
                  status: 'active',
                  use: 'preauthorization',
                  patient: { reference: `Patient/${pid}` },
                  insurance: [
                    { sequence: 1, focal: true, coverage: { reference: 'Coverage/cov-1' } },
                  ],
                  item: [
                    {
                      sequence: 1,
                      productOrService: {
                        coding: [
                          {
                            system: 'http://www.ama-assn.org/go/cpt',
                            code: pa.cptCode,
                            display: pa.procedureName,
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
          approvedBy: '',
        }),
      },
      {
        id: 'pa-submit-approved',
        method: 'POST',
        path: '/api/pas/submit',
        label: 'PAS — submission WITH human approver (approved)',
        mandate: 'CMS-0057-F §4 — Prior Authorization API (Da Vinci PAS)',
        annotation:
          'Same payload as above but WITH the approval signal set. The approver is NOT read from this field — the server binds the reviewer of record from the authenticated session (Practitioner/dev to Dr. Alex Rivera, UM Reviewer) and returns a patient-specific approved ClaimResponse. Proves the human-gate plus dynamic approver association.',
        buildBody: (pid) => ({
          patientId: pid,
          claimBundle: {
            resourceType: 'Bundle',
            type: 'collection',
            entry: [
              {
                resource: {
                  resourceType: 'Claim',
                  id: `claim-${pid}`,
                  status: 'active',
                  use: 'preauthorization',
                  patient: { reference: `Patient/${pid}` },
                  insurance: [
                    { sequence: 1, focal: true, coverage: { reference: 'Coverage/cov-1' } },
                  ],
                  item: [
                    {
                      sequence: 1,
                      productOrService: {
                        coding: [
                          {
                            system: 'http://www.ama-assn.org/go/cpt',
                            code: pa.cptCode,
                            display: pa.procedureName,
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
          approvedBy: 'session-approval-signal',
        }),
      },
      {
        id: 'pa-workqueue',
        method: 'GET',
        path: '/api/work-queue',
        label: 'Reviewer work queue — SLA timers',
        mandate: 'CMS-0057-F §422.122(b)(1) — 72h expedited / 168h (7 calendar days) standard SLA',
        annotation:
          'Returns work items grouped by disposition with CMS SLA due-dates, breach flags, and isExpedited label. Mock mode returns 5 seeded items: Maria (72148/expedited), Dorothy (75561/standard + 94010/expedited-breached), James (93306/standard), Robert (99243/standard). Lisa Thompson (PAT-0156 / CPT 99244) is not in queue — her scenario auto-cleared at eligibility.',
      },
      {
        id: 'pa-evidence',
        method: 'GET',
        path: '/api/evidence',
        buildPath: (pid) => `/api/evidence/ev-${pid}-${paScenarioFor(pid).cptCode}-1730154783`,
        label: 'Evidence Record — Da Vinci CDex audit spine',
        mandate: 'CMS-0057-F §4 — Coverage Determination Record (CDex)',
        annotation: `Fetches a persisted Evidence Record for the active patient (CPT ${pa.cptCode} — ${pa.procedureName}). This is the Da Vinci CDex Coverage Determination Record — the auditable chain linking every PA decision to its source data.`,
      },
    ],
    infrastructure: (() => {
      const nc = networkContextFor(patientId);
      return [
        {
          id: 'infra-adequacy-state',
          method: 'GET' as const,
          path: '/api/network-adequacy',
          buildPath: (_pid: string) => `/api/network-adequacy?state=${nc.state}`,
          label: `Network Adequacy — ${nc.state} (${nc.location})`,
          mandate: 'MA §422.116 · Medicaid §438.68 · 2024 CMS Access Rule',
          annotation: `Returns adequacy metrics and prioritised gaps for ${nc.state} — the home state of the active patient (${nc.location}). Reservation counties (Oglala Lakota/Pine Ridge, Todd/Rosebud) surface as critical gaps for rural SD patients.`,
        },
        {
          id: 'infra-adequacy-specialty',
          method: 'GET' as const,
          path: '/api/network-adequacy',
          buildPath: (_pid: string) =>
            `/api/network-adequacy?state=${nc.state}&specialty=${encodeURIComponent(nc.specialty)}`,
          label: `Network Adequacy — ${nc.specialtyLabel}`,
          mandate: 'MA §422.116 · Medicaid §438.68',
          annotation: `Same ${nc.state} network dataset filtered to ${nc.specialty} — the specialist type most relevant to the active patient's primary condition. Demonstrates the engine's specialty-slice capability with a single extra query param.`,
        },
        {
          id: 'infra-cds-patient-view',
          method: 'POST' as const,
          path: '/api/cds-hooks/patient-view',
          label: 'CDS Hooks — patient-view (HL7 standard)',
          mandate: 'HL7 CDS Hooks 2.0 — interoperability standard',
          annotation:
            "Raw CDS Hooks patient-view invocation. Shows the HL7-standard hook interface that EMR systems call. Returns care-gap cards from the active patient's registry data.",
          buildBody: (pid: string) => ({
            hook: 'patient-view',
            context: { userId: 'Practitioner/PRAC_PCP', patientId: pid },
            prefetch: {},
          }),
        },
        {
          id: 'infra-cds-order-sign',
          method: 'POST' as const,
          path: '/api/cds-hooks/order-sign',
          label: 'CDS Hooks — order-sign (ordering workflow)',
          mandate: 'HL7 CDS Hooks 2.0 — ordering workflow',
          annotation: `Fires when a clinician signs an order in the EMR. Returns DDI and coverage cards for the active patient (${pa.procedureName}). No separate PA portal needed.`,
          buildBody: (pid: string) => ({
            hook: 'order-sign',
            context: {
              userId: 'Practitioner/PRAC_PCP',
              patientId: pid,
              draftOrders: {
                resourceType: 'Bundle',
                entry: [
                  {
                    resource: {
                      resourceType: 'ServiceRequest',
                      code: {
                        coding: [
                          {
                            system: 'http://www.ama-assn.org/go/cpt',
                            code: pa.cptCode,
                            display: pa.procedureName,
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            prefetch: {},
          }),
        },
      ];
    })(),
  };
}

// ── Helper: run a request ─────────────────────────────────────────────────────

async function runRequest(ep: Endpoint, patientId: string): Promise<RequestResult> {
  const path = ep.buildPath ? ep.buildPath(patientId) : ep.path;
  const body = ep.buildBody ? ep.buildBody(patientId) : undefined;
  const start = performance.now();
  try {
    const res = await fetch(path, {
      method: ep.method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const latencyMs = Math.round(performance.now() - start);
    const text = await res.text();
    let formatted = text;
    try {
      formatted = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* leave as-is */
    }
    return { status: res.status, latencyMs, body: formatted, error: null };
  } catch (err) {
    return { status: null, latencyMs: null, body: null, error: String(err) };
  }
}

// ── EndpointCard ──────────────────────────────────────────────────────────────

function EndpointCard({ ep, patientId }: { ep: Endpoint; patientId: string }) {
  const [result, setResult] = useState<RequestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setExpanded(true);
    const r = await runRequest(ep, patientId);
    setResult(r);
    setRunning(false);
  }, [ep, patientId]);

  const previewBody = ep.buildBody ? JSON.stringify(ep.buildBody(patientId), null, 2) : null;
  const previewPath = ep.buildPath ? ep.buildPath(patientId) : ep.path;

  const statusColor =
    result?.status == null
      ? ''
      : result.status < 300
        ? 'text-green-700'
        : result.status < 400
          ? 'text-amber-600'
          : 'text-red-600';

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          className={`mt-0.5 flex-shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ep.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}
        >
          {ep.method}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{ep.label}</p>
          <p className="font-mono text-[10px] text-gray-400 truncate">{previewPath}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {result && (
            <span className={`text-xs font-bold ${statusColor}`}>
              {result.status ?? 'ERR'} {result.latencyMs != null ? `· ${result.latencyMs}ms` : ''}
            </span>
          )}
          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1669c1] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f52a0] disabled:opacity-50 transition-colors"
          >
            {running ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              '▶'
            )}
            {running ? 'Running…' : 'Try It'}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-gray-400 hover:text-gray-700 transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.04l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mandate + annotation */}
      <div className="border-t border-gray-50 bg-gray-50 px-4 py-2 flex items-start gap-2">
        <span className="mt-0.5 flex-shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-600">
          {ep.mandate.split('—')[0].trim()}
        </span>
        <p className="text-[11px] text-gray-500 leading-relaxed">{ep.annotation}</p>
      </div>

      {/* Expanded: request + response */}
      {expanded && (
        <div className="border-t border-gray-100">
          <div className={`grid gap-0 ${previewBody ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
            {/* Request body */}
            {previewBody && (
              <div className="border-r border-gray-100">
                <p className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Request Body
                </p>
                <pre className="overflow-x-auto p-3 text-[10px] leading-relaxed text-gray-700 max-h-52">
                  {previewBody}
                </pre>
              </div>
            )}
            {/* Response */}
            <div>
              <p className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Response{' '}
                {result?.status != null && (
                  <span className={`ml-1 font-bold ${statusColor}`}>{result.status}</span>
                )}
              </p>
              {running && (
                <p className="p-3 text-xs text-gray-400 animate-pulse">Waiting for response…</p>
              )}
              {!running && result?.error && (
                <p className="p-3 text-xs text-red-600">{result.error}</p>
              )}
              {!running && result?.body && (
                <pre className="overflow-x-auto p-3 text-[10px] leading-relaxed text-gray-700 max-h-52">
                  {result.body}
                </pre>
              )}
              {!running && !result && (
                <p className="p-3 text-xs text-gray-400">Press ▶ Try It to run this request.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApiExplorerPage(): React.ReactElement {
  const { activePatientId } = useAppContext();
  const [activeTab, setActiveTab] = useState<TabId>('patient-access');
  const isPostmanTab = activeTab === 'postman-suite';
  const [sessionPatient, setSessionPatient] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function syncSession(): Promise<void> {
      const patient = resolveToCanonicalFhirPatientId(activePatientId) ?? activePatientId;
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient }),
      }).catch(() => undefined);

      const res = await fetch('/api/auth/session', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }).catch(() => null);
      if (!res) return;
      const body = (await res.json().catch(() => null)) as SessionStatus | null;
      if (!cancelled) setSessionPatient(body?.patient ?? null);
    }

    void syncSession();
    return () => {
      cancelled = true;
    };
  }, [activePatientId]);

  // Rebuild endpoint definitions whenever the active patient changes —
  // labels, CPT codes, paths, and request bodies are all patient-specific.
  const ENDPOINTS = buildEndpoints(activePatientId);
  const endpoints = isPostmanTab
    ? []
    : (ENDPOINTS[activeTab as Exclude<TabId, 'postman-suite'>] ?? []);
  const tab = TABS.find((t) => t.id === activeTab)!;

  return (
    <AppLayout>
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 pt-4 pb-0">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">CMS-0057-F API Explorer</h1>
            <p className="text-xs text-gray-500">
              Live BFF endpoint testing · All requests proxied server-side · No FHIR server required
              in demo mode
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

        {sessionPatient && sessionPatient !== activePatientId && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Explorer patient mismatch: selected patient is{' '}
            <span className="font-mono font-bold">{activePatientId}</span> but current session is{' '}
            <span className="font-mono font-bold">{sessionPatient}</span>. Responses may reflect the
            session patient until context is resynced.
          </div>
        )}

        {!sessionPatient && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Session patient context is not available yet. Responses may not reflect the selected
            patient.
          </div>
        )}

        {/* Tab strip */}
        <nav className="flex overflow-x-auto gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 border-b-[3px] px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'border-[#1669c1] text-[#1669c1]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.mandate !== '—' && (
                <span
                  className={`flex h-[18px] items-center justify-center rounded-full px-1.5 text-[9px] font-bold ${activeTab === t.id ? 'bg-[#1669c1] text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  {t.mandate}
                </span>
              )}
              {t.id === 'postman-suite' ? '⚙ Postman Suite' : t.label}
              {t.id !== 'postman-suite' && (
                <span
                  className={`ml-0.5 text-[10px] ${activeTab === t.id ? 'text-[#1669c1]' : 'text-gray-400'}`}
                >
                  (
                  {buildEndpoints(activePatientId)[t.id as Exclude<TabId, 'postman-suite'>]
                    ?.length ?? 0}
                  )
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-[1100px] px-6 py-6 pb-24">
        {/* Postman Suite tab — full-width config/run UI */}
        {isPostmanTab ? (
          <PostmanSuiteTab />
        ) : (
          <>
            {/* Tab subtitle */}
            <div className="mb-5 flex items-center gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">{tab.label}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {tab.id === 'patient-access' &&
                    'Member-facing FHIR reads — coverage, conditions, and PA status with denial reasons.'}
                  {tab.id === 'provider-access' &&
                    'Provider-facing operations — consent check, $member-match identity resolution, and clinical data access under treatment relationship.'}
                  {tab.id === 'payer-to-payer' &&
                    'Async FHIR Bulk Data export from a prior payer — start job, poll status, import 5-year claims history.'}
                  {tab.id === 'prior-auth' &&
                    'Full Da Vinci CRD → DTR → PAS pipeline — coverage requirements, policy evaluation, human-gated submission, reviewer queue, and Evidence Record audit spine.'}
                  {tab.id === 'infrastructure' &&
                    'Cross-cutting compliance infrastructure — network adequacy analytics and raw HL7 CDS Hooks endpoints.'}
                </p>
              </div>
            </div>

            {/* Endpoint cards — key includes patientId so state resets on patient switch */}
            <div className="space-y-3">
              {endpoints.map((ep) => (
                <EndpointCard
                  key={`${ep.id}-${activePatientId}`}
                  ep={ep}
                  patientId={activePatientId}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </AppLayout>
  );
}
