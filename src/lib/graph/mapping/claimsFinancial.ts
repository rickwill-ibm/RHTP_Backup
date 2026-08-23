// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Claims-financial mapping spec: the three financial resource events -> the
 * member's golden-thread FINANCIAL CHAIN subgraph. THREE node types linked head to
 * tail:
 *
 *   (Member)-[:HAS_CLAIM {valid from created}]->(Claim)                       associative
 *   (Claim)-[:ADJUDICATED_BY {causal, asserter, basis}]->(ClaimResponse)      causal
 *   (ClaimResponse)-[:EXPLAINED_BY {valid from created}]->(ExplanationOfBenefit) associative
 *
 * HAS_CLAIM is the factual submission link (associative, dated from the claim
 * created date). ADJUDICATED_BY is an ASSERTED attribution — the payer asserts this
 * response adjudicates that claim — so it is CAUSAL and MUST carry provenance:
 * `asserter` = the adjudicating payer, `basis` = the outcome @ the claim ref
 * (PHI-safe). EXPLAINED_BY is the factual derivation link from the adjudication to
 * its member-facing explanation (associative, dated).
 *
 * On a DENIAL the ClaimResponse node carries the captured CARC (claim-adjustment-
 * reason) and RARC (remittance-advice-remark) codes as PHI-safe code lists, so the
 * denial reason is queryable off the graph without re-reading the source.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, causal, memberNode, resourceNode } from './spec';
import { providerRefMutations } from './providerRef';
import { deriveMemberLiability, normalizeGroups } from './carcGroup';

/** Pinned claims-financial namespace — the single source of truth the integrity test pins. */
export const CLAIMS_FINANCIAL_DOMAIN = 'claims-financial';
export const CLAIM_KIND = 'Claim';
export const CLAIM_RESPONSE_KIND = 'ClaimResponse';
export const EOB_KIND = 'ExplanationOfBenefit';
export const HAS_CLAIM = 'HAS_CLAIM';
export const ADJUDICATED_BY = 'ADJUDICATED_BY';
export const EXPLAINED_BY = 'EXPLAINED_BY';
/** F5-b: the resolved (or raw+deferred) billing/rendering provider on a Claim. */
export const SUBMITTED_BY = 'SUBMITTED_BY';
/** Re-exported so a namespace-integrity test can pin the resolved provider node kind. */
export { PROVIDER_IDENTITY_KIND } from './providerRef';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}
function codes(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export const claimsFinancialSpec = {
  domain: CLAIMS_FINANCIAL_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('claim.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    if (event.eventType === 'claim.adjudicated') return adjudicated(event, deps);
    if (event.eventType === 'claim.explained') return explained(event, deps);
    return submitted(event, deps);
  },
};

/** claim.submitted -> Member + Claim + dated associative HAS_CLAIM. */
function submitted(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const claimRef = str(p.claimRef, `Claim/${event.memberId}`);
  const start = str(p.billablePeriodStart) || str(p.created) || event.occurredAt || new Date(deps.now()).toISOString();
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, CLAIM_KIND, claimRef, {
      claimType: str(p.claimType),
      use: str(p.use, 'claim'),
      status: str(p.status, 'active'),
      total: num(p.total),
      created: str(p.created),
      provenance: str(p.provenance),
    }),
  );
  out.push({
    op: 'UpsertEdge', type: HAS_CLAIM,
    from: { kind: MEMBER_KIND, key: event.memberId },
    to: { kind: CLAIM_KIND, key: claimRef },
    properties: { claimType: str(p.claimType) },
    validity: { start, end: null },
    semantics: associative,
  });
  // F5-b: resolve the billing/rendering provider named on the claim. A valid NPI
  // anchors a ProviderIdentity node (SUBMITTED_BY -> resolved); no valid NPI keeps
  // the raw ref flagged deferred-I8A. E9: never invents an NPI.
  out.push(
    ...providerRefMutations(
      event,
      { kind: CLAIM_KIND, key: claimRef },
      SUBMITTED_BY,
      {
        rawRef: str(p.providerRef),
        npi: str(p.providerNpi) || undefined,
        name: str(p.providerName) || undefined,
        organization: str(p.providerOrganization) || undefined,
      },
      start,
    ),
  );
  return out;
}

/**
 * claim.adjudicated -> ClaimResponse (carrying CARC/RARC on a denial) + CAUSAL
 * ADJUDICATED_BY (attributed to the payer). The Claim endpoint is created by the
 * claim.submitted event; the edge references it by key.
 */
function adjudicated(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const responseRef = str(p.responseRef, `ClaimResponse/${event.memberId}`);
  const claimRef = str(p.claimRef, `Claim/${event.memberId}`);
  const outcome = str(p.outcome, 'complete');
  const carc = codes(p.carcCodes);
  const rarc = codes(p.rarcCodes);
  // F5: capture the X12 CARC GROUP (CO/PR/OA/PI) so member liability is derivable.
  // E9: with no group present, memberLiability is 'indeterminate', never defaulted.
  const carcGroups = normalizeGroups(p.carcGroups);
  const memberLiability = deriveMemberLiability(carcGroups);
  const start = str(p.created) || event.occurredAt || new Date(deps.now()).toISOString();
  const asserter = str(p.provenance, event.source.system);
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, CLAIM_RESPONSE_KIND, responseRef, {
      outcome,
      disposition: str(p.disposition),
      paymentAmount: num(p.paymentAmount),
      carcCodes: carc,
      rarcCodes: rarc,
      carcGroups,
      memberLiability,
      created: str(p.created),
    }),
  );
  out.push({
    op: 'UpsertEdge', type: ADJUDICATED_BY,
    from: { kind: CLAIM_KIND, key: claimRef },
    to: { kind: CLAIM_RESPONSE_KIND, key: responseRef },
    properties: { outcome, carcCodes: carc, rarcCodes: rarc, carcGroups, memberLiability },
    validity: { start, end: null },
    semantics: causal(asserter, `${outcome}@${claimRef}`),
  });
  return out;
}

/** claim.explained -> ExplanationOfBenefit + dated associative EXPLAINED_BY. */
function explained(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const eobRef = str(p.eobRef, `ExplanationOfBenefit/${event.memberId}`);
  const responseRef = str(p.responseRef, `ClaimResponse/${event.memberId}`);
  const start = str(p.created) || event.occurredAt || new Date(deps.now()).toISOString();
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, EOB_KIND, eobRef, {
      outcome: str(p.outcome, 'complete'),
      paymentAmount: num(p.paymentAmount),
      claimRef: str(p.claimRef),
      created: str(p.created),
    }),
  );
  out.push({
    op: 'UpsertEdge', type: EXPLAINED_BY,
    from: { kind: CLAIM_RESPONSE_KIND, key: responseRef },
    to: { kind: EOB_KIND, key: eobRef },
    properties: { outcome: str(p.outcome, 'complete') },
    validity: { start, end: null },
    semantics: associative,
  });
  return out;
}
