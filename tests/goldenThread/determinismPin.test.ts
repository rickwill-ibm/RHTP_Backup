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
    // Re-pinned when one in-flight underpayment→appeal is now SEEDED at the end of warm-up (so the
    // Reconciliation "Appeals" tab opens populated with a real, sealed workflow instead of blank).
    // startAppealWorkflow draws NO mulberry(), so the per-scenario RNG stream is untouched: `tick`
    // stays 684 (zero behavioral drift / no reordered draw) and exactly ONE advisory step is sealed →
    // ledgerSeq 250→251 and the chain head changes by design. A bounded, documented re-pin — not a break.
    expect(s.chainHead).toBe(3794285767);
    expect(s.ledgerSeq).toBe(251);
    expect(s.tick).toBe(684);
  });

  it('same seed reproduces exactly (default)', () => {
    const a = createSim(20260914);
    const b = createSim(20260914);
    expect(a.chainHead).toBe(b.chainHead);
    expect(a.ledgerSeq).toBe(b.ledgerSeq);
  });
});
