import { describe, it, expect, afterEach } from 'vitest';
import { setSessionDataMode, clearSessionDataModes, DATA_MODE_SEAMS } from '@/lib/config/dataMode';
import {
  DataSourceNotConfiguredError,
  getGoldCardRosterLoader,
  normalizeGoldCardRoster,
  getDenialRateFeedLoader,
  normalizeDenialRateFeed,
  lookupDenialRate,
  getProviderDirectoryLoader,
  normalizeProviderDirectory,
} from '@/lib/dataSources';

const AS_OF = '2026-08-22T00:00:00.000Z';

afterEach(() => clearSessionDataModes());

describe('dataMode registry — O-2 seams registered', () => {
  it('registers all three adapter seams', () => {
    expect(DATA_MODE_SEAMS).toContain('goldCardRoster');
    expect(DATA_MODE_SEAMS).toContain('denialRateFeed');
    expect(DATA_MODE_SEAMS).toContain('providerDirectory');
  });
});

describe('gold-card roster loader', () => {
  it('seeded mode loads and normalizes the seed file, stamping asOf', async () => {
    const roster = await getGoldCardRosterLoader().load(AS_OF);
    expect(roster.asOf).toBe(AS_OF);
    expect(roster.cards.length).toBeGreaterThan(0);
    expect(roster.histories.length).toBeGreaterThan(0);
    for (const c of roster.cards) expect(typeof c.approvalRate).toBe('number');
  });

  it('rejects a history where approvals exceed submissions', () => {
    expect(() =>
      normalizeGoldCardRoster(
        { cards: [], histories: [{ providerNpi: 'n', code: 'c', payer: 'p', submissions: 3, approvals: 5, windowMonths: 12 }] },
        AS_OF
      )
    ).toThrow(/approvals cannot exceed submissions/);
  });

  it('rejects a card missing a required field', () => {
    expect(() =>
      normalizeGoldCardRoster({ cards: [{ providerNpi: 'n' }], histories: [] }, AS_OF)
    ).toThrow(/'code'/);
  });

  it('defaults missing cards/histories arrays to empty', () => {
    expect(normalizeGoldCardRoster({}, AS_OF)).toEqual({ asOf: AS_OF, cards: [], histories: [] });
  });

  it('production mode throws NotConfigured', async () => {
    setSessionDataMode('goldCardRoster', 'production');
    await expect(getGoldCardRosterLoader().load(AS_OF)).rejects.toThrow(DataSourceNotConfiguredError);
  });
});

describe('denial-rate feed loader', () => {
  it('seeded mode normalizes rates with optional plan/sample fields', async () => {
    const feed = await getDenialRateFeedLoader().load(AS_OF);
    expect(feed.asOf).toBe(AS_OF);
    const codeOnly = feed.rates.find((r) => r.code === '72148' && r.plan === null);
    expect(codeOnly?.rate).toBeGreaterThan(0);
  });

  it('lookupDenialRate prefers an exact plan match, falls back to plan-agnostic', async () => {
    const feed = await getDenialRateFeedLoader().load(AS_OF);
    expect(lookupDenialRate(feed, '72148', 'PLAN_HDHP')).toBe(0.34);
    expect(lookupDenialRate(feed, '72148', 'PLAN_UNKNOWN')).toBe(0.28); // falls back to null-plan row
    expect(lookupDenialRate(feed, '72148')).toBe(0.28);
    expect(lookupDenialRate(feed, 'NOPE')).toBeUndefined();
  });

  it('rejects a rate outside 0..1', () => {
    expect(() => normalizeDenialRateFeed({ rates: [{ code: 'c', rate: 1.5 }] }, AS_OF)).toThrow(/within 0\.\.1/);
  });

  it('production mode throws NotConfigured', async () => {
    setSessionDataMode('denialRateFeed', 'production');
    await expect(getDenialRateFeedLoader().load(AS_OF)).rejects.toThrow(DataSourceNotConfiguredError);
  });
});

describe('provider-directory loader', () => {
  it('seeded mode normalizes providers with lobs and status', async () => {
    const dir = await getProviderDirectoryLoader().load(AS_OF);
    expect(dir.asOf).toBe(AS_OF);
    expect(dir.providers.length).toBeGreaterThan(0);
    for (const p of dir.providers) {
      expect(Array.isArray(p.lobs)).toBe(true);
      expect(['active', 'credentialing', 'pending']).toContain(p.status);
    }
  });

  it('rejects an unknown provider status', () => {
    expect(() =>
      normalizeProviderDirectory(
        { providers: [{ npi: 'n', name: 'x', specialty: 's', county: 'c', state: 'GA', lat: 1, lng: 2, lobs: [], acceptingNewPatients: true, status: 'retired' }] },
        AS_OF
      )
    ).toThrow(/'status' must be one of/);
  });

  it('rejects a non-string lob entry', () => {
    expect(() =>
      normalizeProviderDirectory(
        { providers: [{ npi: 'n', name: 'x', specialty: 's', county: 'c', state: 'GA', lat: 1, lng: 2, lobs: [42], acceptingNewPatients: true, status: 'active' }] },
        AS_OF
      )
    ).toThrow(/lobs\[0\]/);
  });

  it('production mode throws NotConfigured', async () => {
    setSessionDataMode('providerDirectory', 'production');
    await expect(getProviderDirectoryLoader().load(AS_OF)).rejects.toThrow(DataSourceNotConfiguredError);
  });
});
