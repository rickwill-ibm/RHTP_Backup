/**
 * The reasoning boundary. Reasoning is an effect: it may read, it may suggest,
 * it may never act — and everything it touches is marked model-origin so the
 * adverse-determination path refuses it by construction.
 */
import { describe, expect, it } from 'vitest';
import { createRecordedReasoner, type ReasoningOutput } from '@/lib/agents/seams';
import {
  createPromptRegistry,
  createReasoningLedger,
  ReasoningBoundaryError,
  runReasoningStep,
  type ReasoningStepDeps,
  type ReasoningStepInput,
} from '@/lib/agents/reasoning';
import { nodeDigest } from '@/lib/agents/reasoning/nodeDigest';
import {
  assertAdverseEligible,
  ModelSourcedFactRefused,
} from '@/lib/agents/provenance/factProvenance';

const READ_ONLY = new Set(['person-context.read', 'referral-status.read', 'reconciliation.read']);

const P1_TEXT = 'Summarise the open care gaps for this member using codes only.';
const REGISTRY = createPromptRegistry(
  [{ id: 'p1', version: '1.0.0', text: P1_TEXT, pinnedHash: nodeDigest(P1_TEXT) }],
  nodeDigest
);
const BINDING = REGISTRY.resolve('p1', '1.0.0');
// The provenance id names the template DIGEST, not just the version claiming to be it.
const SOURCE_ID = `p1@1.0.0#${BINDING.templateHash.slice(7, 19)}`;

const INPUT: ReasoningStepInput = {
  binding: BINDING,
  stepKey: { workflowId: 'wf/1', stepId: 'reason/1' },
  refs: { member: 'Patient/123' },
  offeredTools: ['person-context.read'],
};

function deps(output: ReasoningOutput, over: Partial<ReasoningStepDeps> = {}): ReasoningStepDeps {
  return {
    reasoner: createRecordedReasoner({ p1: output }),
    grantedTools: ['person-context.read', 'comms-channel.send'],
    isReadOnlyTool: (t) => READ_ONLY.has(t),
    maxToolRequests: 3,
    maxSuggestedRefs: 8,
    nowMs: 1_700_000_000_000,
    // A fresh ledger per call: each test is one run unless it says otherwise.
    ledger: createReasoningLedger(),
    digest: nodeDigest,
    ...over,
  };
}

const OK: ReasoningOutput = {
  suggestedRefs: { careGap: 'hba1c-overdue' },
  toolRequests: ['person-context.read'],
  producedBy: { promptId: 'p1', promptVersion: '1.0.0', modelId: 'recorded' },
};

