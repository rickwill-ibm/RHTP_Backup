import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  appendEntry,
  tierOfEntry,
  computeProcessTier,
  EVIDENCE_TIER_ORDER,
  TIER_RUNG_CEILING,
  RUNG_ORDER,
  type EvidenceRecord,
  type EvidenceEntry,
} from '@/lib/evidence';

/**
 * Wave-1 evidence tier ladder: type→tier lookup, weakest-link process tier,
 * non-monotonicity, and order-independence.
 */
function baseRecord(): EvidenceRecord {
  return createEvidenceRecord({
    id: 'ev-tier-1',
    memberId: 'MARIA_SD_001',
    order: { code: '72148', display: 'MRI lumbar', providerNpi: '1730154782' },
    createdAt: '2026-08-25T00:00:00.000Z',
  });
}

// Distributive Omit so each union member keeps its own discriminated fields.
type WithoutIdTs<T> = T extends unknown ? Omit<T, 'id' | 'ts'> : never;

let seq = 0;
function entry(partial: WithoutIdTs<EvidenceEntry>): EvidenceEntry {
  seq += 1;
  return { id: `e${seq}`, ts: `2026-08-25T00:00:0${seq}.000Z`, ...partial } as EvidenceEntry;
}

const remittance = (): EvidenceEntry =>
  entry({
    stage: 'remittance',
    type: 'remittance',
    remittanceId: 'RA-1',
    paidAmount: 100,
    adjustments: [{ group: 'CO', amount: 20 }],
    carcCodes: ['45'],
    rarcCodes: [],
    carcGroups: ['CO'],
  });

const eligibility = (): EvidenceEntry =>
  entry({ stage: 'eligibility', type: 'eligibility', requiresPA: true });

const reconciliation = (): EvidenceEntry =>
  entry({
    stage: 'reconciliation',
    type: 'reconciliation',
    verdict: 'underpaid',
    contractedAllowed: 200,
    paidAmount: 100,
    delta: 100,
    toleranceApplied: 5,
  });

const recovery = (): EvidenceEntry =>
  entry({
    stage: 'recovery',
    type: 'recovery',
    action: 'draft-appeal',
    status: 'draft',
    rung: 'A2',
  });

describe('config ordinals + ceiling', () => {
  it('tier order is D0<D1<D2<D3', () => {
    expect(EVIDENCE_TIER_ORDER).toEqual({ D0: 0, D1: 1, D2: 2, D3: 3 });
  });
  it('rung order is A0<A1<A2<A3', () => {
    expect(RUNG_ORDER).toEqual({ A0: 0, A1: 1, A2: 2, A3: 3 });
  });
  it('tier→rung ceiling is Dn→An and frozen', () => {
    expect(TIER_RUNG_CEILING).toEqual({ D0: 'A0', D1: 'A1', D2: 'A2', D3: 'A3' });
    expect(Object.isFrozen(TIER_RUNG_CEILING)).toBe(true);
  });
});

describe('tierOfEntry — data lookup table', () => {
  const cases: Array<[EvidenceEntry, string]> = [
    [remittance(), 'D0'],
    [eligibility(), 'D1'],
    [
      entry({
        stage: 'medical-necessity',
        type: 'coverage-determination',
        determination: {
          outcome: 'covered-no-pa',
          requiresPA: false,
          propensityToDeny: 'low',
          deficiencies: [],
        } as never,
      }),
      'D1',
    ],
    [
      entry({
        stage: 'eligibility',
        type: 'gold-card',
        exemption: { applied: true, providerNpi: 'n', code: '72148', payer: 'p', reason: 'r' },
      }),
      'D1',
    ],
    [entry({ stage: 'medical-necessity', type: 'dtr-response', itemCount: 3 }), 'D1'],
    [entry({ stage: 'medical-necessity', type: 'propensity', score: 0.2, band: 'low' }), 'D1'],
    [
      entry({
        stage: 'prior-auth',
        type: 'pas-submission',
        approver: { reference: 'Practitioner/x', display: 'Dr X' },
      }),
      'D1',
    ],
    [entry({ stage: 'prior-auth', type: 'pas-decision', decision: 'approved' }), 'D1'],
    [entry({ stage: 'patient-estimation', type: 'note', text: 'n' }), 'D1'],
    [entry({ stage: 'claim', type: 'claim-submission', claimRef: 'C-1', total: 200 }), 'D1'],
    [reconciliation(), 'D2'],
    [entry({ stage: 'reconciliation', type: 'underpayment', delta: 100, basis: 'b' }), 'D2'],
    [recovery(), 'D3'],
  ];
  it.each(cases)('maps %o → %s', (e, tier) => {
    expect(tierOfEntry(e)).toBe(tier);
  });
});

describe('computeProcessTier — weakest link', () => {
  it('empty record → D0', () => {
    expect(computeProcessTier(baseRecord())).toBe('D0');
  });

  it('minimum tier over the entry set (D1 eligibility + D2 reconciliation → D1)', () => {
    let r = baseRecord();
    r = appendEntry(r, eligibility());
    r = appendEntry(r, reconciliation());
    expect(computeProcessTier(r)).toBe('D1');
  });

  it('all-D2/D3 set → D2 (weakest of the two)', () => {
    let r = baseRecord();
    r = appendEntry(r, reconciliation());
    r = appendEntry(r, recovery());
    expect(computeProcessTier(r)).toBe('D2');
  });

  it('NON-MONOTONE: a D0 remittance appended after a D2 reconciliation drops the tier to D0', () => {
    let r = baseRecord();
    r = appendEntry(r, reconciliation());
    expect(computeProcessTier(r)).toBe('D2');
    r = appendEntry(r, remittance());
    expect(computeProcessTier(r)).toBe('D0'); // later weak entry lowers it
  });

  it('order-independent: the same entry set in any append order yields the same tier', () => {
    const a = remittance();
    const b = reconciliation();
    const c = recovery();
    let r1 = baseRecord();
    r1 = appendEntry(appendEntry(appendEntry(r1, a), b), c);
    let r2 = baseRecord();
    r2 = appendEntry(appendEntry(appendEntry(r2, c), b), a);
    expect(computeProcessTier(r1)).toBe(computeProcessTier(r2));
    expect(computeProcessTier(r1)).toBe('D0');
  });
});
