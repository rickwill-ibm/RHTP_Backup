// CONTRACT: C9  // CONTRACT: C10  // R3
/**
 * Behavioral-health SURVEY FHIR-JSON adapter (arrival mode: batch). Parses the
 * `survey` subset of a FHIR Observation feed — scored screening instruments such
 * as PHQ-9 (LOINC 44249-1) and AUDIT-C (75626-2) — into normalized records at tier
 * T1, routed to the EXISTING `behavioral-health` domain.
 *
 * R3 rationale: a scored survey is a behavioral-health SIGNAL, not a diagnosis. It
 * must reach the behavioral-health domain (not labs-vitals, where it fell before),
 * yet it must NOT project as a Condition — a PHQ-9 score of 14 is not a diagnosis
 * of depression. So this adapter emits a distinct `behavioral-health.observation-
 * recorded` eventType, and the existing `behavioralHealthSpec` (EXTENDED, not
 * replaced) claims it and builds a BehavioralHealthObservation node rather than a
 * Condition. No new mapping spec or domain is added — the 20/20 record-domain count
 * is untouched.
 *
 * Part 2: a survey score is not SUD program content, so it is never Part-2 labeled
 * here (that labeling belongs to the SUD Condition path in behavioralHealth.ts). The
 * payload is codes + a numeric score only — never free-text narrative.
 *
 * C9.2 yield: BH-survey FHIR feed -> behavioral-health T1 (scored screening signal).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One tagged FHIR Observation pulled from the bundle. */
interface ObsResource {
  resource: Record<string, unknown>;
}

/** The BehavioralHealthObservation payload the BH spec reads (codes + score only). */
export interface BhObservationPayload {
  observationRef: string;
  code: { system: string; code: string; display: string };
  /** The scored value (PHQ-9 / AUDIT-C total), or null when the source omitted it. */
  score: number | null;
  /** Instrument label derived from the LOINC code (e.g. 'PHQ-9', 'AUDIT-C'). */
  instrument: string;
  status: string;
  provenance: string;
}

const SOURCE = { system: 'bh-registry', feed: 'behavioral-health-survey-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

/** All category codes across every category coding (not just coding[0]). */
function categoryCodes(resource: Record<string, unknown>): string[] {
  const cat = resource.category;
  if (!Array.isArray(cat)) return [];
  const out: string[] = [];
  for (const c of cat) {
    const coding = obj(c).coding;
    if (Array.isArray(coding)) for (const cc of coding) out.push(str(obj(cc).code));
  }
  return out;
}
/** This adapter owns Observations carrying the `survey` category axis. */
export function isSurvey(resource: Record<string, unknown>): boolean {
  return categoryCodes(resource).includes('survey');
}

/** The LOINC survey code from code.coding (any position). */
function loinc(resource: Record<string, unknown>): {
  system: string;
  code: string;
  display: string;
} {
  const coding = obj(resource.code).coding;
  const arr = Array.isArray(coding) ? coding : [];
  for (const c of arr) {
    const cc = obj(c);
    if (/loinc/i.test(str(cc.system)) && str(cc.code)) {
      return {
        system: str(cc.system, 'http://loinc.org'),
        code: str(cc.code),
        display: str(cc.display),
      };
    }
  }
  const first = obj(arr[0]);
  return {
    system: str(first.system, 'http://loinc.org'),
    code: str(first.code),
    display: str(first.display),
  };
}

/** Recognized scored BH instruments (data, not logic): LOINC -> instrument label. */
const BH_SURVEY_LOINC: Record<string, string> = {
  '44249-1': 'PHQ-9', // PHQ-9 total score
  '44261-6': 'PHQ-9', // PHQ-9 (alt)
  '75626-2': 'AUDIT-C', // AUDIT-C total score
  '72109-2': 'PHQ-9', // PHQ-9/PHQ-2 panel
  '55758-7': 'PHQ-2',
};

/** The scored value — valueQuantity.value or valueInteger. */
function scoreOf(resource: Record<string, unknown>): number | null {
  const vq = obj(resource.valueQuantity);
  if ('value' in vq) return numOrNull(vq.value);
  return numOrNull(resource.valueInteger);
}

/** subject.reference last component -> the source member id (anchored via the seam). */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
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
    if (!isSurvey(resource)) continue; // owns survey only
    // Own ONLY recognized scored BH instruments. A survey Observation with an
    // unrecognized code is left for a future mapper rather than mis-filed as BH.
    const code = loinc(resource).code;
    if (code && !BH_SURVEY_LOINC[code]) continue;
    const id = str(resource.id) || `bh-obs-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<ObsResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (!loinc(resource).code)
    issues.push({ reasonCode: 'missing-observation-code', fieldPath: 'code.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<ObsResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const obsId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const observationRef = `Observation/${obsId}`;
  const code = loinc(resource);
  const instrument = BH_SURVEY_LOINC[code.code] ?? 'behavioral-health-survey';
  const effectiveDateTime = str(resource.effectiveDateTime);
  const payload: BhObservationPayload = {
    observationRef,
    code,
    score: scoreOf(resource),
    instrument,
    status: str(resource.status, 'final'),
    provenance: 'screening-recorded',
  };
  return {
    domain: 'behavioral-health',
    memberId,
    resourceType: 'Observation',
    fhirResourceId: observationRef,
    eventType: 'behavioral-health.observation-recorded',
    tier: 'T1',
    idempotencyKey: `bh:obs:${obsId}`,
    provenance: 'screening-recorded',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: effectiveDateTime
      ? `${effectiveDateTime}T00:00:00Z`
      : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The BH-survey FHIR-JSON batch adapter (survey Observation -> behavioral-health). */
export const bhObservationAdapter: DomainAdapter<ObsResource> = {
  source: SOURCE,
  domain: 'behavioral-health',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
