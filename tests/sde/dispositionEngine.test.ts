import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  disposeBatch,
  runRealDemo,
  loadDemoBatch,
  getSdeDemoDisposition,
  defaultPolicyPack,
  loadPolicyPack,
  createMemoryAuditSink,
  consentGranted,
  explainBatch,
  isApproved,
  type Signal,
  type MemberContext,
  type EngineDeps,
  type PolicyPack,
  type Disposition,
} from '@/lib/sde';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';

const NOW = Date.parse('2026-08-22T08:00:00.000Z'); // 08:00 UTC — outside sms window 15-19

function mkSignal(over: Partial<Signal> & Pick<Signal, 'signalId' | 'kind'>): Signal {
  return {
    memberId: 'm1',
    sourceEventType: over.kind,
    occurredAtMs: NOW - 60_000,
    priority: 'high',
    actionability: 'member-outreach',
    foldBehavior: 'windowed',
    dedupeKey: `${over.kind}:${over.signalId}`,
    part2Restricted: false,
    ...over,
  } as Signal;
}

function deps(over: Partial<EngineDeps> = {}): EngineDeps {
  return {
    now: () => NOW,
    audit: createMemoryAuditSink(),
    consentGranted,
    actor: 'sde-engine@test',
    ...over,
  };
}

function ctx(over: Partial<MemberContext> = {}): MemberContext {
  return { memberId: 'm1', consentScopesGranted: ['care-outreach'], ...over };
}

function reasons(ds: Disposition[]): string[] {
  return ds
    .filter((d) => d.action === 'suppress')
    .map((d) => (d as any).reasonCode)
    .sort();
}

/**
 * The acceptance counts moved from 5/3/1 to 6/3/1 when `sig-10` — a 42 CFR
 * Part 2 restricted care gap — joined the seeded batch, so the agent disclosure
 * gate is exercised against real demo data rather than only against fixtures.
 * The counts are still computed by the policy engine, not asserted into it.
 */
describe('SDE disposition engine — acceptance reproduction (7/3/0, one touchpoint)', () => {
  it('the seeded demo batch yields 7 approved, 3 suppressed, 0 delayed, one coordinated touchpoint — from policy, not hardcoding', () => {
    const batch = runRealDemo();
    // ACCEPTANCE SHAPE RE-WALKED 6/3/1 → 7/3/0 (W7.5d), and the reason is the finding.
    //
    // `resolveChannel` used to return `signal.channel` FIRST, and `signalIntake` sets that from
    // `TaxonomyEntry.defaultChannel`, which 10 of the 11 shipped taxonomy kinds carry. So the
    // member's recorded `channelPreference` was reached only for the one kind without a default —
    // it was, in practice, dead. This member's preference is `['portal','sms']`; the
    // `behavioral.window` signal carried `channel: 'sms'`, so they were put on SMS against their
    // stated choice and then delayed by the SMS quiet-hours window.
    //
    // The delay was therefore an artifact of overriding the member. Respecting the preference for
    // member-facing channels (internal `task` routing is exempt — it is not a way to contact a
    // member) removes it: 7 approved, 0 delayed.
    //
    // A deaf or hard-of-hearing member whose only usable channel is SMS was, under the old order,
    // silently moved to `portal` for every care-gap. That is a 45 CFR 92.202 effective-communication
    // failure, and `fairness-lock.json` claimed the opposite mechanism until this was found.
    //
    // KNOWN COST, registered as G-052: the seeded batch no longer exercises the delay path at all.
    // The honest fix is a second demo member who prefers SMS, not re-introducing a delay this member
    // should never have had.
    expect(batch.summary).toEqual({ approved: 7, suppressed: 3, delayed: 0, touchpoints: 1 });
    // The 6 approved compose into exactly ONE coordinated touchpoint — which is
    // the case the agent disclosure gate must handle: a MIXED bundle, where one
    // intent (sig-10) is 42 CFR Part 2 restricted and the rest are not.
    expect(batch.touchpoints).toHaveLength(1);
    expect(batch.touchpoints[0].intents).toHaveLength(7); // 6 -> 7: the un-delayed behavioral.window joins the bundle
    // The 3 suppressions are for distinct, explained reasons.
    expect(reasons(batch.dispositions)).toEqual([
      'consent-absent',
      'duplicate-collapse',
      'superseded-on-closure',
    ]);
    // NO delay, and its absence is the W7.5d finding rather than a regression: the only delayed
    // disposition here was a member being moved off their stated `portal` preference onto `sms` by
    // a taxonomy default, and then delayed by the SMS quiet-hours window. Respecting the preference
    // removes it. G-052 records that this batch therefore no longer exercises the delay path, and
    // that the honest fix is a second demo member who actually prefers SMS — not re-introducing a
    // delay this member should never have had.
    expect(batch.dispositions.find((d) => d.action === 'delay')).toBeUndefined();
    // Every signal produced exactly one decision (nothing dropped).
    expect(batch.dispositions).toHaveLength(loadDemoBatch().signals.length);
  });

  it('the authored (mock-mode) summary equals the engine-derived summary — the shape is not authored into the engine', () => {
    const authored = loadDemoBatch().authoredSummary;
    const engine = runRealDemo().summary;
    expect(engine).toEqual(authored);
  });
});

