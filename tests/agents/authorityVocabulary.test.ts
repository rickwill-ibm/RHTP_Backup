/**
 * G-005 — THE AUTHORITY LOCK'S STRENGTH LADDERS, AND WHY THEY CAN NO LONGER DISAGREE WITH THE UNIONS.
 *
 * `AUTONOMY_ORDER` and `PHI_ORDER` are the ladders the authority lock ranks against. They are
 * deliberately typed `readonly string[]` rather than `readonly AutonomyTier[]`: the lock validates
 * UNTRUSTED input — a manifest a production loader fetched from a store, which the build-time gate
 * never saw — so `rank()` and `oneOf()` must be able to RECEIVE arbitrary junk in order to reject it.
 * Narrowing the array type would close a lint-shaped gap by breaking the security-critical path.
 *
 * WHAT THE FIRST VERSION OF THIS FILE GOT WRONG, corrected in adversarial review and recorded here
 * because a false INVARIANT comment is a defect in this programme's terms. It claimed the wide type
 * left a SILENT failure open: "`rank()` returns -1 for the new member … so the lock reads a new,
 * un-reviewed autonomy level as the weakest thing in the system." That is false.
 * `authority/assertAuthority.ts:21-25` reads `const i = order.indexOf(value); if (i < 0) throw …` —
 * it THROWS, and every other consumer handles the miss explicitly (`presetRegistry.ts` throws on
 * `indexOf < 0`; `lockedMaxTier` falls back to `AUTONOMY_ORDER[0]`, the weakest). The real
 * consequence of adding a union member and forgetting the array was always a LOUD refusal at manifest
 * load, which is the safe outcome. The gap was a maintenance hazard, not a security hole, and it
 * should never have been argued as one.
 *
 * SO THE FIX IS DERIVATION, NOT DETECTION. `authority/types.ts` now declares each vocabulary ONCE, as
 * an object, and takes both the union (`keyof typeof`) and the ordered array (`Object.keys`) from it
 * — the house pattern already used for `AgentTaskKind` in `agents/dispatch/types.ts`. A member cannot
 * be added to one and forgotten in the other, because there is no "other". The unions moved into
 * `authority/` to make that possible without inverting the layering (`manifest/registry.ts` and
 * `manifest/authorityGate.ts` import FROM authority, so authority must not import back); manifest
 * re-exports them, so every existing import site is unchanged.
 *
 * These cases pin what derivation cannot state on its own: the ORDER, which is what `rank()` means by
 * strength, and the fact that the wide type still accepts junk.
 */
import { describe, expect, it } from 'vitest';
import { AUTONOMY_ORDER, PHI_ORDER } from '@/lib/agents/authority';
import type { AutonomyTier, PhiPosture } from '@/lib/agents/manifest';

/**
 * The compile-time half, kept as a second opinion on the derivation: if someone un-derives the arrays
 * back into hand-written literals, a union member added without an array entry still fails `tsc` here
 * (`tsconfig.include` is `**\/*.ts`, `exclude` does not list `tests`, and `check:types` — the first
 * rung of `check:all` — is `tsc --noEmit`, so this fails the BUILD, not merely the run).
 */
const AUTONOMY_INDEX = { HITL: 0, HOTL: 1, autonomous: 2 } satisfies Record<AutonomyTier, number>;
const PHI_INDEX = { none: 0, 'references-only': 1, full: 2 } satisfies Record<PhiPosture, number>;

describe('AUTONOMY_ORDER is the strength ladder, weakest first', () => {
  it('carries every tier at its declared index — agreement, not mere membership', () => {
    // `toEqual` on the whole array rather than a per-member `toContain`: index IS strength here
    // (`rank()` returns `indexOf`), so a reordering that preserved membership would invert the ladder
    // and let HITL outrank autonomous. Derivation gives agreement; only this gives ORDER.
    expect(AUTONOMY_ORDER).toEqual(['HITL', 'HOTL', 'autonomous']);
    for (const [tier, index] of Object.entries(AUTONOMY_INDEX)) {
      expect(AUTONOMY_ORDER[index]).toBe(tier);
    }
  });

  it('carries NOTHING ELSE — an entry with no union member is an ungoverned tier', () => {
    expect(AUTONOMY_ORDER).toHaveLength(Object.keys(AUTONOMY_INDEX).length);
  });
});

describe('PHI_ORDER is the strength ladder, weakest first', () => {
  it('carries every posture at its declared index', () => {
    expect(PHI_ORDER).toEqual(['none', 'references-only', 'full']);
    for (const [posture, index] of Object.entries(PHI_INDEX)) {
      expect(PHI_ORDER[index]).toBe(posture);
    }
  });

  it('carries NOTHING ELSE', () => {
    expect(PHI_ORDER).toHaveLength(Object.keys(PHI_INDEX).length);
  });
});

describe('the wide type is load-bearing, not an oversight', () => {
  it('accepts an arbitrary string so the lock can REJECT it — this is the reason for readonly string[]', () => {
    // If someone "fixes" the array type to `readonly AutonomyTier[]`, this stops compiling, and that
    // is the point: the failure lands on the test that explains why, not on `assertAuthority`.
    const junk: string = 'root';
    expect(AUTONOMY_ORDER.includes(junk)).toBe(false);
    expect(PHI_ORDER.includes(junk)).toBe(false);
  });
});
