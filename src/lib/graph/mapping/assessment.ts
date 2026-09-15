// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Assessments mapping spec: completed-assessment events -> the member's assessment
 * subgraph. ONE new node type and a dated associative link to the member:
 *
 *   (Member)-[:ASSESSED_BY {valid from authored}]->(QuestionnaireResponse)   associative
 *
 * ASSESSED_BY is a FACTUAL record link (associative), dated from the authored date
 * so an asOf query can ask "what assessments were on record as of X" and the
 * whole-person lens surfaces the QuestionnaireResponse off the member. A completed
 * questionnaire is a recorded event, not an asserted causal claim about the member's
 * state, so it mirrors the immunizations IMMUNIZED_WITH factual-record semantics.
 * The `patient-reported` vs `clinician-recorded` provenance the adapter derived
 * travels as a PHI-safe node/edge property, never as an anonymous causal assertion.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned assessments namespace — the single source of truth the integrity test pins. */
export const ASSESSMENT_DOMAIN = 'assessments';
export const QUESTIONNAIRE_RESPONSE_KIND = 'QuestionnaireResponse';
export const ASSESSED_BY = 'ASSESSED_BY';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function bool(v: unknown): boolean {
  return v === true;
}

export const assessmentSpec = {
  domain: ASSESSMENT_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('assessment.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const qrRef = str(p.questionnaireResponseRef, `QuestionnaireResponse/${event.memberId}`);
    const start = str(p.authored) || event.occurredAt || new Date(deps.now()).toISOString();
    const provenance = str(p.provenance);
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, QUESTIONNAIRE_RESPONSE_KIND, qrRef, {
        questionnaireRef: str(p.questionnaireRef),
        status: str(p.status, 'completed'),
        authored: str(p.authored),
        patientReported: bool(p.patientReported),
        provenance,
      })
    );
    // The member was ASSESSED_BY this questionnaire response — a factual record
    // link (associative), dated from the authored date. Provenance (patient-reported
    // vs clinician-recorded) is an edge property, not a causal assertion.
    out.push({
      op: 'UpsertEdge',
      type: ASSESSED_BY,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: QUESTIONNAIRE_RESPONSE_KIND, key: qrRef },
      properties: {
        questionnaireRef: str(p.questionnaireRef),
        patientReported: bool(p.patientReported),
        provenance,
      },
      validity: { start, end: null },
      semantics: associative,
    });
    return out;
  },
};
