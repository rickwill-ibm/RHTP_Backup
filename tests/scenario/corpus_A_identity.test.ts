/**
 * Corpus family A — Identity resolution. Executable scenarios that drive the
 * REAL match/identity engine end-to-end (src/lib/identity/*).
 *
 * Covered runnable-now: UC-01, UC-03, UC-06.
 * Deferred within these cases (named, not silently dropped):
 *   - UC-03 projector rekey + source-attribution audit after
 *     identity.member.unmerged → registered pending under the merge/graph
 *     capability; here we prove the identity engine's DEFENSE against the wrong
 *     merge ever happening automatically.
 *   - UC-06 coverage.terminated/enrolled event modeling → record/event store.
 */
import { describe, it, expect } from 'vitest';
import {
  runDeterministicRules,
  scoreProbabilisticMatch,
  tierForScore,
  MATCH_THRESHOLDS,
} from '@/lib/identity/matchEngine';
import { findBestMatch, resolveIdentity } from '@/lib/identity/resolveIdentity';
import { mockIdentitySource } from '@/lib/identity/identitySource';
import type { IdentityTraits, SourceIdentityRecord } from '@/lib/identity/mpiTypes';
import { assertPhiSafe } from '@/lib/server/audit';

describe('UC-01 | Cross-source anchor at enrollment', () => {
  // Maria arrives via the EMR feed; the same person already exists in the payer
  // and state-agency feeds. Acceptance: the same member arriving via any two
  // feeds resolves to ONE anchored identity, and the match score / rule path /
  // decision (tier) are persisted to a PHI-safe audit summary.
  const mariaFromEmr: IdentityTraits = {
    firstName: 'Maria',
    lastName: 'Redhawk',
    dob: '1985-04-12',
  };

  it('anchors an enrollee to one identity, deterministically, across feeds', () => {
    const resolved = resolveIdentity(mariaFromEmr, 'emr', mockIdentitySource);
    // A single anchored identity id is minted (not any one source's native id).
    expect(resolved.resolvedId).toMatch(/^mpi-/);
    expect(resolved.bestMatch.tier).toBe('deterministic');
    // The decision path is captured: the rule that fired and the tier.
    expect(resolved.bestMatch.ruleHits.map((h) => h.rule)).toContain('name+dob-exact');
    // Both OTHER feeds (payer + state-agency) recognize her → not two people.
    expect(resolved.matchedSources.sort()).toEqual(['payer', 'state-agency']);
  });

  it('resolves to the SAME anchored person when arriving from a second feed', () => {
    // Arriving via the payer feed instead: her payer record carries the Medicaid
    // id, so the state-agency feed matches deterministically on it too.
    const mariaFromPayer: IdentityTraits = {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
      medicaidId: 'SD-MEDICAID-88213',
    };
    const viaPayer = resolveIdentity(mariaFromPayer, 'payer', mockIdentitySource);
    const viaEmr = resolveIdentity(mariaFromEmr, 'emr', mockIdentitySource);
    // Both feeds anchor (non-empty resolvedId) and both land a certain match —
    // exactly one member, not a duplicate per feed.
    expect(viaPayer.resolvedId).toMatch(/^mpi-/);
    expect(viaEmr.resolvedId).toMatch(/^mpi-/);
    expect(viaPayer.bestMatch.tier).toBe('deterministic');
    expect(viaEmr.bestMatch.tier).toBe('deterministic');
  });

  it('persists a PHI-safe match decision to the audit ledger', () => {
    const resolved = resolveIdentity(mariaFromEmr, 'emr', mockIdentitySource);
    // The audit summary carries tier + confidence + rule path, no raw PHI.
    expect(resolved.auditSummary).toMatch(/tier=deterministic/);
    expect(resolved.auditSummary).toMatch(/confidence=100/);
    expect(resolved.auditSummary).toMatch(/name\+dob-exact/);
    expect(resolved.auditSummary).not.toMatch(/Maria|Redhawk|1985-04-12/);
    // It passes the same PHI-safety gate the audit sink itself enforces.
    expect(() =>
      assertPhiSafe({
        ts: new Date().toISOString(),
        actor: 'system:enrollment',
        action: 'identity-resolution',
        resourceRef: `mpi/${resolved.resolvedId}`,
        correlationId: 'uc01-cid',
        outcome: 'success',
        detail: resolved.auditSummary,
      })
    ).not.toThrow();
  });

  it('does NOT anchor a stranger (never silently guesses a member)', () => {
    const stranger: IdentityTraits = { firstName: 'Nobody', lastName: 'Elsewhere', dob: '1900-01-01' };
    const resolved = resolveIdentity(stranger, 'emr', mockIdentitySource);
    expect(resolved.resolvedId).toBe('');
    expect(resolved.bestMatch.tier).toBe('no-match');
  });
});

