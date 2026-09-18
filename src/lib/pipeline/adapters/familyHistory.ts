// CONTRACT: C9  // CONTRACT: C10
/**
 * Family-history FHIR-JSON adapter (arrival mode: batch). Parses a synthetic FHIR
 * `FamilyMemberHistory` feed into normalized records at tier **T1**. Each record
 * captures a RELATIONSHIP (mother, father, sibling — a v3 RoleCode) and the coded
 * `condition`s attributed to that relative (SNOMED-CT or ICD-10-CM codings).
 *
 * The subject is the MEMBER whose chart carries the history; the relative is never
 * a member and is never anchored — a family member is described only by the
 * relationship role and the condition codings, never by name or their own id
 * (PHI-minimal, plan §1.2). The member reference is anchored through the injected
 * identity seam and never used as the graph key.
 *
 * The graph mapping hangs one FamilyMemberHistory node off the member via a dated
 * associative edge; the condition codings and relationship role ride as node
 * properties (the history is a factual attachment to the member's chart, not an
 * asserted causal claim about the member's own conditions).
 *
 * C9.2 yield: family-history feed -> family-history T1 (relationship + coded conditions).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One tagged FHIR FamilyMemberHistory pulled from the bundle. */
interface FamilyMemberHistoryResource {
  resource: Record<string, unknown>;
}

/** A coding triple carried on a family condition (system URI + code + display). */
interface Coding {
  system: string;
  code: string;
  display: string;
}

/** Normalized FamilyMemberHistory payload (the node's projection seed). Codes only. */
export interface FamilyHistoryPayload {
  familyMemberHistoryRef: string;
  /** The relative's relationship role code (e.g. v3-RoleCode MTH/FTH/SIS/BRO). */
  relationship: string;
  /** The coded conditions attributed to the relative (SNOMED-CT / ICD-10-CM). */
  conditions: Coding[];
  status: string;
  recordedDate: string;
  /** Carried onto the graph edge/node as the source (PHI-safe). */
  provenance: string;
}

const SOURCE = { system: 'ehr-family-history', feed: 'family-history-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** patient.reference "Patient/FH-MEM-01" -> the source member id component. */
function patientSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.patient).reference).split('/').pop() ?? '';
}
/** relationship.coding[0].code — the relative's role code. */
function relationshipCode(resource: Record<string, unknown>): string {
  const coding = obj(resource.relationship).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return str(first.code);
}
/** condition[].code.coding[0] -> the coded conditions attributed to the relative. */
function conditionCodings(resource: Record<string, unknown>): Coding[] {
  const conditions = resource.condition;
  if (!Array.isArray(conditions)) return [];
  const out: Coding[] = [];
  for (const c of conditions) {
    const coding = obj(obj(c).code).coding;
    const first = Array.isArray(coding) ? obj(coding[0]) : {};
    const code = str(first.code);
    if (code) out.push({ system: str(first.system), code, display: str(first.display) });
  }
  return out;
}

function parse(payload: string): RawRecord<FamilyMemberHistoryResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<FamilyMemberHistoryResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'FamilyMemberHistory') continue;
    const id = str(resource.id) || `fmh-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<FamilyMemberHistoryResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!patientSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'patient.reference' });
  if (!relationshipCode(resource))
    issues.push({ reasonCode: 'missing-relationship', fieldPath: 'relationship.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(
  raw: RawRecord<FamilyMemberHistoryResource>,
  deps: PipelineDeps
): NormalizedRecord {
  const resource = raw.data.resource;
  const fmhId = str(resource.id);
  const memberId = deps.resolveIdentity(patientSourceId(resource), { feed: SOURCE.feed });
  const familyMemberHistoryRef = `FamilyMemberHistory/${fmhId}`;
  const recordedDate = str(resource.date);

  const payload: FamilyHistoryPayload = {
    familyMemberHistoryRef,
    relationship: relationshipCode(resource),
    conditions: conditionCodings(resource),
    status: str(resource.status, 'completed'),
    recordedDate,
    provenance: 'family-reported',
  };

  return {
    domain: 'family-history',
    memberId,
    resourceType: 'FamilyMemberHistory',
    fhirResourceId: familyMemberHistoryRef,
    eventType: 'family-history.recorded',
    tier: 'T1',
    idempotencyKey: `family-history:${fmhId}`,
    provenance: 'family-reported',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: recordedDate ? `${recordedDate}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The family-history FHIR-JSON batch adapter (FamilyMemberHistory, T1). */
export const familyHistoryAdapter: DomainAdapter<FamilyMemberHistoryResource> = {
  source: SOURCE,
  domain: 'family-history',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
