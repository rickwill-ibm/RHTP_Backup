/**
 * Fairness / disparate-impact monitoring (HW-AI-B / I25) — the equity claim.
 *
 * The AI-governance lens flagged ZERO fairness/equity testing. This monitors
 * AI-influenced decision OUTCOMES across cohorts and applies the EEOC "four-fifths
 * rule": a cohort's favorable-decision rate should be at least 80% of the highest
 * cohort's rate; below that is a disparate-impact signal to investigate. Cohorts
 * are coarse, PHI-safe buckets (never the raw protected attribute) — the monitor
 * records counts only, and flags disparities for human review, never auto-acts.
 */

export interface CohortOutcome {
  /** A coarse, PHI-safe cohort label (e.g. an age band, region, LOB). */
  cohort: string;
  favorable: boolean;
}

export interface CohortStat {
  cohort: string;
  total: number;
  favorable: number;
  favorableRate: number;
}

export interface DisparateImpactResult {
  stats: CohortStat[];
  /** The highest cohort favorable-rate (the reference). */
  referenceRate: number;
  /** The four-fifths ratio for each cohort (rate / referenceRate). */
  ratios: Record<string, number>;
  /** Cohorts whose ratio < 0.8 (a disparate-impact signal). */
  flagged: string[];
  /** True when NO cohort is flagged. */
  fair: boolean;
}

const FOUR_FIFTHS = 0.8;

/** Aggregate outcomes into per-cohort stats. */
export function aggregate(outcomes: CohortOutcome[]): CohortStat[] {
  const byCohort = new Map<string, { total: number; favorable: number }>();
  for (const o of outcomes) {
    const s = byCohort.get(o.cohort) ?? { total: 0, favorable: 0 };
    s.total += 1;
    if (o.favorable) s.favorable += 1;
    byCohort.set(o.cohort, s);
  }
  return [...byCohort.entries()]
    .map(([cohort, s]) => ({
      cohort,
      total: s.total,
      favorable: s.favorable,
      favorableRate: s.total ? s.favorable / s.total : 0,
    }))
    .sort((a, b) => a.cohort.localeCompare(b.cohort));
}

/**
 * Apply the four-fifths rule. Cohorts below a minimum sample are still reported but
 * not flagged (too little data to conclude disparate impact). Returns the full picture.
 */
export function disparateImpact(outcomes: CohortOutcome[], minSample = 5): DisparateImpactResult {
  const stats = aggregate(outcomes);
  const referenceRate = stats.reduce((m, s) => Math.max(m, s.favorableRate), 0);
  const ratios: Record<string, number> = {};
  const flagged: string[] = [];
  for (const s of stats) {
    const ratio = referenceRate === 0 ? 1 : s.favorableRate / referenceRate;
    ratios[s.cohort] = ratio;
    if (s.total >= minSample && ratio < FOUR_FIFTHS) flagged.push(s.cohort);
  }
  return { stats, referenceRate, ratios, flagged, fair: flagged.length === 0 };
}

// ── A process-local outcome buffer the decision route appends to ────────────────
const buffer: CohortOutcome[] = [];

/** Record one decision outcome for the fairness window (PHI-safe cohort only). */
export function recordOutcome(o: CohortOutcome): void {
  buffer.push(o);
}

/** The disparate-impact analysis over the current window. */
export function currentDisparateImpact(minSample = 5): DisparateImpactResult {
  return disparateImpact(buffer, minSample);
}

export function _resetFairness(): void {
  buffer.length = 0;
}