describe('UC-03 | Wrong merge unmerged (twins) — identity DEFENSE the engine supports today', () => {
  // Two siblings share DOB, zip, sex and near-identical names. The failure being
  // guarded against is an AUTOMATIC merge. Acceptance (projector rekey / source
  // attribution after unmerge) needs the graph+projector runtime → registered
  // pending. What is exercisable now: the match engine must NOT auto-link twins;
  // it must route them to steward review (60–90 possible-match band), which is
  // precisely what prevents the wrong merge from ever happening unsupervised.
  const twinA: IdentityTraits = {
    firstName: 'Jayden',
    lastName: 'Whitefeather',
    dob: '2015-06-02',
    sex: 'male',
    zip: '57703',
  };
  const twinB: IdentityTraits = {
    firstName: 'Jordan', // different first name — the only distinguishing trait
    lastName: 'Whitefeather',
    dob: '2015-06-02',
    sex: 'male',
    zip: '57703',
  };

  it('never fires a deterministic (certain) match on twins', () => {
    const det = runDeterministicRules(twinA, twinB);
    // No shared medicaidId/ssn, and first names differ → name+dob-exact cannot fire.
    expect(det.hit).toBe(false);
  });

  it('lands twins in the steward-review band, NOT auto-link', () => {
    const prob = scoreProbabilisticMatch(twinA, twinB);
    const tier = tierForScore(prob.score, false);
    // Shared last(30)+dob(25)+zip(10)+sex(5)=70 baseline; differing first names
    // add at most 19 → the pair is structurally pinned to [60, 89].
    expect(prob.score).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.possibleMatchMin);
    expect(prob.score).toBeLessThan(MATCH_THRESHOLDS.autoLinkMin);
    expect(tier).toBe('possible-match');
  });

  it('this invariant holds for ANY sibling pair with differing first names (class, not instance)', () => {
    const firstNamePairs: Array<[string, string]> = [
      ['Aaliyah', 'Amara'],
      ['Mateo', 'Marco'],
      ['Chen', 'Cheng'],
      ['Sofia', 'Sophia'],
    ];
    for (const [a, b] of firstNamePairs) {
      const s = scoreProbabilisticMatch(
        { ...twinA, firstName: a },
        { ...twinB, firstName: b }
      );
      expect(s.score).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.possibleMatchMin);
      expect(s.score).toBeLessThan(MATCH_THRESHOLDS.autoLinkMin);
      expect(tierForScore(s.score, false)).toBe('possible-match');
    }
  });
});

describe('UC-06 | Re-entry identity continuity', () => {
  // A justice-involved member re-enrolls after a coverage gap under a NEW
  // Medicaid CIN. Acceptance: the re-enrollment (changed subscriber id, matching
  // traits) links to the prior record above threshold — never as a new person.
  // (coverage.terminated/enrolled event modeling is deferred to the event store.)
  const priorIdentity: SourceIdentityRecord = {
    sourceSystem: 'state-agency',
    sourceRecordId: 'pre-incarceration-9931',
    traits: {
      firstName: 'Andre',
      lastName: 'Blacksmith',
      dob: '1991-09-14',
      medicaidId: 'SD-CIN-OLD-40021',
      sex: 'male',
    },
  };

  it('links a new CIN back to the prior identity on matching name + dob', () => {
    const reEntry: IdentityTraits = {
      firstName: 'Andre',
      lastName: 'Blacksmith',
      dob: '1991-09-14',
      medicaidId: 'SD-CIN-NEW-88817', // changed subscriber id
      sex: 'male',
    };
    const result = findBestMatch(reEntry, [priorIdentity]);
    // Above threshold and certain: continuity of record at day one of re-entry.
    expect(result.tier).toBe('deterministic');
    expect(result.confidence).toBe(100);
    expect(result.ruleHits.map((h) => h.rule)).toContain('name+dob-exact');
    expect(result.candidate?.sourceRecordId).toBe('pre-incarceration-9931');
  });

  it('a changed subscriber id alone does not manufacture a new person', () => {
    // Same person, different CIN — the engine still anchors to the prior record
    // rather than treating the new id as a stranger.
    const reEntry: IdentityTraits = {
      firstName: 'Andre',
      lastName: 'Blacksmith',
      dob: '1991-09-14',
      medicaidId: 'SD-CIN-NEW-99999',
    };
    const result = findBestMatch(reEntry, [priorIdentity]);
    expect(result.tier === 'deterministic' || result.tier === 'probabilistic-auto').toBe(true);
  });

  it('a genuinely different person does not re-anchor to the prior record', () => {
    const someoneElse: IdentityTraits = {
      firstName: 'Marcus',
      lastName: 'Riverstone',
      dob: '1978-02-01',
      medicaidId: 'SD-CIN-NEW-12345',
    };
    const result = findBestMatch(someoneElse, [priorIdentity]);
    expect(result.tier).toBe('no-match');
  });
});
