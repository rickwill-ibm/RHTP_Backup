/**
 * Historical denial-rate provider seam (increment GT-9 / #3).
 *
 * Propensity-to-deny is stronger when it can weigh a real historical denial rate
 * for a code/plan. In production this is backed by the payer's adjudication
 * history; here it is an injectable interface with a mock implementation, so the
 * real feed drops in without touching the engine.
 */
export interface DenialRateProvider {
  /** 0..1 historical denial rate for a code (optionally scoped to a plan), or undefined if unknown. */
  denialRate(code: string, plan?: string): number | undefined;
  /**
   * Wave-13.1 (HIGH-4, additive & optional): true when this provider's rates are SEEDED /
   * illustrative (the mock demo feed), NOT a real adjudication history. Consumers label
   * seeded rates as illustrative so a per-code figure is never shown as an observed
   * statistic. A real production feed omits this (or sets false) → labels byte-identical.
   */
  seeded?: boolean;
}

/** Mock rates for demo codes. Replace with a real feed in production. */
const MOCK_RATES: Record<string, number> = {
  '72148': 0.28, // lumbar MRI — commonly PA'd, moderate denial
  '75561': 0.18, // cardiac MRI
  '70450': 0.12,
};

export const mockDenialRateProvider: DenialRateProvider = {
  denialRate(code: string): number | undefined {
    return MOCK_RATES[code];
  },
  // These are illustrative seed values, not a real book of business.
  seeded: true,
};

/** A provider that always returns undefined (no history available). */
export const nullDenialRateProvider: DenialRateProvider = {
  denialRate(): number | undefined {
    return undefined;
  },
};
