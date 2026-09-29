/**
 * ADL schema + canonicalisation. The validator must refuse loudly with a typed
 * error naming the path; canonical bytes must be deterministic and idempotent.
 */
import { describe, expect, it } from 'vitest';
import { AdlError, parseAgentDefinition, assertUniqueIds, serializeStable } from '@/lib/agents/adl';
import type { AgentDefinition } from '@/lib/agents/adl';

const VALID = {
  id: 'demo-agent',
  version: '1.0.0',
  purpose: 'Demonstrate the definition format.',
  autonomyTier: 'HITL',
  escalationPolicyRef: 'default',
  phiPosture: 'references-only',
  owningModule: 'src/lib/agents/demo',
  toolAllowlist: ['person-context.read', 'work-queue.submit'],
  // `taskKind: 'demo'` sat here and this fixture was called WELL-FORMED. It was not:
  // 'demo' is not in the dispatcher's vocabulary, so the artifact this definition
  // compiles to would have been rejected by `parseAgentRouting` at module load. The
  // suite asserted validity the shipped loader did not agree with.
  routes: [
    { id: 'demo-route', taskKind: 'outreach', dispatchOrder: 10, match: { kindPrefix: 'demo' } },
  ],
  body: { kind: 'module', owningModule: 'src/lib/agents/demo' },
};

function refuse(mutate: (d: Record<string, unknown>) => void, code: string): void {
  const raw = JSON.parse(JSON.stringify(VALID)) as Record<string, unknown>;
  mutate(raw);
  try {
    parseAgentDefinition(raw, 'demo.agent.json');
    throw new Error('expected AdlError');
  } catch (err) {
    expect(err).toBeInstanceOf(AdlError);
    expect((err as AdlError).code).toBe(code);
  }
}

describe('parseAgentDefinition', () => {
  it('accepts a well-formed definition', () => {
    const def = parseAgentDefinition(VALID, 'demo.agent.json');
    expect(def.id).toBe('demo-agent');
    expect(def.toolAllowlist).toEqual(['person-context.read', 'work-queue.submit']);
    expect(def.body.kind).toBe('module');
  });

  it('refuses a non-object', () => {
    expect(() => parseAgentDefinition(null, 'x')).toThrow(AdlError);
    expect(() => parseAgentDefinition([], 'x')).toThrow(AdlError);
  });

  it('refuses a missing id', () => refuse((d) => delete d.id, 'ADL_SHAPE'));
  it('refuses an unknown autonomy tier', () =>
    refuse((d) => (d.autonomyTier = 'godmode'), 'ADL_SHAPE'));
  it('refuses an unknown phi posture', () => refuse((d) => (d.phiPosture = 'some'), 'ADL_SHAPE'));
  it('refuses a non-array toolAllowlist', () =>
    refuse((d) => (d.toolAllowlist = 'all'), 'ADL_SHAPE'));
  it('refuses a non-array routes', () => refuse((d) => (d.routes = {}), 'ADL_SHAPE'));

  // Route precedence is first-match dispatch. A route with no authored order
  // would have to fall back to read order, which is exactly what dispatchOrder
  // exists to remove — so an unordered route is refused, not defaulted.
  it('refuses a route with no dispatchOrder', () =>
    refuse((d) => delete (d.routes as Record<string, unknown>[])[0]!.dispatchOrder, 'ADL_SHAPE'));
  it('refuses a fractional dispatchOrder', () =>
    refuse((d) => ((d.routes as Record<string, unknown>[])[0]!.dispatchOrder = 1.5), 'ADL_SHAPE'));
  it('refuses a negative dispatchOrder', () =>
    refuse((d) => ((d.routes as Record<string, unknown>[])[0]!.dispatchOrder = -1), 'ADL_SHAPE'));

  it('refuses free text where a tool code belongs', () =>
    refuse((d) => (d.toolAllowlist = ['Send An Email To The Member']), 'ADL_FREE_TEXT'));

  /**
   * The failure this closes: a kind outside the dispatcher's closed vocabulary used
   * to parse here, compile, emit, and pass `adl:check` byte-identically — and then
   * `parseAgentRouting` threw on the emitted artifact at MODULE LOAD, which is before
   * any dispatch, so the blast radius was every dispatch in the process rather than
   * the one new route. `ADL_SHAPE` at authoring time is the whole point.
   */
  it('refuses a taskKind outside the dispatcher vocabulary', () =>
    refuse((d) => ((d.routes as { taskKind: string }[])[0].taskKind = 'bh-triage'), 'ADL_SHAPE'));

  it("refuses phiPosture 'full' with no explicit override", () =>
    refuse((d) => (d.phiPosture = 'full'), 'ADL_PHI_OVERRIDE_REQUIRED'));

  it("accepts phiPosture 'full' only with an explicit override", () => {
    const raw = {
      ...VALID,
      phiPosture: 'full',
      phiFullOverride: { approvedBy: 'compliance', ticketRef: 'SEC-1' },
    };
    const def = parseAgentDefinition(raw, 'x');
    expect(def.phiFullOverride?.ticketRef).toBe('SEC-1');
  });

  it('refuses a declarative steps body while the interpreter is blocked', () =>
    refuse((d) => (d.body = { kind: 'steps', steps: [] }), 'ADL_UNSUPPORTED_BODY'));

  it('carries the JSON path in the error message', () => {
    try {
      parseAgentDefinition({ ...VALID, id: '' }, 'outreach.agent.json');
    } catch (err) {
      expect((err as AdlError).path).toBe('outreach.agent.json.id');
    }
  });
});

describe('assertUniqueIds', () => {
  it('refuses a duplicate agent id', () => {
    const a = parseAgentDefinition(VALID, 'a') as AgentDefinition;
    expect(() => assertUniqueIds([a, a])).toThrow(AdlError);
  });
  it('accepts distinct ids', () => {
    const a = parseAgentDefinition(VALID, 'a');
    const b = parseAgentDefinition({ ...VALID, id: 'other-agent' }, 'b');
    expect(() => assertUniqueIds([a, b])).not.toThrow();
  });
});

describe('serializeStable', () => {
  it('is independent of key insertion order', () => {
    expect(serializeStable({ b: 1, a: 2 })).toBe(serializeStable({ a: 2, b: 1 }));
  });
  it('is idempotent', () => {
    const once = serializeStable(VALID);
    expect(serializeStable(JSON.parse(once))).toBe(once);
  });
  it('preserves array order', () => {
    expect(serializeStable({ xs: [3, 1, 2] })).toContain('3');
    expect(JSON.parse(serializeStable({ xs: [3, 1, 2] })).xs).toEqual([3, 1, 2]);
  });
  it('ends with exactly one trailing newline', () => {
    const out = serializeStable({ a: 1 });
    expect(out.endsWith('}\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});
