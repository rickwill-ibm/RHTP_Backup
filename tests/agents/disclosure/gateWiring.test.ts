/**
 * THE GATE'S OWN WIRING, under test.
 *
 * Three findings, one shape: a control that LOOKS decided and is not.
 *   F1 — the taxonomy class FLOOR was an optional dep, so the production
 *        composition root omitted it and every signal was classed `demographic`:
 *        NY MHL §33.13 and PHL Art 27-F material decided under the baseline HIPAA
 *        treatment/payment/operations basis, with no consent lookup at all.
 *   F8 — `purposeOfUse: capability?.purposeOfUse ?? 'care-coordination'` invented a
 *        field into the ledger, the artifact produced under subpoena.
 *   F9 — the dep wrapper caught and fell closed SILENTLY, so a consent-store
 *        outage was indistinguishable from "the member has no consent on file".
 *   F10 — refusals were reconciled against decisions by substring match on
 *        `requestId`, and any refusal that matched nothing was dropped.
 *
 * Split from `part2Dispatch.test.ts` at the 500-line test cap (conventions §2).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  assertNoUngatedPart2,
  decideDispatchDisclosure,
  requiresDisclosureGate,
  routeBatchGated,
  AgentRoutingError,
  type DisclosureGateDeps,
} from '@/lib/agents/dispatch';
import {
  createDisclosureLedger,
  type AgentCapability,
  type ConsentBasis,
} from '@/lib/agents/disclosure';
import { taxonomyClassFloor } from '@/lib/sde';
import type { Disposition, DispositionBatch, MemberContext, Signal } from '@/lib/sde';

const NOW = 1_700_000_000_000;
const MEMBER = 'MARIA_SD_001';
const OUTREACH = 'outreach-agent';

function sig(over: Partial<Signal> = {}): Signal {
  return {
    signalId: 's1',
    memberId: MEMBER,
    kind: 'care-gap.opened',
    sourceEventType: 'care-gap.opened',
    occurredAtMs: NOW,
    priority: 'high',
    actionability: 'member-outreach',
    foldBehavior: 'immediate',
    dedupeKey: 'k1',
    part2Restricted: false,
    refs: {},
    ...over,
  };
}

function batchFor(signals: Signal[]): DispositionBatch {
  const d = (s: Signal): Disposition => ({
    signalId: s.signalId,
    memberId: s.memberId,
    action: 'act',
    policyIds: ['r/1'],
    decidedAtMs: NOW,
    touchpointId: `tp:${s.signalId}`,
    channel: 'task',
    priorityScore: 5,
  });
  return {
    memberId: MEMBER,
    foldWindowId: 'fw',
    decidedAtMs: NOW,
    dispositions: signals.map(d),
    touchpoints: [],
    delayBundles: [],
    summary: { approved: signals.length, suppressed: 0, delayed: 0, touchpoints: 0 },
    fairnessDemotion: { staleFields: [], asOfMs: 0 },
  };
}

const ctx: MemberContext = { memberId: MEMBER };

/** The outreach agent as shipped: care-coordination, no Part 2 class declared. */
const SHIPPED_CAP: AgentCapability = {
  agentId: OUTREACH,
  purposeOfUse: 'care-coordination',
  dataClasses: ['demographic', 'social-need'],
};

/** A hypothetical agent that HAS been granted the Part 2 class by the lock. */
const PART2_CAP: AgentCapability = {
  agentId: OUTREACH,
  purposeOfUse: 'care-coordination',
  dataClasses: ['demographic', 'social-need', 'substance-use-disorder'],
};

function validBasis(over: Partial<ConsentBasis> = {}): ConsentBasis {
  return {
    basisId: 'consent/part2/1',
    subjectId: MEMBER,
    dataClasses: ['substance-use-disorder'],
    purposes: ['care-coordination'],
    recipientOrgIds: ['org/wpco-care-team'],
    effectiveFromMs: NOW - 86_400_000,
    ...over,
  };
}

function gate(cap: AgentCapability, bases: ConsentBasis[], nowMs = NOW): DisclosureGateDeps {
  return {
    classFloorFor: taxonomyClassFloor(),
    capabilities: new Map([[cap.agentId, cap]]),
    basesFor: () => bases,
    recipientFor: () => ({ orgId: 'org/wpco-care-team', kind: 'internal' }),
    ledger: createDisclosureLedger(),
    nowMs,
  };
}

