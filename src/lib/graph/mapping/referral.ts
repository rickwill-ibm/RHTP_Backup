// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Referrals mapping spec: referral request events -> the member's referral
 * subgraph. ONE new node type, a dated associative link to the member, and (when
 * the referral names a performer) a dated associative link to the RAW performer
 * reference node:
 *
 *   (Member)-[:REFERRED_VIA {valid from authoredOn}]->(ServiceRequest)      associative
 *   (ServiceRequest)-[:REFERRED_TO {valid from authoredOn}]->(Org|Practitioner)  associative
 *
 * REFERRED_VIA is a FACTUAL order link (associative), dated from the authoredOn
 * date so an asOf query can ask "what referrals were open as of X" and the
 * whole-person lens surfaces the ServiceRequest off the member. It mirrors the
 * medications PRESCRIBED_FOR order semantics: a referral is an intent/order the
 * referring provider placed, not an asserted causal claim about the member's
 * state. The referring provenance travels as a node/edge property (PHI-safe).
 *
 * REFERRED_TO links the referral to the performer named in the source. F5: when
 * the referral carries a VALID NPI, the performer RESOLVES to an NPI-anchored
 * ProviderIdentity node (key `npi:<npi>`, `providerResolution: 'resolved'`) via
 * the provider resolver — the raw+deferred ref from earlier iterations now
 * resolves. When NO valid NPI is present the performer node stays a RAW REFERENCE
 * (its key is the opaque source ref, flagged `providerResolution: 'deferred-I8A'`,
 * kind derived from the ref prefix, reusing Practitioner / Organization): E9
 * forbids inventing an NPI, so an unresolvable performer is kept raw + flagged,
 * never a fabricated identity.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import {
  anchorProviderRef,
  PROVIDER_IDENTITY_KIND,
  providerNodeKey,
  providerNodeProps,
} from '@/lib/identity/provider';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned referrals namespace — the single source of truth the integrity test pins. */
export const REFERRAL_DOMAIN = 'referrals';
export const SERVICE_REQUEST_KIND = 'ServiceRequest';
export const REFERRED_VIA = 'REFERRED_VIA';
/** The associative link to the performer: a resolved ProviderIdentity node when the
 * referral carries a valid NPI, else the raw (deferred-I8A) performer reference. */
export const REFERRED_TO = 'REFERRED_TO';
/** Re-exported so the namespace-integrity test pins the resolved performer node kind. */
export { PROVIDER_IDENTITY_KIND } from '@/lib/identity/provider';

/**
 * The ServiceRequest.status LIFECYCLE this domain captures (FHIR ServiceRequest.status):
 * active -> on-hold -> completed | revoked | entered-in-error. The three below are
 * TERMINAL — they end the referral. A referral that never reaches one is still open.
 */
