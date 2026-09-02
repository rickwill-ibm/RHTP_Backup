/**
 * Cross-source identity-resolution (MPI) types (Dev Plan Workstream A).
 *
 * Closes the RFI audit gap: the platform previously only exposed the standards-based
 * $member-match operation (lib/server/memberMatch.ts) with no dedicated layer that
 * reconciles the same individual across EMR, payer, and state-agency sources ahead
 * of that match, despite V3 claiming an MPI-based identity layer existed.
 */

/**
 * A patient identifier scoped to one assigning authority (an EMR MRN, a payer
 * member id, a state-agency case id). The pair (assigningAuthority, value) is
 * meaningful ONLY within that authority: the SAME value under two different
 * authorities is two different people's ids that merely collide. It is therefore
 * NEVER a cross-source deterministic key on its own — only same-authority +
 * same-value agrees (R2 Option B). Contrast medicaidId / ssnLast4, which are
 * genuinely global deterministic keys.
 */
export interface ScopedIdentifier {
  /** Assigning-authority id (OID / system uri / source system name). */
  assigningAuthority: string;
  value: string;
}

export interface IdentityTraits {
  firstName: string;
  lastName: string;
  dob: string; // YYYY-MM-DD
  sex?: 'male' | 'female' | 'other' | 'unknown';
  ssnLast4?: string;
  medicaidId?: string;
  zip?: string;
  phone?: string;
  /**
   * A source-LOCAL identifier (e.g. an MRN). Source-scoped, NEVER a cross-source
   * deterministic key: only fires a match when BOTH the value AND the assigning
   * authority agree (matchEngine 'localId-same-source-exact'). A reused value under
   * a different authority is a different person — it must not merge.
   */
  localId?: ScopedIdentifier;
}

export type SourceSystem = 'emr' | 'payer' | 'state-agency';

export interface SourceIdentityRecord {
  sourceSystem: SourceSystem;
  sourceRecordId: string;
  traits: IdentityTraits;
}

export type MatchTier = 'deterministic' | 'probabilistic-auto' | 'possible-match' | 'no-match';

export interface MatchRuleHit {
  rule: string;
  weight: number;
}

export interface IdentityMatchResult {
  tier: MatchTier;
  /** 0-100. Deterministic hits are always 100. */
  confidence: number;
  candidate: SourceIdentityRecord | null;
  ruleHits: MatchRuleHit[];
}

export interface ResolvedIdentity {
  /** Stable, synthetic identifier for the resolved person — not any one source's native id. */
  resolvedId: string;
  matchedSources: SourceSystem[];
  bestMatch: IdentityMatchResult;
  /** PHI-free summary safe to place in an audit record — see lib/server/audit.ts. */
  auditSummary: string;
}
