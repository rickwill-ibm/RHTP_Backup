// CONTRACT: C9  // CONTRACT: C10
/**
 * Coverage FHIR-JSON adapter (arrival mode: batch). Parses a FHIR R4 `Coverage`
 * resource feed into normalized records at tier T1, wired to the EXISTING
 * `coverageSpec` (edge HAS_COVERAGE) — no new mapping spec, no new WpcDomain: this
 * adapter simply gives the half-built `coverage` domain its FHIR-JSON front door
 * (the domain was previously reachable only via the X12-834 eligibility adapter).
 *
 * PHI-MINIMAL: the projection carries the plan CODE, coverage STATUS, and the
 * PERIOD only — NEVER the subscriberId / memberId / beneficiary demographics. The
 * beneficiary reference is used ONLY to anchor the member through the injected
 * identity seam (never persisted onto the record, never the graph key, plan §1.2).
 *
 * The payload field names match exactly what `coverageSpec` reads:
 *   coverageRef, periodStart, periodEnd, status, planCode, maintenanceTypeCode.
 * Event type `coverage.recorded`; occurredAt = Coverage.period.start.
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One FHIR Coverage pulled from the bundle. */
interface CoverageResource {
  resource: Record<string, unknown>;
}

/** Normalized coverage payload (the Coverage node's projection seed). PHI-minimal. */
export interface CoverageFhirPayload {
  coverageRef: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  /** The plan/type CODE (e.g. 'MC' Medicaid, 'MR' Medicare) — never a member id. */
  planCode: string;
  maintenanceTypeCode: string;
}

const SOURCE = { system: 'payer-coverage', feed: 'coverage-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
/** The first coding's `code` from a CodeableConcept-shaped field. */
function codingCode(field: unknown): string {
  const coding = obj(field).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return str(first.code);
}
/** beneficiary.reference "Patient/COV-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  const ref = str(obj(resource.beneficiary).reference) || str(obj(resource.subscriber).reference);
  return ref.split('/').pop() ?? '';
}

function parse(payload: string): RawRecord<CoverageResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<CoverageResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Coverage') continue;
    const id = str(resource.id) || `cov-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<CoverageResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  if (!subjectSourceId(raw.data.resource)) {
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'beneficiary.reference' });
  }
  // The node is keyed on resource.id; without it two id-less Coverages would collide
  // onto ONE node (silent loss). Require it so an unkeyable resource QUARANTINES.
  if (!str(raw.data.resource.id)) {
    issues.push({ reasonCode: 'missing-coverage-id', fieldPath: 'id' });
  }
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<CoverageResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const covId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const period = obj(resource.period);
  const periodStart = str(period.start);
  const payload: CoverageFhirPayload = {
    coverageRef: `Coverage/${covId}`,
    periodStart,
    periodEnd: str(period.end),
    status: str(resource.status, 'active'),
    planCode: codingCode(resource.type) || 'UNK',
    maintenanceTypeCode: '',
  };
  return {
    domain: 'coverage',
    memberId,
    resourceType: 'Coverage',
    fhirResourceId: payload.coverageRef,
    eventType: 'coverage.recorded',
    tier: 'T1',
    idempotencyKey: `coverage:${covId}`,
    provenance: 'payer-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: periodStart ? periodStart : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The Coverage FHIR-JSON batch adapter (reuses coverageSpec; PHI-minimal). */
export const coverageFhirAdapter: DomainAdapter<CoverageResource> = {
  source: SOURCE,
  domain: 'coverage',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
