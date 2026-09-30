// CONTRACT: C-PROV  // INVARIANT: an adverse disposition may not consume a model-sourced fact
/**
 * Typed fact provenance — the executable form of the regulator-facing claim.
 *
 * "The model throws and the rules still compute" proves only that the rule engine
 * is REACHABLE. If a model selects, extracts or normalises the typed facts a rule
 * consumes, it is upstream of the determination, and "rules, not a model" is false
 * in substance while true in code.
 *
 * So every fact carries where it came from, and the adverse path refuses any fact
 * a model shaped. That refusal is the claim, made mechanical.
 *
 * INVARIANT: taint is a property of the fact SET, not of the fact. Whatever a set
 *            cannot prove clean — an ancestor absent from it, an origin outside
 *            `FactOrigin` — is refused, because every way of losing provenance
 *            (serialising across a workflow-state boundary, filtering, renaming a
 *            key) would otherwise read as clean and launder the taint.
 */

/** Where a typed fact came from. */
export type FactOrigin = 'human' | 'system-of-record' | 'model';

/** A typed fact with its origin attached. */
export interface ProvenancedFact<T> {
  value: T;
  origin: FactOrigin;
  /** The source that produced it — a system id, a reviewer id, or a prompt id. */
  sourceId: string;
  observedAtMs: number;
  /**
   * Fact names this one was derived from. Taint propagates: a fact computed from
   * a model-sourced fact is itself model-tainted, however its own origin reads.
   * Without this, an enricher could read a model value and re-stamp the result
   * 'system-of-record', and the adverse gate would pass.
   */
  derivedFrom?: readonly string[];
}

/** Origin strength, weakest (most tainted) first. */
const ORIGIN_TAINT: readonly FactOrigin[] = ['model', 'human', 'system-of-record'];

/**
 * The effective origin of a derived fact: the weakest of itself and its inputs.
 *
 * INVARIANT: taint is a property of the SET, not of the fact. The two ways a
 * lookup can come back empty mean OPPOSITE things and must not share a branch:
 *
 *   - an ABSENT fact is unverifiable provenance → the weakest origin there is.
 *     Collapsing it into the clean branch is a laundering primitive: serialise a
 *     fact set across a workflow-state boundary, filter it, rename a key, or pass
 *     the `survived` map out of `counterfactualDifferential`, and a dangling
 *     `derivedFrom` would read 'system-of-record' — so `Math.min` leaves the
 *     parent clean and an adverse determination computes from a model-shaped fact,
 *     which is exactly what this module exists to prevent.
 *   - a fact already SEEN is a cycle → contribute nothing, i.e. return the
 *     STRONGEST origin, so the fold's `Math.min` ignores it and the cycle's
 *     members are neither downgraded nor upgraded by their own recursion.
 */
export function effectiveOrigin(
  name: string,
  facts: Readonly<Record<string, ProvenancedFact<unknown>>>,
  seen: ReadonlySet<string> = new Set()
): FactOrigin {
  const fact = facts[name];
  if (!fact) return 'model';
  if (seen.has(name)) return 'system-of-record';
  const next = new Set([...seen, name]);
  let weakest = ORIGIN_TAINT.indexOf(fact.origin);
  for (const parent of fact.derivedFrom ?? []) {
    weakest = Math.min(weakest, ORIGIN_TAINT.indexOf(effectiveOrigin(parent, facts, next)));
  }
  // FAIL CLOSED, deliberately: `indexOf` yields -1 for an origin outside the
  // union, and `FactOrigin` is a compile-time union that nothing parses at the
  // workflow-state boundary facts travel through. An unparsed origin is
  // unverified provenance, so it must coerce to 'model' and never to a clean
  // origin. Pinned by "an origin outside the union is unverified provenance".
  return ORIGIN_TAINT[weakest] ?? 'model';
}

/**
 * The first fact naming an ancestor the set does not contain, as a value rather
 * than a throw — the caller decides what unverifiable ancestry means for its path.
 * `Object.keys` (not `in`) so a prototype method name can never read as present.
 */
