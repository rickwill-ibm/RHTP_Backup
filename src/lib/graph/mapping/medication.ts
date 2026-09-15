// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Medication mapping spec: prescribed + dispensed events -> the member's
 * medications subgraph. The richest of the clinical-core specs — TWO node types
 * and a causal link between them:
 *
 *   (Member)-[:PRESCRIBED_FOR {valid from authoredOn}]->(Medication)         associative
 *   (MedicationDispense)-[:DISPENSED_UNDER {causal, asserter, basis}]->(Medication)  causal
 *
 * PRESCRIBED_FOR is the factual order link (associative, dated from the prescribe
 * date), so an asOf query can ask "what was prescribed as of date X" and the
 * whole-person lens surfaces the Medication off the member. DISPENSED_UNDER is an
 * ASSERTED attribution — the pharmacy asserts this fill satisfied that prescription
 * — so it is a CAUSAL edge and MUST carry provenance: `asserter` = the dispensing
 * source, `basis` = the RxNorm code + prescription ref (PHI-safe). This is the
 * DP-1 rule that a graph's causal assertions are always attributable.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, causal, memberNode, resourceNode } from './spec';
import { providerRefMutations } from './providerRef';

/** Pinned medications namespace — the single source of truth the integrity test pins. */
export const MEDICATION_DOMAIN = 'medications';
export const MEDICATION_KIND = 'Medication';
export const MEDICATION_DISPENSE_KIND = 'MedicationDispense';
export const PRESCRIBED_FOR = 'PRESCRIBED_FOR';
export const DISPENSED_UNDER = 'DISPENSED_UNDER';
/** F5-b: the resolved (or raw+deferred) prescriber on a Medication. */
export const PRESCRIBED_BY = 'PRESCRIBED_BY';
/** F5-b: the resolved (or raw+deferred) dispensing performer on a MedicationDispense. */
export const DISPENSED_BY = 'DISPENSED_BY';
/** Re-exported so a namespace-integrity test can pin the resolved provider node kind. */
export { PROVIDER_IDENTITY_KIND } from './providerRef';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function rxCode(p: Record<string, unknown>): string {
  const rx = (p.rxNorm ?? {}) as Record<string, unknown>;
  return str(rx.code);
}

export const medicationSpec = {
  domain: MEDICATION_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('medication.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    return event.eventType === 'medication.dispensed'
      ? dispensed(event, deps)
      : prescribed(event, deps);
  },
};

/** medication.prescribed -> Member + Medication + dated associative PRESCRIBED_FOR. */
function prescribed(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const medicationRef = str(p.medicationRef, `Medication/${event.memberId}`);
  const start = str(p.authoredOn) || event.occurredAt || new Date(deps.now()).toISOString();
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, MEDICATION_KIND, medicationRef, {
      rxNorm: rxCode(p),
      status: str(p.status, 'active'),
      authoredOn: str(p.authoredOn),
    })
  );
  out.push({
    op: 'UpsertEdge',
    type: PRESCRIBED_FOR,
    from: { kind: MEMBER_KIND, key: event.memberId },
    to: { kind: MEDICATION_KIND, key: medicationRef },
    properties: { rxNorm: rxCode(p) },
    validity: { start, end: null },
    semantics: associative,
  });
  // F5-b: resolve the prescriber. A valid NPI anchors a ProviderIdentity node
  // (PRESCRIBED_BY -> resolved); no valid NPI keeps the raw ref flagged deferred-I8A.
  out.push(
    ...providerRefMutations(
      event,
      { kind: MEDICATION_KIND, key: medicationRef },
      PRESCRIBED_BY,
      {
        rawRef: str(p.prescriberRef),
        npi: str(p.prescriberNpi) || undefined,
        name: str(p.prescriberName) || undefined,
      },
      start
    )
  );
  return out;
}

/** medication.dispensed -> MedicationDispense + CAUSAL DISPENSED_UNDER (attributed). */
function dispensed(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const dispenseRef = str(p.dispenseRef, `MedicationDispense/${event.memberId}`);
  const prescriptionRef = str(p.prescriptionRef, `Medication/${event.memberId}`);
  const start = str(p.whenHandedOver) || event.occurredAt || new Date(deps.now()).toISOString();
  const asserter = str(p.provenance, event.source.system);
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, MEDICATION_DISPENSE_KIND, dispenseRef, {
      rxNorm: rxCode(p),
      status: str(p.status, 'completed'),
      whenHandedOver: str(p.whenHandedOver),
    })
  );
  // The fill is dispensed UNDER the prescription. Causal (asserted attribution),
  // so it carries provenance: who dispensed it + the RxNorm code @ prescription ref.
  out.push({
    op: 'UpsertEdge',
    type: DISPENSED_UNDER,
    from: { kind: MEDICATION_DISPENSE_KIND, key: dispenseRef },
    to: { kind: MEDICATION_KIND, key: prescriptionRef },
    properties: { rxNorm: rxCode(p) },
    validity: { start, end: null },
    semantics: causal(asserter, `${rxCode(p) || 'no-rxnorm'}@${prescriptionRef}`),
  });
  // F5-b: resolve the dispensing performer (pharmacy / pharmacist). Valid NPI ->
  // ProviderIdentity (DISPENSED_BY -> resolved); else raw ref flagged deferred-I8A.
  out.push(
    ...providerRefMutations(
      event,
      { kind: MEDICATION_DISPENSE_KIND, key: dispenseRef },
      DISPENSED_BY,
      {
        rawRef: str(p.performerRef),
        npi: str(p.performerNpi) || undefined,
        organization: str(p.performerOrganization) || undefined,
      },
      start
    )
  );
  return out;
}
