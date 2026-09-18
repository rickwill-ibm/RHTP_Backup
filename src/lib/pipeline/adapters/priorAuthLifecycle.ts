// CONTRACT: C9  // CONTRACT: C10
/**
 * Prior-authorization LIFECYCLE FHIR-JSON adapter (arrival mode: batch). Captures
 * a PA request's STATUS LIFECYCLE (submitted -> pending -> approved | denied ->
 * appealed) as an ordered, dated history, NOT just a snapshot. Each PA request
 * arrives as a preauthorization Claim resource carrying a synthetic ordered
 * `statusHistory`, plus optional links to the driving ServiceRequest and the
 * resulting Claim.
 *
 * CRITICAL BOUNDARY: this domain is a CAPTURE feed. It records what a utilization-
 * management system observed about a PA's lifecycle and REFERENCES the existing
 * goldenThread paMachine PaState vocabulary (src/lib/workflow/paMachine.ts) for a
 * human-readable machine-state label. It does NOT drive that machine and never
 * asserts an authoritative Approved/Denied decision: authoritative PA state comes
 * only from the paMachine transition (payer ClaimResponse). Every captured record
 * is marked non-authoritative at the mapping layer.
 *
 * Generic over records: no member is hardcoded; the patient reference is anchored
 * through the injected identity seam id-only (as medication.ts), never used as the
 * graph key (plan §1.2).
 *
 * C9.2 yield: pa-lifecycle feed -> pa-lifecycle T1 (captured PA request lifecycle).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One preauthorization Claim resource pulled from the bundle. */
interface PaResource {
  resource: Record<string, unknown>;
}

/** One dated phase in the captured PA lifecycle. */
export interface PaStatusPhase {
  status: string;
  at: string;
  /** Position in the ordered lifecycle (0-based), for a stable phase node key. */
  seq: number;
}

/** Normalized PA lifecycle payload (the PriorAuthRequest node's projection seed). */
export interface PriorAuthLifecyclePayload {
  paRef: string;
  /** The driving ServiceRequest reference (raw), or '' when none is named. */
  serviceRequestRef: string;
  /** The resulting/related Claim reference (raw), or '' when none is named. */
  claimRef: string;
  /** The latest captured status in the lifecycle. */
  currentStatus: string;
  submittedAt: string;
  /** When a terminal decision (approved/denied) was captured, else ''. */
  decisionAt: string;
  /** The ordered, dated lifecycle (submitted -> ... -> latest). */
  statusHistory: PaStatusPhase[];
  provenance: string;
}

const SOURCE = { system: 'um-hub', feed: 'pa-lifecycle-fhir' } as const;
const DECISION_STATUSES = new Set(['approved', 'denied']);

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** patient.reference "Patient/PA-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.patient).reference).split('/').pop() ?? '';
}

/** The ordered, dated lifecycle phases (sorted by `at`, then source order). */
function statusHistory(resource: Record<string, unknown>): PaStatusPhase[] {
  const raw = arr(resource.statusHistory)
    .map((h, i) => ({ status: str(obj(h).status), at: str(obj(h).at), order: i }))
    .filter((h) => h.status && h.at);
  raw.sort((a, b) => (a.at === b.at ? a.order - b.order : a.at < b.at ? -1 : 1));
  return raw.map((h, seq) => ({ status: h.status, at: h.at, seq }));
}

function parse(payload: string): RawRecord<PaResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const out: RawRecord<PaResource>[] = [];
  for (const entry of arr(bundle.entry)) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Claim') continue;
    if (str(resource.use) !== 'preauthorization') continue;
    const id = str(resource.id) || `pa-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<PaResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'patient.reference' });
  if (statusHistory(resource).length === 0)
    issues.push({ reasonCode: 'missing-status-history', fieldPath: 'statusHistory' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<PaResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const id = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const paRef = `PriorAuthRequest/${id}`;
  const history = statusHistory(resource);
  const submittedAt = history[0]?.at ?? '';
  const decision = history.find((h) => DECISION_STATUSES.has(h.status));
  const payload: PriorAuthLifecyclePayload = {
    paRef,
    serviceRequestRef: str(obj(resource.serviceRequest).reference),
    claimRef: str(obj(resource.relatedClaim).reference),
    currentStatus: history[history.length - 1]?.status ?? '',
    submittedAt,
    decisionAt: decision?.at ?? '',
    statusHistory: history,
    provenance: 'pa-lifecycle-capture',
  };
  return {
    domain: 'pa-lifecycle',
    memberId,
    resourceType: 'PriorAuthRequest',
    fhirResourceId: paRef,
    eventType: 'pa-lifecycle.captured',
    tier: 'T1',
    idempotencyKey: `pa-lifecycle:${id}`,
    provenance: 'pa-lifecycle-capture',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: submittedAt ? `${submittedAt}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The pa-lifecycle FHIR-JSON batch adapter (captured PA request status lifecycle). */
export const priorAuthLifecycleAdapter: DomainAdapter<PaResource> = {
  source: SOURCE,
  domain: 'pa-lifecycle',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
