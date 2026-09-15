import { describe, it, expect, afterEach } from 'vitest';
import { setSessionDataMode, clearSessionDataModes, DATA_MODE_SEAMS } from '@/lib/config/dataMode';
import {
  DataSourceNotConfiguredError,
  getContractRepositoryLoader,
  normalizeFeeSchedule,
} from '@/lib/dataSources';
import { MOCK_ALLOWED_AMOUNTS } from '@/lib/goldenThread/patientEstimation';

const AS_OF = '2026-08-30T00:00:00.000Z';

afterEach(() => clearSessionDataModes());

describe('contract repository loader (fee schedule)', () => {
  it('registers the contractRepository seam', () => {
    expect(DATA_MODE_SEAMS).toContain('contractRepository');
  });

  it('seeded mode loads and normalizes the seed, stamping asOf', async () => {
    const fs = await getContractRepositoryLoader().load(AS_OF);
    expect(fs.asOf).toBe(AS_OF);
    expect(fs.rates.length).toBeGreaterThan(0);
  });

  it('lookup finds 72148 / UHC at the contracted allowed matching MOCK_ALLOWED_AMOUNTS', async () => {
    const fs = await getContractRepositoryLoader().load(AS_OF);
    const rate = fs.lookup('72148', 'UnitedHealthcare Community Plan');
    expect(rate?.contractedAllowed).toBe(1150);
    expect(rate?.contractedAllowed).toBe(MOCK_ALLOWED_AMOUNTS['72148']);
    // unknown code/payer → undefined
    expect(fs.lookup('72148', 'Other Payer')).toBeUndefined();
    expect(fs.lookup('00000', 'UnitedHealthcare Community Plan')).toBeUndefined();
  });

  it('production mode throws DataSourceNotConfiguredError', async () => {
    setSessionDataMode('contractRepository', 'production');
    await expect(getContractRepositoryLoader().load(AS_OF)).rejects.toThrow(
      DataSourceNotConfiguredError
    );
  });

  it('rejects a rate missing a required field', () => {
    expect(() =>
      normalizeFeeSchedule({ rates: [{ code: '72148', payer: 'p' }] }, AS_OF)
    ).toThrow(/'contractedAllowed'/);
  });

  it('defaults a missing rates array to empty', () => {
    const fs = normalizeFeeSchedule({}, AS_OF);
    expect(fs.rates).toEqual([]);
    expect(fs.lookup('72148', 'x')).toBeUndefined();
  });
});
