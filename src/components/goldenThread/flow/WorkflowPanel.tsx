'use client';
/**
 * WorkflowPanel — what a governed action ACTUALLY DOES, made visible. Renders the mock appeal-packet
 * ARTIFACT, a provenance-linked STATUS TIMELINE (each step → its sealed ledger seq), and the current
 * recipient CONTROLS (review → release → modelled response). Honesty is enforced in the copy: the
 * packet is "not transmitted", a submission is human-gated, segregation of duties is shown, and
 * "recovered $" appears ONLY after the modelled 835 posts on accept.
 *
 * CLIENT-SAFE: shared sim + pure workflow types only.
 */
import {
  APPEAL_REVIEWER_SEAT,
  APPEAL_RELEASER,
  type Workflow,
  type WfState,
  type WfStep,
} from '@/lib/goldenThread/workflow';
import { ROLE_LABEL, type OpsRole } from '@/lib/goldenThread/e2eFlow';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';

const usd = (n: number): string => `$${Math.round(n).toLocaleString()}`;
const seatLabel = (id: string): string =>
  (ROLE_LABEL as Record<string, string>)[id] ?? id.replace(/^human:/, '').replace(/-/g, ' ');

const STATE_LABEL: Record<WfState, string> = {
  assembling: 'Assembling packet',
  'awaiting-review': 'Awaiting review',
  'awaiting-release': 'Awaiting authorized release',
  released: 'Released',
  'awaiting-response': 'Released — awaiting payer response',
  accepted: 'Accepted — recovery posted',
  denied: 'Denied — routed to arbiter',
  rejected: 'Rejected internally',
};
const STATE_COLOR: Record<WfState, string> = {
  assembling: '#57534e',
  'awaiting-review': '#b45309',
  'awaiting-release': '#b45309',
  released: '#24427e',
  'awaiting-response': '#24427e',
  accepted: '#24a148',
  denied: '#da1e28',
  rejected: '#8d8d8d',
};

// Fixed demo actors so segregation-of-duties is visible (reviewer ≠ releaser)
const REVIEWER_BY = 'M.Cho';
const RELEASER_BY = 'provider-authorizer';

