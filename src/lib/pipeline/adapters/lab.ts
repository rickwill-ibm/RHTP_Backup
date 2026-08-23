// CONTRACT: C9  // CONTRACT: C10
/**
 * Labs/vitals FHIR-JSON adapter (arrival mode: batch). Parses a synthetic
 * LOINC-coded FHIR Observation feed into normalized records at tier T1. ONE feed
 * carries both laboratory results and vital-sign measurements; the Observation
 * `category` picks the provenance:
 *   category laboratory   -> Observation (recorded), provenance = lab-result-authoritative
 *   category vital-signs  -> Observation (recorded), provenance = clinician-measured
 * Generic over records: no member is hardcoded; the subject reference is anchored
 * through the injected identity seam, never used as the graph key (plan §1.2).
 *
 * C9.2 yield: labs/vitals feed -> labs-vitals T1 (coded Observation).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

/** One tagged FHIR Observation pulled from the bundle. */
interface ObsResource {
  resource: Record<string, unknown>;
}

/** Normalized observation payload (the Observation node's projection seed). */
export interface ObservationPayload {
  observationRef: string;
  loinc: { system: string; code: string; display: string };
  category: string;
  value: { value: number; unit: string } | null;
  status: string;
  effectiveDateTime: string;
  /** Carried onto the Observation node + normalized record for DP-1 attribution. */
  provenance: string;
}

const SOURCE = { system: 'lab-hub', feed: 'labs-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

/** code.coding[0] as a LOINC coding triple (code may be ''). */
function loinc(resource: Record<string, unknown>): { system: string; code: string; display: string } {
  const coding = obj(resource.code).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return {
    system: str(first.system, 'http://loinc.org'),
    code: str(first.code),
    display: str(first.display),
  };
}
/** category[0].coding[0].code, defaulting to laboratory. */
function categoryOf(resource: Record<string, unknown>): string {
  const cat = resource.category;
  const first = Array.isArray(cat) ? obj(cat[0]) : {};
  const coding = Array.isArray(first.coding) ? obj(first.coding[0]) : {};
  return str(coding.code, 'laboratory');
}
/** subject.reference "Patient/LAB-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** vital signs are clinician-measured; lab results are lab-authoritative. */
function provenanceFor(category: string): string {
  return category === 'vital-signs' ? 'clinician-measured' : 'lab-result-authoritative';
}

function parse(payload: string): RawRecord<ObsResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<ObsResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Observation') continue;
    const id = str(resource.id) || `obs-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<ObsResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource)) issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (!loinc(resource).code) issues.push({ reasonCode: 'missing-observation-code', fieldPath: 'code.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<ObsResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const obsId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const observationRef = `Observation/${obsId}`;
  const category = categoryOf(resource);
  const effectiveDateTime = str(resource.effectiveDateTime);
  const vq = obj(resource.valueQuantity);
  const value = 'value' in vq ? { value: num(vq.value), unit: str(vq.unit) } : null;
  const provenance = provenanceFor(category);
  const payload: ObservationPayload = {
    observationRef,
    loinc: loinc(resource),
    category,
    value,
    status: str(resource.status, 'final'),
    effectiveDateTime,
    provenance,
  };
  return {
    domain: 'labs-vitals',
    memberId,
    resourceType: 'Observation',
    fhirResourceId: observationRef,
    eventType: 'observation.recorded',
    tier: 'T1',
    idempotencyKey: `lab:obs:${obsId}`,
    provenance,
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: effectiveDateTime ? `${effectiveDateTime}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The labs/vitals FHIR-JSON batch adapter (LOINC-coded Observation). */
export const labAdapter: DomainAdapter<ObsResource> = {
  source: SOURCE,
  domain: 'labs-vitals',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
