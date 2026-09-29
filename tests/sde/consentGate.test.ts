/**
 * THE CONSENT GATE'S EMPTY-SCOPE HOLE.
 *
 * `consentGranted` opened with `if (!scope) return true` — two defects in one
 * line. It was PERMISSIVE: a caller that could not name the purpose it was
 * contacting a member for got a grant anyway. And it returned BEFORE the
 * provider-access opt-out store was consulted, so a member who had opted out of
 * contact entirely WAS contacted, with the hard block never queried. The
 * dispatcher fed it exactly that, via `consentScope: survivor.consentScope ?? ''`
 * on an optional field.
 *
 * These tests pin the gate's two halves independently: a named, granted scope AND
 * a negative answer from the opt-out seam. Either one missing is a refusal.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { consentGranted, type MemberContext } from '@/lib/sde';
import * as optOut from '@/lib/consent/providerAccessOptOut';
import { log } from '@/lib/server/log';

const GRANTED: MemberContext = { memberId: 'm1', consentScopesGranted: ['care-outreach'] };

/**
 * A NAMED error whose message carries a member id, deliberately.
 *
 * The wrapper promises to log "a reference and an error NAME, never the member id
 * or a message". A fixture throwing a bare `Error('…')` cannot tell a logged NAME
 * apart from a logged message — both are unremarkable strings — and cannot detect
 * the message leaking at all. This one can: the name is distinctive and the message
 * is the thing that must never appear.
 */
class ConsentStoreDown extends Error {
  constructor() {
    super('opt-out lookup failed for member m1-XYZ-PHI on shard 3');
    this.name = 'ConsentStoreDown';
  }
}

/** Force the opt-out seam's answer for one test. */
function withOptOut(value: boolean | 'throw'): void {
  vi.spyOn(optOut, 'getProviderAccessConsentStore').mockReturnValue({
    isOptedOut: () => {
      if (value === 'throw') throw new ConsentStoreDown();
      return value;
    },
  } as unknown as ReturnType<typeof optOut.getProviderAccessConsentStore>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an empty scope is not a grant', () => {
  it('refuses an empty scope even for a member who granted everything', () => {
    withOptOut(false);
    expect(consentGranted('m1', '', GRANTED)).toBe(false);
  });

  it('refuses an empty scope for a member who has OPTED OUT — the old path never asked', () => {
    // The old `if (!scope) return true` returned before this store was read at
    // all, so the hard opt-out block was bypassed entirely.
    withOptOut(true);
    expect(consentGranted('m1', '', GRANTED)).toBe(false);
  });
});

describe('a named scope still needs both halves', () => {
  it('grants a scope the member granted when they have not opted out', () => {
    withOptOut(false);
    expect(consentGranted('m1', 'care-outreach', GRANTED)).toBe(true);
  });

  it('refuses a scope the member did not grant', () => {
    withOptOut(false);
    expect(consentGranted('m1', 'behavioral-health', GRANTED)).toBe(false);
  });

  it('a hard opt-out overrides a granted scope', () => {
    withOptOut(true);
    expect(consentGranted('m1', 'care-outreach', GRANTED)).toBe(false);
  });

  it('an absent grant list grants nothing — `?? []` is fail-CLOSED', () => {
    withOptOut(false);
    expect(consentGranted('m1', 'care-outreach', { memberId: 'm1' })).toBe(false);
  });

  it('an unreachable opt-out store refuses — never contact on error', () => {
    withOptOut('throw');
    expect(consentGranted('m1', 'care-outreach', GRANTED)).toBe(false);
  });
});

describe('an opt-out store OUTAGE is visible, and PHI-safe', () => {
  // TWO UNENFORCED CLAIMS, both in the header of `safeIsOptedOut`. "The answer stays
  // fail-CLOSED; it is no longer invisible" — but suppressing the emit entirely broke
  // no test, so only the fail-closed half was pinned. And "PHI-safe: a reference and
  // an error NAME, never the member id or a message" is a claim about a payload no
  // test ever read. The SAME defect class in the disclosure gate's dep wrapper IS
  // pinned (`disclosure.gate.dep-unavailable`, tests/agents/disclosure/gateWiring) —
  // one session, one fix, locked in one module of the two it touched. Lens L7:
  // an invariant asserted in a doc comment is backed by an enforcing test, or softened.

  /** The (event, fields) pair the gate emitted, or a failure if it emitted nothing. */
  function emittedOnOutage(): [string, Record<string, unknown>] {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    withOptOut('throw');
    // Fail-closed is the other half, and it must still hold while we read the event.
    expect(consentGranted('m1-XYZ-PHI', 'care-outreach', GRANTED)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    return warn.mock.calls[0] as [string, Record<string, unknown>];
  }

  it('emits a structured event naming the seam and the error, so the outage is pageable', () => {
    const [event, fields] = emittedOnOutage();
    // A stable machine-readable name: this is what an alert rule matches on, so it
    // is part of the contract, not a debug string.
    expect(event).toBe('sde.consent-gate.opt-out-store-unavailable');
    expect(fields.seam).toBe('providerAccessOptOut');
    // The error NAME, not its message — the half the fixture can now tell apart.
    expect(fields.error).toBe('ConsentStoreDown');
  });

  it('and the event carries NO member id and no error message — PHI-safe by test', () => {
    const [, fields] = emittedOnOutage();
    // Exactly two fields. An allow-list, not a deny-list: a field added later that
    // carries PHI fails here rather than slipping through a `not.toContain` check.
    expect(Object.keys(fields).sort()).toEqual(['error', 'seam']);
    expect(fields.memberId).toBeUndefined();
    const serialized = JSON.stringify(fields);
    expect(serialized).not.toContain('m1-XYZ-PHI');
    expect(serialized).not.toContain('shard 3');
  });

  it('a store that answers cleanly emits nothing — no noise on the healthy path', () => {
    // Otherwise the assertions above pass on a wrapper that logs unconditionally,
    // which would make the event useless as an outage signal.
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    withOptOut(false);
    expect(consentGranted('m1', 'care-outreach', GRANTED)).toBe(true);
    withOptOut(true);
    expect(consentGranted('m1', 'care-outreach', GRANTED)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
