/**
 * ONE RUNG→AUTONOMY VOCABULARY, AND A LEDGER THAT STATES WHAT ACTUALLY HAPPENED.
 *
 * WHAT WAS WRONG (register G-037, G-038). Four modules each held their own private rung→label map:
 * `flowSim.seal`'s inline expression, `e2eFlow.RUNG_AUTONOMY`, `escalationSignals.RUNG_GATE`, and
 * `nistMap`'s oversight derivation. They disagreed at A0 — `flowSim` emitted `'watch'`, `e2eFlow`
 * emitted `'assist'` — and nobody noticed because nothing read the label back. Two defects hid inside
 * that, and both were reachable in the shipped demo:
 *
 * 1. GRAMMAR INFERRED, NOT DECLARED. The `version` field carries two grammars — `<autonomy>·<tier>`
 *    for an act, `GRANT·A{n}` / `REVOKE·A{n}` for an authority change — and the code told them apart
 *    by testing for a `·`, which BOTH contain. A revocation was therefore parsed as an act:
 *    `'REVOKE·A2'.split('·')[1]` yields `'A2'`, so the row was re-sealed `version: 'HITL·A2'` with
 *    `rung` rewritten to `A1`, while its own `decision` still read "Authority ceiling dropped A3→A2".
 * 2. THE EARNED CEILING WAS NOWHERE ON THE ROW. Nothing recorded what the fleet had earned when an
 *    act was sealed, so "what did your agents do above what they had earned?" had no answer.
 *
 * AND WHAT THE FIRST FIX GOT WRONG, which is why these cases look the way they do. That fix CLAMPED:
 * an agent act stated at A2 with nothing earned was re-sealed `A0 / assist·D2`, and — because
 * `deriveOversight` reads the rewritten rung — `oversight: 'watch'`. It prevented nothing (the act
 * had already run), and it manufactured the one row `flowSim.proposeOutbound` says can never exist:
 * "the ledger can never show an 'A0/A1 … EXECUTED' agent act." Adversarial review killed it. The
 * ledger now states the authority EXERCISED plus `earnedCeiling` and `overCeiling` as hashed facts.
 *
 * These cases are LITERAL pins and BEHAVIOURAL drives, never derived-vs-derivation: asserting
 * `effectiveAutonomy('A2') === EFFECTIVE_AUTONOMY_MAP.A2` would restate the implementation and pass
 * however wrong it got, and a source-grep for a call cannot tell whether the call is REACHED.
 */
import { describe, expect, it } from 'vitest';
import {
  PROCESS_GATE_OF,
  effectiveAutonomy,
  effectiveAutonomyForLevel,
  type EffectiveRung,
} from '@/lib/goldenThread/nistMap';
import { assessCeiling, ceilingLevel, rungLevel } from '@/lib/goldenThread/ceilingRecord';
import { assertSealGrammar } from '@/lib/goldenThread/ledgerSeal';
import {
  advance,
  createSim,
  ledgerIntact,
  revokeAuthority,
  spawn278,
  verifyEntry,
  type SimState,
} from '@/lib/goldenThread/flowSim';

const RUNGS: readonly EffectiveRung[] = ['A0', 'A1', 'A2', 'A3'];

describe('the single rung→autonomy map, pinned as literals', () => {
  it('A0 is assist — NOT watch, which is what flowSim used to emit and nothing read back', () => {
    expect(effectiveAutonomy('A0')).toBe('assist');
  });

  it('A1/A2/A3 are HITL/HOTL/autonomous', () => {
    expect(effectiveAutonomy('A1')).toBe('HITL');
    expect(effectiveAutonomy('A2')).toBe('HOTL');
    expect(effectiveAutonomy('A3')).toBe('autonomous');
  });

  it('the numeric form clamps out-of-range instead of throwing — a seal must not fail on a lookup', () => {
    expect(effectiveAutonomyForLevel(0)).toBe('assist');
    expect(effectiveAutonomyForLevel(3)).toBe('autonomous');
    expect(effectiveAutonomyForLevel(-4)).toBe('assist'); // floor, the SAFE end
    expect(effectiveAutonomyForLevel(99)).toBe('autonomous');
    expect(effectiveAutonomyForLevel(1.9)).toBe('HITL'); // truncated, never rounded UP
  });

  it('the wire token is the lowercased label and is frozen — it crosses an HTTP boundary', () => {
    expect(PROCESS_GATE_OF).toEqual({
      assist: 'assist',
      HITL: 'hitl',
      HOTL: 'hotl',
      autonomous: 'autonomous',
    });
    expect(Object.isFrozen(PROCESS_GATE_OF)).toBe(true);
  });
});

