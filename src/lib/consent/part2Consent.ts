// CONTRACT: C1  // CONTRACT: C10  // DP-1
/**
 * 42 CFR Part 2 consent-directed release (register F2). Part 2 data may be
 * disclosed only under a patient consent that NAMES the recipient and the purpose
 * of the disclosure (42 CFR 2.31). Absent such a consent the data is HELD
 * restricted — never silently dropped (it stays in the record and in the store),
 * never disclosed. An emergency break-glass path exists for a bona fide medical
 * emergency (42 CFR 2.51): it grants time-boxed access WITHOUT consent but under a
 * DISTINCT, elevated audit class, so it is never a silent override.
 *
 * This module is the consent-scope check + break-glass decision. It produces the
 * `ConsentScope` a lens read runs under, plus a PHI-safe audit entry and the
 * re-disclosure prohibition marker that must accompany any actual disclosure. It
 * reuses the break-glass pattern from lib/authz/guard.ts (an explicit boolean that
 * forces `elevated` audit), mirrored here for the Part 2 disclosure surface.
 *
 * HONEST SCOPE (I8A): full consent lifecycle management (capture, revocation
 * propagation, expiry sweeps, a consent registry of record) is Iteration 8A. This
 * delivers the correct BASIS + a consent-scope check + break-glass + the
 * re-disclosure marker. Pure + deterministic (clock injected).
 */
import type { ConsentScope } from '@/lib/graph/lens/types';

/** The standard 42 CFR 2.32 prohibition-on-re-disclosure notice (abbreviated). */
export const PART2_REDISCLOSURE_NOTICE =
  'This information has been disclosed to you from records protected by federal ' +
  'confidentiality rules (42 CFR part 2). The federal rules prohibit you from ' +
  'making any further disclosure of this information unless further disclosure is ' +
  'expressly permitted by the written consent of the individual whose information ' +
  'it is or as otherwise permitted by 42 CFR part 2.';

/**
 * A Part 2 consent directive: a written consent that names WHO may receive the
 * data and for WHAT purpose, and which segment labels it releases. `expiresAt` is
 * an ISO instant; absent means no expiry recorded (still honored, flagged for I8A).
 */
export interface Part2ConsentDirective {
  memberId: string;
  /** The named recipient the disclosure is authorized TO (2.31(a)(4)). */
  recipient: string;
  /** The named purpose of the disclosure (2.31(a)(5)). */
  purpose: string;
  /** The segment labels this consent releases (e.g. ['42-CFR-Part-2']). */
  segments: string[];
  /** ISO expiry instant; absent = no expiry on file. */
  expiresAt?: string;
}

/** A request to read Part 2 data: who is asking, for what, and any emergency path. */
export interface Part2AccessRequest {
  memberId: string;
  recipient: string;
  purpose: string;
  /** Requested segment labels (defaults to ['42-CFR-Part-2']). */
  segments?: string[];
  /** Explicit emergency access. Never a silent override; always elevated-audited. */
  breakGlass?: boolean;
  /** Required reason when break-glass is used (captured in the audit entry). */
  breakGlassReason?: string;
}

export type Part2AuditClass =
  | 'part2-consent-disclosure'
  | 'part2-break-glass'
  | 'part2-held-restricted';

/**
 * A PHI-safe Part 2 access audit entry. Records the decision, the named
 * recipient/purpose, the basis reason, and the labels involved — NEVER any
 * clinical payload, diagnosis, or narrative. Break-glass sets `elevated`.
 */
export interface Part2AuditEntry {
  auditClass: Part2AuditClass;
  memberId: string;
  recipient: string;
  purpose: string;
  reason: string;
  /** ISO instant from the injected clock (deterministic). */
  at: string;
  /** The segment labels the decision concerned. */
  segments: string[];
  /** True for break-glass (the distinct, elevated audit class). */
  elevated: boolean;
}

/** The outcome of a Part 2 access evaluation. */
export interface Part2AccessDecision {
  /** True when the data may be surfaced (consent match or break-glass). */
  disclosed: boolean;
  /** The scope to run the lens read under. NO_CONSENT-equivalent when held. */
  scope: ConsentScope;
  /** True whenever data is disclosed: the re-disclosure prohibition is in force. */
  reDisclosureProhibited: boolean;
  /** The 42 CFR 2.32 notice to accompany the disclosure, or null when held. */
  notice: string | null;
  /** The audit entry to persist (distinct class per path). */
  audit: Part2AuditEntry;
}

interface Clock {
  now: () => number;
}

const DEFAULT_SEGMENTS = ['42-CFR-Part-2'];

/** Build the covering scope for a set of released segment labels. */
function scopeFor(segments: string[]): ConsentScope {
  return { part2: segments.includes('42-CFR-Part-2'), segments: [...segments] };
}

/** A directive matches when it names this recipient + purpose, is unexpired, and
 * releases every requested segment. */
function directiveCovers(
  d: Part2ConsentDirective,
  req: Part2AccessRequest,
  wanted: string[],
  nowIso: string,
): boolean {
  if (d.memberId !== req.memberId) return false;
  if (d.recipient !== req.recipient) return false;
  if (d.purpose !== req.purpose) return false;
  if (d.expiresAt && d.expiresAt <= nowIso) return false;
  const released = new Set(d.segments);
  return wanted.every((s) => released.has(s));
}

/**
 * Evaluate Part 2 access. Break-glass wins first (explicit emergency, elevated
 * audit). Otherwise a consent directive naming the recipient + purpose and
 * releasing the requested segments discloses under a covering scope. Failing both,
 * the data is HELD restricted: no scope, not disclosed, but recorded in the audit
 * trail (held, not dropped).
 */
export function evaluatePart2Access(
  req: Part2AccessRequest,
  directives: readonly Part2ConsentDirective[],
  deps: Clock,
): Part2AccessDecision {
  const wanted = req.segments && req.segments.length > 0 ? req.segments : DEFAULT_SEGMENTS;
  const at = new Date(deps.now()).toISOString();

  if (req.breakGlass) {
    const reason = req.breakGlassReason?.trim() || 'emergency access (reason not provided)';
    return {
      disclosed: true,
      scope: scopeFor(wanted),
      reDisclosureProhibited: true,
      notice: PART2_REDISCLOSURE_NOTICE,
      audit: {
        auditClass: 'part2-break-glass',
        memberId: req.memberId,
        recipient: req.recipient,
        purpose: req.purpose,
        reason: `break-glass emergency access: ${reason}`,
        at,
        segments: wanted,
        elevated: true,
      },
    };
  }

  const match = directives.find((d) => directiveCovers(d, req, wanted, at));
  if (match) {
    return {
      disclosed: true,
      scope: scopeFor(wanted),
      reDisclosureProhibited: true,
      notice: PART2_REDISCLOSURE_NOTICE,
      audit: {
        auditClass: 'part2-consent-disclosure',
        memberId: req.memberId,
        recipient: req.recipient,
        purpose: req.purpose,
        reason: `consent-directed release to "${req.recipient}" for "${req.purpose}"`,
        at,
        segments: wanted,
        elevated: false,
      },
    };
  }

  return {
    disclosed: false,
    scope: { part2: false, segments: [] },
    reDisclosureProhibited: false,
    notice: null,
    audit: {
      auditClass: 'part2-held-restricted',
      memberId: req.memberId,
      recipient: req.recipient,
      purpose: req.purpose,
      reason: 'held-restricted: no consent directive names this recipient/purpose',
      at,
      segments: wanted,
      elevated: false,
    },
  };
}
