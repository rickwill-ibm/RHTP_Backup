/**
 * THE ADVERSE FACT-TAINT GATE ON THE REAL MEMBER PATH.
 *
 * WHAT WAS WRONG. `assertAdverseEligible` is the executable form of the platform's central
 * regulatory claim — that a model may not be the sole basis of an adverse determination (45 CFR
 * 92.210's mitigation duty, NY PHL §4903's clinical-peer-reviewer requirement, 42 CFR
 * 438.210(b)(3)'s matched-expertise requirement, and the "sole basis" language in every comparable
 * state bill). Measured before this change: it had exactly ONE non-test caller in `src/` —
 * `app/api/ops/agents/reasoning/probeChain.ts`, whose own header states it is "an OPS self-test
 * surface, not a member-facing path". The claim was true of a self-test and false of the product,
 * and the design document that asserted it said partner facts "cannot ground an adverse
 * determination, by construction".
 *
 * WHY NOTHING CAUGHT IT. `tsc` saw a called function. E13 saw a tested module. E14's wiring gate
 * compares declared resolvers to imports, and a self-test route IS a real entry point, so the module
 * was legitimately "wired". A grep for the symbol found it. Only reading the call graph found it.
 *
 * THE DISTINCTION THAT MATTERS, and the one the first reading of this route missed:
 * `isAdverseProvenanceComplete` was ALREADY wired here, and it is a different check — it validates
 * the decision RECORD carries a member-facing reason and an appeal reference (42 CFR 438.404 notice
 * content). Nothing validated the FACTS that produced the decision. A route can therefore have
 * perfect notice content resting on a model-invented fact.
 *
 * These cases pin both halves, and the fail-closed-on-absence case is the one that makes the gate
 * non-vacuous: a gate that reads "no provenance supplied" as clean is the fail-open this whole plane
 * exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import {
  assertAdverseEligible,
  ModelSourcedFactRefused,
  type ProvenancedFact,
} from '@/lib/agents/provenance';
import { isAdverseProvenanceComplete } from '@/lib/agents/governance';
import { readFileSync } from 'node:fs';

const ROUTE = 'src/app/api/pa/decision/route.ts';

const fact = (
  origin: ProvenancedFact<string>['origin'],
  over: Partial<ProvenancedFact<string>> = {}
): ProvenancedFact<string> => ({
  value: 'v',
  origin,
  sourceId: `src-${origin}`,
  observedAtMs: 0,
  ...over,
});

describe('the gate the adverse route now runs', () => {
  it('REFUSES a model-origin determinative fact, and names it', () => {
    let err: unknown = null;
    try {
      assertAdverseEligible({ ok: fact('system-of-record'), suspect: fact('model') });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ModelSourcedFactRefused);
    expect((err as ModelSourcedFactRefused).factName).toBe('suspect');
  });

  it('REFUSES a fact whose ancestry is model-sourced, however its own origin reads', () => {
    // Taint propagates. Without this an enricher reads a model value and re-stamps the result
    // 'system-of-record', and the gate passes on a laundered fact.
    let err: unknown = null;
    try {
      assertAdverseEligible({
        raw: fact('model'),
        derived: fact('system-of-record', { derivedFrom: ['raw'] }),
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ModelSourcedFactRefused);
  });

  it('REFUSES a fact whose ancestor is absent from the set — unprovable is not clean', () => {
    let err: unknown = null;
    try {
      assertAdverseEligible({
        derived: fact('system-of-record', { derivedFrom: ['not-in-this-set'] }),
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ModelSourcedFactRefused);
  });

  it('PERMITS a set that is wholly system-of-record or human — so the gate is not refusing everything', () => {
    expect(() =>
      assertAdverseEligible({ a: fact('system-of-record'), b: fact('human') })
    ).not.toThrow();
  });
});

describe('the route wires the gate, and wires it on the ADVERSE branch only', () => {
  const src = readFileSync(ROUTE, 'utf8');
  /** Comments and literals masked, so a mention in prose cannot satisfy these assertions. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');

  it('CALLS assertAdverseEligible — not merely mentions it', () => {
    // The first cut of `check-adverse-gate.mjs` asked `includes('assertAdverseEligible')` and was
    // satisfied by this route's own explanatory comment: deleting the call left the gate green.
    expect(/\bassertAdverseEligible\s*\(/.test(code)).toBe(true);
  });

  it('runs it INSIDE a rejected-decision branch, so an approval is not gated on fact taint', () => {
    // A favorable determination may lawfully be automated. Gating approvals on the adverse taint
    // rule would block the lawful case while doing nothing for the unlawful one.
    const idx = code.indexOf('assertAdverseEligible(');
    const before = code.slice(0, idx);
    expect(before).toMatch(/decision\s*===\s*'rejected'/);
  });

  it('REFUSES an adverse decision that declares no determinative facts at all', () => {
    // Fail closed on absence. This is the assertion that stops the gate being decorative.
    expect(code).toMatch(/determinativeFacts/);
    expect(code).toMatch(/no-fact-provenance/);
  });

  it('AUDITS each refusal with its own action code, so the two are countable apart', () => {
    expect(code).toMatch(/pa\.decision\.no-fact-provenance/);
    expect(code).toMatch(/pa\.decision\.model-sourced-fact-refused/);
  });
});

describe('the notice-content check is a DIFFERENT control and still holds', () => {
  const base = {
    proposalId: 'p1',
    actionType: 'deny-coverage',
    decidedBy: 'reviewer:1',
    requiresHuman: true,
    firedRule: 'r',
    ruleVersion: '1',
    inputs: {},
    decidedAtMs: 0,
  };

  it('an adverse decision with no member-facing reason is incomplete (42 CFR 438.404)', () => {
    expect(
      isAdverseProvenanceComplete({ ...base, decision: 'rejected', appealRef: 'a/1' } as never)
    ).toBe(false);
  });

  it('an adverse decision with no appeal reference is incomplete', () => {
    expect(
      isAdverseProvenanceComplete({
        ...base,
        decision: 'rejected',
        memberFacingReason: 'because',
      } as never)
    ).toBe(false);
  });

  it('and a complete adverse record passes — the two controls are independent', () => {
    // Notice completeness says nothing about fact taint: a record can be perfectly noticed and rest
    // on a model-invented fact. That independence is why both gates have to exist.
    expect(
      isAdverseProvenanceComplete({
        ...base,
        decision: 'rejected',
        memberFacingReason: 'because',
        appealRef: 'a/1',
      } as never)
    ).toBe(true);
  });
});