describe('an ungoverned class is refused, never substituted with a benign one', () => {
  // THE F1 DEFECT, at the unit. An absent floor became `['demographic']`, which is
  // not in HEIGHTENED_BASIS_REQUIRED, so the plane permitted on the baseline HIPAA
  // TPO basis with NO consent lookup at all — for a record whose real regime might
  // be MHL §33.13 or PHL Art 27-F.
  const deps = (floor: readonly string[] | undefined): DisclosureGateDeps => ({
    ...gate(PART2_CAP, []),
    classFloorFor: () => floor,
  });

  it('a signal kind the taxonomy does not govern refuses loudly', () => {
    expect(() => decideDispatchDisclosure(sig(), OUTREACH, deps(undefined))).toThrowError(
      AgentRoutingError
    );
  });

  it('an EMPTY floor refuses too — totality by construction, not by comment', () => {
    // With an empty class set the loop never ran and the function returned
    // `undefined` typed as a decision; the caller then threw a TypeError reading
    // `.outcome` on a confidentiality path.
    expect(() => decideDispatchDisclosure(sig(), OUTREACH, deps([]))).toThrowError(
      /no data-class floor/
    );
  });

  it('a floor OUTSIDE the disclosure vocabulary refuses — a typo cannot downgrade a record', () => {
    // 'mental_health' matches no regime, so it would silently have been decided
    // under the baseline basis. The taxonomy parser cannot catch this (sde/ does
    // not import agents/), so the gate does.
    expect(() => decideDispatchDisclosure(sig(), OUTREACH, deps(['mental_health']))).toThrowError(
      /outside the disclosure vocabulary/
    );
  });

  it('an agent with NO declared capability is a wiring error, not a policy outcome', () => {
    // The purpose of use IS the agent's declared purpose, so with no declaration
    // there is nothing to record — and `purposeOfUse: … ?? 'care-coordination'`
    // invented one into the ledger, the artifact produced under subpoena.
    const noCaps: DisclosureGateDeps = { ...gate(PART2_CAP, []), capabilities: new Map() };
    expect(() => decideDispatchDisclosure(sig(), OUTREACH, noCaps)).toThrowError(
      /no declared data capability/
    );
  });
});

/**
 * An agent granted the Part 2 class but NOT hiv. A floor carrying both therefore
 * produces TWO denials with DIFFERENT reason codes — the fixture that did not exist
 * anywhere, and without which `firstDenial ??= decision` and `firstDenial =
 * decision` are indistinguishable.
 */
const SUD_NOT_HIV_CAP: AgentCapability = {
  agentId: OUTREACH,
  purposeOfUse: 'care-coordination',
  dataClasses: ['demographic', 'social-need', 'substance-use-disorder'],
};

