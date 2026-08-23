import { describe, it, expect } from 'vitest';
import { createValueSetRegistry } from '@/lib/terminology/registry/valueSetRegistry';
import type { TerminologyAsset } from '@/lib/terminology/registry/assetTypes';
import {
  CURRENCY_REASONS,
  currencyReasonForFlag,
  decideAssetCurrency,
  decideSystemCurrency,
  decideBindingCurrency,
} from '@/lib/terminology/registry/currency';

/**
 * Value-set version CURRENCY enforcement (Iteration 8A-ii, Wave C).
 *
 * The registry answers whether a bound version is current; this module turns that
 * into an enforcement decision. E9: a stale / expired / superseded / retired
 * value-set version must NOT silently validate. Under the `enforce` posture a
 * not-current binding QUARANTINES; under `flag` it is surfaced but admitted. Every
 * decision is deterministic in the injected `asOf`.
 */

const AS_OF = new Date('2026-07-01T00:00:00.000Z');

/** A hand-authored asset (defaults are current-and-fresh; override per case). */
function asset(over: Partial<TerminologyAsset> & Pick<TerminologyAsset, 'id' | 'system'>): TerminologyAsset {
  return {
    name: over.id,
    family: 'clinical',
    steward: 'Test Steward',
    version: 'V1',
    effectiveDate: '2026-01-01',
    status: 'active',
    lastRefreshed: '2026-06-01',
    refreshCadence: 'annual',
    bindingStrength: 'required',
    sourceUrl: 'https://example.test',
    ...over,
  };
}

const ASSETS: TerminologyAsset[] = [
  // vs-a group: one active-in-window version + one superseded prior version.
  asset({ id: 'a-active', system: 'urn:test:vs-a', version: 'V2', effectiveDate: '2026-01-01' }),
  asset({
    id: 'a-superseded',
    system: 'urn:test:vs-a',
    version: 'V1',
    effectiveDate: '2020-01-01',
    expirationDate: '2025-12-31',
    status: 'superseded',
    lastRefreshed: '2020-01-01',
  }),
  // vs-b: an ACTIVE-status version that is nonetheless past its expiration date.
  asset({
    id: 'b-expired',
    system: 'urn:test:vs-b',
    effectiveDate: '2024-01-01',
    expirationDate: '2025-12-31',
    lastRefreshed: '2024-01-01',
  }),
  // vs-c: active + in window, but past its (daily) refresh cadence -> stale.
  asset({
    id: 'c-stale',
    system: 'urn:test:vs-c',
    effectiveDate: '2026-01-01',
    lastRefreshed: '2026-01-01',
    refreshCadence: 'daily',
  }),
  // vs-d: active, but not yet effective at asOf.
  asset({
    id: 'd-future',
    system: 'urn:test:vs-d',
    effectiveDate: '2027-01-01',
    lastRefreshed: '2026-12-01',
  }),
];

const BINDINGS = [{ domain: 'test', purpose: 'pinned-superseded', assetId: 'a-superseded' }];

function registry() {
  return createValueSetRegistry({ assets: ASSETS, bindings: BINDINGS });
}

describe('currencyReasonForFlag maps the registry verdict to a PHI-safe reason', () => {
  it('a current, fresh, in-window version has no reason', () => {
    const flag = registry().checkCurrency('a-active', AS_OF);
    expect(flag.current).toBe(true);
    expect(currencyReasonForFlag(flag)).toBeUndefined();
  });

  it('a superseded version reads as superseded', () => {
    const flag = registry().checkCurrency('a-superseded', AS_OF);
    expect(currencyReasonForFlag(flag)).toBe(CURRENCY_REASONS.superseded);
  });

  it('an active version past its expiration reads as expired', () => {
    const flag = registry().checkCurrency('b-expired', AS_OF);
    expect(currencyReasonForFlag(flag)).toBe(CURRENCY_REASONS.expired);
  });

  it('an in-window version past its refresh cadence reads as stale', () => {
    const flag = registry().checkCurrency('c-stale', AS_OF);
    expect(flag.current).toBe(true);
    expect(flag.stale).toBe(true);
    expect(currencyReasonForFlag(flag)).toBe(CURRENCY_REASONS.stale);
  });

  it('a not-yet-effective version reads as not-effective', () => {
    const flag = registry().checkCurrency('d-future', AS_OF);
    expect(currencyReasonForFlag(flag)).toBe(CURRENCY_REASONS.notEffective);
  });

  it('an unregistered asset reads as unregistered', () => {
    const flag = registry().checkCurrency('does-not-exist', AS_OF);
    expect(currencyReasonForFlag(flag)).toBe(CURRENCY_REASONS.unregistered);
  });
});

