// CONTRACT: C9  // CONTRACT: C10
/**
 * Conditions FHIR-JSON adapter (arrival mode: batch). Parses a synthetic FHIR
 * `Condition` problem-list feed into normalized records at tier **T1**. This is
 * the coded problem-list domain: each Condition carries an ICD-10-CM diagnosis
 * coding and, where the source dual-codes it, a SNOMED-CT coding — both GOVERNED
 * clinical codings that run the stage-4 semantic gate at transform time (conditions
 * is a code-carrying domain), so an unrecognized / retired diagnosis code is
 * quarantined before it is ever admitted, never silently accepted.
 *
 * HCC relevance is carried honestly: when the source attaches a CMS-HCC coding the
 * record marks `hccRelevant: true` and keeps the HCC coding (also gated). A
 * Condition with no HCC coding is `hccRelevant: false` — we do NOT infer risk
 * adjustment from the ICD alone here; the authoritative ICD<->HCC crosswalk is a
 * terminology concern, not an adapter guess.
 *
 * Generic over records: no member is hardcoded; the subject reference is anchored
 * through the injected identity seam and never used as the graph key (plan §1.2).
 * The payload is codes + refs only — clinicalStatus/verificationStatus codes, the
 * codings, and the condition ref — never free-text clinical narrative.
 *
 * C9.2 yield: conditions feed -> conditions T1 (coded problem list, HCC-relevant).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

/** One tagged FHIR Condition pulled from the bundle. */
interface ConditionResource {
  resource: Record<string, unknown>;
}

/** A coding triple (system URI + code + display). Governed codings run the gate. */
interface Coding {
  system: string;
  code: string;
  display: string;
}

/** Normalized Condition payload (the Condition node's projection seed). Codes only. */
export interface ConditionPayload {
  conditionRef: string;
  /** ICD-10-CM diagnosis coding (governed; gated at transform). */
  code: Coding;
  /** SNOMED-CT coding when the source dual-codes; omitted otherwise (also gated). */
  snomed?: Coding;
  /** CMS-HCC coding when the source attaches one; drives `hccRelevant` (also gated). */
  hcc?: Coding;
  clinicalStatus: string;
  verificationStatus: string;
  category: string;
  recordedDate: string;
  /** True iff a CMS-HCC coding is present — honest, source-driven, never inferred. */
  hccRelevant: boolean;
  /** Carried onto the graph edge as the asserter (PHI-safe). */
  provenance: string;
}

const SOURCE = { system: 'ehr-problem-list', feed: 'conditions-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** code.coding filtered to a specific system URI -> a coding triple, or undefined. */
function codingForSystem(resource: Record<string, unknown>, systemUri: string): Coding | undefined {
  const coding = obj(resource.code).coding;
  if (!Array.isArray(coding)) return undefined;
  for (const c of coding) {
    const cc = obj(c);
    if (str(cc.system) === systemUri && str(cc.code)) {
      return { system: systemUri, code: str(cc.code), display: str(cc.display) };
    }
  }
  return undefined;
}
/** The HCC coding block (a synthetic, source-attached risk-adjustment coding). */
function hccCoding(resource: Record<string, unknown>): Coding | undefined {
  const hcc = obj(resource.hcc);
  const code = str(hcc.code);
  return code ? { system: str(hcc.system, 'urn:cms:risk-adjustment:hcc'), code, display: str(hcc.display) } : undefined;
}
/** The first coding's `code` from a CodeableConcept-shaped status field. */
function statusCode(field: unknown, fallback: string): string {
  const coding = obj(field).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return str(first.code, fallback);
}
/** subject.reference "Patient/COND-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}

const ICD10_URI = 'http://hl7.org/fhir/sid/icd-10-cm';
const SNOMED_URI = 'http://snomed.info/sct';

function parse(payload: string): RawRecord<ConditionResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<ConditionResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Condition') continue;
    const id = str(resource.id) || `cond-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<ConditionResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource)) issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  // The ICD-10-CM diagnosis coding is the required identity of a problem-list entry.
  if (!codingForSystem(resource, ICD10_URI)) {
    issues.push({ reasonCode: 'missing-condition-code', fieldPath: 'code.coding' });
  }
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<ConditionResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const conditionId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const conditionRef = `Condition/${conditionId}`;
  const icd = codingForSystem(resource, ICD10_URI)!; // validate() guaranteed it
  const snomed = codingForSystem(resource, SNOMED_URI);
  const hcc = hccCoding(resource);
  const recordedDate = str(resource.recordedDate);

  const payload: ConditionPayload = {
    conditionRef,
    code: icd,
    ...(snomed ? { snomed } : {}),
    ...(hcc ? { hcc } : {}),
    clinicalStatus: statusCode(resource.clinicalStatus, 'active'),
    verificationStatus: statusCode(resource.verificationStatus, 'confirmed'),
    category: 'problem-list-item',
    recordedDate,
    hccRelevant: Boolean(hcc),
    provenance: 'diagnosis-authoritative',
  };

  return {
    domain: 'conditions',
    memberId,
    resourceType: 'Condition',
    fhirResourceId: conditionRef,
    eventType: 'condition.recorded',
    tier: 'T1',
    idempotencyKey: `condition:${conditionId}`,
    provenance: 'diagnosis-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: recordedDate ? `${recordedDate}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The conditions FHIR-JSON batch adapter (Condition problem list, ICD-10 + SNOMED, T1). */
export const conditionsAdapter: DomainAdapter<ConditionResource> = {
  source: SOURCE,
  domain: 'conditions',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
