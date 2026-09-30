/**
 * 45 CFR 92.210 — IDENTIFICATION BY CONSTRUCTION (C-FAIRNESS).
 *
 * THE RULE, verbatim: "(b) A covered entity has an ongoing duty to make reasonable efforts to
 * identify uses of patient care decision support tools ... that employ INPUT VARIABLES OR FACTORS
 * THAT MEASURE race, color, national origin, sex, age, or disability." And (c), a mitigation for
 * each tool so identified.
 *
 * WHAT THESE CASES ARE REALLY PINNING. The first design of this wave declared `protectedInputs` on
 * each agent, keyed on the six bases. That records only fields literally NAMED after a protected
 * class, and "or factors that measure" is the clause that carries proxies into scope. Adversarial
 * review found five live proxies in this codebase, every one of which an author would have declared
 * as `[]` — `channelPreference` (disability/age/LEP, and it SELECTS the channel, which then delays
 * the touchpoint), `recentEdWithinHours` (the canonical utilization proxy), `Signal.measure` (quality
 * measure ids are sex- and age-bounded by construction, hiding behind a field its own comment calls
 * PHI-safe), `contactHistory` (housing stability) and the behavioural-health consent scope.
 *
 * So the test that matters is not "does the lock parse". It is: CAN A NEW INPUT REACH A MEMBER
 * DECISION WITHOUT ANYONE SAYING WHAT IT MEASURES? These cases say no.
 *
 * And what the record does NOT claim: OCR declined to mandate documentation. This is evidence of
 * reasonable efforts, not a thing the rule requires, and a green suite is not a compliance finding.
 */
import { describe, expect, it, vi } from 'vitest';
import * as fairness from '@/lib/fairness';
import { disposeBatch } from '@/lib/sde/engine/dispositionEngine';
import { defaultPolicyPack } from '@/lib/sde/policy/policyStore';
import { loadDemoBatch } from '@/lib/sde';
import { createMemoryAuditSink } from '@/lib/sde/audit';

/** The engine's real dependency shape — an injected clock, an audit sink and a consent oracle. */
const engineDeps = (nowMs: number) => ({
  now: () => nowMs,
  audit: createMemoryAuditSink(),
  consentGranted: () => true,
  actor: 'fairness-test',
});
import {
  assertEntryComplete,
  assertFieldsIdentified,
  ENGINE_READ_FIELDS,
  FairnessLockError,
  loadFairnessLock,
  mitigationCurrency,
  MITIGATION_REVIEW_INTERVAL_MS,
  parseFairnessLock,
  PROTECTED_BASES,
  type FairnessLockEntry,
} from '@/lib/fairness';
import {
  assertEngineInputsIdentified,
  resetFairnessGuardForTest,
  staleMitigations,
} from '@/lib/sde/engine/fairnessGuard';

const lock = loadFairnessLock();
const entry = (field: string): FairnessLockEntry =>
  lock.entries.find((e) => e.field === field) as FairnessLockEntry;

const ok = (over: Partial<FairnessLockEntry> = {}): FairnessLockEntry =>
  ({
    field: 'X.y',
    toolScope: 'clinical-decision-support',
    measures: ['age'],
    directness: 'proxy',
    basis: 'a basis long enough to be a real sentence a reviewer can read',
    mitigation: {
      measure: 'something that was actually done, stated at length',
      reviewedBy: 'role:section-1557-coordinator',
      reviewedAtMs: 1,
      evidenceRef: 'docs/x.md',
    },
    ...over,
  }) as FairnessLockEntry;

