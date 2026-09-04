// tests/wpcGraph/consent.test.ts — Wave 0 canonical consent gate.
import { describe, it, expect } from 'vitest';
import { isSensitive, isNodeDisclosable } from '@/lib/wpcGraph/consent';

describe('consent gate — per-subject, fail-closed', () => {
  it('non-sensitive nodes always disclose', () => {
    expect(isSensitive({ id: 'a' })).toBe(false);
    expect(isNodeDisclosable({ id: 'a' })).toBe(true);
  });

  it('sensitive nodes are hidden by default (no consent context)', () => {
    for (const n of [
      { id: 'x', locked: true },
      { id: 'y', consentPending: true },
      { id: 'z', consentGate: 1 },
    ]) {
      expect(isSensitive(n)).toBe(true);
      expect(isNodeDisclosable(n)).toBe(false);
    }
  });

  it("member's own sensitive data discloses only with a consent basis", () => {
    const own = { id: 'm', locked: true, cluster: 'maria' };
    expect(isNodeDisclosable(own, { viewerCluster: 'maria', memberConsent: true })).toBe(true);
    expect(isNodeDisclosable(own, { viewerCluster: 'maria', memberConsent: false })).toBe(false);
  });

  it("a relative's sensitive data never discloses through the member's view", () => {
    const rel = { id: 'e', locked: true, cluster: 'elena' };
    expect(isNodeDisclosable(rel, { viewerCluster: 'maria', memberConsent: true })).toBe(false);
  });
});
