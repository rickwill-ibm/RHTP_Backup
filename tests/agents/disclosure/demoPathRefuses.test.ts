/**
 * THE ACCEPTANCE TEST: the control fires on the REAL demo path, not in a fixture.
 *
 * Two findings made this necessary. The composition root called the ungated
 * `routeBatch`, and every signal in the seeded batch carried
 * `part2Restricted: false` — so the fail-closed assertion never fired, the
 * disclosure plane was never exercised on a live path, and the demo was green
 * for the wrong reason. A control that only its own unit tests can reach is
 * demonstrated, not wired.
 *
 * The seeded batch now carries `sig-10`, a 42 CFR Part 2 restricted care gap
 * (HEDIS IET), composed by the SDE into the SAME touchpoint as ordinary care
 * gaps. That is the mixed bundle the old gate walked straight past.
 */
import { describe, expect, it } from 'vitest';
import { defaultTaxonomy, loadDemoBatch, runRealDemo, taxonomyClassFloor } from '@/lib/sde';
import { decideDispatchDisclosure, routeBatchGated } from '@/lib/agents/dispatch';
import { runRealAgentDemo, demoDisclosures } from '@/lib/agents/demo';
import { loadConsentBases, recipientForAgent } from '@/lib/agents/demo/disclosureSources';
import { seededDisclosure } from '../helpers';

describe('the seeded demo batch exercises the disclosure gate', () => {
  it('carries a 42 CFR Part 2 signal — without one the control is never reached', () => {
    const restricted = loadDemoBatch().signals.filter((s) => s.part2Restricted);
    expect(restricted.length).toBeGreaterThan(0);
    expect(restricted[0]?.signalId).toBe('sig-10');
  });

  it('composes it into a MIXED touchpoint, which is the bypassed case', () => {
    const batch = runRealDemo();
    const demo = loadDemoBatch();
    const byId = new Map(demo.signals.map((s) => [s.signalId, s]));
    const tp = batch.touchpoints[0];
    expect(tp).toBeDefined();
    const flags = (tp?.intents ?? []).map((i) => byId.get(i.signalId)?.part2Restricted);
    expect(flags).toContain(true);
    expect(flags).toContain(false);
    // The Part 2 intent is NOT the opener — gating intents[0] alone missed it.
    expect(byId.get(tp?.intents[0]?.signalId ?? '')?.part2Restricted).toBe(false);
  });
});

describe('the demo path refuses the Part 2 intent and dispatches the rest', () => {
  const run = () => {
    const demo = loadDemoBatch();
    const batch = runRealDemo();
    const disclosure = seededDisclosure(demo.nowMs);
    const result = routeBatchGated({
      batch,
      memberContext: demo.memberContext,
      signals: demo.signals,
      disclosure,
    });
    return { ...result, ledger: disclosure.ledger, demo, batch };
  };

  it('withholds the Part 2 intent from the dispatched touchpoint', () => {
    const { tasks } = run();
    const outreach = tasks.find((t) => t.taskKind === 'outreach');
    expect(outreach).toBeDefined();
    const dispatched = (
      outreach?.task as { touchpoint: { intents: { signalId: string }[] } }
    ).touchpoint.intents.map((i) => i.signalId);
    expect(dispatched).not.toContain('sig-10');
    // The member still gets their other outreach. Denying the whole bundle would
    // withhold ordinary care because the member has a substance-use record.
    expect(dispatched.length).toBeGreaterThan(0);
  });

  it('records the refusal under 42 CFR Part 2, with a reason code', () => {
    const { ledger } = run();
    const denials = ledger.denials();
    expect(denials.length).toBeGreaterThan(0);
    const part2 = denials.find((d) => d.dataClass === 'substance-use-disorder');
    expect(part2).toBeDefined();
    expect(part2?.legalBasis).toMatch(/42 CFR Part 2/);
    expect(part2?.reason).toBe('agent-class-not-declared');
  });

  it('surfaces the refusal to the caller rather than dropping it silently', () => {
    const { refusals } = run();
    expect(refusals.some((r) => r.signalId === 'sig-10')).toBe(true);
  });

  it('tells the RECIPIENT nothing — no count, no marker, no placeholder', () => {
    // A "1 item withheld" chip on an identified member's touchpoint is itself a
    // disclosure that the member has a Part 2 record (42 CFR 2.13(c)).
    const { tasks } = run();
    const outreach = tasks.find((t) => t.taskKind === 'outreach');
    const payload = JSON.stringify(outreach?.task ?? {});
    expect(payload).not.toContain('sig-10');
    expect(payload).not.toMatch(/withheld|redacted|suppressed|part2|Part 2/i);
  });

  it('records a permit for the intents that were allowed', () => {
    const { ledger } = run();
    const permits = ledger.all().filter((d) => d.outcome === 'permit');
    expect(permits.length).toBeGreaterThan(0);
    // Both halves are in the record: a reviewer sees what flowed and what did not.
    expect(ledger.size()).toBe(permits.length + ledger.denials().length);
  });
});