export const REFERRAL_STATUSES = ['active', 'on-hold', 'completed', 'revoked', 'entered-in-error'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
const TERMINAL_REFERRAL_STATUSES = new Set<string>(['completed', 'revoked', 'entered-in-error']);

/**
 * The CLOSED-LOOP signal: what happened to the referral in the real world, so the
 * closed-loop RATE is computable off the graph. 'scheduled' is in-progress (loop NOT
 * yet closed); 'seen' | 'declined' | 'dropped' close the loop. Only 'seen' is a
 * REACHED close (the member was actually seen) — the numerator of the closed-loop rate.
 */
export const LOOP_SIGNALS = ['scheduled', 'seen', 'declined', 'dropped'] as const;
export type LoopSignal = (typeof LOOP_SIGNALS)[number];
const CLOSED_LOOP_SIGNALS = new Set<string>(['seen', 'declined', 'dropped']);

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
interface StatusPhase {
  status: string;
  at: string;
}
/**
 * The dated status phases of a referral. When the source carried a statusHistory we
 * capture it verbatim (ordered, dated) so the lifecycle is a TRAIL, not a snapshot;
 * absent a history the single current status is the only phase.
 */
function statusPhases(v: unknown, fallbackStatus: string, fallbackAt: string): StatusPhase[] {
  if (Array.isArray(v) && v.length > 0) {
    return v.map((h) => ({
      status: str((h as Record<string, unknown>)?.status),
      at: str((h as Record<string, unknown>)?.at),
    }));
  }
  return [{ status: fallbackStatus, at: fallbackAt }];
}
function serviceCode(p: Record<string, unknown>): string {
  const c = (p.serviceCode ?? {}) as Record<string, unknown>;
  return str(c.code);
}
/** The node kind for a raw performer ref: its resource-type prefix, or Organization. */
function performerKind(ref: string): string {
  const prefix = ref.split('/')[0];
  return prefix || 'Organization';
}

export const referralSpec = {
  domain: REFERRAL_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('referral.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const referralRef = str(p.referralRef, `ServiceRequest/${event.memberId}`);
    const start = str(p.authoredOn) || event.occurredAt || new Date(deps.now()).toISOString();
    const code = serviceCode(p);

    // Status LIFECYCLE. E9: the default is 'active' (open) — a missing status must
    // NEVER silently mark a referral completed/revoked. The dated phase trail proves
    // the lifecycle is captured as transitions, not a single overwritten snapshot.
    const phases = statusPhases(p.statusHistory, str(p.status, 'active'), str(p.authoredOn) || start);
    const status = str(p.status) || phases[phases.length - 1]?.status || 'active';
    const statusTrail = phases.map((ph) => `${ph.status}@${ph.at}`);
    const statusTerminal = TERMINAL_REFERRAL_STATUSES.has(status);

    // Closed-loop SIGNAL. E9: default '' (open/unknown) — never a closed signal. The
    // two booleans make the closed-loop rate computable off the node alone: loopClosed
    // is the denominator-of-closed, loopReached ('seen') is the reached numerator.
    const loopStatus = str(p.loopStatus);
    const loopClosed = CLOSED_LOOP_SIGNALS.has(loopStatus);
    const loopReached = loopStatus === 'seen';

    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, SERVICE_REQUEST_KIND, referralRef, {
        serviceCode: code,
        status,
        statusTrail,
        statusTerminal,
        intent: str(p.intent, 'order'),
        authoredOn: str(p.authoredOn),
        loopStatus,
        loopClosed,
        loopReached,
        provenance: str(p.provenance),
      }),
    );
    // The member was REFERRED_VIA this ServiceRequest — a factual order link
    // (associative), dated from the authoredOn date. Provenance is carried as an
    // edge property, not a causal assertion (a referral is an order, not a claim).
    out.push({
      op: 'UpsertEdge',
      type: REFERRED_VIA,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: SERVICE_REQUEST_KIND, key: referralRef },
      properties: { serviceCode: code, provenance: str(p.provenance) },
      validity: { start, end: null },
      semantics: associative,
    });
    // When the source named a performer, link the referral to it. F5: if the
    // referral carries a VALID NPI (an explicit performerNpi, or one extractable
    // from the performer ref), the performer RESOLVES to an NPI-anchored
    // ProviderIdentity node — the raw+deferred ref from earlier iterations now
    // resolves. If no valid NPI is present, we keep the RAW reference node flagged
    // deferred-I8A exactly as before: E9 forbids inventing an NPI, so an
    // unresolvable performer stays raw + flagged, never a fabricated identity.
    const performerRef = str(p.performerRef);
    if (performerRef) {
      const provider = anchorProviderRef({
        npi: str(p.performerNpi) || undefined,
        rawRef: performerRef,
        inline: {
          name: str(p.performerName) || undefined,
          organization: str(p.performerOrganization) || undefined,
          taxonomy: str(p.performerTaxonomy) || undefined,
        },
      });
      if (provider) {
        const key = providerNodeKey(provider.npi);
        out.push(...resourceNode(event, PROVIDER_IDENTITY_KIND, key, providerNodeProps(provider)));
        out.push({
          op: 'UpsertEdge',
          type: REFERRED_TO,
          from: { kind: SERVICE_REQUEST_KIND, key: referralRef },
          to: { kind: PROVIDER_IDENTITY_KIND, key },
          properties: { providerResolution: 'resolved', npi: provider.npi },
          validity: { start, end: null },
          semantics: associative,
        });
      } else {
        const kind = performerKind(performerRef);
        out.push(
          ...resourceNode(event, kind, performerRef, {
            rawRef: performerRef,
            providerResolution: 'deferred-I8A',
          }),
        );
        out.push({
          op: 'UpsertEdge',
          type: REFERRED_TO,
          from: { kind: SERVICE_REQUEST_KIND, key: referralRef },
          to: { kind, key: performerRef },
          properties: { providerResolution: 'deferred-I8A' },
          validity: { start, end: null },
          semantics: associative,
        });
      }
    }
    return out;
  },
};