describe('two denials with different reasons: the FIRST by class order is returned', () => {
  /** The gate with an explicit, ORDERED class floor and no consent on file. */
  const withFloor = (floor: readonly string[]): DisclosureGateDeps => ({
    ...gate(SUD_NOT_HIV_CAP, []),
    classFloorFor: () => floor,
  });

  /** Sorted: hiv < substance-use-disorder. Each denies for its own reason. */
  const HIV_FIRST = ['hiv', 'substance-use-disorder'];
  const SUD_FIRST = ['substance-use-disorder', 'hiv'];

  it('returns the sorted-FIRST denial, not whichever denial was written last', () => {
    // 42 CFR 2.20 makes the stricter rule controlling, so both regimes are decided —
    // but the caller surfaces ONE reason, and which one it is must be determined by
    // the class order, not by loop position. `firstDenial ??= decision` keeps the
    // first; a plain `=` keeps the last. No fixture produced two denials with
    // different reasons, so both spellings passed: the two classes here deny under
    // DIFFERENT codes (Art 27-F: the agent never declared hiv; Part 2: no basis on
    // file), which is what makes the two spellings observably different.
    const deps = withFloor(HIV_FIRST);
    const d = decideDispatchDisclosure(sig(), OUTREACH, deps);
    expect(d.outcome).toBe('deny');
    expect(d.dataClass).toBe('hiv');
    expect(d.reason).toBe('agent-class-not-declared');
    expect(d.legalBasis).toContain('Article 27-F');
    // The LAST denial is the Part 2 one; it must not be what the caller surfaced.
    expect(d.reason).not.toBe('no-basis-on-file');
    expect(d.dataClass).not.toBe('substance-use-disorder');
    // ...and BOTH regimes were still decided and recorded: returning the first
    // denial is about what the CALLER sees, never about stopping the evaluation.
    const rows = deps.ledger.all();
    expect(rows.map((r) => r.dataClass)).toEqual(['hiv', 'substance-use-disorder']);
    expect(rows.every((r) => r.outcome === 'deny')).toBe(true);
    expect(rows.map((r) => r.reason)).toEqual(['agent-class-not-declared', 'no-basis-on-file']);
  });

  it('class order comes from the SORT, so a reversed floor decides identically (L3)', () => {
    // ORDER-INDEPENDENCE. The floor is JSON-sourced, so its array order is an
    // editorial accident; `[...classes].sort()` is what makes the surfaced regime a
    // property of the data rather than of the file. `.reverse()` is order-PRESERVING
    // in exactly the wrong way: it reads as a deliberate ordering and is none.
    const forward = decideDispatchDisclosure(sig(), OUTREACH, withFloor(HIV_FIRST));
    const reversed = decideDispatchDisclosure(sig(), OUTREACH, withFloor(SUD_FIRST));
    expect(reversed).toEqual(forward);
    // Absolute, not merely equal: both orders must land on the SORTED-first class.
    expect(forward.dataClass).toBe('hiv');
    expect(reversed.dataClass).toBe('hiv');
    // And the full recorded sequence is the sorted one, whichever order arrived.
    const ledgerFor = (floor: readonly string[]): readonly string[] => {
      const deps = withFloor(floor);
      decideDispatchDisclosure(sig(), OUTREACH, deps);
      return deps.ledger.all().map((r) => r.dataClass);
    };
    expect(ledgerFor(SUD_FIRST)).toEqual(ledgerFor(HIV_FIRST));
    expect(ledgerFor(SUD_FIRST)).toEqual(['hiv', 'substance-use-disorder']);
  });
});

describe('a floor MIXING a heightened class with a benign one still needs the gate', () => {
  // Every fixture in the suite had a floor that was ENTIRELY heightened or
  // ENTIRELY benign, and on those `some` and `every` agree. A mixed floor is the
  // realistic case — `bh.screening.indicated` gains a `demographic` class the day
  // the taxonomy records who the screen was about — and it is the only shape that
  // tells "ANY class is heightened" apart from "ALL classes are".
  const MIXED = ['demographic', 'mental-health'];
  const mixedFloor = (): readonly string[] => MIXED;
  const benignFloor = (): readonly string[] => ['demographic'];

  it('ANY heightened class requires the gate, not only an all-heightened floor', () => {
    expect(requiresDisclosureGate(sig(), mixedFloor)).toBe(true);
    // Not vacuous: an entirely benign floor genuinely does not require the gate,
    // so the assertion above is discriminating rather than always-true.
    expect(requiresDisclosureGate(sig(), benignFloor)).toBe(false);
  });

  it('and the fail-closed check refuses an ungated batch carrying that floor', () => {
    const s = sig();
    const check = (floor: () => readonly string[]): void =>
      assertNoUngatedPart2({
        batch: batchFor([s]),
        memberContext: ctx,
        signals: [s],
        classFloorFor: floor,
      });
    expect(() => check(mixedFloor)).toThrowError(/requiring a specific written/);
    expect(() => check(benignFloor)).not.toThrow();
  });
});

