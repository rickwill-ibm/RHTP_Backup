'use client';

/**
 * PolicyCompare (Phase A — Golden Thread guided surface). Side-by-side comparison of
 * the three policy PRESETS over a chosen cohort: it runs the REAL `simulateCohort`
 * (reconcile + Twin-Ladder interlock) once per preset and lays the aggregates out in a
 * 3-column table — recoverable $, identified $, past-window $, tier-capped count — plus
 * the evidence-tier and authority-rung distributions per preset.
 *
 * Client component: DEEP imports only (recoverySimulation is client-safe — no
 * node:crypto; threadPresets carries only type imports). Nothing fabricated — every
 * figure comes from the real governance functions.
 *
 * PHI DISCIPLINE: dollar aggregates + distribution counts only.
 */
import { useMemo, useState } from 'react';
import {
  simulateCohort,
  DEFAULT_POLICY,
  BATCHES,
  type RecoveryPolicy,
} from '@/lib/goldenThread/recoverySimulation';
import { THREAD_PRESETS, presetList, type ThreadPresetId } from '@/lib/goldenThread/threadPresets';

const money = (n: number): string =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Build the simulation policy for a preset (autonomy + materiality + filing window). */
function policyFor(id: ThreadPresetId): RecoveryPolicy {
  const p = THREAD_PRESETS[id];
  return {
    autonomyCeiling: p.autonomyTier,
    materialityAbs: p.materiality.abs,
    filingWindowDays: p.filingWindowDays,
    asOf: DEFAULT_POLICY.asOf,
  };
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
            <div className="h-3 flex-1 rounded bg-carbon-gray-10">
              <div
                className="h-3 rounded bg-carbon-gray-50"
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

export function PolicyCompare(): React.ReactElement {
  const [batchId, setBatchId] = useState(BATCHES[0].id);
  const batch = useMemo(() => BATCHES.find((b) => b.id === batchId) ?? BATCHES[0], [batchId]);

  const columns = useMemo(
    () =>
      presetList.map((p) => ({
        id: p.id,
        label: p.label,
        cohort: simulateCohort(batch.scenarios, policyFor(p.id)),
      })),
    [batch]
  );

  return (
    <section className="space-y-4 rounded-lg border border-carbon-gray-20 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Policy comparison</h2>
          <p className="text-xs text-carbon-gray-50">
            The three presets run over one cohort through the real reconciliation + Twin-Ladder
            interlock. Autonomy widens the net only where evidence permits.
          </p>
        </div>
        <label className="text-xs font-medium text-carbon-gray-70">
          Cohort
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="ml-2 rounded border border-carbon-gray-20 bg-white px-2 py-1 text-sm"
          >
            {BATCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-carbon-gray-20 text-left">
              <th className="py-1.5 pr-2 font-medium text-carbon-gray-50">Metric</th>
              {columns.map((c) => (
                <th key={c.id} className="py-1.5 pr-2 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                [
                  'Recoverable',
                  (c: (typeof columns)[number]) => money(c.cohort.recoverableDollars),
                ],
                ['Identified', (c: (typeof columns)[number]) => money(c.cohort.identifiedDollars)],
                [
                  'Past filing window',
                  (c: (typeof columns)[number]) => money(c.cohort.pastWindowDollars),
                ],
                [
                  'Tier-capped claims',
                  (c: (typeof columns)[number]) => String(c.cohort.tierCappedCount),
                ],
              ] as ReadonlyArray<[string, (c: (typeof columns)[number]) => string]>
            ).map(([label, get]) => (
              <tr key={label} className="border-b border-carbon-gray-20 last:border-0">
                <td className="py-1.5 pr-2 text-carbon-gray-50">{label}</td>
                {columns.map((c) => (
                  <td key={c.id} className="py-1.5 pr-2 font-medium">
                    {get(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {columns.map((c) => (
          <div key={c.id} className="space-y-3 rounded border border-carbon-gray-20 p-3">
            <p className="text-xs font-semibold">{c.label}</p>
            <Distribution
              title="Evidence tier (D0→D3)"
              data={c.cohort.byTier as Record<string, number>}
              order={['D0', 'D1', 'D2', 'D3']}
            />
            <Distribution
              title="Authority rung (A0→A3)"
              data={c.cohort.byRung as Record<string, number>}
              order={['A0', 'A1', 'A2', 'A3']}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
