/**
 * A RETRY THAT REASONS DIFFERENTLY IS A GOVERNANCE EVENT.
 *
 * Durable workflows retry activities. Retrying a pure activity is invisible and
 * correct. Retrying one with a model in it is not: if the second call answers
 * differently and the workflow takes the newer answer, the run's history no
 * longer explains its own outcome — a member could be denied on reasoning the
 * evidence record does not contain.
 */
import { describe, expect, it } from 'vitest';
import {
  createPromptRegistry,
  createReasoningLedger,
  ReasoningDivergenceError,
  runReasoningStep,
  type ReasoningStepDeps,
  type ReasoningStepInput,
} from '@/lib/agents/reasoning';
import { nodeDigest } from '@/lib/agents/reasoning/nodeDigest';
import { createRecordedReasoner, type ReasoningOutput } from '@/lib/agents/seams';

const TEXT = 'Summarise open care gaps as codes.';
const REGISTRY = createPromptRegistry(
  [{ id: 'p1', version: '1.0.0', text: TEXT, pinnedHash: nodeDigest(TEXT) }],
  nodeDigest
);
const BINDING = REGISTRY.resolve('p1', '1.0.0');
const KEY = { workflowId: 'wf/1', stepId: 'reason/1' };

const input = (over: Partial<ReasoningStepInput> = {}): ReasoningStepInput => ({
  binding: BINDING,
  stepKey: KEY,
  refs: { member: 'Patient/123' },
  offeredTools: ['person-context.read'],
  ...over,
});

const out = (careGap: string): ReasoningOutput => ({
  suggestedRefs: { careGap },
  toolRequests: ['person-context.read'],
  producedBy: { promptId: 'p1', promptVersion: '1.0.0', modelId: 'recorded' },
});

const deps = (o: ReasoningOutput, over: Partial<ReasoningStepDeps> = {}): ReasoningStepDeps => ({
  reasoner: createRecordedReasoner({ p1: o }),
  grantedTools: ['person-context.read'],
  isReadOnlyTool: () => true,
  maxToolRequests: 3,
  maxSuggestedRefs: 8,
  nowMs: 1_700_000_000_000,
  ledger: createReasoningLedger(),
  digest: nodeDigest,
  ...over,
});

describe('reasoning is idempotent per (workflowId, stepId)', () => {
  it('records the first result and reports it as recorded', async () => {
    const l = createReasoningLedger();
    const r = await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    expect(r.outcome).toBe('recorded');
    expect(r.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(l.recorded(KEY)).toBe(r.resultDigest);
  });

  it('an identical retry replays rather than re-recording', async () => {
    const l = createReasoningLedger();
    const first = await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    const again = await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    expect(again.outcome).toBe('replayed');
    expect(again.resultDigest).toBe(first.resultDigest);
    expect(l.size()).toBe(1);
  });

  it('a retry that answers differently raises instead of silently winning', async () => {
    const l = createReasoningLedger();
    await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    await expect(
      runReasoningStep(input(), deps(out('bp-uncontrolled'), { ledger: l }))
    ).rejects.toThrowError(ReasoningDivergenceError);
  });

  it('produces NO facts when a retry diverges — the caller cannot swallow and keep them', async () => {
    const l = createReasoningLedger();
    await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    let leaked: unknown = 'no result';
    try {
      leaked = await runReasoningStep(input(), deps(out('bp-uncontrolled'), { ledger: l }));
    } catch {
      /* expected */
    }
    expect(leaked).toBe('no result');
  });

  it('a different step in the same run has its own key', async () => {
    const l = createReasoningLedger();
    await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    const other = await runReasoningStep(
      input({ stepKey: { workflowId: 'wf/1', stepId: 'reason/2' } }),
      deps(out('bp-uncontrolled'), { ledger: l })
    );
    expect(other.outcome).toBe('recorded');
    expect(l.size()).toBe(2);
  });

  it('the same step in a different run is a different key', async () => {
    const l = createReasoningLedger();
    await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    const other = await runReasoningStep(
      input({ stepKey: { workflowId: 'wf/2', stepId: 'reason/1' } }),
      deps(out('bp-uncontrolled'), { ledger: l })
    );
    expect(other.outcome).toBe('recorded');
  });
});

describe('the digest covers the step inputs, not only the answer', () => {
  it('the SAME answer for a DIFFERENT member is not a replay', async () => {
    const l = createReasoningLedger();
    await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    // Same workflow, same stepId, same answer — different member. Treating this
    // as a replay would let the record assert that reasoning about Patient/456
    // reproduced reasoning about Patient/123.
    await expect(
      runReasoningStep(
        input({ refs: { member: 'Patient/456' } }),
        deps(out('hba1c-overdue'), { ledger: l })
      )
    ).rejects.toThrowError(ReasoningDivergenceError);
  });

  it('the SAME answer with a different offered tool set is not a replay', async () => {
    const l = createReasoningLedger();
    await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    await expect(
      runReasoningStep(
        input({ offeredTools: ['person-context.read', 'referral-status.read'] }),
        deps(out('hba1c-overdue'), {
          ledger: l,
          grantedTools: ['person-context.read', 'referral-status.read'],
        })
      )
    ).rejects.toThrowError(ReasoningDivergenceError);
  });

  it('offered-tool ORDER is not significant — the same set replays', async () => {
    const l = createReasoningLedger();
    const tools = ['person-context.read', 'referral-status.read'];
    const d = (o: ReasoningOutput) => deps(o, { ledger: l, grantedTools: tools });
    await runReasoningStep(input({ offeredTools: tools }), d(out('hba1c-overdue')));
    const again = await runReasoningStep(
      input({ offeredTools: [...tools].reverse() }),
      d(out('hba1c-overdue'))
    );
    expect(again.outcome).toBe('replayed');
  });
});

describe('every boundary check runs before the ledger records', () => {
  /**
   * Recording first and validating after fails both ways. An output that then
   * breaches a budget would poison the key — every later legitimate retry
   * diverges against a digest the system itself rejected. And a breach caught
   * BEFORE the ledger could be retried without bound until one output happened
   * to pass, so the 'first' recorded result is merely the first lucky one.
   */
  it('a budget breach leaves the ledger untouched, so a valid retry still records', async () => {
    const l = createReasoningLedger();
    const tooMany: ReasoningOutput = {
      suggestedRefs: { a: '1', b: '2', c: '3' },
      toolRequests: [],
      producedBy: { promptId: 'p1', promptVersion: '1.0.0', modelId: 'recorded' },
    };
    await expect(
      runReasoningStep(input(), deps(tooMany, { ledger: l, maxSuggestedRefs: 2 }))
    ).rejects.toThrowError(/fact-budget-exceeded/);
    expect(l.size()).toBe(0);

    const ok = await runReasoningStep(input(), deps(out('hba1c-overdue'), { ledger: l }));
    expect(ok.outcome).toBe('recorded');
  });

  it('an unsafe fact key leaves the ledger untouched', async () => {
    const l = createReasoningLedger();
    const bad: ReasoningOutput = {
      suggestedRefs: JSON.parse('{"__proto__":"x"}') as Record<string, string>,
      toolRequests: [],
      producedBy: { promptId: 'p1', promptVersion: '1.0.0', modelId: 'recorded' },
    };
    await expect(runReasoningStep(input(), deps(bad, { ledger: l }))).rejects.toThrowError(
      /fact-key-not-a-code/
    );
    expect(l.size()).toBe(0);
  });
});
