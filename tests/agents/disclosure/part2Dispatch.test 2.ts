/**
 * 42 CFR PART 2, BINDING AT DISPATCH.
 *
 * `Signal.part2Restricted` is set at intake, carried through the pipeline,
 * labelled `42-CFR-Part-2` in the graph mapping, and validated as a required
 * boolean on the outbox envelope — and then `routeBatch` routed on
 * `actionability` and `kindPrefix` and never read it. The flag survived the
 * whole pipeline and was dropped at the one point where it decides whether a
 * substance-use-disorder signal reaches an agent.
 *
 * Routing a signal to an agent IS a disclosure. These tests pin that the
 * decision is made per event against the MEMBER's consent, not against a field
 * on the agent — and that a refusal is recorded and visible.
 */
import { describe, expect, it } from 'vitest';
import {
  assertNoUngatedPart2,
  routeBatchGated,
  AgentRoutingError,
  type DisclosureGateDeps,
} from '@/lib/agents/dispatch';
import {
  createDisclosureLedger,
  decideDisclosure,
  type AgentCapability,
  type ConsentBasis,
  type DisclosureDecision,
  type DisclosureRequest,
  type Obligation,
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
    // A member-outreach signal names the purpose it would contact the member for.
    // Without it the touchpoint is refused `consent-scope-absent` at dispatch —
    // a fixture with no scope was quietly relying on `consentScope ?? ''`.
    consentScope: 'care-outreach',
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
    touchpoints: signals.map((s) => ({
      touchpointId: `tp:${s.signalId}`,
      memberId: s.memberId,
      channel: 'task',
      intents: [{ signalId: s.signalId, kind: s.kind, priorityScore: 5, channel: 'task' }],
    })),
    delayBundles: [],
    summary: { approved: signals.length, suppressed: 0, delayed: 0, touchpoints: signals.length },
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

/**
 * A request built directly, for the cases that pin `decideDisclosure`'s OWN
 * invariant — "every path returns a decision; nothing throws to mean no". Routing
 * these through the gate would exercise the gate's `safeDep` wrapper instead, and
 * it is the decision that makes the claim, so it is the decision that is asked.
 */
function request(over: Partial<DisclosureRequest> = {}): DisclosureRequest {
  return {
    requestId: 'req-1',
    subjectId: MEMBER,
    dataClass: 'substance-use-disorder',
    purposeOfUse: 'care-coordination',
    requestingAgentId: OUTREACH,
    recipient: { orgId: 'org/wpco-care-team', kind: 'internal' },
    asOfMs: NOW,
    ...over,
  };
}

function gate(cap: AgentCapability, bases: ConsentBasis[], nowMs = NOW): DisclosureGateDeps {
  return {
    // The SHIPPED taxonomy floor, not a lambda: a fixture that composes the gate
    // differently from the production root is how the production root's missing
    // floor stayed invisible for a whole review cycle.
    classFloorFor: taxonomyClassFloor(),
    capabilities: new Map([[cap.agentId, cap]]),
    basesFor: () => bases,
    recipientFor: () => ({ orgId: 'org/wpco-care-team', kind: 'internal' }),
    ledger: createDisclosureLedger(),
    nowMs,
  };
}

describe('a Part 2 signal cannot reach an agent that was never granted the class', () => {
  it('routes an ordinary signal to the outreach agent', () => {
    const signals = [sig()];
    const r = routeBatchGated({
      batch: batchFor(signals),
      memberContext: ctx,
      signals,
      disclosure: gate(SHIPPED_CAP, []),
    });
    expect(r.tasks.map((t) => t.agentId)).toEqual([OUTREACH]);
    expect(r.refusals).toEqual([]);
  });

  it('REFUSES the same signal when it is Part 2 restricted', () => {
    const signals = [sig({ part2Restricted: true })];
    const r = routeBatchGated({
      batch: batchFor(signals),
      memberContext: ctx,
      signals,
      disclosure: gate(SHIPPED_CAP, [validBasis()]),
    });
    expect(r.tasks).toEqual([]);
    expect(r.refusals).toHaveLength(1);
    // Refused on the AGENT's declaration, before the member's consent is read.
    expect(r.refusals[0]?.decision?.reason).toBe('agent-class-not-declared');
  });

  it('records the refusal with the regime it was refused under', () => {
    const signals = [sig({ part2Restricted: true })];
    const deps = gate(SHIPPED_CAP, [validBasis()]);
    routeBatchGated({ batch: batchFor(signals), memberContext: ctx, signals, disclosure: deps });
    const denials = deps.ledger.denials();
    expect(denials).toHaveLength(1);
    expect(denials[0]?.legalBasis).toMatch(/42 CFR Part 2/);
    expect(denials[0]?.subjectId).toBe(MEMBER);
  });
});

describe('with the class granted, the MEMBER decides', () => {
  const restricted = [sig({ part2Restricted: true })];
  const run = (bases: ConsentBasis[], nowMs = NOW) => {
    const deps = gate(PART2_CAP, bases, nowMs);
    const r = routeBatchGated({
      batch: batchFor(restricted),
      memberContext: ctx,
      signals: restricted,
      disclosure: deps,
    });
    return { ...r, ledger: deps.ledger };
  };

  it('permits on a valid basis, and the permit carries its obligations', () => {
    const r = run([validBasis()]);
    expect(r.tasks.map((t) => t.agentId)).toEqual([OUTREACH]);
    // A Part 2 record is ALSO demographic, so both regimes are decided and both
    // recorded. The Part 2 permit is the one carrying the §2.32 obligations.
    const permit = r.ledger.all().find((d) => d.dataClass === 'substance-use-disorder');
    expect(permit?.outcome).toBe('permit');
    expect(permit?.obligations).toContain('part2-redisclosure-prohibited');
    expect(permit?.obligations).toContain('notice-to-accompany-disclosure');
    expect(permit?.basisId).toBe('consent/part2/1');
  });

  it('refuses with NO basis on file — absence is a denial, never a default permit', () => {
    const r = run([]);
    expect(r.tasks).toEqual([]);
    expect(r.refusals[0]?.decision?.reason).toBe('no-basis-on-file');
  });

  it('REVOCATION closes the path, and the record says "revoked"', () => {
    const r = run([validBasis({ revokedAtMs: NOW - 1 })]);
    expect(r.tasks).toEqual([]);
    expect(r.refusals[0]?.decision?.reason).toBe('basis-revoked');
  });

  it('an expired basis is refused as expired, not as missing', () => {
    const r = run([validBasis({ expiresAtMs: NOW - 1 })]);
    expect(r.refusals[0]?.decision?.reason).toBe('basis-expired');
  });

  it('a basis not yet effective is refused', () => {
    const r = run([validBasis({ effectiveFromMs: NOW + 1 })]);
    expect(r.refusals[0]?.decision?.reason).toBe('basis-not-yet-effective');
  });

  it('a basis granted for a different purpose does not carry this one', () => {
    const r = run([validBasis({ purposes: ['payment'] })]);
    expect(r.refusals[0]?.decision?.reason).toBe('basis-purpose-mismatch');
  });

  it('a basis naming a DIFFERENT recipient does not reach this one', () => {
    // Part 2 consent identifies its recipient; a basis naming a lead entity does
    // not reach that entity's subcontracted CBO, however reasonable that feels.
    const r = run([validBasis({ recipientOrgIds: ['org/some-other-cbo'] })]);
    expect(r.refusals[0]?.decision?.reason).toBe('recipient-not-named');
  });

  it('a basis for a different member never applies', () => {
    const r = run([validBasis({ subjectId: 'SOMEONE_ELSE' })]);
    expect(r.refusals[0]?.decision?.reason).toBe('no-basis-on-file');
  });
});

describe('the time comparisons are tested AT the boundary, not one millisecond off', () => {
  // A review found every temporal case pinned at NOW±1 — the one offset that
  // cannot tell `>` from `>=`. These four run exactly ON the instant, where the
  // operator is the only thing that decides the answer.
  const restricted = [sig({ part2Restricted: true })];
  const run = (bases: ConsentBasis[]) => {
    const deps = gate(PART2_CAP, bases);
    return routeBatchGated({
      batch: batchFor(restricted),
      memberContext: ctx,
      signals: restricted,
      disclosure: deps,
    });
  };

  it('revoked AT this instant is revoked (>=, not >) — the member said stop NOW', () => {
    expect(run([validBasis({ revokedAtMs: NOW })]).refusals[0]?.decision?.reason).toBe(
      'basis-revoked'
    );
  });

  it('expiring AT this instant has expired (>=, not >)', () => {
    expect(run([validBasis({ expiresAtMs: NOW })]).refusals[0]?.decision?.reason).toBe(
      'basis-expired'
    );
  });

  it('effective AT this instant IS effective (not <) — consent starts when signed', () => {
    const r = run([validBasis({ effectiveFromMs: NOW })]);
    expect(r.refusals).toEqual([]);
    expect(r.tasks).toHaveLength(1);
  });

  it('one millisecond before effective is still not effective', () => {
    expect(run([validBasis({ effectiveFromMs: NOW + 1 })]).refusals[0]?.decision?.reason).toBe(
      'basis-not-yet-effective'
    );
  });
});

describe('the gate cannot be omitted on ANY heightened path', () => {
  const check = (signals: Signal[]) =>
    assertNoUngatedPart2({ batch: batchFor(signals), memberContext: ctx, signals });

  it('routing Part 2 signals with no gate throws rather than disclosing', () => {
    expect(() => check([sig({ part2Restricted: true })])).toThrowError(AgentRoutingError);
  });

  it('ordinary signals with no gate are unaffected', () => {
    expect(() => check([sig()])).not.toThrow();
  });

  it('an MHL §33.13 signal with no gate throws — the check read part2Restricted ALONE', () => {
    // THE F3 DEFECT. `bh.screening.indicated` floors at `mental-health` in the
    // shipped taxonomy and carries `part2Restricted: false`, so it passed the old
    // single-boolean check and dispatched with ZERO ledger rows.
    expect(() => check([sig({ signalId: 'bh', kind: 'bh.screening.indicated' })])).toThrowError(
      /NY MHL/
    );
  });

  it('a signal kind the taxonomy does not govern also demands the gate', () => {
    // "We do not know which regime applies" is not "no regime applies".
    expect(() => check([sig({ kind: 'not.a.taxonomy.kind' })])).toThrowError(AgentRoutingError);
  });
});

describe('the ledger answers the revocation question', () => {
  it('records denials as well as permits, so "what was refused" is answerable', () => {
    const deps = gate(PART2_CAP, [validBasis({ revokedAtMs: NOW - 1 })]);
    const signals = [
      sig({ part2Restricted: true }),
      sig({ signalId: 's2', part2Restricted: true }),
    ];
    routeBatchGated({ batch: batchFor(signals), memberContext: ctx, signals, disclosure: deps });
    // Two signals × two derived classes (demographic + substance-use-disorder).
    expect(deps.ledger.forSubject(MEMBER)).toHaveLength(4);
    expect(deps.ledger.denials()).toHaveLength(2);
    expect(deps.ledger.size()).toBe(4);
  });

  it('is append-only — a caller cannot edit the record it was handed', () => {
    const deps = gate(PART2_CAP, []);
    const signals = [sig({ part2Restricted: true })];
    routeBatchGated({ batch: batchFor(signals), memberContext: ctx, signals, disclosure: deps });
    const handed = deps.ledger.all().filter((d) => d.outcome === 'deny');
    // Frozen, so a write throws in strict mode rather than being silently
    // dropped. Assert the value holds either way — a silent no-op would be as
    // acceptable as a throw, but a SUCCESSFUL write would not.
    expect(() => {
      (handed[0] as { outcome: string }).outcome = 'permit';
    }).toThrow();
    expect(deps.ledger.denials()[0]?.outcome).toBe('deny');

    // The array field was the real defect: a shallow copy shared its reference,
    // so a caller could empty `obligations` on a stored Part 2 permit forever.
    const permitted = createDisclosureLedger();
    permitted.record({
      ...(handed[0] as DisclosureDecision),
      outcome: 'permit',
      obligations: ['part2-redisclosure-prohibited'],
    });
    const row = permitted.all()[0];
    expect(() => {
      (row?.obligations as Obligation[]).length = 0;
    }).toThrow();
    expect(permitted.all()[0]?.obligations).toEqual(['part2-redisclosure-prohibited']);
  });
});

/**
 * A row as a STORE can hand it back: an array field simply absent. There was no
 * such fixture anywhere in the repo, so the malformed-row guard in `basisFault`
 * was unenforced — flipping its `||` to `&&` survived the entire suite. With
 * `&&` a row like this reaches `basis.purposes.includes(...)` and throws a
 * TypeError out of a confidentiality path, where a throw means the caller records
 * NO LEDGER ROW AT ALL, which is worse than a denial.
 */
function basisMissing(field: 'purposes' | 'recipientOrgIds'): ConsentBasis {
  const row: Record<string, unknown> = { ...validBasis() };
  delete row[field];
  return row as unknown as ConsentBasis;
}

describe('a malformed consent row is refused as absent, and never throws', () => {
  for (const field of ['purposes', 'recipientOrgIds'] as const) {
    it(`a row with NO ${field} denies no-basis-on-file instead of throwing`, () => {
      const call = () => decideDisclosure(request(), PART2_CAP, [basisMissing(field)]);
      // Totality is the point: the inputs are JSON-sourced, so a missing array is
      // an expected case, and every throw out of here is an unrecorded decision.
      expect(call).not.toThrow();
      const d = call();
      expect(d.outcome).toBe('deny');
      expect(d.reason).toBe('no-basis-on-file');
      // Still filed under the regime that governs the class, not under TPO.
      expect(d.legalBasis).toMatch(/42 CFR Part 2/);
    });
  }
});

describe('when two candidate bases are both faulty, the FIRST in store order is reported', () => {
  // `firstFault = firstFault ?? fault` was untested because no fixture ever had
  // two faulty candidates for one class. The choice it makes is POSITIONAL —
  // store order — not a ranking by severity or specificity: reverse the rows and
  // the reported reason reverses. Naming that here rather than implying a ranking
  // the code does not implement.
  const revoked = validBasis({ basisId: 'consent/part2/revoked', revokedAtMs: NOW - 1 });
  const expired = validBasis({ basisId: 'consent/part2/expired', expiresAtMs: NOW - 1 });

  it('reports the first faulty candidate, not the last', () => {
    expect(decideDisclosure(request(), PART2_CAP, [revoked, expired]).reason).toBe('basis-revoked');
  });

  it('reversing the store order reverses the answer — the choice is positional', () => {
    expect(decideDisclosure(request(), PART2_CAP, [expired, revoked]).reason).toBe('basis-expired');
  });

  it('a clean candidate is preferred over a faulty one, wherever it sits', () => {
    const clean = validBasis({ basisId: 'consent/part2/clean' });
    expect(decideDisclosure(request(), PART2_CAP, [revoked, clean]).basisId).toBe(
      'consent/part2/clean'
    );
  });
});

describe('45 CFR 164.506 does not reach a recipient outside the covered entity', () => {
  // THE REGRESSION. The recipient source was changed to return a genuine outside
  // recipient so that `recipient-not-named` would become exercisable. It did not
  // become exercisable: `social-need` is absent from HEIGHTENED_BASIS_REQUIRED, so
  // the decision short-circuited to the baseline permit and `selectBasis` — the
  // only code that reads `recipient` — was never called. What the change actually
  // produced was a live unconsented disclosure to a food-access CBO, recorded as
  // lawful under treatment/payment/operations.
  const CBO = { orgId: 'org/cbo-food-access', kind: 'outside-covered-entity' } as const;
  const CAP: AgentCapability = {
    agentId: OUTREACH,
    purposeOfUse: 'social-care-referral',
    dataClasses: ['social-need'],
  };
  const referral = (over: Partial<DisclosureRequest> = {}) =>
    request({ dataClass: 'social-need', purposeOfUse: 'social-care-referral', ...over });
  const socialNeedBasis = (orgIds: readonly string[], over: Partial<ConsentBasis> = {}) =>
    validBasis({
      basisId: 'consent/social-need/1',
      dataClasses: ['social-need'],
      purposes: ['social-care-referral'],
      recipientOrgIds: orgIds,
      ...over,
    });

  it('permits the SAME class and purpose to an internal recipient on the baseline basis', () => {
    const d = decideDisclosure(referral(), CAP, []);
    expect(d.outcome).toBe('permit');
    expect(d.legalBasis).toMatch(/164\.506/);
  });

  it('denies it to a CBO with no instrument on file, whatever the data class', () => {
    const d = decideDisclosure(referral({ recipient: CBO }), CAP, []);
    expect(d.outcome).toBe('deny');
    expect(d.reason).toBe('recipient-outside-tpo-scope');
    // The record names the authority that WOULD carry it, and never claims TPO.
    expect(d.legalBasis).toMatch(/164\.508/);
    expect(d.legalBasis).not.toMatch(/164\.506/);
  });

  it('permits it on an instrument that NAMES the CBO, citing the authorization', () => {
    const d = decideDisclosure(referral({ recipient: CBO }), CAP, [socialNeedBasis([CBO.orgId])]);
    expect(d.outcome).toBe('permit');
    expect(d.legalBasis).toMatch(/164\.508/);
    // A permit here is earned by an instrument, so it carries the instrument's id.
    expect(d.basisId).toBe('consent/social-need/1');
  });

  it('an instrument naming the lead entity does not reach that entity’s CBO', () => {
    const d = decideDisclosure(referral({ recipient: CBO }), CAP, [
      socialNeedBasis(['org/wpco-care-team']),
    ]);
    expect(d.outcome).toBe('deny');
    expect(d.reason).toBe('recipient-not-named');
  });

  it('keeps the specific fault when there is one — a revocation is not relabelled', () => {
    const d = decideDisclosure(referral({ recipient: CBO }), CAP, [
      socialNeedBasis([CBO.orgId], { revokedAtMs: NOW - 1 }),
    ]);
    expect(d.reason).toBe('basis-revoked');
  });
});
