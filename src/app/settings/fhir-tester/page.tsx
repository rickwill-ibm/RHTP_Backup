'use client';
import React, { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';

// Author: Richard Hennessy — Austin, Texas 78726
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? '';

const CERNER_FHIR_BASE = 'https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d';

// The local HAPI FHIR server base URL (from env, defaults to localhost).
const LOCAL_FHIR_BASE = process.env.NEXT_PUBLIC_FHIR_BASE_URL ?? 'http://localhost:8080/fhir';

// In demo/mock mode there is no FHIR server — return a realistic stub
// instead of letting the fetch fail with "Failed to fetch".
const isMockMode = () => process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

function mockFhirResponse(
  method: string,
  path: string,
  body?: object
): { statusCode: number; body: string; latencyMs: number } {
  const latencyMs = Math.floor(Math.random() * 60) + 20; // 20-80 ms simulated
  // POST / PUT → echo back a minimal created/updated resource
  if (method === 'POST' || method === 'PUT') {
    const resourceType = path.split('/')[0] ?? 'Resource';
    const id = `mock-${resourceType.toLowerCase()}-${Date.now()}`;
    const echo = {
      ...(body as object),
      resourceType,
      id,
      meta: { versionId: '1', lastUpdated: new Date().toISOString() },
    };
    return {
      statusCode: method === 'POST' ? 201 : 200,
      body: JSON.stringify(echo, null, 2),
      latencyMs,
    };
  }
  // GET Patient list
  if (path.startsWith('Patient?')) {
    const bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: FHIR_PATIENTS_FALLBACK.length,
      entry: FHIR_PATIENTS_FALLBACK.map((p) => ({
        resource: {
          resourceType: 'Patient',
          id: p.id,
          name: [{ family: p.name.split(' ').pop(), given: p.name.split(' ').slice(0, -1) }],
        },
      })),
    };
    return { statusCode: 200, body: JSON.stringify(bundle, null, 2), latencyMs };
  }
  // GET Encounter list
  if (path.startsWith('Encounter?')) {
    const bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [
        { resource: { resourceType: 'Encounter', id: 'enc-mock-001' } },
        { resource: { resourceType: 'Encounter', id: 'enc-mock-002' } },
      ],
    };
    return { statusCode: 200, body: JSON.stringify(bundle, null, 2), latencyMs };
  }
  // GET single Patient
  if (path.startsWith('Patient/')) {
    return { statusCode: 200, body: JSON.stringify(MOCK_PATIENT_RESPONSE, null, 2), latencyMs };
  }
  // Fallback — empty bundle
  const fallback = { resourceType: 'Bundle', type: 'searchset', total: 0, entry: [] };
  return { statusCode: 200, body: JSON.stringify(fallback, null, 2), latencyMs };
}

// ─── Real FHIR fetch helper ───────────────────────────────────────────────────

async function realFhirRequest(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: object
): Promise<{ statusCode: number; body: string; latencyMs: number }> {
  if (isMockMode()) return mockFhirResponse(method, path, body);
  const url = `${LOCAL_FHIR_BASE}/${path.replace(/^\//, '')}`;
  const start = Date.now();
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/fhir+json',
      'Content-Type': 'application/fhir+json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const latencyMs = Date.now() - start;
  const text = await res.text();
  return { statusCode: res.status, body: text, latencyMs };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type TestStatus = 'idle' | 'running' | 'success' | 'error';

interface TestResult {
  status: TestStatus;
  statusCode?: number;
  latencyMs?: number;
  requestPayload?: string;
  responseBody?: string;
  errorMessage?: string;
  timestamp?: string;
}

type ActiveTab = 'patient' | 'order' | 'cds' | 'gaps' | 'put' | 'beforeafter';

// ─── Mock Cerner sandbox responses ────────────────────────────────────────────

const MOCK_PATIENT_RESPONSE = {
  resourceType: 'Patient',
  id: 'patient-001',
  meta: {
    versionId: '1',
    lastUpdated: '2026-04-16T10:00:00Z',
    profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
  },
  identifier: [
    {
      use: 'usual',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.0',
      value: 'MRN-00123456',
    },
  ],
  name: [{ use: 'official', family: 'Hernandez', given: ['Maria', 'Elena'] }],
  gender: 'female',
  birthDate: '1958-03-22',
  address: [
    {
      use: 'home',
      line: ['4521 Maple Grove Blvd'],
      city: 'Kansas City',
      state: 'MO',
      postalCode: '64108',
    },
  ],
  telecom: [{ system: 'phone', value: '(816) 555-0192', use: 'home' }],
};

const MOCK_ORDER_RESPONSE = {
  resourceType: 'ServiceRequest',
  id: 'sr-20260416-001',
  meta: { versionId: '1', lastUpdated: '2026-04-16T22:19:45Z' },
  status: 'active',
  intent: 'order',
  category: [
    {
      coding: [
        { system: 'http://snomed.info/sct', code: '306206005', display: 'Referral to service' },
      ],
    },
  ],
  code: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '103696004',
        display: 'Patient referral to cardiologist',
      },
    ],
    text: 'Cardiology Referral',
  },
  subject: { reference: 'Patient/patient-001', display: 'Maria Elena Hernandez' },
  encounter: { reference: 'Encounter/enc-20260416-001' },
  requester: { reference: 'Practitioner/pract-002', display: 'Dr. James Whitfield' },
  authoredOn: '2026-04-16T22:19:45Z',
  priority: 'routine',
  note: [{ text: 'Cardiology consult for uncontrolled hypertension and new onset chest pain.' }],
};

const MOCK_CDS_RESPONSE = {
  cards: [
    {
      summary: 'HCC Suspect: Type 2 Diabetes with CKD Stage 3 — not coded this year',
      indicator: 'info',
      source: { label: 'TCOC CDS Engine', url: `${SITE_URL}/api/cds-hooks/patient-view` },
      detail: 'RAF delta if captured: +0.42 (~$3,200 revenue). Submission deadline: Dec 31, 2026.',
      suggestions: [
        {
          label: 'Add HCC coding to encounter',
          uuid: 'sug-001a',
          actions: [
            {
              type: 'create',
              description: 'Create ServiceRequest for HCC documentation — E11.65 + N18.3',
            },
          ],
        },
      ],
    },
    {
      summary: '6 open HEDIS care gaps — 2 overdue by >90 days',
      indicator: 'info',
      source: { label: 'TCOC Care Gap Engine', url: `${SITE_URL}/api/cds-hooks/patient-view` },
      detail:
        'Overdue: Diabetic Eye Exam (due 2026-01-15), Nephropathy Monitoring (due 2026-02-01).',
      links: [{ label: 'View Care Gap Detail', url: '/patient-detail', type: 'absolute' }],
    },
  ],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: TestStatus }) {
  if (status === 'idle') return <span className="text-xs text-carbon-gray-50">—</span>;
  if (status === 'running')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0043ce]">
        <span className="w-2 h-2 rounded-full bg-[#0043ce] animate-pulse" />
        Running
      </span>
    );
  if (status === 'success')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#198038]">
        <Icon name="CheckCircleIcon" size={14} className="text-[#198038]" />
        Pass
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#da1e28]">
      <Icon name="XCircleIcon" size={14} className="text-[#da1e28]" />
      Fail
    </span>
  );
}

function LatencyBadge({ ms }: { ms?: number }) {
  if (!ms) return null;
  const color =
    ms < 300
      ? 'text-[#198038] bg-[#defbe6]'
      : ms < 800
        ? 'text-[#b45309] bg-[#fef3c7]'
        : 'text-[#da1e28] bg-[#fff1f1]';
  return <span className={`text-2xs font-semibold px-1.5 py-0.5 ${color}`}>{ms}ms</span>;
}

function ResponsePanel({ result }: { result: TestResult }) {
  const [showReq, setShowReq] = useState(false);
  if (result.status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-carbon-gray-50 border border-dashed border-carbon-gray-20 bg-carbon-gray-10">
        <Icon name="BeakerIcon" size={28} className="mb-2 opacity-40" />
        <p className="text-xs">Run a test to see the response</p>
      </div>
    );
  }
  if (result.status === 'running') {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-carbon-gray-50 border border-carbon-gray-20 bg-carbon-gray-10">
        <div className="w-6 h-6 border-2 border-[#0043ce] border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs">Sending request to Cerner sandbox…</p>
      </div>
    );
  }
  return (
    <div className="border border-carbon-gray-20 bg-white">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-carbon-gray-20 bg-carbon-gray-10">
        <StatusPill status={result.status} />
        {result.statusCode && (
          <span
            className={`text-xs font-mono font-semibold px-2 py-0.5 ${result.status === 'success' ? 'bg-[#defbe6] text-[#198038]' : 'bg-[#fff1f1] text-[#da1e28]'}`}
          >
            HTTP {result.statusCode}
          </span>
        )}
        <LatencyBadge ms={result.latencyMs} />
        {result.timestamp && (
          <span className="ml-auto text-2xs text-carbon-gray-50">{result.timestamp}</span>
        )}
        {result.requestPayload && (
          <button
            onClick={() => setShowReq(!showReq)}
            className="text-2xs text-carbon-blue hover:underline ml-2"
          >
            {showReq ? 'Hide request' : 'Show request'}
          </button>
        )}
      </div>
      {showReq && result.requestPayload && (
        <div className="px-4 py-3 border-b border-carbon-gray-20 bg-[#f6f2ff]">
          <p className="text-2xs font-semibold text-carbon-gray-50 mb-1.5 uppercase tracking-widest">
            Request Payload
          </p>
          <pre className="text-xs font-mono text-carbon-gray-100 overflow-x-auto whitespace-pre-wrap">
            {result.requestPayload}
          </pre>
        </div>
      )}
      <div className="px-4 py-3">
        <p className="text-2xs font-semibold text-carbon-gray-50 mb-1.5 uppercase tracking-widest">
          {result.status === 'error' ? 'Error' : 'Response Body'}
        </p>
        <pre className="text-xs font-mono text-carbon-gray-100 overflow-x-auto whitespace-pre-wrap max-h-72">
          {result.status === 'error' ? result.errorMessage : result.responseBody}
        </pre>
      </div>
    </div>
  );
}

