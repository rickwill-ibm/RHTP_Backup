'use client';

/**
 * Interactive Financial Clearance runner (interactive thread + stage-3 handoff).
 *
 * Lets a reviewer pick an order + provider and run the thread live through the
 * BFF (`/api/financial-clearance`). Renders the result, links to the persisted
 * Evidence Record, and — when PA is required — offers the stage-3 handoff into
 * the existing Prior-Authorization (CRD → DTR → PAS) screens.
 * Passes activePatientId from context so the clearance runs for the selected patient.
 */
import { useState } from 'react';
import { postJson } from '@/lib/client/bff';
import type { MedicalNecessityVM } from '@/lib/goldenThread';
import { MedicalNecessityPanel } from './MedicalNecessityPanel';
import { useDemoStore } from '@/uhg/store/demoStore';

interface RunResult {
  evidenceId: string;
  memberId: string;
  netRequiresPA: boolean;
  netOutcome: string;
  eligibility: { payer: string; plan?: string; note: string };
  medicalNecessity: MedicalNecessityVM;
  estimate: { memberResponsibility: number; planPays: number };
  workItem: { queue: string; slaHours: number; dueBy: string; note: string };
}

const PROVIDERS = [
  { npi: '1730154783', label: 'Provider A (gold-carded)' },
  { npi: '1518998765', label: 'Provider B (not gold-carded)' },
];

export function FinancialClearanceRunner(): React.ReactElement {
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const [orderCode, setOrderCode] = useState('72148');
  const [providerNpi, setProviderNpi] = useState(PROVIDERS[0].npi);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setRunning(true);
    setError(null);
    const r = await postJson<RunResult>('/api/financial-clearance', {
      orderCode,
      providerNpi,
      patientId: activePatientId,
    });
    if (r.ok && r.data) setResult(r.data);
    else setError(r.error?.issue?.[0]?.diagnostics ?? 'Run failed');
    setRunning(false);
  }

  return (
    <section
      className="space-y-4 rounded-lg border border-slate-300 p-4"
      aria-label="Run financial clearance"
    >
      <h2 className="text-lg font-semibold">Run a clearance</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-600">Order code (CPT/HCPCS)</span>
          <input
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={orderCode}
            onChange={(e) => setOrderCode(e.target.value.trim())}
            aria-label="Order code"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Ordering provider</span>
          <select
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={providerNpi}
            onChange={(e) => setProviderNpi(e.target.value)}
            aria-label="Ordering provider"
          >
            {PROVIDERS.map((p) => (
              <option key={p.npi} value={p.npi}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run clearance'}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-3">
          <div className="rounded border border-slate-200 bg-slate-50 p-2 text-sm">
            <span className="font-medium">
              {result.netRequiresPA ? 'PA required' : 'No PA required'}
            </span>{' '}
            · {result.netOutcome} · {result.eligibility.note}
          </div>
          <MedicalNecessityPanel vm={result.medicalNecessity} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a
              className="rounded border border-slate-300 px-2 py-1 text-blue-700 hover:bg-slate-50"
              href={`/evidence/${encodeURIComponent(result.evidenceId)}`}
            >
              View Evidence Record
            </a>
            {result.netRequiresPA ? (
              <a
                className="rounded bg-amber-500 px-3 py-1 font-medium text-white hover:bg-amber-600"
                href={`/prior-auth?order=${encodeURIComponent(orderCode)}&evidence=${encodeURIComponent(result.evidenceId)}`}
              >
                Proceed to Prior Authorization (stage 3) →
              </a>
            ) : (
              <span className="rounded bg-green-100 px-2 py-1 text-green-800">
                Cleared — routed to {result.workItem.queue}
              </span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
