/**
 * ScenarioTable (Wave-13.1) — presentational table of the first rows of a simulated
 * recovery cohort. Extracted from SimulationConsole.tsx so that file stays within the
 * 400-line size cap (the honest fix per the size ratchet: extract, do not baseline a
 * breach). It renders values the REAL governance functions produced (via recoverySimulation)
 * and includes the interlock GATE column (`ScenarioGateCell`). PHI-safe: codes/amounts/rungs.
 */
import { CATEGORY_LABEL, type CohortResult } from '@/lib/goldenThread/recoverySimulation';
import { ScenarioGateCell } from './ScenarioGateCell';

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function ScenarioTable({ current }: { current: CohortResult }): React.ReactElement {
  const rows = current.results.slice(0, 8);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-carbon-gray-50">
          <tr>
            <th className="py-1 pr-3">Service</th>
            <th className="py-1 pr-3">Contracted</th>
            <th className="py-1 pr-3">Paid</th>
            <th className="py-1 pr-3">Δ</th>
            <th className="py-1 pr-3">Tier</th>
            <th className="py-1 pr-3">Rung</th>
            <th className="py-1 pr-3">Gate</th>
            <th className="py-1">Routing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.scenario.id} className="border-t border-carbon-gray-20">
              <td className="py-1 pr-3">{r.scenario.service}</td>
              <td className="py-1 pr-3">{money(r.scenario.contractedAllowed)}</td>
              <td className="py-1 pr-3">{money(r.scenario.paidAmount)}</td>
              <td className="py-1 pr-3">{r.verdict === 'underpaid' ? money(r.delta) : '—'}</td>
              <td className="py-1 pr-3 font-mono">{r.scenario.evidenceTier}</td>
              <td className="py-1 pr-3 font-mono">{r.rung}</td>
              <td className="py-1 pr-3">
                <ScenarioGateCell
                  resolved={r.resolved}
                  requiresHuman={r.requiresHuman}
                  adverse={r.adverse}
                  submission={r.submission}
                />
              </td>
              <td className="py-1">{CATEGORY_LABEL[r.category]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {current.results.length > rows.length ? (
        <p className="mt-1 text-xs text-carbon-gray-50">
          Showing {rows.length} of {current.results.length} claims.
        </p>
      ) : null}
    </div>
  );
}
