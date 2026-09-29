/**
 * The regulator-facing claim, made executable: an adverse determination must
 * compute from human or system-of-record facts alone.
 */
import { describe, expect, it } from 'vitest';
import {
  ModelSourcedFactRefused,
  assertAdverseEligible,
  counterfactualDifferential,
  effectiveOrigin,
  originIsEligible,
  type FactOrigin,
  type ProvenancedFact,
} from '@/lib/agents/provenance/factProvenance';
import * as surface from '@/lib/agents/provenance';

const fact = <T>(
  value: T,
  origin: ProvenancedFact<T>['origin'],
  sourceId: string
): ProvenancedFact<T> => ({
  value,
  origin,
  sourceId,
  observedAtMs: 1_700_000_000_000,
});

/** Stands in for a workflow-state boundary that serialises and filters a fact set. */
const boundaryFiltered = (
  set: Readonly<Record<string, ProvenancedFact<unknown>>>,
  drop: string
): Record<string, ProvenancedFact<unknown>> =>
  Object.fromEntries(Object.entries(set).filter(([name]) => name !== drop));

describe('fact provenance', () => {
  it('accepts human and system-of-record ORIGINS', () => {
    expect(originIsEligible(fact('E11.9', 'system-of-record', 'emr'))).toBe(true);
    expect(originIsEligible(fact(true, 'human', 'reviewer:42'))).toBe(true);
  });

  it('REFUSES a model ORIGIN', () => {
    expect(originIsEligible(fact('E11.9', 'model', 'prompt:extract-dx'))).toBe(false);
  });

  it('originIsEligible judges the ORIGIN ONLY — taint is a property of the SET', () => {
    const derived = {
      ...fact('tier-3', 'system-of-record', 'MMIS'),
      derivedFrom: ['inferred'],
    };
    // Per-fact, the origin is clean — which is exactly why this predicate is not a gate.
    expect(originIsEligible(derived)).toBe(true);
    expect(() =>
      assertAdverseEligible({ inferred: fact('x', 'model', 'prompt:infer'), derived })
    ).toThrow(ModelSourcedFactRefused);
  });

  it('names the offending fact and its source when it refuses', () => {
    try {
      assertAdverseEligible({
        coverage: fact(true, 'system-of-record', 'mmis'),
        diagnosis: fact('E11.9', 'model', 'prompt:extract-dx'),
      });
      throw new Error('expected a refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(ModelSourcedFactRefused);
      expect((err as ModelSourcedFactRefused).factName).toBe('diagnosis');
      expect((err as ModelSourcedFactRefused).sourceId).toBe('prompt:extract-dx');
    }
  });

  it('passes a fact set with no model-sourced facts', () => {
    expect(() =>
      assertAdverseEligible({ coverage: fact(true, 'system-of-record', 'mmis') })
    ).not.toThrow();
  });
});

describe('counterfactual differential', () => {
  const decide = (f: Readonly<Record<string, ProvenancedFact<unknown>>>): string =>
    f.diagnosis === undefined ? 'insufficient-evidence' : 'deny';

  it('reports identical when no model fact influenced the outcome', () => {
    const r = counterfactualDifferential(
      { diagnosis: fact('E11.9', 'system-of-record', 'emr') },
      decide
    );
    expect(r.identical).toBe(true);
    expect(r.elided).toEqual([]);
  });

  it('DETECTS a model fact that changed the outcome — a governance incident', () => {
    const r = counterfactualDifferential(
      { diagnosis: fact('E11.9', 'model', 'prompt:extract-dx') },
      decide
    );
    expect(r.identical).toBe(false);
    expect(r.withModel).toBe('deny');
    expect(r.withoutModel).toBe('insufficient-evidence');
    expect(r.elided).toEqual(['diagnosis']);
  });

  it('elides every model fact and keeps the rest', () => {
    const r = counterfactualDifferential(
      {
        coverage: fact(true, 'system-of-record', 'mmis'),
        diagnosis: fact('E11.9', 'system-of-record', 'emr'),
        summary: fact('long text', 'model', 'prompt:summarise'),
      },
      decide
    );
    expect(r.elided).toEqual(['summary']);
    expect(r.identical).toBe(true);
  });
});

describe('taint propagation across derivation', () => {
  it('a fact DERIVED from a model fact is refused, however its own origin reads', () => {
    const facts = {
      inferredStatus: fact('impaired', 'model', 'prompt:infer'),
      levelOfCare: {
        ...fact('tier-3', 'system-of-record', 'MMIS'),
        derivedFrom: ['inferredStatus'],
      },
    };
    expect(() => assertAdverseEligible(facts)).toThrow(ModelSourcedFactRefused);
  });

  it('a fact derived only from clean facts stays eligible', () => {
    const facts = {
      dx: fact('E11.9', 'system-of-record', 'emr'),
      tier: { ...fact('tier-1', 'system-of-record', 'MMIS'), derivedFrom: ['dx'] },
    };
    expect(() => assertAdverseEligible(facts)).not.toThrow();
  });

  it('the differential elides a derived-tainted fact too', () => {
    const facts = {
      inferred: fact('x', 'model', 'prompt:infer'),
      derived: { ...fact('y', 'system-of-record', 'MMIS'), derivedFrom: ['inferred'] },
      clean: fact('z', 'system-of-record', 'emr'),
    };
    const r = counterfactualDifferential(facts, (f) => Object.keys(f).sort().join(','));
    expect(r.elided.sort()).toEqual(['derived', 'inferred']);
    expect(r.withoutModel).toBe('clean');
  });

  it('a derivation cycle terminates rather than hanging', () => {
    const facts = {
      a: { ...fact('1', 'system-of-record', 's'), derivedFrom: ['b'] },
      b: { ...fact('2', 'system-of-record', 's'), derivedFrom: ['a'] },
    };
    expect(() => assertAdverseEligible(facts)).not.toThrow();
  });

  // A cycle must CONTRIBUTE NOTHING to the weakest-origin fold — i.e. resolve to the
  // strongest origin there is, so Math.min ignores it. Asserting only "is not model"
  // would pass on 'human' too, and a cycle that contributed 'human' would silently
  // downgrade every system-of-record fact that happens to sit in one.
  it('a cycle resolves to the STRONGEST origin, leaving its members undowngraded', () => {
    const facts = {
      a: { ...fact('1', 'system-of-record', 's'), derivedFrom: ['b'] },
      b: { ...fact('2', 'system-of-record', 's'), derivedFrom: ['a'] },
    };
    expect(effectiveOrigin('a', facts)).toBe('system-of-record');
    expect(effectiveOrigin('b', facts)).toBe('system-of-record');
  });

  it('a cycle of human facts stays human — neither downgraded nor upgraded', () => {
    const facts = {
      a: { ...fact('1', 'human', 'reviewer:42'), derivedFrom: ['b'] },
      b: { ...fact('2', 'human', 'reviewer:42'), derivedFrom: ['a'] },
    };
    expect(effectiveOrigin('a', facts)).toBe('human');
  });
});

/**
 * D1 — taint is a property of the SET, not of the fact. An ancestor that is absent
 * from the set is UNVERIFIABLE provenance, and unverifiable provenance must read as
 * the most tainted origin there is, or dropping a parent launders the child clean.
 */
describe('unverifiable ancestry fails closed', () => {
  it('resolves a fact whose derivedFrom names an ABSENT ancestor to model', () => {
    const facts = {
      levelOfCare: {
        ...fact('tier-3', 'system-of-record', 'MMIS'),
        derivedFrom: ['llmExtract'],
      },
    };
    expect(effectiveOrigin('levelOfCare', facts)).toBe('model');
  });

  it('resolves a name absent from the set to model, never to a clean origin', () => {
    expect(effectiveOrigin('neverHeardOfIt', {})).toBe('model');
  });

  it('REFUSES a set whose model parent was dropped crossing a boundary', () => {
    const full = {
      llmExtract: fact('impaired', 'model', 'prompt:infer'),
      levelOfCare: {
        ...fact('tier-3', 'system-of-record', 'MMIS'),
        derivedFrom: ['llmExtract'],
      },
    };
    const filtered = boundaryFiltered(full, 'llmExtract');
    expect(Object.keys(filtered)).toEqual(['levelOfCare']);
    expect(() => assertAdverseEligible(filtered)).toThrow(ModelSourcedFactRefused);
  });

  it('names the missing ancestor when it refuses, so the audit record says WHY', () => {
    try {
      assertAdverseEligible({
        levelOfCare: {
          ...fact('tier-3', 'system-of-record', 'MMIS'),
          derivedFrom: ['llmExtract'],
        },
      });
      throw new Error('expected a refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(ModelSourcedFactRefused);
      expect((err as ModelSourcedFactRefused).factName).toBe('levelOfCare');
      expect((err as ModelSourcedFactRefused).unresolvedAncestor).toBe('llmExtract');
    }
  });

  it('the differential elides a fact with unverifiable ancestry', () => {
    const facts: Record<string, ProvenancedFact<unknown>> = {
      orphan: { ...fact('y', 'system-of-record', 'MMIS'), derivedFrom: ['goneMissing'] },
      clean: fact('z', 'system-of-record', 'emr'),
    };
    const r = counterfactualDifferential(facts, (f) => Object.keys(f).sort().join(','));
    expect(r.elided).toEqual(['orphan']);
    expect(r.withoutModel).toBe('clean');
  });
});

/**
 * D2 — `FactOrigin` is a compile-time union and facts travel through workflow state
 * without being parsed at that boundary, so an out-of-union origin is reachable at
 * runtime. It must rank as the weakest origin, and that must be PINNED: the fail-closed
 * coercion is the only thing standing between an unparsed origin and a clean read.
 */
describe('an origin outside the union is unverified provenance', () => {
  const rogue: Record<string, ProvenancedFact<unknown>> = {
    x: { ...fact('v', 'system-of-record', 'src'), origin: 'inferred' as FactOrigin },
  };

  it('resolves an out-of-union origin to model', () => {
    expect(effectiveOrigin('x', rogue)).toBe('model');
  });

  it('REFUSES a fact whose origin is outside the union', () => {
    expect(() => assertAdverseEligible(rogue)).toThrow(ModelSourcedFactRefused);
  });

  it('taints a clean fact derived from an out-of-union-origin parent', () => {
    const facts: Record<string, ProvenancedFact<unknown>> = {
      ...rogue,
      derived: { ...fact('tier-1', 'system-of-record', 'MMIS'), derivedFrom: ['x'] },
    };
    expect(effectiveOrigin('derived', facts)).toBe('model');
  });
});

/**
 * D4 — the public surface. A barrel that omits a symbol type-checks green until
 * something imports it, so the barrel is exercised, not merely declared: "it
 * compiles" is not "it runs" (§13.0.2).
 */
describe('public surface (index.ts)', () => {
  it('re-exports the whole gate, and the gate still refuses through it', () => {
    expect(Object.keys(surface).sort()).toEqual([
      'ModelSourcedFactRefused',
      'assertAdverseEligible',
      'counterfactualDifferential',
      'effectiveOrigin',
      'originIsEligible',
    ]);
    expect(() =>
      surface.assertAdverseEligible({ dx: fact('E11.9', 'model', 'prompt:extract-dx') })
    ).toThrow(surface.ModelSourcedFactRefused);
    expect(surface.originIsEligible(fact(true, 'human', 'reviewer:42'))).toBe(true);
    expect(surface.effectiveOrigin('missing', {})).toBe('model');
  });
});
