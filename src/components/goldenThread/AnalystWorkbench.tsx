'use client';

/**
 * AnalystWorkbench — Wave-10 LIVE-WIRED analyst surface. A THIN client over the REAL
 * backend: it does NO analysis of its own — it drives the actual engine and renders
 * exactly what the endpoints return.
 *
 *  - RUN  → GET /api/evidence/{id}?party={p}&analysis={a}  (Wave-8 curated, gated analysis
 *           run over the party-scoped projection + the Wave-7 routed escalation).
 *  - APPROVE → POST /api/recovery/{id}-recovery/action     (Wave-9 governed action + the
 *           durable ticket lifecycle; the reviewer is the qualified-human decider).
 *
 * The presentational half (response types + render components) lives in
 * `./AnalystWorkbenchResult`; this module owns the state + the fetch handlers. Everything
 * rendered comes FROM the response, never hardcoded, and the honest states are surfaced
 * truthfully (OK-but-empty, plan-rejected, eval-rejected, auth/flag/network error).
 *
 * REUSE / DISCIPLINE: no '@/lib/evidence' barrel is imported (it pulls node:crypto into the
 * client bundle) — the analyses list + the record id arrive as PLAIN props from the server
 * page. PHI: `recordId` embeds a member reference, so it is held ONLY to build request URLs
 * and is NEVER rendered.
 */
import { useState } from 'react';
import {
  RunResult,
  governedActionFor,
  messageFromError,
  type AnalysisAction,
  type AnalysisRun,
  type ActionOutcome,
  type ActPhase,
  type Party,
  type WorkbenchAnalysis,
} from './AnalystWorkbenchResult';

// Re-export the public surface the server page + tests import from this entry module.
export { governedActionFor };
export type { WorkbenchAnalysis };

type Phase = 'idle' | 'running' | 'ran' | 'error';