describe('the shipped lock is complete and internally consistent', () => {
  it('parses, and every entry passes the completeness rules', () => {
    expect(() => parseFairnessLock(lock, 'shipped')).not.toThrow();
    expect(lock.entries.length).toBeGreaterThan(0);
  });

  it('covers every field the engine reads, with no orphans', () => {
    expect(() => assertFieldsIdentified(ENGINE_READ_FIELDS, lock)).not.toThrow();
  });

  it('identifies the five PROXIES that a per-agent declaration would have missed', () => {
    // The whole reason the design was re-pointed from the agent to the field. Each of these would
    // have been declared `protectedInputs: []` by an honest author who simply did not think of a
    // channel preference as a disability measure.
    for (const [field, basis] of [
      ['MemberContext.channelPreference', 'disability'],
      ['MemberContext.recentEdWithinHours', 'race'],
      ['MemberContext.contactHistory', 'disability'],
      ['MemberContext.consentScopesGranted', 'disability'],
      ['PolicyPack.smsWindow', 'disability'],
    ] as const) {
      const e = entry(field);
      expect(e, `${field} is unidentified`).toBeDefined();
      expect(e.directness).toBe('proxy');
      expect(e.measures).toContain(basis);
      expect(e.mitigation).toBeDefined();
    }
  });

  it('identifies Signal.measure as a DIRECT sex/age input, not a proxy', () => {
    // Quality measure ids are sex- and age-defined by construction (breast: female 50-74; cervical:
    // female 21-64; childhood immunization: paediatric). It is a direct protected input wearing a
    // code, in a field whose own comment calls it PHI-safe — which is why it read as harmless.
    const e = entry('Signal.measure');
    expect(e.directness).toBe('direct');
    expect([...e.measures].sort()).toEqual(['age', 'sex']);
  });

  it('every in-scope entry carries a mitigation; every excluded one carries a stated basis', () => {
    for (const e of lock.entries) {
      if (e.toolScope === 'administrative-excluded') {
        expect(e.exclusionBasis, `${e.field}`).toBeTruthy();
        expect(e.measures).toHaveLength(0);
      } else {
        expect(e.mitigation, `${e.field}`).toBeDefined();
        expect(e.measures.length, `${e.field}`).toBeGreaterThan(0);
      }
    }
  });

  it('uses only the six bases 92.210(b) names — a pack may not invent a seventh', () => {
    for (const e of lock.entries) for (const m of e.measures) expect(PROTECTED_BASES).toContain(m);
  });
});

describe('UNLISTED FIELD = REFUSE — identification by construction, not by assertion', () => {
  it('REFUSES a field the engine reads that has no reviewed entry', () => {
    // The assertion the whole design rests on. A declaration-based design asks an author which of
    // their inputs measure a protected characteristic and takes `[]` for an answer; this refuses to
    // let the input reach a member decision until someone has written down what it measures.
    expect(() =>
      assertFieldsIdentified([...ENGINE_READ_FIELDS, 'MemberContext.preferredLanguage'], lock)
    ).toThrow(FairnessLockError);
    expect(() =>
      assertFieldsIdentified([...ENGINE_READ_FIELDS, 'MemberContext.preferredLanguage'], lock)
    ).toThrow(/NO reviewed fairness entry/);
  });

  it('REFUSES an orphan entry — a review nobody is doing, in a file that looks complete', () => {
    expect(() => assertFieldsIdentified(ENGINE_READ_FIELDS.slice(1), lock)).toThrow(/orphan/);
  });
});

describe('a claim of being out of scope costs the same review as a mitigation', () => {
  it('REFUSES administrative-excluded with no stated basis', () => {
    // Without this, every field is declared administrative and the artifact is an empty form. The
    // symmetry is the only thing that makes the identification an EFFORT.
    expect(() =>
      assertEntryComplete(
        ok({ toolScope: 'administrative-excluded', measures: [], mitigation: undefined })
      )
    ).toThrow(/exclusionBasis/);
  });

  it('REFUSES a field claimed excluded that also declares it measures something', () => {
    expect(() =>
      assertEntryComplete(
        ok({
          toolScope: 'administrative-excluded',
          exclusionBasis: 'a stated basis long enough to be real',
          measures: ['age'],
          mitigation: undefined,
        })
      )
    ).toThrow(/cannot both be true/);
  });

  it('REFUSES an in-scope entry with no mitigation — 92.210(c)', () => {
    expect(() => assertEntryComplete(ok({ mitigation: undefined }))).toThrow(/92.210\(c\)/);
  });

  it('REFUSES an in-scope entry that measures nothing — a row asserting no duty', () => {
    expect(() => assertEntryComplete(ok({ measures: [] }))).toThrow(/measures nothing/);
  });

  it('REFUSES a mitigation with no accountable reviewer or no date', () => {
    expect(() =>
      assertEntryComplete(ok({ mitigation: { ...ok().mitigation!, reviewedBy: '' } }))
    ).toThrow(/accountable reviewer/);
    expect(() =>
      assertEntryComplete(ok({ mitigation: { ...ok().mitigation!, reviewedAtMs: 0 } }))
    ).toThrow(/review date/);
  });
});

