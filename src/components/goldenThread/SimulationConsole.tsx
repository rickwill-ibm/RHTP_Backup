'use client';

/**
 * SimulationConsole — Wave-5 UI. The interactive recovery-policy simulator. Two modes:
 *
 *   • REAL-TIME scenario — pick a scenario from a dropdown; move the policy levers and
 *     watch the Twin-Ladder interlock and the routing outcome recompute live.
 *   • BATCH simulation — run a cohort (dropdown of batch examples) and see the aggregate
 *     $ impact and the tier/rung distribution, with a before/after delta vs the baseline
 *     policy and an explicit twin-ladder insight (autonomy vs evidence as the constraint).
 *
 * Every number comes from the REAL governance functions (`reconcile`, `permittedRung`)
 * via `recoverySimulation.ts` — nothing is fabricated. Seed/synthetic data: the figures
 * demonstrate the mechanism and policy sensitivity, not a real book of business.
 */
import { useMemo, useState } from 'react';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import { TwinLadderInterlock } from './TwinLadderInterlock';
import { ScenarioTable } from './ScenarioTable';
import {
  SCENARIOS,
  BATCHES,
  DEFAULT_POLICY,
  CATEGORY_LABEL,
  scenarioById,
  batchById,
  simulateScenario,
  simulateCohort,
  type RecoveryPolicy,
} from '@/lib/goldenThread/recoverySimulation';

