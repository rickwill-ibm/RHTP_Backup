// CONTRACT: C9  // CONTRACT: C10
/**
 * Behavioral-health FHIR-JSON adapter (arrival mode: batch). Parses a synthetic,
 * ICD-10-coded FHIR bundle of `Condition` resources into normalized records at
 * tier T1. Behavioral health covers the whole ICD-10 F-code range (mood, anxiety,
 * psychotic, and the substance-use-disorder subset F10-F19).
 *
 * The SUD subset is where register F2 (42 CFR Part 2) lives. This adapter does NOT
 * label on a single code guess: it evaluates the two-factor Part 2 BASIS
 * (`part2Basis.ts`) — federally-assisted SUD program context AND SUD content — and
 * only then attaches the PHI-safe `part2-sud` segmentation hint. The shared
 * transform (`applySegmentation`) maps that hint to the durable 42-CFR-Part-2
 * label, which the projector reads off the envelope to build a RESTRICTED node.
 * A SUD diagnosis from a general hospital, or a non-SUD BH diagnosis, gets no
 * Part 2 hint and projects as an ordinary Condition (never over-restricted).
 *
 * Generic over records: the subject is anchored through the injected identity seam
 * and never used as the graph key (plan §1.2). The program-context block is
 * synthetic, PHI-free source metadata (facility type + federally-assisted flag).
 *
 * C9.2 yield: behavioral-health feed -> behavioral-health T1 (BH + Part 2 SUD subset).
 */
import { evaluatePart2Basis, isBehavioralHealthDiagnosis, isSudDiagnosis } from '../part2Basis';
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** Synthetic, PHI-free program context carried on the source Condition. */
interface ProgramContext {
  facilityType: string;
  /** Tri-state: true/false are affirmative; undefined means the source omitted it. */
  federallyAssisted?: boolean;
}

/** One FHIR Condition pulled from the bundle. */
interface ConditionResource {
  resource: Record<string, unknown>;
}

/** Normalized behavioral-health Condition payload (the Condition node's seed). */
export interface BehavioralHealthPayload {
  conditionRef: string;
  code: { system: string; code: string; display: string };
  category: string;
  clinicalStatus: string;
  recordedDate: string;
  /** PHI-safe basis reason string carried for the audit trail (never narrative). */
  segmentationBasis: string;
  /** Present only when the two-factor Part 2 basis is met. */
  segmentationHints?: string[];
}

