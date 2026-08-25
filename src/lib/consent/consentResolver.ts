// CONTRACT: C1  // SEAM: consent  // WPC-01 consent-decision Increment 1a
/**
 * Consent-decision seam. Wraps the pure 42 CFR Part 2 evaluator (part2Consent.ts)
 * in a dataMode-switched resolver so a read's consent SCOPE is decided by the
 * member's directives × requesting recipient × purpose × validity window — not by a
 * hardcoded default. mock/seeded evaluates a fixed demo directive fixture (demo
 * intact); production evaluates the REGISTERED directive store, or FAILS CLOSED
 * (held-restricted, NO_CONSENT) when none is registered or it errors.
 *
 * A FAILURE denial is distinguished from a directive-absence denial: identical
 * restrictive output to the caller, but a distinct `source`/`failClosed` flag so a
 * failure-rate alert can fire (never a silent broken-consent path). Pure +
 * deterministic (clock injected). Increment 1a ships the seam, the mock resolver,
 * fail-closed, and the route wiring only; the real directive store is Increment 1b.
 */
import { getDataMode } from '@/lib/config/dataMode';
import { now as clockNow } from '@/lib/clock';
import { NO_CONSENT } from '@/lib/graph/lens/types';
import {
  evaluatePart2Access,
  type Part2AccessDecision,
  type Part2AccessRequest,
  type Part2ConsentDirective,
} from './part2Consent';

export interface ConsentDecisionResult extends Part2AccessDecision {
  source: 'mock-directive' | 'production-directive' | 'fail-closed';
  /** True when denial is due to a FAILURE (unregistered/erroring store), not a
   *  directive-absence denial. Same restrictive output; distinct audit + metric. */
  failClosed: boolean;
}

export type ConsentDirectiveProvider = (memberId: string) => readonly Part2ConsentDirective[];

let productionDirectives: ConsentDirectiveProvider | null = null;

/** Register (or clear) the production consent-directive provider (the real store). */
export function setProductionConsentDirectives(fn: ConsentDirectiveProvider | null): void {
  productionDirectives = fn;
}

// Fixed demo directive fixture — mock/seeded only. Production reads a real store.
const MOCK_DIRECTIVES: readonly Part2ConsentDirective[] = Object.freeze([
  {
    memberId: 'patient-001',
    recipient: 'care-manager-demo',
    purpose: 'care-management',
    segments: ['42-CFR-Part-2'],
    expiresAt: '2027-01-01T00:00:00Z',
  },
]);

export interface ResolveConsentOptions {
  now?: () => number;
}

export function resolveConsentDecision(
  req: Part2AccessRequest,
  opts: ResolveConsentOptions = {}
): ConsentDecisionResult {
  const now = opts.now ?? clockNow;
  if (getDataMode('consent') === 'production') {
    if (!productionDirectives) {
      return failClosed(req, now, 'consent directive store not configured');
    }
    let directives: readonly Part2ConsentDirective[];
    try {
      directives = productionDirectives(req.memberId);
    } catch (e) {
      return failClosed(
        req,
        now,
        `directive store error: ${e instanceof Error ? e.name : 'unknown'}`
      );
    }
    return {
      ...evaluatePart2Access(req, directives, { now }),
      source: 'production-directive',
      failClosed: false,
    };
  }
  return {
    ...evaluatePart2Access(req, MOCK_DIRECTIVES, { now }),
    source: 'mock-directive',
    failClosed: false,
  };
}

function failClosed(
  req: Part2AccessRequest,
  now: () => number,
  reason: string
): ConsentDecisionResult {
  const at = new Date(now()).toISOString();
  const segments = req.segments && req.segments.length > 0 ? req.segments : ['42-CFR-Part-2'];
  return {
    disclosed: false,
    scope: NO_CONSENT,
    reDisclosureProhibited: false,
    notice: null,
    audit: {
      auditClass: 'part2-held-restricted',
      memberId: req.memberId,
      recipient: req.recipient,
      purpose: req.purpose,
      reason: `fail-closed: ${reason}`,
      at,
      segments,
      elevated: false,
    },
    source: 'fail-closed',
    failClosed: true,
  };
}
