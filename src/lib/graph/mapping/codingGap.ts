// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * CodingGap mapping spec: a Da Vinci Risk Adjustment coding-gap event -> the member's
 * risk-adjustment subgraph. ONE node type and TWO dated associative links:
 *
 *   (Member)-[:HAS_CODING_GAP {valid from period.start}]->(CodingGap)
 *   (CodingGap)-[:SUPPORTED_BY {valid from period.start}]->(Condition|Observation|…)
 *
 * Both edges are ASSOCIATIVE (a factual "this coding gap was reported for the member",
 * and "this gap cites this evidence") — NEVER causal, NEVER an asserted diagnosis. This
 * is the coding-intensity firewall in the graph: a coding gap (especially a `suspected`
 * one) is a payer-analytics hypothesis, so it may only CITE evidence, never MINT it.
 *
 * SUPPORTED_BY therefore targets a NEUTRAL `Evidence` node (NOT a `Condition`/
 * `Observation`): because both stores auto-create an edge's endpoints, targeting the
 * clinical kind would MINT a `Condition` node keyed by an unverified reference — a
 * hypothesis materialized as a diagnosis, the exact firewall breach. The Evidence node
 * is keyed by the cited FHIR reference and carries that reference + its resource type as
 * properties, so a consumer can JOIN Evidence.evidenceRef to a real clinical node when
 * one genuinely exists, without this path ever fabricating one.
 *
 * The node carries CODES, STATUSES, DATES only (HCC category, evidence status, suspect
 * type, hierarchical status, model+version, period) — NEVER a free-text rationale
 * (PHI-minimal). A SUD-linked HCC gap arrives with a 42 CFR Part 2 label on the
 * envelope (segmentation-at-transform), so it projects as a RESTRICTED node and the
 * consent lens filters it uniformly (DP-1). Restriction is read from the envelope.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned coding-gap namespace — the single source of truth. */
export const CODING_GAP_DOMAIN = 'coding-gap';
export const CODING_GAP_KIND = 'CodingGap';
export const HAS_CODING_GAP = 'HAS_CODING_GAP';
export const SUPPORTED_BY = 'SUPPORTED_BY';
/**
 * The neutral kind a SUPPORTED_BY edge points at. Deliberately NOT a clinical kind:
 * an edge auto-creates its endpoints in both stores, so targeting `Condition` would
 * MINT a diagnosis from an unverified reference (firewall breach). An `Evidence` node
 * records the citation without materializing a clinical assertion.
 */
export const EVIDENCE_KIND = 'Evidence';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function refList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
/** The FHIR resource type a reference names ('Condition/x' -> 'Condition'), for join-back. */
function resourceTypeOfRef(ref: string): string {
  const type = ref.split('/')[0];
  // A contained ('#x') / urn / absolute-URL ref has no clean type; record it as 'unknown'
  // rather than a garbage kind — the citation is still preserved on the Evidence node.
  return type && /^[A-Za-z]+$/.test(type) ? type : 'unknown';
}

export const codingGapSpec = {
  domain: CODING_GAP_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('coding-gap.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const gapRef = str(p.gapRef, `CodingGap/${event.memberId}`);
    const start = str(p.periodStart) || event.occurredAt || new Date(deps.now()).toISOString();
    const end = str(p.periodEnd) || null;

    const nodeProps: Record<string, string> = {
      conditionCategory: str(p.conditionCategory),
      codeSystem: str(p.codeSystem),
      model: str(p.model),
      modelVersion: str(p.modelVersion),
      evidenceStatus: str(p.evidenceStatus),
      suspectType: str(p.suspectType),
      hierarchicalStatus: str(p.hierarchicalStatus),
      evidenceStatusDate: str(p.evidenceStatusDate),
      periodStart: str(p.periodStart),
      periodEnd: end ?? '',
    };
    const out: Mutation[] = [memberNode(event)];
    out.push(...resourceNode(event, CODING_GAP_KIND, gapRef, nodeProps));
    out.push({
      op: 'UpsertEdge',
      type: HAS_CODING_GAP,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: CODING_GAP_KIND, key: gapRef },
      properties: {
        conditionCategory: str(p.conditionCategory),
        evidenceStatus: str(p.evidenceStatus),
        suspectType: str(p.suspectType),
      },
      validity: { start, end },
      semantics: associative,
    });
    // SUPPORTED_BY: CITE the evidence the gap references, as an associative link to a
    // NEUTRAL Evidence node (never a clinical kind — see EVIDENCE_KIND). The Evidence
    // node carries the reference + its resource type so a consumer can join back to a
    // real clinical node when one exists, without this path ever minting a diagnosis.
    for (const ref of refList(p.evidenceRefs)) {
      const resourceType = resourceTypeOfRef(ref);
      out.push(...resourceNode(event, EVIDENCE_KIND, ref, { evidenceRef: ref, resourceType }));
      out.push({
        op: 'UpsertEdge',
        type: SUPPORTED_BY,
        from: { kind: CODING_GAP_KIND, key: gapRef },
        to: { kind: EVIDENCE_KIND, key: ref },
        properties: { evidenceRef: ref, resourceType },
        validity: { start, end },
        semantics: associative,
      });
    }
    return out;
  },
};
