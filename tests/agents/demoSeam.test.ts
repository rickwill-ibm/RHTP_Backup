/**
 * The `agentRuntime` seam accessor — ONE DOOR, a DERIVED label, a PARSED outcome.
 *
 * Three properties are pinned here, each closing a defect the previous wave left:
 *
 *   ONE DOOR — `getAgentDemoActions()` returns the actions AND the disclosure
 *     record of the SAME run, so the production caller no longer has to route
 *     around the seam its own disposition manifest declares. While the accessor
 *     returned only `{ actions, mode }`, the route called `runRealAgentDemo()`
 *     directly on the production path and the declared resolver was reached by a
 *     test and nothing else — the E1 dead-wiring shape, inside E1's own manifest.
 *
 *   `emergent` IS DERIVED — never a literal chosen per branch. It is computed from
 *     two independent observable facts (a ledger exists; the actions are not the
 *     authored module singleton), so `emergent: true` with no ledger, and a real
 *     run reported as `emergent: false`, are both unrepresentable.
 *
 *   ONE MODE READ — `agentRuntimeMode()` reads a mutable process-global written by
 *     a live UI toggle. Two reads per request means the toggle can flip between
 *     them and a real run can be reported as mock: a real disclosure ledger,
 *     including any deny, dropped while the payload asserts no ledger exists.
 *
 * And the outcome is PARSED, not cast. The projection defaulted an unrecognised
 * workflow result to `'executed'` — the affirmative — so a `deduped` or
 * `resolved-no-action` run told an auditor an outreach was sent to a member when
 * nothing was sent.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getAgentDemoActions,
  authoredAgentActions,
  isEmergent,
  parseDemoOutcome,
  AGENT_DEMO_OUTCOMES,
} from '@/lib/agents/demo';
import { SEAM_DISPOSITIONS } from '@/lib/config/seamDispositions';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import { resetDefaultIdempotencyStore } from '@/lib/idempotency';

/**
 * Count every read of the seam's mode. The factory delegates to the real
 * implementation, so nothing about the run changes — only the read is observable.
 */
const modeReads = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/lib/agentRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agentRuntime')>();
  return {
    ...actual,
    agentRuntimeMode: () => {
      modeReads.n += 1;
      return actual.agentRuntimeMode();
    },
  };
});

afterEach(() => {
  clearSessionDataModes();
  // ISOLATION (2026-09-29, found by g_shuffle). SEVEN tests in this file trigger a production
  // real run, and the outreach agent's send-once guard is backed by a PROCESS-GLOBAL store
  // (`defaultIdempotencyStore()`), not by per-test state. In declared order the
  // `every(outcome === 'executed')` case ran first and saw a clean store; `--sequence.shuffle`
  // shuffles tests WITHIN a file, so any of the other six marked the touchpoint first and that
  // case saw `deduped` - a test that measured run order, not the runtime.
  //
  // The dedupe itself is CORRECT product behaviour (NS-04, the republish case) and is asserted
  // deliberately in `parseDemoOutcome` below. The defect was one marker set shared across
  // independent cases. Five sibling test files already reset this store in teardown
  // (orderToCashIdempotency, orderToCashRecovery, orderToCashRecoveryPriority,
  // recoveryDecisionRoute, seamFailClosed); this file did not.
  resetDefaultIdempotencyStore();
});

describe('agentRuntime demo seam (mock authored actions vs real runtime)', () => {
  it('mock mode returns the authored agent actions (the demo stays green)', async () => {
    setSessionDataMode('agentRuntime', 'mock');
    const { actions, mode } = await getAgentDemoActions();
    expect(mode).toBe('mock');
    expect(actions).toEqual(authoredAgentActions());
    expect(actions.map((a) => a.agentId)).toEqual([
      'outreach-agent',
      'referral-coordination-agent',
      'pa-documentation-agent',
    ]);
  });

  it('production mode runs the real agents; the emergent actions match the authored parity', async () => {
    setSessionDataMode('agentRuntime', 'production');
    const { actions, mode } = await getAgentDemoActions();
    expect(mode).toBe('production');
    // Emergent from SDE -> dispatcher -> agents -> HITL approve -> executed.
    expect(actions.every((a) => a.outcome === 'executed')).toBe(true);
    expect(actions).toEqual(authoredAgentActions()); // authored == emergent (parity)
  });
});