const SOURCE = { system: 'bh-registry', feed: 'behavioral-health-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
/** Tri-state boolean: preserve absence (undefined) so ambiguity is not lost. A
 * missing federally-assisted flag must NOT be silently read as false, or a SUD
 * record from a SUD program would fail open to disclosable. */
function triBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** code.coding[0] as a coding triple (code may be ''). */
function conditionCode(resource: Record<string, unknown>): {
  system: string;
  code: string;
  display: string;
} {
  const coding = obj(resource.code).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return {
    system: str(first.system, 'http://hl7.org/fhir/sid/icd-10-cm'),
    code: str(first.code),
    display: str(first.display),
  };
}
/**
 * R1 (segmentation integrity): the ICD-10-CM behavioral-health (F-code) coding in ANY
 * position — resolved BY SYSTEM, not by array index. Ownership and the Part 2 basis both
 * key off this so a SNOMED-first / F-second dual-coded SUD Condition is neither silently
 * dropped nor mis-classified as disclosable. Returns undefined when no ICD-10 F-code exists.
 */
function icd10FCoding(
  resource: Record<string, unknown>
): { system: string; code: string; display: string } | undefined {
  const coding = obj(resource.code).coding;
  if (!Array.isArray(coding)) return undefined;
  for (const c of coding) {
    const cc = obj(c);
    const system = str(cc.system);
    const code = str(cc.code);
    if (isBehavioralHealthDiagnosis(code, system))
      return { system, code, display: str(cc.display) };
  }
  return undefined;
}
/**
 * H1 (segmentation integrity): the ICD-10-CM SUD (F10–F19) coding in ANY position. The
 * Part 2 basis is evaluated off THIS, not the first F-code, so a dual-diagnosis Condition
 * (a non-SUD F-code ordered first, a SUD F-code second) is still recognized as SUD content
 * and restricted — never disclosed by coding-array order. Undefined when no SUD coding exists.
 */
function icd10SudCoding(
  resource: Record<string, unknown>
): { system: string; code: string; display: string } | undefined {
  const coding = obj(resource.code).coding;
  if (!Array.isArray(coding)) return undefined;
  for (const c of coding) {
    const cc = obj(c);
    const system = str(cc.system);
    const code = str(cc.code);
    if (isSudDiagnosis(code, system)) return { system, code, display: str(cc.display) };
  }
  return undefined;
}
/** The first coding's `code` from a CodeableConcept-shaped field (e.g. clinicalStatus). */
function codingCode(field: unknown, fallback: string): string {
  const coding = obj(field).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return str(first.code, fallback);
}
/** subject.reference "Patient/BH-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** The synthetic program-context block (facility type + federally-assisted flag). */
function programContext(resource: Record<string, unknown>): ProgramContext {
  const pc = obj(resource.programContext);
  return { facilityType: str(pc.facilityType), federallyAssisted: triBool(pc.federallyAssisted) };
}

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
    // R1 (segmentation integrity): this adapter OWNS a Condition that carries an ICD-10
    // F-code in ANY coding position. A resource that HAS a code but no ICD-10 F-code
    // belongs to the conditions adapter — exclude it so a diagnosis is never double-owned.
    // Coding-less Conditions are kept (still quarantined here) so the missing-code guarantee holds.
    const anyCode = conditionCode(resource).code;
    if (anyCode && !icd10FCoding(resource)) continue;
    const id = str(resource.id) || `bh-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<ConditionResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (!conditionCode(resource).code)
    issues.push({ reasonCode: 'missing-condition-code', fieldPath: 'code.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<ConditionResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const conditionId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const conditionRef = `Condition/${conditionId}`;
  // R1: classify + evaluate the Part 2 basis off the ICD-10 F-coding (by system, any
  // position), NOT coding[0] — otherwise a SNOMED-first dual-coded SUD code would run the
  // basis with a non-ICD system and fail-open to disclosable. Coding-less falls back (quarantined).
  const code = icd10FCoding(resource) ?? conditionCode(resource);
  const pc = programContext(resource);
  const recordedDate = str(resource.recordedDate);

  // F2 + H1: the Part 2 basis is the two-factor rule, evaluated over SUD content in ANY
  // coding (a dual-dx with a non-SUD F-code first must still restrict), not the display code.
  const basisCoding = icd10SudCoding(resource) ?? code;
  const basis = evaluatePart2Basis({
    facilityType: pc.facilityType,
    federallyAssisted: pc.federallyAssisted,
    code: basisCoding.code,
    system: basisCoding.system,
  });

  const payload: BehavioralHealthPayload = {
    conditionRef,
    code,
    category: 'behavioral-health',
    clinicalStatus: codingCode(resource.clinicalStatus, 'active'),
    recordedDate,
    segmentationBasis: basis.reason,
  };
  // Attach the Part 2 hint ONLY when the two-factor basis holds. The shared
  // transform turns it into the durable 42-CFR-Part-2 label; absent the hint the
  // record projects as an ordinary (mental-health) Condition, never over-restricted.
  if (basis.part2) payload.segmentationHints = ['part2-sud'];

  return {
    domain: 'behavioral-health',
    memberId,
    resourceType: 'Condition',
    fhirResourceId: conditionRef,
    eventType: 'behavioral-health.condition-recorded',
    tier: 'T1',
    idempotencyKey: `bh:cond:${conditionId}`,
    provenance: 'diagnosis-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: recordedDate ? `${recordedDate}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The behavioral-health FHIR-JSON batch adapter (BH conditions + Part 2 SUD subset). */
export const behavioralHealthAdapter: DomainAdapter<ConditionResource> = {
  source: SOURCE,
  domain: 'behavioral-health',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
