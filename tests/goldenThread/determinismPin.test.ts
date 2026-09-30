/**
 * Determinism snapshot pins. The scenario work (Diane MA) leans on the default 'wa-medicaid' stream being
 * byte-identical to what shipped, and on each scenario being its own frozen RNG stream. These exact-value
 * pins are the gate: reorder a mulberry() draw anywhere in warm-up/seed and one of these FAILS immediately.
 *
 * WHY THIS FILE GREW AN INVARIANT DIGEST. `chainHead` alone is a poor guard, and it had been re-pinned
 * twice on the strength of the same two-scalar argument ("tick and ledgerSeq are unchanged, so nothing
 * behavioural moved"). That argument is weaker than it reads: `tick` and `ledgerSeq` count how LONG the
 * run was and how MANY rows it sealed, and are blind to every change in the CONTENT of a row. Editing a
 * `decision` string, or flipping a rung, moves the head while leaving both untouched — so a re-pin
 * defended by them alone cannot distinguish the intended change from an unintended one riding along.
 *
 * `INVARIANT_DIGEST` below closes that: it folds the row fields that no ledger-format change may alter
 * — who acted, when, on what, with what outcome, in what order. A future change to the hashed field
 * set, or to how a rung is recorded, moves `chainHead` and leaves this digest alone. A change that
 * moves this digest changed the run, whatever it claims in its commit message.
 */
import { describe, it, expect } from 'vitest';
import { createSim } from '@/lib/goldenThread/flowSim';
import { mixHash } from '@/lib/goldenThread/ledgerSeal';
import type { SimState } from '@/lib/goldenThread/flowSim';

/**
 * A digest over WHAT HAPPENED, deliberately excluding how authority is LABELLED (`rung`, `version`,
 * `oversight`) and the hashed-field-set machinery. Those are the ledger's vocabulary; these are the run.
 */
const invariantDigest = (s: SimState): number =>
  s.ledger.reduce(
    (h, e) =>
      mixHash(h, [
        e.seq,
        e.tick,
        e.actor,
        e.human,
        e.fired,
        e.tier,
        e.decision,
        e.nistFn,
        e.nistChar,
        e.reproducible,
      ]),
    s.ledger[0].prevHash
  );

describe('determinism pins', () => {
  it('default scenario (wa-medicaid) createSim(20260914) is frozen', () => {
    const s = createSim(20260914);
    // RE-PIN 3 (this one) — 2719275098 → 1204273244. Two things moved, and BOTH are deliberate:
    //
    //   (a) THE HASHED FIELD SET. `clamped` is gone; `earnedCeiling` and `overCeiling` replace it, and
    //       the parts are now derived from a typed key witness and sorted, so the order is a property
    //       of the key set rather than of a literal maintained in three places (ledgerSeal.ts).
    //   (b) WHAT AN OVER-CEILING ACT RECORDS. The predecessor CLAMPED: an agent act stated at A2 with
    //       nothing earned was re-sealed `rung: 'A0'`, `version: 'assist·D2'`, and — since
    //       `deriveOversight` reads the rung — `oversight: 'watch'`. That prevented nothing (the act
    //       had already run) and manufactured the row `flowSim.proposeOutbound` says can never exist:
    //       an "A0 … EXECUTED" agent act. The ledger now records the authority EXERCISED. 218 of the
    //       251 warm-start rows are affected, which is why the head moves by more than a field add.
    //
    // So, unlike re-pins 1 and 2, this one CANNOT be defended as "the field set changed, nothing else".
    // I checked: a digest over the pre-change 13 fields does NOT reproduce 3794285767, precisely
    // because (b) rewrote rung/version/oversight on those 218 rows. Saying otherwise would have been a
    // tidier story and a false one.
    //
    // What IS pinned instead is the substantive claim plus a forward guard: the run itself is
    // unchanged (tick, ledgerSeq, and INVARIANT_DIGEST — same acts, same actors, same order, same
    // decisions), and the disclosure count is now explicit rather than implied. INVARIANT_DIGEST is
    // established here, not verified against history; from this point on it is the assertion a future
    // re-pin has to leave standing.
    //
    // RE-PIN 2 — `clamped` joined the hash. RE-PIN 1 — one in-flight underpayment→appeal seeded at the
    // end of warm-up (`startAppealWorkflow` draws no mulberry(); ledgerSeq 250→251). Kept for the trail.
    expect(s.chainHead).toBe(1204273244);
    expect(s.ledgerSeq).toBe(251);
    expect(s.tick).toBe(684);
  });

  it('the RUN is unchanged — who acted, when, on what, in what order', () => {
    // This is the assertion that survives a ledger-format change. If a future wave moves `chainHead`
    // and this too, the wave changed behaviour, whatever its comment says.
    expect(invariantDigest(createSim(20260914))).toBe(829350661);
  });

  it('the cold-start book discloses 218 over-ceiling acts out of 251', () => {
    // The substantive claim of the earned-ceiling record, pinned as a number rather than left implied.
    // A cold-start fleet has earned NOTHING, and the payer UM path runs autonomous A2 sub-steps — so a
    // large majority of warm-up rows are over-ceiling, and the honest ledger says so on every one.
    // If this collapses toward 0, either the ceiling stopped being recorded or admission control
    // landed (G-039) — and either way the change must be deliberate, not silent.
    const s = createSim(20260914);
    expect(s.ledger.filter((r) => r.overCeiling).length).toBe(218);
    expect(s.ledger.length).toBe(251);
  });

  it('same seed reproduces exactly (default)', () => {
    const a = createSim(20260914);
    const b = createSim(20260914);
    expect(a.chainHead).toBe(b.chainHead);
    expect(a.ledgerSeq).toBe(b.ledgerSeq);
  });
});
