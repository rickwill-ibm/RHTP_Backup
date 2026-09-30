'use client';
/**
 * ReconAppealsPanel — the Appeals sub-tab of the ReconciliationBoard: the appeals-in-flight selector
 * (when more than one is in flight) plus the governed WorkflowPanel (artifact + timeline + controls)
 * for the currently-open underpayment appeal.
 *
 * Extracted verbatim from ReconciliationBoard — no logic/behavior change. openWfSeq is lifted into
 * the shell so the Ledger's "View appeal" can select an appeal here.
 *
 * CLIENT-SAFE: shared sim + governed workflow view. No node/barrel.
 */
import type { Workflow } from '@/lib/goldenThread/workflow';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { WorkflowPanel } from '@/components/goldenThread/flow/WorkflowPanel';

export function ReconAppealsPanel({
  op,
  appeals,
  openWfSeq,
  setOpenWfSeq,
}: {
  op: OperatingSim;
  appeals: Workflow[];
  openWfSeq: number | null;
  setOpenWfSeq: (seq: number | null) => void;
}): React.ReactElement {
  const openWf = appeals.find((w) => w.reconSeq === openWfSeq) ?? appeals[appeals.length - 1];
  if (!(appeals.length > 0 && openWf)) {
    return (
      <div className="ed-card p-4 text-center">
        <p className="text-[11px] font-semibold text-carbon-gray-70">No appeal in flight</p>
        <p className="mt-1 text-[10px] text-carbon-gray-50">
          Draft one from the Ledger tab (an underpayment record → “Draft appeal”) or from a
          systematic pattern on the Overview tab →
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {appeals.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Appeals in flight
          </span>
          {appeals.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setOpenWfSeq(w.reconSeq ?? null)}
              className={`mono rounded-full border px-2 py-0.5 text-[10px] transition ${w.id === openWf.id ? 'border-carbon-blue bg-carbon-blue text-white' : 'border-carbon-gray-30 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10'}`}
            >
              {w.id} · {w.state}
            </button>
          ))}
        </div>
      )}
      <WorkflowPanel op={op} wf={openWf} />
    </div>
  );
}
