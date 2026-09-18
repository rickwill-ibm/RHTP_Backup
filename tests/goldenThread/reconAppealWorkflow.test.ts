/**
 * Appeal-WORKFLOW invariants — the "actions actually DO something" increment. A governed action now
 * instantiates a workflow (artifact + provenance timeline + queue + notifications + a MODELLED payer
 * response). These pins guard the honesty rules the coalition flagged: submissions stay human-gated,
 * segregation of duties on release, "recovered $" only after a modelled 835, no timer-to-Resolved, and
 * the determinism pin untouched (no workflow exists during warm-up).
 */
import { describe, it, expect } from 'vitest';
import {
  createSim,
  advance,
  startAppealWorkflow,
  reviewAppeal,
  releaseAppeal,
  dismissNotification,
} from '@/lib/goldenThread/flowSim';
import { appealOutcome, APPEAL_REVIEWER_SEAT } from '@/lib/goldenThread/workflow';

const firstUnroutedUnderpayment = (s: ReturnType<typeof createSim>) =>
  s.reconLedger.find((r) => r.reconClass === 'underpayment' && !r.routed)!;

describe('appeal workflow — determinism isolation', () => {
  it('no workflow/notification exists at warm start; the pin is byte-identical', () => {
    const s = createSim(20260914);
    expect(s.workflows.length).toBe(0);
    expect(s.notifications.length).toBe(0); // notify() lives only in UI-only verbs → none fire in warm-up
    expect(s.chainHead).toBe(2487355187);
    expect(s.ledgerSeq).toBe(250);
    expect(s.tick).toBe(684);
    expect(s.tickets.length).toBe(4); // mintTicket ref-dedup collapses the duplicated seed refs to one row each (was 9 with dups)
  });
  it('the response/SLA sweep is a no-op with no workflows — advancing stays deterministic', () => {
    const run = (): number => {
      const s = createSim(20260914);
      for (let i = 0; i < 300; i += 1) advance(s);
      return s.chainHead;
    };
    expect(run()).toBe(run());
  });
  it('advancing WITH a live workflow is fully deterministic (the modelled response draws no RNG)', () => {
    const run = (): { head: number; state: string; rng: number } => {
      const s = createSim(20260914);
      const rec = firstUnroutedUnderpayment(s);
      startAppealWorkflow(s, rec.seq);
      const wf = s.workflows[0];
      reviewAppeal(s, wf.id, 'M.Cho', true);
      releaseAppeal(s, wf.id, 'auth');
      for (let i = 0; i < 20; i += 1) advance(s); // through the modelled response
      return { head: s.chainHead, state: wf.state, rng: s.rngState };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b); // identical chainHead, resolved state, AND rngState — the workflow path is RNG-free
    expect(['accepted', 'denied']).toContain(a.state);
  });
});

describe('appeal workflow — lifecycle + queue + notifications', () => {
  it('start assembles the packet (agent), queues it for review, and notifies the reviewer', () => {
    const s = createSim(20260914);
    const rec = firstUnroutedUnderpayment(s);
    startAppealWorkflow(s, rec.seq);
    const wf = s.workflows[0];
    expect(wf.state).toBe('awaiting-review');
    expect(wf.steps.find((x) => x.key === 'assemble')!.done).toBe(true); // agent produced the artifact
    expect(wf.artifact.transmitted).toBe(false); // mock, not transmitted
    expect(wf.recoveredUsd).toBeUndefined(); // NOTHING recovered yet
    expect(s.tickets.find((t) => t.key === wf.ticketKey)!.status).toBe('Assigned'); // single-source projection
    const notif = s.notifications[0];
    expect(notif.to).toBe(APPEAL_REVIEWER_SEAT);
    expect(notif.kind).toBe('approval-needed');
  });
  it('is idempotent per recon record (no duplicate workflow)', () => {
    const s = createSim(20260914);
    const rec = firstUnroutedUnderpayment(s);
    startAppealWorkflow(s, rec.seq);
    startAppealWorkflow(s, rec.seq);
    expect(s.workflows.filter((w) => w.reconSeq === rec.seq).length).toBe(1);
  });
});

