import { describe, it, expect, afterEach } from 'vitest';
import { setSessionDataMode, clearSessionDataModes, DATA_MODE_SEAMS } from '@/lib/config/dataMode';
import {
  DataSourceNotConfiguredError,
  getRemittanceGatewayLoader,
  normalizeRemittanceAdvice,
} from '@/lib/dataSources';

const AS_OF = '2026-08-30T00:00:00.000Z';

afterEach(() => clearSessionDataModes());

describe('remittance gateway loader (835)', () => {
  it('registers the remittanceGateway seam', () => {
    expect(DATA_MODE_SEAMS).toContain('remittanceGateway');
  });

  it('seeded mode loads and normalizes the seed, stamping asOf', async () => {
    const advice = await getRemittanceGatewayLoader().load(AS_OF);
    expect(advice.asOf).toBe(AS_OF);
    expect(advice.remittances.length).toBeGreaterThan(0);
    const r = advice.remittances[0];
    expect(r.code).toBe('72148');
    expect(r.payer).toBe('UnitedHealthcare Community Plan');
    // per-group adjustment amounts preserved (FIX-2 depends on this)
    expect(r.adjustments.find((a) => a.group === 'CO')?.amount).toBe(650);
    expect(r.adjustments.find((a) => a.group === 'PR')?.amount).toBe(150);
    // no precomputed verdict field on the seed row
    expect((r as unknown as Record<string, unknown>).verdict).toBeUndefined();
  });

  it('production mode throws DataSourceNotConfiguredError', async () => {
    setSessionDataMode('remittanceGateway', 'production');
    await expect(getRemittanceGatewayLoader().load(AS_OF)).rejects.toThrow(
      DataSourceNotConfiguredError
    );
  });

  it('rejects an adjustment with an unknown group', () => {
    expect(() =>
      normalizeRemittanceAdvice(
        {
          remittances: [
            {
              remittanceId: 'r',
              claimRef: 'c',
              payer: 'p',
              code: '72148',
              billedAmount: 100,
              paidAmount: 80,
              adjustments: [{ group: 'ZZ', amount: 20 }],
              carcCodes: [],
              rarcCodes: [],
              carcGroups: [],
              paidDate: '2026-01-01',
            },
          ],
        },
        AS_OF
      )
    ).toThrow(/'group' must be one of/);
  });

  it('rejects a row missing a required numeric field', () => {
    expect(() =>
      normalizeRemittanceAdvice(
        {
          remittances: [
            {
              remittanceId: 'r',
              claimRef: 'c',
              payer: 'p',
              code: '72148',
              billedAmount: 100,
              // paidAmount missing
              adjustments: [],
              carcCodes: [],
              rarcCodes: [],
              carcGroups: [],
              paidDate: '2026-01-01',
            },
          ],
        },
        AS_OF
      )
    ).toThrow(/'paidAmount'/);
  });

  it('defaults a missing remittances array to empty', () => {
    expect(normalizeRemittanceAdvice({}, AS_OF)).toEqual({ asOf: AS_OF, remittances: [] });
  });
});