export function AnalystWorkbench({
  recordId,
  analyses,
  initialParty = 'payer',
}: {
  recordId: string;
  analyses: WorkbenchAnalysis[];
  initialParty?: Party;
}): React.ReactElement {
  const [party, setParty] = useState<Party>(initialParty);
  const inScope = analyses.filter((a) => a.party === 'both' || a.party === party);
  const [analysisId, setAnalysisId] = useState<string>(inScope[0]?.id ?? '');

  const [phase, setPhase] = useState<Phase>('idle');
  const [run, setRun] = useState<AnalysisRun | null>(null);
  // FIX-2: whether the analyzed record carries a PERSISTED recovery draft (the routed queue
  // item is non-null only then). The governed Approve targets that recovery, so it is offered
  // ONLY when one exists — never over a seed skeleton whose Approve would 404 (mirrors how
  // golden-thread surfaces its decision only for a real, persisted recovery).
  const [hasRecovery, setHasRecovery] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [actPhase, setActPhase] = useState<ActPhase>('idle');
  const [actResult, setActResult] = useState<ActionOutcome | null>(null);
  const [actError, setActError] = useState<string>('');

  function resetAction(): void {
    setActPhase('idle');
    setActResult(null);
    setActError('');
  }
  function resetRun(): void {
    setPhase('idle');
    setRun(null);
    setHasRecovery(false);
    setError('');
    resetAction();
  }
  // Switching party invalidates any prior run and resets the picker to an in-scope analysis.
  function chooseParty(next: Party): void {
    setParty(next);
    const scoped = analyses.filter((a) => a.party === 'both' || a.party === next);
    if (!scoped.some((a) => a.id === analysisId)) setAnalysisId(scoped[0]?.id ?? '');
    resetRun();
  }

  async function runAnalysis(): Promise<void> {
    setPhase('running');
    resetAction();
    setError('');
    try {
      const url = `/api/evidence/${encodeURIComponent(recordId)}?party=${party}&analysis=${encodeURIComponent(analysisId)}`;
      const res = await fetch(url, { headers: { 'x-correlation-id': `wb::${Date.now()}` } });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(messageFromError(json, res.status));
        setPhase('error');
        return;
      }
      const parsed = json as {
        analysis?: AnalysisRun;
        routedEscalation?: { queueItem?: unknown };
      } | null;
      const analysis = parsed?.analysis;
      if (!analysis) {
        setError('The endpoint returned no analysis (the flag/party gate is closed).');
        setPhase('error');
        return;
      }
      // A routed queue item exists ONLY when the analyzed record carries a recovery draft —
      // the exact precondition the governed Approve needs (else it would 404 on the store).
      setHasRecovery(parsed?.routedEscalation?.queueItem != null);
      setRun(analysis);
      setPhase('ran');
    } catch {
      setError('Could not reach the evidence endpoint.');
      setPhase('error');
    }
  }

  async function approve(action: AnalysisAction): Promise<void> {
    setActPhase('working');
    setActError('');
    const gov = governedActionFor(action.actionType);
    try {
      const res = await fetch(`/api/recovery/${encodeURIComponent(recordId)}-recovery/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': `wb::${Date.now()}` },
        body: JSON.stringify({ actionType: gov.type, decision: 'approved' }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setActError(messageFromError(json, res.status));
        setActPhase('error');
        return;
      }
      const o = json as ActionOutcome;
      setActResult({
        outcome: o.outcome,
        actionType: o.actionType,
        ...(o.rung ? { rung: o.rung } : {}),
        ...(typeof o.isSubmission === 'boolean' ? { isSubmission: o.isSubmission } : {}),
        ...(o.ref ? { ref: o.ref } : {}),
      });
      setActPhase('done');
    } catch {
      setActError('Could not reach the governed-action endpoint.');
      setActPhase('error');
    }
  }

  // Lens accent (payer=blue, provider=green) — class literals kept here (a scanned component).
  const partyAccent: Record<Party, string> = {
    payer: 'bg-carbon-blue',
    provider: 'bg-carbon-green',
  };
  const activeAnalysis = inScope.find((a) => a.id === analysisId);

  return (
    <section className="overflow-hidden rounded-lg border border-carbon-gray-20 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-carbon-gray-20 bg-carbon-gray-10 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Analyst Workbench</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-carbon-green-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-carbon-green">
              <span className="h-1.5 w-1.5 rounded-full bg-carbon-green" /> live-wired
            </span>
          </div>
          <p className="mt-0.5 max-w-2xl text-xs text-carbon-gray-60">
            A thin client over the real engine: Run calls the Wave-8 analysis endpoint and renders
            exactly what it returns; Approve triggers the Wave-9 governed action. Nothing here is
            curated front-end data.
          </p>
        </div>
        {/* Party lens — segmented control */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Lens
          </span>
          <div
            className="inline-flex rounded-md border border-carbon-gray-20 bg-white p-0.5"
            role="group"
            aria-label="party lens"
          >
            {(['payer', 'provider'] as Party[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => chooseParty(p)}
                aria-pressed={party === p}
                className={`rounded px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                  party === p
                    ? `${partyAccent[p]} text-white`
                    : 'text-carbon-gray-70 hover:bg-carbon-gray-10'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="space-y-4 p-4">
        {/* Control bar — analysis picker + Run */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
          <label className="flex flex-1 flex-col text-sm">
            <span className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-50">
              Analysis
            </span>
            <select
              value={analysisId}
              onChange={(e) => {
                setAnalysisId(e.target.value);
                resetRun();
              }}
              className="rounded border border-carbon-gray-20 bg-white px-2 py-1.5 text-sm"
            >
              {inScope.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={phase === 'running' || !analysisId}
            className="rounded bg-carbon-blue px-4 py-2 text-sm font-semibold text-white hover:bg-carbon-blue-hover disabled:opacity-50"
          >
            {phase === 'running' ? 'Running…' : 'Run analysis'}
          </button>
        </div>
        {activeAnalysis ? (
          <p className="-mt-1 text-[11px] text-carbon-gray-50">
            Gated, party-scoped run over the persisted Evidence Record · {LENS_LABEL_INLINE[party]}{' '}
            lens.
          </p>
        ) : null}

        {phase === 'error' ? (
          <p
            className="rounded border border-[#ffb3b8] bg-carbon-red-light p-2 text-xs text-carbon-red"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {phase === 'ran' && run ? (
          <RunResult
            run={run}
            hasRecovery={hasRecovery}
            onApprove={approve}
            act={{ actPhase, actResult, actError }}
          />
        ) : null}

        {phase === 'idle' ? (
          <p className="rounded border border-dashed border-carbon-gray-20 p-4 text-center text-xs text-carbon-gray-50">
            Pick a party lens and an analysis, then <span className="font-semibold">Run</span> to
            execute the real gated analysis over the sealed Evidence Record.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Inline party labels for the run-scope caption (component-local; PHI-safe display only). */
const LENS_LABEL_INLINE: Record<Party, string> = {
  payer: 'payer / MCO',
  provider: 'provider',
};
