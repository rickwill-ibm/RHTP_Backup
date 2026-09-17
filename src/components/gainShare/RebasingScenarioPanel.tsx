'use client';
/**
 * RebasingScenarioPanel — the multi-year rebasing table + the A/B/C save-and-compare grid, extracted
 * from GainShareModeler. The table caption states the ACTIVE regime unmistakably (protected vs rebasing
 * N%/yr) so three flat rows read as a deliberate choice, not a bug (coalition fix — rebasing-protection
 * now defaults OFF so the compression story is visible by default).
 *
 * CLIENT-SAFE: pure economics + presentational helpers only. No `@/lib/evidence` barrel, no node:crypto.
 */
import {
  computeVbcScenario,
  fmtUsdCompact,
  type ContractModel,
  type VbcScenario,
} from '@/lib/gainShare/gainShareEconomics';

export type Slot = 'A' | 'B' | 'C';
const SLOTS: readonly Slot[] = ['A', 'B', 'C'];

export function RebasingScenarioPanel({
  model,
  v,
  saved,
  onSave,
}: {
  model: ContractModel;
  v: VbcScenario;
  saved: Partial<Record<Slot, ContractModel>>;
  onSave: (slot: Slot) => void;
}): React.ReactElement {
  const anySaved = SLOTS.some((s) => saved[s]);
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-carbon-gray-20 p-3">
        <p className="mb-1 text-[11px] font-semibold text-carbon-gray-90">
          Multi-year rebasing{' '}
          <span className="text-[9px] font-normal text-carbon-gray-40">
            (illustrative — benchmark{' '}
            {model.rebaseProtected
              ? 'PROTECTED (held)'
              : `rebases ${(model.rebasePct * 100).toFixed(1)}%/yr`}
            )
          </span>
        </p>
        <table className="w-full text-left text-[10px]">
          <thead>
            <tr className="text-carbon-gray-50">
              <th className="py-0.5 font-semibold">Year</th>
              <th className="font-semibold">Benchmark</th>
              <th className="font-semibold">Gross savings</th>
              <th className="font-semibold">Shared pool</th>
              <th className="font-semibold">Provider</th>
              <th className="font-semibold">Payer</th>
              {v.twoSided && <th className="font-semibold text-carbon-red">Provider owes</th>}
            </tr>
          </thead>
          <tbody className="mono">
            {v.rebasing.map((r) => (
              <tr key={r.year} className="border-t border-carbon-gray-10">
                <td className="py-0.5">Y{r.year}</td>
                <td>${r.benchmarkPmpm}</td>
                <td>${r.grossSavingsPmpm}</td>
                <td>${r.sharedPoolPmpm}</td>
                <td className="text-[#6929c4]">${r.providerPmpm}</td>
                <td className="text-[#684e00]">${r.payerPmpm}</td>
                {v.twoSided && (
                  <td
                    className={r.providerLiabilityPmpm > 0 ? 'font-semibold text-carbon-red' : ''}
                  >
                    {r.providerLiabilityPmpm > 0 ? `−$${r.providerLiabilityPmpm}` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!model.rebaseProtected && v.rebasing[2].sharedPoolPmpm < v.rebasing[0].sharedPoolPmpm && (
          <p className="mt-1 text-[9px] text-carbon-gray-50">
            The benchmark rebases down toward last period&apos;s actual, so the shared pool
            compresses Y1 → Y3. Turn on rebasing-protection to keep the provider&apos;s earned
            gains.
          </p>
        )}
        {v.rebasing.some((r) => r.providerLiabilityPmpm > 0) && (
          <p className="mt-1 text-[9px] font-semibold text-carbon-red">
            Two-sided downside: the provider owes its (stop-loss-capped) share of the overspend each
            year it runs over benchmark — a loss compounds across years just as savings compress.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-carbon-gray-20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Save scenario
          </p>
          {SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => onSave(slot)}
              className="rounded border border-carbon-gray-30 px-2 py-0.5 text-[11px] font-semibold text-carbon-gray-70 hover:bg-carbon-gray-10"
            >
              Save {slot}
            </button>
          ))}
        </div>
        {anySaved && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[10px]">
              <thead>
                <tr className="text-carbon-gray-50">
                  <th className="font-semibold">Scenario</th>
                  <th className="font-semibold">Rung</th>
                  <th className="font-semibold">Pool PMPM</th>
                  <th className="font-semibold">Provider / yr (net)</th>
                  <th className="font-semibold">Payer / yr (net)</th>
                  <th className="font-semibold">Gate</th>
                </tr>
              </thead>
              <tbody className="mono">
                {SLOTS.filter((s) => saved[s]).map((slot) => {
                  const sv: VbcScenario = computeVbcScenario(saved[slot]!);
                  return (
                    <tr key={slot} className="border-t border-carbon-gray-10">
                      <td className="py-0.5 font-semibold">{slot}</td>
                      <td>{sv.tier.lan}</td>
                      <td>${sv.sharedPoolPmpm}</td>
                      <td className="text-[#6929c4]">{fmtUsdCompact(sv.providerNetTotalUsd)}</td>
                      <td className="text-[#684e00]">{fmtUsdCompact(sv.payerNetTotalUsd)}</td>
                      <td>{sv.qualifies ? '✓' : sv.owes ? '⇩ owes' : '✗ gated'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
