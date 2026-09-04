'use client';
/**
 * Payer-to-Payer Data Exchange — CMS-0057-F §3
 *
 * Full CMS-compliant screen demonstrating the complete P2P workflow:
 *   1. Member identity pre-populated from activePatientId (consent captured)
 *   2. $member-match identity resolution against prior payer
 *   3. Async FHIR Bulk Data export (start → poll)
 *   4. 5-year resource inventory display (EOB, Coverage, PA history, clinical)
 *   5. Import-to-Member-360 closure with concrete clinical consequence
 *
 * Mock/prod switch: ALLOW_DEV_MOCK_AUTH=false + BULK_GATEWAY_BASE env var → live mode.
 */
import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getAllRegistryPatients } from '@/lib/services/patientService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BulkStatusResult {
  state: string;
  completedAt?: string;
  priorPayer?: string;
  memberMatchedId?: string;
  coveragePeriod?: { start: string; end: string };
  fileUrls?: string[];
  resourceCounts?: Record<string, number>;
  paHistory?: Array<{
    service: string;
    cpt: string;
    decision: string;
    denialReason?: string;
    authNumber?: string;
    date: string;
  }>;
  newConditionsAdded?: number;
  coverageGapsResolved?: number;
}

type Step = 'consent' | 'matching' | 'exporting' | 'importing' | 'complete';

