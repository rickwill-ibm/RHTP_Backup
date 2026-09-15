/**
 * Gold-card data-source seam (increment GT-9 / #3).
 *
 * Gold carding needs a real feed of provider approval history / granted cards.
 * This interface lets a production source (payer roster API, warehouse query)
 * replace the mock roster without changing the engine. Callers pass `asOf` so
 * evaluation stays deterministic.
 */
import { MOCK_GOLD_CARD_CONTEXT, type GoldCardContext } from './goldCarding';

export interface GoldCardDataSource {
  id: string;
  /** Build the evaluation context (roster + histories + program) as of a time. */
  context(asOf: string): GoldCardContext;
  /**
   * Wave-13.1 (MED-5, additive & optional): true when this source's roster / approval
   * histories are SEEDED / illustrative (the mock demo feed), NOT a real payer roster.
   * Consumers label a seeded per-provider approval rate as illustrative rather than as an
   * observed statistic. A real production source omits this → labels byte-identical.
   */
  seeded?: boolean;
}

/** Mock source over the bundled demo roster/histories. */
export const mockGoldCardDataSource: GoldCardDataSource = {
  id: 'mock-roster',
  context(asOf: string): GoldCardContext {
    return { ...MOCK_GOLD_CARD_CONTEXT, asOf };
  },
  // Illustrative seed roster/histories, not a real book of business.
  seeded: true,
};

/** An empty source (no cards, no history) — every order needs PA. */
export const emptyGoldCardDataSource: GoldCardDataSource = {
  id: 'empty',
  context(asOf: string): GoldCardContext {
    return { asOf, roster: [], histories: [] };
  },
};