describe('a mitigation may not cite the SIMULATED fairness screen', () => {
  it('REFUSES an evidenceRef pointing at flowSim.runFairnessScreen', () => {
    // That ratio is synthesised from `0.86 - denyRate * 1.2` plus a seeded variance term, and its
    // own header says the cohort split is modeled rather than from real member data. Citing it would
    // make a modelled number the evidence for a regulatory claim — the one move in this wave that
    // converts a demo shortcut into a false compliance assertion.
    expect(() =>
      assertEntryComplete(
        ok({
          mitigation: {
            ...ok().mitigation!,
            evidenceRef: 'src/lib/goldenThread/flowSim.ts#runFairnessScreen',
          },
        })
      )
    ).toThrow(/SIMULATED fairness screen/);
  });

  it('and no shipped entry cites it', () => {
    for (const e of lock.entries)
      expect(e.mitigation?.evidenceRef ?? '').not.toMatch(/flowSim|runFairnessScreen/i);
  });
});

describe('currency is evaluated AS-AT, and its failure mode is demotion — never process death', () => {
  it('a fresh review is current; a year-old one is not', () => {
    const e = entry('MemberContext.channelPreference');
    const reviewedAt = e.mitigation!.reviewedAtMs;
    expect(mitigationCurrency(e, reviewedAt + 1000).current).toBe(true);
    expect(mitigationCurrency(e, reviewedAt + MITIGATION_REVIEW_INTERVAL_MS + 1).current).toBe(
      false
    );
  });

  it('RETURNS rather than throws — the caller demotes, it does not brick', () => {
    // Refusing to load on a stale review would stop the platform on a calendar date, which is the
    // bug this programme already had to fix once in the credentialing seed. "Ongoing duty" is
    // satisfied by a live cadence with an escalation on breach, not by a binary.
    const e = entry('MemberContext.channelPreference');
    expect(() => mitigationCurrency(e, Number.MAX_SAFE_INTEGER)).not.toThrow();
    expect(mitigationCurrency(e, Number.MAX_SAFE_INTEGER).current).toBe(false);
  });

  it('PRESENCE, by contrast, is a property of the repo and cannot go stale', () => {
    // Which is why presence is the half that fails closed at load: it can never brick the platform
    // on a date, because no date is involved.
    expect(() => assertFieldsIdentified(ENGINE_READ_FIELDS, lock)).not.toThrow();
  });
});

describe('the member is not forgotten', () => {
  it('the mitigations a member can be affected by carry a member-facing reason', () => {
    // §1557's remedy structure is complaint-driven, so a purely regulator-facing artifact produces
    // no member-side effect at all. These are the inputs whose mitigation changes what a member
    // experiences — a delayed message, a split message — so these are the ones that owe an
    // explanation at 438.10 reading level.
    for (const field of ['MemberContext.channelPreference', 'PolicyPack.bundling']) {
      expect(entry(field).mitigation?.memberFacingReason, field).toBeTruthy();
    }
  });
});

