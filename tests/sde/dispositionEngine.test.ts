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
import {
  setSessionDataMode,
  clearSessionDataModes,
} from '@/lib/config/dataMode';
import {
  getProviderAccessConsentStore,
} from '@/lib/consent/providerAccessOptOut';

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
  return ds.filter((d) => d.action === 'suppress').map((d) => (d as any).reasonCode).sort();
}

describe('SDE disposition engine — acceptance reproduction (5/3/1, one touchpoint)', () => {
  it('the seeded demo batch yields 5 approved, 3 suppressed, 1 delayed, one coordinated touchpoint — from policy, not hardcoding', () => {
    const batch = runRealDemo();
    expect(batch.summary).toEqual({ approved: 5, suppressed: 3, delayed: 1, touchpoints: 1 });
    // The 5 approved compose into exactly ONE coordinated touchpoint.
    expect(batch.touchpoints).toHaveLength(1);
    expect(batch.touchpoints[0].intents).toHaveLength(5);
    // The 3 suppressions are for distinct, explained reasons.
    expect(reasons(batch.dispositions)).toEqual([
      'consent-absent',
      'duplicate-collapse',
      'superseded-on-closure',
    ]);
    // The 1 delay parks to an sms coordination window.
    const delay = batch.dispositions.find((d) => d.action === 'delay');
    expect(delay?.action).toBe('delay');
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
    expect(r.summary).toEqual({ approved: 5, suppressed: 3, delayed: 1, touchpoints: 1 });
    expect(r.batch).toBeUndefined();
  });

  it('production mode runs the real engine and returns the emergent shape', () => {
    setSessionDataMode('signalDisposition', 'production');
    const r = getSdeDemoDisposition();
    expect(r.mode).toBe('production');
    expect(r.batch).toBeDefined();
    expect(r.summary).toEqual({ approved: 5, suppressed: 3, delayed: 1, touchpoints: 1 });
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
    const signals = [mkSignal({ signalId: 's1', kind: 'care-gap.opened', channel: 'email', measure: 'GSD' })];
    const batch = disposeBatch(signals, defaultPolicyPack(), c, deps());
    const d = batch.dispositions[0];
    expect(d.action).toBe('suppress');
    expect((d as any).reasonCode).toBe('frequency-cap');
    expect(batch.summary.approved).toBe(0);
  });

  it('consent-absent: an outreach whose consent scope is not granted is suppressed', () => {
    const c = ctx({ consentScopesGranted: [] }); // no scope granted
    const signals = [mkSignal({ signalId: 's1', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'GSD' })];
    const batch = disposeBatch(signals, defaultPolicyPack(), c, deps());
    expect(batch.dispositions[0].action).toBe('suppress');
    expect((batch.dispositions[0] as any).reasonCode).toBe('consent-absent');
  });

  it('consent gate reuses the consent seam: an opted-out member is suppressed even with a granted scope', () => {
    const store = getProviderAccessConsentStore();
    store.optOut('opt-out-member', 'test-suite', 'unit test');
    const c = ctx({ memberId: 'opt-out-member', consentScopesGranted: ['care-outreach'] });
    const signals = [mkSignal({ signalId: 's1', memberId: 'opt-out-member', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'GSD' })];
    const batch = disposeBatch(signals, defaultPolicyPack(), c, deps());
    expect((batch.dispositions[0] as any).reasonCode).toBe('consent-absent');
    store.revokeOptOut('opt-out-member', 'test-suite'); // restore
  });

  it('supersede-on-closure: outreach for a measure already closed is suppressed', () => {
    const c = ctx({ recentlyClosedMeasures: ['EED'] });
    const signals = [mkSignal({ signalId: 's1', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'EED' })];
    const batch = disposeBatch(signals, defaultPolicyPack(), c, deps());
    expect((batch.dispositions[0] as any).reasonCode).toBe('superseded-on-closure');
  });

  it('duplicate-collapse: the later of two same-dedupe-key signals is suppressed', () => {
    const signals = [
      mkSignal({ signalId: 's1', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'GSD', dedupeKey: 'cg:GSD', sequence: 1 }),
      mkSignal({ signalId: 's2', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'GSD', dedupeKey: 'cg:GSD', sequence: 2 }),
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
      mkSignal({ signalId: 's1', kind: 'behavioral.window', channel: 'sms', consentScope: 'care-outreach', dedupeKey: 'b:s1', sequence: 1 }),
      mkSignal({ signalId: 's2', kind: 'behavioral.window', channel: 'sms', consentScope: 'care-outreach', dedupeKey: 'b:s2', sequence: 2 }),
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
    const signals = [mkSignal({ signalId: 's1', kind: 'behavioral.window', channel: 'sms', consentScope: 'care-outreach' })];
    const batch = disposeBatch(signals, defaultPolicyPack(), ctx(), deps({ now: () => inWindow }));
    expect(batch.summary.delayed).toBe(0);
    expect(batch.summary.approved).toBe(1);
  });
});

describe('SDE — per-member ordering', () => {
  it('folds in outbox-sequence order: the earliest-sequence duplicate is kept, later suppressed', () => {
    const out = [
      mkSignal({ signalId: 'late', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'GSD', dedupeKey: 'cg:GSD', sequence: 9 }),
      mkSignal({ signalId: 'early', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'GSD', dedupeKey: 'cg:GSD', sequence: 2 }),
    ];
    // Pass signals out of order; the engine must sort by sequence deterministically.
    const batch = disposeBatch(out, defaultPolicyPack(), ctx(), deps());
    expect(isApproved(batch.dispositions.find((d) => d.signalId === 'early')!)).toBe(true);
    expect((batch.dispositions.find((d) => d.signalId === 'late') as any).reasonCode).toBe('duplicate-collapse');
  });

  it('is deterministic: same set + pack + clock yields identical decisions', () => {
    const s = loadDemoBatch();
    const a = disposeBatch(s.signals, defaultPolicyPack(), s.memberContext, deps({ now: () => s.nowMs }));
    const b = disposeBatch(s.signals, defaultPolicyPack(), s.memberContext, deps({ now: () => s.nowMs }));
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
    const after = disposeBatch(demo.signals, tuned, demo.memberContext, deps({ now: () => demo.nowMs })).summary;
    expect(before).toEqual({ approved: 5, suppressed: 3, delayed: 1, touchpoints: 1 });
    // supersede off -> one fewer suppression, one more approved.
    expect(after.suppressed).toBe(2);
    expect(after.approved).toBe(6);
  });

  it('tightening a frequency cap in the pack suppresses more outreach', () => {
    const signals = [
      mkSignal({ signalId: 'a', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'A', dedupeKey: 'a' }),
      mkSignal({ signalId: 'b', kind: 'care-gap.opened', channel: 'portal', consentScope: 'care-outreach', measure: 'B', dedupeKey: 'b' }),
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
    const batch = disposeBatch(demo.signals, defaultPolicyPack(), demo.memberContext, deps({ now: () => demo.nowMs, audit }));
    const entries = audit.entries();
    expect(entries.filter((e) => e.kind === 'disposition')).toHaveLength(batch.dispositions.length);
    expect(entries.filter((e) => e.kind === 'fold')).toHaveLength(1);
    // PHI-safe: detail carries ids/codes/counts only — assert no free-text names.
    const blob = JSON.stringify(entries);
    expect(blob).not.toMatch(/Maria|patient name/i);
  });
});
