import { describe, it, expect } from 'vitest';
import { MAPPING_SPECS } from '@/lib/graph';
import type { WpcDomain } from '@/lib/pipeline';

/**
 * The C9 record-count assertion (WPC payer dimensions): the pipeline now delivers
 * TWENTY-THREE record domains, and every one is a fully-wired record — a WpcDomain id
 * that a registered mapping spec owns. This test pins the 23/23 count from BOTH
 * ends so neither side can drift:
 *
 *   1. ALL_WPC_DOMAINS is typed `WpcDomain[]`, so TypeScript rejects a typo'd or
 *      non-existent domain id at compile time (the union is the source of truth).
 *   2. The runtime set of that list must equal the set of domains the registered
 *      MAPPING_SPECS claim — a spec added without a domain id, or a domain id added
 *      without its spec, breaks the equality. So 23 ids <-> 23 registered specs.
 *
 * Wave B added conditions, diagnostic-reports, family-history (16 -> 20). The WPC
 * payer-dimensions wave adds risk-assessment + flag as NEW projected record domains
 * (20 -> 22). Coverage/Encounter are NOT new domains here — they already existed and
 * only gained FHIR-JSON adapters over their EXISTING specs. The Da Vinci Risk
 * Adjustment wave adds coding-gap as a NEW projected record domain (22 -> 23).
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
  // ── Iteration 11 Wave B: the three domains that brought the count to 20.
  'conditions',
  'diagnostic-reports',
  'family-history',
  // ── WPC payer dimensions: the two NEW projected domains that bring it to 22.
  'risk-assessment',
  'flag',
  // ── WPC Da Vinci Risk Adjustment: the NEW projected coding-gap domain (22 -> 23).
  'coding-gap',
];

describe('C9 record count: 23/23 domains, each a registered record', () => {
  it('lists exactly 23 distinct WpcDomain ids', () => {
    expect(ALL_WPC_DOMAINS).toHaveLength(23);
    expect(new Set(ALL_WPC_DOMAINS).size).toBe(23);
  });

  it('registers exactly 23 mapping specs', () => {
    expect(MAPPING_SPECS).toHaveLength(23);
    expect(new Set(MAPPING_SPECS.map((s) => s.domain)).size).toBe(23);
  });

  it('every domain is owned by a registered spec, and every spec owns a domain (23/23)', () => {
    const declared = [...ALL_WPC_DOMAINS].sort();
    const registered = [...MAPPING_SPECS.map((s) => s.domain)].sort();
    expect(registered).toEqual(declared);
  });

  it('the WPC payer-dimension + coding-gap domains are present and registered', () => {
    const registered = new Set(MAPPING_SPECS.map((s) => s.domain));
    for (const d of ['risk-assessment', 'flag', 'coding-gap']) {
      expect(ALL_WPC_DOMAINS).toContain(d as WpcDomain);
      expect(registered.has(d)).toBe(true);
    }
  });
});
