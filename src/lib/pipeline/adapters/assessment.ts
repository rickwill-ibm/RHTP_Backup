// CONTRACT: C9  // CONTRACT: C10
/**
 * Assessments FHIR-JSON adapter (arrival mode: batch). Parses a synthetic FHIR
 * QuestionnaireResponse feed into normalized assessment records at tier T1. An
 * assessment is a completed questionnaire (PHQ-9, a fall-risk screen, an HRA), so
 * the graph mapping turns it into a dated associative ASSESSED_BY edge from the
 * member to the QuestionnaireResponse.
 *
 * Provenance is honest about WHO answered: a QuestionnaireResponse whose `source`
 * (or `author`) resolves to the SUBJECT is `patient-reported`; one recorded by a
 * clinician/proxy is `clinician-recorded`. The payload carries the questionnaire
 * ref + answer CODES only (a score, a coded finding) — never the free-text answer
 * narrative. Generic over records: no member is hardcoded; the subject reference is
 * anchored through the injected identity seam, never used as the graph key (§1.2).
 *
 * C9.2 yield: assessments feed -> assessments T1 (self-report or clinician-recorded).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One tagged FHIR QuestionnaireResponse pulled from the bundle. */
interface QuestionnaireResponseResource {
  resource: Record<string, unknown>;
}

/** A single coded answer item (code + score only; never the free-text answer). */
export interface AssessmentItem {
  linkId: string;
  code: string;
  valueInteger: number;
}

/** Normalized assessment payload (the QuestionnaireResponse node's projection seed). */
export interface AssessmentPayload {
  questionnaireResponseRef: string;
  /** The Questionnaire this response answers (e.g. "Questionnaire/phq-9"). */
  questionnaireRef: string;
  status: string;
  authored: string;
  /** Coded answers only (PHI-minimal: link ids + codes + numeric scores). */
  items: AssessmentItem[];
  /** True when the subject themselves answered (drives patient-reported provenance). */
  patientReported: boolean;
  /** `patient-reported` | `clinician-recorded` (mirrored onto the node/edge). */
  provenance: string;
}

const SOURCE = { system: 'assessment-hub', feed: 'assessments-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

/** subject.reference "Patient/AS-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** questionnaire canonical ref (e.g. "Questionnaire/phq-9"); may be ''. */
function questionnaireRef(resource: Record<string, unknown>): string {
  return str(resource.questionnaire);
}
/**
 * Is this response patient-reported? True when `source`/`author` resolves to the
 * SAME subject the response is about (the member answered for themselves), rather
 * than a clinician or related-person proxy. Reference-only, PHI-safe.
 */
function isPatientReported(resource: Record<string, unknown>): boolean {
  const subject = str(obj(resource.subject).reference);
  const src = str(obj(resource.source).reference) || str(obj(resource.author).reference);
  return src !== '' && src === subject;
}
/** item[] -> coded answers (linkId + first answer code + integer score). */
function items(resource: Record<string, unknown>): AssessmentItem[] {
  const raw = Array.isArray(resource.item) ? resource.item : [];
  const out: AssessmentItem[] = [];
  for (const it of raw) {
    const item = obj(it);
    const answer = Array.isArray(item.answer) ? obj(item.answer[0]) : {};
    const coding = Array.isArray(answer.valueCoding)
      ? obj(answer.valueCoding[0])
      : obj(answer.valueCoding);
    out.push({
      linkId: str(item.linkId),
      code: str(coding.code),
      valueInteger: num(answer.valueInteger),
    });
  }
  return out;
}

function parse(payload: string): RawRecord<QuestionnaireResponseResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<QuestionnaireResponseResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'QuestionnaireResponse') continue;
    const id = str(resource.id) || `qr-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<QuestionnaireResponseResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  if (!questionnaireRef(resource))
    issues.push({ reasonCode: 'missing-questionnaire', fieldPath: 'questionnaire' });
  return { ok: issues.length === 0, issues };
}

function normalize(
  raw: RawRecord<QuestionnaireResponseResource>,
  deps: PipelineDeps
): NormalizedRecord {
  const resource = raw.data.resource;
  const qrId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const questionnaireResponseRef = `QuestionnaireResponse/${qrId}`;
  const authored = str(resource.authored);
  const patientReported = isPatientReported(resource);
  const provenance = patientReported ? 'patient-reported' : 'clinician-recorded';
  const payload: AssessmentPayload = {
    questionnaireResponseRef,
    questionnaireRef: questionnaireRef(resource),
    status: str(resource.status, 'completed'),
    authored,
    items: items(resource),
    patientReported,
    provenance,
  };
  return {
    domain: 'assessments',
    memberId,
    resourceType: 'QuestionnaireResponse',
    fhirResourceId: questionnaireResponseRef,
    eventType: 'assessment.completed',
    tier: 'T1',
    idempotencyKey: `assessment:${qrId}`,
    provenance,
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: authored ? authored : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The assessments FHIR-JSON batch adapter (QuestionnaireResponse). */
export const assessmentAdapter: DomainAdapter<QuestionnaireResponseResource> = {
  source: SOURCE,
  domain: 'assessments',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
