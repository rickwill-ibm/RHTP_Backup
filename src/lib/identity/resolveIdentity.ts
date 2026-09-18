/**
 * Cross-source identity resolution orchestration (Dev Plan Workstream A3).
 *
 * Given a set of input traits (e.g., from an EMR-originated request) and an
 * IdentitySource, searches other source systems for the best match using the
 * deterministic-then-probabilistic engine (matchEngine.ts), and returns a
 * ResolvedIdentity with a PHI-free audit summary — never raw name/DOB/SSN in
 * anything destined for the audit trail (lib/server/audit.ts), consistent with
 * the Evidence Record's "references, codes, and determinations only" principle.
 *
 * This sits ahead of, and is complementary to, the standards-based $member-match
 * operation (lib/server/memberMatch.ts): $member-match confirms identity against
 * a single payer's FHIR server for a specific transaction; this layer reconciles
 * identity across EMR, payer, and state-agency sources more broadly.
 */
import { randomUUID } from 'crypto';
import type {
  IdentityMatchResult,
  IdentityTraits,
  ResolvedIdentity,
  SourceIdentityRecord,
  SourceSystem,
} from './mpiTypes';
import { runDeterministicRules, scoreProbabilisticMatch, tierForScore } from './matchEngine';
import type { IdentitySource } from './identitySource';

const ALL_SOURCE_SYSTEMS: SourceSystem[] = ['emr', 'payer', 'state-agency'];

/** Finds the single best match for `input` among `candidates`, or null if none score above no-match. */
export function findBestMatch(
  input: IdentityTraits,
  candidates: SourceIdentityRecord[]
): IdentityMatchResult {
  let best: IdentityMatchResult = {
    tier: 'no-match',
    confidence: 0,
    candidate: null,
    ruleHits: [],
  };

  for (const candidate of candidates) {
    const det = runDeterministicRules(input, candidate.traits);
    if (det.hit) {
      // Deterministic hits are certain matches — return immediately.
      return {
        tier: 'deterministic',
        confidence: 100,
        candidate,
        ruleHits: [{ rule: det.rule as string, weight: 100 }],
      };
    }
    const prob = scoreProbabilisticMatch(input, candidate.traits);
    if (prob.score > best.confidence) {
      best = {
        tier: tierForScore(prob.score, false),
        confidence: prob.score,
        candidate,
        ruleHits: prob.ruleHits,
      };
    }
  }
  return best;
}

function auditSummaryFor(result: IdentityMatchResult, sourcesSearched: SourceSystem[]): string {
  const ruleNames = result.ruleHits.map((h) => h.rule).join(',') || 'none';
  return `identity-resolution tier=${result.tier} confidence=${result.confidence} rules=[${ruleNames}] sourcesSearched=[${sourcesSearched.join(',')}]`;
}

/**
 * Resolve an identity by searching every other source system for the best match
 * against `input`. Returns a stable resolvedId only when at least one source
 * produces a deterministic or high-confidence probabilistic match; otherwise the
 * caller should route to human review (possible-match) or treat as unresolved
 * (no-match) — this function never silently guesses.
 */
export function resolveIdentity(
  input: IdentityTraits,
  originSystem: SourceSystem,
  source: IdentitySource
): ResolvedIdentity {
  const sourcesSearched = ALL_SOURCE_SYSTEMS.filter((s) => s !== originSystem);
  const matchedSources: SourceSystem[] = [];
  let best: IdentityMatchResult = {
    tier: 'no-match',
    confidence: 0,
    candidate: null,
    ruleHits: [],
  };

  for (const sourceSystem of sourcesSearched) {
    const candidates = source.recordsFor(sourceSystem);
    const result = findBestMatch(input, candidates);
    if (result.tier === 'deterministic' || result.tier === 'probabilistic-auto') {
      matchedSources.push(sourceSystem);
    }
    if (result.confidence > best.confidence) {
      best = result;
    }
  }

  const resolvedId =
    best.tier === 'deterministic' || best.tier === 'probabilistic-auto'
      ? `mpi-${randomUUID()}`
      : '';

  return {
    resolvedId,
    matchedSources,
    bestMatch: best,
    auditSummary: auditSummaryFor(best, sourcesSearched),
  };
}