const AUTONOMY_TIERS: AutonomyTier[] = ['HITL', 'HOTL', 'autonomous'];
const MATERIALITY_OPTIONS = [5, 25, 50, 100];
const FILING_OPTIONS = [30, 60, 120, 180];
const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function SimulationConsole(): React.ReactElement {
  const [mode, setMode] = useState<'realtime' | 'batch'>('realtime');
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [batchId, setBatchId] = useState(BATCHES[0].id);
  const [autonomyCeiling, setAutonomy] = useState<AutonomyTier>(DEFAULT_POLICY.autonomyCeiling);
  const [materialityAbs, setMateriality] = useState(DEFAULT_POLICY.materialityAbs);
  const [filingWindowDays, setFiling] = useState(DEFAULT_POLICY.filingWindowDays);

  const policy: RecoveryPolicy = {
    autonomyCeiling,
    materialityAbs,
    filingWindowDays,
    asOf: DEFAULT_POLICY.asOf,
  };

  return (
    <section className="space-y-4 rounded-lg border border-carbon-gray-20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Recovery policy simulator</h2>
          <p className="text-xs text-carbon-gray-50">
            Scenarios and cohorts run through the real reconciliation + Twin-Ladder interlock. Move
            the policy levers to see the impact.
          </p>
        </div>
        <div className="flex rounded-md border border-carbon-gray-20 p-0.5 text-sm">
          {(['realtime', 'batch'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 font-medium ${
                mode === m
                  ? 'bg-carbon-blue text-white'
                  : 'text-carbon-gray-70 hover:bg-carbon-gray-10'
              }`}
            >
              {m === 'realtime' ? 'Real-time scenario' : 'Batch simulation'}
            </button>
          ))}
        </div>
      </div>

      <PolicyLevers
        autonomyCeiling={autonomyCeiling}
        materialityAbs={materialityAbs}
        filingWindowDays={filingWindowDays}
        onAutonomy={setAutonomy}
        onMateriality={setMateriality}
        onFiling={setFiling}
      />

      {mode === 'realtime' ? (
        <RealTimePanel scenarioId={scenarioId} onScenario={setScenarioId} policy={policy} />
      ) : (
        <BatchPanel batchId={batchId} onBatch={setBatchId} policy={policy} />
      )}
    </section>
  );
}

function PolicyLevers(props: {
  autonomyCeiling: AutonomyTier;
  materialityAbs: number;
  filingWindowDays: number;
  onAutonomy: (t: AutonomyTier) => void;
  onMateriality: (n: number) => void;
  onFiling: (n: number) => void;
}): React.ReactElement {
  return (
    <div className="grid gap-3 rounded border border-carbon-gray-20 bg-carbon-gray-10 p-3 sm:grid-cols-3">
      <label className="text-xs font-medium text-carbon-gray-70">
        Agent autonomy tier (Twin Ladder)
        <select
          value={props.autonomyCeiling}
          onChange={(e) => props.onAutonomy(e.target.value as AutonomyTier)}
          className="mt-1 block w-full rounded border border-carbon-gray-20 bg-white px-2 py-1 text-sm"
        >
          {AUTONOMY_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-carbon-gray-70">
        Materiality floor
        <select
          value={props.materialityAbs}
          onChange={(e) => props.onMateriality(Number(e.target.value))}
          className="mt-1 block w-full rounded border border-carbon-gray-20 bg-white px-2 py-1 text-sm"
        >
          {MATERIALITY_OPTIONS.map((n) => (
            <option key={n} value={n}>
              ${n}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-carbon-gray-70">
        Timely-filing window
        <select
          value={props.filingWindowDays}
          onChange={(e) => props.onFiling(Number(e.target.value))}
          className="mt-1 block w-full rounded border border-carbon-gray-20 bg-white px-2 py-1 text-sm"
        >
          {FILING_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} days
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function RealTimePanel(props: {
  scenarioId: string;
  onScenario: (id: string) => void;
  policy: RecoveryPolicy;
}): React.ReactElement {
  const scenario = scenarioById(props.scenarioId);
  const result = useMemo(() => simulateScenario(scenario, props.policy), [scenario, props.policy]);

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-carbon-gray-70">
        Scenario
        <select
          value={props.scenarioId}
          onChange={(e) => props.onScenario(e.target.value)}
          className="mt-1 block w-full rounded border border-carbon-gray-20 bg-white px-2 py-1.5 text-sm"
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2 sm:grid-cols-3">
        <Tile label="Contracted allowed" value={money(scenario.contractedAllowed)} />
        <Tile label="Payer paid" value={money(scenario.paidAmount)} />
        <Tile
          label="Verdict"
          value={result.verdict}
          tone={result.verdict === 'underpaid' ? 'amber' : 'slate'}
        />
      </div>

      <TwinLadderInterlock
        evidenceTier={scenario.evidenceTier}
        manifestTier={props.policy.autonomyCeiling}
        grantedRung={result.rung}
        requiresHumanForSubmission={result.submissionRequiresHuman}
      />

      <div
        className={`rounded border p-3 text-sm ${
          result.recoverable
            ? 'border-carbon-green bg-carbon-green-light'
            : 'border-carbon-gray-20 bg-carbon-gray-10'
        }`}
      >
        <p className="font-semibold">{CATEGORY_LABEL[result.category]}</p>
        {result.verdict === 'underpaid' ? (
          <p className="mt-1 text-carbon-gray-70">
            Recoverable shortfall {money(result.delta)} · agent authority{' '}
            <span className="font-mono">{result.rung}</span> · submission human-gated.
          </p>
        ) : null}
        {result.tierCapped ? (
          <p className="mt-1 text-xs text-carbon-blue">
            Twin-ladder: evidence at {scenario.evidenceTier} is the binding constraint — raising the
            agent&apos;s autonomy tier would NOT increase its authority on this case. Stronger
            evidence would.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BatchPanel(props: {
  batchId: string;
  onBatch: (id: string) => void;
  policy: RecoveryPolicy;
}): React.ReactElement {
  const batch = batchById(props.batchId);
  const current = useMemo(
    () => simulateCohort(batch.scenarios, props.policy),
    [batch, props.policy]
  );
  const baseline = useMemo(() => simulateCohort(batch.scenarios, DEFAULT_POLICY), [batch]);
  // Twin-ladder probe: what would MAX autonomy change vs the current setting?
  const atMaxAutonomy = useMemo(
    () => simulateCohort(batch.scenarios, { ...props.policy, autonomyCeiling: 'autonomous' }),
    [batch, props.policy]
  );
  const deltaRecoverable = current.recoverableDollars - baseline.recoverableDollars;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-carbon-gray-70">
        Batch
        <select
          value={props.batchId}
          onChange={(e) => props.onBatch(e.target.value)}
          className="mt-1 block w-full rounded border border-carbon-gray-20 bg-white px-2 py-1.5 text-sm"
        >
          {BATCHES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2 sm:grid-cols-4">
        <Tile label="Claims in cohort" value={String(current.count)} />
        <Tile label="Underpayment identified" value={money(current.identifiedDollars)} />
        <Tile
          label="Recoverable"
          value={money(current.recoverableDollars)}
          sub={
            deltaRecoverable !== 0
              ? `${deltaRecoverable > 0 ? '+' : ''}${money(deltaRecoverable)} vs baseline`
              : 'baseline'
          }
          tone="green"
        />
        <Tile label="Past filing window" value={money(current.pastWindowDollars)} tone="amber" />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Tile
          label="Recoverable claims"
          value={String(
            current.byCategory['recoverable-agent-draft'] + current.byCategory['recoverable-manual']
          )}
        />
        <Tile label="PA-denied" value={String(current.byCategory['not-recoverable-pa'])} />
        <Tile label="Past window" value={String(current.byCategory['past-window'])} />
        <Tile
          label="Evidence-capped"
          value={String(current.tierCappedCount)}
          tone="blue"
          sub="autonomy blocked by tier"
        />
      </div>

      <Distribution
        title="Evidence tier (D0→D3)"
        data={current.byTier as Record<string, number>}
        order={['D0', 'D1', 'D2', 'D3']}
      />
      <Distribution
        title="Authority rung (A0→A3)"
        data={current.byRung as Record<string, number>}
        order={['A0', 'A1', 'A2', 'A3']}
      />

      <div className="rounded border border-carbon-blue-light bg-carbon-blue-lighter p-3 text-xs text-carbon-blue">
        <p className="font-semibold">Twin-ladder insight</p>
        <p className="mt-1">
          At maximum autonomy this cohort&apos;s recoverable dollars change by{' '}
          <span className="font-semibold">
            {money(atMaxAutonomy.recoverableDollars - current.recoverableDollars)}
          </span>{' '}
          — recovery is human-gated regardless of rung, and {current.tierCappedCount} of{' '}
          {current.underpaidCount} underpayments are evidence-capped. The lever that unlocks value
          is stronger evidence (a higher tier), not more agent autonomy.
        </p>
      </div>

      <ScenarioTable current={current} />
    </div>
  );
}

function Distribution({
  title,
  data,
  order,
}: {
  title: string;
  data: Record<string, number>;
  order: string[];
}): React.ReactElement {
  const max = Math.max(1, ...order.map((k) => data[k] ?? 0));
  return (
    <div className="text-xs">
      <p className="mb-1 font-medium text-carbon-gray-70">{title}</p>
      <div className="space-y-1">
        {order.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-7 font-mono text-carbon-gray-50">{k}</span>
            <div className="h-4 flex-1 rounded bg-carbon-gray-10">
              <div
                className="h-4 rounded bg-carbon-gray-50"
                style={{ width: `${((data[k] ?? 0) / max) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-carbon-gray-70">{data[k] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = 'slate',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'slate' | 'green' | 'amber' | 'blue';
}): React.ReactElement {
  const toneCls = {
    slate: 'border-carbon-gray-20 bg-white',
    green: 'border-carbon-green bg-carbon-green-light',
    amber: 'border-carbon-yellow bg-carbon-yellow-light',
    blue: 'border-carbon-blue-light bg-carbon-blue-lighter',
  }[tone];
  return (
    <div className={`rounded border p-2 ${toneCls}`}>
      <p className="text-[11px] uppercase tracking-wide text-carbon-gray-50">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{value}</p>
      {sub ? <p className="text-[11px] text-carbon-gray-50">{sub}</p> : null}
    </div>
  );
}
