// CONTRACT: C9  // CONTRACT: C10
/**
 * Immunizations FHIR-JSON adapter (arrival mode: batch). Parses a synthetic
 * CVX-coded FHIR Immunization feed into normalized records at tier T1. An
 * immunization is a factual administration record (a vaccine was given on a date),
 * so the graph mapping turns it into a dated associative IMMUNIZED_WITH edge,
 * mirroring the labs-vitals OBSERVED_FOR factual-record link. Generic over records:
 * no member is hardcoded; the patient reference is anchored through the injected
 * identity seam, never used as the graph key (plan §1.2).
 *
 * C9.2 yield: immunizations feed -> immunizations T1 (registry-attested).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

/** One tagged FHIR Immunization pulled from the bundle. */
interface ImmunizationResource {
  resource: Record<string, unknown>;
}

/** Normalized immunization payload (the Immunization node's projection seed). */
export interface ImmunizationPayload {
  immunizationRef: string;
  /** CVX vaccine coding triple (code may be ''). */
  cvx: { system: string; code: string; display: string };
  status: string;
  occurrenceDateTime: string;
  lotNumber: string;
  /** Carried onto the immunization node/edge as the attesting source (PHI-safe). */
  provenance: string;
}

const SOURCE = { system: 'iis-hub', feed: 'immunizations-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** vaccineCode.coding[0] as a CVX coding triple (code may be ''). */
function cvxCode(resource: Record<string, unknown>): { system: string; code: string; display: string } {
  const coding = obj(resource.vaccineCode).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return {
    system: str(first.system, 'http://hl7.org/fhir/sid/cvx'),
    code: str(first.code),
    display: str(first.display),
  };
}
/** patient.reference "Patient/IMM-MEM-01" -> the source member id component. */
function patientSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.patient).reference).split('/').pop() ?? '';
}
/** occurrenceDateTime as the administration date. */
function occurrenceOn(resource: Record<string, unknown>): string {
  return str(resource.occurrenceDateTime);
}

function parse(payload: string): RawRecord<ImmunizationResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<ImmunizationResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Immunization') continue;
    const id = str(resource.id) || `imm-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<ImmunizationResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!patientSourceId(resource)) issues.push({ reasonCode: 'missing-patient', fieldPath: 'patient.reference' });
  if (!cvxCode(resource).code) issues.push({ reasonCode: 'missing-vaccine-code', fieldPath: 'vaccineCode.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<ImmunizationResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const immId = str(resource.id);
  const memberId = deps.resolveIdentity(patientSourceId(resource), { feed: SOURCE.feed });
  const immunizationRef = `Immunization/${immId}`;
  const occurrenceDateTime = occurrenceOn(resource);
  const payload: ImmunizationPayload = {
    immunizationRef,
    cvx: cvxCode(resource),
    status: str(resource.status, 'completed'),
    occurrenceDateTime,
    lotNumber: str(resource.lotNumber),
    provenance: 'immunization-registry',
  };
  return {
    domain: 'immunizations',
    memberId,
    resourceType: 'Immunization',
    fhirResourceId: immunizationRef,
    eventType: 'immunization.administered',
    tier: 'T1',
    idempotencyKey: `immunization:${immId}`,
    provenance: 'immunization-registry',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: occurrenceDateTime ? `${occurrenceDateTime}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The immunizations FHIR-JSON batch adapter (CVX-coded Immunization). */
export const immunizationAdapter: DomainAdapter<ImmunizationResource> = {
  source: SOURCE,
  domain: 'immunizations',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
