'use client';
/**
 * CrdRequirementsTabs — the interactive tabbed panel on the right of the CRD procedure card.
 *
 * Extracted from CrdProcedureCard so the card stays a pure (hook-free) presentational component and
 * within the AI-CODING-CONVENTIONS §2 size cap. Owns ONLY view state (which tab is active): it does
 * NOT evaluate criteria or fetch anything — it renders slices of the same `CrdCoverageViewModel`.
 *
 * Tabs are built from the data actually present in the view model; a tab with no available data is
 * dropped rather than rendered dead. Presentation-only.
 */
import { useState } from 'react';
import type { CrdCoverageViewModel, CellTone } from '@/lib/pa/crdCoverageView';

const CHIP: Record<CellTone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  bad: 'bg-rose-50 text-rose-700 border-rose-200',
  plain: 'bg-slate-50 text-slate-600 border-slate-200',
};

type TabId = 'requirements' | 'plan' | 'clinical' | 'history';

export default function CrdRequirementsTabs({ vm }: { vm: CrdCoverageViewModel }) {
  // A tab is offered only when the view model actually carries data for it.
  const hasClinical = vm.criteriaNames.length > 0 || Boolean(vm.clinicalGuideline);
  const tabs: { id: TabId; label: string }[] = [
    { id: 'requirements', label: 'Requirements' },
    { id: 'plan', label: 'Plan details' },
    ...(hasClinical ? [{ id: 'clinical' as TabId, label: 'Clinical guidance' }] : []),
    { id: 'history', label: 'History' },
  ];
  const [active, setActive] = useState<TabId>('requirements');

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex gap-1 border-b border-gray-100 px-3">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              aria-current={on ? 'page' : undefined}
              className={`px-3 py-2.5 text-[13px] font-medium transition-colors ${
                on
                  ? 'border-b-2 border-[#1669c1] text-[#1669c1]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-5 p-5">
        {active === 'requirements' && <RequirementsPanel vm={vm} />}
        {active === 'plan' && <PlanPanel vm={vm} />}
        {active === 'clinical' && hasClinical && <ClinicalPanel vm={vm} />}
        {active === 'history' && <HistoryPanel vm={vm} />}
      </div>
    </div>
  );
}

function RequirementsPanel({ vm }: { vm: CrdCoverageViewModel }) {
  return (
    <>
      <div>
        <div className="mb-1 text-[13.5px] font-semibold text-gray-900">Documentation required</div>
        <div className="mb-3 text-[13px] text-gray-500">
          What the payer needs attached with the request.
        </div>
        {vm.docNeeded.length === 0 ? (
          <p className="text-[13px] text-gray-500">No documentation required for this procedure.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-gray-400">
                <th className="border-b border-gray-100 py-2 pr-2 font-semibold">Document</th>
                <th className="border-b border-gray-100 py-2 pr-2 font-semibold">Requirement</th>
                <th className="border-b border-gray-100 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {vm.docNeeded.map((d) => (
                <tr key={d.doc} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 pr-2 align-top">
                    <div className="font-semibold text-gray-800">{d.doc}</div>
                    {d.sub && <div className="text-[11.5px] text-gray-500">{d.sub}</div>}
                  </td>
                  <td className="py-2.5 pr-2 align-top">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${d.requirement === 'required' ? CHIP.warn : CHIP.plain}`}
                    >
                      {d.requirement === 'required' ? 'Required' : 'Recommended'}
                    </span>
                  </td>
                  <td className="py-2.5 align-top">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${CHIP.plain}`}
                    >
                      Needed
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {vm.criteriaNames.length > 0 && (
        <div>
          <div className="mb-1 text-[13.5px] font-semibold text-gray-900">
            Clinical criteria apply
          </div>
          <div className="mb-3 text-[13px] text-gray-500">
            The policy defines these requirement groups. They are <b>evaluated in DTR</b>, not here
            — CRD only names them.
          </div>
          <div className="flex flex-col gap-2">
            {vm.criteriaNames.map((c) => (
              <div key={c} className="flex items-center gap-2.5">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CHIP.plain}`}
                >
                  Evaluated in DTR
                </span>
                <span className="text-[13px] text-gray-700">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 text-[12.5px] text-gray-600">
        <span className="font-bold text-indigo-600">i</span>
        <div>
          Per-criterion <b className="text-indigo-700">Met / Partially met</b> with EHR evidence is
          DTR&apos;s output — it appears after launch, from a real QuestionnaireResponse.
        </div>
      </div>
    </>
  );
}

function PlanPanel({ vm }: { vm: CrdCoverageViewModel }) {
  const rows: [string, string][] = [
    ['Payer', vm.payer],
    ['Plan', vm.plan],
    ['Network', vm.network ?? 'Unverified'],
    ['Site of service', vm.site],
    ['Coverage', vm.coverageFound ? 'Active' : 'Inactive'],
    ['Prior authorization', vm.paRequired ? 'Required' : 'Not required'],
  ];
  return (
    <div>
      <div className="mb-1 text-[13.5px] font-semibold text-gray-900">
        Plan &amp; benefit details
      </div>
      <div className="mb-3 text-[13px] text-gray-500">
        Coverage context resolved for this member and order.
      </div>
      <table className="w-full text-[13.5px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-gray-100 last:border-0">
              <td className="w-[42%] py-2 pr-3 align-top text-gray-500">{k}</td>
              <td className="py-2 align-top text-gray-800">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClinicalPanel({ vm }: { vm: CrdCoverageViewModel }) {
  return (
    <div>
      <div className="mb-1 text-[13.5px] font-semibold text-gray-900">Clinical guidance</div>
      {vm.clinicalGuideline ? (
        <div className="mb-3 text-[13px] text-gray-500">
          Payer-configured guideline: <b className="text-gray-700">{vm.clinicalGuideline}</b>.
          Criteria below are <b>evaluated in DTR</b>.
        </div>
      ) : (
        <div className="mb-3 text-[13px] text-gray-500">
          The policy defines these criteria groups. They are <b>evaluated in DTR</b>.
        </div>
      )}
      {vm.criteriaNames.length > 0 ? (
        <div className="flex flex-col gap-2">
          {vm.criteriaNames.map((c) => (
            <div key={c} className="flex items-center gap-2.5">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CHIP.plain}`}
              >
                Evaluated in DTR
              </span>
              <span className="text-[13px] text-gray-700">{c}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-gray-500">No named criteria groups for this guideline.</p>
      )}
    </div>
  );
}

function HistoryPanel({ vm }: { vm: CrdCoverageViewModel }) {
  const rows: [string, string][] = [
    ['Reference ID', vm.referenceId],
    ['Order date', vm.order.orderedOn],
    [
      'Determination',
      vm.paRequired ? 'Prior authorization required' : 'Prior authorization not required',
    ],
    ['Coverage', vm.coverageFound ? 'Coverage found' : 'Coverage inactive'],
    ['Plan rules', 'updated 08/15/2026'],
  ];
  return (
    <div>
      <div className="mb-1 text-[13.5px] font-semibold text-gray-900">Determination history</div>
      <div className="mb-3 text-[13px] text-gray-500">
        Reference for this CRD determination — cite the reference ID on any follow-up.
      </div>
      <table className="w-full text-[13.5px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-gray-100 last:border-0">
              <td className="w-[42%] py-2 pr-3 align-top text-gray-500">{k}</td>
              <td
                className={`py-2 align-top text-gray-800 ${k === 'Reference ID' ? 'font-mono' : ''}`}
              >
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
