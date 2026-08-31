/**
 * evaluate() — run an encoded policy against a patient's facts (RHTP Policy Engine).
 *
 * Three-valued logic (met / not-met / unknown) so missing information never silently passes. The
 * coverage decision is FAIL-CLOSED (spec §1.1): a policy is `not-covered` unless an eligibility
 * pathway actually evaluates `met`; missing facts yield `needs-info`, never a covered default.
 * Population-gated pathways only apply when the population fact is true (spec §1.6).
 *
 * IMPORTANT (Layer D hard rule): this function COMPUTES a proposed disposition. A `denied`
 * disposition is a *proposal* for a licensed clinician — evaluate() never finalizes an adverse
 * determination. The autonomy layer enforces that structurally.
 *
 * Design authority: docs/policy-encoder-spec.md §1; docs/plans/layer-d-autonomy-plan.md.
 */
import type {
  BoolExpr,
  CoverageBasis,
  CoverageCode,
  EncodedCriterion,
  Measure,
  PolicyLogic,
  ProcedureRule,
} from './ir';

export type Tri = 'met' | 'not-met' | 'unknown';

export interface PatientFacts {
  /** procedure requested. */
  procedureCode?: string;
  /** numeric observations keyed by field: { bmi: 38, age: 42, systolicBP: 150, ... }. */
  measures?: Record<string, number>;
  /** answered attestations / free-text criteria, keyed by criterion id. */
  booleans?: Record<string, boolean>;
  /** number of options selected for a choice value set (with their follow-ups met), by valueSetId. */
  choiceSelections?: Record<string, number>;
  /** population membership, keyed by concept: { diabetic: true, 'asian-ancestry': false }. */
  populations?: Record<string, boolean>;
  /** count of distinct anti-hypertensive agent classes, for compound BP therapy qualifiers. */
  agentClassCount?: number;
}

function cmp(
  op: Measure['operator'],
  x: number,
  v: number,
  v2?: number,
  incLow?: boolean,
  incHigh?: boolean
): boolean {
  switch (op) {
    case '>=':
      return x >= v;
    case '<=':
      return x <= v;
    case '>':
      return x > v;
    case '<':
      return x < v;
    case '=':
      return x === v;
    case '!=':
      return x !== v;
    case 'between': {
      if (v2 === undefined) return false;
      const lo = incLow === false ? x > v : x >= v;
      const hi = incHigh === false ? x < v2 : x <= v2;
      return lo && hi;
    }
    default:
      return false;
  }
}

/** Evaluate a measure against the facts, applying an atomic population threshold variant if active. */
export function evalMeasure(measure: Measure, facts: PatientFacts): Tri {
  if (measure.kind === 'compound') {
    const subs = (measure.subMeasures ?? []).map((s) => evalMeasure(s, facts));
    const combine =
      measure.logic === 'any'
        ? subs.includes('met')
          ? 'met'
          : subs.includes('unknown')
            ? 'unknown'
            : 'not-met'
        : subs.includes('not-met')
          ? 'not-met'
          : subs.includes('unknown')
            ? 'unknown'
            : 'met';
    if (combine !== 'met') return combine;
    // therapy qualifier is a mandatory conjunct
    if (measure.therapyQualifier) {
      if (facts.agentClassCount === undefined) return 'unknown';
      return facts.agentClassCount >= measure.therapyQualifier.drugClassCount ? 'met' : 'not-met';
    }
    return 'met';
  }
  const field = measure.field;
  if (!field) return 'unknown';
  const x = facts.measures?.[field];
  if (x === undefined) return 'unknown';

  // Population threshold variant (e.g. Asian-ancestry ±2.5): substitute atomically when active.
  let value = measure.value;
  let value2 = measure.value2;
  const variant = measure.thresholdVariant;
  if (variant && facts.populations?.[variant.population.concept]) {
    const sub = variant.substitutions.find((s) => s.field === field);
    if (sub) {
      value = sub.value;
      if (sub.value2 !== undefined) value2 = sub.value2;
    }
  }
  if (value === undefined) return 'unknown';
  // Ambiguous range endpoint (inclusivity unrecoverable, spec §1.3): only the exact boundary needs
  // human review — interior values evaluate normally so the pathway stays usable.
  if (measure.operator === 'between') {
    if (measure.inclusiveLow === undefined && x === value) return 'unknown';
    if (measure.inclusiveHigh === undefined && value2 !== undefined && x === value2)
      return 'unknown';
  }
  return cmp(measure.operator, x, value, value2, measure.inclusiveLow, measure.inclusiveHigh)
    ? 'met'
    : 'not-met';
}

