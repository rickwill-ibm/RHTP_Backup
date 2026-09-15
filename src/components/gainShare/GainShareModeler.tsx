'use client';
/**
 * GainShareModeler — the MODELLED half of gain-share, replacing the static iframe mock with a real
 * sim-anchored React board. The TCOC shared-savings wedge is illustrative (the sim has no attribution /
 * risk-adjusted benchmark / run-out), so every actuarial input is HELD CONSTANT and labelled, the ladder
 * is the HCP-LAN taxonomy, gating is real Medicaid logic (minimum savings rate + quality gate), and a
 * governance chip states that splits can't move without actuarial certification + CMS 438.6(c) approval.
 *
 * The one REAL number on this board — payment-integrity recovery — is carried in from the pinned recon
 * epoch and shown QUARANTINED (already in the MLR numerator; never part of the split). One shared epoch.
 *
 * CLIENT-SAFE: pure economics + shared sim only.
 */
import { useMemo, useState } from 'react';
import {
  LAN_TIERS,
  HELD_CONSTANT,
  defaultModel,
  computeVbcScenario,
  fmtUsd,
  fmtUsdCompact,
  type ContractModel,
  type LanTierId,
  type RecoveryRoi,
} from '@/lib/gainShare/gainShareEconomics';

type Slot = 'A' | 'B' | 'C';

