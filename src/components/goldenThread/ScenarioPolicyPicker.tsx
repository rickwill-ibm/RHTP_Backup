'use client';

/**
 * ScenarioPolicyPicker (Phase A — Golden Thread guided surface). Two Carbon selects —
 * the order→cash SCENARIO and the recovery POLICY preset — plus the member/order
 * context and a "Run thread" button. Changing either select (or pressing Run) pushes
 * `?scenario=..&preset=..`, so the server page re-runs the REAL orchestrator for the
 * chosen combination.
 *
 * Client component: it imports NO pipeline modules (nothing from '@/lib/goldenThread'
 * or the evidence barrel → node:crypto). The scenario/preset lists arrive as plain
 * {id,label} data from the server.
 *
 * PHI DISCIPLINE: a member label + an order code/display only.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Option {
  id: string;
  label: string;
}

export function ScenarioPolicyPicker({
  scenarioId,
  presetId,
  scenarios,
  presets,
  memberLabel,
  order,
}: {
  scenarioId: string;
  presetId: string;
  scenarios: ReadonlyArray<Option>;
  presets: ReadonlyArray<Option>;
  memberLabel: string;
  order: { code: string; display?: string };
}): React.ReactElement {
  const router = useRouter();
  const [scenario, setScenario] = useState(scenarioId);
  const [preset, setPreset] = useState(presetId);

  const go = (s: string, p: string): void => {
    router.push(`?scenario=${encodeURIComponent(s)}&preset=${encodeURIComponent(p)}`);
  };

  return (
    <section className="space-y-3 rounded-lg border border-carbon-gray-20 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Guided run</h2>
        <span className="text-xs text-carbon-gray-50">
          {order.display ?? order.code} · {order.code} · member {memberLabel}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-carbon-gray-70">
          Scenario
          <select
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value);
              go(e.target.value, preset);
            }}
            className="mt-1 block w-full rounded border border-carbon-gray-20 bg-white px-2 py-1.5 text-sm"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-carbon-gray-70">
          Policy preset
          <select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              go(scenario, e.target.value);
            }}
            className="mt-1 block w-full rounded border border-carbon-gray-20 bg-white px-2 py-1.5 text-sm"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => go(scenario, preset)}
        className="rounded bg-carbon-blue px-4 py-1.5 text-sm font-medium text-white hover:bg-carbon-blue-hover"
      >
        Run thread
      </button>
    </section>
  );
}
