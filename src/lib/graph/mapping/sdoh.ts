// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * SDOH mapping spec: community screening -> the member's social-need subgraph.
 *
 *   (Member)-[:SCREENED_FOR {valid from screenDate}]->(SdohScreening)      associative
 *   (Member)-[:HAS_UNMET_NEED {causal, asserter, basis}]->(SocialNeed)     causal
 *
 * SCREENED_FOR is the raw factual link (associative, dated). A POSITIVE screen
 * additionally asserts a derived claim — the member has an unmet social need — so
 * HAS_UNMET_NEED is a CAUSAL edge and MUST carry provenance: `asserter` = the
 * reporting source, `basis` = the Z-code + screening ref (PHI-safe). This is the
 * DP-1 rule that a graph's causal assertions are always attributable.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, causal, memberNode, resourceNode } from './spec';

const SCREENING_KIND = 'SdohScreening';
const NEED_KIND = 'SocialNeed';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export const sdohSpec = {
  domain: 'sdoh',
  matches(eventType: string): boolean {
    return eventType.startsWith('sdoh.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const screeningRef = str(p.responseRef, `Observation/${event.memberId}`);
    const domain = str(p.domain, 'unknown');
    const zObj = (p.zCode ?? {}) as Record<string, unknown>;
    const zCode = str(zObj.code);
    const positive = p.positive === true;
    const start = event.occurredAt || new Date(deps.now()).toISOString();
    const asserter = str(p.provenance, event.source.system);

    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, SCREENING_KIND, screeningRef, {
        domain,
        zCode,
        positive,
      }),
    );
    out.push({
      op: 'UpsertEdge',
      type: 'SCREENED_FOR',
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: SCREENING_KIND, key: screeningRef },
      properties: { domain },
      validity: { start, end: null },
      semantics: associative,
    });
    if (positive) {
      const needKey = `${event.memberId}:${domain}`;
      out.push(
        ...resourceNode(event, NEED_KIND, needKey, { domain, zCode }),
      );
      out.push({
        op: 'UpsertEdge',
        type: 'HAS_UNMET_NEED',
        from: { kind: MEMBER_KIND, key: event.memberId },
        to: { kind: NEED_KIND, key: needKey },
        properties: { domain },
        validity: { start, end: null },
        // Causal claim: attributable to the reporting source, on the basis of the
        // positive screen (Z-code + screening ref). Never anonymous.
        semantics: causal(asserter, `${zCode || 'no-zcode'}@${screeningRef}`),
      });
    }
    return out;
  },
};
