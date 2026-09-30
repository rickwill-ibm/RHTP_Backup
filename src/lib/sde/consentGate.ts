// CONTRACT: C1  // SEAM: consent
/**
 * Consent gate. A disposition that would CONTACT a member must clear the consent
 * scope its taxonomy declares; absent consent yields suppress-with-reason, never
 * a silent send. This reuses the existing consent seam (providerAccessOptOut) as
 * a hard opt-out block, on top of the member's granted purposes from the consent
 * domain (carried in MemberContext, C1).
 */
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';
import { log } from '@/lib/server/log';
import type { MemberContext } from './types';

/**
 * True when the member has granted `scope` AND has not opted out of contact.
 * The provider-access opt-out seam is the authoritative hard block; the granted
 * purpose list is the positive basis. Deterministic: no clock, no I/O beyond the
 * injected/seam store read.
 *
 * AN EMPTY SCOPE IS NOT A GRANT. This read `if (!scope) return true` — permissive,
 * and it returned BEFORE the opt-out store was consulted. Two failures in one
 * line: a caller that could not name the purpose it was contacting a member for
 * got a grant anyway, and the member's hard opt-out was never queried, so a
 * member who had opted out of contact WAS contacted. A missing scope means the
 * caller cannot say what the contact is for, and a contact nobody can name a
 * purpose for is exactly the contact this gate exists to stop.
 *
 * INVARIANT: no path returns true without BOTH a named scope the member granted
 *            AND a negative answer from the opt-out store.
 */
export function consentGranted(memberId: string, scope: string, ctx: MemberContext): boolean {
  if (!scope) return false;
  if (safeIsOptedOut(memberId)) return false;
  // `?? []` is fail-CLOSED: an absent grant list grants nothing.
  return (ctx.consentScopesGranted ?? []).includes(scope);
}

/**
 * The consent seam can throw in production-unwired mode; treat a throw as opted-out.
 *
 * AND SAY SO. A silent catch made a store OUTAGE indistinguishable from a member
 * who had genuinely opted out — the same defect the disclosure gate's dep wrapper
 * had. The answer stays fail-CLOSED; it is no longer invisible.
 */
function safeIsOptedOut(memberId: string): boolean {
  try {
    return getProviderAccessConsentStore().isOptedOut(memberId);
  } catch (err) {
    // Consent store unavailable: fail CLOSED (no contact) — never contact on error.
    log.warn('sde.consent-gate.opt-out-store-unavailable', {
      // PHI-safe: a reference and an error NAME, never the member id or a message.
      seam: 'providerAccessOptOut',
      error: err instanceof Error ? err.name : 'unknown',
    });
    return true;
  }
}
