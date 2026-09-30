'use client';

/**
 * Reviewer work-queue inbox (reviewer UI).
 *
 * Lists work items derived from persisted Evidence Records, grouped by disposition, with the
 * CMS-0057-F SLA timer and breach flag on EVERY row. Each item links to its Evidence Record.
 * Client component — reads through the BFF only.
 *
 * THE SLA IS A PARSED BOUNDARY. This page used to type the BFF response as `WorkItem[]` and
 * interpolate the item's SLA hours and due-by straight from it. In mock mode the BFF returns the
 * dev stub, which names the same facts `slaDurationHours` / `slaDueAt` / `id` / `isExpedited`,
 * so every field read `undefined` and the regulated timer rendered as the literal
 * `SLA h · due —` on every row. `parseQueueRows` now reads either shape out of `unknown` and
 * yields an SLA that is either resolved or explicitly unavailable — never blank.
 *
 * Wrapped in `AppLayout` like every sibling route under `(reviewer)`; without it this route
 * had no sidebar and no top bar and was a dead end reachable only by the browser's back button.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { getJson } from '@/lib/client/bff';
import * as clock from '@/lib/clock'; // injected clock seam — the only wall-clock read
import { formatInstantUtc, useMountedInstant } from '@/lib/client/useMountedInstant';
import type { QueueName } from '@/lib/goldenThread';
import { hoursRemaining, parseQueueGroups, rowBreached, slaText, type QueueRow } from './queueRows';

const QUEUE_META: { key: QueueName; label: string; tone: string }[] = [
  { key: 'high-risk-review', label: 'High-risk review', tone: 'border-red-300 bg-red-50' },
  { key: 'ready-to-submit', label: 'Ready to submit', tone: 'border-blue-300 bg-blue-50' },
  { key: 'more-info', label: 'More info requested', tone: 'border-amber-300 bg-amber-50' },
  { key: 'denied-appeal', label: 'Denied — appeal', tone: 'border-rose-300 bg-rose-50' },
  { key: 'auto-cleared', label: 'Auto-cleared', tone: 'border-green-300 bg-green-50' },
  { key: 'agent-proposal', label: 'Agent proposals', tone: 'border-violet-300 bg-violet-50' },
  { key: 'escalated', label: 'Escalated', tone: 'border-orange-300 bg-orange-50' },
  // W8/G-001: abandoned by the escalation terminal. Its own lane, because a parked item used to sit
  // on 'Escalated' indistinguishable from one still climbing the ladder. Still actionable.
  { key: 'parked', label: 'Parked (escalation exhausted)', tone: 'border-rose-300 bg-rose-50' },
];

const CRUMBS = [{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Work Queue' }];

function SlaChip({ row, asOf }: { row: QueueRow; asOf: string }): React.ReactElement {
  const breached = rowBreached(row, asOf);
  const left = hoursRemaining(row, asOf);
  const unavailable = row.sla.kind === 'unavailable';
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        breached ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
      }`}
      title={unavailable ? 'The SLA timer could not be resolved from this item' : undefined}
    >
      {slaText(row)}
      {breached && !unavailable ? ' · BREACHED' : ''}
      {!breached && left !== null ? ` · ${left}h left` : ''}
    </span>
  );
}

function ItemRow({ row, asOf }: { row: QueueRow; asOf: string }): React.ReactElement {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white p-2 text-sm">
      <div>
        <span className="font-medium">{row.code}</span> · member {row.memberId}
        {row.denialPropensity !== null ? (
          <span className="ml-2 text-xs text-slate-500">
            denial propensity {row.denialPropensity}
            {row.denialBand === null ? '' : ` (${row.denialBand})`}
          </span>
        ) : null}
        {row.note === '' ? null : <span className="block text-xs text-slate-500">{row.note}</span>}
      </div>
      <div className="flex items-center gap-3">
        <SlaChip row={row} asOf={asOf} />
        {row.evidenceId === '' ? (
          <span className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-400">
            No evidence ref
          </span>
        ) : (
          <Link
            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-blue-700 hover:bg-slate-50"
            href={`/evidence/${encodeURIComponent(row.evidenceId)}`}
          >
            View evidence
          </Link>
        )}
      </div>
    </li>
  );
}

export default function WorkQueuePage(): React.ReactElement {
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  // One clock reading per session view, so every chip and the header counts agree.
  const [asOf] = useState<string>(() => clock.nowIso());
  // DISPLAY ONLY, and deliberately separate from `asOf`. `asOf` is the one instant every row,
  // KPI and affordance resolves against and must exist during SSR; `shownAt` is the string React
  // diffs, so it waits for hydration. Rendering `asOf` directly produced a text mismatch
  // (React #418) whenever SSR and hydration straddled a minute boundary. Register G-067.
  const shownAt = useMountedInstant();

  useEffect(() => {
    getJson<unknown>('/api/work-queue').then((r) => {
      if (r.ok && r.data) setRaw(r.data);
      else setError(r.error?.issue?.[0]?.diagnostics ?? 'Failed to load work queue');
    });
  }, []);

  const groups = useMemo(
    () => (raw === null ? null : parseQueueGroups((raw as { groups?: unknown }).groups)),
    [raw]
  );
  const all = useMemo(() => (groups === null ? [] : Object.values(groups).flat()), [groups]);
  const breachedTotal = all.filter((row) => rowBreached(row, asOf)).length;
  const unresolvedSla = all.filter((row) => row.sla.kind === 'unavailable').length;
  const highRiskTotal = groups === null ? 0 : (groups['high-risk-review']?.length ?? 0);

  return (
    <AppLayout pageTitle="Prior-Authorization work queue" breadcrumbs={CRUMBS}>
      <main className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Prior-Authorization work queue</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reviewer inbox — items routed by disposition from persisted Evidence Records, with
            CMS-0057-F SLA timers (72h expedited / 7d standard). Clocks evaluated as of{' '}
            <span className="font-mono">{formatInstantUtc(shownAt)}</span>.
          </p>
          {groups === null ? null : (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">
                {all.length} item{all.length === 1 ? '' : 's'} in queue
              </span>
              {breachedTotal > 0 ? (
                <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
                  {breachedTotal} SLA breached
                </span>
              ) : null}
              {unresolvedSla > 0 ? (
                <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                  {unresolvedSla} SLA unresolved
                </span>
              ) : null}
              {highRiskTotal > 0 ? (
                <span className="rounded bg-red-50 px-2 py-0.5 font-semibold text-red-700">
                  {highRiskTotal} high-risk
                </span>
              ) : null}
              {all.length > 0 ? <span className="text-slate-300">·</span> : null}
              {QUEUE_META.map((q) => {
                const n = groups[q.key]?.length ?? 0;
                if (n === 0) return null;
                return (
                  <span key={q.key}>
                    {q.label}: <b className="text-slate-800">{n}</b>
                  </span>
                );
              })}
            </div>
          )}
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {/*
          THE LOADING BRANCH IS GUARDED BY `error`, AND THAT GUARD IS THE FIX. These were two
          independent siblings, so a failed load rendered the alert AND left "Loading…" underneath
          it permanently — the screen telling a reviewer both that it failed and that it is still
          working. Verified in a browser against a 401 from `/api/work-queue`: the page sat on
          `Not authenticated` above `Loading…` indefinitely. A spinner that never resolves is a
          fail-silent, and on an authenticated BFF route the failure it hides is a session that
          has expired. Three states, one chain.
        */}
        {error !== null ? null : groups === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : all.length === 0 ? (
          <p className="text-sm text-slate-500">
            No items yet. Run a clearance from{' '}
            <Link className="text-blue-700 underline" href="/financial-clearance">
              Financial Clearance
            </Link>{' '}
            to populate the queue.
          </p>
        ) : (
          QUEUE_META.map((q) => {
            const rows = groups[q.key] ?? [];
            if (rows.length === 0) return null;
            return (
              <section
                key={q.key}
                className={`rounded-lg border p-3 ${q.tone}`}
                aria-label={q.label}
              >
                <h2 className="mb-2 text-sm font-semibold">
                  {q.label} <span className="font-normal text-slate-500">({rows.length})</span>
                </h2>
                <ul className="space-y-2">
                  {rows.map((row, idx) => (
                    <ItemRow
                      key={row.evidenceId === '' ? `${q.key}-${idx}` : row.evidenceId}
                      row={row}
                      asOf={asOf}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </main>
    </AppLayout>
  );
}
