import { describe, it, expect } from 'vitest';
import { seededIdentitySource, SEEDED_MEDICAID_IDS } from '@/lib/cdp-intake/seededIdentitySource';

describe('cdp-intake/seededIdentitySource', () => {
  it('exposes the 5 canonical demo patients as payer MPI candidates', () => {
    const recs = seededIdentitySource.recordsFor('payer');
    expect(recs).toHaveLength(5);
    expect(recs.map((r) => r.traits.medicaidId).sort()).toEqual([
      'SD-MEDICAID-00042',
      'SD-MEDICAID-00087',
      'SD-MEDICAID-00103',
      'SD-MEDICAID-00156',
      'SD-MEDICAID-88213',
    ]);
  });

  it('is payer-scoped — no candidates leak into another source system', () => {
    expect(seededIdentitySource.recordsFor('emr')).toHaveLength(0);
  });

  it('anchors every registry platformId on a medicaidId that a seed record carries', () => {
    const seeded = new Set(
      seededIdentitySource.recordsFor('payer').map((r) => r.traits.medicaidId)
    );
    for (const [platformId, medicaidId] of Object.entries(SEEDED_MEDICAID_IDS)) {
      expect(seeded.has(medicaidId), platformId).toBe(true);
    }
    // Maria reuses the id already in the engine's MOCK_RECORDS.
    expect(SEEDED_MEDICAID_IDS.MARIA_SD_001).toBe('SD-MEDICAID-88213');
  });
});
