// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Prior-authorization LIFECYCLE mapping spec: a captured PA request -> the member's
 * PA lifecycle subgraph. ONE PriorAuthRequest node, its dated status phases, and
 * (where referenced) links to the driving ServiceRequest and the resulting Claim:
 *
 *   (Member)-[:HAS_PA_REQUEST {start submittedAt, end decisionAt}]->(PriorAuthRequest)  associative
 *   (PriorAuthRequest)-[:HAS_PA_STATUS {status}]->(PaStatusEvent)   one per phase, DATED validity interval
 *   (PriorAuthRequest)-[:PA_FOR_SERVICE]->(ServiceRequest)          associative, when referenced
 *   (PriorAuthRequest)-[:PA_FOR_CLAIM]->(Claim)                     associative, when referenced
 *
 * The status LIFECYCLE is modelled as dated validity intervals: each phase becomes
 * its own PaStatusEvent node and a HAS_PA_STATUS edge whose validity opens at the
 * phase's timestamp and closes at the next phase's timestamp (open for the latest
 * phase). So an asOf query can ask "what status was this PA in as of date X".
 *
 * BOUNDARY (does NOT set authoritative state): this spec REFERENCES the goldenThread
 * paMachine PaState vocabulary (STATUS_TO_STATE, compile-time checked against
 * `PaState`) for a human-readable `machineState` label, and stamps every node it
 * emits with `authoritative: false` + `stateSource: 'pa-lifecycle-capture'`. It
 * never calls paMachine.transition and never asserts an authoritative Approved/
 * Denied: authoritative PA state comes solely from the paMachine (payer
 * ClaimResponse). This domain captures; the machine decides.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { PaState } from '@/lib/workflow/paMachine';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned pa-lifecycle namespace — the single source of truth the integrity test pins. */
export const PA_LIFECYCLE_DOMAIN = 'pa-lifecycle';
export const PRIOR_AUTH_REQUEST_KIND = 'PriorAuthRequest';
export const PA_STATUS_KIND = 'PaStatusEvent';
export const HAS_PA_REQUEST = 'HAS_PA_REQUEST';
export const HAS_PA_STATUS = 'HAS_PA_STATUS';
export const PA_FOR_SERVICE = 'PA_FOR_SERVICE';
export const PA_FOR_CLAIM = 'PA_FOR_CLAIM';

/**
 * Captured lifecycle status -> the REFERENCED (non-authoritative) paMachine PaState.
 * `satisfies Record<string, PaState>` makes the compiler reject any value that is
 * not a real PaState, so this map can only ever reference the existing machine's
 * vocabulary — it can never invent a state the machine does not define.
 */
export const STATUS_TO_STATE = {
  submitted: 'Submitted',
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  appealed: 'AppealOrReview',
} satisfies Record<string, PaState>;

/** The referenced (observed, non-authoritative) machine state for a captured status. */
export function referencedState(status: string): PaState | 'Unknown' {
  return (STATUS_TO_STATE as Record<string, PaState>)[status] ?? 'Unknown';
}

interface Phase {
  status: string;
  at: string;
  seq: number;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function phases(v: unknown): Phase[] {
  if (!Array.isArray(v)) return [];
  return v.map((h, i) => ({
    status: str((h as Record<string, unknown>)?.status),
    at: str((h as Record<string, unknown>)?.at),
    seq:
      typeof (h as Record<string, unknown>)?.seq === 'number'
        ? ((h as Record<string, unknown>).seq as number)
        : i,
  }));
}
/** The node kind for a raw ref: its resource-type prefix (reuses existing kinds). */
function refKind(ref: string, fallback: string): string {
  return ref.split('/')[0] || fallback;
}

export const priorAuthLifecycleSpec = {
  domain: PA_LIFECYCLE_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('pa-lifecycle.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const paRef = str(p.paRef, `PriorAuthRequest/${event.memberId}`);
    const history = phases(p.statusHistory);
    const submittedAt =
      str(p.submittedAt) || event.occurredAt || new Date(deps.now()).toISOString();
    const decisionAt = str(p.decisionAt);
    const currentStatus = str(p.currentStatus, history[history.length - 1]?.status ?? '');
    const out: Mutation[] = [memberNode(event)];

    // The captured PA request node. Non-authoritative BY CONSTRUCTION: it carries
    // the REFERENCED machine-state label but declares it is not the source of truth.
    out.push(
      ...resourceNode(event, PRIOR_AUTH_REQUEST_KIND, paRef, {
        currentStatus,
        machineState: referencedState(currentStatus),
        authoritative: false,
        stateSource: 'pa-lifecycle-capture',
        submittedAt: str(p.submittedAt),
        decisionAt,
        provenance: str(p.provenance),
      })
    );
    out.push({
      op: 'UpsertEdge',
      type: HAS_PA_REQUEST,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: PRIOR_AUTH_REQUEST_KIND, key: paRef },
      properties: { currentStatus, machineState: referencedState(currentStatus) },
      validity: { start: submittedAt, end: decisionAt || null },
      semantics: associative,
    });

    // Dated status transitions as validity intervals: each phase is its own node +
    // edge, the edge's interval opening at the phase timestamp and closing at the
    // next phase's timestamp (open for the latest). Non-authoritative capture.
    const paId = paRef.split('/').pop() ?? event.memberId;
    for (const phase of history) {
      const nodeKey = `${PA_STATUS_KIND}/${paId}/${phase.seq}`;
      out.push(
        ...resourceNode(event, PA_STATUS_KIND, nodeKey, {
          status: phase.status,
          machineState: referencedState(phase.status),
          seq: phase.seq,
          enteredAt: phase.at,
          authoritative: false,
        })
      );
      const next = history.find((h) => h.seq === phase.seq + 1);
      out.push({
        op: 'UpsertEdge',
        type: HAS_PA_STATUS,
        from: { kind: PRIOR_AUTH_REQUEST_KIND, key: paRef },
        to: { kind: PA_STATUS_KIND, key: nodeKey },
        properties: { status: phase.status, machineState: referencedState(phase.status) },
        validity: { start: phase.at, end: next ? next.at : null },
        semantics: associative,
      });
    }

    // Where referenced, link to the driving ServiceRequest and the resulting Claim.
    // Both are RAW references (reusing the ServiceRequest / Claim node kinds); the
    // PA domain does not invent their identity.
    const serviceRequestRef = str(p.serviceRequestRef);
    if (serviceRequestRef) {
      const kind = refKind(serviceRequestRef, 'ServiceRequest');
      out.push(
        ...resourceNode(event, kind, serviceRequestRef, {
          rawRef: serviceRequestRef,
          linkage: 'pa-lifecycle-capture',
        })
      );
      out.push({
        op: 'UpsertEdge',
        type: PA_FOR_SERVICE,
        from: { kind: PRIOR_AUTH_REQUEST_KIND, key: paRef },
        to: { kind, key: serviceRequestRef },
        properties: {},
        validity: { start: submittedAt, end: null },
        semantics: associative,
      });
    }
    const claimRef = str(p.claimRef);
    if (claimRef) {
      const kind = refKind(claimRef, 'Claim');
      out.push(
        ...resourceNode(event, kind, claimRef, {
          rawRef: claimRef,
          linkage: 'pa-lifecycle-capture',
        })
      );
      out.push({
        op: 'UpsertEdge',
        type: PA_FOR_CLAIM,
        from: { kind: PRIOR_AUTH_REQUEST_KIND, key: paRef },
        to: { kind, key: claimRef },
        properties: {},
        validity: { start: submittedAt, end: null },
        semantics: associative,
      });
    }
    return out;
  },
};
