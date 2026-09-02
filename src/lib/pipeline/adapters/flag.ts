// CONTRACT: C9  // CONTRACT: C10
/**
 * Flag FHIR-JSON adapter (arrival mode: batch). Parses a FHIR R4 `Flag` resource
 * feed (clinical / administrative alerts) into normalized records at tier T1,
 * projected via the NEW `flagSpec` (node kind Flag, edge HAS_FLAG).
 *
 * PHI-SAFE: the projection carries the Flag.category coding CODE + status + period
 * ONLY — NEVER Flag.code.text, which is free-text PHI narrative (an alert sentence
 * naming a condition, a gap, a behavior). The category coding is the durable,
 * PHI-safe classification the graph keeps.
 *
 * PART 2: if the Flag's category / code coding indicates SUD (F10–F19), the
 * two-factor Part 2 basis is evaluated and — failing safe on absent program
 * context — the `part2-sud` segmentation hint is attached (like encounterFhir.ts /
 * behavioralHealth.ts). The seed flags carry a non-SUD clinical category, so they
 * project unrestricted; a SUD-category flag projects RESTRICTED by the envelope.
 *
 * The subject reference anchors the member through the injected identity seam
 * (never the graph key, plan §1.2). Event `flag.recorded`; occurredAt = period.start.
 */
import { evaluatePart2Basis, isSudCoding } from '../part2Basis';
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One FHIR Flag pulled from the bundle. */
interface FlagResource {
  resource: Record<string, unknown>;
}

/** Normalized flag payload (the Flag node's projection seed). PHI-safe: no code.text. */
export interface FlagPayload {
  flagRef: string;
  /** Flag.category[0].coding[0].code (PHI-safe classification), never code.text. */
  categoryCode: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  /** Present only when the two-factor Part 2 basis is met (SUD-coded flag). */
  segmentationHints?: string[];
}

const SOURCE = { system: 'flag-feed', feed: 'flag-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
/** subject.reference "Patient/FLG-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  const ref = str(obj(resource.subject).reference) || str(obj(resource.patient).reference);
  return ref.split('/').pop() ?? '';
}
/** Flag.category[0].coding[0].code (the PHI-safe classification code). */
function categoryCode(resource: Record<string, unknown>): string {
  const cat = Array.isArray(resource.category) ? obj(resource.category[0]) : {};
  const coding = Array.isArray(cat.coding) ? obj(cat.coding[0]) : {};
  return str(coding.code);
}
/** Every {system, code} coding across Flag.category + Flag.code. */
function allCodings(resource: Record<string, unknown>): { system: string; code: string }[] {
  const out: { system: string; code: string }[] = [];
  const fields: unknown[] = [];
  if (Array.isArray(resource.category)) fields.push(...resource.category);
  if (resource.code) fields.push(resource.code);
  for (const cc of fields) {
    const coding = Array.isArray(obj(cc).coding) ? (obj(cc).coding as unknown[]) : [];
    for (const c of coding) out.push({ system: str(obj(c).system), code: str(obj(c).code) });
  }
  return out;
}

function parse(payload: string): RawRecord<FlagResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<FlagResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Flag') continue;
    const id = str(resource.id) || `flag-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<FlagResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  if (!subjectSourceId(raw.data.resource)) {
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  }
  // The node is keyed on resource.id; without it two id-less Flags would collide onto
  // ONE node (silent loss). Require it so an unkeyable resource QUARANTINES.
  if (!str(raw.data.resource.id)) {
    issues.push({ reasonCode: 'missing-flag-id', fieldPath: 'id' });
  }
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<FlagResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const flagId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const period = obj(resource.period);
  const periodStart = str(period.start);

  const payload: FlagPayload = {
    flagRef: `Flag/${flagId}`,
    categoryCode: categoryCode(resource) || 'clinical',
    status: str(resource.status, 'active'),
    periodStart,
    periodEnd: str(period.end),
  };

  // PART 2: an SUD-coded flag (ICD-10 F10–F19 OR a governed SNOMED SUD concept, in
  // ANY category/code coding) evaluates the two-factor basis; with no program context
  // it fails safe to restricted. `isSudCoding` (not `isSudDiagnosis`) so a SNOMED-coded
  // SUD flag cannot be disclosed by coding system.
  const sud = allCodings(resource).find((c) => isSudCoding(c.code, c.system));
  if (sud) {
    const basis = evaluatePart2Basis({ facilityType: '', code: sud.code, system: sud.system });
    if (basis.part2) payload.segmentationHints = ['part2-sud'];
  }

  return {
    domain: 'flag',
    memberId,
    resourceType: 'Flag',
    fhirResourceId: payload.flagRef,
    eventType: 'flag.recorded',
    tier: 'T1',
    idempotencyKey: `flag:${flagId}`,
    provenance: 'flag-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: periodStart ? periodStart : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The Flag FHIR-JSON batch adapter (reuses flagSpec; PHI-safe, Part 2-aware). */
export const flagAdapter: DomainAdapter<FlagResource> = {
  source: SOURCE,
  domain: 'flag',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
