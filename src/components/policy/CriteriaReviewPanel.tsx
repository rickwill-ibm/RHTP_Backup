'use client';

/**
 * Clinical criteria review panel (clinician-facing) — makes the extracted nested AND/OR
 * medical-necessity logic VISIBLE and reviewable for clinical-guideline ("criteria" kind)
 * policies. `EncodingReviewPanel` (in this same "Extract & Encode" stage) covers CODE review
 * only; this sits alongside it so the clinician also reviews the LOGIC before sign-off.
 *
 * AND/OR display mirrors the ONE deterministic rule the real generator uses
 * (`criteriaNormalize.ts`): a group's top-level criteria are AND'd only when its heading says
 * "all of the following" (`group.logic === 'all'`); everything else — including any node's own
 * children — defaults to OR ("alternatives") unless that node's own text says "all of the
 * following" (`logicOf(node.text) === 'all'`). Reusing `logicOf` keeps this preview identical
 * to what the DTR is actually generated from.
 *
 * DEMO HONESTY: each node's Confirmed/Flag state is a client-side clinical-QA annotation for
 * the reviewer's own record. It does not (yet) gate "Submit for sign-off" — that gate is still
 * driven by `EncodingReviewPanel`'s code dispositions, unchanged here.
 */
import { useMemo, useState } from 'react';
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { CriteriaGroup, CriterionNode } from '@/lib/policy/extract/criteria';
import { groupLogic, childLogic, logicTone } from '@/lib/policy/extract/criteriaLogic';
import { Pill, type ReviewState } from './workbench/workbenchParts';

interface NodeState {
  state: ReviewState;
  note: string;
}

const DEFAULT_STATE: NodeState = { state: 'pending', note: '' };

function accentFor(state: ReviewState): string {
  if (state === 'accepted') return 'border-emerald-200 bg-emerald-50/40';
  if (state === 'flagged') return 'border-rose-200 bg-rose-50/40';
  return 'border-slate-200 bg-white';
}

function countAll(
  groups: CriteriaGroup[],
  nodeState: Record<string, NodeState>
): { total: number; reviewed: number; flagged: number } {
  let total = 0;
  let reviewed = 0;
  let flagged = 0;
  const walk = (nodes: CriterionNode[], prefix: string): void => {
    nodes.forEach((n) => {
      const key = `${prefix}${n.label}`;
      total += 1;
      const st = nodeState[key]?.state ?? 'pending';
      if (st !== 'pending') reviewed += 1;
      if (st === 'flagged') flagged += 1;
      if (n.children.length > 0) walk(n.children, `${key}.`);
    });
  };
  groups.forEach((g, gi) => walk(g.criteria, `g${gi}.`));
  return { total, reviewed, flagged };
}

