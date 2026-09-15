'use client';

/**
 * Network Adequacy -- analyst workspace (increment NA-5).
 *
 * State selector (GA storyboard / SD = Maria's state), KPI summary, prioritized
 * gap table, and the interactive analyst copilot. Client component -- reads only
 * through the BFF (`/api/network-adequacy`).
 */
import { useEffect, useState } from 'react';
import { getJson } from '@/lib/client/bff';
import type { AdequacyMetric, Gap } from '@/lib/networkAdequacy';
import { NetworkAssistant } from '@/components/networkAdequacy/NetworkAssistant';
import AppLayout from '@/components/AppLayout';

interface Summary {
  state: string;
  metrics: AdequacyMetric[];
  gaps: Gap[];
}

const STATES = [
  { code: 'SD', label: "South Dakota -- Maria's state" },
  { code: 'GA', label: 'Georgia -- storyboard demo' },
];

const SEV_TONE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

export default function NetworkAdequacyPage(): React.ReactElement {
  const [state, setState] = useState('SD');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(null);
    getJson<Summary>(`/api/network-adequacy?state=${encodeURIComponent(state)}`).then((r) => {
      if (r.ok && r.data) setSummary(r.data);
      else setError(r.error?.issue?.[0]?.diagnostics ?? 'Failed to load');
    });
  }, [state]);

  const avg = summary?.metrics.length
    ? Math.round(summary.metrics.reduce((s, m) => s + m.adequacyPct, 0) / summary.metrics.length)
    : 0;

  return (
    <AppLayout>
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Network Adequacy</h1>
          <p className="mt-1 text-sm text-slate-600">
            Measure, monitor, and <strong>validate</strong> provider network adequacy by specialty x
            county x line of business against CMS time-distance, in-network, wait-time, and ratio
            standards. Analyst copilot on the right.
          </p>
          <label className="mt-3 inline-flex items-center gap-2 text-sm">
            <span className="text-slate-600">State</span>
            <select
              className="rounded border border-slate-300 px-2 py-1"
              value={state}
              onChange={(e) => setState(e.target.value)}
              aria-label="State"
            >
              {STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Avg adequacy</p>
                <p className="text-2xl font-semibold">{summary ? `${avg}%` : '--'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Cells measured</p>
                <p className="text-2xl font-semibold">{summary?.metrics.length ?? '--'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Gaps below target</p>
                <p className="text-2xl font-semibold text-red-700">
                  {summary?.gaps.length ?? '--'}
                </p>
              </div>
            </div>

            {/* Gap table */}
            <div className="rounded-lg border border-slate-200">
              <h2 className="border-b border-slate-100 p-3 text-sm font-semibold">
                Prioritized adequacy gaps
              </h2>
              {!summary ? (
                <p className="p-3 text-sm text-slate-500">Loading...</p>
              ) : summary.gaps.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">No gaps -- all cells meet target.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="p-2">County</th>
                      <th className="p-2">Specialty / LOB</th>
                      <th className="p-2">Adequacy</th>
                      <th className="p-2">Severity</th>
                      <th className="p-2">Affected</th>
                      <th className="p-2">+Providers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.gaps.map((g, i) => (
                      <tr
                        key={i}
                        className={`border-t border-slate-100 ${focus.includes(g.county) ? 'bg-yellow-50' : ''}`}
                      >
                        <td className="p-2 font-medium">{g.county}</td>
                        <td className="p-2">
                          {g.specialty} / {g.lob}
                        </td>
                        <td className="p-2">
                          {g.currentPct}% <span className="text-slate-400">/ {g.requiredPct}%</span>
                        </td>
                        <td className="p-2">
                          <span className={`rounded px-1.5 py-0.5 text-xs ${SEV_TONE[g.severity]}`}>
                            {g.severity}
                          </span>
                        </td>
                        <td className="p-2">{g.affectedPopulation.toLocaleString()}</td>
                        <td className="p-2">+{g.shortfallProviders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-xs italic text-slate-500">
              Demonstration on seed data (GA storyboard + SD/Maria). Adequacy is authoritative only
              on a live directory + geography + membership feed (NA-8). Recommendations are
              decision-support and human-gated.
            </p>
          </div>

          <div className="lg:col-span-1">
            <NetworkAssistant
              defaultState={state}
              onFocus={(u) => setFocus(u.focusCounties ?? [])}
            />
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
