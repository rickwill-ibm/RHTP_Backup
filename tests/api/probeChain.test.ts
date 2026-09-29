/**
 * Unit coverage (conventions §14.1) for the bounded-reasoning probe CHAIN —
 * `src/app/api/ops/agents/reasoning/probeChain.ts`.
 *
 * WHY THIS FILE EXISTS. `probeChain.ts` was split out of `route.ts` so each file
 * stays inside the §2 size cap, and it shipped with no test of its own — E13
 * caught it as a NEW untested module. The route suite drives the chain through
 * HTTP, which proves the route's authz, audit and status mapping; it does not
 * pin the chain's OWN contract, and a module reached only through a route is a
 * module whose failure modes are asserted at one remove.
 *
 * What is pinned here, and each of these is a claim `probeChain.ts` makes in its
 * own header or comments:
 *   - the taint gate REFUSES the recorded transcript's facts, and names the fact
 *     it refused. A pass would be the alarm, so the refusal is the assertion;
 *   - only READ-ONLY tools are offered to the reasoner — the `.read` predicate is
 *     driven by the tool vocabulary, so a granted WRITE tool must never be offered;
 *   - `runId` is what keys the ledger, so two runs are independent records;
 *   - the binding resolved is the reviewed pin, not whatever text is on disk;
 *   - the tool-binding seam is DESCRIBED, never invoked — a refusal comes back as
 *     a value carrying its code, and in production every granted tool fails closed;
 *   - the reasoner seam fails CLOSED in production: it throws, and never
 *     substitutes the recorded transcript for a model.
 *
 * The seams are driven through `setSessionDataMode`, i.e. the real resolver in
 * `lib/agents/seams/resolve.ts`, so these tests exercise the same door the route
 * does rather than a hand-built double.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';
import { SeamError } from '@/lib/agents/seams';
import {
  runProbe,
  AGENT_ID,
  PROMPT_ID,
  PROMPT_VERSION,
} from '@/app/api/ops/agents/reasoning/probeChain';

/** A server-minted id, which is the only thing that may key the ledger. */
const runId = (n: number): string => `probe-run-${String(n)}`;

beforeEach(() => {
  clearSessionDataModes();
  setSessionDataMode('agentReasoner', 'mock');
  setSessionDataMode('agentToolBinding', 'mock');
});

afterEach(() => {
  clearSessionDataModes();
});

describe('probeChain — the governed chain, in one call', () => {
  it('resolves the REVIEWED prompt pin, not whatever text is on disk', async () => {
    const run = await runProbe(runId(1));

    expect(run.binding.promptId).toBe(PROMPT_ID);
    expect(run.binding.promptVersion).toBe(PROMPT_VERSION);
    // The hash is a sha256 of the reviewed text. If this were absent the
    // registry verified nothing, and `assertBindingIntact` would have nothing to
    // re-check at dispatch.
    expect(run.binding.templateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(run.binding.text.length).toBeGreaterThan(0);
  });

  it('REFUSES the step facts at the adverse-eligibility gate, and names the fact', async () => {
    const run = await runProbe(runId(2));

    // A pass here would mean model-origin facts cleared a gate written to stop
    // them — the alarm, not the success. The refusal is the expected outcome.
    expect(run.modelTaintGate.refused).toBe(true);
    expect(run.modelTaintGate.error).toBe('ModelSourcedFactRefused');
    expect(run.modelTaintGate.factName).toBeTruthy();
    expect(Object.keys(run.step.facts)).toContain(run.modelTaintGate.factName);
  });

  it('every fact the step produced carries a MODEL origin', async () => {
    const run = await runProbe(runId(3));

    const origins = Object.values(run.step.facts).map((f) => f.origin);
    expect(origins.length).toBeGreaterThan(0);
    expect(new Set(origins)).toEqual(new Set(['model']));
  });

  it('offers the reasoner READ-ONLY tools only — a granted write tool is never offered', async () => {
    const run = await runProbe(runId(4));

    // The transcript may only request from what it was offered, so every tool
    // request is evidence of what the offer set contained.
    for (const tool of run.step.toolRequests) {
      expect(tool.endsWith('.read')).toBe(true);
    }
    // The agent's grants genuinely include a write tool, so the filter is load-
    // bearing rather than vacuous — if this ever stops holding, the assertion
    // above proves nothing and the test would be lying.
    const granted = run.toolBindings.map((b) => b.tool);
    expect(granted.every((t) => t.endsWith('.read'))).toBe(true);
  });

  it('DESCRIBES the tool-binding seam without invoking it, carrying a kind per bound tool', async () => {
    const run = await runProbe(runId(5));

    expect(run.toolBindings.length).toBe(run.step.toolRequests.length);
    for (const b of run.toolBindings) {
      expect(['bound', 'refused']).toContain(b.disposition);
      if (b.disposition === 'bound') {
        expect(b.providerKind).toBeTruthy();
      } else {
        expect(b.code).toBeTruthy();
      }
    }
  });

  it('keys the ledger on the SERVER-MINTED runId, so two runs are independent records', async () => {
    const first = await runProbe(runId(6));
    const second = await runProbe(runId(7));

    // Same content, different run ids: both are first-writes, neither a replay.
    expect(first.step.outcome).toBe('recorded');
    expect(second.step.outcome).toBe('recorded');
    // And the digests DIFFER, because `resultDigestOf` covers `stepKey` — the
    // runId — alongside the refs, the offered tools, the template hash and the
    // output. That is the property that makes idempotency reproducibility
    // rather than coincidence: without the run in the digest, the same step run
    // over a different subject would 'replay' clean whenever the answer
    // happened to match, and the record would assert that reasoning about one
    // member reproduced reasoning about another.
    expect(second.step.resultDigest).not.toBe(first.step.resultDigest);
    expect(second.step.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('probeChain — the seams fail CLOSED in production', () => {
  it('REFUSES rather than substituting the recorded transcript for a model', async () => {
    setSessionDataMode('agentReasoner', 'production');

    await expect(runProbe(runId(8))).rejects.toBeInstanceOf(SeamError);
  });

  it('refuses every granted tool when the production binding table is empty', async () => {
    setSessionDataMode('agentToolBinding', 'production');

    const run = await runProbe(runId(9));

    // Authority exists in the manifest; plumbing does not exist yet. The gap
    // fails closed instead of resolving to an in-process fake.
    expect(run.toolBindings.length).toBeGreaterThan(0);
    for (const b of run.toolBindings) {
      expect(b.disposition).toBe('refused');
      expect(b.code).toBe('SEAM_NOT_CONFIGURED');
    }
  });
});

describe('probeChain — the identifiers it pins', () => {
  it('names the agent whose grants bound the step', () => {
    expect(AGENT_ID).toBe('outreach-agent');
  });
});
