'use client';

/**
 * Sign-off stage (Step 3) — maker/checker two-person gate. Extracted from PolicyDtrWorkbench for the
 * size cap; a thin renderer. The fail-closed gate itself lives in the tested lifecycle/stageflow.
 */
import { Pill, MAKER_REF } from './workbenchParts';

export function SignoffStage({
  approved,
  approver,
  setApprover,
  onApprove,
  signError,
  onBack,
  onContinue,
}: {
  approved: boolean;
  approver: string;
  setApprover: (s: string) => void;
  onApprove: () => void;
  signError: string | null;
  onBack: () => void;
  onContinue: () => void;
}): React.ReactElement {
  return (
    <>
      <p className="text-sm text-slate-600">
        Two-person integrity. The maker submitted the reviewed encoding; a <b>different</b> licensed
        reviewer must approve. Approval is the gate — DTR/CRD generation stays locked until it is
        granted, and it fails closed with no distinct submitter.
      </p>
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
          <button
            type="button"
            disabled={approved}
            onClick={onApprove}
            className="mt-2 w-full rounded bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {approved ? '✓ Approved & locked' : 'Approve & lock encoding'}
          </button>
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
          decision is written to the append-only evidence ledger with the reviewer's resolved
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
