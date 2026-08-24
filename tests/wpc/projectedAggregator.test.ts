/**
 * Projected-graph holistic aggregator (WPC-01 Phase 3) — builds a member's
 * context from the REAL projected graph (seeded via the Phase 2 dev pipeline),
 * fail-closed on absent members, fail-honest on partial coverage, and the async
 * seam serves it in production while the mock demo stays authored.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDevProjection, _resetDevProjectionSeed } from '@/lib/runtime/devIngestion';
import {
  getSharedProjectionStores,
  _resetSharedProjectionStores,
} from '@/lib/runtime/projectionRuntime';
import { defaultPipelineDeps } from '@/lib/pipeline';
import { now } from '@/lib/clock';
import {
  buildHolisticContextFromGraph,
  makeProjectedGraphAggregator,
  readMemberLensBundle,
  MemberNotInProjectedGraphError,
} from '@/lib/wpc/projectedAggregator';
import {
  resolveHolisticContextAsync,
  setProductionHolisticAggregatorAsync,
  HolisticContextNotConfiguredError,
} from '@/lib/wpc/holisticContext';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

/** Resolve the demo member id exactly as the pipeline does (mirrors Phase 2). */
const demo01 = () =>
  defaultPipelineDeps({ now }).resolveIdentity('WPC-DEMO-01', { feed: 'sdoh-flat-file' });

describe('projected-graph holistic aggregator (WPC-01 Phase 3)', () => {
  beforeEach(() => {
    _resetSharedProjectionStores();
    _resetDevProjectionSeed();
    clearSessionDataModes();
    setProductionHolisticAggregatorAsync(null);
  });
  afterEach(() => {
    clearSessionDataModes();
    setProductionHolisticAggregatorAsync(null);
  });

  it('builds a real context from the seeded graph — screened barriers land, unscreened stay honest', async () => {
    await seedDevProjection();
    const store = getSharedProjectionStores().graph;
    const id = demo01();
    const ctx = await buildHolisticContextFromGraph(store, id);

    // the real member, never the authored demo patient
    expect(ctx.patient.id).toBe(id);
    expect(ctx.patient.name).not.toBe('Maria Redhawk');

    // WPC-DEMO-01 screened POSITIVE for transportation + food
    expect(ctx.barriers.transportation.status).toBe('identified');
    expect(ctx.barriers.transportation.severity).toBe('high');
    expect(ctx.barriers.food.status).toBe('identified');

    // NEVER screened for housing → honest not-screened, not fabricated
    expect(ctx.barriers.housing.status).toBe('not-screened');

    // the unmet needs also surface as open care gaps
    expect(ctx.clinicalProfile.openCareGaps.length).toBeGreaterThan(0);

    // provenance declares what is real vs. neutral (fail-honest contract)
    expect(ctx.contextProvenance?.source).toBe('projected-graph');
    expect(ctx.contextProvenance?.projectedSections).toContain('barriers');
    expect(ctx.contextProvenance?.neutralSections).toContain('financialProfile');
  });

  it('composes all five consent-scoped lenses; part2 empty without scope', async () => {
    await seedDevProjection();
    const store = getSharedProjectionStores().graph;
    const bundle = await readMemberLensBundle(store, demo01());

    expect(bundle.wholePerson.nodes.length).toBeGreaterThan(1);
    expect(bundle.sdohBarrier.nodes.some((n) => n.kind === 'SocialNeed')).toBe(true);
    // the demo has no restricted data → the Part 2 lens is empty without a scope
    expect(bundle.part2Restricted.nodes).toHaveLength(0);
  });

  it('fails closed for a member absent from the projected graph', async () => {
    await seedDevProjection();
    const store = getSharedProjectionStores().graph;
    await expect(buildHolisticContextFromGraph(store, 'NOT-A-MEMBER')).rejects.toBeInstanceOf(
      MemberNotInProjectedGraphError
    );
  });

  describe('async seam', () => {
    it('production + no aggregator registered → fail closed', async () => {
      setSessionDataMode('wpcRecord', 'production');
      await expect(resolveHolisticContextAsync('anyone')).rejects.toBeInstanceOf(
        HolisticContextNotConfiguredError
      );
    });

    it('production + registered aggregator → serves the projected-graph context', async () => {
      await seedDevProjection();
      setSessionDataMode('wpcRecord', 'production');
      setProductionHolisticAggregatorAsync(makeProjectedGraphAggregator());

      const { context, source } = await resolveHolisticContextAsync(demo01());
      expect(source).toBe('projected-graph');
      expect(context.barriers.transportation.status).toBe('identified');
    });

    it('mock/seeded → authored engine (demo intact)', async () => {
      const { source } = await resolveHolisticContextAsync('patient-001');
      expect(source).toBe('authored');
    });
  });
});
