/**
 * Property-style tests — Provider Access opt-out consent store
 * (src/lib/consent/providerAccessOptOut.ts). Seeded generation via _prng.ts.
 *
 * The mock store is a module-level singleton, so every generated memberId is
 * prefixed 'p2a-' + a per-test tag to stay disjoint from other suites' data.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getProviderAccessConsentStore,
  mockProviderAccessConsentStore as store,
} from '@/lib/consent/providerAccessOptOut';
import { setClock } from '@/lib/clock';
import { bool, forCases, int, pick, str, type Rng } from './_prng';

const FIXED_MS = Date.UTC(2026, 0, 15, 12, 0, 0);
const FIXED_ISO = new Date(FIXED_MS).toISOString();

const ACTORS = ['case-mgr-1', 'portal:member', 'csr:ann.b', 'system-migration'];

function genMemberId(rng: Rng, tag: string): string {
  return `p2a-${tag}-${str(rng, 'abcdefghij0123456789', 6, 12)}`;
}

beforeEach(() => setClock(() => FIXED_MS));
afterEach(() => setClock(null));

describe('provider access opt-out consent properties', () => {
  it('property: every state change is attributed — recordedBy and recordedAt always set, empty actor throws', () => {
    forCases(200, 0xa77b, (rng, i) => {
      const memberId = genMemberId(rng, 'attr');
      const actor = pick(rng, ACTORS);
      const record = bool(rng)
        ? store.optOut(memberId, actor, 'member request via portal')
        : store.revokeOptOut(memberId, actor);
      expect(record.recordedBy, `case ${i}`).toBe(actor);
      expect(record.recordedAt).toBe(FIXED_ISO); // pinned clock -> attributed timestamp
      expect(record.memberId).toBe(memberId);
      const status = store.getStatus(memberId);
      expect(status).not.toBeNull();
      expect(status!.recordedBy).toBe(actor);
      // Unattributed changes are refused outright — never silently recorded.
      expect(() => store.optOut(memberId, '')).toThrow(/attributed/);
      expect(() => store.revokeOptOut(memberId, '')).toThrow(/attributed/);
      expect(store.getStatus(memberId)!.recordedBy).toBe(actor); // refused call left no trace
    });
  });

  it('property: opt-out then opt-in round-trips to not-opted-out; last operation always wins', () => {
    forCases(200, 0x0707, (rng, i) => {
      const memberId = genMemberId(rng, 'rt');
      const actor = pick(rng, ACTORS);

      store.optOut(memberId, actor);
      expect(store.isOptedOut(memberId), `case ${i}: opt-out did not take`).toBe(true);
      store.revokeOptOut(memberId, actor);
      expect(store.isOptedOut(memberId), `case ${i}: round-trip broken`).toBe(false);
      expect(store.getStatus(memberId)!.optedOut).toBe(false);

      // A random sequence of flips: the final call fully determines the state.
      let last = false;
      for (let k = 0, n = int(rng, 1, 6); k < n; k++) {
        if (bool(rng)) {
          store.optOut(memberId, actor);
          last = true;
        } else {
          store.revokeOptOut(memberId, actor);
          last = false;
        }
      }
      expect(store.isOptedOut(memberId)).toBe(last);
      expect(store.getStatus(memberId)!.optedOut).toBe(last);
    });
  });

  it('property: unknown member queries never throw and default to not-opted-out', () => {
    forCases(200, 0x111d, (rng, i) => {
      const weird = pick(rng, [
        genMemberId(rng, 'unknown'),
        '',
        '   ',
        'p2a-💥-unicode',
        `p2a-long-${str(rng, 'x', 200, 300)}`,
        'null',
        'undefined',
      ]);
      // Never written for the odd literals; the generated id is fresh (never touched).
      expect(() => store.getStatus(`p2a-nv-${i}-${weird}`)).not.toThrow();
      expect(store.getStatus(`p2a-nv-${i}-${weird}`)).toBeNull();
      expect(store.isOptedOut(`p2a-nv-${i}-${weird}`)).toBe(false);
    });
  });

  it('property: the configured store resolves to the mock store in the default (mock) data mode', () => {
    const resolved = getProviderAccessConsentStore();
    expect(resolved.id).toBe('mock-provider-access-consent');
    expect(resolved).toBe(store);
  });
});
