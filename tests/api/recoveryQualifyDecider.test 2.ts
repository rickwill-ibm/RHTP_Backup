/**
 * The recovery routes' reviewer qualification (C-REVQUAL).
 *
 * WHY THIS IS AN `administrative` DETERMINATION, AND WHY THAT IS THE POINT. These routes record the
 * payer's own underpayment-recovery and appeal-submission actions — a financial act on the plan's
 * revenue, not a decision about a member's benefit. 42 CFR 438.210(b)(3) attaches to "a decision to
 * deny a service authorization request, or to authorize a service in an amount, duration, or scope
 * that is less than requested". None of that is in play, so requiring a credentialed clinical peer
 * here would have no statutory basis and would block legitimate revenue-cycle operations — while
 * doing nothing whatsoever for the case the rule is actually about.
 *
 * So the bar is different, not lower, and these cases pin both halves: an unlicensed coordinator IS
 * permitted to record a recovery action, and a placeholder identity or an unknown name is NOT.
 *
 * The site itself was found by `check-reviewer-qualification.mjs` on its first run:
 * `action/route.ts` records a governed action through `runGovernedAction` directly, with no workflow
 * signal, so the engine's gate never sees it and the route's own check was decider-CLASS only.
 */
import { describe, expect, it } from 'vitest';
import { qualifyRecoveryDecider } from '@/app/api/recovery/[id]/qualifyDecider';
import { SEED_EPOCH_MS } from '@/lib/authz/credentialing';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';
import { afterEach } from 'vitest';

const HEADERS = { 'x-correlation-id': 'test' };

afterEach(() => clearSessionDataModes());

describe('an identified, credentialed human may record a recovery action', () => {
  it('permits the seeded reviewer', () => {
    expect(
      qualifyRecoveryDecider('Practitioner/dev', SEED_EPOCH_MS, HEADERS).refusal
    ).toBeUndefined();
  });

  it('permits a reviewer holding NO clinical licence — the bar is identity, not a clinical peer', () => {
    // `Practitioner/unlicensed` is a UM coordinator with no licence at all. On a MEMBER
    // determination they would be refused `licence-absent`; on the payer's own recovery action they
    // are the right person, and a design that blocked them would push plans toward using a
    // clinician for accounts-receivable work.
    expect(
      qualifyRecoveryDecider('Practitioner/unlicensed', SEED_EPOCH_MS, HEADERS).refusal
    ).toBeUndefined();
  });
});

describe('but it is still a real gate', () => {
  it('REFUSES the placeholder identity that used to pass', async () => {
    // `deriveUserId` returns 'session-user' when a session carries no fhirUser, and the decision
    // gate accepted it while `approvalAuthority` blocked it (G-046).
    const out = qualifyRecoveryDecider('session-user', SEED_EPOCH_MS, HEADERS);
    expect(out.refusal).toBeDefined();
    expect(out.refusal?.response.status).toBe(403);
    expect(out.refusal?.auditDetail).toContain('no-identity-of-record');
  });

  it('REFUSES a name the credentialing source has never heard of', () => {
    const out = qualifyRecoveryDecider('human:bob', SEED_EPOCH_MS, HEADERS);
    expect(out.refusal?.response.status).toBe(403);
    expect(out.refusal?.auditDetail).toContain('not-in-credentialing-source');
  });

  it('REFUSES a stale credential file — "verified at some point" is not verified', () => {
    const out = qualifyRecoveryDecider('Practitioner/stale', SEED_EPOCH_MS, HEADERS);
    expect(out.refusal?.auditDetail).toContain('credential-record-stale');
  });

  it('returns 503, not 403, when the credentialing source is unwired in production', () => {
    // A system that cannot name its reviewers has not refused this person — it cannot answer at
    // all, and a 403 would tell the caller something false about themselves.
    setSessionDataMode('credentialing', 'production');
    const out = qualifyRecoveryDecider('Practitioner/dev', SEED_EPOCH_MS, HEADERS);
    expect(out.refusal?.response.status).toBe(503);
  });
});

describe('the refusal is identity-safe', () => {
  it('carries the CODE and never a licence number or an NPI', async () => {
    const out = qualifyRecoveryDecider('Practitioner/stale', SEED_EPOCH_MS, HEADERS);
    const body = JSON.stringify(await out.refusal!.response.json());
    // The seeded stale reviewer holds licence NY-MD-000666. A refusal reaches an audit row and an
    // API body, and a licence number is directly identifying.
    expect(body).not.toContain('NY-MD-000666');
    expect(out.refusal?.auditDetail).not.toContain('NY-MD-000666');
    expect(body).toContain('credential-record-stale');
  });
});
