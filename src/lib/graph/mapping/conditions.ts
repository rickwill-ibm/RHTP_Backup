// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Conditions mapping spec: a coded problem-list Condition event -> the member's
 * condition subgraph. ONE node type and a dated associative link:
 *
 *   (Member)-[:HAS_PROBLEM {valid from recordedDate}]->(Condition)   associative
 *
 * HAS_PROBLEM is the factual "member has this problem-list condition" link
 * (associative, dated from the recorded date), so an asOf query can ask "what
 * problems as of date X" and the whole-person lens surfaces the Condition off the
 * member. The node carries the ICD-10-CM code, the SNOMED code when the source
 * dual-coded it, the clinical/verification status, and — honestly, source-driven
 * — the HCC code and `hccRelevant` flag when a CMS-HCC coding was attached.
 *
 * This is the coded problem-list domain, distinct from behavioral-health (which
 * owns the BH/Part 2 Condition subset via its own event namespace). Both project
 * `Condition` nodes keyed by their own conditionRef, so they never collide.
 *
 * The pinned namespace (L3) is exported so the conditions namespace-integrity test
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned conditions namespace — the single source of truth the integrity test pins. */
export const CONDITIONS_DOMAIN = 'conditions';
export const CONDITION_KIND = 'Condition';
export const HAS_PROBLEM = 'HAS_PROBLEM';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function icdCode(p: Record<string, unknown>): string {
  const c = (p.code ?? {}) as Record<string, unknown>;
  return str(c.code);
}
function snomedCode(p: Record<string, unknown>): string {
  const c = (p.snomed ?? {}) as Record<string, unknown>;
  return str(c.code);
}
function hccCode(p: Record<string, unknown>): string {
  const c = (p.hcc ?? {}) as Record<string, unknown>;
  return str(c.code);
}
/** One MEAT flag off the (optional) payload `meat` object — PHI-safe boolean, false when absent. */
function meatFlag(
  p: Record<string, unknown>,
  flag: 'monitored' | 'evaluated' | 'assessed' | 'treated'
): boolean {
  const m = (p.meat ?? {}) as Record<string, unknown>;
  return m[flag] === true;
}

export const conditionsSpec = {
  domain: CONDITIONS_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('condition.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const conditionRef = str(p.conditionRef, `Condition/${event.memberId}`);
    const start = str(p.recordedDate) || event.occurredAt || new Date(deps.now()).toISOString();
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, CONDITION_KIND, conditionRef, {
        code: icdCode(p),
        snomed: snomedCode(p),
        hcc: hccCode(p),
        hccRelevant: Boolean(p.hccRelevant),
        clinicalStatus: str(p.clinicalStatus, 'active'),
        verificationStatus: str(p.verificationStatus, 'confirmed'),
        category: str(p.category, 'problem-list-item'),
        // RADV MEAT documentation signal (PHI-safe booleans) — what a closed-gap-cited
        // Condition must carry to be RADV-defensible. All false on an unMEATed Condition.
        meatMonitored: meatFlag(p, 'monitored'),
        meatEvaluated: meatFlag(p, 'evaluated'),
        meatAssessed: meatFlag(p, 'assessed'),
        meatTreated: meatFlag(p, 'treated'),
      })
    );
    // The member HAS this problem — a factual problem-list link (associative),
    // dated from the recorded date. Not an asserted causal claim.
    out.push({
      op: 'UpsertEdge',
      type: HAS_PROBLEM,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: CONDITION_KIND, key: conditionRef },
      properties: { code: icdCode(p), hccRelevant: Boolean(p.hccRelevant) },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