/** `recovery` is the SAME pinned RecoveryRoi the ROI panel shows — one shared epoch, passed by the parent. */
export function GainShareModeler({ recovery }: { recovery: RecoveryRoi }): React.ReactElement {
  const [model, setModel] = useState<ContractModel>(() => defaultModel('cat3a'));
  const [saved, setSaved] = useState<Partial<Record<Slot, ContractModel>>>({});
  const v = useMemo(() => computeVbcScenario(model), [model]);
  const set = <K extends keyof ContractModel>(k: K, val: ContractModel[K]): void =>
    setModel((m) => ({ ...m, [k]: val }));
  const pickTier = (id: LanTierId): void => setModel(defaultModel(id));

  const providerFrac = v.sharedPoolPmpm > 0 ? v.providerPmpm / v.sharedPoolPmpm : 0;

  return (
    <section className="space-y-4 rounded-lg border border-carbon-gray-20 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Gain-share scenario modeler · illustrative</h2>
          <p className="text-[11px] text-carbon-gray-60">
            TCOC shared savings on a risk-adjusted benchmark. Every figure below is modelled;
            actuarial inputs are held constant.
          </p>
        </div>
        <span
          className="rounded border border-[#d4bbff] bg-[#f6f2ff] px-2 py-1 text-[10px] font-semibold text-[#6929c4]"
          title="This is pre-certification scenario modelling"
        >
          ⚖ Pre-certification — splits require actuarial certification (438.4 / 438.7) + CMS
          438.6(c) approval
        </span>
      </div>

      {/* LAN ladder picker */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Risk-transfer rung · HCP-LAN APM framework
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LAN_TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTier(t.id)}
              aria-pressed={t.id === model.tierId}
              className={`rounded-lg border px-3 py-1.5 text-left transition ${t.id === model.tierId ? 'border-carbon-blue bg-carbon-blue-lighter' : 'border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
            >
              <span className="mono block text-[9px] font-bold text-carbon-blue">{t.lan}</span>
              <span className="block text-[11px] font-semibold text-carbon-gray-90">{t.name}</span>
              <span className="block text-[9px] text-carbon-gray-50">
                {t.twoSided ? 'two-sided (downside)' : 'upside-only'}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-carbon-gray-60">{v.tier.note}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Levers */}
        <div className="space-y-2 rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Assumption levers
          </p>
          <Lever label="Attributed member-months" hint="held constant · illustrative denominator">
            <input
              type="number"
              min={1000}
              step={1000}
              value={model.memberMonths}
              onChange={(e) => set('memberMonths', Math.max(1000, Number(e.target.value) || 0))}
              className="w-28 rounded border border-carbon-gray-30 px-1.5 py-0.5 text-right text-[11px]"
            />
          </Lever>
          <Lever
            label={`Provider share — ${Math.round(model.providerSharePct * 100)}%`}
            hint="of the qualifying pool"
          >
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(model.providerSharePct * 100)}
              onChange={(e) => set('providerSharePct', Number(e.target.value) / 100)}
              className="w-32"
            />
          </Lever>
          <Lever label="Upfront PMPM infra" hint="funds the provider build">
            <input
              type="number"
              min={0}
              step={0.5}
              value={model.pmpmInfra}
              onChange={(e) => set('pmpmInfra', Math.max(0, Number(e.target.value) || 0))}
              className="w-20 rounded border border-carbon-gray-30 px-1.5 py-0.5 text-right text-[11px]"
            />
          </Lever>
          <Lever
            label={`Minimum savings rate — ${(model.minSavingsRatePct * 100).toFixed(1)}%`}
            hint="below MSR nothing is shared"
          >
            <input
              type="range"
              min={0}
              max={80}
              value={Math.round(model.minSavingsRatePct * 1000)}
              onChange={(e) => set('minSavingsRatePct', Number(e.target.value) / 1000)}
              className="w-32"
            />
          </Lever>
          <Lever
            label={`Annual rebasing — ${(model.rebasePct * 100).toFixed(1)}%`}
            hint="compresses future savings"
          >
            <input
              type="range"
              min={0}
              max={60}
              value={Math.round(model.rebasePct * 1000)}
              onChange={(e) => set('rebasePct', Number(e.target.value) / 1000)}
              className="w-32"
            />
          </Lever>
          <label className="flex items-center justify-between gap-2 text-[11px] text-carbon-gray-80">
            <span>
              Rebasing-protection{' '}
              <span className="text-[9px] text-carbon-gray-40">(keep earned gains)</span>
            </span>
            <input
              type="checkbox"
              checked={model.rebaseProtected}
              onChange={(e) => set('rebaseProtected', e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-carbon-gray-80">
            <span>
              Quality gate met{' '}
              <span className="text-[9px] text-carbon-gray-40">(else share forfeited)</span>
            </span>
            <input
              type="checkbox"
              checked={model.qualityGateMet}
              onChange={(e) => set('qualityGateMet', e.target.checked)}
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

        {/* Outputs */}
        <div className="space-y-3">
          {/* Savings split bar */}
          <div className="rounded-lg border border-carbon-gray-20 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-carbon-gray-90">
                Shared-savings split · PMPM{' '}
                <span className="text-[9px] font-normal text-carbon-gray-40">(illustrative)</span>
              </p>
              <span className="mono text-[10px] text-carbon-gray-50">
                benchmark ${v.benchmarkPmpm} · actual ${v.actualPmpm} · gross ${v.grossSavingsPmpm}
              </span>
            </div>
            {v.qualifies ? (
              <>
                <div className="mt-2 flex h-7 w-full overflow-hidden rounded border border-carbon-gray-20 bg-carbon-gray-10">
                  <div
                    className="flex items-center justify-center bg-[#a7f0ba] text-[10px] font-semibold text-[#0e6027]"
                    style={{ width: `${Math.max(6, providerFrac * 100)}%` }}
                    title="Provider share"
                  >
                    Provider ${v.providerPmpm}
                  </div>
                  <div
                    className="flex items-center justify-center bg-[#a6c8ff] text-[10px] font-semibold text-[#0043ce]"
                    style={{ width: `${Math.max(6, (1 - providerFrac) * 100)}%` }}
                    title="Payer retained"
                  >
                    Payer ${v.payerPmpm}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile
                    label="Shared pool / mo"
                    value={fmtUsdCompact(v.poolTotalUsd)}
                    sub={`$${v.sharedPoolPmpm} PMPM`}
                  />
                  <Tile
                    label="Provider / mo"
                    value={fmtUsdCompact(v.providerTotalUsd)}
                    sub={`+ $${v.infraPmpm} infra PMPM`}
                    tone="green"
                  />
                  <Tile
                    label="Payer / mo"
                    value={fmtUsdCompact(v.payerTotalUsd)}
                    sub={`$${v.payerPmpm} PMPM`}
                    tone="blue"
                  />
                  <Tile
                    label="Member-months"
                    value={v.model.memberMonths.toLocaleString()}
                    sub="held constant"
                  />
                </div>
              </>
            ) : (
              <p className="mt-2 rounded border-l-4 border-[#da1e28] bg-carbon-red-light p-2 text-[11px] font-semibold text-carbon-red">
                Pool = $0 · {v.gateReason}
              </p>
            )}
          </div>

          {/* Quarantined REAL recovery — never in the split */}
          <div className="rounded-lg border border-[#ffb3b8] bg-[#fff1f1] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-carbon-red">
                Payment-integrity recovery · real — quarantined
              </p>
              <span className="mono rounded bg-white px-1.5 py-0.5 text-[9px] text-carbon-gray-60">
                as of seq {recovery.epoch.ledgerSeq}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-carbon-gray-70">
              <span className="mono font-semibold text-carbon-red">
                {fmtUsd(recovery.realizedUsd)}
              </span>{' '}
              realized recovery +{' '}
              <span className="mono font-semibold text-carbon-red">
                {fmtUsd(recovery.returnableUsd)}
              </span>{' '}
              returnable. Already in the MLR numerator —{' '}
              <span className="font-semibold">never counted as shared savings</span>. Shown here
              only to keep the two money stories side-by-side, not summed.
            </p>
          </div>

          {/* Multi-year rebasing */}
          <div className="overflow-x-auto rounded-lg border border-carbon-gray-20 p-3">
            <p className="mb-1 text-[11px] font-semibold text-carbon-gray-90">
              Multi-year rebasing{' '}
              <span className="text-[9px] font-normal text-carbon-gray-40">
                (illustrative — benchmark{' '}
                {model.rebaseProtected
                  ? 'protected'
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
                </tr>
              </thead>
              <tbody className="mono">
                {v.rebasing.map((r) => (
                  <tr key={r.year} className="border-t border-carbon-gray-10">
                    <td className="py-0.5">Y{r.year}</td>
                    <td>${r.benchmarkPmpm}</td>
                    <td>${r.grossSavingsPmpm}</td>
                    <td>${r.sharedPoolPmpm}</td>
                    <td className="text-[#0e6027]">${r.providerPmpm}</td>
                    <td className="text-[#0043ce]">${r.payerPmpm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* A/B/C save + compare */}
          <div className="rounded-lg border border-carbon-gray-20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                Save scenario
              </p>
              {(['A', 'B', 'C'] as Slot[]).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSaved((sv) => ({ ...sv, [slot]: model }))}
                  className="rounded border border-carbon-gray-30 px-2 py-0.5 text-[11px] font-semibold text-carbon-gray-70 hover:bg-carbon-gray-10"
                >
                  Save {slot}
                </button>
              ))}
            </div>
            {(['A', 'B', 'C'] as Slot[]).some((s) => saved[s]) && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="text-carbon-gray-50">
                      <th className="font-semibold">Scenario</th>
                      <th className="font-semibold">Rung</th>
                      <th className="font-semibold">Pool PMPM</th>
                      <th className="font-semibold">Provider /mo</th>
                      <th className="font-semibold">Payer /mo</th>
                      <th className="font-semibold">Gate</th>
                    </tr>
                  </thead>
                  <tbody className="mono">
                    {(['A', 'B', 'C'] as Slot[])
                      .filter((s) => saved[s])
                      .map((slot) => {
                        const sv = computeVbcScenario(saved[slot]!);
                        return (
                          <tr key={slot} className="border-t border-carbon-gray-10">
                            <td className="py-0.5 font-semibold">{slot}</td>
                            <td>{sv.tier.lan}</td>
                            <td>${sv.sharedPoolPmpm}</td>
                            <td className="text-[#0e6027]">{fmtUsdCompact(sv.providerTotalUsd)}</td>
                            <td className="text-[#0043ce]">{fmtUsdCompact(sv.payerTotalUsd)}</td>
                            <td>{sv.qualifies ? '✓' : '✗ gated'}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Lever({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-carbon-gray-80">
        {label}
        <span className="block text-[9px] text-carbon-gray-40">{hint}</span>
      </span>
      {children}
    </div>
  );
}
function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'green' | 'blue';
}): React.ReactElement {
  const color = tone === 'green' ? '#0e6027' : tone === 'blue' ? '#0043ce' : '#161616';
  return (
    <div className="rounded border border-carbon-gray-20 p-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        {label}
      </p>
      <p className="num text-base" style={{ color }}>
        {value}
      </p>
      <p className="text-[9px] text-carbon-gray-50">{sub}</p>
    </div>
  );
}
