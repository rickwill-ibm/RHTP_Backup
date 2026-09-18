// CONTRACT: C9  // CONTRACT: C10
/**
 * Care-team FHIR-JSON adapter (arrival mode: batch). Parses a synthetic FHIR
 * CareTeam feed into normalized records at tier T1. ONE CareTeam resource carries
 * the team plus its participant roster, so one feed entry -> ONE normalized record
 * whose payload lists the anchored subject's care-team participants (references +
 * roles only, PHI-safe). A participant that references a Practitioner reuses the
 * shared Practitioner node kind at projection; every other participant projects as
 * a CareTeamMember (plan §1.2: generic over records, no persona hardcoded).
 *
 *   CareTeam -> CareTeam (formed), provenance = care-team-authoritative
 *
 * The subject reference is anchored through the injected identity seam, never used
 * as the graph key. This is the pipeline-fed counterpart to the Iteration-2
 * care-team demo lens: the SAME CareTeam/CareTeamMember node types, now sourced
 * from the pipeline instead of hardcoded demo data.
 *
 * C9.2 yield: care-team feed -> care-team T1 (formed).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One tagged FHIR CareTeam pulled from the bundle. */
interface CareTeamResource {
  resource: Record<string, unknown>;
}

/** One care-team participant projected to a node (Practitioner or CareTeamMember). */
export interface CareTeamParticipant {
  /** The participant node key (the FHIR member reference, e.g. Practitioner/prac-1). */
  participantRef: string;
  /** Node kind: reuse Practitioner where the reference is a Practitioner, else CareTeamMember. */
  kind: 'Practitioner' | 'CareTeamMember';
  role: string;
}

/** Normalized care-team payload (the CareTeam node + roster projection seed). */
export interface CareTeamPayload {
  careTeamRef: string;
  status: string;
  /** Generic team label (a role/category, never a person name). */
  category: string;
  participants: CareTeamParticipant[];
  periodStart: string;
  periodEnd: string | null;
}

const SOURCE = { system: 'care-hub', feed: 'care-team-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** subject.reference "Patient/CT-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}

/** participant[].role[0].coding[0].code -> a PHI-safe role code. */
function participantRole(participant: Record<string, unknown>): string {
  const role = Array.isArray(participant.role) ? obj(participant.role[0]) : {};
  const coding = Array.isArray(role.coding) ? obj(role.coding[0]) : {};
  return str(coding.code, 'care-team-member');
}

/** The first CareTeam.category coding code, defaulting to a generic label. */
function categoryOf(resource: Record<string, unknown>): string {
  const cat = resource.category;
  const first = Array.isArray(cat) ? obj(cat[0]) : {};
  const coding = Array.isArray(first.coding) ? obj(first.coding[0]) : {};
  return str(coding.code, 'longitudinal');
}

/** Map each FHIR participant to a projected node ref + kind + role (PHI-safe). */
function participantsOf(resource: Record<string, unknown>): CareTeamParticipant[] {
  const raw = Array.isArray(resource.participant) ? resource.participant : [];
  const out: CareTeamParticipant[] = [];
  for (const p of raw) {
    const participant = obj(p);
    const ref = str(obj(participant.member).reference);
    if (!ref) continue;
    out.push({
      participantRef: ref,
      kind: ref.startsWith('Practitioner/') ? 'Practitioner' : 'CareTeamMember',
      role: participantRole(participant),
    });
  }
  return out;
}

function parse(payload: string): RawRecord<CareTeamResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<CareTeamResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'CareTeam') continue;
    const id = str(resource.id) || `ct-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<CareTeamResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (participantsOf(resource).length === 0)
    issues.push({ reasonCode: 'missing-participant', fieldPath: 'participant' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<CareTeamResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const ctId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const careTeamRef = `CareTeam/${ctId}`;
  const period = obj(resource.period);
  const periodStart = str(period.start);
  const periodEnd = str(period.end) || null;
  const payload: CareTeamPayload = {
    careTeamRef,
    status: str(resource.status, 'active'),
    category: categoryOf(resource),
    participants: participantsOf(resource),
    periodStart,
    periodEnd,
  };
  return {
    domain: 'care-team',
    memberId,
    resourceType: 'CareTeam',
    fhirResourceId: careTeamRef,
    eventType: 'care-team.formed',
    tier: 'T1',
    idempotencyKey: `ct:team:${ctId}`,
    provenance: 'care-team-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: periodStart ? `${periodStart}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The care-team FHIR-JSON batch adapter (CareTeam + participant roster). */
export const careTeamAdapter: DomainAdapter<CareTeamResource> = {
  source: SOURCE,
  domain: 'care-team',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
