/**
 * Propensity-to-deny (increment GT-4).
 *
 * Promotes the Policy Engine's inline heuristic into an explicit, transparent,
 * additive factor model. Every point is attributable to a named factor, so the
 * score can be shown to a reviewer and defended. It is **decision-support only**
 * — never the determination; the payer's `ClaimResponse` is authoritative.
 *
 * Pure + deterministic. Swap in an ML model later behind the same interface;
 * capture reviewer overrides as training feedback.
 */
import type { CoverageDetermination } from './types';

export type PropensityBand = 'low' | 'medium' | 'high';

export interface PropensityFactor {
  label: string;
  points: number; // signed contribution
}

export interface PropensityInput {
  outcome: CoverageDetermination['outcome'];
  criteriaMet: boolean | null;
  openDeficiencies: number;
  missingDtrAnswers?: number;
  /** 0..1 historical denial rate for this code/plan, if known. */
  historicalDenialRate?: number;
  /**
   * Wave-13.1 (HIGH-4, additive & optional): the historical denial rate came from a
   * SEEDED / illustrative loader (the mock demo feed), NOT this deployment's adjudication
   * history. When true the factor label is marked illustrative so a seeded per-code rate
   * is never presented as an observed statistic. Absent/false → label byte-identical.
   */
  historicalDenialRateSeeded?: boolean;
  goldCardApplied?: boolean;
}

export interface PropensityResult {
  score: number; // 0..100
  band: PropensityBand;
  factors: PropensityFactor[];
  rationale: string;
  disclaimer: string;
}

const DISCLAIMER =
  'Decision-support estimate only — not a coverage determination. The payer ClaimResponse is authoritative.';

const BASE_BY_OUTCOME: Record<CoverageDetermination['outcome'], number> = {
  'likely-denial-experimental': 85,
  'pa-required-criteria-review': 45, // adjusted by criteriaMet below
  'pa-required-list': 35,
  'no-policy-found': 10,
  'no-pa-required': 5,
};

function band(score: number): PropensityBand {
  if (score <= 33) return 'low';
  if (score <= 66) return 'medium';
  return 'high';
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Score an order's denial propensity from explicit factors. */
export function scorePropensity(input: PropensityInput): PropensityResult {
  // Gold-card exemption short-circuits: PA is waived, denial risk is nil.
  if (input.goldCardApplied) {
    return {
      score: 0,
      band: 'low',
      factors: [{ label: 'Gold-card exemption (PA waived)', points: 0 }],
      rationale: 'Provider is gold-carded for this service — prior authorization is exempt.',
      disclaimer: DISCLAIMER,
    };
  }

  const factors: PropensityFactor[] = [];
  const base = BASE_BY_OUTCOME[input.outcome] ?? 30;
  factors.push({ label: `Base risk for outcome "${input.outcome}"`, points: base });

  if (input.outcome === 'pa-required-criteria-review') {
    if (input.criteriaMet === true)
      factors.push({ label: 'Supporting diagnosis present', points: -25 });
    else if (input.criteriaMet === false)
      factors.push({ label: 'No supporting diagnosis for policy criteria', points: 25 });
    else factors.push({ label: 'Criteria require manual review (no coded ICD-10 set)', points: 0 });
  }

  if (input.openDeficiencies > 0) {
    const pts = Math.min(24, input.openDeficiencies * 8);
    factors.push({ label: `${input.openDeficiencies} open deficiency(ies)`, points: pts });
  }

  if (input.missingDtrAnswers && input.missingDtrAnswers > 0) {
    factors.push({ label: `${input.missingDtrAnswers} unanswered DTR item(s)`, points: 12 });
  }

  if (typeof input.historicalDenialRate === 'number') {
    const pts = Math.round(input.historicalDenialRate * 20);
    const pct = Math.round(input.historicalDenialRate * 100);
    factors.push({
      label: input.historicalDenialRateSeeded
        ? `Illustrative seeded denial rate ${pct}% (not a book of business)`
        : `Historical denial rate ${pct}%`,
      points: pts,
    });
  }

  const score = clamp(factors.reduce((s, f) => s + f.points, 0));
  const b = band(score);
  const rationale =
    b === 'high'
      ? 'High denial risk — route to a reviewer with partial evidence and close gaps before submission.'
      : b === 'medium'
        ? 'Moderate denial risk — verify documentation and DTR answers before submitting.'
        : 'Low denial risk — submit with standard documentation.';

  return { score, band: b, factors, rationale, disclaimer: DISCLAIMER };
}

/** Build a propensity input from a determination (+ optional context). */
export function propensityInputFromDetermination(
  det: CoverageDetermination,
  opts?: {
    missingDtrAnswers?: number;
    historicalDenialRate?: number;
    historicalDenialRateSeeded?: boolean;
    goldCardApplied?: boolean;
  }
): PropensityInput {
  return {
    outcome: det.outcome,
    criteriaMet: det.criteriaMet,
    openDeficiencies: det.deficiencies.length,
    missingDtrAnswers: opts?.missingDtrAnswers,
    historicalDenialRate: opts?.historicalDenialRate,
    historicalDenialRateSeeded: opts?.historicalDenialRateSeeded,
    goldCardApplied: opts?.goldCardApplied,
  };
}
