// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Procedures mapping spec: performed procedure events -> the member's procedure
 * subgraph. ONE new node type, a dated CAUSAL link to the member, and (when the
 * source references an encounter) a dated associative link to the EXISTING
 * Encounter node:
 *
 *   (Member)-[:PERFORMED_ON {causal, asserter, basis}]->(Procedure)      causal
 *   (Procedure)-[:PERFORMED_DURING {valid from performedDateTime}]->(Encounter)  associative
 *
 * PERFORMED_ON is an ASSERTED clinical act: a provider asserts this procedure was
 * performed on the member. Under DP-1 that asserted claim MUST be a CAUSAL edge
 * carrying provenance: `asserter` = the performing source (provider-performed),
 * `basis` = the CPT/SNOMED code + procedure ref (PHI-safe). It is dated from the
 * procedure date so an asOf query can ask "what procedures were performed as of X",
 * and the whole-person lens surfaces the Procedure off the member.
 *
 * PERFORMED_DURING is a FACTUAL structural link to the already-projected Encounter
 * node (associative, dated); it is only emitted when the source Procedure carried
 * an encounter reference, so a standalone procedure projects without it.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, causal, memberNode, resourceNode } from './spec';

/** Pinned procedures namespace — the single source of truth the integrity test pins. */
export const PROCEDURE_DOMAIN = 'procedures';
export const PROCEDURE_KIND = 'Procedure';
export const PERFORMED_ON = 'PERFORMED_ON';
/** The structural link to the existing Encounter node (reuses the encounter kind). */
export const PERFORMED_DURING = 'PERFORMED_DURING';
export const ENCOUNTER_KIND = 'Encounter';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function procedureCode(p: Record<string, unknown>): string {
  const c = (p.code ?? {}) as Record<string, unknown>;
  return str(c.code);
}

export const procedureSpec = {
  domain: PROCEDURE_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('procedure.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const procedureRef = str(p.procedureRef, `Procedure/${event.memberId}`);
    const start = str(p.performedDateTime) || event.occurredAt || new Date(deps.now()).toISOString();
    const asserter = str(p.provenance, event.source.system);
    const code = procedureCode(p);
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, PROCEDURE_KIND, procedureRef, {
        code,
        status: str(p.status, 'completed'),
        performedDateTime: str(p.performedDateTime),
      }),
    );
    // The procedure was PERFORMED_ON the member — an asserted clinical act, so a
    // CAUSAL edge carrying who performed it + the procedure code @ procedure ref.
    out.push({
      op: 'UpsertEdge',
      type: PERFORMED_ON,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: PROCEDURE_KIND, key: procedureRef },
      properties: { code, status: str(p.status, 'completed') },
      validity: { start, end: null },
      semantics: causal(asserter, `${code || 'no-code'}@${procedureRef}`),
    });
    // When the source referenced an encounter, link the Procedure to the EXISTING
    // Encounter node (factual structural link, associative, dated). No encounter
    // ref -> standalone procedure, no edge.
    const encounterRef = str(p.encounterRef);
    if (encounterRef) {
      out.push({
        op: 'UpsertEdge',
        type: PERFORMED_DURING,
        from: { kind: PROCEDURE_KIND, key: procedureRef },
        to: { kind: ENCOUNTER_KIND, key: encounterRef },
        properties: { code },
        validity: { start, end: null },
        semantics: associative,
      });
    }
    return out;
  },
};