describe('SDE seam (dataMode signalDisposition) — mock vs production', () => {
  beforeEach(() => clearSessionDataModes());
  afterEach(() => clearSessionDataModes());

  it('mock mode returns the demo authored disposition (page stays green)', () => {
    setSessionDataMode('signalDisposition', 'mock');
    const r = getSdeDemoDisposition();
    expect(r.mode).toBe('mock');
    expect(r.summary).toEqual({ approved: 7, suppressed: 3, delayed: 0, touchpoints: 1 });
    expect(r.batch).toBeUndefined();
  });

  it('production mode runs the real engine and returns the emergent shape', () => {
    setSessionDataMode('signalDisposition', 'production');
    const r = getSdeDemoDisposition();
    expect(r.mode).toBe('production');
    expect(r.batch).toBeDefined();
    expect(r.summary).toEqual({ approved: 7, suppressed: 3, delayed: 0, touchpoints: 1 });
  });
});

describe('SDE — suppression paths', () => {
  it('fatigue / frequency-cap: an outreach over the channel cap is suppressed with reason', () => {
    const c = ctx({
      contactHistory: [
        { channel: 'email', atMs: NOW - 3_600_000 },
        { channel: 'email', atMs: NOW - 7_200_000 },
      ],
    });
    const signals = [
      mkSignal({ signalId: 's1', kind: 'care-gap.opened', channel: 'email', measure: 'GSD' }),
    ];
    const batch = disposeBatch(signals, defaultPolicyPack(), c, deps());
    const d = batch.dispositions[0];
    expect(d.action).toBe('suppress');
    expect((d as any).reasonCode).toBe('frequency-cap');
    expect(batch.summary.approved).toBe(0);
  });

  it('consent-absent: an outreach whose consent scope is not granted is suppressed', () => {
    const c = ctx({ consentScopesGranted: [] }); // no scope granted
    const signals = [
      mkSignal({
        signalId: 's1',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'GSD',
      }),
    ];
    const batch = disposeBatch(signals, defaultPolicyPack(), c, deps());
    expect(batch.dispositions[0].action).toBe('suppress');
    expect((batch.dispositions[0] as any).reasonCode).toBe('consent-absent');
  });

  it('consent gate reuses the consent seam: an opted-out member is suppressed even with a granted scope', () => {
    const store = getProviderAccessConsentStore();
    store.optOut('opt-out-member', 'test-suite', 'unit test');
    const c = ctx({ memberId: 'opt-out-member', consentScopesGranted: ['care-outreach'] });
    const signals = [
      mkSignal({
        signalId: 's1',
        memberId: 'opt-out-member',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'GSD',
      }),
    ];
    const batch = disposeBatch(signals, defaultPolicyPack(), c, deps());
    expect((batch.dispositions[0] as any).reasonCode).toBe('consent-absent');
    store.revokeOptOut('opt-out-member', 'test-suite'); // restore
  });

  it('supersede-on-closure: outreach for a measure already closed is suppressed', () => {
    const c = ctx({ recentlyClosedMeasures: ['EED'] });
    const signals = [
      mkSignal({
        signalId: 's1',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'EED',
      }),
    ];
    const batch = disposeBatch(signals, defaultPolicyPack(), c, deps());
    expect((batch.dispositions[0] as any).reasonCode).toBe('superseded-on-closure');
  });

  it('duplicate-collapse: the later of two same-dedupe-key signals is suppressed', () => {
    const signals = [
      mkSignal({
        signalId: 's1',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'GSD',
        dedupeKey: 'cg:GSD',
        sequence: 1,
      }),
      mkSignal({
        signalId: 's2',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'GSD',
        dedupeKey: 'cg:GSD',
        sequence: 2,
      }),
    ];
    const batch = disposeBatch(signals, defaultPolicyPack(), ctx(), deps());
    const s1 = batch.dispositions.find((d) => d.signalId === 's1');
    const s2 = batch.dispositions.find((d) => d.signalId === 's2');
    expect(isApproved(s1!)).toBe(true);
    expect((s2 as any).reasonCode).toBe('duplicate-collapse');
  });
});