function firstUnresolvedAncestry(
  facts: Readonly<Record<string, ProvenancedFact<unknown>>>
): { readonly factName: string; readonly sourceId: string; readonly missing: string } | undefined {
  const present = new Set(Object.keys(facts));
  for (const [factName, fact] of Object.entries(facts)) {
    for (const missing of fact.derivedFrom ?? []) {
      if (!present.has(missing)) return { factName, sourceId: fact.sourceId, missing };
    }
  }
  return undefined;
}

/** Raised when a model-sourced fact reaches a path that forbids one. */
export class ModelSourcedFactRefused extends Error {
  constructor(
    public readonly factName: string,
    public readonly sourceId: string,
    /**
     * Set when the refusal is for an ancestor ABSENT from the fact set rather than
     * a fact stamped 'model'. Both are refusals, but an audit must be able to tell
     * "a model produced this" from "this set cannot prove what produced it".
     */
    public readonly unresolvedAncestor?: string
  ) {
    super(
      unresolvedAncestor === undefined
        ? `Fact "${factName}" is model-sourced (${sourceId}) and cannot be consumed by an ` +
            'adverse determination — adverse dispositions must compute from human or ' +
            'system-of-record facts alone'
        : `Fact "${factName}" (${sourceId}) derives from "${unresolvedAncestor}", which is ` +
            'absent from the fact set — an adverse determination may only compute from a ' +
            'set whose full derivation is present, so unverifiable ancestry is refused'
    );
    this.name = 'ModelSourcedFactRefused';
  }
}

/**
 * True when a fact's OWN ORIGIN is eligible for an adverse determination.
 *
 * Origin only, by design and by name: `derivedFrom` taint is a property of the SET
 * and cannot be decided from one fact. This is a reporting predicate — the gate is
 * `assertAdverseEligible`, which resolves the whole derivation graph.
 */
export function originIsEligible<T>(fact: ProvenancedFact<T>): boolean {
  return fact.origin !== 'model';
}

/**
 * Gate a fact set for an adverse determination. Throws on the first refusal, naming
 * it — so the failure is legible in an audit, not a silent filter.
 *
 * Ancestry integrity is checked FIRST: a set that names an ancestor it does not
 * contain is not gateable at all, and resolving such a name silently (rather than
 * refusing the set) is how taint gets laundered across a boundary. `effectiveOrigin`
 * already fails closed on it; this check makes the REASON explicit in the error.
 */
export function assertAdverseEligible(
  facts: Readonly<Record<string, ProvenancedFact<unknown>>>
): void {
  const unresolved = firstUnresolvedAncestry(facts);
  if (unresolved) {
    throw new ModelSourcedFactRefused(unresolved.factName, unresolved.sourceId, unresolved.missing);
  }
  for (const [name, fact] of Object.entries(facts)) {
    if (effectiveOrigin(name, facts) === 'model') {
      throw new ModelSourcedFactRefused(name, fact.sourceId);
    }
  }
}

/**
 * The COUNTERFACTUAL DIFFERENTIAL: recompute a disposition with model-sourced
 * facts elided, and report whether the outcome AND the surviving fact set are
 * identical. Divergence is a governance incident, not a test failure.
 */
export interface DifferentialResult<D> {
  withModel: D;
  withoutModel: D;
  /** True when eliding model facts changed nothing — the claim holds for this case. */
  identical: boolean;
  /** Facts that were elided, by name. */
  elided: string[];
}

/** Run the differential over a pure disposition function. */
export function counterfactualDifferential<D>(
  facts: Readonly<Record<string, ProvenancedFact<unknown>>>,
  decide: (f: Readonly<Record<string, ProvenancedFact<unknown>>>) => D,
  equals: (a: D, b: D) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
): DifferentialResult<D> {
  const elided: string[] = [];
  const survived: Record<string, ProvenancedFact<unknown>> = Object.create(null) as Record<
    string,
    ProvenancedFact<unknown>
  >;
  for (const name of Object.keys(facts)) {
    if (effectiveOrigin(name, facts) === 'model') elided.push(name);
    else survived[name] = facts[name] as ProvenancedFact<unknown>;
  }
  // `decide` is contractually PURE: it is invoked twice per differential.
  const withModel = decide(Object.freeze({ ...facts }));
  const withoutModel = decide(Object.freeze(survived));
  return { withModel, withoutModel, identical: equals(withModel, withoutModel), elided };
}