const STEP_ORDER: Step[] = ['consent', 'matching', 'exporting', 'importing', 'complete'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIOR_PAYER_MAP: Record<string, string> = {
  MARIA_SD_001: 'Aetna Medicaid SD',
  'PAT-0042': 'UnitedHealthcare Community Plan MO',
  'PAT-0087': 'Molina Healthcare of South Dakota',
  'PAT-0103': 'Anthem BCBS South Dakota',
  'PAT-0156': 'Meridian Health Plan SD',
};

const RESOURCE_LABELS: Record<string, string> = {
  ExplanationOfBenefit: 'Explanation of Benefit (EOB)',
  Coverage: 'Coverage',
  Claim: 'Claim',
  ClaimResponse: 'ClaimResponse (PA history)',
  Condition: 'Condition',
  MedicationRequest: 'Medication Request',
  Observation: 'Observation',
  Procedure: 'Procedure',
  Encounter: 'Encounter',
  // USCDI v3 additions required by CMS-0057-F §422.120(a)(2)
  AllergyIntolerance: 'Allergy Intolerance (USCDI v3)',
  Immunization: 'Immunization (USCDI v3)',
  Patient: 'Patient Demographics',
};

function stepIndex(s: Step) {
  return STEP_ORDER.indexOf(s);
}

function StepDot({ step, current }: { step: Step; current: Step }) {
  const idx = stepIndex(step);
  const cur = stepIndex(current);
  const done = idx < cur;
  const active = idx === cur;
  return (
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
        done
          ? 'bg-[#198038] text-white'
          : active
            ? 'bg-[#1669c1] text-white ring-2 ring-[#1669c1]/30'
            : 'bg-gray-100 text-gray-400'
      }`}
    >
      {done ? '✓' : idx + 1}
    </div>
  );
}

const STEP_LABELS: Record<Step, string> = {
  consent: 'Consent Captured',
  matching: '$member-match Identity Resolution',
  exporting: 'Bulk Data Export',
  importing: 'Import to Member 360',
  complete: 'Exchange Complete',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PayerToPayerPage(): React.ReactElement {
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const patients = getAllRegistryPatients();
  const patient = patients.find((p) => p.platformId === activePatientId) ?? patients[0];

  const [currentStep, setCurrentStep] = useState<Step>('consent');
  const [jobId, setJobId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [statusResult, setStatusResult] = useState<BulkStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when patient changes
  useEffect(() => {
    setCurrentStep('consent');
    setJobId(null);
    setPatientId(null);
    setStatusResult(null);
    setError(null);
  }, [activePatientId]);

  const priorPayer = PRIOR_PAYER_MAP[activePatientId] ?? 'Prior Payer';

  async function startExchange() {
    setLoading(true);
    setError(null);
    setCurrentStep('matching');
    try {
      const res = await fetch('/api/bulk/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priorPayer,
          patientId: activePatientId,
          memberMatch: {
            resourceType: 'Parameters',
            parameter: [
              { name: 'MemberPatient', resource: { resourceType: 'Patient', id: activePatientId } },
            ],
          },
        }),
      });
      const data = (await res.json()) as { jobId?: string; patientId?: string };
      if (!res.ok || !data.jobId) throw new Error('Export start failed');
      setJobId(data.jobId);
      setPatientId(data.patientId ?? activePatientId);
      setCurrentStep('exporting');
    } catch (e) {
      setError(String(e));
      setCurrentStep('consent');
    } finally {
      setLoading(false);
    }
  }

  async function pollStatus() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const pid = encodeURIComponent(patientId ?? activePatientId);
      const res = await fetch(
        `/api/bulk/status?jobId=${encodeURIComponent(jobId)}&patientId=${pid}`
      );
      const data = (await res.json()) as BulkStatusResult;
      if (!res.ok) throw new Error('Status poll failed');
      setStatusResult(data);
      if (data.state === 'completed') {
        setCurrentStep('importing');
        // Auto-advance to complete after brief delay (simulate import)
        setTimeout(() => setCurrentStep('complete'), 1200);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const totalResources = statusResult?.resourceCounts
    ? Object.values(statusResult.resourceCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1100px] px-6 py-6 pb-24">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white rounded-xl px-6 pt-5 pb-0 mb-6 shadow-sm">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                  CMS-0057-F
                </span>
                <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">
                  §3 — Payer-to-Payer API
                </span>
                <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">
                  Da Vinci PDex · FHIR Bulk 2.0
                </span>
              </div>
              <h1 className="text-lg font-bold text-gray-900">Payer-to-Payer Data Exchange</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                5-year USCDI v3 data transfer · $member-match identity resolution · Async FHIR Bulk
                2.0 export · 1 business day SLA (§422.120)
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                Member: <span className="text-gray-800">{patient.name}</span>
              </span>
            </div>
          </div>

          {/* Progress timeline */}
          <div className="flex items-center gap-0 pb-0 overflow-x-auto">
            {STEP_ORDER.map((step, i) => (
              <div key={step} className="flex items-center gap-0">
                <div
                  className={`flex items-center gap-2 px-3 py-3 border-b-[3px] transition-colors whitespace-nowrap ${
                    currentStep === step
                      ? 'border-[#1669c1]'
                      : stepIndex(currentStep) > i
                        ? 'border-[#198038]'
                        : 'border-transparent'
                  }`}
                >
                  <StepDot step={step} current={currentStep} />
                  <span
                    className={`text-xs font-semibold ${
                      currentStep === step
                        ? 'text-[#1669c1]'
                        : stepIndex(currentStep) > i
                          ? 'text-[#198038]'
                          : 'text-gray-400'
                    }`}
                  >
                    {STEP_LABELS[step]}
                  </span>
                </div>
                {i < STEP_ORDER.length - 1 && <span className="text-gray-200 text-sm px-1">›</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: member identity + controls */}
          <div className="space-y-4">
            {/* Member identity card */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Member Identity
                </p>
              </div>
              <div className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Name</span>
                  <span className="font-semibold text-gray-900 text-xs">{patient.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">DOB</span>
                  <span className="font-mono text-xs text-gray-700">{patient.dob}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Platform ID</span>
                  <span className="font-mono text-xs text-gray-700">{patient.platformId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Current Payer</span>
                  <span className="font-semibold text-xs text-gray-900">{patient.contract}</span>
                </div>
                <div className="border-t border-gray-100 pt-2 mt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    Prior Payer
                  </p>
                  <p className="text-xs font-semibold text-gray-900">{priorPayer}</p>
                </div>
              </div>
            </div>

            {/* Consent card */}
            <div className="rounded-xl border border-[#198038]/30 bg-[#defbe6]/40 shadow-sm p-4">
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-[#198038] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-[9px] font-bold">✓</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#044317]">Consent Captured</p>
                  <p className="text-[11px] text-[#044317]/70 mt-0.5">
                    Member has authorized payer-to-payer data exchange per CMS-0057-F §3. Consent
                    reference: <span className="font-mono">CNS-{activePatientId}-P2P</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <button
                onClick={startExchange}
                disabled={loading || currentStep !== 'consent'}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1669c1] px-4 py-3 text-sm font-bold text-white hover:bg-[#0f52a0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading && currentStep === 'matching' ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  '→'
                )}
                {loading && currentStep === 'matching' ? 'Resolving Identity…' : 'Start Exchange'}
              </button>
              <button
                onClick={pollStatus}
                disabled={loading || !jobId || currentStep === 'complete'}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading && currentStep === 'exporting' ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                ) : (
                  '↻'
                )}
                {loading && currentStep === 'exporting' ? 'Polling…' : 'Refresh Status'}
              </button>
              {currentStep !== 'consent' && (
                <button
                  onClick={() => {
                    setCurrentStep('consent');
                    setJobId(null);
                    setPatientId(null);
                    setStatusResult(null);
                    setError(null);
                  }}
                  className="w-full text-xs text-gray-400 hover:text-gray-700 py-1 transition-colors"
                >
                  Reset exchange
                </button>
              )}
            </div>

            {jobId && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Job ID
                </p>
                <p className="font-mono text-[11px] text-gray-700 break-all">{jobId}</p>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-bold text-red-700">Exchange Error</p>
                <p className="text-[11px] text-red-600 mt-0.5">{error}</p>
              </div>
            )}
          </div>

          {/* Right: results panel */}
          <div className="lg:col-span-2 space-y-4">
            {!statusResult && currentStep === 'consent' && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[200px]">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <span className="text-2xl">⇄</span>
                </div>
                <p className="text-sm font-semibold text-gray-700">Ready to initiate exchange</p>
                <p className="text-xs text-gray-400 max-w-sm">
                  CMS-0057-F §3 requires transfer of 5 years of ExplanationOfBenefit, Coverage,
                  prior authorization history, and clinical data from the prior payer. Click{' '}
                  <strong>Start Exchange</strong> to begin.
                </p>
              </div>
            )}

            {(currentStep === 'matching' || currentStep === 'exporting') && !statusResult && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 shadow-sm p-6">
                <p className="text-sm font-bold text-blue-800 mb-1">
                  {currentStep === 'matching'
                    ? '$member-match in progress…'
                    : 'Bulk export running…'}
                </p>
                <p className="text-xs text-blue-600">
                  {currentStep === 'matching'
                    ? `Resolving ${patient.name}'s identity at ${priorPayer} using FHIR $member-match (Da Vinci PDex). Matching on demographics + prior coverage identifiers.`
                    : 'Async FHIR Bulk Data export initiated. CMS-0057-F requires status polling — click Refresh Status to check progress.'}
                </p>
                <div className="mt-3 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                  <div className="h-full bg-[#1669c1] rounded-full animate-pulse w-1/3" />
                </div>
              </div>
            )}

            {statusResult && (
              <>
                {/* Export summary */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      5-Year Export Summary
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#defbe6] text-[#044317] text-[10px] font-bold px-2 py-0.5">
                        {statusResult.state === 'completed' ? '✓ Completed' : statusResult.state}
                      </span>
                      {statusResult.completedAt && (
                        <span className="text-[10px] text-gray-400">
                          {new Date(statusResult.completedAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Prior Payer
                        </p>
                        <p className="text-xs font-semibold text-gray-900 mt-0.5">
                          {statusResult.priorPayer}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Coverage Period
                        </p>
                        <p className="text-xs font-semibold text-gray-900 mt-0.5">
                          {statusResult.coveragePeriod?.start} → {statusResult.coveragePeriod?.end}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Total Resources
                        </p>
                        <p className="text-2xl font-bold text-[#1669c1] leading-none mt-1">
                          {totalResources.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Resource type grid */}
                    {statusResult.resourceCounts && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                          Resource Type Inventory (FHIR R4)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {Object.entries(statusResult.resourceCounts).map(([type, count]) => (
                            <div
                              key={type}
                              className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 border border-gray-100"
                            >
                              <span className="text-[11px] text-gray-600">
                                {RESOURCE_LABELS[type] ?? type}
                              </span>
                              <span className="text-xs font-bold text-gray-900">
                                {count.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* PA History transferred */}
                {statusResult.paHistory && statusResult.paHistory.length > 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Prior Authorization History Transferred
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        CMS-0057-F §3 — denial reasons and auth numbers must transfer with the
                        record
                      </p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {statusResult.paHistory.map((pa, i) => (
                        <div key={i} className="flex items-start gap-3 px-4 py-3">
                          <span
                            className={`mt-0.5 flex-shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase ${
                              pa.decision === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {pa.decision}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-900">{pa.service}</p>
                            <p className="text-[11px] text-gray-500">
                              CPT {pa.cpt} · {pa.date}
                            </p>
                            {pa.denialReason && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                Denial reason: {pa.denialReason}
                              </p>
                            )}
                            {pa.authNumber && (
                              <p className="text-[11px] text-green-700 mt-0.5">
                                Auth #: {pa.authNumber}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Import impact */}
                {currentStep === 'complete' && (
                  <div className="rounded-xl border border-[#198038]/30 bg-[#defbe6]/40 shadow-sm p-4">
                    <p className="text-sm font-bold text-[#044317] mb-2">
                      ✓ Imported to Member 360
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/60 rounded-lg p-3 border border-[#198038]/20">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#198038]">
                          Conditions Added
                        </p>
                        <p className="text-2xl font-bold text-[#044317]">
                          +{statusResult.newConditionsAdded ?? 0}
                        </p>
                        <p className="text-[11px] text-[#044317]/70">
                          New diagnoses from prior payer record
                        </p>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 border border-[#198038]/20">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#198038]">
                          Coverage Gaps Resolved
                        </p>
                        <p className="text-2xl font-bold text-[#044317]">
                          {statusResult.coverageGapsResolved ?? 0}
                        </p>
                        <p className="text-[11px] text-[#044317]/70">
                          Gaps closed by imported history
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#044317]/70 mt-3">
                      Prior authorization denial history (
                      {statusResult.paHistory?.filter((p) => p.decision === 'denied').length ?? 0}{' '}
                      denied) transferred and linked to current care plan. Step therapy history
                      available for current PA decisions.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