describe('rungLevel distinguishes a real rung from an unreadable token', () => {
  it('reads the ordinal out of a rung token', () => {
    expect(RUNGS.map(rungLevel)).toEqual([0, 1, 2, 3]);
  });

  it('returns -1 (UNPARSEABLE) for anything that is not exactly one rung — not 0, which is a real rung', () => {
    for (const junk of ['', 'autonomous', 'A9', 'A10', 'a2', ' A2', 'A2 ', 'A2+'])
      expect(rungLevel(junk)).toBe(-1);
  });

  it('a multi-number token is unreadable, not a concatenation — this was the live overstatement', () => {
    // The predecessor was `Number(rung.replace(/[^0-9]/g, '')) || 0`, which strips non-digits and
    // concatenates the survivors: 'A2·D2' became 22 and 'A2.5' became 25 — twenty-two rungs above
    // the top of a four-rung ladder, inside the one function whose job is to bound authority.
    expect(rungLevel('A2·D2')).toBe(-1);
    expect(rungLevel('A2.5')).toBe(-1);
  });

  it('ceilingLevel normalises an arbitrary number to a rung level', () => {
    expect([ceilingLevel(0), ceilingLevel(3)]).toEqual([0, 3]);
    expect(ceilingLevel(2.9)).toBe(2); // truncated, never rounded up
    expect(ceilingLevel(-1)).toBe(0);
    expect(ceilingLevel(99)).toBe(3);
    expect(ceilingLevel(Number.NaN)).toBe(0);
  });
});

describe('assessCeiling OBSERVES; it returns no rung and no version, so it cannot rewrite a record', () => {
  const act = { human: false, kind: 'act' as const, rung: 'A2', earnedCeiling: 0 };

  it('flags a non-human act above the earned ceiling, and reports the ceiling that applied', () => {
    expect(assessCeiling(act)).toEqual({ earnedCeiling: 0, overCeiling: true });
  });

  it('returns ONLY those two fields — a caller cannot use it to lower a rung', () => {
    // The structural guard against the defect this module replaced. `toEqual` on the whole object,
    // not a property check: a `rung` or `version` added back here fails immediately.
    expect(Object.keys(assessCeiling(act)).sort()).toEqual(['earnedCeiling', 'overCeiling']);
  });

  it('never flags an authority-change record, even though its version also contains a "·"', () => {
    // An authority change records what the ceiling BECAME; measuring it against that same ceiling is
    // circular, and inferring its grammar from the '·' is what corrupted REVOKE rows.
    expect(assessCeiling({ ...act, kind: 'authority-change' })).toEqual({
      earnedCeiling: 0,
      overCeiling: false,
    });
  });

  it('never flags a human act — a human is not governed by the earned autonomous ceiling', () => {
    expect(assessCeiling({ ...act, human: true }).overCeiling).toBe(false);
  });

  it('never flags detect-and-advise — an agent may always advise a human', () => {
    expect(assessCeiling({ ...act, rung: 'A1' }).overCeiling).toBe(false);
    expect(assessCeiling({ ...act, rung: 'A0' }).overCeiling).toBe(false);
  });

  it('does not flag an act the ceiling already permits', () => {
    expect(assessCeiling({ ...act, earnedCeiling: 3 })).toEqual({
      earnedCeiling: 3,
      overCeiling: false,
    });
    expect(assessCeiling({ ...act, earnedCeiling: 2 }).overCeiling).toBe(false); // exactly at it
  });

  it('flags an UNREADABLE rung — unprovable is not the same as within', () => {
    // The predecessor returned any rung outside A0–A3 untouched and unflagged, so a band label like
    // 'A2+' or a manifest-sourced token would have sailed past the one control watching for it.
    expect(assessCeiling({ ...act, rung: 'A2+', earnedCeiling: 3 }).overCeiling).toBe(true);
  });

  it('normalises a malformed ceiling instead of propagating it', () => {
    expect(assessCeiling({ ...act, earnedCeiling: 2.5 }).earnedCeiling).toBe(2);
    expect(assessCeiling({ ...act, earnedCeiling: -1 }).earnedCeiling).toBe(0);
  });
});

describe('the seal refuses a misdeclared grammar', () => {
  it('accepts an act version with no declaration', () => {
    expect(assertSealGrammar('HOTL·D2')).toBe('act');
  });

  it('THROWS on a GRANT/REVOKE version that did not declare itself an authority change', () => {
    // `kind` is optional, so "omitted means act" is itself an inference. This closes the one
    // direction that inference can be wrong, at the seal, rather than trusting 24 call sites.
    expect(() => assertSealGrammar('REVOKE·A2')).toThrow(/authority change/);
    expect(() => assertSealGrammar('GRANT·A3', 'act')).toThrow(/authority change/);
  });

  it('accepts it when declared', () => {
    expect(assertSealGrammar('REVOKE·A2', 'authority-change')).toBe('authority-change');
  });
});

