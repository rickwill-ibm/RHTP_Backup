'use client';

/**
 * RecoveryDecisionPanel — Wave-5 UI. The reviewer's HITL control for a proposed
 * recovery appeal. Approve / Reject POSTs to the REAL endpoint
 * `POST /api/recovery/{id}/decision` and renders the REAL outcome or the REAL
 * error — no faked success, no optimistic UI implying a transmission occurred.
 *
 * HONESTY:
 *  - `decidedBy` is set server-side from the authenticated principal; this panel
 *    NEVER sends a decider identity.
 *  - An approved appeal's submission is a MOCK, not-transmitted receipt behind the
 *    fail-closed real-EDI seam — the success copy says so explicitly.
 *  - The decision runs via reconstruct-and-signal (re-execute the deterministic
 *    workflow on a fresh engine to its suspension, then signal the decision) — NOT
 *    a durable Temporal resume. Stated in the caption.
 *  - Any endpoint error (401/403/404/409/500) is surfaced verbatim-ish.
 *
 * PHI DISCIPLINE: `recoveryId` is needed to address the endpoint but is NEVER
 * rendered into the DOM (it embeds a member reference — a known prototype residual
 * that the production plan replaces with an opaque server-issued handle). The panel
 * holds it only to build the request URL.
 */
import { useState } from 'react';

type Phase = 'idle' | 'working' | 'done' | 'error';

interface Outcome {
  outcome: 'submitted' | 'rejected';
  submissionRef?: string;
}

export function RecoveryDecisionPanel({
  recoveryId,
  filingDeadline,
}: {
  recoveryId: string;
  filingDeadline?: string;
}): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<Outcome | null>(null);
  const [error, setError] = useState<string>('');

  async function decide(decision: 'approved' | 'rejected'): Promise<void> {
    setPhase('working');
    setError('');
    try {
      const res = await fetch(`/api/recovery/${encodeURIComponent(recoveryId)}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': `ui::${Date.now()}` },
        body: JSON.stringify({ decision }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(messageFromError(json, res.status));
        setPhase('error');
        return;
      }
      const o = json as Outcome;
      setResult({
        outcome: o.outcome,
        ...(o.submissionRef ? { submissionRef: o.submissionRef } : {}),
      });
      setPhase('done');
    } catch {
      setError('Could not reach the decision endpoint.');
      setPhase('error');
    }
  }

  if (phase === 'done' && result) {
    const submitted = result.outcome === 'submitted';
    return (
      <div
        className={`rounded-lg border p-4 text-sm ${
          submitted
            ? 'border-carbon-green bg-carbon-green-light'
            : 'border-carbon-gray-20 bg-carbon-gray-10'
        }`}
        role="status"
        aria-live="polite"
      >
        <p className="font-semibold">
          {submitted ? 'Appeal approved & submission recorded' : 'Recovery rejected (terminal)'}
        </p>
        {submitted ? (
          <p className="mt-1 text-carbon-gray-70">
            The governed agent ran its post-approval submission step. This is a{' '}
            <span className="font-semibold">MOCK receipt — not transmitted end-to-end</span>. A real
            837/appeal EDI transmission is a fail-closed seam that throws in production until wired.
            {result.submissionRef ? (
              <>
                {' '}
                Receipt reference: <span className="font-mono">{result.submissionRef}</span>.
              </>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-carbon-gray-70">
            No payer-facing action was taken. The recovery is now terminal and will not be
            re-proposed.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-carbon-gray-20 p-4">
      <p className="text-sm font-semibold">Reviewer decision</p>
      <p className="mt-1 text-xs text-carbon-gray-50">
        A payer-facing submission is human-gated regardless of authority rung. Approving runs the
        governed agent&apos;s submission step via reconstruct-and-signal (re-executing the
        deterministic workflow, then signalling this decision) — not a durable resume. The decider
        is taken from your authenticated session.
        {filingDeadline ? (
          <>
            {' '}
            Appeal window closes <span className="font-medium">{filingDeadline.slice(0, 10)}</span>;
            an approval after that returns a timely-filing conflict.
          </>
        ) : null}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => decide('approved')}
          disabled={phase === 'working'}
          className="rounded bg-carbon-blue px-4 py-1.5 text-sm font-medium text-white hover:bg-carbon-blue-hover disabled:opacity-50"
        >
          {phase === 'working' ? 'Working…' : 'Approve & submit appeal'}
        </button>
        <button
          type="button"
          onClick={() => decide('rejected')}
          disabled={phase === 'working'}
          className="rounded border border-carbon-gray-20 bg-white px-4 py-1.5 text-sm font-medium text-carbon-gray-70 hover:bg-carbon-gray-10 disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {phase === 'error' ? (
        <p
          className="mt-3 rounded border border-[#ffb3b8] bg-carbon-red-light p-2 text-xs text-carbon-red"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Extract a human message from a FHIR OperationOutcome error body (PHI-safe). */
function messageFromError(json: unknown, status: number): string {
  const oo = json as { issue?: { diagnostics?: string; details?: { text?: string } }[] } | null;
  const issue = oo?.issue?.[0];
  const msg = issue?.diagnostics ?? issue?.details?.text;
  return msg ? `${msg} (HTTP ${status})` : `Decision was refused (HTTP ${status}).`;
}