function CriterionRow({
  node,
  path,
  depth,
  nodeState,
  setState,
  setNote,
}: {
  node: CriterionNode;
  path: string;
  depth: number;
  nodeState: Record<string, NodeState>;
  setState: (key: string, state: ReviewState) => void;
  setNote: (key: string, note: string) => void;
}): React.ReactElement {
  const st = nodeState[path] ?? DEFAULT_STATE;
  const hasChildren = node.children.length > 0;

  return (
    <li
      className={`rounded-md border px-3 py-2 ${accentFor(st.state)}`}
      style={{ marginLeft: depth * 16 }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="mr-2 font-mono text-[11px] font-semibold text-slate-400">
            {node.label}.
          </span>
          <span className="text-sm text-slate-700">{node.text}</span>
          {hasChildren && (
            <span className="ml-2 align-middle">
              <Pill tone={logicTone(childLogic(node))}>{childLogic(node)}</Pill>
            </span>
          )}
        </div>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            onClick={() => setState(path, 'accepted')}
            className={`rounded px-2 py-1 text-[11px] font-semibold ${
              st.state === 'accepted'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-300 bg-white text-slate-500'
            }`}
          >
            Confirmed
          </button>
          <button
            type="button"
            onClick={() => setState(path, 'flagged')}
            className={`rounded px-2 py-1 text-[11px] font-semibold ${
              st.state === 'flagged'
                ? 'bg-rose-600 text-white'
                : 'border border-slate-300 bg-white text-slate-500'
            }`}
          >
            Flag
          </button>
        </div>
      </div>
      {st.state === 'flagged' && (
        <textarea
          className="mt-2 w-full rounded border border-rose-200 bg-white px-2 py-1 text-xs text-slate-700"
          placeholder="What's wrong with the extracted criterion or logic?"
          value={st.note}
          onChange={(e) => setNote(path, e.target.value)}
        />
      )}
      {hasChildren && (
        <ul className="mt-2 list-none space-y-2">
          {node.children.map((c, i) => (
            <CriterionRow
              key={`${path}.${c.label}-${i}`}
              node={c}
              path={`${path}.${c.label}`}
              depth={depth + 1}
              nodeState={nodeState}
              setState={setState}
              setNote={setNote}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CriteriaReviewPanel({
  review,
  onSubmit,
}: {
  review: PolicyReview;
  /** Submit the CLINICIAN's part of the review (criteria confirmed/flagged) for sign-off.
   *  Independent of `EncodingReviewPanel`'s own code-review submit — a clinician doesn't need a
   *  coding specialist to have decided every CPT code's coverage role first; that seam is separate. */
  onSubmit?: () => void;
}): React.ReactElement | null {
  const groups = review.criteriaSections;
  const [nodeState, setNodeState] = useState<Record<string, NodeState>>({});
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const setState = (key: string, state: ReviewState): void =>
    setNodeState((prev) => ({ ...prev, [key]: { state, note: prev[key]?.note ?? '' } }));
  const setNote = (key: string, note: string): void =>
    setNodeState((prev) => ({ ...prev, [key]: { state: prev[key]?.state ?? 'pending', note } }));

  const counts = useMemo(
    () =>
      groups && groups.length > 0
        ? countAll(groups, nodeState)
        : { total: 0, reviewed: 0, flagged: 0 },
    [groups, nodeState]
  );

  if (!groups || groups.length === 0) return null;

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Medical-necessity logic — clinical review
          </h3>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Confirm each criterion reflects the source policy, or flag it for correction. AND/OR
            tags show exactly how the nested logic combines — the same rule the DTR questionnaire is
            generated from.
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <Pill tone="bg-slate-100 text-slate-600">
            {counts.reviewed}/{counts.total} confirmed
          </Pill>
          {counts.flagged > 0 && (
            <Pill tone="bg-rose-100 text-rose-800">{counts.flagged} flagged</Pill>
          )}
        </div>
      </header>

      {onSubmit && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <button
            type="button"
            disabled={counts.reviewed < counts.total}
            onClick={() => onSubmit()}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              counts.reviewed < counts.total
                ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            Submit for sign-off &rarr;
          </button>
          <span className="text-xs text-slate-500">
            {counts.reviewed < counts.total
              ? `${counts.total - counts.reviewed} criteria still need Confirmed or Flag`
              : 'Every criterion confirmed or flagged — ready to send to the approver.'}
          </span>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {groups.map((g, gi) => (
          <div key={gi} className="px-4 py-3">
            <button
              type="button"
              onClick={() => setCollapsed((p) => ({ ...p, [gi]: !p[gi] }))}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-sm font-medium text-slate-800">
                {g.heading}
                <span className="ml-2 align-middle">
                  <Pill tone={logicTone(groupLogic(g))}>{groupLogic(g)}</Pill>
                </span>
              </span>
              <span className="flex-none text-xs text-slate-400">
                {collapsed[gi] ? 'Show ▾' : 'Hide ▴'}
              </span>
            </button>
            {!collapsed[gi] && (
              <ul className="mt-3 ml-1 list-none space-y-2">
                {g.criteria.map((c, ci) => (
                  <CriterionRow
                    key={`g${gi}-${c.label}-${ci}`}
                    node={c}
                    path={`g${gi}.${c.label}`}
                    depth={0}
                    nodeState={nodeState}
                    setState={setState}
                    setNote={setNote}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {review.notMedicallyNecessary && review.notMedicallyNecessary.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-600">
            Absolute exclusions — not medically necessary regardless of the criteria above
          </p>
          <ul className="mt-2 space-y-1">
            {review.notMedicallyNecessary.map((text, i) => (
              <li key={`excl-${i}`} className="text-xs text-slate-600">
                • {text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