describe('BEHAVIOURAL — the real simulation records over-ceiling acts truthfully', () => {
  /**
   * Drive a cold-start sim until a NEW agent-sealed payer-ops act lands.
   *
   * The `seq > before` filter is load-bearing: `createSim` warms the book with 620 `advance()` calls
   * and then spawns PAs, so `agent:payer-ops` rows already exist when it returns. A drive that
   * searched the whole ledger would exit on iteration 0 and read a warm-up row, while its own error
   * message claimed to have driven 400 ticks.
   */
  function driveToNewAgentAct(): { s: SimState; seq: number } {
    const s = createSim();
    expect(s.earnedCeiling).toBe(0); // cold start: maturity 0 → pilot band → nothing earned
    const before = s.ledgerSeq;
    spawn278(s);
    const fresh = (): boolean =>
      s.ledger.some((r) => r.seq > before && r.actor === 'agent:payer-ops');
    for (let i = 0; i < 400 && !fresh(); i += 1) advance(s);
    expect(fresh(), 'drive never reached a NEW agent:payer-ops seal — the path moved').toBe(true);
    return { s, seq: before };
  }

  it('records the rung the agent EXERCISED — not a rewritten one — and discloses the ceiling', () => {
    const { s, seq } = driveToNewAgentAct();
    const row = s.ledger.find((r) => r.seq > seq && r.actor === 'agent:payer-ops');
    expect(row).toBeDefined();
    // The payer UM sub-step runs at A2 with no human. It is recorded as A2, because it happened.
    expect(row?.rung).toBe('A2');
    expect(row?.version).toBe('HOTL·D2');
    expect(row?.earnedCeiling).toBe(0);
    expect(row?.overCeiling).toBe(true);
  });

  it('and its oversight stays HOTL — the clamp used to rewrite this to "watch", which was false', () => {
    // `deriveOversight` reads `rung`, so the clamp silently turned every over-ceiling agent act into
    // a NIST-tagged, hash-sealed claim that it had been watched. Nothing watched it.
    const { s, seq } = driveToNewAgentAct();
    const row = s.ledger.find((r) => r.seq > seq && r.actor === 'agent:payer-ops');
    expect(row?.oversight).toBe('HOTL');
  });

  it('a human-sealed act is never over-ceiling — the ceiling governs autonomous action only', () => {
    const { s } = driveToNewAgentAct();
    const humanRows = s.ledger.filter((r) => r.human);
    expect(humanRows.length).toBeGreaterThan(0);
    for (const row of humanRows) expect(row.overCeiling).toBe(false);
  });

  it('a REVOCATION keeps its own grammar through the seal — version, rung and decision agree', () => {
    const s = createSim();
    // Stand the fleet up at A3 so there is something to lose (revocation has a hysteresis floor),
    // while maturity stays 0 — so the ceiling in force is 1, BELOW the revoked-to rung. That is the
    // precise state in which the old '·' test rewrote a revocation into an act.
    s.earnedCeiling = 3;
    revokeAuthority(s, 'test: §1557 four-fifths breach');
    const row = s.ledger.at(-1);
    expect(row?.version).toBe('REVOKE·A2');
    expect(row?.rung).toBe('A2');
    expect(row?.overCeiling).toBe(false);
    expect(row?.decision).toContain('A3→A2');
    expect(row?.actor).toBe('auto:fail-closed');
  });
});

describe('the disclosure is INSIDE the hash, and the chain checks its own links', () => {
  const warm = (): SimState => createSim();

  it('editing overCeiling breaks the row’s verification', () => {
    const s = warm();
    const row = s.ledger.find((r) => r.overCeiling);
    expect(row, 'no over-ceiling row in a cold-start book').toBeDefined();
    expect(verifyEntry(s, row?.seq ?? -1)).toBe(true); // untouched, it verifies
    if (row) row.overCeiling = false;
    expect(verifyEntry(s, row?.seq ?? -1)).toBe(false);
  });

  it('editing earnedCeiling breaks it too — the disclosure is both fields, not one', () => {
    const s = warm();
    const row = s.ledger.find((r) => r.overCeiling);
    if (row) row.earnedCeiling = 3;
    expect(verifyEntry(s, row?.seq ?? -1)).toBe(false);
  });

  it('a clean ledger verifies end to end', () => {
    expect(ledgerIntact(warm())).toBe(true);
  });

  it('breaking a prevHash LINK is caught — ledgerIntact used to ignore every link but the first', () => {
    // It folded its own running hash and never compared `e.prevHash`, so this edit left it green
    // while `verifyEntry` on the same row went red. `prevHash` is a displayed field.
    const s = warm();
    s.ledger[5].prevHash = 0;
    expect(ledgerIntact(s)).toBe(false);
  });
});