describe('appeal workflow — governance honesty', () => {
  it('segregation of duties: the releaser must differ from the reviewer', () => {
    const s = createSim(20260914);
    const wf = (startAppealWorkflow(s, firstUnroutedUnderpayment(s).seq), s.workflows[0]);
    reviewAppeal(s, wf.id, 'M.Cho', true);
    releaseAppeal(s, wf.id, 'M.Cho'); // same person → blocked
    expect(wf.state).toBe('awaiting-release');
    releaseAppeal(s, wf.id, 'provider-authorizer'); // different authorizer → releases
    expect(wf.state).toBe('awaiting-response');
  });
  it('the release is a SUBMISSION — sealed human-gated even after the fleet has EARNED A3', () => {
    const s = createSim(20260914);
    s.earnedCeiling = 3;
    s.maturity = 1.0; // full autonomy earned
    const wf = (startAppealWorkflow(s, firstUnroutedUnderpayment(s).seq), s.workflows[0]);
    reviewAppeal(s, wf.id, 'M.Cho', true);
    releaseAppeal(s, wf.id, 'provider-authorizer');
    const releaseStep = wf.steps.find((x) => x.key === 'release')!;
    const seal = s.ledger.find((e) => e.seq === releaseStep.sealSeq)!;
    expect(seal.human).toBe(true); // a payer-facing submission never auto-releases
    expect(seal.decision).toMatch(/not transmitted/);
  });
  it('"recovered" is asserted ONLY after a modelled 835 posts on accept — never on release', () => {
    const s = createSim(20260914);
    // find an underpayment whose modelled outcome is ACCEPT
    let wf = null as ReturnType<typeof createSim>['workflows'][number] | null;
    for (const r of s.reconLedger.filter((x) => x.reconClass === 'underpayment' && !x.routed)) {
      startAppealWorkflow(s, r.seq);
      const w = s.workflows[s.workflows.length - 1];
      if (appealOutcome(w.id) === 'accepted') {
        wf = w;
        break;
      }
    }
    expect(wf).toBeTruthy();
    reviewAppeal(s, wf!.id, 'M.Cho', true);
    releaseAppeal(s, wf!.id, 'auth');
    expect(wf!.recoveredUsd).toBeUndefined(); // released, but nothing recovered yet
    for (let i = 0; i < 12; i += 1) advance(s); // modelled payer response
    expect(wf!.state).toBe('accepted');
    expect(wf!.recoveredUsd).toBe(wf!.amountUsd); // NOW it is recovered (835 posted)
    expect(s.tickets.find((t) => t.key === wf!.ticketKey)!.status).toBe('Closed');
  });
  it('a denied appeal routes to the arbiter (appeal-of-appeal) and recovers nothing — not a timer flip', () => {
    const s = createSim(20260914);
    let wf = null as ReturnType<typeof createSim>['workflows'][number] | null;
    for (const r of s.reconLedger.filter((x) => x.reconClass === 'underpayment' && !x.routed)) {
      startAppealWorkflow(s, r.seq);
      const w = s.workflows[s.workflows.length - 1];
      if (appealOutcome(w.id) === 'denied') {
        wf = w;
        break;
      }
    }
    expect(wf).toBeTruthy();
    reviewAppeal(s, wf!.id, 'M.Cho', true);
    releaseAppeal(s, wf!.id, 'auth');
    for (let i = 0; i < 12; i += 1) advance(s);
    expect(wf!.state).toBe('denied');
    expect(wf!.recoveredUsd).toBeUndefined();
    expect(s.tickets.some((t) => t.ref === `ARB-${wf!.id}` && t.role === 'arbiter')).toBe(true);
  });
  it('a rejected review never releases and never touches the payer', () => {
    const s = createSim(20260914);
    const wf = (startAppealWorkflow(s, firstUnroutedUnderpayment(s).seq), s.workflows[0]);
    reviewAppeal(s, wf.id, 'M.Cho', false);
    expect(wf.state).toBe('rejected');
    expect(wf.steps.find((x) => x.key === 'release')!.done).toBe(false);
    for (let i = 0; i < 12; i += 1) advance(s);
    expect(wf.state).toBe('rejected'); // stays rejected — no payer response on an unreleased appeal
  });
});

