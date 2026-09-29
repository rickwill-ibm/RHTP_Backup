/**
 * The routing hand validator's SHAPE GUARDS, pinned against the mutants that survived.
 *
 * THE E13 FINDING. Adding `routingSchema.ts` to the mutation targets returned **4/8 killed
 * (50%)**, and all four survivors were the same operator on the same kind of line:
 *
 *   SURVIVED [&& -> ||]  req(data && typeof data === 'object', 'root', …)
 *   SURVIVED [&& -> ||]  req(typeof o.version === 'string' && o.version.length > 0, …)
 *   SURVIVED [&& -> ||]  req(r && typeof r === 'object', `routes[${i}]`, …)
 *   SURVIVED [&& -> ||]  req(typeof o.id === 'string' && o.id.length > 0, …)
 *
 * WHY THE EXISTING TESTS COULD NOT KILL THEM — and this is the whole lesson. Flipping `&&`
 * to `||` in a shape guard only changes behaviour for a **truthy non-conforming** value:
 *
 *   data = null   →  `null && …` false, `null || …` false.   Both throw. Mutant survives.
 *   data = 'x'    →  `'x' && typeof 'x' === 'object'` false, `'x' || …` TRUTHY. Diverges.
 *   version = ''  →  `typeof '' === 'string' && ''.length > 0` false, but `… || …` TRUTHY.
 *
 * So a validator suite that only ever feeds `null`, `undefined` or a missing key proves the
 * guard rejects falsy junk and proves NOTHING about the conjunct. `dispatcher.test.ts`'s
 * `malformed routing data refuses loudly` fed `{ routes: [{ id: 'x' }] }` — a MISSING field,
 * killed by the other half of the guard. Every case below is deliberately a truthy value of
 * the wrong shape, or an empty string, because those are the only inputs that can tell the
 * two operators apart.
 *
 * This matters beyond the mutation score: `parseAgentRouting` runs at MODULE LOAD, so a
 * guard that lets a malformed table through does not fail one route — it either throws
 * later with the wrong field named, or hands the dispatcher a route object whose `agentId`
 * is `undefined` and whose signals then reach `getAgentManifest(undefined)`.
 */
import { describe, expect, it } from 'vitest';
import { AgentRoutingError, parseAgentRouting } from '@/lib/agents/dispatch';

/** A routing table that parses, so each mutation below is the ONLY thing wrong. */
const VALID = {
  version: '1.0.0',
  routes: [
    {
      id: 'r-out',
      agentId: 'outreach-agent',
      taskKind: 'outreach',
      match: { actionability: 'member-outreach' },
    },
  ],
};

const clone = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(VALID)) as Record<string, unknown>;

/** Assert the parse refuses, and refuses AT the field named — precision, not recall. */
function refusesAt(data: unknown, field: RegExp): void {
  let err: unknown = null;
  try {
    parseAgentRouting(data);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(AgentRoutingError);
  expect((err as AgentRoutingError).field).toMatch(field);
}

describe('the routing blob itself must be an object — truthy non-objects included', () => {
  it('refuses a STRING, which is truthy (the input that kills && -> ||)', () => {
    refusesAt('{"version":"1.0.0"}', /^root$/);
  });

  it('refuses a NUMBER', () => {
    refusesAt(42, /^root$/);
  });

  it('refuses null, and still names root', () => {
    refusesAt(null, /^root$/);
  });
});

describe('version must be a NON-EMPTY string', () => {
  it("refuses the empty string — `typeof '' === 'string'` is true, so only length can reject it", () => {
    const d = clone();
    d.version = '';
    refusesAt(d, /^version$/);
  });

  it('refuses a number where a version string belongs', () => {
    const d = clone();
    d.version = 1;
    refusesAt(d, /^version$/);
  });
});

describe('each route must be an object — truthy non-objects included', () => {
  it('refuses a STRING route entry, naming its index', () => {
    const d = clone();
    d.routes = ['r-out'];
    refusesAt(d, /^routes\[0\]$/);
  });

  it('refuses a NUMBER route entry', () => {
    const d = clone();
    d.routes = [7];
    refusesAt(d, /^routes\[0\]$/);
  });

  it('refuses a non-array routes, even a truthy one', () => {
    const d = clone();
    d.routes = { 'r-out': {} };
    refusesAt(d, /^routes$/);
  });
});

describe('route id and agentId must be NON-EMPTY strings', () => {
  it('refuses an empty id — only the length check can reject it', () => {
    const d = clone();
    (d.routes as { id: string }[])[0].id = '';
    refusesAt(d, /^routes\[0\]\.id$/);
  });

  it('refuses an empty agentId, which would otherwise reach getAgentManifest("")', () => {
    const d = clone();
    (d.routes as { agentId: string }[])[0].agentId = '';
    refusesAt(d, /^routes\[0\]\.agentId$/);
  });
});

describe('the PA template is checked against the CLOSED machine vocabularies', () => {
  const paRoute = (pa: unknown): Record<string, unknown> => ({
    version: '1.0.0',
    routes: [
      {
        id: 'r-pa',
        agentId: 'pa-documentation-agent',
        taskKind: 'pa',
        match: { kindPrefix: 'denial' },
        pa,
      },
    ],
  });

  it("refuses a state that differs only in CASE — 'denied' is not 'Denied'", () => {
    // `transition()` fails SOFT on an unknown state: it returns `{ state: current, error }`
    // rather than throwing, and `paAgent` used to report `outcome: 'executed'` anyway. The
    // authoring layer is the only place this can be stopped before it becomes a false record.
    refusesAt(
      paRoute({ currentState: 'denied', advanceEvent: { type: 'appeal' } }),
      /^routes\[0\]\.pa\.currentState$/
    );
  });

  it('refuses an advance event the machine does not define', () => {
    refusesAt(
      paRoute({ currentState: 'Denied', advanceEvent: { type: 'auto-approve' } }),
      /^routes\[0\]\.pa\.advanceEvent\.type$/
    );
  });

  it('refuses an advanceEvent that is a truthy non-object', () => {
    refusesAt(
      paRoute({ currentState: 'Denied', advanceEvent: 'appeal' }),
      /^routes\[0\]\.pa\.advanceEvent/
    );
  });

  it('ACCEPTS the legal template, so the guards above are not simply refusing everything', () => {
    const parsed = parseAgentRouting(
      paRoute({ currentState: 'Denied', advanceEvent: { type: 'appeal' } })
    );
    expect(parsed.routes[0]?.pa?.currentState).toBe('Denied');
    expect(parsed.routes[0]?.pa?.advanceEvent.type).toBe('appeal');
  });
});
