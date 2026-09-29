/**
 * A URL SEGMENT MUST NOT PROMOTE AN AGENT.
 *
 * The golden-thread preset surface picks the recovery agent's autonomy tier,
 * and `presetIdFromRecoveryId` derives that preset from a token inside the
 * recoveryId — request-derived input. The `aggressive` preset asks for
 * `autonomous`, which removes the human approval gate. The authority lock caps
 * that agent at HITL.
 *
 * Before the lock reached the load path, the preset simply won: a recoveryId
 * carrying `-aggressive-` produced an auto-approving agent whose reviewed
 * ceiling was HITL. These tests pin the corrected behaviour — the lock caps the
 * preset, the clamp is reported rather than swallowed, and the page still works.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPresetRegistry,
  lockedMaxTier,
  presetIdFromRecoveryId,
  presetRegistryForRecoveryId,
  resolvePresetTier,
} from '@/lib/goldenThread/presetRegistry';
import { THREAD_PRESETS } from '@/lib/goldenThread/threadPresets';
import { permittedRung } from '@/lib/agents/governance/interlock';
import { RUNG_ORDER } from '@/lib/evidence/tierConfig';

const AGENT = 'revenue-cycle-agent';

describe('the authority lock caps the preset, not the other way round', () => {
  it('the shipped lock caps the recovery agent at HITL', () => {
    expect(lockedMaxTier()).toBe('HITL');
  });

  it('clamps a request above the ceiling and says so', () => {
    const r = resolvePresetTier('autonomous');
    expect(r).toEqual({
      requested: 'autonomous',
      applied: 'HITL',
      clamped: true,
      lockedMax: 'HITL',
    });
  });

  it('leaves a request at or below the ceiling alone', () => {
    expect(resolvePresetTier('HITL')).toMatchObject({ applied: 'HITL', clamped: false });
  });

  it('never returns a tier above the ceiling, for any shipped preset', () => {
    for (const preset of Object.values(THREAD_PRESETS)) {
      expect(resolvePresetTier(preset.autonomyTier).applied).toBe('HITL');
    }
  });
});

describe('the registry the runtime actually gets is governed', () => {
  it('builds rather than throwing, for every shipped preset', () => {
    for (const preset of Object.values(THREAD_PRESETS)) {
      expect(() => buildPresetRegistry(preset.autonomyTier)).not.toThrow();
    }
  });

  it('a recoveryId asking for autonomous still yields a HITL agent', () => {
    const recoveryId = 'ev-m1-denial-aggressive-1700000000-recovery';
    expect(presetIdFromRecoveryId(recoveryId)).toBe('aggressive');
    expect(THREAD_PRESETS.aggressive.autonomyTier).toBe('autonomous');
    expect(presetRegistryForRecoveryId(recoveryId).get(AGENT).autonomyTier).toBe('HITL');
  });

  it('no preset can widen the agent tool allowlist either', () => {
    const shipped = buildPresetRegistry('HITL').get(AGENT).toolAllowlist;
    for (const preset of Object.values(THREAD_PRESETS)) {
      expect(buildPresetRegistry(preset.autonomyTier).get(AGENT).toolAllowlist).toEqual(shipped);
    }
  });
});

/**
 * THE HOLE THE FIRST FIX LEFT OPEN.
 *
 * `golden-thread/page.tsx` uses the preset's autonomy tier in THREE places: the
 * runtime manifest registry, `CashDeps.recoveryAgentTier` (which is what
 * `recoveryDispatch` feeds to `permittedRung`, so it decides the recorded
 * authority), and the tier shown in the interlock. The first fix clamped only
 * the registry. Driving the running app showed the consequence immediately —
 * the page rendered two interlocks disagreeing about the same agent on the same
 * run: "A3 for a autonomous agent" beside "A1 for a HITL agent".
 *
 * It read as harmless because evidence independently capped that scenario at
 * A1. It was not harmless: at settlement-grade evidence the raw tier grants A3.
 */
describe('the clamp closes the settlement-grade path, where evidence stops capping', () => {
  it('D3 evidence with a RAW autonomous preset would grant A3 — the hole', () => {
    expect(permittedRung('autonomous', 'D3')).toBe('A3');
  });

  it('every shipped preset, once resolved, is capped at A1 even at D3', () => {
    for (const preset of Object.values(THREAD_PRESETS)) {
      const applied = resolvePresetTier(preset.autonomyTier).applied;
      expect(permittedRung(applied, 'D3')).toBe('A1');
    }
  });

  it('the registry and the rung computation are fed the SAME tier', () => {
    for (const preset of Object.values(THREAD_PRESETS)) {
      const applied = resolvePresetTier(preset.autonomyTier).applied;
      expect(buildPresetRegistry(preset.autonomyTier).get(AGENT).autonomyTier).toBe(applied);
    }
  });
});

