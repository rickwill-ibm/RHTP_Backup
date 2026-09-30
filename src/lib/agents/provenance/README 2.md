# Fact provenance (`src/lib/agents/provenance`)

## Purpose

"The model throws and the rules still compute" proves only that the rule engine is
**reachable**. If a model selects, extracts or normalises the typed facts a rule
consumes, it is upstream of the determination, and "rules, not a model" is false in
substance while true in code.

So every typed fact carries where it came from, and the adverse path **refuses** any
fact a model shaped. That refusal is the regulator-facing claim, made mechanical.

`CONTRACT: C-PROV`

## Public surface

Import from `@/lib/agents/provenance` — never from `./factProvenance` (§4).

```ts
type FactOrigin = 'human' | 'system-of-record' | 'model'; // weakest: 'model'
interface ProvenancedFact<T> { value; origin; sourceId; observedAtMs; derivedFrom? }

effectiveOrigin(name, facts)        // weakest origin over the derivation graph
assertAdverseEligible(facts)        // THE GATE — throws ModelSourcedFactRefused
originIsEligible(fact)              // one fact's ORIGIN only — NOT a gate
counterfactualDifferential(facts, decide, equals?) // -> DifferentialResult<D>
ModelSourcedFactRefused             // .factName .sourceId .unresolvedAncestor?
```

## Invariants

1. **An adverse determination may not consume a model-sourced fact.** Enforced by
   `assertAdverseEligible`, which throws rather than filtering, so the refusal is
   legible in an audit.
2. **Taint is a property of the SET, not of the fact.** `derivedFrom` propagates
   taint: a fact computed from a model fact is model-tainted however its own origin
   reads. One fact, alone, cannot be judged — which is why the per-fact predicate is
   named `originIsEligible` and not `isAdverseEligible`.
3. **Whatever the set cannot prove clean is refused (fail closed).** Two ways
   provenance goes missing, both maximally tainted:
   - an ancestor **absent from the set** (`effectiveOrigin` → `'model'`;
     `assertAdverseEligible` refuses the set and names the missing ancestor).
     Serialising a fact set across a workflow-state boundary, filtering it, renaming a
     key, or passing `counterfactualDifferential`'s surviving map to another consumer
     all drop a parent — each would launder the child clean if absence read as clean.
   - an `origin` **outside `FactOrigin`** (`indexOf` → `-1` → coerced to `'model'`).
     `FactOrigin` is a compile-time union and nothing parses it at the boundary facts
     actually cross, so this coercion is load-bearing, not defensive.
4. **A derivation cycle contributes nothing** — it resolves to the *strongest* origin
   so the weakest-origin fold ignores it; members are neither downgraded nor upgraded.
5. **Deterministic.** No clock, no IO. `observedAtMs` is supplied by the caller;
   `counterfactualDifferential` calls a contractually pure `decide` exactly twice.

## An agent may change freely

- Adding a fact-set consumer that gates through `assertAdverseEligible`.
- Widening `DifferentialResult` additively (new optional fields).
- Tests, comments, and this README.

## An agent must never change

- The `ORIGIN_TAINT` order, or the two fail-closed returns in `effectiveOrigin`
  (`!fact` → `'model'`, and the final `?? 'model'`). Both are pinned by tests
  precisely because "the result happens to be correct" is not the same as "nothing
  can change it".
- `assertAdverseEligible` into a filter. It throws; a silent elision would remove the
  audit record that the claim depends on.
- `originIsEligible` into a gate, or back to a name that implies it is one.

## Test commands

```bash
npx vitest run tests/agents/provenance
npx vitest run tests/agents/provenance tests/agents/reasoning  # the deep-importing consumer
```

## Known cross-partition follow-ups

- `src/lib/agents/reasoning/reasoningStep.ts` deep-imports `./factProvenance` for the
  `ProvenancedFact` type; it should import from `@/lib/agents/provenance` now that this
  barrel exists (owned by the reasoning partition).
- `src/lib/agents/index.ts` does not re-export this domain (owned by that barrel).
- `FactOrigin` has no zod schema; invariant 3 is the fail-closed compensation for that,
  not a substitute for parsing at the boundary (§5.2).
