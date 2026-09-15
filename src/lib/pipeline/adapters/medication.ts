// CONTRACT: C9  // CONTRACT: C10
/**
 * Medications FHIR-JSON adapter (arrival mode: batch). The RICHEST of the four
 * clinical-core domains: ONE feed carries TWO related resource kinds — the
 * prescribed order (MedicationRequest) and the pharmacy fill (MedicationDispense)
 * — so it stress-tests the domain template's two-node-type / causal-link shape.
 *
 * Parses a synthetic RxNorm-coded FHIR bundle into normalized records at tier T1:
 *   MedicationRequest  -> Medication (prescribed), provenance = prescriber-authoritative
 *   MedicationDispense -> MedicationDispense (dispensed), provenance = pharmacy-dispense
 * Generic over records: no member is hardcoded; the subject reference is anchored
 * through the injected identity seam, never used as the graph key (plan §1.2).
 *
 * C9.2 yield: medications feed -> medications T1 (prescribed + dispensed).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One tagged FHIR resource pulled from the bundle (request or dispense lane). */
interface RxResource {
  kind: 'request' | 'dispense';
  resource: Record<string, unknown>;
}

/** Normalized prescribed-medication payload (the Medication node's projection seed). */
export interface MedicationPayload {
  medicationRef: string;
  rxNorm: { system: string; code: string; display: string };
  status: string;
  authoredOn: string;
  daysSupply: number;
  quantity: number;
}

/** Normalized dispensed-medication payload (the MedicationDispense node's seed). */
export interface MedicationDispensePayload {
  dispenseRef: string;
  /** The Medication (MedicationRequest) node this fill was dispensed under. */
  prescriptionRef: string;
  rxNorm: { system: string; code: string; display: string };
  status: string;
  whenHandedOver: string;
  daysSupply: number;
  quantity: number;
  /** Carried into the DISPENSED_UNDER causal edge as the asserter (DP-1). */
  provenance: string;
}

const SOURCE = { system: 'rx-hub', feed: 'medications-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

/** medicationCodeableConcept.coding[0] as an RxNorm coding triple (code may be ''). */
function rxNorm(resource: Record<string, unknown>): {
  system: string;
  code: string;
  display: string;
} {
  const coding = obj(resource.medicationCodeableConcept).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return {
    system: str(first.system, 'http://www.nlm.nih.gov/research/umls/rxnorm'),
    code: str(first.code),
    display: str(first.display),
  };
}
/** subject.reference "Patient/RX-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** The Medication (prescription) node key, stable from the MedicationRequest id. */
function medicationRefFrom(requestId: string): string {
  return `Medication/${requestId}`;
}

function parse(payload: string): RawRecord<RxResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<RxResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    const type = str(resource.resourceType);
    const id = str(resource.id) || `rx-${out.length + 1}`;
    if (type === 'MedicationRequest')
      out.push({ sourceRef: id, data: { kind: 'request', resource } });
    else if (type === 'MedicationDispense')
      out.push({ sourceRef: id, data: { kind: 'dispense', resource } });
  }
  return out;
}

function validate(raw: RawRecord<RxResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { kind, resource } = raw.data;
  if (!subjectSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (!rxNorm(resource).code)
    issues.push({
      reasonCode: 'missing-medication-code',
      fieldPath: 'medicationCodeableConcept.coding',
    });
  if (kind === 'dispense') {
    const auth = resource.authorizingPrescription;
    const ref = Array.isArray(auth) ? str(obj(auth[0]).reference) : '';
    if (!ref)
      issues.push({
        reasonCode: 'missing-authorizing-prescription',
        fieldPath: 'authorizingPrescription',
      });
  }
  return { ok: issues.length === 0, issues };
}

function normalizeRequest(resource: Record<string, unknown>, deps: PipelineDeps): NormalizedRecord {
  const requestId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const medicationRef = medicationRefFrom(requestId);
  const authoredOn = str(resource.authoredOn);
  const dispenseReq = obj(resource.dispenseRequest);
  const payload: MedicationPayload = {
    medicationRef,
    rxNorm: rxNorm(resource),
    status: str(resource.status, 'active'),
    authoredOn,
    daysSupply: num(obj(dispenseReq.expectedSupplyDuration).value),
    quantity: num(obj(dispenseReq.quantity).value),
  };
  return {
    domain: 'medications',
    memberId,
    resourceType: 'Medication',
    fhirResourceId: medicationRef,
    eventType: 'medication.prescribed',
    tier: 'T1',
    idempotencyKey: `rx:med:${requestId}`,
    provenance: 'prescriber-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: authoredOn ? `${authoredOn}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

function normalizeDispense(
  resource: Record<string, unknown>,
  deps: PipelineDeps
): NormalizedRecord {
  const dispenseId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const dispenseRef = `MedicationDispense/${dispenseId}`;
  const auth = resource.authorizingPrescription;
  const authRef = Array.isArray(auth) ? str(obj(auth[0]).reference) : '';
  const prescriptionRef = medicationRefFrom(authRef.split('/').pop() ?? '');
  const whenHandedOver = str(resource.whenHandedOver);
  const payload: MedicationDispensePayload = {
    dispenseRef,
    prescriptionRef,
    rxNorm: rxNorm(resource),
    status: str(resource.status, 'completed'),
    whenHandedOver,
    daysSupply: num(obj(resource.daysSupply).value),
    quantity: num(obj(resource.quantity).value),
    provenance: 'pharmacy-dispense',
  };
  return {
    domain: 'medications',
    memberId,
    resourceType: 'MedicationDispense',
    fhirResourceId: dispenseRef,
    eventType: 'medication.dispensed',
    tier: 'T1',
    idempotencyKey: `rx:disp:${dispenseId}`,
    provenance: 'pharmacy-dispense',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: whenHandedOver ? `${whenHandedOver}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

function normalize(raw: RawRecord<RxResource>, deps: PipelineDeps): NormalizedRecord {
  return raw.data.kind === 'request'
    ? normalizeRequest(raw.data.resource, deps)
    : normalizeDispense(raw.data.resource, deps);
}

/** The medications FHIR-JSON batch adapter (prescribed + dispensed). */
export const medicationAdapter: DomainAdapter<RxResource> = {
  source: SOURCE,
  domain: 'medications',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
