/**
 * THE EARNED-CEILING RECORD — what the fleet had earned when an act was sealed, and whether the act
 * exceeded it. Extracted from `flowSim.seal` by responsibility (conventions §2), and because
 * `flowSim.ts` is frozen in `quality-baseline.json` so it may not grow.
 *
 * THIS MODULE REPLACED A CLAMP, AND THE REPLACEMENT IS THE POINT. The first cut (`sealClamp.ts`)
 * rewrote the row DOWNWARD: a non-human act stated at A2 while the fleet had earned nothing was
 * re-sealed `rung: 'A0'`, `version: 'assist·D2'`, and — because `deriveOversight` reads the rewritten
 * rung — `oversight: 'watch'`. Adversarial review killed it, correctly:
 *
 *   - THE CLAMP PREVENTED NOTHING. `flowSim.enterSubStep` seals a payer UM determination substep and
 *     then returns; the substep runs either way. Lowering the number on the receipt does not lower
 *     the authority exercised, it only misreports it.
 *   - IT MANUFACTURED THE ONE ROW THE ENGINE FORBIDS. `flowSim.proposeOutbound` states the invariant
 *     outright — "the ledger can never show an 'A0/A1 … EXECUTED' agent act. This binds the ENGINE,
 *     not just the UI" — and implements it by turning an unearned act into a human-released PROPOSAL.
 *     The gold-card gate does the same. The clamp produced exactly the forbidden row, at volume.
 *   - IT ANSWERED THE AUDITOR'S QUESTION WITH SILENCE. The reason a state Medicaid agency wants an
 *     earned-authority regime at all is to be able to ask "what did your agents do above what they
 *     had earned?" A design that rewrites every such act down to an advisory guarantees that query
 *     returns nothing, forever, and the rewrite is sealed into the hash chain so it reads as fact.
 *
 * So the record now states the authority the agent ACTUALLY EXERCISED, alongside the ceiling in force
 * at that moment and a derived `overCeiling` flag. Both new fields are hashed (see
 * `flowSim.ledgerHashParts`), so the disclosure cannot be edited out for free.
 *
 * WHAT THIS MODULE IS NOT. It is detection, not prevention. Holding an over-ceiling act — admission
 * control at each autonomous act site, on the `proposeOutbound` pattern — is the actual control, and
 * it is registered as G-039 for W8. Until that lands, an over-ceiling act HAPPENS and is disclosed;
 * nothing here should be read as claiming it was stopped.
 *
 * The one thing carried over from the clamp is the grammar fix (G-037): the caller DECLARES whether a
 * row is an act or an authority change, rather than the code inferring it from a `·` that both
 * grammars contain — which parsed `'REVOKE·A2'` as an act and re-sealed a fail-closed revocation as
 * `version: 'HITL·A2'` while its own `decision` still read "Authority ceiling dropped A3→A2".
 *
 * Pure and deterministic: no clock, no rng, no I/O.
 */

/** What the assessment needs, and nothing more. */
export interface CeilingInput {
  /** Was this sealed by a human? A human act is not governed by the earned AUTONOMOUS ceiling. */
  human: boolean;
  /** The DECLARED record grammar. Only an act exercises authority. */
  kind: 'act' | 'authority-change';
  /** The rung the actor exercised, e.g. `'A2'`. */
  rung: string;
  /** The fleet's earned-and-granted autonomy ceiling in force, as a level 0-3. */
  earnedCeiling: number;
}

/** What gets sealed onto the row. Neither field ever changes `rung` or `version`. */
export interface CeilingRecord {
  /** The ceiling in force when this act was sealed, normalised to 0-3. */
  earnedCeiling: number;
  /** The act exercised more autonomous authority than the fleet had earned. */
  overCeiling: boolean;
}

/**
 * `'A2'` → `2`. Anything that is not exactly one rung token → `-1`, meaning UNPARSEABLE — distinct
 * from `0`, which is a real rung.
 *
 * WHY NOT `Number(rung.replace(/[^0-9]/g, '')) || 0`, which is what this replaced: that strips
 * non-digits and concatenates what survives, so `'A2·D2'` became `22` and `'A2.5'` became `25` —
 * silently ten rungs above the top of the ladder, in a function whose whole job is to bound
 * authority. The `|| 0` fallback it carried was unreachable (`Number('')` is `0`, never `NaN`), so
 * the "unparseable → the safe end" comment it carried described a branch that never ran.
 */
export const rungLevel = (rung: string): number =>
  /^A[0-3]$/.test(rung) ? Number(rung.slice(1)) : -1;

/** Normalise a ceiling from an arbitrary number to a rung level. Non-integers floor; out of range clamps. */
export const ceilingLevel = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(3, Math.trunc(n))) : 0;

/**
 * Assess one seal against the earned ceiling.
 *
 * INVARIANT: this function is PURE OBSERVATION. It returns no `rung` and no `version`, so no caller
 * can use it to rewrite what an act claims to have been — the defect it exists to have stopped being.
 *
 * INVARIANT: an authority-change record is never over-ceiling. It records what the ceiling BECAME, so
 * measuring it against that same ceiling is circular, and it is the grammar the old clamp destroyed.
 *
 * INVARIANT: an UNPARSEABLE rung is reported as OVER CEILING, not as fine. An act whose authority
 * cannot be read is an act whose authority cannot be shown to be within the ceiling, and "cannot be
 * proven within" is the fail-closed reading. The predecessor returned it untouched and unflagged,
 * which meant any future rung token — a band label like `'A2+'`, a manifest-sourced value — would
 * have sailed through the one control watching for exactly that.
 */
export function assessCeiling(input: CeilingInput): CeilingRecord {
  const earnedCeiling = ceilingLevel(input.earnedCeiling);
  if (input.kind !== 'act') return { earnedCeiling, overCeiling: false };
  // A human act is governed by the human gate, not by what the machine has earned.
  if (input.human) return { earnedCeiling, overCeiling: false };
  const level = rungLevel(input.rung);
  if (level < 0) return { earnedCeiling, overCeiling: true }; // unreadable → unproven → disclosed
  // Detect-and-advise (A0/A1) is governed by the human gate too: an agent may always advise.
  if (level <= 1) return { earnedCeiling, overCeiling: false };
  return { earnedCeiling, overCeiling: level > earnedCeiling };
}