describe('the class FLOOR is wired on the real composition, not only in a fixture', () => {
  // THE F1 ACCEPTANCE. `classFloorFor` was an OPTIONAL dep and the shipped
  // composition root omitted it, so the gate substituted `['demographic']` for
  // every signal; `HEIGHTENED_BASIS_REQUIRED['demographic']` is undefined, so the
  // plane permitted on the baseline HIPAA treatment/payment/operations basis with
  // NO consent lookup at all. `seededDisclosure` reproduced the same broken
  // composition, which is why this very file certified the gap.
  const demo = loadDemoBatch();
  const floorOf = (kind: string) =>
    defaultTaxonomy().entries.find((e) => e.signalType === kind)?.dataClassFloor;

  it('classes sig-7 (a positive EPDS perinatal screen) as mental-health, and DENIES it', () => {
    // sig-7 is `bh.screening.indicated`, floored at `mental-health` (NY MHL §33.13)
    // in the SHIPPED taxonomy. It was classed `demographic` and permitted. The
    // signal comes from the real seeded batch and the deps from the real
    // composition helper — nothing here is a fixture.
    const sig7 = demo.signals.find((s) => s.signalId === 'sig-7');
    expect(sig7?.kind).toBe('bh.screening.indicated');
    expect(floorOf('bh.screening.indicated')).toEqual(['mental-health']);

    const deps = seededDisclosure(demo.nowMs);
    const d = decideDispatchDisclosure(sig7!, 'outreach-agent', deps);
    expect(d.dataClass).toBe('mental-health');
    expect(d.outcome).toBe('deny');
    expect(d.legalBasis).toMatch(/MHL §33\.13/);
    // Not one row filed under HIPAA TPO for this signal.
    expect(deps.ledger.all().map((x) => x.dataClass)).not.toContain('demographic');
  });

  it('records every real-path decision under the class the taxonomy assigns it', () => {
    // The floor is honoured for EVERY dispatched signal, not just the BH one:
    // `screening.result` and `referral.stalled` floor at `social-need` and were
    // both recorded as `demographic` before this was wired.
    const deps = seededDisclosure(demo.nowMs);
    routeBatchGated({
      batch: runRealDemo(),
      memberContext: demo.memberContext,
      signals: demo.signals,
      disclosure: deps,
    });
    const ledger = deps.ledger;
    const byId = new Map(demo.signals.map((s) => [s.signalId, s]));
    for (const row of ledger.all()) {
      const signalId = row.requestId.split(':')[1] ?? '';
      const kind = byId.get(signalId)?.kind ?? '';
      const allowed = new Set(floorOf(kind) ?? []);
      // Provenance may only ESCALATE the floor, never reduce it.
      if (byId.get(signalId)?.part2Restricted) allowed.add('substance-use-disorder');
      expect(allowed.has(row.dataClass)).toBe(true);
    }
    expect(ledger.all().map((r) => r.dataClass)).toContain('social-need');
  });
});

describe('the seeded consent instruments are reachable, and the recipients differ', () => {
  const instrument = (basisId: string) =>
    loadConsentBases(loadDemoBatch().memberId).find((b) => b.basisId === basisId);

  it('the seeded bases belong to the member the seeded batch names (F6)', () => {
    // The instrument carried `subjectId: 'MARIA_SD_001'` while the batch's member
    // is `sde-demo-member`, so `loadConsentBases()` returned [] for everyone and
    // the file's own comment — "the demo member holds a care-coordination
    // consent" — was false.
    const memberId = loadDemoBatch().memberId;
    const bases = loadConsentBases(memberId);
    // Two instruments, deliberately: the internal care-coordination consent, and
    // the 164.508 release naming the food-access CBO. One cannot stand in for the
    // other, which is the whole reason there are two.
    expect(bases).toHaveLength(2);
    expect(bases.every((b) => b.subjectId === memberId)).toBe(true);
    expect(loadConsentBases('nobody')).toEqual([]);
  });

  it('a social-care referral leaves the covered entity, so its recipient is not the care team (F5)', () => {
    // Both branches of the ternary returned `org/wpco-care-team` — the very org
    // the internal instrument names — so `recipient-not-named` (42 CFR 2.31(a)(4):
    // "the name(s) of the person(s), or class of persons, to which a disclosure is
    // to be made"; (a)(3) is the information description, which this comment used
    // to cite) could never fire for any agent.
    const referral = recipientForAgent('referral-coordination-agent');
    const outreach = recipientForAgent('outreach-agent');
    expect(referral.orgId).not.toBe(outreach.orgId);
    expect(referral.kind).toBe('outside-covered-entity');
    // The INTERNAL consent still does not reach the CBO: only the release does.
    expect(instrument('consent/care-coordination/demo-1')?.recipientOrgIds).not.toContain(
      referral.orgId
    );
    expect(instrument('consent/cbo-release/demo-1')?.recipientOrgIds).toContain(referral.orgId);
  });

  it('a heightened class the release does not cover is refused for that recipient', () => {
    // Composed from the REAL recipient source: an agent granted a heightened class
    // for the referral purpose still cannot reach the CBO, because neither seeded
    // instrument covers `mental-health` — the release is scoped to the classes the
    // member released, and a release is not a general key to the record.
    const demo = loadDemoBatch();
    const agentId = 'referral-coordination-agent';
    const deps = {
      ...seededDisclosure(demo.nowMs),
      classFloorFor: taxonomyClassFloor(),
      recipientFor: recipientForAgent,
      capabilities: new Map([
        [
          agentId,
          {
            agentId,
            purposeOfUse: 'social-care-referral' as const,
            dataClasses: ['social-need', 'mental-health'] as const,
          },
        ],
      ]),
    };
    const sig7 = demo.signals.find((s) => s.signalId === 'sig-7');
    const d = decideDispatchDisclosure(sig7!, agentId, deps);
    expect(d.outcome).toBe('deny');
    expect(d.recipientOrgId).toBe('org/cbo-food-access');
    expect(d.reason).toBe('no-basis-on-file');
  });
});

