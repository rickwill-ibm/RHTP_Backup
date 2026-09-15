/**
 * Determinism snapshot pins. The scenario work (Diane MA) leans on the default 'wa-medicaid' stream being
 * byte-identical to what shipped, and on each scenario being its own frozen RNG stream. These exact-value
 * pins are the gate: reorder a mulberry() draw anywhere in warm-up/seed and one of these FAILS immediately.
 */
import { describe, it, expect } from 'vitest';
import { createSim } from '@/lib/goldenThread/flowSim';

describe('determinism pins', () => {
  it('default scenario (wa-medicaid) createSim(20260914) is frozen', () => {
    const s = createSim(20260914);
    // Re-pinned once when the earned-clamp was corrected to exempt A1 detection/advisory seals (an agent
    // may always advise): the fairness-screen advisory now records A1 (not A0/watch), so the sealed rungs —
    // and thus the chain hash — changed by design. ledgerSeq/tick are unchanged, proving it is a pure
    // rung-recording correction with zero RNG/behavioral drift, not a reordered draw.
    expect(s.chainHead).toBe(2487355187);
    expect(s.ledgerSeq).toBe(250);
    expect(s.tick).toBe(684);
  });

  it('same seed reproduces exactly (default)', () => {
    const a = createSim(20260914);
    const b = createSim(20260914);
    expect(a.chainHead).toBe(b.chainHead);
    expect(a.ledgerSeq).toBe(b.ledgerSeq);
  });
});
