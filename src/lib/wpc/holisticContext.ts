/**
 * Holistic-context SEAM (HW4-B / I26, WPC-01/02).
 *
 * The finding: the holistic-context engine returns a rich context only for the
 * authored demo members (Maria); the REAL projected graph is wired to zero routes.
 * This adds the seam so the UI reads ONE interface and config chooses the source:
 *   mock / seeded → the existing authored engine (demo intact — Maria et al.);
 *   production    → aggregate the real projected graph + 20 domains, via a
 *                   REGISTERED aggregator, or fail CLOSED (never an empty context
 *                   silently presented as the member's real one).
 *
 * De-hardcoding the demo = ADDING the production branch, never deleting the mock.
 */

import { getDataMode } from '@/lib/config/dataMode';
import { holisticContextEngine } from '@/lib/services/holisticContextEngine';
import type { HolisticPatientContext } from '@/lib/services/holisticContextEngine.types';
import type { ConsentScope } from '@/lib/graph/lens/types';

export type { HolisticPatientContext } from '@/lib/services/holisticContextEngine.types';

export interface HolisticContextResult {
  context: HolisticPatientContext;
  source: 'authored' | 'projected-graph';
}

export class HolisticContextNotConfiguredError extends Error {
  constructor() {
    super(
      'holistic context production=on but no projected-graph aggregator is registered (fail-closed)'
    );
    this.name = 'HolisticContextNotConfiguredError';
  }
}

// The production aggregator builds the context from the real projected graph.
let productionAggregator: ((memberId: string) => HolisticPatientContext) | null = null;

/** Register (or clear) the production graph-aggregation function. */
export function setProductionHolisticAggregator(
  fn: ((memberId: string) => HolisticPatientContext) | null
): void {
  productionAggregator = fn;
}

/**
 * Resolve a member's holistic context. Seam-switched on `wpcRecord`: mock/seeded
 * returns the authored engine's context (demo intact); production aggregates the
 * real graph (fail-closed if no aggregator is registered).
 */
export function resolveHolisticContext(memberId: string): HolisticContextResult {
  if (getDataMode('wpcRecord') === 'production') {
    if (!productionAggregator) throw new HolisticContextNotConfiguredError();
    return { context: productionAggregator(memberId), source: 'projected-graph' };
  }
  return { context: holisticContextEngine.buildContext(memberId), source: 'authored' };
}

// ─── Async production seam (WPC-01 Phase 3) ──────────────────────────────────
// The projected-graph aggregator reads an ASYNC GraphStore, so production needs
// an async resolver. Added alongside (not replacing) the sync path so the mock
// demo and existing sync callers are untouched; Phase 4 routes real read callers
// (agents + WPC UI) onto `resolveHolisticContextAsync`.

let productionAggregatorAsync:
  ((memberId: string, scope?: ConsentScope) => Promise<HolisticPatientContext>) | null = null;

/** Register (or clear) the async production graph-aggregation function. */
export function setProductionHolisticAggregatorAsync(
  fn: ((memberId: string, scope?: ConsentScope) => Promise<HolisticPatientContext>) | null
): void {
  productionAggregatorAsync = fn;
}

/**
 * Async resolve. Seam-switched on `wpcRecord`: production awaits the registered
 * projected-graph aggregator (fail-closed if none), consent-scoped; mock/seeded
 * returns the authored engine's context (demo intact).
 */
export async function resolveHolisticContextAsync(
  memberId: string,
  scope?: ConsentScope
): Promise<HolisticContextResult> {
  if (getDataMode('wpcRecord') === 'production') {
    if (!productionAggregatorAsync) throw new HolisticContextNotConfiguredError();
    return { context: await productionAggregatorAsync(memberId, scope), source: 'projected-graph' };
  }
  return { context: holisticContextEngine.buildContext(memberId), source: 'authored' };
}
