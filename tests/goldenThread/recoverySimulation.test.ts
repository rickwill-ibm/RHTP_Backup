/**
 * recoverySimulation — FAIL / fail-closed governance tests (#495, E13 test-link).
 *
 * Asserts the three explicit adversarial scenarios hold fail-closed through the REAL
 * Twin-Ladder interlock, and that the ordinary recovery scenarios are unchanged
 * (no `fail` outcome). Deterministic — every figure comes from the real functions.
 */
import { describe, it, expect } from 'vitest';
import {
  SCENARIOS,
  BATCHES,
  DEFAULT_POLICY,
  simulateScenario,
  simulateCohort,
  scenarioById,
  type RecoveryPolicy,
} from '@/lib/goldenThread/recoverySimulation';
import { FAIL_SCENARIOS, evaluateFailProbe } from '@/lib/goldenThread/recoveryFailScenarios';

const AUTONOMOUS_POLICY: RecoveryPolicy = { ...DEFAULT_POLICY, autonomyCeiling: 'autonomous' };

describe('recoverySimulation — fail-closed scenarios (#495)', () => {
  it('adds every FAIL scenario to the named dropdown', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(ids).toContain('fail-payer-autodeny-thin');
    expect(ids).toContain('fail-provider-thin-evidence');
    expect(ids).toContain('fail-submission-gateway');
    // Wave-13.1 MED-6 — the two additional fail-closed scenarios the skeptic demands.
    expect(ids).toContain('fail-adverse-recoup-d3');
    expect(ids).toContain('fail-indeterminate-liability');
    for (const s of FAIL_SCENARIOS) {
      expect(s.label).toMatch(/^FAIL \(/);
    }
  });

  it('PAYER fail: auto-denial on thin evidence (D0) is tier-capped to A0 and cannot act', () => {
    const r = simulateScenario(scenarioById('fail-payer-autodeny-thin'), DEFAULT_POLICY);
    expect(r.fail).toBeDefined();
    expect(r.fail?.class).toBe('payer-adverse');
    expect(r.fail?.cappedRung).toBe('A0');
    expect(r.fail?.cappedByEvidence).toBe(true);
    expect(r.fail?.requiresHuman).toBe(true);
    expect(r.fail?.blocked).toBe(true);
  });

  it('PROVIDER fail: absent evidence (D0) caps recovery to assist — no autonomous draft', () => {
    const r = simulateScenario(scenarioById('fail-provider-thin-evidence'), DEFAULT_POLICY);
    expect(r.fail?.class).toBe('provider-evidence');
    expect(r.fail?.cappedRung).toBe('A0');
    expect(r.fail?.blocked).toBe(true);
    // The recovery itself cannot escalate past manual (rung A0) under the default policy.
    expect(r.rung).toBe('A0');
    expect(r.category).toBe('recoverable-manual');
  });

  it('GATEWAY fail: a submission is blocked at the human gate even at D3 / autonomous', () => {
    const r = simulateScenario(scenarioById('fail-submission-gateway'), DEFAULT_POLICY);
    expect(r.fail?.class).toBe('submission-gateway');
    // Strong evidence + full autonomy → rung is NOT evidence-capped …
    expect(r.fail?.cappedRung).toBe('A3');
    expect(r.fail?.cappedByEvidence).toBe(false);
    // … yet the submission still cannot auto-submit — fail-closed regardless of rung.
    expect(r.fail?.requiresHuman).toBe(true);
    expect(r.fail?.blocked).toBe(true);
  });

  it('ordinary recovery scenarios carry NO fail outcome (byte-identical behavior)', () => {
    for (const id of ['strong-underpaid', 'weak-underpaid', 'pa-denied', 'matched']) {
      const r = simulateScenario(scenarioById(id), DEFAULT_POLICY);
      expect(r.fail).toBeUndefined();
    }
  });

  it('the governance fail-closed cohort counts every blocked probe', () => {
    const batch = BATCHES.find((b) => b.id === 'gov-failclosed');
    expect(batch).toBeDefined();
    const cohort = simulateCohort(batch!.scenarios, DEFAULT_POLICY);
    // Four interlock probes (payer-autodeny, adverse-recoup, submission-gateway,
    // provider-thin), all blocked; the indeterminate + 2 strong-underpaid carry no probe.
    expect(cohort.failClosedCount).toBe(4);
    // The indeterminate scenario is present and fail-closed at the reconcile level.
    expect(cohort.byCategory.indeterminate).toBe(1);
  });

  it('is deterministic — repeated evaluation is identical', () => {
    const a = evaluateFailProbe(
      { class: 'submission-gateway', attemptedActionType: 'appeal', attemptedAutonomy: 'autonomous' },
      'D3'
    );
    const b = evaluateFailProbe(
      { class: 'submission-gateway', attemptedActionType: 'appeal', attemptedAutonomy: 'autonomous' },
      'D3'
    );
    expect(a).toEqual(b);
    // 'appeal' is submission-class → human-gated even unflagged, at A3.
    expect(a.blocked).toBe(true);
    expect(a.cappedRung).toBe('A3');
  });
});