/** Evaluate a single encoded criterion. */
export function evalCriterion(crit: EncodedCriterion, facts: PatientFacts): Tri {
  // If the operator/threshold was flagged for review, it cannot be auto-evaluated ⇒ needs info.
  if (crit.reviewFlag) return 'unknown';

  if (crit.kind === 'measure' && crit.measure) {
    // Multiple thresholds in one criterion (e.g. age AND BMI) are AND-combined, three-valued:
    // any not-met ⇒ not-met; else any unknown ⇒ unknown; else met.
    let m: Tri;
    if (crit.measures && crit.measures.length > 1) {
      const rs = crit.measures.map((mm) => evalMeasure(mm, facts));
      m = rs.includes('not-met') ? 'not-met' : rs.includes('unknown') ? 'unknown' : 'met';
    } else {
      m = evalMeasure(crit.measure, facts);
    }
    if (m !== 'met') return m;
    const parts: Tri[] = [];
    // A measure with an attached time window also needs the window attested.
    if (crit.timeWindow) {
      const b = facts.booleans?.[crit.id];
      parts.push(b === undefined ? 'unknown' : b ? 'met' : 'not-met');
    }
    // A measure node carrying child criteria (e.g. a BMI band WITH a comorbidity choice) requires the
    // children too — three-valued AND, so the threshold and the enumeration must BOTH be satisfied.
    if (crit.children && crit.children.length) {
      parts.push(...crit.children.map((c) => evalCriterion(c, facts)));
    }
    if (parts.includes('not-met')) return 'not-met';
    if (parts.includes('unknown')) return 'unknown';
    return 'met';
  }
  if (crit.kind === 'choice' && crit.choice) {
    const sel = facts.choiceSelections?.[crit.choice.valueSetId];
    if (sel === undefined) return 'unknown';
    return sel >= (crit.choice.min ?? 1) ? 'met' : 'not-met';
  }
  // attestation / freetext / reference: an explicit answer, else unknown.
  const b = facts.booleans?.[crit.id];
  if (b !== undefined) return b ? 'met' : 'not-met';
  // A criterion with only a time window still needs the window attested.
  if (crit.timeWindow) return 'unknown';
  return 'unknown';
}

/** Three-valued evaluation of a BoolExpr over the criterion registry. */
export function evalExpr(
  expr: BoolExpr,
  reg: Record<string, EncodedCriterion>,
  facts: PatientFacts
): Tri {
  if (expr.op === 'leaf') {
    const crit = reg[expr.criterionId];
    return crit ? evalCriterion(crit, facts) : 'unknown';
  }
  if (expr.op === 'not') {
    const r = evalExpr(expr.node, reg, facts);
    return r === 'met' ? 'not-met' : r === 'not-met' ? 'met' : 'unknown';
  }
  const results = expr.nodes.map((n) => evalExpr(n, reg, facts));
  if (expr.op === 'and') {
    // An empty AND must NOT auto-approve (fail-safe): a pathway that reduced to zero leaves is
    // indeterminate, never satisfied. (red-team finding #1)
    if (results.length === 0) return 'unknown';
    if (results.includes('not-met')) return 'not-met';
    if (results.includes('unknown')) return 'unknown';
    return 'met';
  }
  // or
  if (results.includes('met')) return 'met';
  if (results.includes('unknown')) return 'unknown';
  return 'not-met';
}

export interface Determination {
  coverage: CoverageCode;
  basis?: CoverageBasis;
  /** approvable = criteria met; needs-info = missing facts; denied = PROPOSED adverse (human-gated);
   *  manual-review = escalation pathway. */
  disposition: 'approvable' | 'denied' | 'needs-info' | 'manual-review';
  pathway?: string;
  unmet: string[];
  unknown: string[];
  rationale: string;
}

function findProcedureRule(policy: PolicyLogic, code?: string): ProcedureRule | undefined {
  if (!code) return undefined;
  return policy.procedures.find((p) => p.code === code);
}

/**
 * Evaluate a policy for a patient. Order: procedure-level coverage first (a not-covered/experimental
 * procedure is a hard stop), then eligibility pathways (fail-closed), then manual-review.
 */
