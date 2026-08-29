/**
 * CrdProcedureCard — presentational card for ONE ordered procedure on the rich CRD screen.
 *
 * Pure view over a `CrdCoverageViewModel` (built by `buildCrdCoverageViewModel`): determination +
 * PA banner + eligibility/benefits (270/271) on the left; documentation-needed + named clinical
 * criteria + provenance on the right. It NAMES the criteria but does NOT evaluate them — per-criterion
 * Met/Partial is DTR's output, shown after "Complete documentation" launches DTR. No hooks, no data
 * access: the container (`CrdCoverageView`) owns state and passes the view model + `onComplete` down.
 *
 * Split out of CrdCoverageView.tsx to keep each module within the AI-CODING-CONVENTIONS §2 size cap.
 */
import type { CrdCoverageViewModel, CellTone } from '@/lib/pa/crdCoverageView';
import CrdRequirementsTabs from './CrdRequirementsTabs';

const TONE: Record<CellTone, string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-600',
  bad: 'text-rose-600',
  plain: 'text-slate-500',
};
const CHIP: Record<CellTone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  bad: 'bg-rose-50 text-rose-700 border-rose-200',
  plain: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function CrdProcedureCard({
  vm,
  onComplete,
  single,
}: {
  vm: CrdCoverageViewModel;
  onComplete: () => void;
  single: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.06fr_0.94fr] items-start">
      {/* LEFT */}
      <div className="space-y-5">
        {/* Determination card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Coverage Requirements Discovery</h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${vm.coverageFound ? CHIP.ok : CHIP.bad}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {vm.coverageFound ? 'Coverage found' : 'Coverage inactive'}
            </span>
          </div>
          <div className="flex flex-col gap-4 p-5">
            {/* patient + provider */}
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-[#1669c1]">
                {vm.patient.initials}
              </span>
              <div>
                <div className="text-base font-bold text-gray-900">{vm.patient.name}</div>
                <div className="text-[13px] text-gray-500">
                  DOB {vm.patient.dob} · Member ID {vm.patient.memberId}
                </div>
              </div>
              <div className="ml-auto text-right text-[13px] text-gray-500">
                Ordering provider
                <br />
                <b className="text-gray-800">{vm.provider}</b>
              </div>
            </div>

            {/* order */}
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-lg">
                🩺
              </span>
              <div>
                <div className="text-[14.5px] font-semibold text-gray-900">{vm.order.desc}</div>
                <div className="mt-0.5 text-[13px] text-gray-500">
                  CPT <b className="font-mono text-gray-800">{vm.order.cpt}</b>
                  {vm.order.dxCode && (
                    <>
                      {' '}
                      · Diagnosis <b className="font-mono text-gray-800">{vm.order.dxCode}</b>{' '}
                      {vm.order.dxLabel}
                    </>
                  )}
                </div>
                <div className="mt-0.5 text-[13px] text-gray-500">Ordered {vm.order.orderedOn}</div>
              </div>
            </div>

            {/* PA banner */}
            {vm.paRequired && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                <span className="text-lg">⚠️</span>
                <div>
                  <div className="text-[13px] font-bold uppercase tracking-wide text-amber-700">
                    Prior authorization required
                  </div>
                  <div className="text-[13px] text-gray-600">
                    Determined from the plan&apos;s published coverage rule for CPT {vm.order.cpt}.
                  </div>
                </div>
              </div>
            )}

            {/* determination grid */}
            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 sm:grid-cols-5">
              {vm.determination.map((c) => (
                <div key={c.label} className="border-b border-r border-gray-200 px-4 py-3.5">
                  <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                    {c.label}
                  </div>
                  <div
                    className={`flex items-center gap-1.5 text-[13.5px] font-semibold ${TONE[c.tone]}`}
                  >
                    <span className="text-current">
                      {c.tone === 'warn' ? '●' : c.tone === 'ok' ? '✓' : '•'}
                    </span>
                    <span className="text-gray-900">{c.value}</span>
                  </div>
                  {c.sub && <div className="mt-0.5 text-[11.5px] text-gray-500">{c.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Benefits card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Eligibility &amp; benefits</h3>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
              source · {vm.benefits.source}
            </span>
          </div>
          <div className="p-5">
            <table className="w-full text-[13.5px]">
              <tbody>
                {vm.benefits.rows.map((r) => (
                  <tr key={r.label} className="border-b border-gray-100 last:border-0">
                    <td className="w-[42%] py-2 pr-3 align-top text-gray-500">{r.label}</td>
                    <td
                      className={`py-2 align-top text-gray-800 ${r.label === 'Reference ID' ? 'font-mono' : ''}`}
                    >
                      {r.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Next steps card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Next steps</h3>
          </div>
          <div className="p-5">
            <ol className="space-y-0">
              <Step
                done
                n="✓"
                h="Coverage checked"
                p="PA required; documentation needed. Rule + form identified."
              />
              <Step
                n="2"
                h="Complete documentation"
                p="Launch the DTR form (SMART on FHIR) — pre-filled from the chart, carrying order + patient + coverage."
              />
              <Step
                n="3"
                h="Submit authorization"
                p="Send the request to the payer (PAS) once documentation resolves."
                last
              />
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={onComplete}
                className="rounded-lg bg-[#1669c1] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0f52a0]"
              >
                Complete documentation →
              </button>
              <div className="flex flex-col">
                <button
                  disabled
                  title="Available after documentation is complete"
                  className="cursor-not-allowed rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-400"
                >
                  Submit authorization
                </button>
                <span className="mt-1 text-[11.5px] text-gray-400">
                  Available after documentation is complete
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="space-y-5">
        {/* Interactive requirements/plan/clinical/history tabs (see CrdRequirementsTabs). */}
        <CrdRequirementsTabs vm={vm} />

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">
              How requirements were determined
            </h3>
          </div>
          <div className="p-5">
            <p className="mb-3 text-[12.5px] text-gray-400">
              From the order details, diagnosis codes, plan rules, and the payer-configured clinical
              guideline — the published CRD coverage rule for this code.
            </p>
            <table className="w-full text-[13.5px]">
              <tbody>
                {[
                  ['Plan rules', 'updated 08/15/2026'],
                  ['Clinical guideline', vm.clinicalGuideline ?? '—'],
                  ['Provider data', 'EHR (SMART on FHIR)'],
                  ['Patient eligibility', 'Real-time (270/271)'],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-100 last:border-0">
                    <td className="w-[42%] py-2 pr-3 align-top text-gray-500">{k}</td>
                    <td className="py-2 align-top text-gray-800">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {!single && <p className="text-center text-[11px] text-gray-400">CPT {vm.order.cpt}</p>}
      </div>
    </div>
  );
}

function Step({
  n,
  h,
  p,
  done,
  last,
}: {
  n: string;
  h: string;
  p: string;
  done?: boolean;
  last?: boolean;
}) {
  return (
    <li className={`flex gap-3 py-2.5 ${last ? '' : 'border-b border-dashed border-gray-100'}`}>
      <span
        className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12.5px] font-bold ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-[#1669c1]'}`}
      >
        {n}
      </span>
      <div>
        <div className="text-[13.5px] font-semibold text-gray-900">{h}</div>
        <div className="text-[12.5px] text-gray-500">{p}</div>
      </div>
    </li>
  );
}