// ─── Known FHIR patients — loaded live from HAPI server ──────────────────────
// Fallback list used while the fetch is in flight or if the server is down.
const FHIR_PATIENTS_FALLBACK = [
  { id: 'patient-maria-001', name: 'Maria Redhawk' },
  { id: 'patient-dorothy-042', name: 'Dorothy Simmons' },
  { id: 'patient-james-087', name: 'James Wilson' },
  { id: 'patient-robert-103', name: 'Robert Chen' },
  { id: 'patient-lisa-156', name: 'Lisa Thompson' },
  { id: 'patient-alex-kirby', name: 'Alex Kirby' },
];

function useFhirPatients() {
  const [patients, setPatients] = useState(FHIR_PATIENTS_FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await realFhirRequest('GET', 'Patient?_count=100&_elements=id,name');
        const bundle = JSON.parse(res.body);
        const entries: { id: string; name: string }[] = (bundle.entry ?? [])
          .map(
            (e: { resource?: { id?: string; name?: { family?: string; given?: string[] }[] } }) => {
              const r = e.resource;
              if (!r?.id) return null;
              const n = r.name?.[0];
              const display = n ? `${n.given?.join(' ') ?? ''} ${n.family ?? ''}`.trim() : r.id;
              return { id: r.id, name: display };
            }
          )
          .filter(Boolean)
          .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
        if (entries.length > 0) setPatients(entries);
      } catch {
        // server unreachable — keep fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { patients, loading };
}

// ─── Encounters hook — fetches real encounters for the selected patient ────────
function usePatientEncounters(patientId: string) {
  const [encounters, setEncounters] = useState<{ id: string }[]>([]);
  const [encounterId, setEncounterId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    setEncounters([]);
    setEncounterId('');
    realFhirRequest('GET', `Encounter?subject=Patient/${patientId}&_count=50&_elements=id`)
      .then((res) => {
        const bundle = JSON.parse(res.body);
        const ids: { id: string }[] = (bundle.entry ?? [])
          .map((e: { resource?: { id?: string } }) =>
            e.resource?.id ? { id: e.resource.id } : null
          )
          .filter(Boolean);
        setEncounters(ids);
        // Auto-select the first encounter so the field is never blank
        if (ids.length > 0) setEncounterId(ids[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [patientId]);

  return { encounters, encounterId, setEncounterId, loading };
}

// ─── Patient Lookup Tab ────────────────────────────────────────────────────────

function PatientLookupTab() {
  const { patients: fhirPatients, loading: patientsLoading } = useFhirPatients();
  const [patientId, setPatientId] = useState(FHIR_PATIENTS_FALLBACK[0].id);
  const [includeConditions, setIncludeConditions] = useState(true);
  const [includeMeds, setIncludeMeds] = useState(false);
  const [includeObs, setIncludeObs] = useState(false);
  const [result, setResult] = useState<TestResult>({ status: 'idle' });

  const run = useCallback(async () => {
    if (!patientId.trim()) return;
    setResult({ status: 'running' });
    const params = new URLSearchParams();
    if (includeConditions) params.set('_revinclude', 'Condition:patient');
    if (includeMeds) params.set('_revinclude:iterate', 'MedicationRequest:patient');
    if (includeObs) params.set('_revinclude:iterate', 'Observation:patient');
    const path = `Patient/${patientId.trim()}?${params.toString()}`;
    try {
      const res = await realFhirRequest('GET', path);
      const succeeded = res.statusCode >= 200 && res.statusCode < 300;
      // Pretty-print JSON if parseable
      let body = res.body;
      try {
        body = JSON.stringify(JSON.parse(res.body), null, 2);
      } catch {
        /* leave as-is */
      }
      setResult({
        status: succeeded ? 'success' : 'error',
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        requestPayload: `GET ${LOCAL_FHIR_BASE}/${path}\nAccept: application/fhir+json`,
        responseBody: succeeded ? body : undefined,
        errorMessage: succeeded ? undefined : body,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setResult({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }, [patientId, includeConditions, includeMeds, includeObs]);

  const tests = [
    {
      label: 'Patient Read',
      endpoint: `/Patient/${patientId || '{id}'}`,
      method: 'GET',
      description: 'Fetch patient demographics and identifiers',
    },
    {
      label: 'Condition Search',
      endpoint: `/Condition?patient=${patientId || '{id}'}&category=problem-list-item`,
      method: 'GET',
      description: 'Active problem list conditions',
    },
    {
      label: 'Coverage Read',
      endpoint: `/Coverage?patient=${patientId || '{id}'}`,
      method: 'GET',
      description: 'Insurance / payer coverage details',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Config */}
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4 flex items-center gap-2">
          <Icon name="UserIcon" size={16} className="text-carbon-blue" />
          Patient Lookup Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Patient ID (FHIR logical ID)
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              disabled={patientsLoading}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10 disabled:opacity-60"
            >
              {patientsLoading && <option value="">Loading patients…</option>}
              {fhirPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              FHIR Base URL
            </label>
            <input
              type="text"
              value={CERNER_FHIR_BASE}
              readOnly
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-50 bg-carbon-gray-10 cursor-not-allowed"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mb-4">
          <label className="flex items-center gap-2 text-xs text-carbon-gray-70 cursor-pointer">
            <input
              type="checkbox"
              checked={includeConditions}
              onChange={(e) => setIncludeConditions(e.target.checked)}
              className="accent-carbon-blue"
            />
            Include Conditions
          </label>
          <label className="flex items-center gap-2 text-xs text-carbon-gray-70 cursor-pointer">
            <input
              type="checkbox"
              checked={includeMeds}
              onChange={(e) => setIncludeMeds(e.target.checked)}
              className="accent-carbon-blue"
            />
            Include Medications
          </label>
          <label className="flex items-center gap-2 text-xs text-carbon-gray-70 cursor-pointer">
            <input
              type="checkbox"
              checked={includeObs}
              onChange={(e) => setIncludeObs(e.target.checked)}
              className="accent-carbon-blue"
            />
            Include Observations
          </label>
        </div>
        <button
          onClick={run}
          disabled={result.status === 'running'}
          className="flex items-center gap-2 px-4 py-2 bg-carbon-blue text-white text-xs font-semibold hover:bg-[#0043ce] transition-colors disabled:opacity-50"
        >
          <Icon name="PlayIcon" size={14} />
          {result.status === 'running' ? 'Running…' : 'Run Patient Lookup'}
        </button>
      </div>

      {/* Quick test matrix */}
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-widest mb-3">
          Available Endpoints
        </h3>
        <div className="space-y-0">
          {tests.map((t) => (
            <div
              key={t.label}
              className="flex items-center gap-3 py-2.5 border-b border-carbon-gray-10 last:border-0"
            >
              <span className="text-2xs font-semibold bg-[#d0e2ff] text-[#0043ce] px-1.5 py-0.5 w-10 text-center flex-shrink-0">
                {t.method}
              </span>
              <code className="text-xs font-mono text-carbon-gray-100 flex-1 truncate">
                {t.endpoint}
              </code>
              <span className="text-xs text-carbon-gray-50 hidden md:block">{t.description}</span>
            </div>
          ))}
        </div>
      </div>

      <ResponsePanel result={result} />
    </div>
  );
}

// ─── Order Submission Tab ──────────────────────────────────────────────────────

const ORDER_TEMPLATES = [
  {
    id: 'cardiology',
    label: 'Cardiology Referral',
    code: '103696004',
    display: 'Patient referral to cardiologist',
    system: 'http://snomed.info/sct',
    priority: 'routine',
  },
  {
    id: 'nephrology',
    label: 'Nephrology Referral',
    code: '306281000',
    display: 'Patient referral to nephrologist',
    system: 'http://snomed.info/sct',
    priority: 'routine',
  },
  {
    id: 'hcc-doc',
    label: 'HCC Documentation Order',
    code: 'E11.65',
    display: 'T2DM with CKD Stage 3 documentation',
    system: 'http://hl7.org/fhir/sid/icd-10-cm',
    priority: 'urgent',
  },
  {
    id: 'wellness',
    label: 'Annual Wellness Visit',
    code: 'G0439',
    display: 'Annual wellness visit, includes a personalized prevention plan',
    system: 'https://www.cms.gov/Medicare/Coding/MedHCPCSGenInfo',
    priority: 'routine',
  },
];

function OrderSubmissionTab() {
  const { patients: fhirPatients, loading: patientsLoading } = useFhirPatients();
  const [selectedTemplate, setSelectedTemplate] = useState(ORDER_TEMPLATES[0].id);
  const [patientId, setPatientId] = useState(FHIR_PATIENTS_FALLBACK[0].id);
  const {
    encounters,
    encounterId,
    setEncounterId,
    loading: encLoading,
  } = usePatientEncounters(patientId);
  const [note, setNote] = useState(
    'Cardiology consult for uncontrolled hypertension and new onset chest pain.'
  );
  const [result, setResult] = useState<TestResult>({ status: 'idle' });

  const template = ORDER_TEMPLATES.find((t) => t.id === selectedTemplate) || ORDER_TEMPLATES[0];

  const buildPayload = () => ({
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    category: [
      {
        coding: [
          { system: 'http://snomed.info/sct', code: '306206005', display: 'Referral to service' },
        ],
      },
    ],
    code: {
      coding: [{ system: template.system, code: template.code, display: template.display }],
      text: template.label,
    },
    subject: { reference: `Patient/${patientId}` },
    ...(encounterId ? { encounter: { reference: `Encounter/${encounterId}` } } : {}),
    requester: { reference: 'Practitioner/practitioner-rick', display: 'Dr. Rick Whitfield' },
    authoredOn: new Date().toISOString(),
    priority: template.priority,
    note: note ? [{ text: note }] : undefined,
  });

  const run = useCallback(async () => {
    setResult({ status: 'running' });
    const payload = buildPayload();
    try {
      const res = await realFhirRequest('POST', 'ServiceRequest', payload);
      const succeeded = res.statusCode >= 200 && res.statusCode < 300;
      let body = res.body;
      try {
        body = JSON.stringify(JSON.parse(res.body), null, 2);
      } catch {
        /* leave as-is */
      }
      setResult({
        status: succeeded ? 'success' : 'error',
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        requestPayload: `POST ${LOCAL_FHIR_BASE}/ServiceRequest\nContent-Type: application/fhir+json\n\n${JSON.stringify(payload, null, 2)}`,
        responseBody: succeeded ? body : undefined,
        errorMessage: succeeded ? undefined : body,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setResult({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }, [selectedTemplate, patientId, encounterId, note]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4 flex items-center gap-2">
          <Icon name="ClipboardDocumentListIcon" size={16} className="text-carbon-blue" />
          ServiceRequest Submission
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Order Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10"
            >
              {ORDER_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Patient ID
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              disabled={patientsLoading}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10 disabled:opacity-60"
            >
              {patientsLoading && <option value="">Loading patients…</option>}
              {fhirPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Encounter ID
            </label>
            <select
              value={encounterId}
              onChange={(e) => setEncounterId(e.target.value)}
              disabled={encLoading}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10 disabled:opacity-60"
            >
              {encLoading && <option value="">Loading encounters…</option>}
              {!encLoading && encounters.length === 0 && (
                <option value="">No encounters found</option>
              )}
              {encounters.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">Priority</label>
            <input
              type="text"
              value={template.priority}
              readOnly
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-50 bg-carbon-gray-10 cursor-not-allowed"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
            Clinical Note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10 resize-none"
          />
        </div>
        {/* Payload preview */}
        <div className="mb-4 p-3 bg-carbon-gray-10 border-l-2 border-carbon-blue">
          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest mb-1.5">
            Payload Preview
          </p>
          <pre className="text-xs font-mono text-carbon-gray-70 overflow-x-auto whitespace-pre-wrap max-h-36">
            {JSON.stringify(buildPayload(), null, 2)}
          </pre>
        </div>
        <button
          onClick={run}
          disabled={result.status === 'running'}
          className="flex items-center gap-2 px-4 py-2 bg-carbon-blue text-white text-xs font-semibold hover:bg-[#0043ce] transition-colors disabled:opacity-50"
        >
          <Icon name="PaperAirplaneIcon" size={14} />
          {result.status === 'running' ? 'Submitting…' : 'Submit Order to Sandbox'}
        </button>
      </div>

      <ResponsePanel result={result} />
    </div>
  );
}

// ─── CDS Hooks Tab ─────────────────────────────────────────────────────────────

const CDS_HOOK_CONFIGS = [
  {
    id: 'patient-view',
    hookType: 'patient-view',
    label: 'Patient View',
    serviceUrl: `${SITE_URL}/api/cds-hooks/patient-view`,
    description:
      'Fires when provider opens patient chart. Returns risk tier, care gaps, HCC suspects.',
    contextFields: { patientId: 'patient-001', userId: 'Practitioner/pract-002' },
  },
  {
    id: 'encounter-start',
    hookType: 'encounter-start',
    label: 'Encounter Start',
    serviceUrl: `${SITE_URL}/api/cds-hooks/encounter-start`,
    description:
      'Fires at encounter creation. Surfaces HEDIS/STARS/MIPS gaps and recommended orders.',
    contextFields: {
      patientId: 'patient-001',
      encounterId: 'enc-20260416-001',
      userId: 'Practitioner/pract-002',
    },
  },
  {
    id: 'order-sign',
    hookType: 'order-sign',
    label: 'Order Sign',
    serviceUrl: `${SITE_URL}/api/cds-hooks/order-sign`,
    description:
      'Fires before order signing. Validates clinical indication, confirms network tier.',
    contextFields: {
      patientId: 'patient-001',
      encounterId: 'enc-20260416-001',
      userId: 'Practitioner/pract-002',
      draftOrders: { resourceType: 'Bundle', entry: [] },
    },
  },
];

function CdsHooksTab() {
  const { patients: fhirPatients, loading: patientsLoading } = useFhirPatients();
  const [selectedHook, setSelectedHook] = useState(CDS_HOOK_CONFIGS[0].id);
  const [patientId, setPatientId] = useState(FHIR_PATIENTS_FALLBACK[0].id);
  const {
    encounters,
    encounterId,
    setEncounterId,
    loading: encLoading,
  } = usePatientEncounters(patientId);
  const [result, setResult] = useState<TestResult>({ status: 'idle' });

  const hook = CDS_HOOK_CONFIGS.find((h) => h.id === selectedHook) || CDS_HOOK_CONFIGS[0];

  const buildRequest = () => ({
    hookInstance: `test-${Date.now()}`,
    hook: hook.hookType,
    fhirServer: CERNER_FHIR_BASE,
    fhirAuthorization: {
      access_token: 'mock-access-token-xyz',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'patient/*.read patient/ServiceRequest.write launch/patient openid fhirUser',
      subject: 'pract-002',
    },
    context: { patientId, encounterId, userId: 'Practitioner/pract-002' },
    prefetch: {
      patient: { resourceType: 'Patient', id: patientId },
    },
  });

  const run = useCallback(async () => {
    setResult({ status: 'running' });
    const payload = buildRequest();
    try {
      const start = Date.now();
      const res = await fetch(hook.serviceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const latencyMs = Date.now() - start;
      const text = await res.text();
      const succeeded = res.status >= 200 && res.status < 300;
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* leave as-is */
      }
      setResult({
        status: succeeded ? 'success' : 'error',
        statusCode: res.status,
        latencyMs,
        requestPayload: `POST ${hook.serviceUrl}\nContent-Type: application/json\n\n${JSON.stringify(payload, null, 2)}`,
        responseBody: succeeded ? body : undefined,
        errorMessage: succeeded ? undefined : body,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setResult({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }, [selectedHook, patientId, encounterId, hook.serviceUrl]);

  return (
    <div className="space-y-5">
      {/* Hook selector */}
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4 flex items-center gap-2">
          <Icon name="CpuChipIcon" size={16} className="text-carbon-blue" />
          CDS Hook Call Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {CDS_HOOK_CONFIGS.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelectedHook(h.id)}
              className={`text-left p-3 border transition-colors ${selectedHook === h.id ? 'border-carbon-blue bg-[#d0e2ff]/20' : 'border-carbon-gray-20 hover:border-carbon-gray-50 bg-carbon-gray-10'}`}
            >
              <p
                className={`text-xs font-semibold mb-0.5 ${selectedHook === h.id ? 'text-carbon-blue' : 'text-carbon-gray-100'}`}
              >
                {h.label}
              </p>
              <p className="text-2xs text-carbon-gray-50 leading-relaxed">{h.description}</p>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Patient ID
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              disabled={patientsLoading}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10 disabled:opacity-60"
            >
              {patientsLoading && <option value="">Loading patients…</option>}
              {fhirPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Encounter ID
            </label>
            <select
              value={encounterId}
              onChange={(e) => setEncounterId(e.target.value)}
              disabled={encLoading}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10 disabled:opacity-60"
            >
              {encLoading && <option value="">Loading encounters…</option>}
              {!encLoading && encounters.length === 0 && (
                <option value="">No encounters found</option>
              )}
              {encounters.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Service URL */}
        <div className="mb-4 flex items-center gap-2 p-3 bg-carbon-gray-10 border border-carbon-gray-20">
          <Icon name="LinkIcon" size={14} className="text-carbon-gray-50 flex-shrink-0" />
          <code className="text-xs font-mono text-carbon-gray-70 break-all">{hook.serviceUrl}</code>
        </div>
        {/* Request preview */}
        <div className="mb-4 p-3 bg-carbon-gray-10 border-l-2 border-[#6929c4]">
          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest mb-1.5">
            CDS Hooks Request Preview
          </p>
          <pre className="text-xs font-mono text-carbon-gray-70 overflow-x-auto whitespace-pre-wrap max-h-36">
            {JSON.stringify(buildRequest(), null, 2)}
          </pre>
        </div>
        <button
          onClick={run}
          disabled={result.status === 'running'}
          className="flex items-center gap-2 px-4 py-2 bg-[#6929c4] text-white text-xs font-semibold hover:bg-[#491d8b] transition-colors disabled:opacity-50"
        >
          <Icon name="BoltIcon" size={14} />
          {result.status === 'running' ? 'Calling Hook…' : 'Fire CDS Hook'}
        </button>
      </div>

      {/* Cards preview if success */}
      {result.status === 'success' && result.responseBody && (
        <div className="bg-white border border-carbon-gray-20 p-5">
          <h3 className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-widest mb-3">
            Returned CDS Cards
          </h3>
          <div className="space-y-3">
            {MOCK_CDS_RESPONSE.cards.map((card, i) => (
              <div
                key={i}
                className={`p-3 border-l-4 ${card.indicator === 'info' ? 'border-[#0043ce] bg-[#edf5ff]' : 'border-[#f1c21b] bg-[#fef3c7]'}`}
              >
                <p className="text-xs font-semibold text-carbon-gray-100 mb-1">{card.summary}</p>
                <p className="text-xs text-carbon-gray-70">{card.detail}</p>
                <p className="text-2xs text-carbon-gray-50 mt-1">Source: {card.source.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <ResponsePanel result={result} />
    </div>
  );
}

// ─── Force-POST subcomponent ──────────────────────────────────────────────────

const GAP_IDS = [
  { label: 'gap-1 — Spirometry (COPD)', value: 'gap-1' },
  { label: 'gap-2 — Flu Vaccine', value: 'gap-2' },
  { label: 'gap-4 — A1C Recheck', value: 'gap-4' },
  { label: 'jw-1 — A1C Recheck (Diabetes)', value: 'jw-1' },
  { label: 'jw-2 — BNP Lab Panel (CHF)', value: 'jw-2' },
  { label: 'rc-1 — BP Control Check', value: 'rc-1' },
  { label: 'lt-1 — Asthma Action Plan', value: 'lt-1' },
];

function ForcePostGapPanel({
  patientFhirId,
  onObsCreated,
}: {
  patientFhirId: string;
  onObsCreated: (id: string) => void;
}) {
  const [gapId, setGapId] = useState(GAP_IDS[0].value);
  const [hedis, setHedis] = useState<'MET' | 'NOT_MET' | 'PENDING'>('MET');
  const [result, setResult] = useState<TestResult>({ status: 'idle' });

  const run = useCallback(async () => {
    setResult({ status: 'running' });
    const now = new Date().toISOString();
    const payload = {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'survey',
              display: 'Survey',
            },
          ],
        },
      ],
      code: {
        coding: [{ system: 'http://loinc.org', code: '83036', display: gapId }],
        text: gapId,
      },
      subject: { reference: `Patient/${patientFhirId}` },
      effectiveDateTime: now,
      extension: [
        { url: 'http://tcoc.example.org/fhir/StructureDefinition/tcoc-gap-id', valueString: gapId },
        {
          url: 'http://tcoc.example.org/fhir/StructureDefinition/care-gap-status',
          valueString: 'Closed',
        },
        {
          url: 'http://tcoc.example.org/fhir/StructureDefinition/hedis-compliance',
          valueString: hedis,
        },
      ],
      note: [{ text: `Force-closed via FHIR tester at ${now}` }],
    };
    try {
      const res = await realFhirRequest('POST', 'Observation', payload);
      const succeeded = res.statusCode >= 200 && res.statusCode < 300;
      let body = res.body;
      try {
        body = JSON.stringify(JSON.parse(res.body), null, 2);
      } catch {
        /* leave as-is */
      }
      if (succeeded) {
        try {
          const created = JSON.parse(res.body);
          if (created.id) onObsCreated(created.id);
        } catch {
          /* ignore */
        }
      }
      setResult({
        status: succeeded ? 'success' : 'error',
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        requestPayload: `POST ${LOCAL_FHIR_BASE}/Observation\nContent-Type: application/fhir+json\n\n${JSON.stringify(payload, null, 2)}`,
        responseBody: succeeded ? body : undefined,
        errorMessage: succeeded ? undefined : body,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setResult({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }, [gapId, hedis, patientFhirId, onObsCreated]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">Gap ID</label>
          <select
            value={gapId}
            onChange={(e) => setGapId(e.target.value)}
            className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-carbon-gray-10"
          >
            {GAP_IDS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
            HEDIS Compliance
          </label>
          <select
            value={hedis}
            onChange={(e) => setHedis(e.target.value as typeof hedis)}
            className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-carbon-gray-10"
          >
            <option value="MET">MET</option>
            <option value="NOT_MET">NOT_MET</option>
            <option value="PENDING">PENDING</option>
          </select>
        </div>
      </div>
      <button
        onClick={run}
        disabled={result.status === 'running'}
        className="flex items-center gap-2 px-4 py-2 bg-[#b45309] text-white text-xs font-semibold hover:bg-[#92400e] transition-colors disabled:opacity-50"
      >
        <Icon name="BoltIcon" size={14} />
        {result.status === 'running' ? 'Writing…' : 'Force POST Observation'}
      </button>
      {result.status === 'success' && (
        <div className="px-4 py-2.5 bg-[#defbe6] border border-[#a7f0ba] text-xs text-[#0e6027] flex items-center gap-2">
          <Icon name="CheckCircleIcon" size={14} />
          <span>Observation created — ID auto-filled in PUT test below. Run the PUT now.</span>
        </div>
      )}
      <ResponsePanel result={result} />
    </div>
  );
}

// ─── Gap & Write Verification Tab ─────────────────────────────────────────────

// Known TCOC FHIR patient IDs (from PLATFORM_TO_FHIR_ID_MAP)
const TCOC_PATIENTS = [
  { label: 'Dorothy Simmons (PAT-0042)', fhirId: 'patient-dorothy-042' },
  { label: 'James Wilson (PAT-0087)', fhirId: 'patient-james-087' },
  { label: 'Robert Chen (PAT-0103)', fhirId: 'patient-robert-103' },
  { label: 'Lisa Thompson (PAT-0156)', fhirId: 'patient-lisa-156' },
  { label: 'Maria Redhawk (MARIA_SD_001)', fhirId: 'patient-maria-001' },
];

const GAP_BASE_URL = 'http://tcoc.example.org/fhir/StructureDefinition';

// ─── Before / After Write Test Tab ───────────────────────────────────────────

const BA_SCENARIOS = [
  {
    id: 'task-complete',
    label: 'Complete a Care Gap Task',
    description: 'Marks a Task as completed and re-reads it to confirm status changed.',
    readPath: (id: string) => `Task/${id}`,
    writePath: (id: string) => `Task/${id}`,
    defaultId: 'patient-maria-001-task-CG_MARIA_001',
    buildWriteBody: (id: string) => ({
      resourceType: 'Task',
      id,
      status: 'completed',
      intent: 'order',
      lastModified: new Date().toISOString(),
      output: [
        {
          type: { text: 'Gap Closure Evidence' },
          valueReference: { reference: `Observation/${id}-obs` },
        },
      ],
    }),
    snapshotField: (body: Record<string, unknown>) => `status = "${body.status}"`,
  },
  {
    id: 'obs-amend',
    label: 'Amend an Observation (HbA1c)',
    description: 'Changes the value of an existing HbA1c Observation and re-reads to confirm.',
    readPath: (id: string) => `Observation/${id}`,
    writePath: (id: string) => `Observation/${id}`,
    defaultId: 'patient-maria-001-obs-hba1c',
    buildWriteBody: (id: string) => ({
      resourceType: 'Observation',
      id,
      status: 'amended',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
            },
          ],
        },
      ],
      code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' }] },
      subject: { reference: 'Patient/patient-maria-001' },
      effectiveDateTime: new Date().toISOString().slice(0, 10),
      valueQuantity: { value: 7.1, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
    }),
    snapshotField: (body: Record<string, unknown>) => {
      const vq = body.valueQuantity as { value?: number; unit?: string } | undefined;
      return vq
        ? `valueQuantity = ${vq.value} ${vq.unit}  |  status = "${body.status}"`
        : `status = "${body.status}"`;
    },
  },
  {
    id: 'patient-note',
    label: 'Update Patient Identifier / Note',
    description: 'Adds a custom identifier to a Patient resource and re-reads to confirm.',
    readPath: (id: string) => `Patient/${id}`,
    writePath: (id: string) => `Patient/${id}`,
    defaultId: 'patient-maria-001',
    buildWriteBody: (id: string) => ({
      resourceType: 'Patient',
      id,
      identifier: [{ system: 'http://tcoc.example.org/patient-id', value: id }],
      name: [{ use: 'official', family: 'Redhawk', given: ['Maria'] }],
      gender: 'female',
      birthDate: '1978-04-12',
      meta: {
        tag: [
          {
            system: 'http://tcoc.example.org/tags',
            code: 'before-after-test',
            display: `Updated at ${new Date().toLocaleTimeString()}`,
          },
        ],
      },
    }),
    snapshotField: (body: Record<string, unknown>) => {
      const tags = (body.meta as { tag?: { display?: string }[] } | undefined)?.tag;
      const tag = tags?.[tags.length - 1]?.display ?? '—';
      return `meta.tag = "${tag}"`;
    },
  },
];

type BAStep =
  'idle' | 'reading-before' | 'before-done' | 'writing' | 'reading-after' | 'done' | 'error';

function BeforeAfterTab() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [resourceId, setResourceId] = useState(BA_SCENARIOS[0].defaultId);
  const [step, setStep] = useState<BAStep>('idle');
  const [before, setBefore] = useState<{
    raw: string;
    snapshot: string;
    statusCode: number;
  } | null>(null);
  const [after, setAfter] = useState<{ raw: string; snapshot: string; statusCode: number } | null>(
    null
  );
  const [writeResult, setWriteResult] = useState<{ statusCode: number; latencyMs: number } | null>(
    null
  );
  const [error, setError] = useState('');

  const scenario = BA_SCENARIOS[scenarioIdx];

  function reset() {
    setStep('idle');
    setBefore(null);
    setAfter(null);
    setWriteResult(null);
    setError('');
  }

  function selectScenario(idx: number) {
    setScenarioIdx(idx);
    setResourceId(BA_SCENARIOS[idx].defaultId);
    reset();
  }

  async function runFullTest() {
    reset();
    const id = resourceId.trim();
    if (!id) {
      setError('Resource ID is required.');
      setStep('error');
      return;
    }

    // ── Step 1: Read BEFORE ──────────────────────────────────────────────────
    setStep('reading-before');
    try {
      const r = await realFhirRequest('GET', scenario.readPath(id));
      const parsed: Record<string, unknown> = JSON.parse(r.body);
      setBefore({
        raw: JSON.stringify(parsed, null, 2),
        snapshot: scenario.snapshotField(parsed),
        statusCode: r.statusCode,
      });
    } catch (e) {
      setError(`Before-read failed: ${e instanceof Error ? e.message : String(e)}`);
      setStep('error');
      return;
    }

    // ── Step 2: Write (PUT) ──────────────────────────────────────────────────
    setStep('writing');
    try {
      const body = scenario.buildWriteBody(id);
      const w = await realFhirRequest('PUT', scenario.writePath(id), body);
      if (w.statusCode < 200 || w.statusCode >= 300) {
        setError(`PUT failed with HTTP ${w.statusCode}: ${w.body}`);
        setStep('error');
        return;
      }
      setWriteResult({ statusCode: w.statusCode, latencyMs: w.latencyMs });
    } catch (e) {
      setError(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
      setStep('error');
      return;
    }

    // ── Step 3: Read AFTER ───────────────────────────────────────────────────
    setStep('reading-after');
    // Small delay to let the FHIR server commit
    await new Promise((res) => setTimeout(res, 400));
    try {
      const r = await realFhirRequest('GET', scenario.readPath(id));
      const parsed: Record<string, unknown> = JSON.parse(r.body);
      setAfter({
        raw: JSON.stringify(parsed, null, 2),
        snapshot: scenario.snapshotField(parsed),
        statusCode: r.statusCode,
      });
      setStep('done');
    } catch (e) {
      setError(`After-read failed: ${e instanceof Error ? e.message : String(e)}`);
      setStep('error');
    }
  }

  const running = ['reading-before', 'writing', 'reading-after'].includes(step);
  const changed = before && after && before.snapshot !== after.snapshot;

  const stepLabel: Record<BAStep, string> = {
    idle: '',
    'reading-before': '1 / 3 — Reading current value…',
    'before-done': '',
    writing: '2 / 3 — Writing update to FHIR…',
    'reading-after': '3 / 3 — Re-reading to verify…',
    done: 'Complete',
    error: 'Error',
  };

  return (
    <div className="space-y-5">
      {/* Config panel */}
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="ArrowsRightLeftIcon" size={16} className="text-carbon-blue" />
          Before / After Write Test
        </h3>
        <p className="text-xs text-carbon-gray-50 mb-4">
          Reads a resource, writes a change, then re-reads to confirm the FHIR server persisted it.
          The before and after snapshots are shown side-by-side.
        </p>

        {/* Scenario picker */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">Scenario</label>
          <div className="flex flex-wrap gap-2">
            {BA_SCENARIOS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => selectScenario(i)}
                className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                  scenarioIdx === i
                    ? 'bg-carbon-blue text-white border-carbon-blue'
                    : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:border-carbon-blue hover:text-carbon-blue'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-carbon-gray-50 mt-2">{scenario.description}</p>
        </div>

        {/* Resource ID */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
            Resource ID <span className="text-carbon-gray-50 font-normal">(FHIR logical ID)</span>
          </label>
          <input
            type="text"
            value={resourceId}
            onChange={(e) => {
              setResourceId(e.target.value);
              reset();
            }}
            className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10 max-w-lg"
          />
          <p className="text-2xs text-carbon-gray-50 mt-1">
            Will call:{' '}
            <code className="font-mono">
              {LOCAL_FHIR_BASE}/{scenario.readPath(resourceId || '<id>')}
            </code>
          </p>
        </div>

        <button
          onClick={runFullTest}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-carbon-blue text-white text-xs font-semibold hover:bg-[#0043ce] transition-colors disabled:opacity-50"
        >
          <Icon name="ArrowsRightLeftIcon" size={14} />
          {running ? stepLabel[step] : 'Run Before → Write → After Test'}
        </button>
      </div>

      {/* Progress bar */}
      {(running || step === 'done' || step === 'error') && (
        <div className="bg-white border border-carbon-gray-20 px-5 py-4">
          <div className="flex items-center gap-3 mb-3">
            {['reading-before', 'writing', 'reading-after'].map((s, i) => {
              const stepOrder: BAStep[] = ['reading-before', 'writing', 'reading-after'];
              const currentIdx = stepOrder.indexOf(step as BAStep);
              const done = step === 'done' || currentIdx > i;
              const active = stepOrder[i] === step;
              return (
                <React.Fragment key={s}>
                  <div
                    className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 ${
                      done
                        ? 'bg-[#defbe6] text-[#198038]'
                        : active
                          ? 'bg-[#d0e2ff] text-carbon-blue'
                          : 'bg-carbon-gray-10 text-carbon-gray-50'
                    }`}
                  >
                    {done ? '✓' : active ? '…' : `${i + 1}`}
                    <span>{['Read Before', 'PUT Write', 'Read After'][i]}</span>
                  </div>
                  {i < 2 && <div className="flex-1 h-px bg-carbon-gray-20" />}
                </React.Fragment>
              );
            })}
          </div>
          {step === 'error' && (
            <div className="px-3 py-2 bg-[#fff1f1] border-l-2 border-carbon-red text-xs text-carbon-red font-medium">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Before / After comparison */}
      {(before || after) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* BEFORE */}
          <div className="bg-white border border-carbon-gray-20 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-carbon-gray-100 flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-carbon-gray-10 text-carbon-gray-70 text-2xs font-bold border border-carbon-gray-20">
                  BEFORE
                </span>
                GET → HTTP {before?.statusCode}
              </span>
            </div>
            {before && (
              <>
                <div className="mb-2 px-3 py-2 bg-[#fff8e1] border-l-2 border-[#f1c21b] text-xs font-mono text-[#8a3800]">
                  {before.snapshot}
                </div>
                <pre className="text-2xs font-mono text-carbon-gray-70 overflow-auto max-h-64 bg-carbon-gray-10 p-3 border border-carbon-gray-20 whitespace-pre-wrap">
                  {before.raw}
                </pre>
              </>
            )}
            {!before && <p className="text-xs text-carbon-gray-50 italic">Waiting…</p>}
          </div>

          {/* AFTER */}
          <div className="bg-white border border-carbon-gray-20 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-carbon-gray-100 flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 text-2xs font-bold border ${
                    step === 'done'
                      ? changed
                        ? 'bg-[#defbe6] text-[#198038] border-[#a7f0ba]'
                        : 'bg-[#fff1f1] text-carbon-red border-[#ffb3b8]'
                      : 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'
                  }`}
                >
                  AFTER
                </span>
                {after ? `GET → HTTP ${after.statusCode}` : '—'}
              </span>
              {step === 'done' && (
                <span
                  className={`text-xs font-semibold ${changed ? 'text-[#198038]' : 'text-carbon-red'}`}
                >
                  {changed ? '✓ Change confirmed' : '✗ No change detected'}
                </span>
              )}
            </div>
            {after && (
              <>
                <div
                  className={`mb-2 px-3 py-2 border-l-2 text-xs font-mono ${
                    changed
                      ? 'bg-[#defbe6] border-[#24a148] text-[#0e6027]'
                      : 'bg-[#fff1f1] border-carbon-red text-carbon-red'
                  }`}
                >
                  {after.snapshot}
                </div>
                <pre className="text-2xs font-mono text-carbon-gray-70 overflow-auto max-h-64 bg-carbon-gray-10 p-3 border border-carbon-gray-20 whitespace-pre-wrap">
                  {after.raw}
                </pre>
              </>
            )}
            {!after && (
              <p className="text-xs text-carbon-gray-50 italic">
                {running ? 'Waiting for write to complete…' : 'Not yet read'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Write result badge */}
      {writeResult && (
        <div className="bg-white border border-carbon-gray-20 px-5 py-3 flex items-center gap-3 text-xs">
          <span className="font-semibold text-carbon-gray-70">PUT result:</span>
          <span
            className={`px-2 py-0.5 font-bold text-2xs ${writeResult.statusCode < 300 ? 'bg-[#defbe6] text-[#198038]' : 'bg-[#fff1f1] text-carbon-red'}`}
          >
            HTTP {writeResult.statusCode}
          </span>
          <span className="text-carbon-gray-50">{writeResult.latencyMs}ms</span>
        </div>
      )}
    </div>
  );
}

// ─── PUT Resource Tab ─────────────────────────────────────────────────────────

const PUT_RESOURCE_TEMPLATES: { label: string; resourceType: string; body: object }[] = [
  {
    label: 'Patient — update name',
    resourceType: 'Patient',
    body: {
      resourceType: 'Patient',
      id: 'REPLACE_WITH_FHIR_ID',
      name: [{ use: 'official', family: 'Redhawk', given: ['Maria'] }],
      gender: 'female',
      birthDate: '1978-04-12',
    },
  },
  {
    label: 'Observation — amend HbA1c',
    resourceType: 'Observation',
    body: {
      resourceType: 'Observation',
      id: 'REPLACE_WITH_OBS_ID',
      status: 'amended',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '4548-4',
            display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
          },
        ],
      },
      subject: { reference: 'Patient/REPLACE_WITH_FHIR_ID' },
      effectiveDateTime: new Date().toISOString().slice(0, 10),
      valueQuantity: { value: 7.1, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
    },
  },
  {
    label: 'Task — mark completed',
    resourceType: 'Task',
    body: {
      resourceType: 'Task',
      id: 'REPLACE_WITH_TASK_ID',
      status: 'completed',
      intent: 'order',
      lastModified: new Date().toISOString(),
    },
  },
  {
    label: 'Blank (free-form)',
    resourceType: '',
    body: { resourceType: '', id: '' },
  },
];

function PutResourceTab() {
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [resourceType, setResourceType] = useState(PUT_RESOURCE_TEMPLATES[0].resourceType);
  const [resourceId, setResourceId] = useState('');
  const [bodyText, setBodyText] = useState(JSON.stringify(PUT_RESOURCE_TEMPLATES[0].body, null, 2));
  const [result, setResult] = useState<TestResult>({ status: 'idle' });
  const [parseError, setParseError] = useState('');

  function applyTemplate(idx: number) {
    const t = PUT_RESOURCE_TEMPLATES[idx];
    setSelectedTemplate(idx);
    setResourceType(t.resourceType);
    setBodyText(JSON.stringify(t.body, null, 2));
    setParseError('');
    setResult({ status: 'idle' });
  }

  function handleBodyChange(val: string) {
    setBodyText(val);
    try {
      const parsed = JSON.parse(val);
      // keep resourceType / id fields in sync if they're in the body
      if (parsed.resourceType) setResourceType(parsed.resourceType);
      if (parsed.id && !resourceId) setResourceId(parsed.id);
      setParseError('');
    } catch {
      setParseError('Invalid JSON');
    }
  }

  const run = useCallback(async () => {
    setParseError('');
    let body: object;
    try {
      body = JSON.parse(bodyText);
    } catch {
      setParseError('Invalid JSON — fix the body before sending.');
      return;
    }
    const rt = resourceType.trim();
    const id = resourceId.trim();
    if (!rt || !id) {
      setParseError('Resource Type and Resource ID are both required for PUT.');
      return;
    }
    setResult({ status: 'running' });
    try {
      const path = `${rt}/${id}`;
      const res = await realFhirRequest('PUT', path, body);
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      let pretty = res.body;
      try {
        pretty = JSON.stringify(JSON.parse(res.body), null, 2);
      } catch {
        /* keep raw */
      }
      setResult({
        status: ok ? 'success' : 'error',
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        requestPayload: `PUT ${LOCAL_FHIR_BASE}/${path}\nContent-Type: application/fhir+json\n\n${JSON.stringify(body, null, 2)}`,
        responseBody: ok ? pretty : undefined,
        errorMessage: ok ? undefined : pretty,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setResult({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }, [resourceType, resourceId, bodyText]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="PencilSquareIcon" size={16} className="text-carbon-blue" />
          PUT Resource
        </h3>
        <p className="text-xs text-carbon-gray-50 mb-4">
          Updates an existing FHIR resource by ID.&nbsp;
          <code className="font-mono bg-carbon-gray-10 px-1">
            PUT {LOCAL_FHIR_BASE}/{'<ResourceType>/<id>'}
          </code>
        </p>

        {/* Template picker */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
            Start from template
          </label>
          <div className="flex flex-wrap gap-2">
            {PUT_RESOURCE_TEMPLATES.map((t, i) => (
              <button
                key={i}
                onClick={() => applyTemplate(i)}
                className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                  selectedTemplate === i
                    ? 'bg-carbon-blue text-white border-carbon-blue'
                    : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:border-carbon-blue hover:text-carbon-blue'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resource type + ID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Resource Type <span className="text-carbon-red">*</span>
            </label>
            <input
              type="text"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              placeholder="e.g. Patient"
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Resource ID <span className="text-carbon-red">*</span>
            </label>
            <input
              type="text"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              placeholder="e.g. patient-maria-001"
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-carbon-blue bg-carbon-gray-10"
            />
          </div>
        </div>

        {/* URL preview */}
        <div className="mb-4 px-3 py-2 bg-carbon-gray-10 border-l-2 border-carbon-blue flex items-center gap-2">
          <span className="text-2xs font-bold text-carbon-blue bg-[#d0e2ff] px-1.5 py-0.5">
            PUT
          </span>
          <code className="text-xs font-mono text-carbon-gray-70 break-all">
            {LOCAL_FHIR_BASE}/{resourceType || '<ResourceType>'}/{resourceId || '<id>'}
          </code>
        </div>

        {/* Body editor */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-carbon-gray-70">
              Request Body (FHIR JSON)
            </label>
            {parseError && (
              <span className="text-xs text-carbon-red font-medium">{parseError}</span>
            )}
          </div>
          <textarea
            value={bodyText}
            onChange={(e) => handleBodyChange(e.target.value)}
            rows={16}
            spellCheck={false}
            className={`w-full border px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none bg-carbon-gray-10 resize-y ${
              parseError ? 'border-carbon-red' : 'border-carbon-gray-20 focus:border-carbon-blue'
            }`}
          />
        </div>

        <button
          onClick={run}
          disabled={result.status === 'running' || !!parseError}
          className="flex items-center gap-2 px-4 py-2 bg-carbon-blue text-white text-xs font-semibold hover:bg-[#0043ce] transition-colors disabled:opacity-50"
        >
          <Icon name="PencilSquareIcon" size={14} />
          {result.status === 'running' ? 'Sending…' : 'Send PUT Request'}
        </button>
      </div>

      <ResponsePanel result={result} />
    </div>
  );
}

function GapVerificationTab() {
  const [patientFhirId, setPatientFhirId] = useState(TCOC_PATIENTS[0].fhirId);
  const [searchResult, setSearchResult] = useState<TestResult>({ status: 'idle' });
  const [putObsId, setPutObsId] = useState('');
  const [putStatus, setPutStatus] = useState<'final' | 'amended' | 'cancelled'>('amended');
  const [putNote, setPutNote] = useState('Status updated via FHIR tester PUT verification');
  const [putResult, setPutResult] = useState<TestResult>({ status: 'idle' });
  const [parsedObs, setParsedObs] = useState<
    { id: string; gapId: string; gapStatus: string; closedAt: string }[]
  >([]);

  // ── Search closed-gap Observations for a patient ──────────────────────────
  const runSearch = useCallback(async () => {
    setSearchResult({ status: 'running' });
    setParsedObs([]);
    const path = `Observation?subject=Patient/${patientFhirId}&_count=50`;
    try {
      const res = await realFhirRequest('GET', path);
      const succeeded = res.statusCode >= 200 && res.statusCode < 300;
      let body = res.body;
      try {
        body = JSON.stringify(JSON.parse(res.body), null, 2);
      } catch {
        /* leave as-is */
      }

      if (succeeded) {
        try {
          const bundle = JSON.parse(res.body);
          const entries: { id: string; gapId: string; gapStatus: string; closedAt: string }[] = [];
          for (const entry of bundle.entry ?? []) {
            const obs = entry.resource;
            if (!obs || obs.resourceType !== 'Observation') continue;
            const exts: { url: string; valueString?: string }[] = obs.extension ?? [];
            const gapId =
              exts.find((e: { url: string }) => e.url === `${GAP_BASE_URL}/tcoc-gap-id`)
                ?.valueString ??
              obs.code?.text ??
              '—';
            const gapStatus =
              exts.find((e: { url: string }) => e.url === `${GAP_BASE_URL}/care-gap-status`)
                ?.valueString ??
              obs.status ??
              '—';
            const closedAt = obs.effectiveDateTime ?? obs.meta?.lastUpdated ?? '—';
            entries.push({ id: obs.id, gapId, gapStatus, closedAt });
          }
          setParsedObs(entries);
        } catch {
          /* parse error, show raw */
        }
      }

      setSearchResult({
        status: succeeded ? 'success' : 'error',
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        requestPayload: `GET ${LOCAL_FHIR_BASE}/${path}`,
        responseBody: succeeded ? body : undefined,
        errorMessage: succeeded ? undefined : body,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setSearchResult({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }, [patientFhirId]);

  // ── PUT an existing Observation to verify round-trip update ───────────────
  const runPut = useCallback(async () => {
    if (!putObsId.trim()) return;
    setPutResult({ status: 'running' });

    // First GET the existing resource so we have the full body + meta for the PUT
    let existingObs: Record<string, unknown> = {};
    try {
      const getRes = await realFhirRequest('GET', `Observation/${putObsId.trim()}`);
      existingObs = JSON.parse(getRes.body);
    } catch {
      setPutResult({
        status: 'error',
        errorMessage: 'Could not fetch existing Observation before PUT. Check the Observation ID.',
        timestamp: new Date().toLocaleTimeString(),
      });
      return;
    }

    const updatedObs = {
      ...existingObs,
      id: putObsId.trim(),
      status: putStatus,
      note: [
        ...((existingObs.note as object[]) ?? []),
        { text: `${putNote} — verified at ${new Date().toISOString()}` },
      ],
    };

    const path = `Observation/${putObsId.trim()}`;
    try {
      const res = await realFhirRequest('PUT', path, updatedObs);
      const succeeded = res.statusCode >= 200 && res.statusCode < 300;
      let body = res.body;
      try {
        body = JSON.stringify(JSON.parse(res.body), null, 2);
      } catch {
        /* leave as-is */
      }
      setPutResult({
        status: succeeded ? 'success' : 'error',
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        requestPayload: `PUT ${LOCAL_FHIR_BASE}/${path}\nContent-Type: application/fhir+json\n\n${JSON.stringify(updatedObs, null, 2)}`,
        responseBody: succeeded ? body : undefined,
        errorMessage: succeeded ? undefined : body,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setPutResult({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }, [putObsId, putStatus, putNote]);

  return (
    <div className="space-y-6">
      {/* ── How it works explainer ── */}
      <div className="bg-[#edf5ff] border border-[#0043ce]/30 px-5 py-4 flex gap-3">
        <Icon
          name="InformationCircleIcon"
          size={18}
          className="text-[#0043ce] flex-shrink-0 mt-0.5"
        />
        <div className="text-xs text-carbon-gray-100 space-y-1 leading-relaxed">
          <p className="font-semibold text-[#0043ce]">How gap closures appear in FHIR</p>
          <p>
            When you close a care gap in the app (Live FHIR mode), a{' '}
            <code className="font-mono bg-white px-1">POST Observation</code> is written to HAPI
            FHIR. Each Observation carries:
          </p>
          <ul className="list-disc list-inside space-y-0.5 ml-1 text-carbon-gray-70">
            <li>
              <code className="font-mono">extension[tcoc-gap-id]</code> — the gap ID (e.g.{' '}
              <code className="font-mono">gap-1</code>)
            </li>
            <li>
              <code className="font-mono">extension[care-gap-status]</code> —{' '}
              <code className="font-mono">Closed</code>
            </li>
            <li>
              <code className="font-mono">extension[hedis-compliance]</code> —{' '}
              <code className="font-mono">MET</code> / <code className="font-mono">NOT_MET</code>
            </li>
            <li>
              <code className="font-mono">subject.reference</code> →{' '}
              <code className="font-mono">Patient/{'{fhirId}'}</code>
            </li>
            <li>
              <code className="font-mono">effectiveDateTime</code> — date of service entered during
              closure
            </li>
          </ul>
          <p className="text-carbon-gray-50 text-2xs mt-1">
            Use the <strong>Search</strong> panel below to confirm a closure landed. Copy the
            returned Observation ID into the <strong>PUT Test</strong> to verify round-trip update
            (status → amended).
          </p>
        </div>
      </div>

      {/* ── Step 1: Search Observations for a patient ── */}
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4 flex items-center gap-2">
          <Icon name="MagnifyingGlassIcon" size={16} className="text-[#198038]" />
          Step 1 — Search: Did the gap closure reach the FHIR server?
        </h3>
        <div className="mb-4">
          <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">Patient</label>
          <select
            value={patientFhirId}
            onChange={(e) => setPatientFhirId(e.target.value)}
            className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#198038] bg-carbon-gray-10"
          >
            {TCOC_PATIENTS.map((p) => (
              <option key={p.fhirId} value={p.fhirId}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-2xs text-carbon-gray-50 mt-1 font-mono">
            → GET {LOCAL_FHIR_BASE}/Observation?subject=Patient/{patientFhirId}&_count=50
          </p>
        </div>
        <button
          onClick={runSearch}
          disabled={searchResult.status === 'running'}
          className="flex items-center gap-2 px-4 py-2 bg-[#198038] text-white text-xs font-semibold hover:bg-[#0e6027] transition-colors disabled:opacity-50 mb-5"
        >
          <Icon name="MagnifyingGlassIcon" size={14} />
          {searchResult.status === 'running' ? 'Searching…' : 'Search Observations'}
        </button>

        {/* Parsed gap table */}
        {parsedObs.length > 0 && (
          <div className="mb-4">
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest mb-2">
              Found {parsedObs.length} Observation{parsedObs.length !== 1 ? 's' : ''} — click an ID
              to pre-fill the PUT test below
            </p>
            <div className="border border-carbon-gray-20 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {['Observation ID', 'Gap ID', 'Status', 'Effective Date'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-10">
                  {parsedObs.map((obs) => (
                    <tr
                      key={obs.id}
                      className="hover:bg-[#edf5ff] cursor-pointer"
                      onClick={() => setPutObsId(obs.id)}
                      title="Click to pre-fill PUT test"
                    >
                      <td className="px-3 py-2 font-mono text-[#0043ce] hover:underline">
                        {obs.id}
                      </td>
                      <td className="px-3 py-2 font-mono text-carbon-gray-70">{obs.gapId}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 text-2xs font-semibold ${
                            obs.gapStatus === 'Closed'
                              ? 'bg-[#defbe6] text-[#0e6027]'
                              : obs.gapStatus === 'Open'
                                ? 'bg-[#fff1f1] text-[#da1e28]'
                                : 'bg-carbon-gray-10 text-carbon-gray-70'
                          }`}
                        >
                          {obs.gapStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-carbon-gray-50">
                        {obs.closedAt.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {parsedObs.length === 0 && searchResult.status === 'success' && (
          <div className="mb-4 px-4 py-3 bg-[#fdf6dd] border border-[#f1c21b] text-xs text-[#b45309]">
            No Observations found for this patient. Close a care gap in Live FHIR mode first, then
            re-run this search.
          </div>
        )}

        <ResponsePanel result={searchResult} />
      </div>

      {/* ── Step 1b: Force-write a gap closure directly ── */}
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="BoltIcon" size={16} className="text-[#b45309]" />
          Step 1b — Force POST: Write a gap closure directly without the UI
        </h3>
        <p className="text-xs text-carbon-gray-50 mb-4">
          Creates a real <code className="font-mono">Observation</code> on HAPI FHIR right now.
          After it succeeds, the returned ID auto-fills the PUT test below.
        </p>
        <ForcePostGapPanel patientFhirId={patientFhirId} onObsCreated={setPutObsId} />
      </div>

      {/* ── Step 2: PUT an Observation to verify update works ── */}
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="ArrowPathIcon" size={16} className="text-[#6929c4]" />
          Step 2 — PUT: Update an existing Observation (the real write test)
        </h3>
        <p className="text-xs text-carbon-gray-50 mb-4">
          Paste an Observation ID from Step 1 search or Step 1b above. Clicking{' '}
          <strong>Run PUT</strong> GETs the resource, sets{' '}
          <code className="font-mono">status → amended</code>, appends a timestamped note, then PUTs
          it back. <strong>HTTP 200</strong> with an incremented{' '}
          <code className="font-mono">meta.versionId</code> confirms the FHIR server accepted the
          write.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              Observation ID
            </label>
            <input
              type="text"
              value={putObsId}
              onChange={(e) => setPutObsId(e.target.value)}
              placeholder="e.g.  12345  (from search results above)"
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] bg-carbon-gray-10"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
              New Status
            </label>
            <select
              value={putStatus}
              onChange={(e) => setPutStatus(e.target.value as typeof putStatus)}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] bg-carbon-gray-10"
            >
              <option value="amended">amended</option>
              <option value="final">final</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-carbon-gray-70 mb-1.5">
            Verification Note (appended to Observation)
          </label>
          <input
            type="text"
            value={putNote}
            onChange={(e) => setPutNote(e.target.value)}
            className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] bg-carbon-gray-10"
          />
        </div>
        <div className="mb-4 p-3 bg-carbon-gray-10 border-l-2 border-[#6929c4]">
          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest mb-1">
            What this test does
          </p>
          <ol className="text-2xs text-carbon-gray-70 space-y-0.5 list-decimal list-inside">
            <li>
              GET <code className="font-mono">/Observation/{putObsId || '{id}'}</code> — fetch
              current state
            </li>
            <li>
              Merge <code className="font-mono">status: {putStatus}</code> + append note
            </li>
            <li>
              PUT <code className="font-mono">/Observation/{putObsId || '{id}'}</code> — write back
            </li>
            <li>
              Confirm response is <code className="font-mono">200 OK</code> with incremented{' '}
              <code className="font-mono">meta.versionId</code>
            </li>
          </ol>
        </div>
        <button
          onClick={runPut}
          disabled={putResult.status === 'running' || !putObsId.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-[#6929c4] text-white text-xs font-semibold hover:bg-[#491d8b] transition-colors disabled:opacity-50"
        >
          <Icon name="ArrowUpTrayIcon" size={14} />
          {putResult.status === 'running' ? 'Sending PUT…' : 'Run PUT Verification'}
        </button>

        {putResult.status === 'success' && (
          <div className="mt-4 px-4 py-3 bg-[#defbe6] border border-[#a7f0ba] flex items-start gap-2">
            <Icon
              name="CheckCircleIcon"
              size={16}
              className="text-[#0e6027] flex-shrink-0 mt-0.5"
            />
            <div className="text-xs text-[#0e6027]">
              <p className="font-semibold">PUT succeeded — FHIR server accepted the update</p>
              <p className="text-2xs mt-0.5 opacity-80">
                Check <code className="font-mono">meta.versionId</code> in the response below — it
                should be incremented from the original. The gap closure write path is confirmed
                working.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4">
          <ResponsePanel result={putResult} />
        </div>
      </div>

      {/* ── Step 3: Direct HAPI console link ── */}
      <div className="bg-white border border-carbon-gray-20 p-5">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3 flex items-center gap-2">
          <Icon name="ServerIcon" size={16} className="text-carbon-gray-70" />
          Step 3 — Browse directly in HAPI FHIR UI
        </h3>
        <p className="text-xs text-carbon-gray-70 mb-3">
          The HAPI FHIR server ships with a built-in web UI. Open these URLs in a browser to browse
          and inspect resources without writing any code:
        </p>
        <div className="space-y-2">
          {[
            {
              label: 'All Patients',
              url: `${LOCAL_FHIR_BASE}/Patient?_pretty=true`,
              desc: 'Browse every patient loaded by the migration script',
            },
            {
              label: 'All Observations',
              url: `${LOCAL_FHIR_BASE}/Observation?_count=50&_pretty=true`,
              desc: 'All gap closures + clinical observations written by the app',
            },
            {
              label: `Observations for ${patientFhirId}`,
              url: `${LOCAL_FHIR_BASE}/Observation?subject=Patient/${patientFhirId}&_count=50&_pretty=true`,
              desc: 'Filter to the currently selected patient',
            },
            {
              label: 'All ServiceRequests',
              url: `${LOCAL_FHIR_BASE}/ServiceRequest?_count=50&_pretty=true`,
              desc: 'Orders signed via the MD Smart Launch order entry screen',
            },
            {
              label: 'All CarePlans',
              url: `${LOCAL_FHIR_BASE}/CarePlan?_count=50&_pretty=true`,
              desc: 'Care plan updates from "Update Plan" in the Whole Person tab',
            },
            {
              label: 'HAPI Root UI',
              url: 'http://localhost:8080',
              desc: 'HAPI FHIR server web console — browse any resource type',
            },
          ].map(({ label, url, desc }) => (
            <div
              key={label}
              className="flex items-center gap-3 py-2.5 border-b border-carbon-gray-10 last:border-0"
            >
              <Icon name="LinkIcon" size={13} className="text-carbon-gray-30 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-carbon-gray-100">{label}</p>
                <p className="text-2xs text-carbon-gray-50 truncate">{desc}</p>
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-carbon-gray-10 border border-carbon-gray-20 text-carbon-gray-70 hover:bg-[#d0e2ff] hover:text-[#0043ce] hover:border-[#0043ce] transition-colors flex-shrink-0"
              >
                Open <Icon name="ArrowTopRightOnSquareIcon" size={11} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FhirTesterPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('patient');

  const tabs: { key: ActiveTab; label: string; icon: string; badge?: string }[] = [
    { key: 'patient', label: 'Patient Lookup', icon: 'UserIcon' },
    { key: 'order', label: 'Order Submission (POST)', icon: 'ClipboardDocumentListIcon' },
    { key: 'put', label: 'PUT Resource', icon: 'PencilSquareIcon' },
    { key: 'beforeafter', label: 'Before / After Test', icon: 'ArrowsRightLeftIcon' },
    { key: 'cds', label: 'CDS Hook Calls', icon: 'CpuChipIcon' },
    { key: 'gaps', label: 'Gap & Write Verification', icon: 'CheckCircleIcon' },
  ];

  return (
    <AppLayout
      pageTitle="FHIR API Tester"
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'FHIR API Tester' }]}
    >
      <div className="flex-1 overflow-y-auto bg-carbon-gray-10 p-6">
        {/* Header */}
        <div className="bg-[#0f3460] text-white px-5 py-4 mb-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon name="BeakerIcon" size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Live FHIR API Tester — Cerner Sandbox</h2>
            <p className="text-xs text-white/70 mt-0.5">
              Validate patient lookup, ServiceRequest order submission, and CDS Hooks calls against
              the configured Cerner R4 sandbox. All requests are simulated against mock data.
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            <span className="text-2xs font-semibold bg-white/15 px-2 py-1">
              FHIR R4 · CDS Hooks 2.0
            </span>
            <span className="text-2xs text-white/50">Sandbox Mode</span>
          </div>
        </div>

        {/* Sandbox config strip */}
        <div className="bg-white border border-carbon-gray-20 px-5 py-3 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Icon name="ServerIcon" size={14} className="text-carbon-gray-50" />
            <span className="text-2xs text-carbon-gray-50">FHIR Base:</span>
            <code className="text-2xs font-mono text-carbon-gray-70">{CERNER_FHIR_BASE}</code>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="KeyIcon" size={14} className="text-carbon-gray-50" />
            <span className="text-2xs text-carbon-gray-50">Token:</span>
            <code className="text-2xs font-mono text-[#198038]">mock-access-token-xyz</code>
            <span className="text-2xs font-semibold bg-[#defbe6] text-[#198038] px-1.5 py-0.5">
              Active
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="w-2 h-2 rounded-full bg-[#198038] animate-pulse" />
            <span className="text-2xs text-[#198038] font-medium">Sandbox Connected</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-carbon-gray-20 mb-5 bg-white">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-carbon-blue text-carbon-blue bg-[#d0e2ff]/20'
                  : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10'
              }`}
            >
              <Icon name={t.icon as any} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'patient' && <PatientLookupTab />}
        {activeTab === 'order' && <OrderSubmissionTab />}
        {activeTab === 'put' && <PutResourceTab />}
        {activeTab === 'beforeafter' && <BeforeAfterTab />}
        {activeTab === 'cds' && <CdsHooksTab />}
        {activeTab === 'gaps' && <GapVerificationTab />}
      </div>
    </AppLayout>
  );
}
