import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import {
  LENSES,
  type ConsentScope,
  type GraphStore,
  type Mutation,
  type UpsertEdge,
  type UpsertNode,
  part2RestrictedLens,
  project,
  projectEvent,
} from '@/lib/graph';
import {
  evaluatePart2Access,
  PART2_REDISCLOSURE_NOTICE,
  type Part2ConsentDirective,
} from '@/lib/consent/part2Consent';
import { c2, fixedNow, makeNeo4jFakeStore, makePgGraphStore } from './helpers';

const deps = { now: fixedNow };

function nodes(muts: Mutation[]): UpsertNode[] {
  return muts.filter((m): m is UpsertNode => m.op === 'UpsertNode');
}
function edges(muts: Mutation[]): UpsertEdge[] {
  return muts.filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
}

/** A non-restricted (mental-health) Condition event. */
function bhCondition(memberId = 'M1'): C2Event {
  return c2({
    eventId: `${memberId}-bh`, eventType: 'behavioral-health.condition-recorded', memberId,
    occurredAt: '2026-04-03T00:00:00Z',
    payload: {
      conditionRef: `Condition/${memberId}-dep`,
      code: { system: 'icd-10-cm', code: 'F32.1', display: 'Depression' },
      category: 'behavioral-health', clinicalStatus: 'active', recordedDate: '2026-04-03',
    },
  });
}
/** A Part 2 SUD Condition event (envelope-labeled 42 CFR Part 2 by the pipeline). */
function part2Condition(memberId = 'M1'): C2Event {
  return c2({
    eventId: `${memberId}-sud`, eventType: 'behavioral-health.condition-recorded', memberId,
    occurredAt: '2026-04-01T00:00:00Z',
    consentContext: { part2Restricted: true, segmentLabels: ['42-CFR-Part-2'] },
    payload: {
      conditionRef: `Condition/${memberId}-sud`,
      code: { system: 'icd-10-cm', code: 'F11.20', display: 'Opioid dependence' },
      category: 'behavioral-health', clinicalStatus: 'active', recordedDate: '2026-04-01',
    },
  });
}

describe('behavioral-health projector emits the neutral instruction set', () => {
  it('non-restricted BH condition -> Member + Condition + dated associative HAS_CONDITION', () => {
    const muts = projectEvent(bhCondition('M1'), deps);
    const cond = nodes(muts).find((m) => m.kind === 'Condition')!;
    expect(cond.restricted).toBe(false);
    const e = edges(muts).find((m) => m.type === 'HAS_CONDITION')!;
    expect(e.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(e.to).toEqual({ kind: 'Condition', key: 'Condition/M1-dep' });
    expect(e.semantics.kind).toBe('associative');
    expect(e.validity.start).toBe('2026-04-03');
  });

  it('SUD subset projects as a RESTRICTED Condition carrying the Part 2 + re-disclosure marker', () => {
    const muts = projectEvent(part2Condition('M1'), deps);
    const cond = nodes(muts).find((m) => m.kind === 'Condition')!;
    expect(cond.restricted).toBe(true);
    expect(cond.properties.reDisclosureProhibited).toBe(true); // marker travels with the node
    const labels = muts
      .filter((m): m is Extract<Mutation, { op: 'SetLabel' }> => m.op === 'SetLabel')
      .map((m) => m.label);
    expect(labels).toContain('Restricted');
    expect(labels).toContain('42-CFR-Part-2');
  });
});

async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
  const muts = project([bhCondition(memberId), part2Condition(memberId)], deps);
  const pg = await makePgGraphStore();
  const neo = makeNeo4jFakeStore();
  await pg.apply(muts);
  await neo.apply(muts);
  return { pg, neo };
}

describe('behavioral-health projection: both backends rebuild the identical graph', () => {
  it('pg-mem and Neo4j fake produce identical whole-person results (with scope)', async () => {
    const { pg, neo } = await seeded();
    const scope: ConsentScope = { part2: true };
    const onPg = await LENSES['whole-person'](pg, 'M1', scope);
    const onNeo = await LENSES['whole-person'](neo, 'M1', scope);
    expect(onNeo).toEqual(onPg);
  });
});