export function evaluatePolicy(policy: PolicyLogic, facts: PatientFacts): Determination {
  // 1. Procedure-level coverage.
  const rule = findProcedureRule(policy, facts.procedureCode);
  if (rule && rule.coverageCode === 'not-covered') {
    return {
      coverage: 'not-covered',
      basis: rule.basis,
      disposition: 'denied',
      unmet: [],
      unknown: [],
      rationale: `Procedure ${rule.code} is ${rule.basis ?? 'not covered'} under ${policy.guidelineId}.`,
    };
  }
  // A requested code with no rule, under an "all other ... not medically necessary" policy ⇒ fail closed.
  if (facts.procedureCode && !rule && policy.defaultProcedureRole === 'not-covered') {
    return {
      coverage: 'not-covered',
      basis: 'criteria-not-met',
      disposition: 'denied',
      unmet: [],
      unknown: [],
      rationale: `Procedure ${facts.procedureCode} is not an enumerated covered procedure; policy default is not-covered.`,
    };
  }

  // 2. Eligibility pathways (population-gated), fail-closed.
  const applicable = policy.pathways.filter((p) => p.role === 'eligibility');
  const unmetAll: string[] = [];
  const unknownAll: string[] = [];
  let anyUnknown = false;

  for (const p of applicable) {
    // Population gate — applies to ANY population predicate (asked or derived): the pathway is only
    // relevant when the population fact is true. Missing ⇒ unknown, never applied silently. (§1.6)
    if (p.population) {
      const has = facts.populations?.[p.population.concept];
      if (has === false) continue; // pathway not applicable to this patient
      if (has === undefined) {
        anyUnknown = true;
        unknownAll.push(`population:${p.population.concept}`);
        continue;
      }
    }
    if (!p.logic) continue;
    const r = evalExpr(p.logic, policy.criteria, facts);
    if (r === 'met') {
      // A conditional procedure must ALSO satisfy its own parameter condition (e.g. roux limb
      // ≤150 cm) before it is approvable — pathway-met alone is not enough. (red-team finding #4)
      if (rule?.coverageCode === 'conditional' && rule.parameterCondition) {
        const pc = evalMeasure(rule.parameterCondition, facts);
        if (pc === 'not-met') {
          return {
            coverage: 'not-covered',
            basis: 'experimental-investigational',
            disposition: 'denied',
            pathway: p.id,
            unmet: [rule.code],
            unknown: [],
            rationale: `${rule.code} does not meet its coverage parameter (e.g. limb length); investigational.`,
          };
        }
        if (pc === 'unknown') {
          return {
            coverage: 'auth-needed',
            disposition: 'needs-info',
            pathway: p.id,
            unmet: [],
            unknown: [rule.code],
            rationale: `${rule.code} requires its coverage parameter (e.g. limb length) documented.`,
          };
        }
      }
      return {
        coverage: rule?.coverageCode === 'conditional' ? 'conditional' : 'auth-needed',
        disposition: 'approvable',
        pathway: p.id,
        unmet: [],
        unknown: [],
        rationale: `Eligibility met via ${p.id}.`,
      };
    }
    if (r === 'unknown') {
      anyUnknown = true;
      // collect unknown leaves
      collectLeaves(p.logic, policy.criteria, facts, unknownAll, 'unknown');
    } else {
      collectLeaves(p.logic, policy.criteria, facts, unmetAll, 'not-met');
    }
  }

  // 3. Manual-review escalation.
  const manual = policy.pathways.find((p) => p.role === 'manual-review');
  if (manual && !applicable.some((p) => p.logic)) {
    return {
      coverage: 'auth-needed',
      disposition: 'manual-review',
      pathway: manual.id,
      unmet: [],
      unknown: [],
      rationale: manual.routingInstruction ?? 'Manual review required.',
    };
  }

  if (anyUnknown) {
    return {
      coverage: 'auth-needed',
      disposition: 'needs-info',
      unmet: unmetAll,
      unknown: unknownAll,
      rationale: 'Additional documentation required before a determination can be made.',
    };
  }

  // No pathway met and nothing unknown ⇒ fail closed.
  return {
    coverage: 'not-covered',
    basis: 'criteria-not-met',
    disposition: 'denied',
    unmet: unmetAll,
    unknown: [],
    rationale: 'No eligibility pathway was satisfied; coverage defaults to not-covered.',
  };
}

function collectLeaves(
  expr: BoolExpr,
  reg: Record<string, EncodedCriterion>,
  facts: PatientFacts,
  out: string[],
  want: Tri
): void {
  if (expr.op === 'leaf') {
    const crit = reg[expr.criterionId];
    if (crit && evalCriterion(crit, facts) === want) out.push(expr.criterionId);
    return;
  }
  if (expr.op === 'not') {
    collectLeaves(expr.node, reg, facts, out, want);
    return;
  }
  for (const n of expr.nodes) collectLeaves(n, reg, facts, out, want);
}