describe('SDE — delay-to-window bundling', () => {
  it('sms outreach outside the window delays; multiple delays to the same window bundle together', () => {
    const signals = [
      mkSignal({
        signalId: 's1',
        kind: 'behavioral.window',
        channel: 'sms',
        consentScope: 'care-outreach',
        dedupeKey: 'b:s1',
        sequence: 1,
      }),
      mkSignal({
        signalId: 's2',
        kind: 'behavioral.window',
        channel: 'sms',
        consentScope: 'care-outreach',
        dedupeKey: 'b:s2',
        sequence: 2,
      }),
    ];
    const batch = disposeBatch(signals, defaultPolicyPack(), ctx(), deps());
    expect(batch.summary.delayed).toBe(2);
    expect(batch.delayBundles).toHaveLength(1); // both parked to the same sms window
    expect(batch.delayBundles[0].signalIds).toEqual(['s1', 's2']);
    // The delay names the quiet-hours-window policy rule.
    const delay = batch.dispositions.find((d) => d.action === 'delay');
    expect(delay?.policyIds).toContain('quiet-hours-window/1.0');
  });

  it('sms inside the window acts (no delay)', () => {
    const inWindow = Date.parse('2026-08-22T16:00:00.000Z'); // 16:00 UTC, inside 15-19
    const signals = [
      mkSignal({
        signalId: 's1',
        kind: 'behavioral.window',
        channel: 'sms',
        consentScope: 'care-outreach',
      }),
    ];
    const batch = disposeBatch(signals, defaultPolicyPack(), ctx(), deps({ now: () => inWindow }));
    expect(batch.summary.delayed).toBe(0);
    expect(batch.summary.approved).toBe(1);
  });
});

describe('SDE — per-member ordering', () => {
  it('folds in outbox-sequence order: the earliest-sequence duplicate is kept, later suppressed', () => {
    const out = [
      mkSignal({
        signalId: 'late',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'GSD',
        dedupeKey: 'cg:GSD',
        sequence: 9,
      }),
      mkSignal({
        signalId: 'early',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'GSD',
        dedupeKey: 'cg:GSD',
        sequence: 2,
      }),
    ];
    // Pass signals out of order; the engine must sort by sequence deterministically.
    const batch = disposeBatch(out, defaultPolicyPack(), ctx(), deps());
    expect(isApproved(batch.dispositions.find((d) => d.signalId === 'early')!)).toBe(true);
    expect((batch.dispositions.find((d) => d.signalId === 'late') as any).reasonCode).toBe(
      'duplicate-collapse'
    );
  });

  it('is deterministic: same set + pack + clock yields identical decisions', () => {
    const s = loadDemoBatch();
    const a = disposeBatch(
      s.signals,
      defaultPolicyPack(),
      s.memberContext,
      deps({ now: () => s.nowMs })
    );
    const b = disposeBatch(
      s.signals,
      defaultPolicyPack(),
      s.memberContext,
      deps({ now: () => s.nowMs })
    );
    expect(JSON.stringify(a.dispositions)).toBe(JSON.stringify(b.dispositions));
  });
});

