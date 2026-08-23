// CONTRACT: C9  // CONTRACT: C10
/**
 * Allergies FHIR-JSON adapter (arrival mode: batch). Parses a synthetic
 * AllergyIntolerance feed into normalized records at tier T1. An allergy is a
 * clinically CAUSAL-relevant assertion (a clinician asserts the member reacts to
 * an allergen), so the normalized record carries an asserter provenance that the
 * graph mapping turns into a causal, attributed edge (DP-1). Generic over records:
 * no member is hardcoded; the patient reference is anchored through the injected
 * identity seam, never used as the graph key (plan §1.2).
 *
 * C9.2 yield: allergies feed -> allergies T1 (clinician-asserted).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

/** One tagged FHIR AllergyIntolerance pulled from the bundle. */
interface AllergyResource {
  resource: Record<string, unknown>;
}

/** Normalized allergy payload (the AllergyIntolerance node's projection seed). */
export interface AllergyPayload {
  allergyRef: string;
  code: { system: string; code: string; display: string };
  clinicalStatus: string;
  verificationStatus: string;
  criticality: string;
  category: string;
  recordedDate: string;
  /** Carried into the ALLERGIC_TO causal edge as the asserter (DP-1). */
  provenance: string;
}

const SOURCE = { system: 'ehr-hub', feed: 'allergies-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** code.coding[0] as an allergen coding triple (code may be ''). */
function allergenCode(resource: Record<string, unknown>): { system: string; code: string; display: string } {
  const coding = obj(resource.code).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return {
    system: str(first.system, 'http://snomed.info/sct'),
    code: str(first.code),
    display: str(first.display),
  };
}
/** clinicalStatus/verificationStatus codeable-concept -> the code string. */
function statusCode(resource: Record<string, unknown>, field: string): string {
  const coding = obj(resource[field]).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return str(first.code);
}
/** category[0] (a plain code array on AllergyIntolerance). */
function categoryOf(resource: Record<string, unknown>): string {
  const cat = resource.category;
  return Array.isArray(cat) ? str(cat[0], 'medication') : 'medication';
}
/** patient.reference "Patient/ALG-MEM-01" -> the source member id component. */
function patientSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.patient).reference).split('/').pop() ?? '';
}

function parse(payload: string): RawRecord<AllergyResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<AllergyResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'AllergyIntolerance') continue;
    const id = str(resource.id) || `al-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<AllergyResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!patientSourceId(resource)) issues.push({ reasonCode: 'missing-patient', fieldPath: 'patient.reference' });
  if (!allergenCode(resource).code) issues.push({ reasonCode: 'missing-allergen-code', fieldPath: 'code.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<AllergyResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const allergyId = str(resource.id);
  const memberId = deps.resolveIdentity(patientSourceId(resource), { feed: SOURCE.feed });
  const allergyRef = `AllergyIntolerance/${allergyId}`;
  const recordedDate = str(resource.recordedDate);
  const payload: AllergyPayload = {
    allergyRef,
    code: allergenCode(resource),
    clinicalStatus: statusCode(resource, 'clinicalStatus') || 'active',
    verificationStatus: statusCode(resource, 'verificationStatus') || 'confirmed',
    criticality: str(resource.criticality, 'low'),
    category: categoryOf(resource),
    recordedDate,
    provenance: 'clinician-asserted',
  };
  return {
    domain: 'allergies',
    memberId,
    resourceType: 'AllergyIntolerance',
    fhirResourceId: allergyRef,
    eventType: 'allergy.recorded',
    tier: 'T1',
    idempotencyKey: `allergy:${allergyId}`,
    provenance: 'clinician-asserted',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: recordedDate ? `${recordedDate}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The allergies FHIR-JSON batch adapter (AllergyIntolerance). */
export const allergyAdapter: DomainAdapter<AllergyResource> = {
  source: SOURCE,
  domain: 'allergies',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
