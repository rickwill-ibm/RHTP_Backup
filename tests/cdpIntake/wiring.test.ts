import { describe, it, expect } from 'vitest';
import { makeLiveDispatch, runPopulationLoad } from '@/lib/cdp-intake/wiring';

describe('cdp-intake/wiring', () => {
  it('builds a live dispatch bound to both front doors', () => {
    const d = makeLiveDispatch();
    expect(typeof d.ingestFhir).toBe('function');
    expect(typeof d.runAdapter).toBe('function');
  });

  it('exposes runPopulationLoad', () => {
    expect(typeof runPopulationLoad).toBe('function');
  });

  it('reports (does not yet load) raw adapter sources in this increment', async () => {
    const d = makeLiveDispatch();
    const o = await d.runAdapter('eligibility834', 'SD_MEDICAID_MMIS', 'x12-834', 'ISA*00*…~');
    expect(o.loaded).toBe(0);
    expect(o.sourceSystem).toBe('SD_MEDICAID_MMIS');
  });
});
