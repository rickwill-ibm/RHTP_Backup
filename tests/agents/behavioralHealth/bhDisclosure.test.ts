/**
 * MENTAL HEALTH BECOMES REACHABLE — and `sig-7` stops being classed as demographic.
 *
 * `mental-health` and `hiv` were declared in the disclosure plane and mapped to
 * NY MHL §33.13 and PHL Art 27-F, and were UNREACHABLE: class derivation was a
 * two-valued boolean on `part2Restricted`, so `sig-7 bh.screening.indicated`
 * (an EPDS perinatal depression screen, already in the shipped demo batch) was
 * classed `demographic` and permitted with no basis check. Constants naming
 * those statutes read to a reviewer as "handled". They were decoration.
 *
 * The taxonomy now supplies a class FLOOR per signal type, which instance-level
 * provenance may escalate but never reduce.
 */
import { describe, expect, it } from 'vitest';
import {
  decideDispatchDisclosure,
  AgentRoutingError,
  type DisclosureGateDeps,
} from '@/lib/agents/dispatch';
import {
  createDisclosureLedger,
  type AgentCapability,
  type ConsentBasis,
} from '@/lib/agents/disclosure';
import { defaultTaxonomy, taxonomyClassFloor } from '@/lib/sde';
import type { Signal } from '@/lib/sde';

const NOW = 1_700_000_000_000;
const MEMBER = 'sde-demo-member';
const BH = 'bh-screening-triage-agent';

const BH_CAP: AgentCapability = {
  agentId: BH,
  purposeOfUse: 'care-coordination',
  dataClasses: ['mental-health'],
};

function bhSignal(over: Partial<Signal> = {}): Signal {
  return {
    signalId: 'sig-7',
    memberId: MEMBER,
    kind: 'bh.screening.indicated',
    sourceEventType: 'bh.event.recorded',
    occurredAtMs: NOW,
    priority: 'high',
    actionability: 'member-outreach',
    foldBehavior: 'windowed',
    dedupeKey: 'bh-screening:m:EPDS',
    part2Restricted: false,
    measure: 'EPDS',
    refs: { instrument: 'EPDS' },
    ...over,
  };
}

/** The real taxonomy, so the floor under test is the shipped one. */
function floorFor(kind: string): readonly string[] | undefined {
  const entry = defaultTaxonomy().entries.find((e) => e.signalType === kind);
  return entry?.dataClassFloor;
}

/** The outreach agent as shipped: it declares demographic + social-need only. */
const OUTREACH_CAP: AgentCapability = {
  agentId: 'outreach-agent',
  purposeOfUse: 'care-coordination',
  dataClasses: ['demographic', 'social-need'],
};

function gate(caps: AgentCapability[], bases: ConsentBasis[]): DisclosureGateDeps {
  return {
    capabilities: new Map(caps.map((c) => [c.agentId, c])),
    // The ONE shipped supplier, bound the way the production root binds it.
    classFloorFor: taxonomyClassFloor(),
    basesFor: () => bases,
    recipientFor: () => ({ orgId: 'org/wpco-care-team', kind: 'internal' }),
    ledger: createDisclosureLedger(),
    nowMs: NOW,
  };
}

const mhBasis = (over: Partial<ConsentBasis> = {}): ConsentBasis => ({
  basisId: 'consent/mhl-33.13/1',
  subjectId: MEMBER,
  dataClasses: ['mental-health'],
  purposes: ['care-coordination'],
  recipientOrgIds: ['org/wpco-care-team'],
  effectiveFromMs: NOW - 86_400_000,
  ...over,
});

describe('the taxonomy floor makes the BH regime reachable', () => {
  it('bh.screening.indicated floors at mental-health, not demographic', () => {
    expect(floorFor('bh.screening.indicated')).toEqual(['mental-health']);
  });

  it('an ordinary care gap still floors at demographic', () => {
    expect(floorFor('care-gap.opened')).toEqual(['demographic']);
  });
});

