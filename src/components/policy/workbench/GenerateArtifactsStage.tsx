'use client';

/**
 * Generate stage (Step 4) — publishes the TWO runtime artifacts from the signed-off policy.
 *
 * Da Vinci separation of concerns: CRD and DTR are SIBLING artifacts, not one blob. Policy authoring
 * emits BOTH — a CRD coverage-rule set (per code: covered? · prior-auth? · → which DTR questionnaire)
 * AND a DTR Questionnaire package — joined only by the Questionnaire canonical URL. This stage shows
 * them as two distinct panels so the reviewer sees each artifact and the pointer between them.
 */
import { useState } from 'react';
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';
import type { QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';
import { QuestionnaireRenderer } from '@/components/dtr/QuestionnaireRenderer';
import { PasPreviewPanel } from '@/components/policy/workbench/PasPreviewPanel';
import { PatientPrepopPanel } from '@/components/policy/workbench/PatientPrepopPanel';
import type { PolicyReview } from '@/lib/policy/policyReview';

function coveredLabel(role: CoverageRule['role']): { text: string; tone: string } {
  switch (role) {
    case 'not-covered':
      return { text: 'Not covered', tone: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'investigational':
      return { text: 'Investigational', tone: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'ambiguous':
      return { text: 'Conditional — review', tone: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'supporting':
      return { text: 'Supporting', tone: 'bg-slate-100 text-slate-600 border-slate-200' };
    case 'covered':
      return { text: 'Covered', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    default:
      // 'referenced' = coverage UNDETERMINED pre-review — honest neutral, never green "Covered".
      return {
        text: 'Referenced — pending review',
        tone: 'bg-slate-50 text-slate-600 border-slate-200',
      };
  }
}

export function GenerateArtifactsStage({
  coverageRules,
  questionnaireCanonical,
  items,
  policyTitle,
  policyId,
  review,
  onBack,
  onContinue,
}: {
  coverageRules?: CoverageRule[];
  questionnaireCanonical?: string;
  items: QuestionnaireItemDef[];
  policyTitle?: string;
  policyId?: string;
  review?: PolicyReview | null;
  onBack: () => void;
  onContinue: () => void;
}): React.ReactElement {
  const rules = coverageRules ?? [];
  const paRequiredCount = rules.filter((r) => r.priorAuthRequired).length;
  const [tab, setTab] = useState<'crd' | 'dtr' | 'pas'>('crd');
  const tabClass = (active: boolean): string =>
    `flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
      active
        ? 'border-indigo-600 text-indigo-700'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <>
      <p className="text-sm text-slate-600">
        Publishing the two runtime artifacts from the signed-off policy. Per Da Vinci these are
        siblings — a <span className="font-medium">CRD coverage rule</span> (served at order-sign)
        and a <span className="font-medium">DTR questionnaire package</span> (launched from the CRD
        card). They are joined by one Questionnaire canonical URL.
      </p>

      {/* Sibling artifacts as two tabs — not one stacked scroll (Da Vinci: CRD and DTR are peers). */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button type="button" onClick={() => setTab('crd')} className={tabClass(tab === 'crd')}>
          <span className="flex h-5 w-5 items-center justify-center rounded bg-sky-100 text-[10px] font-bold text-sky-700">
            CRD
          </span>
          Coverage rules
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
            {rules.length}
          </span>
        </button>
        <button type="button" onClick={() => setTab('dtr')} className={tabClass(tab === 'dtr')}>
          <span className="flex h-5 w-5 items-center justify-center rounded bg-violet-100 text-[10px] font-bold text-violet-700">
            DTR
          </span>
          Questionnaire
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
            {items.filter((i) => i.type !== 'display').length}
          </span>
        </button>
        <button type="button" onClick={() => setTab('pas')} className={tabClass(tab === 'pas')}>
          <span className="flex h-5 w-5 items-center justify-center rounded bg-teal-100 text-[10px] font-bold text-teal-700">
            PAS
          </span>
          Prior auth
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
            {paRequiredCount}
          </span>
        </button>
      </div>

      {/* ===== Panel A — CRD coverage-rule artifact ===== */}
      {tab === 'crd' && (
        <section className="rounded-lg border border-slate-200">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-sky-100 text-xs font-bold text-sky-700">
              CRD
            </span>
            <h3 className="text-sm font-semibold">Coverage rules</h3>
            <span className="text-xs text-slate-400">served at order-sign (CDS Hooks)</span>
            <span className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
              {rules.length} code{rules.length === 1 ? '' : 's'} · {paRequiredCount} PA-required
            </span>
          </header>
          {rules.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">
              No procedure codes were extracted, so no coverage rules were generated for this
              policy.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-semibold">Code</th>
                    <th className="px-4 py-2 font-semibold">Covered</th>
                    <th className="px-4 py-2 font-semibold">Prior auth</th>
                    <th className="px-4 py-2 font-semibold">→ DTR questionnaire</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const cov = coveredLabel(r.role);
                    return (
                      <tr key={`${r.codeSystem}:${r.code}`} className="border-b border-slate-50">
                        <td className="px-4 py-2">
                          <span className="font-mono font-semibold text-slate-800">{r.code}</span>
                          <span className="ml-1 text-[10px] text-slate-400">{r.codeSystem}</span>
                          {r.display && (
                            <div className="max-w-[220px] truncate text-xs text-slate-500">
                              {r.display}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cov.tone}`}
                          >
                            {cov.text}
                          </span>
                          {r.coverageInfo && r.coverageInfo.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {r.coverageInfo.map((c) => (
                                <span
                                  key={c.code}
                                  title={c.system}
                                  className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] text-slate-500"
                                >
                                  <span className="font-semibold text-sky-600">CRD</span> {c.code}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${r.priorAuthRequired ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                          >
                            {r.priorAuthRequired ? 'Required' : 'Not required'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => setTab('dtr')}
                            className="font-mono text-xs text-sky-700 hover:underline"
                            title={r.reason}
                          >
                            {r.questionnaireCanonical.split('/').pop()}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <footer className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Runtime CRD returns these as a coverage-information determination + a card that launches
            the DTR questionnaire (the DTR tab). The card carries no per-criterion evaluation — that
            happens in DTR.
          </footer>
        </section>
      )}

      {/* ===== Panel B — DTR questionnaire package ===== */}
      {tab === 'dtr' && (
        <section id="dtr-package" className="rounded-lg border border-slate-200">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-violet-100 text-xs font-bold text-violet-700">
              DTR
            </span>
            <h3 className="text-sm font-semibold">Questionnaire package</h3>
            <span className="text-xs text-slate-400">
              launched from the CRD card (SMART on FHIR)
            </span>
          </header>
          {questionnaireCanonical && (
            <div className="border-b border-slate-100 px-4 py-2 text-xs">
              <span className="text-slate-400">Questionnaire canonical: </span>
              <span className="font-mono text-slate-700">{questionnaireCanonical}</span>
              <span className="ml-2 text-slate-400">(the URL every CRD rule above points at)</span>
            </div>
          )}
          <div className="p-4">
            <QuestionnaireRenderer items={items} />
          </div>
        </section>
      )}

      {/* ===== Panel C — PAS request (the third sibling: CRD → DTR → PAS) ===== */}
      {tab === 'pas' && (
        <PasPreviewPanel
          coverageRules={rules}
          items={items}
          questionnaireCanonical={questionnaireCanonical}
          policyTitle={policyTitle ?? 'Authored policy'}
          policyId={policyId ?? 'authored-policy'}
        />
      )}

      {/* The authored policy evaluated against a sample patient's real FHIR record (prepopulation). */}
      <PatientPrepopPanel review={review ?? null} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← Sign-off
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="ml-auto rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Continue to promote →
        </button>
      </div>
    </>
  );
}
