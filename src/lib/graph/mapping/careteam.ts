// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Care-team mapping spec. This spec now serves TWO arrival paths onto the SAME
 * CareTeam / CareTeamMember node types:
 *
 *  1. The Iteration-2 DEMO lens path (`careteam.assigned` / `careteam.unassigned`):
 *       (Member)-[:HAS_CARE_TEAM {valid from occurredAt}]->(CareTeamMember)
 *     ASSOCIATIVE, dated; `careteam.unassigned` CLOSES the edge without deleting it.
 *     This path is unchanged so the existing care-team lens stays green.
 *
 *  2. The Iteration-6 PIPELINE-FED path (`care-team.formed`): a synthetic FHIR
 *     CareTeam + participant roster, normalized by the care-team adapter, projects
 *     the full team structure:
 *       (CareTeam)-[:CARE_TEAM_FOR {dated}]->(Member)             associative
 *       (CareTeamMember|Practitioner)-[:MEMBER_OF_CARE_TEAM]->(CareTeam)  associative
 *       (Member)-[:HAS_CARE_TEAM]->(CareTeamMember|Practitioner)  associative
 *     The HAS_CARE_TEAM edge is reused so the existing care-team lens (which reads
 *     HAS_CARE_TEAM off the member) surfaces pipeline-fed participants too, and a
 *     Practitioner-referenced participant REUSES the shared Practitioner node kind.
 *
 * Care-team members (providers, care managers, community workers) are
 * NPI/identity-anchored (DP-7 O-6) but never carry Part 2 restriction of their own;
 * restriction is still read from the envelope so the rule stays uniform. Every edge
 * is dated for asOf queries.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, Props, ProjectorDeps } from '../types';
import {
  anchorProviderRef,
  PROVIDER_IDENTITY_KIND,
  providerNodeKey,
  providerNodeProps,
} from '@/lib/identity/provider';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned care-team namespace — the single source of truth the integrity test pins. */
export const CARE_TEAM_DOMAIN = 'care-team';
export const CARE_TEAM_KIND = 'CareTeam';
export const CARE_TEAM_MEMBER_KIND = 'CareTeamMember';
/** Reused for a participant whose FHIR reference is a Practitioner. */
export const PRACTITIONER_KIND = 'Practitioner';
export const CARE_TEAM_FOR = 'CARE_TEAM_FOR';
export const MEMBER_OF_CARE_TEAM = 'MEMBER_OF_CARE_TEAM';
/** The member-facing edge both the demo and pipeline paths share (lens surface). */
export const HAS_CARE_TEAM = 'HAS_CARE_TEAM';
/** Re-exported so a namespace-integrity test can pin the resolved provider node kind. */
export { PROVIDER_IDENTITY_KIND } from '@/lib/identity/provider';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** One normalized care-team participant (shape mirrors the adapter payload). */
interface Participant {
  participantRef: string;
  kind: string;
  role: string;
  /** An explicit NPI the feed supplied for this participant (F5-b), if any. */
  npi: string;
  name: string;
}

function participantsOf(p: Record<string, unknown>): Participant[] {
  const raw = Array.isArray(p.participants) ? p.participants : [];
  return raw
    .map((v) => {
      const o = (v ?? {}) as Record<string, unknown>;
      const kind = str(o.kind, CARE_TEAM_MEMBER_KIND);
      return {
        participantRef: str(o.participantRef),
        kind: kind === PRACTITIONER_KIND ? PRACTITIONER_KIND : CARE_TEAM_MEMBER_KIND,
        role: str(o.role, 'care-team-member'),
        npi: str(o.npi) || str(o.participantNpi),
        name: str(o.name),
      };
    })
    .filter((x) => x.participantRef !== '');
}

/**
 * The roster node a participant projects onto. F5-b: when the participant carries a
 * VALID NPI (explicit, or extractable from its ref), it RESOLVES to an NPI-anchored
 * ProviderIdentity node so two teams naming the same provider by NPI converge on one
 * node. No valid NPI keeps the raw CareTeamMember / Practitioner node (E9: never
 * fabricate an NPI). The role travels as a node property either way.
 */