describe('ONE DOOR — the accessor returns the disclosure record of its own run', () => {
  it('production hands back the ledger, so no caller has to re-run for it', async () => {
    setSessionDataMode('agentRuntime', 'production');
    const view = await getAgentDemoActions();
    expect(view.disclosures).not.toBeNull();
    expect(view.disclosures?.decisions.length).toBeGreaterThan(0);
    expect(Array.isArray(view.disclosures?.refusals)).toBe(true);
  });

  it('mock/seeded carry NO ledger — authored actions were never disclosed', async () => {
    for (const mode of ['mock', 'seeded'] as const) {
      setSessionDataMode('agentRuntime', mode);
      const view = await getAgentDemoActions();
      expect(view.mode).toBe(mode);
      expect(view.disclosures).toBeNull();
    }
  });

  it('keeps nothing between runs — two calls carry two distinct ledgers', async () => {
    setSessionDataMode('agentRuntime', 'production');
    const first = await getAgentDemoActions();
    const second = await getAgentDemoActions();
    expect(first.disclosures?.decisions).not.toBe(second.disclosures?.decisions);
    expect(first.disclosures?.decisions.length).toBe(second.disclosures?.decisions.length);
  });

  it('the disposition manifest names THIS accessor as the production resolver', () => {
    // The manifest claim and the accessor's shape are pinned together: an entry
    // naming a resolver that cannot serve its caller is how E1 dead wiring starts.
    const entry = SEAM_DISPOSITIONS.agentRuntime;
    expect(entry.productionResolverRef).toMatch(/getAgentDemoActions\(\)/);
    expect(entry.disposition).toBe('real-impl');
  });
});

describe('`emergent` is DERIVED from the run, never asserted per branch', () => {
  it('production derives true; mock and seeded derive false', async () => {
    setSessionDataMode('agentRuntime', 'production');
    expect((await getAgentDemoActions()).emergent).toBe(true);
    for (const mode of ['mock', 'seeded'] as const) {
      setSessionDataMode('agentRuntime', mode);
      expect((await getAgentDemoActions()).emergent).toBe(false);
    }
  });

  it('emergent and a present ledger cannot disagree, in any mode', async () => {
    for (const mode of ['mock', 'seeded', 'production'] as const) {
      setSessionDataMode('agentRuntime', mode);
      const view = await getAgentDemoActions();
      expect(view.emergent).toBe(view.disclosures !== null);
    }
  });

  it('the authored singleton is never emergent, even handed a ledger', () => {
    // Both facts must hold. A ledger alone cannot promote the authored array —
    // which is what makes this a derivation rather than a second assertion.
    expect(isEmergent(authoredAgentActions(), { decisions: [], refusals: [] })).toBe(false);
    expect(isEmergent([], null)).toBe(false);
    expect(isEmergent([...authoredAgentActions()], { decisions: [], refusals: [] })).toBe(true);
  });
});

describe('ONE MODE READ — a live toggle cannot flip mid-request', () => {
  it('resolves the seam mode exactly once per accessor call', async () => {
    for (const mode of ['mock', 'seeded', 'production'] as const) {
      setSessionDataMode('agentRuntime', mode);
      modeReads.n = 0;
      await getAgentDemoActions();
      expect(modeReads.n, `${mode} must resolve the mode once`).toBe(1);
    }
  });
});

