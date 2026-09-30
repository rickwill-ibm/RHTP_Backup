'use client';
/**
 * PostmanSuiteTab — Postman Configuration + Run UI
 *
 * Embedded as the 6th tab of /api-explorer.
 * Three panels:
 *   1. Config   — read + write runtime config via GET/POST /api/config-status
 *   2. Download — generate environment + collection files for Postman Desktop
 *   3. Run      — fire the collection via /api/postman-run, stream SSE results
 */
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PATIENT_SCENARIOS, MANDATE_SECTIONS } from '@/lib/cms0057fEndpoints';
import type { ScopeKey } from '@/lib/cms0057fEndpoints';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ConfigStatus {
  mode: 'mock' | 'production';
  fhirGatewayBase: string;
  fhirGatewayLive: string | null;
  cdsGatewayBase: string;
  bulkGatewayBase: string;
  wso2AuthorizeUrl: string;
  wso2TokenUrl: string;
  wso2ClientId: string;
  wso2Configured: boolean;
  allowDevMockAuth: boolean;
  authMode: string;
  postmanPatientId: string;
  postmanReviewerEmail: string;
  postmanProviderNpi: string;
  postmanScopes: Record<ScopeKey, boolean>;
  lastSaved: string | null;
}

interface RunResult {
  type: 'start' | 'request' | 'result' | 'done' | 'error';
  name?: string;
  method?: string;
  url?: string;
  status?: number | null;
  latencyMs?: number | null;
  passed?: number;
  failed?: number;
  totalMs?: number;
  index?: number;
  total?: number;
  assertions?: { name: string; passed: boolean; error: string | null }[];
  message?: string;
  patient?: string;
  mode?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wide"
      style={{ background: color + '22', color }}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mb-3">
      <label className="block text-2xs font-semibold text-carbon-gray-70 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={`w-full border border-carbon-gray-20 px-2.5 py-1.5 text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#0f62fe] ${disabled ? 'opacity-50 cursor-not-allowed bg-carbon-gray-10' : ''}`}
      />
      {hint && <p className="text-2xs text-carbon-gray-50 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PostmanSuiteTab() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<'config' | 'download' | 'run'>('config');

  // Editable config fields (local state, committed on Save)
  const [editMode, setEditMode] = useState<'mock' | 'production'>('mock');
  const [editFhirGateway, setEditFhirGateway] = useState('');
  const [editCdsGateway, setEditCdsGateway] = useState('');
  const [editBulkGateway, setEditBulkGateway] = useState('');
  const [editWso2Auth, setEditWso2Auth] = useState('');
  const [editWso2Token, setEditWso2Token] = useState('');
  const [editWso2Client, setEditWso2Client] = useState('');
  const [editPatient, setEditPatient] = useState('MARIA_SD_001');
  const [editReviewer, setEditReviewer] = useState('reviewer@rhtp-health.org');
  const [editNpi, setEditNpi] = useState('1730154782');
  const [editScopes, setEditScopes] = useState<Record<ScopeKey, boolean>>({
    patientAccess: true,
    providerAccess: true,
    payerToPayer: true,
    priorAuth: true,
    infrastructure: true,
  });

  // Run state
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [summary, setSummary] = useState<{
    passed: number;
    failed: number;
    totalMs: number;
  } | null>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  // ── Load config on mount ──────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/config-status');
      if (!res.ok) return;
      const data: ConfigStatus = await res.json();
      setConfig(data);
      setEditMode(data.mode);
      setEditFhirGateway(data.fhirGatewayLive ?? data.fhirGatewayBase ?? '');
      setEditCdsGateway(data.cdsGatewayBase ?? '');
      setEditBulkGateway(data.bulkGatewayBase ?? '');
      setEditWso2Auth(data.wso2AuthorizeUrl ?? '');
      setEditWso2Token(data.wso2TokenUrl ?? '');
      setEditWso2Client(data.wso2ClientId ?? '');
      setEditPatient(data.postmanPatientId ?? DEMO_MEMBER_ID);
      setEditReviewer(data.postmanReviewerEmail ?? 'reviewer@rhtp-health.org');
      setEditNpi(data.postmanProviderNpi ?? '1730154782');
      setEditScopes(
        data.postmanScopes ?? {
          patientAccess: true,
          providerAccess: true,
          payerToPayer: true,
          priorAuth: true,
          infrastructure: true,
        }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── Save config ───────────────────────────────────────────────────────────

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/config-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: editMode,
          fhirGatewayBase: editFhirGateway,
          cdsGatewayBase: editCdsGateway,
          bulkGatewayBase: editBulkGateway,
          wso2AuthorizeUrl: editWso2Auth,
          wso2TokenUrl: editWso2Token,
          wso2ClientId: editWso2Client,
          postmanPatientId: editPatient,
          postmanReviewerEmail: editReviewer,
          postmanProviderNpi: editNpi,
          postmanScopes: editScopes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSaveMsg(`Saved at ${new Date(data.lastSaved).toLocaleTimeString()}`);
        await loadConfig();
      } else {
        setSaveMsg('Save failed — check console');
      }
    } finally {
      setSaving(false);
    }
  }, [
    editMode,
    editFhirGateway,
    editCdsGateway,
    editBulkGateway,
    editWso2Auth,
    editWso2Token,
    editWso2Client,
    editPatient,
    editReviewer,
    editNpi,
    editScopes,
    loadConfig,
  ]);

  // ── Download helpers ──────────────────────────────────────────────────────

  function downloadUrl(href: string, filename: string) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
  }

  function downloadEnv() {
    const url = `/api/postman-environment?patient=${editPatient}&mode=${editMode}`;
    downloadUrl(url, `cms0057f-${editMode}-${editPatient}.postman_environment.json`);
  }

  function downloadCollection() {
    const activeScopes = Object.entries(editScopes)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(',');
    const url = `/api/postman-collection?patient=${editPatient}&scopes=${activeScopes}`;
    downloadUrl(url, `cms0057f-${editPatient}.postman_collection.json`);
  }

  // ── Run via Newman SSE ────────────────────────────────────────────────────

  const runCollection = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setSummary(null);

    const res = await fetch('/api/postman-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: editPatient, mode: editMode }),
    });

    if (!res.body) {
      setRunning(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const chunk of lines) {
        const eventLine = chunk.split('\n').find((l) => l.startsWith('event:'));
        const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!eventLine || !dataLine) continue;
        const event = eventLine.slice(7).trim();
        try {
          const data = JSON.parse(dataLine.slice(5).trim());
          const item: RunResult = { type: event as RunResult['type'], ...data };
          if (event === 'done') {
            setSummary({ passed: data.passed, failed: data.failed, totalMs: data.totalMs });
          }
          setResults((prev) => [...prev, item]);
          setTimeout(() => resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        } catch {
          /* ignore parse errors */
        }
      }
    }
    setRunning(false);
  }, [editPatient, editMode]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-carbon-gray-50 text-sm">
        Loading configuration…
      </div>
    );
  }

  const scenario = PATIENT_SCENARIOS[editPatient] ?? PATIENT_SCENARIOS['MARIA_SD_001'];
  const activeCount = Object.values(editScopes).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* ── Status banner ─────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-3 border text-xs flex-wrap ${
          editMode === 'mock'
            ? 'bg-[#d0e2ff] border-[#97c1ff] text-[#0043ce]'
            : 'bg-[#defbe6] border-[#a7f0ba] text-[#0e6027]'
        }`}
      >
        <span className="font-bold text-sm">
          {editMode === 'mock' ? '🔵 MOCK MODE' : '🟢 PRODUCTION MODE'}
        </span>
        <span className="font-mono">
          {editMode === 'mock' ? '(no FHIR server required)' : editFhirGateway}
        </span>
        <span className="ml-auto">
          Patient:{' '}
          <strong>
            {scenario.firstName} {scenario.lastName}
          </strong>{' '}
          · CPT <strong>{scenario.cptCode}</strong>
        </span>
        {config?.lastSaved && (
          <span className="text-2xs opacity-70">
            Saved {new Date(config.lastSaved).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* ── Sub-tabs ──────────────────────────────────────────────────── */}
      <div className="flex border-b border-carbon-gray-20">
        {(['config', 'download', 'run'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPanel(p)}
            className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition-colors capitalize ${
              panel === p
                ? 'border-[#0f62fe] text-[#0f62fe]'
                : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100'
            }`}
          >
            {p === 'config' ? '⚙ Configure' : p === 'download' ? '⬇ Download Files' : '▶ Run Suite'}
          </button>
        ))}
      </div>

      {/* ══ CONFIG PANEL ═══════════════════════════════════════════════ */}
      {panel === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left — mode + patient */}
          <div className="space-y-4">
            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3">Data Source Mode</h3>
              <div className="grid grid-cols-2 gap-3">
                {(['mock', 'production'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setEditMode(m)}
                    className={`px-4 py-3 text-xs font-semibold border-2 text-left transition-colors ${
                      editMode === m
                        ? 'border-[#0f62fe] bg-[#eff6ff] text-[#0043ce]'
                        : 'border-carbon-gray-20 text-carbon-gray-70 hover:border-carbon-gray-50'
                    }`}
                  >
                    <div className="font-bold mb-0.5">
                      {m === 'mock' ? 'Mock (Demo)' : 'Production (FHIR)'}
                    </div>
                    <div className="text-2xs text-carbon-gray-50">
                      {m === 'mock'
                        ? 'No server required. Pre-seeded FHIR responses.'
                        : 'Live FHIR server. Requires gateway URL + auth.'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3">Active Patient</h3>
              <div className="space-y-2">
                {Object.values(PATIENT_SCENARIOS).map((p) => (
                  <button
                    key={p.platformId}
                    onClick={() => setEditPatient(p.platformId)}
                    className={`w-full text-left px-3 py-2.5 border text-xs transition-colors ${
                      editPatient === p.platformId
                        ? 'border-[#0f62fe] bg-[#eff6ff]'
                        : 'border-carbon-gray-20 hover:border-carbon-gray-40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${editPatient === p.platformId ? 'bg-[#0043ce]' : 'bg-carbon-gray-20'}`}
                      />
                      <span className="font-semibold text-carbon-gray-100">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="text-carbon-gray-50 font-mono text-2xs ml-auto">
                        {p.platformId}
                      </span>
                    </div>
                    <div className="ml-4 text-2xs text-carbon-gray-50 mt-0.5">
                      CPT {p.cptCode} · {p.procedureName} · {p.priorPayer}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3">Mandate Scopes</h3>
              <p className="text-2xs text-carbon-gray-50 mb-3">
                {activeCount} of 5 sections active — affects generated collection + run.
              </p>
              {MANDATE_SECTIONS.map((s) => (
                <label key={s.key} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={editScopes[s.key] ?? true}
                    onChange={(e) =>
                      setEditScopes((prev) => ({ ...prev, [s.key]: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[#0f62fe]"
                  />
                  <span className="text-xs text-carbon-gray-100 group-hover:text-[#0043ce] transition-colors">
                    {s.label}
                  </span>
                  <Badge color={s.color}>{s.mandate}</Badge>
                </label>
              ))}
            </div>
          </div>

          {/* Right — connection settings */}
          <div className="space-y-4">
            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3">
                Postman Runner Identity
              </h3>
              <Field
                label="Reviewer Email (PAS human gate)"
                value={editReviewer}
                onChange={setEditReviewer}
                hint="Injected into PAS WITH-approver requests"
              />
              <Field
                label="Provider NPI"
                value={editNpi}
                onChange={setEditNpi}
                hint="Ordering provider for financial clearance + evidence record"
              />
            </div>

            {editMode === 'production' && (
              <>
                <div className="bg-white border border-carbon-gray-20 px-5 py-4">
                  <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3">
                    FHIR Gateway (server-side)
                  </h3>
                  <p className="text-2xs text-carbon-gray-50 mb-3">
                    These values are saved to <code className="font-mono">.rhtp-config.json</code>{' '}
                    and used by all BFF routes. They are never sent to the browser except through
                    this config panel.
                  </p>
                  <Field
                    label="FHIR Gateway Base URL"
                    value={editFhirGateway}
                    onChange={setEditFhirGateway}
                    hint="e.g. http://localhost:8090/fhir (Tier A+) or https://localhost:8243/fhir/r4 (WSO2)"
                  />
                  <Field
                    label="CDS Hooks Gateway Base URL"
                    value={editCdsGateway}
                    onChange={setEditCdsGateway}
                    hint="e.g. http://localhost:9096"
                  />
                  <Field
                    label="Bulk Export Gateway Base URL"
                    value={editBulkGateway}
                    onChange={setEditBulkGateway}
                    hint="e.g. http://localhost:8091/bulk"
                  />
                </div>

                <div className="bg-white border border-carbon-gray-20 px-5 py-4">
                  <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3">
                    WSO2 Auth (optional)
                  </h3>
                  <p className="text-2xs text-carbon-gray-50 mb-3">
                    Required for Tier B (live WSO2 CMS-0057-F reference implementation). Leave blank
                    for Tier A+ (HAPI FHIR with dev-mock auth).
                  </p>
                  <Field
                    label="WSO2 IS Authorize URL"
                    value={editWso2Auth}
                    onChange={setEditWso2Auth}
                    hint="e.g. https://localhost:9453/oauth2/authorize"
                  />
                  <Field
                    label="WSO2 IS Token URL"
                    value={editWso2Token}
                    onChange={setEditWso2Token}
                    hint="e.g. https://localhost:9453/oauth2/token"
                  />
                  <Field
                    label="APIM OAuth Client ID"
                    value={editWso2Client}
                    onChange={setEditWso2Client}
                    hint="From the APIM Developer Portal app"
                  />
                  <p className="text-2xs text-[#da1e28] mt-1">
                    ⚠ Client secret is set via <code className="font-mono">WSO2_CLIENT_SECRET</code>{' '}
                    env var only — never entered here.
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="px-5 py-2.5 bg-[#0f62fe] text-white text-xs font-bold hover:bg-[#0043ce] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Configuration'}
              </button>
              {saveMsg && <span className="text-xs text-[#24a148] font-semibold">{saveMsg}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ══ DOWNLOAD PANEL ═════════════════════════════════════════════ */}
      {panel === 'download' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-carbon-gray-20 px-5 py-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-[#d0e2ff] flex items-center justify-center flex-shrink-0 text-lg">
                📋
              </div>
              <div>
                <h3 className="text-sm font-semibold text-carbon-gray-100">Postman Environment</h3>
                <p className="text-xs text-carbon-gray-50 mt-0.5">
                  Generated from current config — {scenario.firstName} {scenario.lastName},{' '}
                  {editMode} mode. Import into Postman Desktop alongside the collection.
                </p>
              </div>
            </div>
            <div className="text-2xs font-mono text-carbon-gray-50 bg-carbon-gray-10 px-3 py-2 mb-4 space-y-0.5">
              <div>
                patientId: <strong>{scenario.platformId}</strong>
              </div>
              <div>
                cptCode: <strong>{scenario.cptCode}</strong>
              </div>
              <div>
                mode: <strong>{editMode}</strong>
              </div>
              <div>
                fhirGatewayBase:{' '}
                <strong>{editMode === 'mock' ? '(mock)' : editFhirGateway || '—'}</strong>
              </div>
            </div>
            <button
              onClick={downloadEnv}
              className="w-full px-4 py-2.5 bg-[#0043ce] text-white text-xs font-bold hover:bg-[#002d9c] transition-colors"
            >
              ⬇ Download Environment JSON
            </button>
          </div>

          <div className="bg-white border border-carbon-gray-20 px-5 py-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-[#defbe6] flex items-center justify-center flex-shrink-0 text-lg">
                📦
              </div>
              <div>
                <h3 className="text-sm font-semibold text-carbon-gray-100">Postman Collection</h3>
                <p className="text-xs text-carbon-gray-50 mt-0.5">
                  Filtered to {activeCount} active scope{activeCount !== 1 ? 's' : ''}. All requests
                  use <code className="font-mono text-2xs">{'{{variables}}'}</code> — no hardcoded
                  values.
                </p>
              </div>
            </div>
            <div className="text-2xs font-mono text-carbon-gray-50 bg-carbon-gray-10 px-3 py-2 mb-4 space-y-0.5">
              {MANDATE_SECTIONS.map((s) => (
                <div key={s.key}>
                  <span
                    className={
                      editScopes[s.key] ? 'text-[#24a148]' : 'line-through text-carbon-gray-30'
                    }
                  >
                    {editScopes[s.key] ? '✓' : '✗'} {s.label}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={downloadCollection}
              className="w-full px-4 py-2.5 bg-[#24a148] text-white text-xs font-bold hover:bg-[#198038] transition-colors"
            >
              ⬇ Download Collection JSON
            </button>
          </div>

          <div className="md:col-span-2 bg-[#f0f4ff] border border-[#97c1ff] px-4 py-3 text-xs text-[#0043ce]">
            <strong>CLI runner:</strong>{' '}
            <code className="font-mono bg-white px-2 py-0.5 border border-[#97c1ff]">
              npm run test:contract
            </code>{' '}
            runs the collection with the local mock environment. For production:{' '}
            <code className="font-mono bg-white px-2 py-0.5 border border-[#97c1ff]">
              newman run tools/contract/cms0057f.postman_collection.json -e
              tools/contract/production.postman_environment.json
            </code>
          </div>
        </div>
      )}

      {/* ══ RUN PANEL ══════════════════════════════════════════════════ */}
      {panel === 'run' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={runCollection}
              disabled={running}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0f62fe] text-white text-xs font-bold hover:bg-[#0043ce] disabled:opacity-50 transition-colors"
            >
              {running ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />{' '}
                  Running…
                </>
              ) : (
                '▶ Run Collection'
              )}
            </button>
            {!running && results.length > 0 && (
              <button
                onClick={() => {
                  setResults([]);
                  setSummary(null);
                }}
                className="text-2xs text-carbon-gray-50 underline hover:text-carbon-gray-100"
              >
                Clear results
              </button>
            )}
            <span className="text-2xs text-carbon-gray-50">
              {scenario.firstName} {scenario.lastName} · {editMode} mode · {activeCount} scopes
            </span>
          </div>

          {/* Summary bar */}
          {summary && (
            <div
              className={`flex items-center gap-4 px-4 py-3 text-xs font-semibold border ${
                summary.failed === 0
                  ? 'bg-[#defbe6] border-[#a7f0ba] text-[#0e6027]'
                  : 'bg-[#fff1f1] border-[#ffb3b8] text-[#da1e28]'
              }`}
            >
              <span>
                {summary.failed === 0
                  ? '✅ All tests passed'
                  : `❌ ${summary.failed} test${summary.failed !== 1 ? 's' : ''} failed`}
              </span>
              <span>✓ {summary.passed} passed</span>
              {summary.failed > 0 && <span>✗ {summary.failed} failed</span>}
              <span className="ml-auto text-carbon-gray-50">
                {(summary.totalMs / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          {/* Live results */}
          <div className="bg-[#161616] rounded text-xs font-mono overflow-auto max-h-[480px] p-3 space-y-1">
            {results.length === 0 && !running && (
              <p className="text-carbon-gray-50">
                Click Run Collection to execute all {activeCount} mandate section
                {activeCount !== 1 ? 's' : ''}…
              </p>
            )}
            {results.map((r, i) => {
              if (r.type === 'start')
                return (
                  <div key={i} className="text-[#42be65]">
                    ▶ Starting: {r.patient} · {r.mode} mode
                  </div>
                );
              if (r.type === 'request')
                return (
                  <div key={i} className="text-[#78a9ff] mt-1">
                    [{r.index}/{r.total}] {r.method} {r.name}
                  </div>
                );
              if (r.type === 'result') {
                const allPass = (r.failed ?? 0) === 0;
                return (
                  <div key={i} className="ml-3">
                    <span className={allPass ? 'text-[#42be65]' : 'text-[#ff8389]'}>
                      {allPass ? '✓' : '✗'}{' '}
                    </span>
                    <span className="text-white">{r.name}</span>
                    <span className="text-[#8d8d8d] ml-2">
                      {r.status ?? '—'} · {r.latencyMs != null ? `${r.latencyMs}ms` : '—'}
                      {r.passed != null
                        ? ` · ${r.passed}/${(r.passed ?? 0) + (r.failed ?? 0)} tests`
                        : ''}
                    </span>
                    {(r.assertions ?? [])
                      .filter((a) => !a.passed)
                      .map((a, ai) => (
                        <div key={ai} className="ml-4 text-[#ff8389] text-2xs">
                          ✗ {a.name}
                          {a.error ? `: ${a.error}` : ''}
                        </div>
                      ))}
                  </div>
                );
              }
              if (r.type === 'done')
                return (
                  <div key={i} className="text-[#42be65] mt-2 border-t border-[#393939] pt-2">
                    ✅ Done — {r.passed} passed · {r.failed} failed ·{' '}
                    {((r.totalMs ?? 0) / 1000).toFixed(1)}s
                  </div>
                );
              if (r.type === 'error')
                return (
                  <div key={i} className="text-[#ff8389]">
                    ❌ {r.message}
                  </div>
                );
              return null;
            })}
            {running && <div className="text-[#8d8d8d] animate-pulse">…</div>}
            <div ref={resultsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