describe('THE BIND — the disposition engine refuses to run over an unidentified input', () => {
  it('disposeBatch REFUSES to fold when an engine input is unidentified', () => {
    // THE TEST THIS REPLACED CALLED THE GUARD DIRECTLY and never mentioned `disposeBatch`. Deleting
    // the call from the engine left it green — the declared-and-unbound failure, reproduced inside
    // the test written to refute it. And it was `.not.toThrow()` over two frozen constants, so it
    // could not fail for any reason at all.
    //
    // This drives the ENGINE with a lock that does not cover the fields, and asserts the fold
    // refuses. Delete `assertEngineInputsIdentified()` from `dispositionEngine.ts` and this goes red.
    resetFairnessGuardForTest();
    const demo = loadDemoBatch();
    vi.spyOn(fairness, 'assertFieldsIdentified').mockImplementation(() => {
      throw new FairnessLockError('MemberContext.unreviewed', 'no reviewed fairness entry');
    });
    try {
      expect(() =>
        disposeBatch(demo.signals, defaultPolicyPack(), demo.memberContext, engineDeps(demo.nowMs))
      ).toThrow(/no reviewed fairness entry/);
    } finally {
      vi.restoreAllMocks();
      resetFairnessGuardForTest();
    }
  });

  it('and folds normally when they ARE identified — the guard is not refusing everything', () => {
    resetFairnessGuardForTest();
    const demo = loadDemoBatch();
    expect(() =>
      disposeBatch(demo.signals, defaultPolicyPack(), demo.memberContext, engineDeps(demo.nowMs))
    ).not.toThrow();
  });

  it('a stale mitigation is REPORTED, not thrown — the remedy is demotion, never process death', () => {
    // Refusing to run on a stale review would stop the platform on a calendar date, which is the bug
    // this programme already had to fix once. Ongoing duty is a cadence with an escalation, not a
    // binary, and it is certainly not violated by declining to brick.
    const farFuture = Date.UTC(2099, 0, 1);
    const stale = staleMitigations(farFuture);
    expect(stale.length).toBeGreaterThan(0);
    for (const e of stale) expect(e.toolScope).not.toBe('administrative-excluded');
    // And today nothing is stale, so the report is not vacuously full.
    expect(
      staleMitigations(entry('MemberContext.channelPreference').mitigation!.reviewedAtMs)
    ).toEqual([]);
  });
});

describe('the ongoing duty is BOUND — a stale review demotes the fold', () => {
  it('a healthy fold reports an empty demotion, not an absent one', () => {
    // `staleMitigations` was exported, tested, and called by NOTHING on a real path — the ongoing-duty
    // half of 92.210(b) returning a list into the void, in the same wave that documents that failure
    // class. It is now read by `disposeBatch` and surfaced on every batch.
    resetFairnessGuardForTest();
    const demo = loadDemoBatch();
    const batch = disposeBatch(
      demo.signals,
      defaultPolicyPack(),
      demo.memberContext,
      engineDeps(demo.nowMs)
    );
    expect(batch.fairnessDemotion.staleFields).toEqual([]);
    expect(batch.fairnessDemotion.asOfMs).toBe(demo.nowMs);
  });

  it('a fold far in the future reports EVERY lapsed input, and still folds', () => {
    // Demotion, not refusal: the batch is still produced, and the caller routes it through the human
    // gate. Failing closed here would stop the platform on a calendar date.
    resetFairnessGuardForTest();
    const demo = loadDemoBatch();
    const far = Date.UTC(2099, 0, 1);
    const batch = disposeBatch(
      demo.signals,
      defaultPolicyPack(),
      demo.memberContext,
      engineDeps(far)
    );
    expect(batch.fairnessDemotion.staleFields.length).toBeGreaterThan(0);
    expect(batch.dispositions.length).toBeGreaterThan(0); // it folded anyway
  });

  it('review dates are STAGGERED — the record cannot go stale on a single day', () => {
    // Every entry originally carried 2026-06-01, so the whole record would have lapsed on
    // 2027-06-01 and, once the demotion above was wired, demoted 100% of decision paths in one
    // step. That is the single-epoch cliff this programme already fixed in the credentialing seed,
    // reproduced here on the same date and hidden only because nothing read the result.
    const dates = new Set(
      lock.entries.filter((e) => e.mitigation).map((e) => e.mitigation!.reviewedAtMs)
    );
    expect(dates.size).toBeGreaterThan(5);
  });
});