describe('SDE — policy is data', () => {
  it('changing the policy fixture changes the outcome (no code change)', () => {
    const demo = loadDemoBatch();
    // Tune the pack: turn OFF supersede-on-closure. The superseded EED signal now
    // becomes an approved outreach instead of a suppression.
    const base = defaultPolicyPack() as unknown as Record<string, unknown>;
    const tuned = loadPolicyPack({
      ...base,
      packId: 'tuned',
      version: '9.9',
      suppression: { supersedeOnClosure: false, duplicateCollapse: true },
    }) as PolicyPack;
    const before = runRealDemo().summary;
    const after = disposeBatch(
      demo.signals,
      tuned,
      demo.memberContext,
      deps({ now: () => demo.nowMs })
    );
    expect(before).toEqual({ approved: 7, suppressed: 3, delayed: 0, touchpoints: 1 });
    // RE-WALKED in W7.5d, and the re-walk found something.
    //
    // Turning supersede off USED to free the EED signal into an approved outreach: 6/3/1 → one more
    // approved, one fewer suppressed. It no longer does. The COUNT is unchanged and the REASON moved:
    // `superseded-on-closure` became `frequency-cap`.
    //
    // WHY, and it is a genuine finding rather than a test artifact. Respecting the member's stated
    // channel preference (the W7.5d §1557 fix) CONCENTRATES every member-facing touchpoint onto the
    // one channel they named, instead of spreading it across whatever channel each signal's taxonomy
    // default happened to pick. Concentrated on one channel, that channel's frequency cap binds
    // harder — so a member who states a single preferred channel is suppressed MORE than one who
    // states none. Members who state a single accessible channel are disproportionately members with
    // a disability, so the fix for one §1557 effect surfaced another. Registered as G-053 and
    // recorded as residue on the `MemberContext.channelPreference` and `PolicyPack.frequencyCaps`
    // entries in `fairness-lock.json` — the record says so rather than the effect being invisible.
    //
    // The test still demonstrates what it is for: ONE pack field changed, and the outcome changed.
    expect(after.summary).toEqual(before);
    expect(reasons(after.dispositions)).not.toEqual(reasons(runRealDemo().dispositions));
    expect(reasons(after.dispositions)).toContain('frequency-cap');
  });

  it('tightening a frequency cap in the pack suppresses more outreach', () => {
    const signals = [
      mkSignal({
        signalId: 'a',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'A',
        dedupeKey: 'a',
      }),
      mkSignal({
        signalId: 'b',
        kind: 'care-gap.opened',
        channel: 'portal',
        consentScope: 'care-outreach',
        measure: 'B',
        dedupeKey: 'b',
      }),
    ];
    const base = defaultPolicyPack() as unknown as Record<string, unknown>;
    const capped = loadPolicyPack({
      ...base,
      packId: 'capped',
      version: '9.8',
      frequencyCaps: [{ channel: 'portal', windowHours: 24, maxPerWindow: 1 }],
    }) as PolicyPack;
    const batch = disposeBatch(signals, capped, ctx(), deps());
    expect(batch.summary.approved).toBe(1);
    expect(batch.summary.suppressed).toBe(1);
  });
});

describe('SDE — explainability & audit', () => {
  it('every decision names at least one policy rule', () => {
    const batch = runRealDemo();
    for (const d of batch.dispositions) {
      expect(d.policyIds.length).toBeGreaterThan(0);
      for (const p of d.policyIds) expect(p).toMatch(/\/\d+\.\d+$/); // id/version shape
    }
  });

  it('the explanation view-model renders a reason and fired policies per decision', () => {
    const batch = runRealDemo();
    const explained = explainBatch(batch.dispositions);
    expect(explained).toHaveLength(batch.dispositions.length);
    for (const e of explained) {
      expect(e.firedPolicies.length).toBeGreaterThan(0);
      expect(e.reason.length).toBeGreaterThan(0);
    }
  });

  it('emits a PHI-safe audit entry per disposition plus one fold entry', () => {
    const demo = loadDemoBatch();
    const audit = createMemoryAuditSink();
    const batch = disposeBatch(
      demo.signals,
      defaultPolicyPack(),
      demo.memberContext,
      deps({ now: () => demo.nowMs, audit })
    );
    const entries = audit.entries();
    expect(entries.filter((e) => e.kind === 'disposition')).toHaveLength(batch.dispositions.length);
    expect(entries.filter((e) => e.kind === 'fold')).toHaveLength(1);
    // PHI-safe: detail carries ids/codes/counts only — assert no free-text names.
    const blob = JSON.stringify(entries);
    expect(blob).not.toMatch(/Maria|patient name/i);
  });
});
