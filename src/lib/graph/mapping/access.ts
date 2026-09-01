// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Access-geography mapping spec: access-context events -> the member's access
 * subgraph. ONE new node kind and a dated associative link to the member:
 *
 *   (Member)-[:HAS_ACCESS_CONTEXT {valid from asOf}]->(AccessContext)   associative
 *
 * AccessContext is the geographic/infrastructure REALITY of the member's locale
 * (rural status, distances to care, transit/broadband/cellular SUPPLY). It is an
 * observed factual record (associative, dated), NOT a causal claim. It is a
 * DISJOINT source from the SDOH-barrier lens: barriers read the member's asserted
 * NEEDS (SocialNeed/SdohScreening via SCREENED_FOR/HAS_UNMET_NEED), access reads the
 * area's infrastructure SUPPLY — no field is written from two places ("transit
 * exists here" and "the member reports no ride" are both true, not a contradiction).
 *
 * Every value is a scalar PropVal, and an ABSENT field is stored as null (never a
 * fabricated default) so the reader can fail closed to "unknown". The pinned
 * namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity can assert
 * every surface (spec, registry) agrees (F-C1 lesson).
 *
 * SOURCING RULE (privacy — enforced by policy + the deferred adapter): access fields
 * are derived ONLY from GENERIC home-location -> infrastructure geography (RUCA/FIPS,
 * FCC broadband, transit coverage, network-adequacy directory). They MUST NEVER be
 * populated from a member's clinical routing (referrals/encounters), so `nearestLab-
 * Location` can never name a member-specific SUD/OTP facility (a 42 CFR Part 2 leak).
 * Before real feeds land, distances should be BANDED and any named place replaced with
 * a non-member-specific coded anchor (re-identification minimum-necessary). This is why
 * the node is restricted:false — generic geography is not clinical/segmented data.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned access-geography namespace — the single source of truth the test pins. */
export const ACCESS_DOMAIN = 'access-geography';
export const ACCESS_CONTEXT_KIND = 'AccessContext';
export const HAS_ACCESS_CONTEXT = 'HAS_ACCESS_CONTEXT';

/** Coercers: return the typed value or null when absent — NEVER a cheerful default. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

export const accessSpec = {
  domain: ACCESS_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('access.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const start = event.occurredAt || new Date(deps.now()).toISOString();
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, ACCESS_CONTEXT_KIND, event.memberId, {
        ruralStatus: str(p.ruralStatus),
        distanceToProviderMiles: num(p.distanceToProviderMiles),
        publicTransitAvailable: bool(p.publicTransitAvailable),
        broadbandAvailable: bool(p.broadbandAvailable),
        cellularCoverage: str(p.cellularCoverage),
        nearestPharmacyMiles: num(p.nearestPharmacyMiles),
        nearestERMiles: num(p.nearestERMiles),
        nearestFacilityMiles: num(p.nearestFacilityMiles),
        nearestLabLocation: str(p.nearestLabLocation),
        geocodeBasis: str(p.geocodeBasis),
        asOf: start,
      })
    );
    out.push({
      op: 'UpsertEdge',
      type: HAS_ACCESS_CONTEXT,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: ACCESS_CONTEXT_KIND, key: event.memberId },
      properties: { asOf: start },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
