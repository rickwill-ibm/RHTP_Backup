// CONTRACT: C9  // CONTRACT: C10
/**
 * Caregiver-household FHIR-JSON adapter (arrival mode: batch). Parses a synthetic
 * FHIR RelatedPerson feed into normalized caregiver/household records at tier T1. A
 * RelatedPerson is a person in the member's support system — a caregiver, spouse,
 * guardian, or household contact — carried with the coded RELATIONSHIP ROLE (the
 * HL7 v3 RoleCode / v2 relationship code) but NOT the related person's own PHI
 * narrative. The graph mapping turns each into a dated associative RELATED_TO edge
 * from the member to the RelatedPerson, with the relationship role on the edge.
 *
 * Generic over records: no member is hardcoded; the patient reference is anchored
 * through the injected identity seam, never used as the graph key (plan §1.2). The
 * related person's own name is never normalized onto the record (PHI-minimal): only
 * the relationship role code + a stable resource ref travel downstream.
 *
 * C9.2 yield: caregiver-household feed -> caregiver-household T1 (relationship role).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

/** One tagged FHIR RelatedPerson pulled from the bundle. */
interface RelatedPersonResource {
  resource: Record<string, unknown>;
}

/** Normalized caregiver/household payload (the RelatedPerson node's projection seed). */
export interface CaregiverPayload {
  relatedPersonRef: string;
  /** Coded relationship role (e.g. SNOMED/RoleCode); code may be ''. */
  relationship: { system: string; code: string; display: string };
  /** True when this related person is flagged as an active caregiver contact. */
  active: boolean;
  /** Period start the relationship is recorded from; may be ''. */
  periodStart: string;
  /** Carried onto the RelatedPerson node/edge as the attesting source (PHI-safe). */
  provenance: string;
}

const SOURCE = { system: 'household-hub', feed: 'caregiver-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function bool(v: unknown, fallback = true): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** patient.reference "Patient/CG-MEM-01" -> the source member id component. */
function patientSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.patient).reference).split('/').pop() ?? '';
}
/** relationship[0].coding[0] as a role coding triple (code may be ''). */
function relationship(resource: Record<string, unknown>): { system: string; code: string; display: string } {
  const rel = Array.isArray(resource.relationship) ? obj(resource.relationship[0]) : obj(resource.relationship);
  const coding = Array.isArray(rel.coding) ? obj(rel.coding[0]) : {};
  return {
    system: str(coding.system, 'http://terminology.hl7.org/CodeSystem/v3-RoleCode'),
    code: str(coding.code),
    display: str(coding.display),
  };
}
/** period.start as the relationship start date; may be ''. */
function periodStart(resource: Record<string, unknown>): string {
  return str(obj(resource.period).start);
}

function parse(payload: string): RawRecord<RelatedPersonResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<RelatedPersonResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'RelatedPerson') continue;
    const id = str(resource.id) || `rp-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<RelatedPersonResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!patientSourceId(resource)) issues.push({ reasonCode: 'missing-patient', fieldPath: 'patient.reference' });
  if (!relationship(resource).code) issues.push({ reasonCode: 'missing-relationship', fieldPath: 'relationship.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<RelatedPersonResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const rpId = str(resource.id);
  const memberId = deps.resolveIdentity(patientSourceId(resource), { feed: SOURCE.feed });
  const relatedPersonRef = `RelatedPerson/${rpId}`;
  const start = periodStart(resource);
  const payload: CaregiverPayload = {
    relatedPersonRef,
    relationship: relationship(resource),
    active: bool(resource.active),
    periodStart: start,
    provenance: 'household-registry',
  };
  return {
    domain: 'caregiver-household',
    memberId,
    resourceType: 'RelatedPerson',
    fhirResourceId: relatedPersonRef,
    eventType: 'caregiver.related',
    tier: 'T1',
    idempotencyKey: `caregiver:${rpId}`,
    provenance: 'household-registry',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: start ? `${start}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The caregiver-household FHIR-JSON batch adapter (RelatedPerson). */
export const caregiverAdapter: DomainAdapter<RelatedPersonResource> = {
  source: SOURCE,
  domain: 'caregiver-household',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
