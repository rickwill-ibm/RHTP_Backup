// CONTRACT: C9  // CONTRACT: C10
/**
 * Diagnostic-reports FHIR-JSON adapter (arrival mode: batch). Parses a synthetic
 * FHIR `DiagnosticReport` feed (laboratory panels AND imaging studies) into
 * normalized records whose tier is assigned PER RECORD by honest computability:
 *
 *   - A report that LINKS structured `result` Observations is COMPUTABLE -> **T1**.
 *     The result references are carried so the graph can hang the report off the
 *     member and link it to those Observation nodes.
 *   - A report that is NARRATIVE-ONLY (an imaging study whose findings live solely
 *     in a `presentedForm` attachment, with no structured result references) is
 *     NOT computable -> **T2**, carrying only the report TYPE code + the
 *     presentedForm POINTER, exactly like a DocumentReference. It NEVER claims the
 *     T1 it cannot compute (E9): we do not parse the narrative and pretend it is
 *     structured data.
 *
 * `computable` states the tier decision plainly on the payload. The presentedForm
 * is a pointer (url + contentType + title), never the fetched/parsed body.
 *
 * Generic over records: the subject reference is anchored through the injected
 * identity seam, never used as the graph key (plan §1.2).
 *
 * C9.2 yield: diagnostic-reports feed -> diagnostic-reports T1 (computable, result-
 * linked) / T2 (narrative-only imaging), assigned honestly per record.
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, Tier, ValidationResult } from '../types';

/** One tagged FHIR DiagnosticReport pulled from the bundle. */
interface DiagnosticReportResource {
  resource: Record<string, unknown>;
}

/** An opaque content pointer — where the report attachment lives, never its body. */
export interface PresentedFormPointer {
  url: string;
  contentType: string;
  title: string;
}

/** Normalized DiagnosticReport payload (the DiagnosticReport node's seed). */
export interface DiagnosticReportPayload {
  diagnosticReportRef: string;
  /** LOINC report-type coding (e.g. 24323-8 CMP, an imaging study code); code may be ''. */
  code: { system: string; code: string; display: string };
  /** 'LAB' | 'RAD' (imaging) | ... — the DiagnosticReport category. */
  category: string;
  status: string;
  effectiveDateTime: string;
  /** Structured result Observation references; non-empty => computable T1. */
  resultRefs: string[];
  /** The narrative attachment pointer when present (imaging/PDF); NOT parsed. */
  presentedForm?: PresentedFormPointer;
  /** True iff structured results were linked. Drives the honest T1/T2 tier split. */
  computable: boolean;
  /** Carried onto the graph edge/node as the source (PHI-safe). */
  provenance: string;
}

const SOURCE = { system: 'diagnostics-hub', feed: 'diagnostic-reports-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** subject.reference "Patient/DR-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** type/code.coding[0] as a LOINC report-type coding triple (code may be ''). */
function reportCode(resource: Record<string, unknown>): { system: string; code: string; display: string } {
  const coding = obj(resource.code).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return { system: str(first.system, 'http://loinc.org'), code: str(first.code), display: str(first.display) };
}
/** category[0].coding[0].code, e.g. 'LAB' or 'RAD'. */
function categoryOf(resource: Record<string, unknown>): string {
  const cat = Array.isArray(resource.category) ? obj(resource.category[0]) : {};
  const coding = Array.isArray(cat.coding) ? obj(cat.coding[0]) : {};
  return str(coding.code, 'LAB');
}
/** result[].reference -> the referenced Observation node keys (structured linkage). */
function resultRefs(resource: Record<string, unknown>): string[] {
  const result = resource.result;
  if (!Array.isArray(result)) return [];
  return result.map((r) => str(obj(r).reference)).filter((ref) => ref !== '');
}
/** presentedForm[0] as the opaque narrative pointer, when present. */
function presentedForm(resource: Record<string, unknown>): PresentedFormPointer | undefined {
  const pf = Array.isArray(resource.presentedForm) ? obj(resource.presentedForm[0]) : {};
  const url = str(pf.url);
  return url ? { url, contentType: str(pf.contentType), title: str(pf.title) } : undefined;
}

function parse(payload: string): RawRecord<DiagnosticReportResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<DiagnosticReportResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'DiagnosticReport') continue;
    const id = str(resource.id) || `dr-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<DiagnosticReportResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource)) issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  // A report with neither structured results NOR a narrative attachment has no
  // content to carry at any tier — reject rather than emit an empty record.
  if (resultRefs(resource).length === 0 && !presentedForm(resource)) {
    issues.push({ reasonCode: 'missing-report-content', fieldPath: 'result|presentedForm' });
  }
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<DiagnosticReportResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const reportId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const diagnosticReportRef = `DiagnosticReport/${reportId}`;
  const refs = resultRefs(resource);
  const pf = presentedForm(resource);
  const effectiveDateTime = str(resource.effectiveDateTime);
  // E9: computability decides the tier. Structured result linkage => T1; a
  // narrative-only report can honestly claim only T2.
  const computable = refs.length > 0;
  const tier: Tier = computable ? 'T1' : 'T2';

  const payload: DiagnosticReportPayload = {
    diagnosticReportRef,
    code: reportCode(resource),
    category: categoryOf(resource),
    status: str(resource.status, 'final'),
    effectiveDateTime,
    resultRefs: refs,
    ...(pf ? { presentedForm: pf } : {}),
    computable,
    provenance: 'diagnostic-service',
  };

  return {
    domain: 'diagnostic-reports',
    memberId,
    resourceType: 'DiagnosticReport',
    fhirResourceId: diagnosticReportRef,
    eventType: 'diagnostic-report.recorded',
    tier,
    idempotencyKey: `diagnostic-report:${reportId}`,
    provenance: 'diagnostic-service',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: effectiveDateTime ? effectiveDateTime : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The diagnostic-reports FHIR-JSON batch adapter (DiagnosticReport, T1 computable / T2 narrative). */
export const diagnosticReportsAdapter: DomainAdapter<DiagnosticReportResource> = {
  source: SOURCE,
  domain: 'diagnostic-reports',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