describe('a BH screen is decided under MHL §33.13, not under HIPAA TPO', () => {
  it('refuses the SHIPPED outreach agent, which never declared mental-health', () => {
    // The realistic case: the agent HAS a capability and the member HAS an MHL
    // basis, and the agent still cannot receive the class it never declared.
    const d = decideDispatchDisclosure(
      bhSignal(),
      'outreach-agent',
      gate([OUTREACH_CAP], [mhBasis()])
    );
    expect(d.outcome).toBe('deny');
    expect(d.reason).toBe('agent-class-not-declared');
    // Filed under the regime that governs the class — a misfiled refusal is how
    // a privacy officer fails to find it in a breach review.
    expect(d.legalBasis).toMatch(/MHL §33\.13/);
  });

  it('an agent absent from the capability map is a WIRING error, refused loudly', () => {
    // Distinct from the case above: no declaration at all means no purpose of use,
    // and `purposeOfUse: … ?? 'care-coordination'` used to invent one into the
    // ledger. Routing naming an agent the manifest does not is a wiring fault.
    expect(() =>
      decideDispatchDisclosure(bhSignal(), 'ghost-agent', gate([], [mhBasis()]))
    ).toThrowError(AgentRoutingError);
  });

  it('refuses the BH agent when the member granted no mental-health basis', () => {
    const d = decideDispatchDisclosure(bhSignal(), BH, gate([BH_CAP], []));
    expect(d.outcome).toBe('deny');
    expect(d.reason).toBe('no-basis-on-file');
    expect(d.dataClass).toBe('mental-health');
  });

  it('permits on a valid MHL basis, and the permit carries its notice obligation', () => {
    const d = decideDispatchDisclosure(bhSignal(), BH, gate([BH_CAP], [mhBasis()]));
    expect(d.outcome).toBe('permit');
    expect(d.obligations).toContain('notice-to-accompany-disclosure');
    // Part 2's redisclosure prohibition is NOT asserted on an MHL record — a
    // different statute, a different notice.
    expect(d.obligations).not.toContain('part2-redisclosure-prohibited');
  });

  it('revocation closes the BH path and the record says so', () => {
    const d = decideDispatchDisclosure(
      bhSignal(),
      BH,
      gate([BH_CAP], [mhBasis({ revokedAtMs: NOW - 1 })])
    );
    expect(d.reason).toBe('basis-revoked');
  });
});

describe('a record can be BOTH regimes, and both are decided', () => {
  it('a Part 2 flag ESCALATES the floor rather than replacing it', () => {
    // 42 CFR 2.20 makes the stricter rule controlling, so evaluating one statute
    // and stopping is wrong. The BH agent holds mental-health only, so the
    // substance-use class refuses — and that refusal is the one returned.
    const deps = gate([BH_CAP], [mhBasis()]);
    const d = decideDispatchDisclosure(bhSignal({ part2Restricted: true }), BH, deps);
    expect(d.outcome).toBe('deny');
    // The returned denial names the regime that actually REFUSED. The agent holds
    // mental-health and the member's basis covers it, so that class permits; the
    // substance-use class is the one it was never granted, and that is the answer
    // a reviewer needs to see.
    expect(d.dataClass).toBe('substance-use-disorder');
    expect(d.reason).toBe('agent-class-not-declared');

    const classes = deps.ledger.all().map((x) => x.dataClass);
    expect(classes).toContain('mental-health');
    expect(classes).toContain('substance-use-disorder');
    // BOTH regimes are in the record, not just the one that refused.
    expect(deps.ledger.size()).toBe(2);
  });

  it('the substance-use denial cites Part 2, and the mental-health one cites MHL', () => {
    const deps = gate([BH_CAP], [mhBasis()]);
    decideDispatchDisclosure(bhSignal({ part2Restricted: true }), BH, deps);
    const sud = deps.ledger.all().find((x) => x.dataClass === 'substance-use-disorder');
    const mh = deps.ledger.all().find((x) => x.dataClass === 'mental-health');
    expect(sud?.legalBasis).toMatch(/42 CFR Part 2/);
    expect(mh?.legalBasis).toMatch(/MHL §33\.13/);
  });
});
