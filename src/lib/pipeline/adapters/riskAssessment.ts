// CONTRACT: C9  // CONTRACT: C10
/**
 * RiskAssessment FHIR-JSON adapter (arrival mode: batch). Parses a FHIR R4
 * `RiskAssessment` resource feed (payer risk-stratification / RAF output) into
 * normalized records at tier T1, projected via the NEW `riskAssessmentSpec`
 * (node kind RiskAssessment, edge HAS_RISK_ASSESSMENT).
 *
 * PHI-MINIMAL: the projection carries NUMBERS and CODES only — the predicted
 * outcome code/text, the probability decimal, the RAF score NUMBER, and the method
 * code — NEVER the free-text `prediction[].rationale` narrative. The RAF score is
 * pulled out of the rationale by a strict regex and stored as a bare number, so the
 * sentence itself never reaches the graph. The subject reference anchors the member
 * through the injected identity seam (never the graph key, plan §1.2).
 *
 * Seed RAF carries NO governed HCC coding, so this domain is intentionally left OUT
 * of CODE_CARRYING_DOMAINS (requiring governed codes would re-quarantine it).
 * Non-restricted by default. Event `risk-assessment.recorded`.
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One FHIR RiskAssessment pulled from the bundle. */
interface RiskAssessmentResource {
  resource: Record<string, unknown>;
}

/** Normalized risk-assessment payload (the RiskAssessment node's seed). PHI-minimal. */
export interface RiskAssessmentPayload {
  riskRef: string;
  /** RiskAssessment.prediction[].outcome.text or coding.code (PHI-safe). */
  predictedOutcome: string;
  /** RiskAssessment.prediction[].probabilityDecimal (a number). */
  probability: number;
  /**
   * The RAF score NUMBER parsed out of the rationale (never the sentence). `null`
   * when no RAF is present — DISTINCT from a real 0, so a differently-phrased or
   * absent RAF is never silently projected as a phantom risk score of 0.
   */
  rafScore: number | null;
  /** RiskAssessment.method.coding[0].code when present, else ''. */
  method: string;
}

const SOURCE = { system: 'risk-engine', feed: 'risk-assessment-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
/** subject.reference "Patient/RA-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** The first prediction block, or {}. */
function firstPrediction(resource: Record<string, unknown>): Record<string, unknown> {
  return Array.isArray(resource.prediction) ? obj(resource.prediction[0]) : {};
}
/** prediction.outcome.text or outcome.coding[0].code (PHI-safe outcome label). */
function outcomeOf(prediction: Record<string, unknown>): string {
  const outcome = obj(prediction.outcome);
  const text = str(outcome.text);
  if (text) return text;
  const coding = Array.isArray(outcome.coding) ? obj(outcome.coding[0]) : {};
  return str(coding.code);
}
/**
 * Pull the RAF score NUMBER out of a free-text rationale, returning the bare number
 * so the rationale sentence itself never reaches the graph. Tolerant of the real
 * phrasings a source uses — "RAF score 3.42", "RAF score of 3.42", "RAF: 3.42",
 * "RAF of 3.42", "RAF weight 3.42" — and of a comma decimal ("3,42" → 3.42). Returns
 * `null` (NOT 0) when no RAF is present, so an absent/odd-phrased RAF is never stored
 * as a phantom 0 (the red-team silent-corruption finding). A bare integer RAF is
 * accepted; a value with no fractional part still parses.
 */
function rafScoreFromRationale(rationale: string): number | null {
  const m = /RAF(?:\s+(?:score|weight|risk\s+score))?\s*(?:of|:|=)?\s*(\d+(?:[.,]\d+)?)/i.exec(
    rationale
  );
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parse(payload: string): RawRecord<RiskAssessmentResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<RiskAssessmentResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'RiskAssessment') continue;
    const id = str(resource.id) || `ra-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<RiskAssessmentResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  if (!subjectSourceId(raw.data.resource)) {
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  }
  // The node is keyed on resource.id; without it two id-less RiskAssessments would
  // collide onto ONE node (silent loss). Require it so an unkeyable resource QUARANTINES.
  if (!str(raw.data.resource.id)) {
    issues.push({ reasonCode: 'missing-risk-assessment-id', fieldPath: 'id' });
  }
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<RiskAssessmentResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const raId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const prediction = firstPrediction(resource);
  const methodCodings = obj(resource.method).coding;
  const methodCoding = Array.isArray(methodCodings) ? obj(methodCodings[0]) : {};

  const payload: RiskAssessmentPayload = {
    riskRef: `RiskAssessment/${raId}`,
    predictedOutcome: outcomeOf(prediction),
    probability: num(prediction.probabilityDecimal),
    rafScore: rafScoreFromRationale(str(prediction.rationale)),
    method: str(methodCoding.code),
  };
  const occurrence = str(resource.occurrenceDateTime);
  return {
    domain: 'risk-assessment',
    memberId,
    resourceType: 'RiskAssessment',
    fhirResourceId: payload.riskRef,
    eventType: 'risk-assessment.recorded',
    tier: 'T1',
    idempotencyKey: `risk-assessment:${raId}`,
    provenance: 'risk-engine',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: occurrence ? occurrence : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The RiskAssessment FHIR-JSON batch adapter (RAF projection; PHI-minimal). */
export const riskAssessmentAdapter: DomainAdapter<RiskAssessmentResource> = {
  source: SOURCE,
  domain: 'risk-assessment',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