describe('recoverySimulation — interlock GATE, not just the rung ceiling (Wave-13.1 HIGH-1/2)', () => {
  it('MED-6 (1): payer auto-denial (adverse) at autonomous + D0 → permitted rung A0 AND resolved=false', () => {
    // Evaluate the probe at its attempted autonomous tier (the probe carries the tier).
    const r = simulateScenario(scenarioById('fail-payer-autodeny-thin'), AUTONOMOUS_POLICY);
    expect(r.fail?.cappedRung).toBe('A0'); // evidence ceiling caps even A3 to A0
    expect(r.fail?.blocked).toBe(true); // blocked === !resolved
    expect(r.fail?.requiresHuman).toBe(true);
  });

  it('MED-6 (2): an adverse action at A3 / D3 STILL blocks (recoupment human-gated regardless of rung)', () => {
    const r = simulateScenario(scenarioById('fail-adverse-recoup-d3'), AUTONOMOUS_POLICY);
    // Rung is A3 — NOT evidence-capped …
    expect(r.rung).toBe('A3');
    expect(r.tierCapped).toBe(false);
    expect(r.fail?.cappedRung).toBe('A3');
    expect(r.fail?.cappedByEvidence).toBe(false);
    // … yet the adverse action cannot auto-resolve: fail-closed on rung-independent grounds.
    expect(r.adverse).toBe(true);
    expect(r.requiresHuman).toBe(true);
    expect(r.resolved).toBe(false);
    expect(r.fail?.blocked).toBe(true);
    // And it is NEVER an autonomous agent draft — the recoverable shortfall is human-driven.
    expect(r.recoverable).toBe(true);
    expect(r.category).toBe('recoverable-manual');
    expect(r.category).not.toBe('recoverable-agent-draft');
  });

  it('MED-6 (3): a payer-facing submission is fail-closed even at D3 / autonomous', () => {
    const r = simulateScenario(scenarioById('fail-submission-gateway'), AUTONOMOUS_POLICY);
    expect(r.submission).toBe(true);
    expect(r.rung).toBe('A3'); // not capped
    expect(r.resolved).toBe(false); // submission human-gated regardless of rung
    expect(r.submissionRequiresHuman).toBe(true);
    expect(r.fail?.blocked).toBe(true);
  });

  it('MED-6 (4): indeterminate member-liability (no recognized X12 group) → reconcile fail-closed, no recovery', () => {
    const r = simulateScenario(scenarioById('fail-indeterminate-liability'), AUTONOMOUS_POLICY);
    expect(r.verdict).toBe('indeterminate');
    expect(r.recoverable).toBe(false);
    expect(r.category).toBe('indeterminate');
  });

  it('HIGH-1/2 regression: NO scenario carrying an adverse action is categorized recoverable-agent-draft', () => {
    // Even at maximum autonomy (the tier that would otherwise unlock A3), an adverse
    // recovery action can never be an autonomous agent draft.
    for (const s of SCENARIOS) {
      const r = simulateScenario(s, AUTONOMOUS_POLICY);
      if (r.adverse) {
        expect(r.category).not.toBe('recoverable-agent-draft');
      }
    }
  });

  it('byte-identical: a scenario with NO actionType keeps its prior (non-adverse) categorization', () => {
    // strong-underpaid at HITL was rung A1 → agent-draft; weak-underpaid at HITL was A0 → manual.
    const strong = simulateScenario(scenarioById('strong-underpaid'), DEFAULT_POLICY);
    expect(strong.adverse).toBe(false);
    expect(strong.submission).toBe(false);
    expect(strong.category).toBe('recoverable-agent-draft');
    const weak = simulateScenario(scenarioById('weak-underpaid'), DEFAULT_POLICY);
    expect(weak.category).toBe('recoverable-manual');
  });
});
