'use client';

/**
 * Shared presentational parts for the DTR authoring workbench — extracted from PolicyDtrWorkbench so
 * each file stays under the size cap. No logic beyond formatting; the stage state machine lives in the
 * tested `@/lib/policy/workflow/stageflow`.
 */
import type { CriteriaGroup, CriterionNode } from '@/lib/policy/extract/criteria';

export type ReviewState = 'pending' | 'accepted' | 'flagged';

/** Fixed maker identity for the demo (distinct from the checker selection). */
export const MAKER_REF = 'Practitioner/maker-current';

export function confidenceClass(c: number | null): string {
  if (c === null) return 'bg-slate-100 text-slate-600';
  if (c >= 80) return 'bg-emerald-100 text-emerald-800';
  if (c >= 50) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

export function codeKey(product: string, procedure: string, code: string, idx: number): string {
  return `${product}::${procedure}::${code}::${idx}`;
}

function CriterionItem({ node }: { node: CriterionNode }): React.ReactElement {
  return (
    <li className="text-sm text-slate-600">
      <span className="font-mono text-xs text-slate-400">{node.label}.</span> {node.text}
      {node.children.length > 0 && (
        <ul className="ml-4 mt-1 list-none space-y-1">
          {node.children.map((c, i) => (
            <CriterionItem key={`${c.label}-${i}`} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CriteriaOutline({ groups }: { groups: CriteriaGroup[] }): React.ReactElement {
  return (
    <div className="space-y-3">
      {groups.map((g, gi) => (
        <div key={gi}>
          <p className="text-sm font-medium text-slate-700">
            {g.heading}
            {g.logic ? (
              <span className="ml-1 text-xs text-slate-400">({g.logic} of the following)</span>
            ) : null}
          </p>
          <ul className="ml-4 mt-1 list-none space-y-1">
            {g.criteria.map((c, ci) => (
              <CriterionItem key={`${c.label}-${ci}`} node={c} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>
  );
}
