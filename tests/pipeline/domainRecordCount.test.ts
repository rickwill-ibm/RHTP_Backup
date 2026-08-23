import { describe, it, expect } from 'vitest';
import { MAPPING_SPECS } from '@/lib/graph';
import type { WpcDomain } from '@/lib/pipeline';

/**
 * The C9 record-count assertion (Iteration 11 Wave B): the pipeline now delivers
 * TWENTY record domains, and every one is a fully-wired record — a WpcDomain id
 * that a registered mapping spec owns. This test pins the 20/20 count from BOTH
 * ends so neither side can drift:
 *
 *   1. ALL_WPC_DOMAINS is typed `WpcDomain[]`, so TypeScript rejects a typo'd or
 *      non-existent domain id at compile time (the union is the source of truth).
 *   2. The runtime set of that list must equal the set of domains the registered
 *      MAPPING_SPECS claim — a spec added without a domain id, or a domain id added
 *      without its spec, breaks the equality. So 20 ids <-> 20 registered specs.
 *
 * Wave B added the final three: conditions, diagnostic-reports, family-history.
 */
const ALL_WPC_DOMAINS: WpcDomain[] = [
  'coverage',
  'encounter',
  'sdoh',
  'medications',
  'labs-vitals',
  'allergies',
  'procedures',
  'care-team',
  'goals-tasks',
  'referrals',
  'immunizations',
  'claims-financial',
  'pa-lifecycle',
  'behavioral-health',
  'assessments',
  'caregiver-household',
  'documents',
  // ── Iteration 11 Wave B: the three domains that bring the count to 20.
  'conditions',
  'diagnostic-reports',
  'family-history',
];

describe('C9 record count: 20/20 domains, each a registered record', () => {
  it('lists exactly 20 distinct WpcDomain ids', () => {
    expect(ALL_WPC_DOMAINS).toHaveLength(20);
    expect(new Set(ALL_WPC_DOMAINS).size).toBe(20);
  });

  it('registers exactly 20 mapping specs', () => {
    expect(MAPPING_SPECS).toHaveLength(20);
    expect(new Set(MAPPING_SPECS.map((s) => s.domain)).size).toBe(20);
  });

  it('every domain is owned by a registered spec, and every spec owns a domain (20/20)', () => {
    const declared = [...ALL_WPC_DOMAINS].sort();
    const registered = [...MAPPING_SPECS.map((s) => s.domain)].sort();
    expect(registered).toEqual(declared);
  });

  it('the three Iteration 11 Wave B domains are present and registered', () => {
    const registered = new Set(MAPPING_SPECS.map((s) => s.domain));
    for (const d of ['conditions', 'diagnostic-reports', 'family-history']) {
      expect(ALL_WPC_DOMAINS).toContain(d as WpcDomain);
      expect(registered.has(d)).toBe(true);
    }
  });
});