/**
 * THE TESTS THAT REPLACED A REGEX.
 *
 * An earlier version of this file asserted on the SOURCE TEXT of page.tsx —
 * counting `resolvePresetTier(` occurrences and matching `recoveryAgentTier:
 * appliedTier`. The adversarial panel defeated all of it in one line:
 *
 *     const { autonomyTier } = preset;          // /preset\.autonomyTier/g → 0
 *     presetAutonomyTier={autonomyTier}         // the original bug, restored
 *
 * Every assertion stayed green. Worse, the display consumer — the one that
 * actually produced the visible "A3 for a autonomous agent" — was never pinned
 * at all, and renaming a local variable turned the suite red with no behavioural
 * change. A control asserts a property of behaviour; that asserted a property of
 * text, and it shipped with its own disarm instructions in a comment.
 */
describe('no preset can reach an authority decision unclamped', () => {
  const evidenceTiers = ['D0', 'D1', 'D2', 'D3'] as const;

  it('at EVERY evidence tier, the applied tier never out-ranks the locked ceiling', () => {
    for (const preset of Object.values(THREAD_PRESETS)) {
      const applied = resolvePresetTier(preset.autonomyTier).applied;
      for (const e of evidenceTiers) {
        expect(RUNG_ORDER[permittedRung(applied, e)]).toBeLessThanOrEqual(
          RUNG_ORDER[permittedRung(lockedMaxTier(), e)]
        );
      }
    }
  });

  it('clamping never RAISES a rung — narrowing is monotone in the safe direction', () => {
    for (const preset of Object.values(THREAD_PRESETS)) {
      const { requested, applied } = resolvePresetTier(preset.autonomyTier);
      for (const e of evidenceTiers) {
        expect(RUNG_ORDER[permittedRung(applied, e)]).toBeLessThanOrEqual(
          RUNG_ORDER[permittedRung(requested, e)]
        );
      }
    }
  });

  it('a recoveryId cannot smuggle a preset through a dashed member id', () => {
    // The member id comes from an external SMART server. `123-aggressive` used to
    // inject a preset token into an id built for a balanced run.
    expect(presetIdFromRecoveryId('ev-123-aggressive-underpayment-balanced-170-recovery')).toBe(
      'balanced'
    );
    expect(presetIdFromRecoveryId('ev-m1-underpayment-aggressive-170-recovery')).toBe('aggressive');
  });

  it('an unparseable recoveryId falls back to the MOST restrictive preset', () => {
    for (const id of ['', 'garbage', 'ev-m1-underpayment-nosuchpreset-170-recovery']) {
      const applied = resolvePresetTier(
        THREAD_PRESETS[presetIdFromRecoveryId(id)].autonomyTier
      ).applied;
      expect(RUNG_ORDER[permittedRung(applied, 'D3')]).toBeLessThanOrEqual(
        RUNG_ORDER[permittedRung(THREAD_PRESETS.conservative.autonomyTier, 'D3')]
      );
    }
  });

  it('the decision-time registry matches the draft-time registry for every preset', () => {
    // Draft time builds from the preset; decision time rebuilds from the recoveryId.
    for (const [id, preset] of Object.entries(THREAD_PRESETS)) {
      const draft = buildPresetRegistry(preset.autonomyTier).get(AGENT).autonomyTier;
      const decision = presetRegistryForRecoveryId(`ev-m1-underpayment-${id}-170-recovery`).get(
        AGENT
      ).autonomyTier;
      expect(decision).toBe(draft);
    }
  });
});

describe('request parameters cannot crash the surface', () => {
  // `k in THREAD_PRESETS` walked the prototype chain, so these five all passed
  // the guard and resolved to an Object.prototype member with no autonomyTier —
  // an unauthenticated 500 from a query string, confirmed against the running app.
  const PROTO_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'];

  it('no prototype key is mistaken for a preset', () => {
    for (const k of PROTO_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(THREAD_PRESETS, k)).toBe(false);
    }
  });

  it('every real preset still passes an own-key check', () => {
    for (const k of Object.keys(THREAD_PRESETS)) {
      expect(Object.prototype.hasOwnProperty.call(THREAD_PRESETS, k)).toBe(true);
    }
  });

  it('presetIdFromRecoveryId refuses a prototype key rather than resolving it', () => {
    for (const k of PROTO_KEYS) {
      expect(presetIdFromRecoveryId(`ev-m1-underpayment-${k}-170-recovery`)).toBe('conservative');
    }
  });
});
