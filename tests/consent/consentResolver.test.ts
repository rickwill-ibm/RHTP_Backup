/** Consent-decision seam (Increment 1a) — mock fixture, production store, fail-closed. */
import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveConsentDecision,
  setProductionConsentDirectives,
} from '@/lib/consent/consentResolver';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import type { Part2ConsentDirective } from '@/lib/consent/part2Consent';

const T = () => Date.parse('2026-06-01T00:00:00Z');

afterEach(() => {
  clearSessionDataModes();
  setProductionConsentDirectives(null);
});

describe('consent-decision resolver', () => {
  it('mock: a matching demo directive discloses under a covering Part 2 scope', () => {
    setSessionDataMode('consent', 'mock');
    const d = resolveConsentDecision(
      { memberId: 'patient-001', recipient: 'care-manager-demo', purpose: 'care-management' },
      { now: T }
    );
    expect(d.disclosed).toBe(true);
    expect(d.scope.part2).toBe(true);
    expect(d.source).toBe('mock-directive');
    expect(d.failClosed).toBe(false);
  });

  it('mock: no matching directive -> held-restricted NO_CONSENT, not fail-closed', () => {
    setSessionDataMode('consent', 'mock');
    const d = resolveConsentDecision(
      { memberId: 'patient-001', recipient: 'someone-else', purpose: 'care-management' },
      { now: T }
    );
    expect(d.disclosed).toBe(false);
    expect(d.scope.part2).toBe(false);
    expect(d.scope.segments).toEqual([]);
    expect(d.failClosed).toBe(false);
    expect(d.audit.auditClass).toBe('part2-held-restricted');
  });

  it('production without a registered store -> FAIL CLOSED (distinct from directive-absence)', () => {
    setSessionDataMode('consent', 'production');
    const d = resolveConsentDecision(
      { memberId: 'patient-001', recipient: 'care-manager-demo', purpose: 'care-management' },
      { now: T }
    );
    expect(d.disclosed).toBe(false);
    expect(d.scope.part2).toBe(false);
    expect(d.failClosed).toBe(true);
    expect(d.source).toBe('fail-closed');
  });

  it('production with a registered store -> evaluates it (grant vs deny by purpose)', () => {
    setSessionDataMode('consent', 'production');
    const directives: Part2ConsentDirective[] = [
      {
        memberId: 'm1',
        recipient: 'dr-who',
        purpose: 'treatment',
        segments: ['42-CFR-Part-2'],
        expiresAt: '2027-01-01T00:00:00Z',
      },
    ];
    setProductionConsentDirectives(() => directives);
    const grant = resolveConsentDecision(
      { memberId: 'm1', recipient: 'dr-who', purpose: 'treatment' },
      { now: T }
    );
    expect(grant.disclosed).toBe(true);
    expect(grant.source).toBe('production-directive');
    const deny = resolveConsentDecision(
      { memberId: 'm1', recipient: 'dr-who', purpose: 'payment' },
      { now: T }
    );
    expect(deny.disclosed).toBe(false);
    expect(deny.failClosed).toBe(false);
  });

  it('an expired directive does not disclose (validity window via clock seam)', () => {
    setSessionDataMode('consent', 'production');
    setProductionConsentDirectives(() => [
      {
        memberId: 'm1',
        recipient: 'dr-who',
        purpose: 'treatment',
        segments: ['42-CFR-Part-2'],
        expiresAt: '2026-01-01T00:00:00Z',
      },
    ]);
    const d = resolveConsentDecision(
      { memberId: 'm1', recipient: 'dr-who', purpose: 'treatment' },
      { now: T }
    );
    expect(d.disclosed).toBe(false);
  });

  it('a directive store that throws -> fail closed', () => {
    setSessionDataMode('consent', 'production');
    setProductionConsentDirectives(() => {
      throw new Error('boom');
    });
    const d = resolveConsentDecision({ memberId: 'm1', recipient: 'x', purpose: 'y' }, { now: T });
    expect(d.failClosed).toBe(true);
  });
});
