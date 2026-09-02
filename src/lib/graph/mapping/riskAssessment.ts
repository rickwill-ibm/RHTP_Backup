// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * RiskAssessment mapping spec: a payer risk-stratification RiskAssessment event ->
 * the member's risk-profile subgraph. ONE node type and a dated associative link:
 *
 *   (Member)-[:HAS_RISK_ASSESSMENT {valid from occurredAt}]->(RiskAssessment)
 *
 * The edge is ASSOCIATIVE (a factual "this risk score was computed for the member"
 * link, not an asserted causal claim) and DATED from the assessment time, so an
 * asOf query can ask "what was the member's RAF / predicted risk on date X". The
 * node carries NUMBERS and CODES only — the predicted-outcome code, the probability
 * decimal, the parsed RAF score number, and the method code — NEVER the free-text
 * rationale narrative (PHI-minimal projection). Restriction is still read from the
 * envelope so the DP-1 rule is uniform, though seed RAF is not Part 2.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned risk-assessment namespace — the single source of truth. */
export const RISK_ASSESSMENT_DOMAIN = 'risk-assessment';
export const RISK_ASSESSMENT_KIND = 'RiskAssessment';
export const HAS_RISK_ASSESSMENT = 'HAS_RISK_ASSESSMENT';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export const riskAssessmentSpec = {
  domain: RISK_ASSESSMENT_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('risk-assessment.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const riskRef = str(p.riskRef, `RiskAssessment/${event.memberId}`);
    const start = event.occurredAt || new Date(deps.now()).toISOString();
    // rafScore is OPTIONAL: `null`/absent means "no RAF present" and must NOT be
    // projected as a phantom 0 (the red-team silent-corruption finding). Include the
    // property only when the adapter parsed a real number.
    const hasRaf = typeof p.rafScore === 'number' && Number.isFinite(p.rafScore);
    const nodeProps: Record<string, string | number> = {
      predictedOutcome: str(p.predictedOutcome),
      probability: num(p.probability),
      method: str(p.method),
    };
    if (hasRaf) nodeProps.rafScore = p.rafScore as number;
    const edgeProps: Record<string, string | number> = { probability: num(p.probability) };
    if (hasRaf) edgeProps.rafScore = p.rafScore as number;
    const out: Mutation[] = [memberNode(event)];
    out.push(...resourceNode(event, RISK_ASSESSMENT_KIND, riskRef, nodeProps));
    out.push({
      op: 'UpsertEdge',
      type: HAS_RISK_ASSESSMENT,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: RISK_ASSESSMENT_KIND, key: riskRef },
      properties: edgeProps,
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
