// CONTRACT: C9  // CONTRACT: C10
/**
 * Referrals FHIR-JSON adapter (arrival mode: batch). Parses a synthetic
 * SNOMED/CPT-coded FHIR ServiceRequest feed into normalized records at tier T1.
 * A referral is a factual order the referring provider placed for the member (an
 * intent to obtain a service), so the graph mapping turns it into a dated
 * associative REFERRED_VIA edge, mirroring the medications PRESCRIBED_FOR order
 * link. When the ServiceRequest names a performer organization or practitioner,
 * that reference is captured as a RAW REF only — the adapter never invents provider
 * identity. Real NPI/NPPES resolution of the performer is deferred to I8A; here the
 * performer travels as an opaque reference string the mapping links associatively.
 * Generic over records: no member is hardcoded; the subject reference is anchored
 * through the injected identity seam, never used as the graph key (plan §1.2).
 *
 * C9.2 yield: referrals feed -> referrals T1 (referring-provider order).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

/** One tagged FHIR ServiceRequest pulled from the bundle. */
interface ServiceRequestResource {
  resource: Record<string, unknown>;
}

/** Normalized referral payload (the ServiceRequest node's projection seed). */
export interface ReferralPayload {
  referralRef: string;
  /** The requested service coding (SNOMED/CPT); code may be ''. */
  serviceCode: { system: string; code: string; display: string };
  status: string;
  intent: string;
  authoredOn: string;
  /**
   * Raw performer reference ("Organization/org-1" | "Practitioner/prac-9"), or ''
   * when the referral names no performer. An OPAQUE ref; the graph mapping resolves
   * it to a ProviderIdentity when an NPI is present (F5), else keeps it raw.
   */
  performerRef: string;
  /**
   * The performer's NPI when the source supplies one (a us-npi Identifier on the
   * performer, or a bare NPI in the reference), else ''. The adapter surfaces it
   * unvalidated; the graph mapping validates it (NPPES Luhn) before anchoring — an
   * invalid NPI never resolves. The adapter never invents an NPI.
   */
  performerNpi: string;
  /** Carried onto the referral node/edge as the referring source (PHI-safe). */
  provenance: string;
}

const SOURCE = { system: 'referral-hub', feed: 'referrals-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** code.coding[0] as a SNOMED/CPT coding triple (code may be ''). */
function serviceCode(resource: Record<string, unknown>): { system: string; code: string; display: string } {
  const coding = obj(resource.code).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return {
    system: str(first.system, 'http://snomed.info/sct'),
    code: str(first.code),
    display: str(first.display),
  };
}
/** subject.reference "Patient/REF-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** performer[0].reference "Organization/org-1" (the whole raw ref, or ''). */
function performerRefOf(resource: Record<string, unknown>): string {
  const performer = resource.performer;
  const first = Array.isArray(performer) ? obj(performer[0]) : {};
  return str(first.reference);
}
/**
 * The performer's NPI when the source carries one: a us-npi Identifier on
 * performer[0] ({ system: ".../us-npi", value }), else ''. Surfaced raw (10-digit
 * shape only); the graph mapping validates the check digit before anchoring.
 */
function performerNpiOf(resource: Record<string, unknown>): string {
  const performer = resource.performer;
  const first = Array.isArray(performer) ? obj(performer[0]) : {};
  const identifier = obj(first.identifier);
  const system = str(identifier.system).toLowerCase();
  const value = str(identifier.value);
  if (system.includes('npi') && /^\d{10}$/.test(value)) return value;
  return '';
}

function parse(payload: string): RawRecord<ServiceRequestResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<ServiceRequestResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'ServiceRequest') continue;
    const id = str(resource.id) || `sr-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<ServiceRequestResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource)) issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (!serviceCode(resource).code) issues.push({ reasonCode: 'missing-service-code', fieldPath: 'code.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<ServiceRequestResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const srId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const referralRef = `ServiceRequest/${srId}`;
  const authoredOn = str(resource.authoredOn);
  const payload: ReferralPayload = {
    referralRef,
    serviceCode: serviceCode(resource),
    status: str(resource.status, 'active'),
    intent: str(resource.intent, 'order'),
    authoredOn,
    performerRef: performerRefOf(resource),
    performerNpi: performerNpiOf(resource),
    provenance: 'referring-provider',
  };
  return {
    domain: 'referrals',
    memberId,
    resourceType: 'ServiceRequest',
    fhirResourceId: referralRef,
    eventType: 'referral.requested',
    tier: 'T1',
    idempotencyKey: `referral:${srId}`,
    provenance: 'referring-provider',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: authoredOn ? `${authoredOn}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The referrals FHIR-JSON batch adapter (SNOMED/CPT-coded ServiceRequest). */
export const referralAdapter: DomainAdapter<ServiceRequestResource> = {
  source: SOURCE,
  domain: 'referrals',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
