/**
 * Denial-rate feed loader (O-2).
 *
 * Normalized historical denial rates by procedure code (optionally plan-scoped),
 * generic and persona-free. Seeded mode reads data/denial-rates.seed.json;
 * production mode throws until a real adjudication-history feed is wired.
 * Deterministic: callers pass `asOf`.
 *
 * SEAM: denialRateFeed — mode-registry switch point (lib/config/dataMode.ts).
 */
import {
  type DataSourceLoader,
  DataSourceNotConfiguredError,
  selectLoader,
  asRecord,
  reqString,
  reqNumber,
  optNumber,
  optString,
  reqArray,
} from './common';
import seed from './data/denial-rates.seed.json';

const SEAM = 'denialRateFeed';

export interface NormalizedDenialRate {
  code: string;
  plan: string | null;
  rate: number; // 0..1
  sampleSize: number | null;
  windowMonths: number | null;
}

export interface DenialRateFeed {
  asOf: string;
  rates: NormalizedDenialRate[];
}

function parseRate(v: unknown, i: number): NormalizedDenialRate {
  const o = asRecord(v, `denialRateFeed.rates[${i}]`);
  const ctx = `denialRateFeed.rates[${i}]`;
  const rate = reqNumber(o, 'rate', ctx);
  if (rate < 0 || rate > 1) throw new Error(`${ctx}: rate must be within 0..1`);
  return {
    code: reqString(o, 'code', ctx),
    plan: optString(o, 'plan'),
    rate,
    sampleSize: optNumber(o, 'sampleSize', ctx),
    windowMonths: optNumber(o, 'windowMonths', ctx),
  };
}

/** Normalize a raw denial-rate document. Exported for tests / real clients. */
export function normalizeDenialRateFeed(raw: unknown, asOf: string): DenialRateFeed {
  const doc = asRecord(raw, 'denialRateFeed');
  const rates = reqArray(doc.rates ?? [], 'denialRateFeed.rates').map(parseRate);
  return { asOf, rates };
}

/** Convenience lookup: exact plan match wins, else the plan-agnostic (null) row. */
export function lookupDenialRate(
  feed: DenialRateFeed,
  code: string,
  plan?: string
): number | undefined {
  const forCode = feed.rates.filter((r) => r.code === code);
  if (plan) {
    const scoped = forCode.find((r) => r.plan === plan);
    if (scoped) return scoped.rate;
  }
  return forCode.find((r) => r.plan === null)?.rate;
}

export const seededDenialRateFeedLoader: DataSourceLoader<DenialRateFeed> = {
  id: 'seeded-denial-rate-feed',
  async load(asOf: string): Promise<DenialRateFeed> {
    return normalizeDenialRateFeed(seed, asOf);
  },
};

export const productionDenialRateFeedLoader: DataSourceLoader<DenialRateFeed> = {
  id: 'production-denial-rate-feed',
  async load(): Promise<DenialRateFeed> {
    throw new DataSourceNotConfiguredError(
      SEAM,
      "Implement an adjudication-history feed client here (payer's denial history)."
    );
  },
};

/** Resolve the denial-rate feed loader for the configured 'denialRateFeed' mode. */
export function getDenialRateFeedLoader(): DataSourceLoader<DenialRateFeed> {
  return selectLoader(SEAM, seededDenialRateFeedLoader, productionDenialRateFeedLoader);
}