describe('appeal workflow — KPI honesty + eviction + SLA', () => {
  it('an accepted appeal nets realized recovery out of the "Recoverable" KPI (no double-count)', async () => {
    const { reconInsights } = await import('@/lib/goldenThread/reconcile');
    const s = createSim(20260914);
    let wf = null as ReturnType<typeof createSim>['workflows'][number] | null;
    for (const r of s.reconLedger.filter((x) => x.reconClass === 'underpayment' && !x.routed)) {
      startAppealWorkflow(s, r.seq);
      const w = s.workflows[s.workflows.length - 1];
      if (appealOutcome(w.id) === 'accepted') {
        wf = w;
        break;
      }
    }
    reviewAppeal(s, wf!.id, 'M.Cho', true);
    releaseAppeal(s, wf!.id, 'auth');
    const before = reconInsights(s.reconLedger.map((r) => r)).totalRealizedUsd;
    for (let i = 0; i < 12; i += 1) advance(s);
    const ins = reconInsights(s.reconLedger.map((r) => r));
    expect(before).toBe(0);
    expect(ins.totalRealizedUsd).toBe(wf!.amountUsd); // realized only after the modelled 835 posts
    const rec = s.reconLedger.find((r) => r.seq === wf!.reconSeq)!;
    expect(rec.recoveredUsd).toBe(wf!.amountUsd); // back-written to the sub-ledger (one thread)
  });
  it('an in-flight appeal ticket is NOT evicted when the queue overflows with newer tickets', () => {
    const s = createSim(20260914);
    const wf = (startAppealWorkflow(s, firstUnroutedUnderpayment(s).seq), s.workflows[0]);
    // flood with 20 newer tickets; the appeal ticket (backing a non-terminal workflow) must survive
    for (let i = 0; i < 20; i += 1) advance(s);
    // force extra mints via surveillance completions by advancing more
    for (let i = 0; i < 200; i += 1) advance(s);
    expect(s.tickets.some((t) => t.key === wf.ticketKey)).toBe(true); // queue item still present
  });
  it('a denied appeal marks the ticket escalated (not cleared) — the money question stays open', () => {
    const s = createSim(20260914);
    let wf = null as ReturnType<typeof createSim>['workflows'][number] | null;
    for (const r of s.reconLedger.filter((x) => x.reconClass === 'underpayment' && !x.routed)) {
      startAppealWorkflow(s, r.seq);
      const w = s.workflows[s.workflows.length - 1];
      if (appealOutcome(w.id) === 'denied') {
        wf = w;
        break;
      }
    }
    reviewAppeal(s, wf!.id, 'M.Cho', true);
    releaseAppeal(s, wf!.id, 'auth');
    for (let i = 0; i < 12; i += 1) advance(s);
    expect(s.tickets.find((t) => t.key === wf!.ticketKey)!.disposition).toBe('escalated');
  });
});

describe('appeal workflow — notifications lifecycle', () => {
  it('notifications fire through the lifecycle and are dismissible', () => {
    const s = createSim(20260914);
    const wf = (startAppealWorkflow(s, firstUnroutedUnderpayment(s).seq), s.workflows[0]);
    reviewAppeal(s, wf.id, 'M.Cho', true);
    releaseAppeal(s, wf.id, 'auth');
    const kinds = s.notifications.map((n) => n.kind);
    expect(kinds).toContain('approval-needed');
    expect(kinds).toContain('released');
    const open = s.notifications.find((n) => !n.read)!;
    dismissNotification(s, open.id);
    expect(s.notifications.find((n) => n.id === open.id)!.read).toBe(true);
  });
});