export function WorkflowPanel({ op, wf }: { op: OperatingSim; wf: Workflow }): React.ReactElement {
  return (
    <div className="ed-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="mono text-[10px] uppercase tracking-wide text-carbon-gray-50">
            {wf.id} · underpayment appeal · {wf.provider}
          </p>
          <h3 className="text-base">Payment dispute → {wf.payer}</h3>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ background: STATE_COLOR[wf.state] }}
        >
          {STATE_LABEL[wf.state]}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-carbon-gray-70">
        {wf.state === 'accepted' ? (
          <>
            <strong className="text-[#0e6027]">{usd(wf.recoveredUsd ?? 0)} recovered</strong> — a
            modelled 835 adjustment posted to contract.
          </>
        ) : wf.state === 'denied' ? (
          <>
            <strong className="text-[#b42318]">{usd(wf.amountUsd)} still in dispute</strong> —
            denied; escalated to the arbiter (appeal-of-appeal).
          </>
        ) : (
          <>
            <strong>{usd(wf.amountUsd)} in dispute</strong> — not yet recovered (recovery is
            asserted only when a modelled 835 posts).
          </>
        )}
      </p>

      {/* Status timeline */}
      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Workflow — provenance-linked to the ledger
        </p>
        <ol className="mt-2 space-y-2">
          {wf.steps.map((st, i) => (
            <TimelineStep key={st.key} st={st} active={activeStep(wf) === i} />
          ))}
        </ol>
      </div>

      {/* Current controls */}
      <div className="mt-3 rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2">
        {wf.state === 'awaiting-review' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-carbon-gray-70">
              {seatLabel(APPEAL_REVIEWER_SEAT)} ({REVIEWER_BY}) — review the drafted packet:
            </span>
            <button
              type="button"
              onClick={() => op.reviewAppeal(wf.id, REVIEWER_BY, true)}
              className="rounded bg-carbon-blue px-3 py-1 text-[11px] font-semibold text-white hover:bg-carbon-blue-hover"
            >
              Approve →
            </button>
            <button
              type="button"
              onClick={() => op.reviewAppeal(wf.id, REVIEWER_BY, false)}
              className="rounded border border-carbon-gray-30 px-2 py-1 text-[11px] text-carbon-gray-70 hover:bg-white"
            >
              Reject
            </button>
          </div>
        )}
        {wf.state === 'awaiting-release' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-carbon-gray-70">
              Authorized releaser ({RELEASER_BY}) — <strong>submission is human-gated</strong>;
              releaser ≠ reviewer (four-eyes):
            </span>
            <button
              type="button"
              onClick={() => op.releaseAppeal(wf.id, RELEASER_BY)}
              className="rounded bg-carbon-blue px-3 py-1 text-[11px] font-semibold text-white hover:bg-carbon-blue-hover"
            >
              Authorize + release to payer →
            </button>
          </div>
        )}
        {wf.state === 'awaiting-response' && (
          <p className="text-[11px] italic text-carbon-gray-60">
            Released to {wf.payer} (mock · not transmitted). Awaiting the modelled payer response —
            the run advances it.
          </p>
        )}
        {wf.state === 'accepted' && (
          <p className="text-[11px] text-[#0e6027]">
            ✓ Payer accepted — modelled 835 adjustment posted; {usd(wf.recoveredUsd ?? 0)}{' '}
            reprocessed to contract.
          </p>
        )}
        {wf.state === 'denied' && (
          <p className="text-[11px] text-[#b42318]">
            Payer denied — an arbiter (appeal-of-appeal) work-item was queued to State TPL / PI
            Recovery.
          </p>
        )}
        {wf.state === 'rejected' && (
          <p className="text-[11px] italic text-carbon-gray-50">
            Reviewer rejected the draft — nothing was released.
          </p>
        )}
      </div>

      {/* The artifact (mock, not transmitted) */}
      <div className="mt-3 rounded border border-carbon-gray-20 bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Artifact — {wf.artifact.title}
          </p>
          <span className="rounded border border-carbon-yellow bg-carbon-yellow-light px-1.5 py-0.5 text-[9px] text-[#b45309]">
            {wf.artifact.channelNote}
          </span>
        </div>
        <div className="mono mt-2 space-y-0.5 text-[10px] text-carbon-gray-60">
          {wf.artifact.headerLines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] text-carbon-gray-90">
          {wf.artifact.bodyLines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function activeStep(wf: Workflow): number {
  const i = wf.steps.findIndex((s) => !s.done);
  return i < 0 ? wf.steps.length : i;
}

function TimelineStep({ st, active }: { st: WfStep; active: boolean }): React.ReactElement {
  const kindTag =
    st.kind === 'agent'
      ? 'AGENT'
      : st.kind === 'submission'
        ? 'SUBMISSION'
        : st.kind === 'response'
          ? 'PAYER'
          : 'HUMAN';
  const kindColor =
    st.kind === 'submission'
      ? '#b45309'
      : st.kind === 'agent'
        ? '#0e7490'
        : st.kind === 'response'
          ? '#5b3fa3'
          : '#24427e';
  return (
    <li className="flex items-start gap-2">
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ background: st.done ? '#24a148' : active ? '#b45309' : '#c6c6c6' }}
      >
        {st.done ? '✓' : active ? '•' : ''}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="mono rounded px-1 py-0.5 text-[8px] font-bold text-white"
            style={{ background: kindColor }}
          >
            {kindTag}
          </span>
          <span
            className={`text-[11px] ${st.done ? 'text-carbon-gray-90' : active ? 'font-semibold text-carbon-gray-90' : 'text-carbon-gray-40'}`}
          >
            {st.label}
          </span>
        </div>
        {st.done && (
          <p className="mono text-[9px] text-carbon-gray-50">
            {seatLabel(st.actor ?? '')} · tick {st.tick} · sealed #{st.sealSeq}
            {st.note ? ` · ${st.note}` : ''}
          </p>
        )}
      </div>
    </li>
  );
}
