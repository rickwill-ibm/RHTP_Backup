/**
 * Escalation-as-data (G4). SLA per priority tier, then escalate up the care-team
 * hierarchy, then PARK with audit — never silently expire (DP-3). The policy is
 * data (data/escalation-policies.json), tunable without a code change; the runtime
 * loads it and schedules timers off the injected clock (deterministic).
 *
 * This module holds the policy types, the hand validator (refuses loudly, the
 * house pattern), and the pure step function. The engine owns timer scheduling
 * and emits `agent.task.escalated` for each hop and the terminal park.
 */
import policiesJson from './data/escalation-policies.json';
import type { EscalationPriority } from './types';

/** One priority tier: SLA interval + the hierarchy to walk + terminal behavior. */
export interface EscalationTier {
  priority: EscalationPriority;
  /** Hours between escalation hops (the SLA for this tier). */
  slaHours: number;
  /** Care-team levels to escalate up, in order. */
  hierarchy: string[];
  /** What happens after the hierarchy is exhausted. Only 'park' is supported. */
  onExhaust: 'park';
}

/** A named set of tiers (one per priority). Referenced by manifest.escalationPolicyRef. */
export interface EscalationPolicySet {
  tiers: EscalationTier[];
}

/** The whole policy file (versioned, additive). */
export interface EscalationPolicies {
  version: string;
  policies: Record<string, EscalationPolicySet>;
}

/** Raised loudly when the escalation policy data is malformed. */
export class EscalationPolicyError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
  ) {
    super(`Escalation policy invalid at "${field}": ${detail}`);
    this.name = 'EscalationPolicyError';
  }
}

const PRIORITIES: EscalationPriority[] = ['urgent', 'high', 'routine'];

function req(cond: unknown, field: string, detail: string): asserts cond {
  if (!cond) throw new EscalationPolicyError(field, detail);
}

/** Parse + validate a policy blob, or throw EscalationPolicyError. */
export function parseEscalationPolicies(data: unknown): EscalationPolicies {
  req(data && typeof data === 'object', 'root', 'must be an object');
  const o = data as Record<string, unknown>;
  req(typeof o.version === 'string' && o.version.length > 0, 'version', 'must be a version string');
  req(o.policies && typeof o.policies === 'object', 'policies', 'must be an object');
  const policies: Record<string, EscalationPolicySet> = {};
  for (const [ref, set] of Object.entries(o.policies as Record<string, unknown>)) {
    req(set && typeof set === 'object', `policies.${ref}`, 'must be an object');
    const tiersRaw = (set as Record<string, unknown>).tiers;
    req(Array.isArray(tiersRaw), `policies.${ref}.tiers`, 'must be an array');
    const tiers = (tiersRaw as unknown[]).map((t, i) => validateTier(t, `policies.${ref}.tiers[${i}]`));
    for (const p of PRIORITIES) {
      req(tiers.some((t) => t.priority === p), `policies.${ref}.tiers`, `missing tier for priority "${p}"`);
    }
    policies[ref] = { tiers };
  }
  return { version: o.version as string, policies };
}

function validateTier(t: unknown, field: string): EscalationTier {
  req(t && typeof t === 'object', field, 'must be an object');
  const o = t as Record<string, unknown>;
  req(
    typeof o.priority === 'string' && PRIORITIES.includes(o.priority as EscalationPriority),
    `${field}.priority`,
    `must be one of ${PRIORITIES.join(', ')}`,
  );
  req(typeof o.slaHours === 'number' && o.slaHours > 0, `${field}.slaHours`, 'must be a positive number');
  req(
    Array.isArray(o.hierarchy) && o.hierarchy.length > 0 && o.hierarchy.every((h) => typeof h === 'string'),
    `${field}.hierarchy`,
    'must be a non-empty array of care-team level strings',
  );
  req(o.onExhaust === 'park', `${field}.onExhaust`, "must be 'park' (never silently expire)");
  return {
    priority: o.priority as EscalationPriority,
    slaHours: o.slaHours as number,
    hierarchy: (o.hierarchy as string[]).slice(),
    onExhaust: 'park',
  };
}

/** Load the shipped default policy set (the reference data). */
export function loadEscalationPolicies(): EscalationPolicies {
  return parseEscalationPolicies(policiesJson as EscalationPolicies);
}

/** Look up the tier for a (ref, priority), or throw. */
export function getEscalationTier(
  policies: EscalationPolicies,
  ref: string,
  priority: EscalationPriority,
): EscalationTier {
  const set = policies.policies[ref];
  req(set, `policies.${ref}`, 'no such escalation policy set');
  const tier = set.tiers.find((t) => t.priority === priority);
  req(tier, `policies.${ref}.${priority}`, 'no tier for priority');
  return tier as EscalationTier;
}

/** A single escalation step outcome (pure). */
export type EscalationStep =
  | { kind: 'escalate'; level: number; target: string; slaHours: number }
  | { kind: 'park'; auditedHops: string[] };

/**
 * The pure step: given a tier and how many hops have already fired, return the
 * next hop (escalate to hierarchy[hopsSoFar]) or the terminal park once the
 * hierarchy is exhausted. Deterministic; no clock, no I/O.
 */
export function nextEscalationStep(tier: EscalationTier, hopsSoFar: number): EscalationStep {
  if (hopsSoFar < tier.hierarchy.length) {
    return {
      kind: 'escalate',
      level: hopsSoFar,
      target: tier.hierarchy[hopsSoFar],
      slaHours: tier.slaHours,
    };
  }
  return { kind: 'park', auditedHops: tier.hierarchy.slice() };
}
