// CONTRACT: C9  // CONTRACT: C10
/**
 * Encounter FHIR-JSON adapter (arrival mode: batch). Parses a FHIR R4 `Encounter`
 * resource feed into normalized records at tier T1, wired to the EXISTING
 * `encounterSpec` (edge HAD_ENCOUNTER) — no new mapping spec, no new WpcDomain:
 * this gives the half-built `encounter` domain its FHIR-JSON front door (previously
 * reachable only via the HL7v2-ADT adapter).
 *
 * PART 2 SAFETY: if ANY Encounter.type / Encounter.reasonCode coding is an ICD-10
 * SUD code (F10–F19), the two-factor Part 2 basis is evaluated and — failing safe
 * on absent program context — the PHI-safe `part2-sud` segmentation hint is attached
 * (exactly like behavioralHealth.ts: `consent.part2Restricted=false` at normalize,
 * the shared transform maps the hint to the durable 42-CFR-Part-2 label). A general
 * check-up encounter (SNOMED 185349003) gets no hint and projects unrestricted.
 *
 * PHI-MINIMAL: the projection carries CODES / CLASS / PERIOD only — never a
 * free-text narrative. The payload field names match what `encounterSpec` reads:
 * encounterRef, encounterClass, trigger, pointOfCare. Event `encounter.recorded`;
 * occurredAt = Encounter.period.start; validity is left OPEN (no discharge emitted).
 */
import { evaluatePart2Basis, isSudCoding } from '../part2Basis';
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One FHIR Encounter pulled from the bundle. */
interface EncounterResource {
  resource: Record<string, unknown>;
}

/** Normalized encounter payload (the Encounter node's projection seed). PHI-minimal. */
export interface EncounterFhirPayload {
  encounterRef: string;
  encounterClass: string;
  /** The Encounter.type coding CODE (e.g. a SNOMED trigger code), never narrative. */
  trigger: string;
  /** serviceProvider / location reference (opaque), or '' — the point of care. */
  pointOfCare: string;
  /** Present only when the two-factor Part 2 basis is met (SUD-coded encounter). */
  segmentationHints?: string[];
}

const SOURCE = { system: 'encounter-feed', feed: 'encounter-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
/** subject.reference "Patient/ENC-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** Encounter.type[0].coding[0].code (the PHI-safe trigger code). */
function triggerCode(resource: Record<string, unknown>): string {
  const type = Array.isArray(resource.type) ? obj(resource.type[0]) : {};
  const coding = Array.isArray(type.coding) ? obj(type.coding[0]) : {};
  return str(coding.code);
}
/** Every {system, code} coding across Encounter.type + Encounter.reasonCode. */
function allCodings(resource: Record<string, unknown>): { system: string; code: string }[] {
  const out: { system: string; code: string }[] = [];
  for (const field of ['type', 'reasonCode'] as const) {
    const arr = Array.isArray(resource[field]) ? (resource[field] as unknown[]) : [];
    for (const cc of arr) {
      const coding = Array.isArray(obj(cc).coding) ? (obj(cc).coding as unknown[]) : [];
      for (const c of coding) out.push({ system: str(obj(c).system), code: str(obj(c).code) });
    }
  }
  return out;
}

function parse(payload: string): RawRecord<EncounterResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<EncounterResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Encounter') continue;
    const id = str(resource.id) || `enc-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<EncounterResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  if (!subjectSourceId(raw.data.resource)) {
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  }
  // The node is keyed on resource.id; without it two id-less Encounters would collide
  // onto ONE node (silent loss). Require it so an unkeyable resource QUARANTINES.
  if (!str(raw.data.resource.id)) {
    issues.push({ reasonCode: 'missing-encounter-id', fieldPath: 'id' });
  }
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<EncounterResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const encId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const period = obj(resource.period);
  const start = str(period.start);
  const pointOfCare =
    str(obj(resource.serviceProvider).reference) ||
    str(
      obj(Array.isArray(resource.location) ? obj(resource.location[0]).location : undefined)
        .reference
    );

  const payload: EncounterFhirPayload = {
    encounterRef: `Encounter/${encId}`,
    encounterClass: str(obj(resource.class).code, 'IMP'),
    trigger: triggerCode(resource),
    pointOfCare,
  };

  // PART 2: a SUD-coded encounter (ICD-10 F10–F19 OR a governed SNOMED SUD concept,
  // in ANY type/reasonCode coding) evaluates the two-factor basis; with no program
  // context it fails safe to restricted and carries the durable label via the hint.
  // A non-SUD encounter gets no hint. `isSudCoding` (not `isSudDiagnosis`) so a
  // SNOMED-coded SUD encounter cannot be disclosed by coding system.
  const sud = allCodings(resource).find((c) => isSudCoding(c.code, c.system));
  if (sud) {
    const basis = evaluatePart2Basis({ facilityType: '', code: sud.code, system: sud.system });
    if (basis.part2) payload.segmentationHints = ['part2-sud'];
  }

  return {
    domain: 'encounter',
    memberId,
    resourceType: 'Encounter',
    fhirResourceId: payload.encounterRef,
    eventType: 'encounter.recorded',
    tier: 'T1',
    idempotencyKey: `encounter:${encId}`,
    provenance: 'encounter-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: start ? start : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The Encounter FHIR-JSON batch adapter (reuses encounterSpec; Part 2-aware). */
export const encounterFhirAdapter: DomainAdapter<EncounterResource> = {
  source: SOURCE,
  domain: 'encounter',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
