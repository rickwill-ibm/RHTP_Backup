'use client';

/**
 * Patient prepopulation preview — the AUTHORED policy evaluated against a sample patient's FHIR record.
 *
 * This closes the loop the CRD/DTR/PAS analysis flagged: it derives the computable criteria from THIS
 * review (not a hardcoded scenario) via `dtrCriteriaFromReview`, runs them against a real patient
 * bundle with `evaluateDtr`, and shows what auto-prepopulates (age/BMI/comorbidity, read from the
 * record with provenance) versus what stays a documentation gap. Pure logic lives in the tested
 * `@/lib/policy/dtr/evaluate/*` modules; this is a thin renderer.
 */
import { useMemo, useState } from 'react';
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { CriterionNode } from '@/lib/policy/extract/criteria';
import { dtrCriteriaFromReview } from '@/lib/policy/dtr/evaluate/dtrCriteriaFromPolicy';
import { evaluateDtr } from '@/lib/policy/dtr/evaluate/patientEvaluation';
import { bariatricPatientBundle, getPatient } from '@/lib/policy/dtr/evaluate/patientData';
import { groupLogic, childLogic, logicTone } from '@/lib/policy/extract/criteriaLogic';
import { Pill } from './workbenchParts';

/** Read-only reference row — the full authored logic tree, unannotated with patient data (the
 *  computed list above is the actual evaluation; this is "what the policy says", for cross-check). */
function PolicyLogicNode({
  node,
  depth,
}: {
  node: CriterionNode;
  depth: number;
}): React.ReactElement {
  const hasChildren = node.children.length > 0;
  return (
    <li className="py-1" style={{ marginLeft: depth * 14 }}>
      <span className="mr-2 font-mono text-[11px] font-semibold text-slate-400">{node.label}.</span>
      <span className="text-[13px] text-slate-600">{node.text}</span>
      {hasChildren && (
        <span className="ml-2 align-middle">
          <Pill tone={logicTone(childLogic(node))}>{childLogic(node)}</Pill>
        </span>
      )}
      {hasChildren && (
        <ul className="mt-1 list-none">
          {node.children.map((c, i) => (
            <PolicyLogicNode key={`${node.label}-${c.label}-${i}`} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function PatientPrepopPanel({
  review,
  cptCode = '43644',
}: {
  review: PolicyReview | null;
  cptCode?: string;
}): React.ReactElement | null {
  const evaln = useMemo(() => {
    if (!review) return null;
    const criteria = dtrCriteriaFromReview(review, cptCode);
    return evaluateDtr(criteria, bariatricPatientBundle, new Date('2026-08-30'));
  }, [review, cptCode]);
  const [showLogic, setShowLogic] = useState(false);

  if (!evaln) return null;
  const patient = getPatient(bariatricPatientBundle);
  const computable = evaln.groups.filter((g) => !!g.fhirQuery);
  const metCount = computable.filter((g) => g.status === 'met').length;
  const gapCount = evaln.groups.filter((g) => g.status === 'gap').length;

  const criteriaGroups = review?.criteriaSections ?? [];

  return (
    <>
      <section className="mt-5 rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <h4 className="text-sm font-semibold">
            DTR prepopulation — this policy vs a sample patient
          </h4>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {patient?.name ?? evaln.patientId} · read from FHIR
          </span>
          <span className="ml-auto text-xs font-medium text-slate-500">
            {metCount}/{computable.length} computable criteria auto-prepopulated
            {gapCount > 0
              ? ` · ${gapCount} gap${gapCount > 1 ? 's' : ''} to resolve`
              : ' · all met'}
          </span>
        </div>
        <p className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          Criteria derived from THIS authored policy, evaluated against the patient&rsquo;s record —
          age from Patient.birthDate, BMI from the latest LOINC 39156-5 Observation, comorbidity
          from an active Condition. Documentation criteria stay gaps for the provider to attest.
        </p>
        <ul>
          {evaln.groups.map((g) => (
            <li key={g.id} className="border-b border-slate-100 px-4 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                    g.status === 'met'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {g.status === 'met' ? '✓ met' : g.required ? 'gap — needed' : 'gap'}
                </span>
                <span className="text-sm font-medium text-slate-800">{g.title}</span>
                {g.fhirQuery && g.fhirQuery.codes.length > 0 && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                    {g.fhirQuery.resourceType} · {g.fhirQuery.codes.slice(0, 2).join(', ')}
                    {g.fhirQuery.valueComparison ? ` ${g.fhirQuery.valueComparison}` : ''}
                  </span>
                )}
              </div>
              {g.leaf && (
                <p className="mt-1 pl-1 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">{g.leaf.label}</span> —{' '}
                  {g.leaf.evidence}
                  <span className="text-slate-400">
                    {' '}
                    · source: {g.leaf.source}
                    {g.leaf.recordedDate ? ` · ${g.leaf.recordedDate}` : ''}
                  </span>
                </p>
              )}
              {!g.leaf && g.status === 'gap' && (
                <p className="mt-1 pl-1 text-[11px] text-amber-700">
                  No matching data in the record — provider must attest or attach.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {criteriaGroups.length > 0 && (
        <section className="mt-3 rounded-lg border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setShowLogic((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
          >
            <span className="text-sm font-semibold text-slate-800">
              Full policy logic — as authored (reference)
            </span>
            <span className="text-xs text-slate-400">{showLogic ? 'Hide ▴' : 'Show ▾'}</span>
          </button>
          {showLogic && (
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="mb-2 text-[11px] text-slate-500">
                The nested AND/OR criteria this policy encodes, for cross-check against the computed
                list above. Not yet auto-evaluated node-by-node against the chart — the computed
                list above is the actual patient-data evaluation.
              </p>
              {criteriaGroups.map((g, gi) => (
                <div key={gi} className="mb-3 last:mb-0">
                  <p className="text-[13px] font-medium text-slate-700">
                    {g.heading}
                    <span className="ml-2 align-middle">
                      <Pill tone={logicTone(groupLogic(g))}>{groupLogic(g)}</Pill>
                    </span>
                  </p>
                  <ul className="mt-1 list-none">
                    {g.criteria.map((c, ci) => (
                      <PolicyLogicNode key={`g${gi}-${c.label}-${ci}`} node={c} depth={1} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