// ── F2: consent-scoped lens read, break-glass, held-restricted, re-disclosure ──
describe('F2 Part 2 enforcement over the behavioral-health restricted node', () => {
  const key = (n: { kind: string; key: string }) => `${n.kind}:${n.key}`;

  it('the restricted SUD condition is EXCLUDED from whole-person without consent (both backends)', async () => {
    const { pg, neo } = await seeded();
    for (const store of [pg, neo]) {
      const r = await LENSES['whole-person'](store, 'M1'); // NO_CONSENT default
      const keys = r.nodes.map(key);
      expect(keys).toContain('Condition:Condition/M1-dep'); // the plain BH condition stays
      expect(keys).not.toContain('Condition:Condition/M1-sud'); // Part 2 node redacted
    }
  });

  it('part2-restricted lens is EMPTY without scope and INCLUDES the node WITH scope (both backends)', async () => {
    const { pg, neo } = await seeded();
    for (const store of [pg, neo]) {
      expect((await part2RestrictedLens(store, 'M1')).nodes).toHaveLength(0);
      const withScope = await part2RestrictedLens(store, 'M1', { part2: true });
      expect(withScope.nodes.map(key)).toEqual(['Condition:Condition/M1-sud']);
    }
  });

  it('consent-directed release: a directive naming recipient + purpose surfaces the node', async () => {
    const { pg } = await seeded();
    const directive: Part2ConsentDirective = {
      memberId: 'M1', recipient: 'partner-clinic', purpose: 'treatment', segments: ['42-CFR-Part-2'],
    };
    const decision = evaluatePart2Access(
      { memberId: 'M1', recipient: 'partner-clinic', purpose: 'treatment' },
      [directive], deps,
    );
    expect(decision.disclosed).toBe(true);
    expect(decision.audit.auditClass).toBe('part2-consent-disclosure');
    expect(decision.audit.elevated).toBe(false);
    // The disclosure carries the re-disclosure prohibition marker + notice (42 CFR 2.32).
    expect(decision.reDisclosureProhibited).toBe(true);
    expect(decision.notice).toBe(PART2_REDISCLOSURE_NOTICE);
    const r = await part2RestrictedLens(pg, 'M1', decision.scope);
    expect(r.nodes.map(key)).toEqual(['Condition:Condition/M1-sud']);
  });

  it('absent consent = HELD restricted: not disclosed, not dropped (node still in the store)', async () => {
    const { pg } = await seeded();
    const decision = evaluatePart2Access(
      { memberId: 'M1', recipient: 'unknown-recipient', purpose: 'operations' },
      [], deps,
    );
    expect(decision.disclosed).toBe(false);
    expect(decision.audit.auditClass).toBe('part2-held-restricted');
    expect(decision.reDisclosureProhibited).toBe(false);
    // The lens under the held scope surfaces nothing...
    expect((await part2RestrictedLens(pg, 'M1', decision.scope)).nodes).toHaveLength(0);
    // ...but the node is HELD, not dropped: it is still present in the store.
    expect(await pg.getNode('Condition', 'Condition/M1-sud')).not.toBeNull();
  });

  it('break-glass: emergency access surfaces the node under a DISTINCT elevated audit class', async () => {
    const { pg } = await seeded();
    const decision = evaluatePart2Access(
      { memberId: 'M1', recipient: 'ed-physician', purpose: 'treatment', breakGlass: true, breakGlassReason: 'unresponsive patient in the ED' },
      [], deps, // no consent on file
    );
    expect(decision.disclosed).toBe(true);
    expect(decision.audit.auditClass).toBe('part2-break-glass'); // distinct audit class
    expect(decision.audit.elevated).toBe(true);
    expect(decision.audit.reason).toContain('unresponsive patient in the ED'); // reason captured
    expect(decision.reDisclosureProhibited).toBe(true);
    // PHI-safe audit: no diagnosis / narrative leaks into the audit entry.
    const s = JSON.stringify(decision.audit);
    expect(s).not.toContain('F11.20');
    expect(s).not.toContain('Opioid');
    const r = await part2RestrictedLens(pg, 'M1', decision.scope);
    expect(r.nodes.map(key)).toEqual(['Condition:Condition/M1-sud']);
  });
});
