// CONTRACT: C1  // CONTRACT: C10  // DP-1  // SEAM: graph
/**
 * The lens query API barrel (Iteration 2 wave B1). Five store-agnostic lens
 * queries over the GraphStore read API - the demo's five lens filters, answered
 * against the projected store, satisfied identically by both certified backends.
 */
export type { ConsentScope, LensName, LensResult } from './types';
export { NO_CONSENT } from './types';
export {
  wholePersonLens,
  careGapLens,
  sdohBarrierLens,
  careTeamLens,
  part2RestrictedLens,
  scopeCovers,
  LENSES,
  LENS_NAMES,
} from './lenses';