function rosterNode(part: Participant): { kind: string; key: string; props: Props } {
  const provider = anchorProviderRef({
    npi: part.npi || undefined,
    rawRef: part.participantRef,
    inline: { name: part.name || undefined },
  });
  if (provider) {
    return {
      kind: PROVIDER_IDENTITY_KIND,
      key: providerNodeKey(provider.npi),
      props: { ...providerNodeProps(provider), role: part.role },
    };
  }
  return { kind: part.kind, key: part.participantRef, props: { role: part.role } };
}

export const careteamSpec = {
  domain: CARE_TEAM_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('care-team.') || eventType.startsWith('careteam.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    return event.eventType.startsWith('care-team.') ? formed(event, deps) : assigned(event, deps);
  },
};

/**
 * care-team.formed -> the full CareTeam structure. The CareTeam node points at the
 * member (CARE_TEAM_FOR), each participant is a member OF the team
 * (MEMBER_OF_CARE_TEAM) and is also linked off the member (HAS_CARE_TEAM) so the
 * existing care-team lens surfaces it. All edges associative + dated.
 */
function formed(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const careTeamRef = str(p.careTeamRef, `CareTeam/${event.memberId}`);
  const start = str(p.periodStart) || event.occurredAt || new Date(deps.now()).toISOString();
  const status = str(p.status, 'active');
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, CARE_TEAM_KIND, careTeamRef, { status, category: str(p.category) })
  );
  // The team is FOR the member (associative, dated).
  out.push({
    op: 'UpsertEdge',
    type: CARE_TEAM_FOR,
    from: { kind: CARE_TEAM_KIND, key: careTeamRef },
    to: { kind: MEMBER_KIND, key: event.memberId },
    properties: { status },
    validity: { start, end: null },
    semantics: associative,
  });
  for (const part of participantsOf(p)) {
    // F5-b: a participant carrying a valid NPI resolves to a ProviderIdentity node;
    // otherwise it stays the raw CareTeamMember / Practitioner roster node.
    const node = rosterNode(part);
    const edgeProps: Props = { role: part.role };
    out.push(...resourceNode(event, node.kind, node.key, node.props));
    // The participant is a member OF the team.
    out.push({
      op: 'UpsertEdge',
      type: MEMBER_OF_CARE_TEAM,
      from: { kind: node.kind, key: node.key },
      to: { kind: CARE_TEAM_KIND, key: careTeamRef },
      properties: edgeProps,
      validity: { start, end: null },
      semantics: associative,
    });
    // Reuse HAS_CARE_TEAM so the existing member-scoped care-team lens surfaces it.
    out.push({
      op: 'UpsertEdge',
      type: HAS_CARE_TEAM,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: node.kind, key: node.key },
      properties: edgeProps,
      validity: { start, end: null },
      semantics: associative,
    });
  }
  return out;
}

/** The unchanged Iteration-2 demo path: careteam.assigned / careteam.unassigned. */
function assigned(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const providerRef = str(p.providerRef, `Practitioner/${event.memberId}`);
  const start = event.occurredAt || new Date(deps.now()).toISOString();
  const unassigned = event.eventType === 'careteam.unassigned';
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, CARE_TEAM_MEMBER_KIND, providerRef, {
      role: str(p.role, 'care-manager'),
      name: str(p.name),
      npi: str(p.npi),
      organization: str(p.organization),
    })
  );
  out.push({
    op: 'UpsertEdge',
    type: HAS_CARE_TEAM,
    from: { kind: MEMBER_KIND, key: event.memberId },
    to: { kind: CARE_TEAM_MEMBER_KIND, key: providerRef },
    properties: { role: str(p.role, 'care-manager') },
    validity: { start, end: unassigned ? start : null },
    semantics: associative,
  });
  return out;
}
