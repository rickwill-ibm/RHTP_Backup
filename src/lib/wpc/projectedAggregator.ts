// CONTRACT: C1  // SEAM: wpcRecord  // DP-1  // WPC-01 Phase 3
/**
 * Projected-graph holistic aggregator (WPC-01 Phase 3).
 *
 * The production branch of the holistic-context seam: it builds a member's
 * HolisticPatientContext from the REAL projected graph (Phase 1 shared stores,
 * Phase 2 real-pipeline population) by composing the five consent-scoped lenses —
 * never from authored demo data. Two honesty guarantees hold:
 *
 *   1. FAIL-CLOSED on an absent member — a member with no node in the graph throws
 *      `MemberNotInProjectedGraphError` rather than returning a fabricated context.
 *   2. FAIL-HONEST on partial coverage — sections the projected graph populates
 *      (patient, clinicalProfile, barriers) are real; sections without a domain
 *      mapper yet are NEUTRAL null-objects, and `contextProvenance` declares which
 *      is which so a neutral section is never presented as the member's real data.
 *
 * Consent (C1): every lens read runs under the caller's ConsentScope, so a
 * restricted (42 CFR Part 2 / segmented) node is excluded unless the scope covers
 * it — the aggregator cannot leak what the lenses gate. Pure section mappers live
 * in ./projectedAggregator.mappers.
 */
import { now as clockNow } from '@/lib/clock';
import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { setProductionHolisticAggregatorAsync } from './holisticContext';
import {
  careGapLens,
  careTeamLens,
  part2RestrictedLens,
  sdohBarrierLens,
  wholePersonLens,
} from '@/lib/graph/lens/lenses';
import { NO_CONSENT, type ConsentScope, type LensResult } from '@/lib/graph/lens/types';
import { MEMBER_KIND } from '@/lib/graph/mapping/spec';
import type { GraphStore } from '@/lib/graph/types';
import type { HolisticPatientContext } from '@/lib/services/holisticContextEngine.types';
import {
  NEUTRAL_SECTIONS,
  PROJECTED_SECTIONS,
  mapBarriers,
  mapClinical,
  mapPatient,
  neutralAccess,
  neutralCaregiver,
  neutralDigital,
  neutralFinancial,
  neutralPsychosocial,
} from './projectedAggregator.mappers';

/** A member with no node in the projected graph — fail closed, do not fabricate. */
export class MemberNotInProjectedGraphError extends Error {
  constructor(public readonly memberId: string) {
    super(
      `holistic context: member '${memberId}' has no node in the projected graph ` +
        `(fail-closed; refusing to fabricate a context)`
    );
    this.name = 'MemberNotInProjectedGraphError';
  }
}

/** All five consent-scoped lenses over one member — the single read surface. */
export interface MemberLensBundle {
  wholePerson: LensResult;
  careGap: LensResult;
  sdohBarrier: LensResult;
  careTeam: LensResult;
  part2Restricted: LensResult;
}

/**
 * Compose the five consent-scoped lenses. The aggregator maps the three that have
 * a home in HolisticPatientContext today (whole-person, care-gap, sdoh-barrier);
 * care-team and part2-restricted are returned for Phase 4 consumers (care-team UI,
 * agents) and to prove consent enforcement end-to-end.
 */
export async function readMemberLensBundle(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<MemberLensBundle> {
  const [wholePerson, careGap, sdohBarrier, careTeam, part2Restricted] = await Promise.all([
    wholePersonLens(store, memberId, scope),
    careGapLens(store, memberId, scope),
    sdohBarrierLens(store, memberId, scope),
    careTeamLens(store, memberId, scope),
    part2RestrictedLens(store, memberId, scope),
  ]);
  return { wholePerson, careGap, sdohBarrier, careTeam, part2Restricted };
}

export interface BuildContextOptions {
  /** Injected clock for contextGeneratedAt (default: clock.now). */
  now?: () => number;
}

/**
 * Build a member's HolisticPatientContext from a projected GraphStore. Store is
 * injected, so this is unit-testable against a seeded store with no globals.
 * Throws MemberNotInProjectedGraphError if the member has no node (fail-closed).
 */
export async function buildHolisticContextFromGraph(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT,
  opts: BuildContextOptions = {}
): Promise<HolisticPatientContext> {
  const member = await store.getNode(MEMBER_KIND, memberId);
  if (!member) throw new MemberNotInProjectedGraphError(memberId);
  const now = opts.now ?? clockNow;

  const bundle = await readMemberLensBundle(store, memberId, scope);

  return {
    patient: mapPatient(member),
    clinicalProfile: mapClinical(bundle.wholePerson, bundle.careGap),
    barriers: mapBarriers(bundle.sdohBarrier),
    caregiverStatus: neutralCaregiver(),
    financialProfile: neutralFinancial(),
    accessProfile: neutralAccess(),
    digitalProfile: neutralDigital(),
    psychosocialProfile: neutralPsychosocial(),
    contextGeneratedAt: new Date(now()).toISOString(),
    contextProvenance: {
      source: 'projected-graph',
      projectedSections: PROJECTED_SECTIONS,
      neutralSections: NEUTRAL_SECTIONS,
    },
  };
}

/**
 * The production aggregator function for the holistic-context seam: reads the
 * process-shared projection graph (Phase 1). Register via
 * `setProductionHolisticAggregatorAsync(makeProjectedGraphAggregator())`.
 */
export function makeProjectedGraphAggregator(): (
  memberId: string,
  scope?: ConsentScope
) => Promise<HolisticPatientContext> {
  return (memberId, scope) =>
    buildHolisticContextFromGraph(getSharedProjectionStores().graph, memberId, scope);
}

/**
 * Register the projected-graph aggregator on the holistic-context seam. Call from
 * the production composition root (Phase 4); a no-op in mock/seeded reads, which
 * never hit the production branch.
 */
export function registerProjectedGraphAggregator(): void {
  setProductionHolisticAggregatorAsync(makeProjectedGraphAggregator());
}
