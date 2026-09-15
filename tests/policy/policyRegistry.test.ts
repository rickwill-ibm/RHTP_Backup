/**
 * policyRegistry — locks in the coalition must-fixes for the generic live-DTR dispatch:
 *  • `undefined` from evaluateLivePolicy means ONLY "code not registered" (legit fall-through);
 *  • a REGISTERED code evaluates live (never falls open to a canned scenario);
 *  • a missing/renamed policy id fails LOUD (policyById throws), not silent-empty;
 *  • the registry's CPT set is duplicate-free.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveLivePolicy,
  evaluateLivePolicy,
  policyById,
  LIVE_POLICY_REGISTRY,
} from '@/lib/policy/dtr/evaluate/policyRegistry';

// CG-SURG-83 code set, derived directly from the registry row (the bariatricCriteria compat shim was
// removed — E14 wired-path — as no production code reached it).
const BARIATRIC_CPT_CODES: ReadonlySet<string> = new Set(policyById('CG-SURG-83').cptCodes);

describe('policyRegistry — generic live-DTR dispatch', () => {
  it('an unregistered code (lumbar MRI 72148) is not a live policy → undefined sentinel', async () => {
    expect(resolveLivePolicy('72148')).toBeUndefined();
    expect(await evaluateLivePolicy('72148')).toBeUndefined();
  });

  it('a registered bariatric code evaluates LIVE (never returns undefined)', async () => {
    const result = (await evaluateLivePolicy('43644')) as { policyTitle?: string; groups?: unknown[] };
    expect(result).toBeDefined();
    expect(result.policyTitle).toMatch(/Bariatric/i);
    expect(Array.isArray(result.groups)).toBe(true);
  });

  it('policyById fails loud for an unknown id (no silent-empty)', () => {
    expect(() => policyById('CG-SURG-83')).not.toThrow();
    expect(() => policyById('NOT-A-POLICY')).toThrow(/no policy row/i);
  });

  it('the CG-SURG-83 code set is duplicate-free and matches its row', () => {
    const row = policyById('CG-SURG-83');
    expect(BARIATRIC_CPT_CODES.size).toBe(row.cptCodes.length); // no duplicates collapsed
    expect([...BARIATRIC_CPT_CODES].sort()).toEqual([...row.cptCodes].sort());
  });

  it('every registered row has codes, a pdf path, a bundle key and an asOf date', () => {
    for (const p of LIVE_POLICY_REGISTRY) {
      expect(p.cptCodes.length).toBeGreaterThan(0);
      expect(p.pdfPath).toMatch(/\.pdf$/);
      expect(p.patientBundleKey).toBeTruthy();
      expect(Number.isNaN(new Date(p.asOf).getTime())).toBe(false);
    }
  });
});
