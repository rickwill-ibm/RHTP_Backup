// CONTRACT: C9  // CONTRACT: C10
/**
 * Procedures FHIR-JSON adapter (arrival mode: batch). Parses a synthetic
 * CPT/SNOMED-coded FHIR Procedure feed into normalized records at tier T1. A
 * procedure is an asserted clinical act (a provider asserts this procedure was
 * performed on the member), so the normalized record carries a performer
 * provenance that the graph mapping turns into a causal, attributed PERFORMED_ON
 * edge (DP-1). When the source Procedure references an encounter, the encounter
 * ref is carried on the payload so the mapping can link the Procedure to the
 * already-projected Encounter node. Generic over records: no member is hardcoded;
 * the subject reference is anchored through the injected identity seam, never used
 * as the graph key (plan §1.2).
 *
 * C9.2 yield: procedures feed -> procedures T1 (provider-performed).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One tagged FHIR Procedure pulled from the bundle. */
interface ProcedureResource {
  resource: Record<string, unknown>;
}

/** Normalized procedure payload (the Procedure node's projection seed). */
export interface ProcedurePayload {
  procedureRef: string;
  /** CPT or SNOMED coding triple (code may be ''). */
  code: { system: string; code: string; display: string };
  status: string;
  performedDateTime: string;
  /** The Encounter node this procedure was performed during ('' when standalone). */
  encounterRef: string;
  /** Carried into the PERFORMED_ON causal edge as the asserter (DP-1). */
  provenance: string;
}

const SOURCE = { system: 'ehr-hub', feed: 'procedures-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** code.coding[0] as a CPT/SNOMED coding triple (code may be ''). */
function procedureCode(resource: Record<string, unknown>): {
  system: string;
  code: string;
  display: string;
} {
  const coding = obj(resource.code).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return {
    system: str(first.system, 'http://www.ama-assn.org/go/cpt'),
    code: str(first.code),
    display: str(first.display),
  };
}
/** performedDateTime, or performedPeriod.start, as the procedure date. */
function performedOn(resource: Record<string, unknown>): string {
  const direct = str(resource.performedDateTime);
  if (direct) return direct;
  return str(obj(resource.performedPeriod).start);
}
/** subject.reference "Patient/PROC-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** encounter.reference "Encounter/enc-1" (the whole ref, kept as the node key). */
function encounterRefOf(resource: Record<string, unknown>): string {
  return str(obj(resource.encounter).reference);
}

function parse(payload: string): RawRecord<ProcedureResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<ProcedureResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Procedure') continue;
    const id = str(resource.id) || `proc-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<ProcedureResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (!procedureCode(resource).code)
    issues.push({ reasonCode: 'missing-procedure-code', fieldPath: 'code.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<ProcedureResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const procId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const procedureRef = `Procedure/${procId}`;
  const performedDateTime = performedOn(resource);
  const payload: ProcedurePayload = {
    procedureRef,
    code: procedureCode(resource),
    status: str(resource.status, 'completed'),
    performedDateTime,
    encounterRef: encounterRefOf(resource),
    provenance: 'provider-performed',
  };
  return {
    domain: 'procedures',
    memberId,
    resourceType: 'Procedure',
    fhirResourceId: procedureRef,
    eventType: 'procedure.performed',
    tier: 'T1',
    idempotencyKey: `procedure:${procId}`,
    provenance: 'provider-performed',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: performedDateTime
      ? `${performedDateTime}T00:00:00Z`
      : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The procedures FHIR-JSON batch adapter (CPT/SNOMED-coded Procedure). */
export const procedureAdapter: DomainAdapter<ProcedureResource> = {
  source: SOURCE,
  domain: 'procedures',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
