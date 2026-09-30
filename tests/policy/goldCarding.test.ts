import { describe, it, expect } from 'vitest';
import {
  evaluateGoldCard,
  toEvidence,
  MOCK_GOLD_CARD_CONTEXT,
  type GoldCardContext,
} from '@/lib/policy/goldCarding';

/** GC — gold carding qualification, expiry, and evidence mapping. */

const asOf = '2026-07-26T00:00:00.000Z';
const payer = 'UnitedHealthcare Community Plan';
const ctx: GoldCardContext = { ...MOCK_GOLD_CARD_CONTEXT, asOf };

describe('Gold carding — granted card', () => {
  it('applies for a provider with an active granted card', () => {
    const s = evaluateGoldCard({ providerNpi: '1730154782', code: '72148', payer }, ctx);
    expect(s.applied).toBe(true);
    expect(s.approvalRate).toBeCloseTo(0.97);
    expect(s.expiresOn).toBe('2027-01-01');
    expect(s.reason).toMatch(/active/);
  });

  it('does NOT apply once the card is expired', () => {
    const s = evaluateGoldCard(
      { providerNpi: '1730154782', code: '72148', payer },
      { ...ctx, asOf: '2027-06-01T00:00:00.000Z' }
    );
    expect(s.applied).toBe(false);
    expect(s.reason).toMatch(/expired/);
  });

  it('does NOT apply when revoked', () => {
    const revoked: GoldCardContext = {
      ...ctx,
      roster: [{ ...ctx.roster![0], revoked: true }],
    };
    const s = evaluateGoldCard({ providerNpi: '1730154782', code: '72148', payer }, revoked);
    expect(s.applied).toBe(false);
    expect(s.reason).toMatch(/revoked/);
  });
});

describe('Gold carding — qualification from history', () => {
  it('qualifies a provider at 94% with sufficient volume', () => {
    const s = evaluateGoldCard({ providerNpi: '1043321987', code: '72148', payer }, ctx);
    expect(s.applied).toBe(true);
    expect(s.approvalRate).toBeGreaterThanOrEqual(0.9);
    expect(s.sampleSize).toBe(18);
  });

  it('does NOT qualify a provider below the 90% threshold', () => {
    const s = evaluateGoldCard({ providerNpi: '1518998765', code: '72148', payer }, ctx);
    expect(s.applied).toBe(false);
    expect(s.reason).toMatch(/below threshold/);
  });

  it('does NOT qualify when volume is below the minimum, even at 100%', () => {
    const s = evaluateGoldCard(
      { providerNpi: '9999999999', code: '72148', payer },
      {
        ...ctx,
        histories: [
          {
            providerNpi: '9999999999',
            code: '72148',
            payer,
            submissions: 3,
            approvals: 3,
            windowMonths: 12,
          },
        ],
      }
    );
    expect(s.applied).toBe(false);
    expect(s.reason).toMatch(/insufficient volume/);
  });
});

describe('Gold carding — no data', () => {
  it('returns not-applied when there is no card and no history', () => {
    const s = evaluateGoldCard({ providerNpi: '0000000000', code: '72148', payer }, ctx);
    expect(s.applied).toBe(false);
    expect(s.reason).toMatch(/no gold card/);
  });
});

describe('Gold carding — evidence mapping', () => {
  it('maps a status to GoldCardEvidence the Evidence Record accepts', () => {
    const s = evaluateGoldCard({ providerNpi: '1730154782', code: '72148', payer }, ctx);
    const ev = toEvidence(s);
    expect(ev.applied).toBe(true);
    expect(ev.providerNpi).toBe('1730154782');
    expect(ev.code).toBe('72148');
    expect(ev.basis).toBe('UHC voluntary gold card');
    expect(ev.reason).toBeTruthy();
  });
});
