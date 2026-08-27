/**
 * The single promotion choke point (S0) — Guardrail 1 + Guardrail 6. `evaluate()`, DTR,
 * CRD, and PAS all call THIS one function; it returns a PromotedCriteriaSet only when every
 * promotion fact holds, otherwise a structured refusal that consumers treat as fail-closed
 * (no criteria). It also computes the effective autonomy for the scope, capped so a DENIAL is
 * never above HITL. An unknown/invalid policy level fails closed to the MOST restrictive
 * level (never open). The AutonomyPolicy is the seam the future ladder plugs into; S0 pins
 * everything to HITL.
 */
import { verifyAnchor, type SourceAnchorV2, type CanonicalRef } from '../anchor/verify';

export interface AuthoritativeSource {
  kind: 'CMS-NCD' | 'CMS-LCD' | 'state-medicaid-manual' | 'payer-policy';
  citation: string;
  url?: string;
}

export interface CriteriaSelector {
  lineOfBusiness?: 'Commercial' | 'Medicaid' | 'Medicare';
  state?: string;
  payer?: string;
}

/** A criteria set as authored/extracted — may or may not be promotable. */
export interface CandidateCriteriaSet {
  criteriaSetId: string;
  smeReviewed: boolean;
  authoritativeSource?: AuthoritativeSource;
  reviewedBy?: string;
  provenance: SourceAnchorV2[];
  selector?: CriteriaSelector;
}

/** The ONLY shape a live decision may use. All promotion facts are required. */
export interface PromotedCriteriaSet extends CandidateCriteriaSet {
  smeReviewed: true;
  authoritativeSource: AuthoritativeSource;
  reviewedBy: string;
}

export type AutonomyLevel = 'heavy-human' | 'human-assist' | 'HITL' | 'HOTL' | 'autonomous';
const LEVEL_ORDER: readonly AutonomyLevel[] = [
  'heavy-human',
  'human-assist',
  'HITL',
  'HOTL',
  'autonomous',
];
const MOST_RESTRICTIVE: AutonomyLevel = 'heavy-human';

export interface AutonomyScope {
  domain: string; // 'prior-auth' | 'eligibility' | 'financial-clearance' | ...
  payer?: string;
  decisionClass: 'approval' | 'denial' | 'info';
}

export interface AutonomyPolicy {
  maxLevel(scope: AutonomyScope): AutonomyLevel;
}

/** S0 default: everything pinned to HITL. The future ladder replaces this per scope. */
export const hitlPinnedPolicy: AutonomyPolicy = { maxLevel: () => 'HITL' };

/** Coerce any value to a known level; unknown/undefined fails closed to most-restrictive. */
function normalizeLevel(x: unknown): AutonomyLevel {
  return typeof x === 'string' && (LEVEL_ORDER as readonly string[]).includes(x)
    ? (x as AutonomyLevel)
    : MOST_RESTRICTIVE;
}

/** min of two KNOWN levels by rank. */
function minLevel(a: AutonomyLevel, b: AutonomyLevel): AutonomyLevel {
  return LEVEL_ORDER.indexOf(a) <= LEVEL_ORDER.indexOf(b) ? a : b;
}

function nonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

export type PromotionRefusal =
  | 'not-sme-reviewed'
  | 'missing-authoritative-source'
  | 'missing-reviewer'
  | 'no-provenance'
  | 'non-authoritative-provenance'
  | 'anchor-verification-failed';

export type LoadPromotedResult =
  | { ok: true; set: PromotedCriteriaSet; effectiveAutonomy: AutonomyLevel }
  | { ok: false; refusedReason: PromotionRefusal };

export interface LoadPromotedOpts {
  scope: AutonomyScope;
  policy?: AutonomyPolicy;
  docs?: CanonicalRef[]; // if provided, re-verify every provenance anchor at load time
}

export function loadPromoted(
  candidate: CandidateCriteriaSet,
  opts: LoadPromotedOpts
): LoadPromotedResult {
  if (candidate.smeReviewed !== true) return { ok: false, refusedReason: 'not-sme-reviewed' };
  const src = candidate.authoritativeSource;
  if (!src || !nonEmptyString(src.citation)) {
    return { ok: false, refusedReason: 'missing-authoritative-source' };
  }
  if (!nonEmptyString(candidate.reviewedBy)) {
    return { ok: false, refusedReason: 'missing-reviewer' };
  }
  if (!Array.isArray(candidate.provenance) || candidate.provenance.length === 0) {
    return { ok: false, refusedReason: 'no-provenance' };
  }
  if (!candidate.provenance.every((a) => a.provenanceClass === 'authoritative')) {
    return { ok: false, refusedReason: 'non-authoritative-provenance' };
  }
  if (opts.docs) {
    const docs = opts.docs;
    if (!candidate.provenance.every((a) => verifyAnchor(a, docs).ok)) {
      return { ok: false, refusedReason: 'anchor-verification-failed' };
    }
  }
  const set = candidate as PromotedCriteriaSet;
  const policy = opts.policy ?? hitlPinnedPolicy;
  // Unknown/undefined policy level fails closed to most-restrictive; denials capped at HITL.
  let level = normalizeLevel(policy.maxLevel(opts.scope));
  if (opts.scope.decisionClass === 'denial') level = minLevel(level, 'HITL');
  return { ok: true, set, effectiveAutonomy: level };
}