describe('parseDemoOutcome — parse, do not cast, and never default affirmative', () => {
  it('carries every outcome the shipped agent result unions can return', () => {
    // outreach: executed | rejected | suppressed | deduped
    // referral: executed | rejected | resolved-no-action | deduped
    // pa:       executed | rejected
    for (const outcome of ['executed', 'rejected', 'suppressed', 'deduped', 'resolved-no-action']) {
      expect(parseDemoOutcome({ outcome })).toBe(outcome);
    }
  });

  it('maps a DEDUPED run to deduped — the second POST in a process sent nothing', () => {
    // The default idempotency store is a process-wide singleton, so this is the
    // reachable case that told an auditor an outreach was sent when it was not.
    expect(parseDemoOutcome({ outcome: 'deduped', touchpointId: 't1', decidedBy: 'x' })).toBe(
      'deduped'
    );
  });

  it('maps every unrecognised shape to the NEGATIVE sink, never to executed', () => {
    const unrecognised: unknown[] = [
      undefined, // a positional zip that came up short
      null,
      {}, // a result shape with no outcome at all
      { outcome: undefined },
      { outcome: 'failed' },
      { outcome: 'Executed' }, // casing is not a match
      { outcome: 42 },
      { outcome: null },
      'executed', // a bare string is not a result object
      [{ outcome: 'executed' }],
    ];
    for (const [i, input] of unrecognised.entries()) {
      expect(parseDemoOutcome(input), `unrecognised[${String(i)}]`).toBe('unknown');
    }
  });

  it('the union is closed — every member is one of the declared outcomes', () => {
    expect([...AGENT_DEMO_OUTCOMES]).toContain('unknown');
    expect([...AGENT_DEMO_OUTCOMES]).not.toContain('');
    // NOTE: the loop below is deliberately weak and kept only as a smoke check.
    // `parseDemoOutcome` IS `AGENT_DEMO_OUTCOMES.includes(raw)`, so iterating the array the
    // implementation tests membership against restates the implementation — it passed with
    // no new evidence the moment `not-advanced` was added. The assertion that carries the
    // weight is the derivation test below.
    for (const o of AGENT_DEMO_OUTCOMES) expect(parseDemoOutcome({ outcome: o })).toBe(o);
  });

  /**
   * THE DERIVATION IS NOW GATED, not just documented. `AGENT_DEMO_OUTCOMES`'s docstring
   * claims it is "DERIVED FROM THE SHIPPED RESULT UNIONS, not invented here" and then
   * enumerates them in prose — and that prose went stale the moment `PaResult` gained
   * `not-advanced`, claiming `pa returns executed | rejected` while the list below it
   * carried three. A derivation claim in a comment is a claim; this makes it a test.
   *
   * The three arrays are the shipped result unions, restated here ONCE. If a result type
   * gains a member and this enum does not, the set comparison fails and names the gap —
   * which is exactly what did not happen when `not-advanced` landed.
   */
  it('EQUALS the union of the three shipped result vocabularies — the docstring, as a test', () => {
    const OUTREACH = ['executed', 'rejected', 'suppressed', 'deduped'] as const;
    const REFERRAL = ['executed', 'rejected', 'resolved-no-action', 'deduped'] as const;
    const PA = ['executed', 'not-advanced', 'rejected'] as const;

    const derived = new Set<string>([...OUTREACH, ...REFERRAL, ...PA]);
    // `unknown` is the projection's own negative sink for "this projection cannot say",
    // documented as such on the enum. It is not derived from any agent.
    derived.add('unknown');
    // `abandoned` is the RUNTIME's terminal, not an agent's: the escalation ladder exhausted and
    // `terminateInstance` resolved `handle.done` with `{outcome:'abandoned'}` while the body was
    // still suspended. So it reaches this projection without passing through any result union, and
    // it is deliberately NOT folded into `unknown` — `unknown` means the projection cannot say, and
    // here the runtime knows exactly what happened. This gate caught the addition, which is the
    // derivation doing its job; the correct response was to widen the derivation with a stated
    // reason, not to widen the enum quietly.
    derived.add('abandoned');

    expect(new Set<string>([...AGENT_DEMO_OUTCOMES])).toEqual(derived);
    expect(AGENT_DEMO_OUTCOMES.length).toBe(derived.size);
  });

  it('the real run only ever reports a declared outcome', async () => {
    setSessionDataMode('agentRuntime', 'production');
    const { actions } = await getAgentDemoActions();
    for (const a of actions) expect([...AGENT_DEMO_OUTCOMES]).toContain(a.outcome);
  });
});