describe('the referral to the CBO is decided under 164.508, never under TPO', () => {
  // THE REGRESSION THIS PINS, on the real composition. `referral.stalled` floors at
  // `social-need`, which is absent from HEIGHTENED_BASIS_REQUIRED, so the decision
  // returned the baseline treatment/payment/operations permit BEFORE `selectBasis`
  // — the only code that reads `recipient` — was ever called. The seeded referral
  // therefore disclosed member data to `org/cbo-food-access`, an organisation no
  // paragraph of 45 CFR 164.506(c) reaches, and the ledger recorded it as lawful
  // under that section. A ledger row asserting an authority that does not exist is
  // worse than a missing row: the ledger is the artifact produced under subpoena.
  const demo = loadDemoBatch();
  const REFERRAL_AGENT = 'referral-coordination-agent';
  const referralSignal = () => demo.signals.find((s) => s.signalId === 'sig-4');

  it('sig-4 referral.stalled carries social-need and goes to an outside organisation', () => {
    expect(referralSignal()?.kind).toBe('referral.stalled');
    expect(recipientForAgent(REFERRAL_AGENT)).toEqual({
      orgId: 'org/cbo-food-access',
      kind: 'outside-covered-entity',
    });
  });

  it('permits it ONLY on the instrument naming that CBO, and cites the authorization', () => {
    const deps = seededDisclosure(demo.nowMs);
    const d = decideDispatchDisclosure(referralSignal()!, REFERRAL_AGENT, deps);
    expect(d.dataClass).toBe('social-need');
    expect(d.outcome).toBe('permit');
    expect(d.legalBasis).toMatch(/164\.508/);
    expect(d.legalBasis).not.toMatch(/164\.506/);
    // A permit here is EARNED by an instrument, so it names the one relied on. A
    // permit with no basisId on this path is the defect itself.
    expect(d.basisId).toBe('consent/cbo-release/demo-1');
  });

  it('files NO row citing treatment/payment/operations for that recipient, in the whole run', () => {
    const deps = seededDisclosure(demo.nowMs);
    routeBatchGated({
      batch: runRealDemo(),
      memberContext: demo.memberContext,
      signals: demo.signals,
      disclosure: deps,
    });
    const cbo = recipientForAgent(REFERRAL_AGENT).orgId;
    const rows = deps.ledger.all().filter((r) => r.recipientOrgId === cbo);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.legalBasis).not.toMatch(/164\.506/);
  });
});

describe('the demo run hands back its own disclosure record (F11)', () => {
  it('returns the ledger instead of parking it in module state', async () => {
    // Two module-level `let`s held "the last run's" ledger and refusals. In a Next
    // server that module is per-PROCESS, so one request could read another
    // request's disclosure rows — rows carrying `subjectId`.
    const run = await runRealAgentDemo();
    expect(run.actions.length).toBeGreaterThan(0);
    const rec = demoDisclosures(run);
    expect(rec.decisions.length).toBeGreaterThan(0);
    expect(rec.refusals.some((r) => r.signalId === 'sig-10')).toBe(true);
  });

  it('two concurrent runs do not share a record', async () => {
    const [a, b] = await Promise.all([runRealAgentDemo(), runRealAgentDemo()]);
    expect(demoDisclosures(a).decisions).not.toBe(demoDisclosures(b).decisions);
    // Same seeded inputs, so the CONTENT matches; the point is that the arrays are
    // distinct objects per run rather than one shared module slot.
    expect(demoDisclosures(a).decisions.length).toBe(demoDisclosures(b).decisions.length);
  });
});
