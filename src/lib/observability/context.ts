/**
 * Observability context (HW1-B / I22) — metrics + spans + correlation + SLO.
 *
 * A production payer platform must be OBSERVABLE: request counts, error rates,
 * latency, and per-request correlation so an operator can see what the system is
 * doing and whether it meets its SLOs. This is a dependency-free, in-process
 * reference implementation (counters + a latency recorder + an SLO evaluator);
 * production wires the same API to a real metrics backend (OTel/Prometheus) via
 * the sink, without changing callers.
 */

export interface MetricSnapshot {
  counters: Record<string, number>;
  latency: Record<string, { count: number; p50: number; p95: number; max: number }>;
}

export interface SloTarget {
  /** Metric name (a latency series). */
  name: string;
  /** The p95 latency budget in ms. */
  p95BudgetMs: number;
  /** Max acceptable error ratio (errors / total), 0..1. */
  maxErrorRatio: number;
}

export interface SloStatus {
  name: string;
  ok: boolean;
  p95: number;
  errorRatio: number;
  breaches: string[];
}

class Observability {
  private counters = new Map<string, number>();
  private samples = new Map<string, number[]>();

  /** Increment a named counter (e.g. 'fhir.read.ok', 'fhir.read.error'). */
  count(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  /** Record a latency sample (ms) for a series. */
  observe(name: string, ms: number): void {
    const arr = this.samples.get(name) ?? [];
    arr.push(ms);
    this.samples.set(name, arr);
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  }

  snapshot(): MetricSnapshot {
    const latency: MetricSnapshot['latency'] = {};
    for (const [name, arr] of this.samples) {
      const sorted = [...arr].sort((a, b) => a - b);
      latency[name] = {
        count: sorted.length,
        p50: this.percentile(sorted, 50),
        p95: this.percentile(sorted, 95),
        max: sorted[sorted.length - 1] ?? 0,
      };
    }
    return { counters: Object.fromEntries(this.counters), latency };
  }

  /** Evaluate SLO targets against the current window. */
  evaluateSlos(targets: SloTarget[]): SloStatus[] {
    const snap = this.snapshot();
    return targets.map((t) => {
      const lat = snap.latency[t.name] ?? { count: 0, p50: 0, p95: 0, max: 0 };
      const ok = snap.counters[`${t.name}.ok`] ?? 0;
      const err = snap.counters[`${t.name}.error`] ?? 0;
      const total = ok + err;
      const errorRatio = total === 0 ? 0 : err / total;
      const breaches: string[] = [];
      if (lat.p95 > t.p95BudgetMs) breaches.push(`p95 ${lat.p95}ms > ${t.p95BudgetMs}ms`);
      if (errorRatio > t.maxErrorRatio)
        breaches.push(`errorRatio ${errorRatio.toFixed(3)} > ${t.maxErrorRatio}`);
      return { name: t.name, ok: breaches.length === 0, p95: lat.p95, errorRatio, breaches };
    });
  }

  reset(): void {
    this.counters.clear();
    this.samples.clear();
  }
}

const obs = new Observability();
export function metrics(): Observability {
  return obs;
}

/**
 * Time an async operation, recording latency + an ok/error counter for its series.
 * The single helper every route/consumer uses so observability is uniform.
 */
export async function instrument<T>(
  name: string,
  now: () => number,
  fn: () => Promise<T>
): Promise<T> {
  const start = now();
  try {
    const r = await fn();
    obs.observe(name, now() - start);
    obs.count(`${name}.ok`);
    return r;
  } catch (err) {
    obs.observe(name, now() - start);
    obs.count(`${name}.error`);
    throw err;
  }
}