describe('the reasoning boundary', () => {
  it('returns model-origin facts stamped with the prompt that produced them', async () => {
    const r = await runReasoningStep(INPUT, deps(OK));
    expect(r.facts.careGap.origin).toBe('model');
    expect(r.facts.careGap.sourceId).toBe(SOURCE_ID);
    expect(r.facts.careGap.value).toBe('hba1c-overdue');
  });

  it('uses the injected timestamp and reads no clock of its own', async () => {
    const r = await runReasoningStep(INPUT, deps(OK, { nowMs: 42 }));
    expect(r.facts.careGap.observedAtMs).toBe(42);
  });

  it('returns tool REQUESTS for the workflow to gate — it calls nothing itself', async () => {
    const r = await runReasoningStep(INPUT, deps(OK));
    expect(r.toolRequests).toEqual(['person-context.read']);
  });

  it('REFUSES to offer a tool the manifest does not grant', async () => {
    const bad = { ...INPUT, offeredTools: ['pa-machine.transition'] };
    await expect(runReasoningStep(bad, deps(OK))).rejects.toMatchObject({
      reason: 'tool-not-granted',
    });
  });

  it('REFUSES to offer a write tool, even when granted', async () => {
    const bad = { ...INPUT, offeredTools: ['comms-channel.send'] };
    await expect(runReasoningStep(bad, deps(OK))).rejects.toBeInstanceOf(ReasoningBoundaryError);
  });

  it('REFUSES a tool request the step did not offer', async () => {
    const sneaky: ReasoningOutput = { ...OK, toolRequests: ['comms-channel.send'] };
    await expect(runReasoningStep(INPUT, deps(sneaky))).rejects.toMatchObject({
      reason: 'tool-not-offered',
    });
  });

  it('REFUSES a request set over the budget — a loop cannot become a storm', async () => {
    const many: ReasoningOutput = {
      ...OK,
      toolRequests: ['person-context.read', 'person-context.read', 'person-context.read'],
    };
    await expect(runReasoningStep(INPUT, deps(many, { maxToolRequests: 2 }))).rejects.toMatchObject(
      { reason: 'request-budget-exceeded' }
    );
  });

  it('is deterministic — the same recorded transcript yields the same result', async () => {
    const a = await runReasoningStep(INPUT, deps(OK));
    const b = await runReasoningStep(INPUT, deps(OK));
    expect(a).toEqual(b);
  });

  it('REFUSES output that misattributes itself to another prompt', async () => {
    const lying: ReasoningOutput = {
      ...OK,
      producedBy: { promptId: 'human-intake', promptVersion: '3', modelId: 'x' },
    };
    await expect(runReasoningStep(INPUT, deps(lying))).rejects.toMatchObject({
      reason: 'attribution-mismatch',
    });
  });

  it('stamps sourceId from the STEP input, never from the reasoner self-report', async () => {
    const r = await runReasoningStep(INPUT, deps(OK));
    expect(r.facts.careGap.sourceId).toBe(SOURCE_ID);
  });

  it('REFUSES a __proto__ fact key — prototype pollution would hide it from the gate', async () => {
    // An object LITERAL with __proto__ sets the prototype and creates no own key;
    // JSON.parse creates a genuine own property named __proto__, which is the
    // shape a hostile reasoner response would actually arrive in.
    const suggestedRefs = JSON.parse('{"__proto__":"x"}') as Record<string, string>;
    const poisoned: ReasoningOutput = { ...OK, suggestedRefs };
    await expect(runReasoningStep(INPUT, deps(poisoned))).rejects.toMatchObject({
      reason: 'fact-key-not-a-code',
    });
  });

  it('REFUSES a prototype-shadowing key like "constructor"', async () => {
    const bad: ReasoningOutput = { ...OK, suggestedRefs: { constructor: 'x' } };
    await expect(runReasoningStep(INPUT, deps(bad))).rejects.toMatchObject({
      reason: 'fact-key-not-a-code',
    });
  });

  it('REFUSES a fact key that is not a safe identifier', async () => {
    const bad: ReasoningOutput = { ...OK, suggestedRefs: { 'Free Text Key': 'x' } };
    await expect(runReasoningStep(INPUT, deps(bad))).rejects.toMatchObject({
      reason: 'fact-key-not-a-code',
    });
  });

  it('REFUSES more suggested facts than the budget allows', async () => {
    const many: ReasoningOutput = {
      ...OK,
      suggestedRefs: { a: '1', b: '2', c: '3' },
    };
    await expect(
      runReasoningStep(INPUT, deps(many, { maxSuggestedRefs: 2 }))
    ).rejects.toMatchObject({ reason: 'fact-budget-exceeded' });
  });

  it('the returned fact map has a null prototype', async () => {
    const r = await runReasoningStep(INPUT, deps(OK));
    expect(Object.getPrototypeOf(r.facts)).toBeNull();
  });
});

describe('the boundary composes with the adverse-determination gate', () => {
  it('a reasoning-derived fact is REFUSED on the adverse path', async () => {
    const r = await runReasoningStep(INPUT, deps(OK));
    expect(() => assertAdverseEligible(r.facts)).toThrow(ModelSourcedFactRefused);
  });

  it('and the refusal names the fact and the prompt that produced it', async () => {
    const r = await runReasoningStep(INPUT, deps(OK));
    try {
      assertAdverseEligible(r.facts);
    } catch (err) {
      expect((err as ModelSourcedFactRefused).factName).toBe('careGap');
      expect((err as ModelSourcedFactRefused).sourceId).toBe(SOURCE_ID);
    }
  });
});
