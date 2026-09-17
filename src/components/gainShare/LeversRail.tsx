'use client';
/**
 * LeversRail — the assumption levers + held-constant chips for the VBC modeler, extracted from
 * GainShareModeler. Every control is PROGRAMMATICALLY LABELLED (coalition a11y fix): the `Lever` helper
 * renders a real <label htmlFor> bound to the input's id (was a bare <span>, so inputs were unlabeled),
 * and every slider carries aria-valuetext so a screen reader announces the value in domain units.
 *
 * The NEW "performance vs benchmark" lever pushes actual PMPM above/below the rung benchmark — on a
 * two-sided tier a positive push drives actual > benchmark, which SplitOutputPanel renders as the
 * provider owing its downside share (clamped by stop-loss).
 *
 * CLIENT-SAFE: pure economics data + presentational helpers only. No barrel, no node:crypto.
 */
import {
  HELD_CONSTANT,
  type ContractModel,
  type VbcScenario,
} from '@/lib/gainShare/gainShareEconomics';

export function LeversRail({
  model,
  v,
  onSet,
}: {
  model: ContractModel;
  v: VbcScenario;
  onSet: <K extends keyof ContractModel>(k: K, val: ContractModel[K]) => void;
}): React.ReactElement {
  const providerPct = Math.round(model.providerSharePct * 100);
  const msrPct = (model.minSavingsRatePct * 100).toFixed(1);
  const rebasePct = (model.rebasePct * 100).toFixed(1);
  return (
    <div className="space-y-2 rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        Assumption levers
      </p>

      <Lever
        htmlFor="lev-mm"
        label="Attributed member-months"
        hint="held constant · annual denominator"
      >
        <input
          id="lev-mm"
          type="number"
          min={1000}
          step={1000}
          value={model.memberMonths}
          onChange={(e) => onSet('memberMonths', Math.max(1000, Number(e.target.value) || 0))}
          className="w-28 rounded border border-carbon-gray-30 px-1.5 py-0.5 text-right text-[11px]"
        />
      </Lever>

      <Lever
        htmlFor="lev-share"
        label={`Provider share — ${providerPct}%`}
        hint="of the qualifying pool"
      >
        <input
          id="lev-share"
          type="range"
          min={0}
          max={100}
          value={providerPct}
          aria-valuetext={`${providerPct} percent provider share`}
          onChange={(e) => onSet('providerSharePct', Number(e.target.value) / 100)}
          className="w-32"
        />
      </Lever>

      <Lever
        htmlFor="lev-perf"
        label={`Performance vs benchmark — ${model.actualDeltaPmpm >= 0 ? '+' : ''}$${model.actualDeltaPmpm} PMPM`}
        hint={
          v.twoSided
            ? 'push actual above benchmark → provider owes downside'
            : 'upside-only: actual above benchmark just floors the pool at $0'
        }
      >
        <input
          id="lev-perf"
          type="range"
          min={-30}
          max={120}
          step={1}
          value={model.actualDeltaPmpm}
          aria-valuetext={`${model.actualDeltaPmpm >= 0 ? 'plus ' : 'minus '}$${Math.abs(model.actualDeltaPmpm)} PMPM versus benchmark; effective actual $${v.actualPmpm} PMPM`}
          onChange={(e) => onSet('actualDeltaPmpm', Number(e.target.value))}
          className="w-32"
        />
      </Lever>

      <Lever
        htmlFor="lev-infra"
        label="Upfront PMPM infra"
        hint="payer cost — funds the provider build"
      >
        <input
          id="lev-infra"
          type="number"
          min={0}
          step={0.5}
          value={model.pmpmInfra}
          onChange={(e) => onSet('pmpmInfra', Math.max(0, Number(e.target.value) || 0))}
          className="w-20 rounded border border-carbon-gray-30 px-1.5 py-0.5 text-right text-[11px]"
        />
      </Lever>

      <Lever
        htmlFor="lev-msr"
        label={`Minimum savings rate — ${msrPct}%`}
        hint="below MSR nothing is shared"
      >
        <input
          id="lev-msr"
          type="range"
          min={0}
          max={80}
          value={Math.round(model.minSavingsRatePct * 1000)}
          aria-valuetext={`${msrPct} percent minimum savings rate`}
          onChange={(e) => onSet('minSavingsRatePct', Number(e.target.value) / 1000)}
          className="w-32"
        />
      </Lever>

      <Lever
        htmlFor="lev-rebase"
        label={`Annual rebasing — ${rebasePct}%`}
        hint="compresses future savings"
      >
        <input
          id="lev-rebase"
          type="range"
          min={0}
          max={60}
          value={Math.round(model.rebasePct * 1000)}
          aria-valuetext={`${rebasePct} percent annual benchmark rebasing`}
          onChange={(e) => onSet('rebasePct', Number(e.target.value) / 1000)}
          className="w-32"
        />
      </Lever>

      <label
        htmlFor="lev-reprot"
        className="flex items-center justify-between gap-2 text-[11px] text-carbon-gray-80"
      >
        <span>
          Rebasing-protection{' '}
          <span className="text-[9px] text-carbon-gray-40">(keep earned gains)</span>
        </span>
        <input
          id="lev-reprot"
          type="checkbox"
          checked={model.rebaseProtected}
          onChange={(e) => onSet('rebaseProtected', e.target.checked)}
        />
      </label>

      <label
        htmlFor="lev-quality"
        className="flex items-center justify-between gap-2 text-[11px] text-carbon-gray-80"
      >
        <span>
          Quality gate met{' '}
          <span className="text-[9px] text-carbon-gray-40">(else share forfeited)</span>
        </span>
        <input
          id="lev-quality"
          type="checkbox"
          checked={model.qualityGateMet}
          onChange={(e) => onSet('qualityGateMet', e.target.checked)}
        />
      </label>

      <div className="mt-1 border-t border-carbon-gray-20 pt-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-40">
          Held constant (illustrative)
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {HELD_CONSTANT.map((h) => (
            <span
              key={h.key}
              className="rounded bg-white px-1 text-[8px] text-carbon-gray-60"
              title={h.note}
            >
              {h.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A labelled lever row — the label is a real <label htmlFor> bound to the control's id (a11y fix). */
function Lever({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[11px] text-carbon-gray-80">
        {label}
        <span className="block text-[9px] text-carbon-gray-40">{hint}</span>
      </label>
      {children}
    </div>
  );
}
