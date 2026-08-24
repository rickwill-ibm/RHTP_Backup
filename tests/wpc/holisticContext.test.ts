/**
 * HW4-B / I26 — holistic-context seam (WPC-01/02).
 * Proves: mock returns the authored engine context (demo intact); production
 * aggregates the registered graph source; production fails closed without one.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveHolisticContext,
  setProductionHolisticAggregator,
  HolisticContextNotConfiguredError,
  type HolisticPatientContext,
} from '../../src/lib/wpc/holisticContext';
import { setSessionDataMode, clearSessionDataModes } from '../../src/lib/config/dataMode';

afterEach(() => {
  clearSessionDataModes();
  setProductionHolisticAggregator(null);
});

describe('holistic-context seam', () => {
  it('mock returns the authored engine context (demo preserved)', () => {
    setSessionDataMode('wpcRecord', 'mock');
    const r = resolveHolisticContext('patient-001');
    expect(r.source).toBe('authored');
    expect(r.context).toBeTruthy();
  });

  it('production fails closed without a registered aggregator', () => {
    setSessionDataMode('wpcRecord', 'production');
    expect(() => resolveHolisticContext('patient-001')).toThrow(HolisticContextNotConfiguredError);
  });

  it('production uses the registered projected-graph aggregator', () => {
    const fake = { basicInfo: { patientId: 'm1' } } as unknown as HolisticPatientContext;
    setProductionHolisticAggregator(() => fake);
    setSessionDataMode('wpcRecord', 'production');
    const r = resolveHolisticContext('m1');
    expect(r.source).toBe('projected-graph');
    expect(r.context).toBe(fake);
  });
});
