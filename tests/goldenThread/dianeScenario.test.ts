/**
 * Diane · Medicare Advantage scenario (Step 1 foundation) invariants.
 * Pins: default stream untouched; hero seeded with an administrative cert-gap; no fabricated denial (Path A
 * only — deemAdverse pinned false); Medicaid tickets suppressed; MA vocabulary; per-scenario determinism.
 */
import { describe, it, expect } from 'vitest';
import { createSim, advance, spotlight } from '@/lib/goldenThread/flowSim';
import { scenarioOf } from '@/lib/goldenThread/scenarios';
import { seedTicketByRef } from '@/lib/goldenThread/e2eFlow';

describe('Diane MA scenario — Step 1 foundation', () => {
  it('does not perturb the default (wa-medicaid) stream', () => {
    const wa = createSim(20260914);
    expect(wa.scenario).toBe('wa-medicaid');
    expect(wa.chainHead).toBe(3794285767); // re-pinned when the in-flight appeal is seeded (see determinismPin.test.ts)
    expect(wa.ledgerSeq).toBe(251);
    expect(wa.tickets.length).toBe(5); // 4 deduped seed tickets + the seeded appeal RCLM ticket
  });

  it('seeds Diane as the spotlighted hero with an administrative cert gap, no fabricated denial', () => {
    const m = createSim(20260914, undefined, 'diane-ma');
    const hero = m.txns.find((t) => t.hero);
    expect(hero).toBeTruthy();
    expect(hero!.type).toBe('pa');
    expect(hero!.certGap).toBe(true);
    expect(hero!.deemAdverse).toBe(false); // Path A only in Step 1 — never deems adverse
    expect(hero!.evidenceRef).toMatch(/^evrec:/); // stable anchor for the Step-3 evidence record
    expect(spotlight(m)?.hero).toBe(true); // the exec panel watches Diane
  });

  it('suppresses the WA-Medicaid tickets and carries MA vocabulary', () => {
    const m = createSim(20260914, undefined, 'diane-ma');
    expect(m.tickets.length).toBe(0); // Operations/Surveillance out-of-frame in Step 1
    const sc = scenarioOf(m);
    expect(sc.member?.name).toMatch(/Diane Novak/);
    expect(sc.clockCite).toMatch(/422\.572/); // Part C, not 438.x
    expect(sc.adverseNotice).toMatch(/Integrated Denial Notice|CMS-10003/);
    expect(sc.deemedAdverseDecision).toMatch(/422\.572\(f\)/);
    expect(sc.deemedAdverseDecision).not.toMatch(/NABD|438\./); // no Medicaid leakage on the MA scenario
  });

  it('is deterministic per scenario', () => {
    const a = createSim(20260914, undefined, 'diane-ma');
    const b = createSim(20260914, undefined, 'diane-ma');
    expect(a.chainHead).toBe(b.chainHead);
    expect(a.ledgerSeq).toBe(b.ledgerSeq);
  });

  // TRAJECTORY pins — advance the sim, because the live-path defects (a hero MD-deny; a cert gap that seals
  // '275 records' on the return leg) are invisible to seed-time assertions. These would catch the regression.
  it('the hero is a Path-A save — never denied, and its cert gap returns an ATTESTATION, not clinical records', () => {
    const s = createSim(20260914, undefined, 'diane-ma');
    const heroId = s.txns.find((t) => t.hero)!.id;
    let everDenied = false;
    for (let i = 0; i < 600; i += 1) {
      advance(s);
      const h = s.txns.find((t) => t.id === heroId);
      if (h && h.phase === 'denied') everDenied = true;
    }
    expect(everDenied).toBe(false); // Fix 1 — the cert-gap hero never takes a medical-necessity or deemed denial
    // Fix 2 — the cert return leg sealed a credentialing attestation, never a clinical 275-records exchange.
    const attest = s.ledger.some((e) => /ATTESTATION ON FILE/.test(e.decision));
    expect(attest).toBe(true);
  });

  it('advancing under diane-ma stays deterministic', () => {
    const run = (): number => {
      const s = createSim(20260914, undefined, 'diane-ma');
      for (let i = 0; i < 300; i += 1) advance(s);
      return s.chainHead;
    };
    expect(run()).toBe(run());
  });

  // Step 2 — clock-jeopardy detector + Diane's UM ticket (these need advance(); seed-time can't see them)
  it("the clock-jeopardy detector mints Diane's UM ticket ONCE, then auto-closes it on the Path-A save", () => {
    const s = createSim(20260914, undefined, 'diane-ma');
    let mints = 0;
    let sawOpen = false;
    let sawClosed = false;
    let lastCount = 0;
    for (let i = 0; i < 600; i += 1) {
      advance(s);
      const t = s.tickets.find((x) => x.ref === 'TKT-DIANE-CLK');
      const count = s.ledger.filter((e) => /CLOCK-JEOPARDY — /.test(e.decision)).length;
      if (count > lastCount) {
        mints += count - lastCount;
        lastCount = count;
      }
      if (t && t.status !== 'Closed') sawOpen = true;
      if (t && t.status === 'Closed') sawClosed = true;
    }
    expect(mints).toBe(1); // single-fire detector
    expect(sawOpen).toBe(true); // the advisory ticket appears (Beat 8)
    expect(sawClosed).toBe(true); // and closes on the Path-A save — no stale alarm
  });

  it("Diane's ticket resolves its seed and routes to UM operations (timeliness), not the Medical Director", () => {
    const seed = seedTicketByRef('TKT-DIANE-CLK');
    expect(seed).toBeTruthy();
    expect(seed!.role).toBe('payer-um'); // UM ops, not payer-md
    expect(seed!.algorithm).toBe('CLOCK-JEOPARDY'); // not DEEMED-ADVERSE-TIMEOUT (the failure)
    expect(seed!.verdict.permittedRung).toBe('A1'); // advise
    expect(seed!.verdict.requiresHuman).toBe(true); // advisory / human-gated
    expect(seed!.provider).toMatch(/illustrative/); // real-org name carries the illustrative tag
  });

  it('the clock-jeopardy detection seals at A1 · advise — never clamped to A0/watch (badge ↔ provenance agree)', () => {
    const s = createSim(20260914, undefined, 'diane-ma');
    for (let i = 0; i < 600; i += 1) advance(s);
    const det = s.ledger.find(
      (e) => e.fired === 'clock-jeopardy' && /CLOCK-JEOPARDY — /.test(e.decision)
    );
    expect(det).toBeTruthy();
    expect(det!.rung).toBe('A1'); // advisory: an agent may ALWAYS detect + advise — not earned-capped to A0
    expect(det!.oversight).not.toBe('watch'); // 'watch' (A0) would contradict the ticket's A1 badge
    expect(det!.human).toBe(false); // an agent detection…
    expect(det!.version).not.toMatch(/watch/); // …recorded honestly as advise, not as a null-authority watch
  });

  it('the administrative cert-gap hero never bypasses UM (express OR gold-card) — even at the autonomous band', () => {
    const s = createSim(20260914, undefined, 'diane-ma');
    s.maturity = 1.0; // autonomous band — fleet may reach A3 (both express AND gold-card are otherwise eligible)
    s.earnedCeiling = 3; // and it HAS earned it
    let heroEverExpress = false;
    let heroEverGoldCarded = false;
    let clockJeopardyEverFired = false;
    for (let i = 0; i < 600; i += 1) {
      advance(s);
      const h = s.txns.find((t) => t.hero);
      if (h && h.express) heroEverExpress = true;
      if (h && h.goldCarded) heroEverGoldCarded = true;
      // track across the run — the closed advisory ticket can be evicted from the 12-slot live array under
      // heavy autonomous churn, so assert it FIRED, not that it survives to the end.
      if (
        s.tickets.some((t) => t.ref === 'TKT-DIANE-CLK') ||
        s.ledger.some((e) => /CLOCK-JEOPARDY — /.test(e.decision))
      )
        clockJeopardyEverFired = true;
    }
    expect(heroEverExpress).toBe(false); // an admin cert gap MUST traverse the human UM path (rfi substep)
    expect(heroEverGoldCarded).toBe(false); // …and can't be PA-waived — its provider attestation isn't on file
    expect(clockJeopardyEverFired).toBe(true); // …so the clock-jeopardy story survives even at full autonomy
  });

  it('no clock-jeopardy detection or scenario ticket ever fires on the default (wa-medicaid) book', () => {
    const s = createSim(20260914);
    for (let i = 0; i < 400; i += 1) advance(s);
    expect(s.ledger.some((e) => /CLOCK-JEOPARDY/.test(e.decision))).toBe(false);
    expect(s.tickets.some((t) => t.ref === 'TKT-DIANE-CLK')).toBe(false);
  });
});
