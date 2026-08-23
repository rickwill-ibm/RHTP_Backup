/**
 * schema.test.ts — the deployment config schema is complete and honest.
 *
 * Guards the two declarations the preflight depends on:
 *   - every `fail-closed-stub` seam maps to exactly one backend connection key,
 *     and no key references an unregistered or non-stub seam (drift trap);
 *   - the required-env-key set per posture is the expected fail-closed set
 *     (production mirrors requireSessionSecret + requireWso2).
 */
import { describe, it, expect } from 'vitest';
import {
  REQUIRED_ENV_KEYS,
  SEAM_CONNECTION_KEYS,
  requiredEnvKeys,
  seamConnectionKey,
  connectionKeyCompletenessProblems,
  assertConnectionKeyCompleteness,
  allDeploymentKeys,
} from '@/lib/deploy';
import { seamsWithDisposition } from '@/lib/config/seamDispositions';

describe('deploy schema — seam connection keys', () => {
  it('has no completeness problems', () => {
    expect(connectionKeyCompletenessProblems()).toEqual([]);
    expect(() => assertConnectionKeyCompleteness()).not.toThrow();
  });

  it('maps EVERY fail-closed-stub seam to a backend connection key', () => {
    const stubs = seamsWithDisposition('fail-closed-stub');
    expect(stubs.length).toBeGreaterThan(0);
    for (const seam of stubs) {
      const key = seamConnectionKey(seam);
      expect(key, `seam '${seam}' must have a connection key`).toBeTruthy();
      expect(key).toMatch(/^[A-Z0-9_]+$/); // server-only key shape, no NEXT_PUBLIC_
      expect(key!.startsWith('NEXT_PUBLIC_')).toBe(false);
    }
  });

  it('maps no key to a non-fail-closed-stub or unregistered seam', () => {
    // connectionKeyCompletenessProblems() already covers this; assert the set
    // matches the fail-closed-stub set exactly.
    const stubs = new Set(seamsWithDisposition('fail-closed-stub'));
    const mapped = new Set(Object.keys(SEAM_CONNECTION_KEYS));
    expect(mapped).toEqual(stubs);
  });
});

describe('deploy schema — required env keys per posture', () => {
  it('development requires no keys (offline demo posture)', () => {
    expect(requiredEnvKeys('development')).toEqual([]);
  });

  it('production requires the session secret and the four WSO2 OAuth keys', () => {
    const prod = requiredEnvKeys('production');
    expect(prod).toContain('SESSION_SECRET');
    for (const k of ['WSO2_AUTHORIZE_URL', 'WSO2_TOKEN_URL', 'WSO2_CLIENT_ID', 'WSO2_CLIENT_SECRET']) {
      expect(prod).toContain(k);
    }
    for (const k of prod) expect(k.startsWith('NEXT_PUBLIC_')).toBe(false);
  });

  it('staging requires the session secret', () => {
    expect(requiredEnvKeys('staging')).toContain('SESSION_SECRET');
  });

  it('REQUIRED_ENV_KEYS is frozen', () => {
    expect(Object.isFrozen(REQUIRED_ENV_KEYS)).toBe(true);
  });

  it('allDeploymentKeys() unions env + seam keys, sorted and deduped', () => {
    const all = allDeploymentKeys();
    expect(all).toContain('SESSION_SECRET');
    expect(all).toContain('DATABASE_URL');
    expect([...all]).toEqual([...all].sort());
    expect(new Set(all).size).toBe(all.length);
  });
});
