// CONTRACT: C1  // SEAM: consent
/**
 * Consent gate. A disposition that would CONTACT a member must clear the consent
 * scope its taxonomy declares; absent consent yields suppress-with-reason, never
 * a silent send. This reuses the existing consent seam (providerAccessOptOut) as
 * a hard opt-out block, on top of the member's granted purposes from the consent
 * domain (carried in MemberContext, C1).
 */
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';
import type { MemberContext } from './types';

/**
 * True when the member has granted `scope` AND has not opted out of contact.
 * The provider-access opt-out seam is the authoritative hard block; the granted
 * purpose list is the positive basis. Deterministic: no clock, no I/O beyond the
 * injected/seam store read.
 */
export function consentGranted(memberId: string, scope: string, ctx: MemberContext): boolean {
  if (!scope) return true;
  const optedOut = safeIsOptedOut(memberId);
  if (optedOut) return false;
  return (ctx.consentScopesGranted ?? []).includes(scope);
}

/** The consent seam can throw in production-unwired mode; treat a throw as opted-out. */
function safeIsOptedOut(memberId: string): boolean {
  try {
    return getProviderAccessConsentStore().isOptedOut(memberId);
  } catch {
    // Consent store unavailable: fail CLOSED (no contact) — never contact on error.
    return true;
  }
}
