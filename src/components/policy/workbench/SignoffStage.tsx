'use client';

/**
 * Sign-off stage (Step 3) — maker/checker two-person gate. Extracted from PolicyDtrWorkbench for the
 * size cap; a thin renderer. The fail-closed gate itself lives in the tested lifecycle/stageflow.
 *
 * The checker approves what they can SEE, and cannot rubber-stamp: a decision summary shows what the
 * maker decided, and every code taken OFF standard coverage (not-covered / investigational) must be
 * individually spot-checked before Approve unlocks. Approve is also disabled for an empty or
 * same-as-maker reviewer (the affordance matches the fail-closed rule instead of silently no-opping).
 */
import { useState } from 'react';
import { Pill, MAKER_REF } from './workbenchParts';
import type { DispositionSummary } from '@/lib/policy/review/codeDisposition';
import type { CodeDisposition } from '@/lib/policy/crd/coverageDisposition';

const DISP_LABEL: Record<CodeDisposition, string> = {
  'covered-pa': 'Covered · PA',
  'not-covered': 'Not covered',
  investigational: 'Investigational',
  pending: 'Pending',
};
const DISP_TONE: Record<CodeDisposition, string> = {
  'covered-pa': 'bg-emerald-100 text-emerald-800',
  'not-covered': 'bg-rose-100 text-rose-800',
  investigational: 'bg-amber-100 text-amber-800',
  pending: 'bg-slate-200 text-slate-700',
};

export function SignoffStage({
  approved,
  approver,
  setApprover,
  onApprove,
  signError,
  onBack,
  onContinue,
  summary,
}: {
  approved: boolean;
  approver: string;
  setApprover: (s: string) => void;
  onApprove: () => void;
  signError: string | null;
  onBack: () => void;
  onContinue: () => void;
  summary: DispositionSummary;
}): React.ReactElement {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const restricted = summary.restricted;
  const allSpotChecked = restricted.every((r) => checked.has(r.code));
  const sameAsMaker = approver === MAKER_REF;
  const validReviewer = approver !== '' && !sameAsMaker;
  const canApprove = !approved && validReviewer && allSpotChecked;
  const toggle = (code: string): void =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const dispOrder: CodeDisposition[] = ['covered-pa', 'not-covered', 'investigational', 'pending'];

  return (
    <>
      <p className="text-sm text-slate-600">
        Two-person integrity. The maker submitted the reviewed encoding; a <b>different</b> licensed
        reviewer must approve. Approval is the gate — DTR/CRD generation stays locked until it is
        granted, and it fails closed with no distinct submitter.
      </p>

      {/* Decision summary — what the checker is being asked to approve, before they approve it. */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold">What the maker decided</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">{summary.total} codes:</span>
          {dispOrder
            .filter((d) => summary.counts[d] > 0)
            .map((d) => (
              <Pill key={d} tone={DISP_TONE[d]}>
                {summary.counts[d]} {DISP_LABEL[d]}
              </Pill>
            ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Maker
            <Pill tone="bg-emerald-100 text-emerald-800">submitted</Pill>
          </h3>
          <p className="mt-2 text-xs text-slate-500">
            <b className="text-slate-700">R. Hennessy, RN</b> · policy encoding specialist
          </p>
          <p className="mt-2 text-xs text-slate-500">Reviewed encoding submitted for approval.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Checker
            <Pill
              tone={approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}
            >
              {approved ? 'approved' : 'awaiting approval'}
            </Pill>
          </h3>
          <p className="mt-2 text-xs text-slate-500">
            Must be a <b>different</b> licensed reviewer · medical director
          </p>
          <select
            value={approver}
            disabled={approved}
            onChange={(e) => setApprover(e.target.value)}
            className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">— select reviewer —</option>
            <option value="Practitioner/medical-director">
              Dr. A. Nguyen, MD (Medical Director)
            </option>
            <option value={MAKER_REF}>R. Hennessy, RN — (same as maker)</option>
          </select>
          {sameAsMaker && (
            <p className="mt-1.5 text-[11px] font-semibold text-rose-600">
              Approver must differ from the maker — sign-off cannot self-approve.
            </p>
          )}

          {/* Spot-check gate: every off-coverage code must be individually reviewed. */}
          {restricted.length > 0 ? (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                Spot-check required · {checked.size}/{restricted.length}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800">
                Confirm you reviewed each code the maker took off standard coverage — or pulled onto
                coverage against the policy&rsquo;s own stance:
              </p>
              <ul className="mt-1.5 space-y-1">
                {restricted.map((r) => (
                  <li key={r.code}>
                    <label className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked.has(r.code)}
                        disabled={approved}
                        onChange={() => toggle(r.code)}
                      />
                      <span className="font-mono font-semibold">{r.code}</span>
                      <Pill tone={DISP_TONE[r.disposition]}>{DISP_LABEL[r.disposition]}</Pill>
                      {r.overrideFrom && (
                        <span className="font-semibold text-rose-600">
                          ⚠ override — policy default was {DISP_LABEL[r.overrideFrom]}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">
              No codes were taken off standard coverage. Verify the covered set looks right before
              you approve.
            </p>
          )}

          <button
            type="button"
            disabled={!canApprove}
            onClick={onApprove}
            className="mt-2 w-full rounded bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approved ? '✓ Approved & locked' : 'Approve & lock encoding'}
          </button>
          {!approved && !canApprove && (
            <p className="mt-1 text-[11px] text-slate-400">
              {!validReviewer
                ? 'Select a different licensed reviewer to enable approval.'
                : `Spot-check all ${restricted.length} off-coverage codes to enable approval.`}
            </p>
          )}
          {signError && <p className="mt-2 font-mono text-xs text-rose-700">✕ {signError}</p>}
        </div>
      </div>
      <div className="flex gap-3 rounded-lg border-l-4 border-rose-500 bg-rose-50 p-3 text-xs text-slate-600">
        <span className="whitespace-nowrap font-mono font-bold uppercase text-rose-600">
          Hard rule
        </span>
        <span>
          <b className="text-slate-800">Sign-off never self-approves.</b> An approver equal to the
          submitter (or no submitter on record) is refused — the platform fails closed. Every
          decision is written to the append-only evidence ledger with the reviewer&rsquo;s resolved
          identity.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← Back to review
        </button>
        <button
          type="button"
          disabled={!approved}
          onClick={onContinue}
          className="ml-auto rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Continue to generation →
        </button>
      </div>
    </>
  );
}