describe('a dep that throws fails closed AND says so', () => {
  it('logs a structured event naming the dep and the signal, then denies', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const deps: DisclosureGateDeps = {
        ...gate(PART2_CAP, []),
        basesFor: () => {
          throw new Error('consent store unreachable');
        },
      };
      const d = decideDispatchDisclosure(sig({ part2Restricted: true }), OUTREACH, deps);
      // Still fail-closed: an outage is not a permit.
      expect(d.outcome).toBe('deny');
      // ...and no longer SILENT: an outage that looks like "no consent on file" is
      // an outage nobody pages for.
      const emitted = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(emitted).toContain('disclosure.gate.dep-unavailable');
      expect(emitted).toContain('basesFor');
      expect(emitted).toContain('s1');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('a dep that returns NOTHING fails closed exactly as a dep that throws (L8)', () => {
  // THE OTHER HALF OF `safeDep`. Every fail-closed test made a dep THROW, so the
  // wrapper`s `v === undefined || v === null` arm was unexercised: a seam that
  // answers `null` instead of raising — a cache miss, a JSON `null`, an unwired
  // stub returning nothing — is the commoner production shape of the same outage,
  // and it reached the decision plane as a value rather than as a fallback.
  const PART2_SIG = sig({ part2Restricted: true });

  /** A capability map whose lookup answers `value` for every agent id. */
  const capsAnswering = (value: unknown): ReadonlyMap<string, AgentCapability> =>
    ({ get: () => value }) as unknown as ReadonlyMap<string, AgentCapability>;

  /** The four deps, each degraded to answer `value` instead of raising. */
  const degraded: Record<string, (value: unknown) => DisclosureGateDeps> = {
    capabilities: (v) => ({ ...gate(PART2_CAP, [validBasis()]), capabilities: capsAnswering(v) }),
    classFloorFor: (v) => ({
      ...gate(PART2_CAP, [validBasis()]),
      classFloorFor: () => v as readonly string[],
    }),
    basesFor: (v) => ({
      ...gate(PART2_CAP, [validBasis()]),
      basesFor: () => v as readonly ConsentBasis[],
    }),
    recipientFor: (v) => ({
      ...gate(PART2_CAP, [validBasis()]),
      recipientFor: () => v as ReturnType<DisclosureGateDeps['recipientFor']>,
    }),
  };

  /** The same dep, raising instead — the outcome every case below must match. */
  const raising: Record<string, () => DisclosureGateDeps> = {
    capabilities: () => ({
      ...gate(PART2_CAP, [validBasis()]),
      capabilities: {
        get: () => {
          throw new Error('manifest registry unavailable');
        },
      } as unknown as ReadonlyMap<string, AgentCapability>,
    }),
    classFloorFor: () => ({
      ...gate(PART2_CAP, [validBasis()]),
      classFloorFor: () => {
        throw new Error('taxonomy unavailable');
      },
    }),
    basesFor: () => ({
      ...gate(PART2_CAP, [validBasis()]),
      basesFor: () => {
        throw new Error('consent store unreachable');
      },
    }),
    recipientFor: () => ({
      ...gate(PART2_CAP, [validBasis()]),
      recipientFor: () => {
        throw new Error('directory unreachable');
      },
    }),
  };

  /**
   * The outcome as a comparable value: a coded refusal, or the decision`s regime,
   * reason and recipient. Comparing this against the THROWING case is the actual
   * assertion — "same fail-closed outcome", not merely "did not permit".
   */
  function outcomeOf(deps: DisclosureGateDeps): string {
    try {
      const d = decideDispatchDisclosure(PART2_SIG, OUTREACH, deps);
      return `${d.outcome}:${d.reason ?? '-'}:${d.dataClass}:${d.recipientOrgId}`;
    } catch (err) {
      if (err instanceof AgentRoutingError) return `refused:${err.field}`;
      // Anything else escaping is the defect: an unrecorded throw on a
      // confidentiality path, which is exactly what the null arm prevents.
      return `THREW:${err instanceof Error ? err.name : 'unknown'}`;
    }
  }

  for (const dep of ['capabilities', 'classFloorFor', 'basesFor', 'recipientFor']) {
    for (const value of [null, undefined]) {
      it(`${dep} answering ${String(value)} lands where ${dep} throwing lands`, () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
          const got = outcomeOf(degraded[dep](value));
          expect(got).toBe(outcomeOf(raising[dep]()));
          // Never a permit, and never an uncaught throw out of the plane.
          expect(got.startsWith('permit')).toBe(false);
          expect(got.startsWith('THREW')).toBe(false);
        } finally {
          spy.mockRestore();
        }
      });
    }
  }

  it('an unresolvable recipient is NAMED in the record, never left absent', () => {
    // The specific consequence the null arm carries: with no fallback the recipient
    // reaches the decision as nothing at all, and `recipientOrgId` — the field a
    // reviewer reads to see the lookup failed — cannot be written.
    const d = decideDispatchDisclosure(PART2_SIG, OUTREACH, degraded.recipientFor(null));
    expect(d.outcome).toBe('deny');
    // THE load-bearing field. `UNKNOWN_RECIPIENT` is named rather than empty so the
    // failed lookup appears in the record a reviewer reads; with no fallback the
    // recipient reaches `deny()` as nothing at all and this field cannot be written.
    expect(d.recipientOrgId).toBe('org/unresolved');
    // The denial names the RECIPIENT as the gap. Matched as a shape, not as one
    // code: which recipient code applies is `decide.ts` vocabulary, and pinning the
    // exact string here would couple this gate test to that module`s evolution.
    expect(d.reason).toMatch(/recipient/);
  });
});

describe('a refusal is bound to ITS OWN signal, and never dropped', () => {
  /** One touchpoint bundling both signals, in the given intent order. */
  function bundled(order: Signal[], all: Signal[]): DispositionBatch {
    const b = batchFor(all);
    return {
      ...b,
      touchpoints: [
        {
          touchpointId: 'tp:bundle',
          memberId: MEMBER,
          channel: 'portal',
          intents: order.map((s) => ({
            signalId: s.signalId,
            kind: s.kind,
            priorityScore: 5,
            channel: 'portal' as const,
          })),
        },
      ],
    };
  }

  it('does not bind sig-1 to sig-10 by substring — the ids are matched exactly', () => {
    // THE F10 DEFECT. Refusals were reconciled against decisions by
    // `requestId.includes(signalId)`, and `requestId` is
    // `dispatch:${signalId}:${dataClass}:${agentId}` — so 'sig-1' matched
    // 'dispatch:sig-10:demographic:outreach-agent'. With sig-10 PERMITTED first
    // and sig-1 REFUSED second, the refusal for sig-1 was recorded carrying
    // sig-10's PERMIT: a denial filed as an allowance, for the wrong signal.
    const permitted = sig({ signalId: 'sig-10', consentScope: 'care-outreach' });
    const refused = sig({
      signalId: 'sig-1',
      part2Restricted: true,
      consentScope: 'care-outreach',
    });
    const all = [permitted, refused];
    const r = routeBatchGated({
      batch: bundled([permitted, refused], all),
      memberContext: ctx,
      signals: all,
      disclosure: gate(SHIPPED_CAP, [validBasis()]),
    });
    const refusal = r.refusals.find((x) => x.signalId === 'sig-1');
    expect(refusal).toBeDefined();
    expect(refusal?.reason).toBe('disclosure-denied');
    expect(refusal?.decision?.outcome).toBe('deny');
    expect(refusal?.decision?.dataClass).toBe('substance-use-disorder');
    // The decision the refusal carries belongs to sig-1 and to nothing else.
    expect(refusal?.decision?.requestId).toContain(':sig-1:');
    expect(refusal?.decision?.requestId).not.toContain('sig-10');
    // sig-10 was permitted, so it is not a refusal at all.
    expect(r.refusals.some((x) => x.signalId === 'sig-10')).toBe(false);
  });

  it('surfaces an intent whose signal is unreadable instead of dropping it', () => {
    // `if (d) refusals.push(...)` dropped any refusal with no matching decision,
    // so an undecidable intent vanished and the caller could never surface it.
    const present = sig({ signalId: 'sig-a', consentScope: 'care-outreach' });
    const ghost = sig({ signalId: 'sig-ghost' });
    const r = routeBatchGated({
      batch: bundled([present, ghost], [present]),
      memberContext: ctx,
      signals: [present],
      disclosure: gate(SHIPPED_CAP, []),
    });
    const refusal = r.refusals.find((x) => x.signalId === 'sig-ghost');
    expect(refusal).toBeDefined();
    expect(refusal?.reason).toBe('signal-unreadable');
    expect(refusal?.decision).toBeUndefined();
  });

  it('refuses the touchpoint when the surviving opener names NO consent scope', () => {
    // THE F2 DEFECT at dispatch. `consentScope: survivor.consentScope ?? ''` fed
    // an empty scope to a consent gate that read empty as a grant and returned
    // before consulting the opt-out store — so an opted-out member was contacted.
    const unscoped = sig({ signalId: 'sig-noscope' });
    const r = routeBatchGated({
      batch: bundled([unscoped], [unscoped]),
      memberContext: ctx,
      signals: [unscoped],
      disclosure: gate(SHIPPED_CAP, []),
    });
    expect(r.tasks).toEqual([]);
    expect(r.refusals.map((x) => x.reason)).toContain('consent-scope-absent');
  });
});
