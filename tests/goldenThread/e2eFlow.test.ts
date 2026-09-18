/**
 * T1 — unit/invariant tests for the Golden-Thread end-to-end flow spine.
 *
 * Pins the load-bearing governance invariants the coalition surfaced:
 *  - human-gating is DERIVED from the engine, never drifted from a hand-set boolean;
 *  - NO autonomous adverse action (no adverse/submission outbound is agent-executable);
 *  - verdict() reports the binding constraint (manifest vs evidence) truthfully;
 *  - structural integrity of STAGES / TICKETS / OPERATORS.
 * These are exactly the assertions R5 would run: each would FAIL if the feature were inverted.
 */
import { describe, it, expect } from 'vitest';
import {
  STAGES,
  TICKETS,
  FORENSIC,
  OPERATORS,
  ROLE_LABEL,
  actionRequiresHuman,
  verdict,
  type OpsRole,
} from '@/lib/goldenThread/e2eFlow';
import { isAdverseCoverageAction, isSubmissionActionType } from '@/lib/agents/governance/decisionGate';
import { AUTONOMY_RUNG } from '@/lib/agents/governance/interlock';
import { RUNG_ORDER, TIER_RUNG_CEILING, type EvidenceTier } from '@/lib/evidence/tierConfig';
import type { AutonomyTier } from '@/lib/agents/manifest/types';

describe('outbound human-gating is engine-derived (not hand-set)', () => {
  // Hand-written expectation table — NOT `actionRequiresHuman(x)` — so an inversion of the
  // derivation is actually caught (the tautology R5 flagged: comparing the field to the function
  // that produced it would pass even if that function were inverted).
  const EXPECTED_GATE: Record<string, boolean> = {
    'x12-275': true, // payer-facing submission
    'x12-276': true,
    'x12-278': true,
    'x12-837-corrected': true,
    appeal: true, // payer-facing submission
    'provider-notice': false, // informational, non-adverse
    'ticket-update': false, // internal
  };

  it('every outbound button matches the hand-written expected gate', () => {
    for (const t of TICKETS) {
      for (const a of t.outbound) {
        const expected = EXPECTED_GATE[a.actionType];
        expect(expected, `no expectation for actionType ${a.actionType}`).toBeDefined();
        expect(a.humanGated, `${t.id}/${a.actionType}`).toBe(expected);
      }
    }
  });

  it('actionRequiresHuman agrees with the hand-written table (derivation is correct, not just self-consistent)', () => {
    for (const [actionType, expected] of Object.entries(EXPECTED_GATE)) {
      expect(actionRequiresHuman(actionType), actionType).toBe(expected);
    }
  });
});

describe('adverse-path negative test (the gap the panel flagged)', () => {
  it('provider payment-suspension / exclusion / debarment / sanction are adverse → human-gated', () => {
    for (const actionType of ['payment-suspension', 'provider-suspension', 'exclusion-recovery', 'debar-provider', 'sanction-notice']) {
      expect(actionRequiresHuman(actionType), actionType).toBe(true);
    }
  });

  it('the tamper-response integrity-freeze is NOT swept into adverse (must stay able to auto-fire)', () => {
    // integrity-freeze contains no adverse token and is not a submission → not force-gated here.
    expect(actionRequiresHuman('integrity-freeze')).toBe(false);
  });
});

describe('INVARIANT: no autonomous adverse action, ever', () => {
  it('no adverse OR submission outbound is agent-executable (humanGated must be true)', () => {
    for (const t of TICKETS) {
      for (const a of t.outbound) {
        const mustGate = isAdverseCoverageAction({ actionType: a.actionType }) || isSubmissionActionType(a.actionType);
        if (mustGate) expect(a.humanGated, `${t.id}/${a.actionType}`).toBe(true);
      }
    }
  });

  it('a ticket whose most-privileged proposed action is a submission/adverse shows requiresHuman', () => {
    for (const t of TICKETS) {
      const anyGated = t.outbound.some((a) => a.humanGated);
      if (anyGated) {
        // if the ticket exposes a gated action, its own verdict must require a human
        expect(t.verdict.requiresHuman, t.id).toBe(true);
      }
    }
  });
});

