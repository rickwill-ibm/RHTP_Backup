'use client';
// src/app/cdp-assembly/useLivePopulationLoad.ts — client hook driving the REAL load.
//
// POSTs to /api/cdp-intake/run (flag-gated server-side) and shapes the response into an
// aggregate, PHI-safe view model for the Live Load view. This is population telemetry —
// members RESOLVED (a count, not a name), resources ADMITTED per domain, quarantine, and
// the projected knowledge-graph size — never one member's record. All figures come from
// the endpoint; the hook only aggregates and sorts, it invents nothing.

import { useCallback, useState } from 'react';

export type LoadStatus = 'idle' | 'running' | 'done' | 'disabled' | 'error';

export interface SourceOutcome {
  sourceSystem: string;
  file: string;
  memberId: string;
  held: boolean;
  loaded: number;
  quarantined: number;
  byDomain: Record<string, number>;
}

export interface LoadTotals {
  files: number;
  loaded: number;
  quarantined: number;
  held: number;
  members: number;
}

export interface DomainCount {
  domain: string;
  count: number;
}

/** A whole SOURCE SYSTEM rolled up — the population view groups by system, never by
 * member. Many files from one system collapse into one row (files, admitted, etc.). */
export interface SourceRollup {
  sourceSystem: string;
  files: number;
  loaded: number;
  quarantined: number;
  held: number;
}

export interface LiveLoadState {
  status: LoadStatus;
  receiptId?: string;
  receivedAt?: string;
  totals?: LoadTotals;
  graph?: { nodes: number; edges: number };
  domains?: DomainCount[];
  sources?: SourceRollup[];
  error?: string;
}

/** Sum admitted-per-domain across every source into one population roll-up, high→low. */
function aggregateDomains(outcomes: SourceOutcome[]): DomainCount[] {
  const acc: Record<string, number> = {};
  for (const o of outcomes) {
    for (const [domain, n] of Object.entries(o.byDomain)) {
      acc[domain] = (acc[domain] ?? 0) + n;
    }
  }
  return Object.entries(acc)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

/** Collapse per-file outcomes into one row per SOURCE SYSTEM — no member ids surfaced,
 * so the list is bounded by source count, not by population size. */
function aggregateSources(outcomes: SourceOutcome[]): SourceRollup[] {
  const acc = new Map<string, SourceRollup>();
  for (const o of outcomes) {
    const key = o.sourceSystem || '(unattributed)';
    const cur = acc.get(key) ?? { sourceSystem: key, files: 0, loaded: 0, quarantined: 0, held: 0 };
    cur.files += 1;
    cur.loaded += o.loaded;
    cur.quarantined += o.quarantined;
    cur.held += o.held ? 1 : 0;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.loaded - a.loaded);
}

export function useLivePopulationLoad(): {
  state: LiveLoadState;
  run: () => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<LiveLoadState>({ status: 'idle' });

  const run = useCallback(async () => {
    setState({ status: 'running' });
    try {
      const res = await fetch('/api/cdp-intake/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (res.status === 404) {
        const data = await res.json().catch(() => ({}));
        setState({
          status: 'disabled',
          error: data?.error ?? 'Live run is disabled in this environment.',
        });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setState({ status: 'error', error: data?.error ?? `Run failed (HTTP ${res.status}).` });
        return;
      }
      const outcomes: SourceOutcome[] = data.outcomes ?? [];
      setState({
        status: 'done',
        receiptId: data.receipt?.receiptId,
        receivedAt: data.receipt?.receivedAt,
        totals: data.totals,
        graph: data.graph,
        domains: aggregateDomains(outcomes),
        sources: aggregateSources(outcomes),
      });
    } catch (e) {
      setState({ status: 'error', error: (e as Error).message });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, run, reset };
}
