/**
 * Deterministic + probabilistic identity-matching rules (Dev Plan Workstream A1/A2).
 *
 * Pure, unit-testable, and deliberately dependency-free — runs entirely on the
 * platform's own logic with no external matching service or AI model, so every
 * match decision is reproducible and independently verifiable (same design
 * principle already applied to network-adequacy analytics).
 *
 * Deterministic rules run first (in priority order) and short-circuit with 100%
 * confidence on the first hit. If none fire, a weighted probabilistic score is
 * computed across the remaining demographic traits.
 */
import type { IdentityTraits, MatchRuleHit, MatchTier } from './mpiTypes';

function normalize(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** Levenshtein edit distance — no external dependency. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Normalized similarity in [0, 1]; 1 = identical.
 *
 * Absence is not agreement (Cycle 2A finding 2): if either value is empty after
 * normalization — including BOTH empty — similarity is 0, so records that are
 * merely missing the same field earn no probabilistic weight from it.
 */
function stringSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

/**
 * True only when both values are present (non-empty after normalization) AND
 * equal. Every deterministic exact-match comparison goes through this guard:
 * an exact-match rule must never fire on blank/absent values (Cycle 2A
 * finding 1 — e.g. blank names + shared DOB previously fired 'name+dob-exact').
 */
function bothPresentAndEqual(a: string | undefined, b: string | undefined): boolean {
  const na = normalize(a);
  return na !== '' && na === normalize(b);
}

export interface DeterministicResult {
  hit: boolean;
  rule: string | null;
}

/**
 * Deterministic rules, in priority order. Any hit is treated as a certain match.
 *
 * Only GLOBAL deterministic keys auto-merge across sources:
 *   - medicaidId-exact            — a genuinely enterprise-global id.
 *   - ssnLast4+dob-exact          — global.
 *   - localId-same-source-exact   — a source-LOCAL id (e.g. an MRN) agrees ONLY
 *       when BOTH the value AND the assigning authority match. A reused id value
 *       under a DIFFERENT authority is a different person and must not merge.
 *
 * name+dob is deliberately NOT deterministic (R2 Option B): identical name+dob
 * with no other agreeing trait is a possible-match, HELD for steward review —
 * never an automatic cross-person merge (the PHI-comingling defect this closes).
 */
export function runDeterministicRules(a: IdentityTraits, b: IdentityTraits): DeterministicResult {
  if (bothPresentAndEqual(a.medicaidId, b.medicaidId)) {
    return { hit: true, rule: 'medicaidId-exact' };
  }
  if (bothPresentAndEqual(a.ssnLast4, b.ssnLast4) && bothPresentAndEqual(a.dob, b.dob)) {
    return { hit: true, rule: 'ssnLast4+dob-exact' };
  }
  // Source-local id: same value AND same assigning authority (both-present-and-equal
  // on each). Different-authority reuse of the same value never fires.
  if (
    a.localId &&
    b.localId &&
    bothPresentAndEqual(a.localId.value, b.localId.value) &&
    bothPresentAndEqual(a.localId.assigningAuthority, b.localId.assigningAuthority)
  ) {
    return { hit: true, rule: 'localId-same-source-exact' };
  }
  return { hit: false, rule: null };
}

export interface ProbabilisticResult {
  score: number; // 0-100
  ruleHits: MatchRuleHit[];
}

/** Weighted probabilistic scoring, used only when no deterministic rule fires. */
export function scoreProbabilisticMatch(a: IdentityTraits, b: IdentityTraits): ProbabilisticResult {
  const ruleHits: MatchRuleHit[] = [];

  const lastNameSim = stringSimilarity(a.lastName, b.lastName);
  const lastNameWeight = Math.round(lastNameSim * 30);
  if (lastNameWeight > 0) ruleHits.push({ rule: 'lastName-similarity', weight: lastNameWeight });

  const firstNameSim = stringSimilarity(a.firstName, b.firstName);
  const firstNameWeight = Math.round(firstNameSim * 20);
  if (firstNameWeight > 0) ruleHits.push({ rule: 'firstName-similarity', weight: firstNameWeight });

  // Exact-agreement traits use the same blank-field guard as the deterministic
  // rules: two absent/whitespace values are missing data, not agreement.
  if (bothPresentAndEqual(a.dob, b.dob)) {
    ruleHits.push({ rule: 'dob-exact', weight: 25 });
  }

  if (a.sex && b.sex && a.sex === b.sex && a.sex !== 'unknown') {
    ruleHits.push({ rule: 'sex-match', weight: 5 });
  }

  if (bothPresentAndEqual(a.zip, b.zip)) {
    ruleHits.push({ rule: 'zip-match', weight: 10 });
  }

  if (bothPresentAndEqual(a.phone, b.phone)) {
    ruleHits.push({ rule: 'phone-match', weight: 10 });
  }

  const score = Math.min(
    100,
    ruleHits.reduce((sum, h) => sum + h.weight, 0)
  );
  return { score, ruleHits };
}

export const MATCH_THRESHOLDS = {
  /** Probabilistic score at/above which the platform treats the match as high-confidence. */
  autoLinkMin: 90,
  /** Probabilistic score at/above which a match is surfaced for human review, but not auto-linked. */
  possibleMatchMin: 60,
} as const;

export function tierForScore(score: number, deterministicHit: boolean): MatchTier {
  if (deterministicHit) return 'deterministic';
  if (score >= MATCH_THRESHOLDS.autoLinkMin) return 'probabilistic-auto';
  if (score >= MATCH_THRESHOLDS.possibleMatchMin) return 'possible-match';
  return 'no-match';
}