describe('verdict() reports the binding constraint truthfully', () => {
  it('a HITL manifest on D2 evidence is manifest-capped to A1 — reason must NOT blame evidence', () => {
    const v = verdict('HITL', 'D2', { actionType: 'provider-notice' });
    expect(v.permittedRung).toBe('A1');
    expect(v.requiresHuman).toBe(true);
    expect(v.cappedByEvidence).toBe(false);
    expect(v.reason).toMatch(/Autonomy tier HITL grants only A1/);
    expect(v.reason).not.toMatch(/Evidence tier/);
  });

  it('an evidence-capped low rung blames evidence', () => {
    const v = verdict('HOTL', 'D1', { actionType: '' });
    expect(v.permittedRung).toBe('A1');
    expect(v.cappedByEvidence).toBe(true);
    expect(v.reason).toMatch(/Evidence tier D1 caps authority at A1/);
  });

  it('a submission is human-gated regardless of a high rung', () => {
    const v = verdict('autonomous', 'D3', { actionType: 'appeal' });
    expect(v.permittedRung).toBe('A3');
    expect(v.requiresHuman).toBe(true);
    expect(v.reason).toMatch(/submission/i);
  });

  it('clean non-adverse high-tier work lets the agent act', () => {
    const v = verdict('HOTL', 'D2', { actionType: '' });
    expect(v.requiresHuman).toBe(false);
    expect(v.reason).toMatch(/agent may act/i);
  });
});

describe('verdict() never exceeds the interlock ceilings (property)', () => {
  const tiers: AutonomyTier[] = ['HITL', 'HOTL', 'autonomous'];
  const evs: EvidenceTier[] = ['D0', 'D1', 'D2', 'D3'];
  it('permittedRung <= min(autonomy rung, evidence ceiling) for every combination', () => {
    for (const m of tiers) {
      for (const e of evs) {
        const v = verdict(m, e, { actionType: '' });
        expect(RUNG_ORDER[v.permittedRung]).toBeLessThanOrEqual(RUNG_ORDER[AUTONOMY_RUNG[m]]);
        expect(RUNG_ORDER[v.permittedRung]).toBeLessThanOrEqual(RUNG_ORDER[TIER_RUNG_CEILING[e]]);
      }
    }
  });
});

describe('structural integrity', () => {
  it('STAGES has 11 stages, unique keys, contiguous seq 1..11', () => {
    expect(STAGES).toHaveLength(11);
    expect(new Set(STAGES.map((s) => s.key)).size).toBe(11);
    expect(STAGES.map((s) => s.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('every ticket is assigned to its role-queue operator (name resolves)', () => {
    for (const t of TICKETS) {
      expect(t.operator, t.id).toBe(OPERATORS[t.role]);
      expect(OPERATORS[t.role].length, t.role).toBeGreaterThan(0);
    }
  });

  it('every OpsRole has a label and an operator (ASCII-only, no stray unicode names)', () => {
    for (const role of Object.keys(ROLE_LABEL) as OpsRole[]) {
      expect(ROLE_LABEL[role].length).toBeGreaterThan(0);
      // eslint-disable-next-line no-control-regex
      expect(OPERATORS[role]).toMatch(/^[\x00-\x7F]+$/);
    }
  });

  it('forensic entries reference a known tier/rung and a ticket ref', () => {
    for (const f of FORENSIC) {
      expect(['D0', 'D1', 'D2', 'D3']).toContain(f.evidenceTier);
      expect(['A0', 'A1', 'A2', 'A3']).toContain(f.permittedRung);
      expect(f.ref).toMatch(/^ev-/);
    }
  });
});
