/**
 * Corpus family C — Consent & 42 CFR Part 2. Executable scenario driving the
 * REAL provider-access opt-out consent store + the authorization guard.
 *
 * Covered runnable-now: UC-16 (Provider-access opt-out → 403, PHI-safe,
 * attributed audit). The other C cases (13/14/15/17) need segmentation-at-
 * transform pipelines or read-time segment projection and are registered pending.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  getProviderAccessConsentStore,
  mockProviderAccessConsentStore,
} from '@/lib/consent/providerAccessOptOut';
import { canReadMemberData, type AccessContext } from '@/lib/authz/guard';
import { assertPhiSafe } from '@/lib/server/audit';
import { setClock } from '@/lib/clock';

const MEMBER = 'member-optout-uc16';

afterEach(() => {
  // Reset store state + clock so cases don't leak into each other.
  mockProviderAccessConsentStore.revokeOptOut(MEMBER, 'system:test-teardown');
  setClock(null);
});

describe('UC-16 | Provider-access opt-out', () => {
  it('the consent seam resolves to the mock store by default (config-driven)', () => {
    expect(getProviderAccessConsentStore().id).toBe('mock-provider-access-consent');
  });

  it('records an opt-out that is ALWAYS attributed (never silent)', () => {
    setClock(() => Date.parse('2026-08-22T10:00:00Z'));
    const store = getProviderAccessConsentStore();
    const rec = store.optOut(MEMBER, 'member:self via portal', 'member request');
    expect(rec.optedOut).toBe(true);
    expect(rec.recordedBy).toBe('member:self via portal');
    expect(rec.recordedAt).toBe('2026-08-22T10:00:00.000Z');
    expect(store.isOptedOut(MEMBER)).toBe(true);
    // Attribution is mandatory: an empty actor is refused.
    expect(() => store.optOut(MEMBER, '')).toThrow(/attributed/);
  });

  it('an opted-out member yields a DENY (403-equivalent) with a PHI-safe reason', () => {
    const store = getProviderAccessConsentStore();
    store.optOut(MEMBER, 'member:self');
    // A provider WITH a valid treatment relationship still cannot read: the
    // member-controlled opt-out overrides the otherwise-valid authorization basis.
    const ctx: AccessContext = {
      role: 'provider',
      purpose: 'treatment',
      treatmentRelationship: true,
      targetPatientId: MEMBER,
      providerAccessOptedOut: store.isOptedOut(MEMBER),
    };
    const decision = canReadMemberData(ctx);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/opted out/i);
    // PHI-safe body: the denial reason is policy text, carrying no member PHI.
    expect(decision.reason).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no DOB
    expect(() =>
      assertPhiSafe({
        ts: '2026-08-22T10:05:00.000Z',
        actor: 'provider:np-1234',
        action: 'provider-access.read.denied',
        resourceRef: `Patient/${MEMBER}`,
        correlationId: 'uc16-cid',
        outcome: 'failure',
        detail: decision.reason,
      })
    ).not.toThrow();
  });

  it('break-glass emergency access overrides the opt-out, with elevated audit', () => {
    const store = getProviderAccessConsentStore();
    store.optOut(MEMBER, 'member:self');
    const ctx: AccessContext = {
      role: 'provider',
      purpose: 'treatment',
      treatmentRelationship: true,
      targetPatientId: MEMBER,
      providerAccessOptedOut: store.isOptedOut(MEMBER),
      breakGlass: true,
    };
    const decision = canReadMemberData(ctx);
    expect(decision.allow).toBe(true);
    expect(decision.elevatedAudit).toBe(true);
    expect(decision.reason).toMatch(/break-glass/i);
  });

  it('opting back in restores access for a provider with a treatment relationship', () => {
    const store = getProviderAccessConsentStore();
    store.optOut(MEMBER, 'member:self');
    store.revokeOptOut(MEMBER, 'member:self', 'changed mind');
    expect(store.isOptedOut(MEMBER)).toBe(false);
    const decision = canReadMemberData({
      role: 'provider',
      purpose: 'treatment',
      treatmentRelationship: true,
      targetPatientId: MEMBER,
      providerAccessOptedOut: store.isOptedOut(MEMBER),
    });
    expect(decision.allow).toBe(true);
  });
});
