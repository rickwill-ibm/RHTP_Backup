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
import { useMemo } from 'react';
import type { PolicyReview } from '@/lib/policy/policyReview';
import { dtrCriteriaFromReview } from '@/lib/policy/dtr/evaluate/dtrCriteriaFromPolicy';
import { evaluateDtr } from '@/lib/policy/dtr/evaluate/patientEvaluation';
import { bariatricPatientBundle, getPatient } from '@/lib/policy/dtr/evaluate/patientData';

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

  if (!evaln) return null;
  const patient = getPatient(bariatricPatientBundle);
  const computable = evaln.groups.filter((g) => !!g.fhirQuery);
  const metCount = computable.filter((g) => g.status === 'met').length;
  const gapCount = evaln.groups.filter((g) => g.status === 'gap').length;

  return (
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
          {gapCount > 0 ? ` · ${gapCount} gap${gapCount > 1 ? 's' : ''} to resolve` : ' · all met'}
        </span>
      </div>
      <p className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500">
        Criteria derived from THIS authored policy, evaluated against the patient&rsquo;s record —
        age from Patient.birthDate, BMI from the latest LOINC 39156-5 Observation, comorbidity from
        an active Condition. Documentation criteria stay gaps for the provider to attest.
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
  );
}
