/**
 * Care-plan holistic path is seam-routed (WPC-01 Phase 4).
 *   mock:       the authored context drives a holistic plan (demo intact).
 *   production: with no wired aggregator it no longer silently serves authored
 *               data — it fails over to the comprehensive plan (the safe stopgap;
 *               the production-correct server-side path is backlog WPC-CD1).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setClock } from '@/lib/clock';
import { generateHolisticCarePlan, type ComprehensivePlanInput } from '@/lib/carePlan';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import { setProductionHolisticAggregator } from '@/lib/wpc/holisticContext';
import diabetesTransportation from './fixtures/diabetes-transportation.json';

const input = (diabetesTransportation as { input: ComprehensivePlanInput }).input;

beforeAll(() => setClock(() => new Date('2026-08-22T12:00:00Z').getTime()));
afterAll(() => setClock(null));
afterEach(() => {
  clearSessionDataModes();
  setProductionHolisticAggregator(null);
});

describe('care-plan holistic — seam-routed (WPC-01 Phase 4)', () => {
  it('mock: the authored context drives a holistic plan (demo intact)', () => {
    setSessionDataMode('wpcRecord', 'mock');
    // Maria's id guarantees the authored engine returns a rich holistic context.
    const plan = generateHolisticCarePlan({
      ...input,
      patient: { ...input.patient, id: 'patient-001' },
    });
    expect(plan.holisticPlan).toBeDefined();
  });

  it('production without a wired aggregator: no silent authored data — falls over to comprehensive', () => {
    setSessionDataMode('wpcRecord', 'production');
    const plan = generateHolisticCarePlan(input);
    expect(plan.holisticPlan).toBeUndefined();
    expect(plan.rootCauseInsight).toBeUndefined();
  });
});
