// Access dimension end-to-end (WPC Unit 1): a feed-shaped event is projected into
// the graph and surfaces as a REAL accessProfile through the holistic aggregator —
// and a member with no access data fails closed to honest 'unknown'.
import { describe, it, expect } from 'vitest';
import { project } from '@/lib/graph';
import { buildHolisticContextFromGraph } from '@/lib/wpc/projectedAggregator';
import { c2, fixedNow, makeNeo4jFakeStore } from '../graph/helpers';

const deps = { now: fixedNow };
const accessEvent = (memberId: string, payload: Record<string, unknown>) =>
  c2({ eventType: 'access.geographic.recorded', memberId, payload });

describe('access dimension end-to-end (project -> graph -> holistic context)', () => {
  it('surfaces a REAL accessProfile (not the old neutral urban/0) with provenance', async () => {
    const store = makeNeo4jFakeStore();
    await store.apply(
      project(
        [
          accessEvent('WPC-DEMO-01', {
            ruralStatus: 'rural',
            distanceToProviderMiles: 45,
            publicTransitAvailable: false,
            broadbandAvailable: true,
            cellularCoverage: 'good',
            nearestPharmacyMiles: 12,
            nearestERMiles: 35,
          }),
        ],
        deps
      )
    );
    const ctx = await buildHolisticContextFromGraph(store, 'WPC-DEMO-01');
    expect(ctx.accessProfile.dataAvailability).toBe('reported');
    expect(ctx.accessProfile.ruralStatus).toBe('rural'); // from the feed
    expect(ctx.accessProfile.ruralStatus).not.toBe('urban'); // not the old false default
    expect(ctx.accessProfile.distanceToProvider).toBe(45);
    expect(ctx.accessProfile.broadbandAccess).toBe(true);
    expect(ctx.contextProvenance?.projectedSections).toContain('accessProfile');
    expect(ctx.contextProvenance?.neutralSections).not.toContain('accessProfile');
  });

  it('fail-closed: a member with NO access node gets honest unknown, never fabricated', async () => {
    const store = makeNeo4jFakeStore();
    // a coverage event creates the Member node but no AccessContext
    await store.apply(project([c2({ memberId: 'WPC-NOACCESS' })], deps));
    const ctx = await buildHolisticContextFromGraph(store, 'WPC-NOACCESS');
    expect(ctx.accessProfile.dataAvailability).toBe('unknown');
    expect(ctx.accessProfile.ruralStatus).toBe('unknown');
    expect('distanceToProvider' in ctx.accessProfile).toBe(false);
    // provenance still lists accessProfile as a projected section (it was evaluated)
    expect(ctx.contextProvenance?.projectedSections).toContain('accessProfile');
  });
});