describe('decideAssetCurrency: posture controls quarantine-vs-flag', () => {
  it('a current version is neither flagged nor quarantined under either posture', () => {
    const r = registry();
    expect(decideAssetCurrency(r, 'a-active', 'enforce', AS_OF)).toMatchObject({ flagged: false, quarantine: false });
    expect(decideAssetCurrency(r, 'a-active', 'flag', AS_OF)).toMatchObject({ flagged: false, quarantine: false });
  });

  it('a superseded version quarantines under enforce, but only flags under flag', () => {
    const r = registry();
    const enforced = decideAssetCurrency(r, 'a-superseded', 'enforce', AS_OF);
    expect(enforced).toMatchObject({ flagged: true, quarantine: true, reasonCode: CURRENCY_REASONS.superseded });
    const flagged = decideAssetCurrency(r, 'a-superseded', 'flag', AS_OF);
    expect(flagged).toMatchObject({ flagged: true, quarantine: false, reasonCode: CURRENCY_REASONS.superseded });
  });

  it('an expired version quarantines under enforce (never validates a stale set)', () => {
    expect(decideAssetCurrency(registry(), 'b-expired', 'enforce', AS_OF)).toMatchObject({
      quarantine: true,
      reasonCode: CURRENCY_REASONS.expired,
    });
  });

  it('an unregistered asset fails closed under enforce (unverifiable version)', () => {
    expect(decideAssetCurrency(registry(), 'ghost', 'enforce', AS_OF)).toMatchObject({
      quarantine: true,
      reasonCode: CURRENCY_REASONS.unregistered,
    });
  });
});

describe('decideSystemCurrency: resolves the active version for a system URI', () => {
  it('a system with an active in-window version is current', () => {
    expect(decideSystemCurrency(registry(), 'urn:test:vs-a', 'enforce', AS_OF)).toMatchObject({
      assetId: 'a-active',
      flagged: false,
      quarantine: false,
    });
  });

  it('a system whose only versions are expired/superseded has no active version and quarantines under enforce', () => {
    // vs-b at a later asOf: the sole version is past its expiration -> none active.
    const later = new Date('2027-01-01T00:00:00.000Z');
    const d = decideSystemCurrency(registry(), 'urn:test:vs-b', 'enforce', later);
    expect(d).toMatchObject({ flagged: true, quarantine: true, reasonCode: CURRENCY_REASONS.noActiveVersion });
    // Under flag posture the same stale system is surfaced but admitted.
    expect(decideSystemCurrency(registry(), 'urn:test:vs-b', 'flag', later).quarantine).toBe(false);
  });
});

describe('decideBindingCurrency: checks the version a binding is PINNED to', () => {
  it('a binding pinned to a superseded version is flagged (not re-resolved to active)', () => {
    const d = decideBindingCurrency(registry(), 'test', 'pinned-superseded', 'enforce', AS_OF);
    expect(d).toMatchObject({
      assetId: 'a-superseded',
      flagged: true,
      quarantine: true,
      reasonCode: CURRENCY_REASONS.superseded,
    });
  });

  it('an unregistered binding returns undefined', () => {
    expect(decideBindingCurrency(registry(), 'test', 'nope', 'enforce', AS_OF)).toBeUndefined();
  });
});
