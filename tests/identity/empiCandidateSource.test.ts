/**
 * U3 fix — the EMPI resolver must not score against the demo registry in
 * production. The internal match engine is real, but the CANDIDATE SOURCE must be
 * real or absent-with-a-loud-error in production.
 *
 * Proves: mock/seeded resolves against the demo registry (demo green); production
 * with no registered source throws EmpiCandidateSourceNotConfiguredError (fail
 * loud) instead of minting/holding against the 3 hard-coded records; a registered
 * production source is used when present.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import {
  getIdentitySource,
  setProductionIdentitySource,
  EmpiCandidateSourceNotConfiguredError,
  mockIdentitySource,
  type IdentitySource,
} from '@/lib/identity/identitySource';
import { createEmpiResolver, empiResolver } from '@/lib/identity/empiResolver';
import type { ResolveIdentityTraits } from '@/lib/pipeline/types';

afterEach(() => {
  clearSessionDataModes();
  setProductionIdentitySource(null);
});

// Maria Redhawk's demographics — matches the demo fixture deterministically.
const MARIA: ResolveIdentityTraits = {
  feed: 'test-feed',
  demographics: { firstName: 'Maria', lastName: 'Redhawk', dob: '1985-04-12', medicaidId: 'SD-MEDICAID-88213' },
};

describe('getIdentitySource() — mode-gated candidate source (U3)', () => {
  it('mock mode returns the in-memory demo registry', () => {
    setSessionDataMode('identity', 'mock');
    expect(getIdentitySource()).toBe(mockIdentitySource);
  });

  it('seeded mode returns the in-memory demo registry', () => {
    setSessionDataMode('identity', 'seeded');
    expect(getIdentitySource()).toBe(mockIdentitySource);
  });

  it('production mode WITHOUT a registered source throws (fail loud)', () => {
    setSessionDataMode('identity', 'production');
    expect(() => getIdentitySource()).toThrow(EmpiCandidateSourceNotConfiguredError);
  });

  it('production mode WITH a registered source returns it', () => {
    const real: IdentitySource = { id: 'real', mode: 'hca-mpi', recordsFor: () => [] };
    setProductionIdentitySource(real);
    setSessionDataMode('identity', 'production');
    expect(getIdentitySource()).toBe(real);
  });
});

describe('empiResolver — production never scores against the demo pool (U3)', () => {
  it('mock mode links Maria to the demo anchored id (demo stays green)', () => {
    setSessionDataMode('identity', 'mock');
    const memberId = empiResolver('src-1', MARIA);
    expect(memberId).toMatch(/^mem-/);
  });

  it('production mode with no source throws, instead of minting/holding against demo data', () => {
    setSessionDataMode('identity', 'production');
    expect(() => empiResolver('src-1', MARIA)).toThrow(EmpiCandidateSourceNotConfiguredError);
  });

  it('even an id-only record fails loud in production (no candidate source at all)', () => {
    setSessionDataMode('identity', 'production');
    expect(() => empiResolver('src-2', { feed: 'test-feed' })).toThrow(
      EmpiCandidateSourceNotConfiguredError
    );
  });

  it('an explicit source still bypasses the selector (wired client / tests)', () => {
    setSessionDataMode('identity', 'production');
    const resolver = createEmpiResolver(mockIdentitySource);
    expect(resolver('src-1', MARIA)).toMatch(/^mem-/);
  });
});
