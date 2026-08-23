// CONTRACT: C9  // CONTRACT: C10
/**
 * Claims-financial FHIR-JSON adapter (arrival mode: batch). ONE feed carries the
 * THREE resource kinds that form the golden-thread FINANCIAL CHAIN:
 *
 *   Claim              -> Claim               (submitted)   provenance = provider-submitted
 *   ClaimResponse      -> ClaimResponse       (adjudicated) provenance = payer-adjudication
 *   ExplanationOfBenefit -> ExplanationOfBenefit (explained)  provenance = payer-eob
 *
 * The chain is Member -> Claim -> ClaimResponse -> EOB: the provider submits a
 * claim, the payer adjudicates it (a ClaimResponse referencing the Claim), and the
 * EOB explains the adjudication (referencing the ClaimResponse). On a DENIAL the
 * ClaimResponse carries CARC (claim-adjustment-reason) + RARC (remittance-advice-
 * remark) adjustment codes, captured PHI-safe as code lists so the denial reason is
 * queryable off the graph. All records are tier T1.
 *
 * Generic over records: no member is hardcoded; the patient reference is anchored
 * through the injected identity seam, never used as the graph key (plan §1.2).
 *
 * C9.2 yield: claims-financial feed -> claims-financial T1 (Claim + ClaimResponse + EOB).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

type ClaimKind = 'Claim' | 'ClaimResponse' | 'ExplanationOfBenefit';

/** One tagged FHIR financial resource pulled from the bundle. */
interface ClaimResource {
  kind: ClaimKind;
  resource: Record<string, unknown>;
}

/** A captured payer adjustment code (CARC or RARC), PHI-safe (code + display only). */
export interface AdjustmentCode {
  category: 'CARC' | 'RARC';
  system: string;
  code: string;
  display: string;
}

/** Normalized Claim payload (the Claim node's projection seed). */
export interface ClaimPayload {
  claimRef: string;
  claimType: string;
  use: string;
  status: string;
  created: string;
  billablePeriodStart: string;
  total: number;
  provenance: string;
}

/** Normalized ClaimResponse payload (the ClaimResponse node's seed; the adjudication). */
export interface ClaimResponsePayload {
  responseRef: string;
  /** The Claim this response adjudicated (the ADJUDICATED_BY causal target). */
  claimRef: string;
  outcome: string;
  disposition: string;
  paymentAmount: number;
  /** CARC codes captured on a denial (claim-adjustment-reason-codes), else []. */
  carcCodes: string[];
  /** RARC codes captured on a denial (remittance-advice-remark-codes), else []. */
  rarcCodes: string[];
  created: string;
  provenance: string;
}

/** Normalized ExplanationOfBenefit payload (the EOB node's seed; explains the response). */
export interface EobPayload {
  eobRef: string;
  /** The ClaimResponse this EOB explains (the EXPLAINED_BY target). */
  responseRef: string;
  claimRef: string;
  outcome: string;
  paymentAmount: number;
  created: string;
  provenance: string;
}

const SOURCE = { system: 'claims-hub', feed: 'claims-financial-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** patient.reference "Patient/CLM-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.patient).reference).split('/').pop() ?? '';
}

/**
 * Collect every CARC/RARC adjustment code on a ClaimResponse. Scans item-level
 * adjudication reasons and top-level errors, classifying by code system: a
 * claim-adjustment-reason system is CARC, a remittance-advice-remark system is
 * RARC. Codes + displays only (PHI-safe); an approved response yields [].
 */
function adjustmentCodes(resource: Record<string, unknown>): AdjustmentCode[] {
  const out: AdjustmentCode[] = [];
  const push = (coding: unknown): void => {
    for (const c of arr(coding)) {
      const system = str(obj(c).system);
      const code = str(obj(c).code);
      if (!code) continue;
      if (system.includes('claim-adjustment-reason')) out.push({ category: 'CARC', system, code, display: str(obj(c).display) });
      else if (system.includes('remittance-advice-remark')) out.push({ category: 'RARC', system, code, display: str(obj(c).display) });
    }
  };
  for (const item of arr(resource.item)) {
    for (const adj of arr(obj(item).adjudication)) push(obj(obj(adj).reason).coding);
  }
  for (const err of arr(resource.error)) push(obj(obj(err).code).coding);
  return out;
}

function parse(payload: string): RawRecord<ClaimResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const out: RawRecord<ClaimResource>[] = [];
  for (const entry of arr(bundle.entry)) {
    const resource = obj(obj(entry).resource);
    const type = str(resource.resourceType) as ClaimKind;
    if (type !== 'Claim' && type !== 'ClaimResponse' && type !== 'ExplanationOfBenefit') continue;
    const id = str(resource.id) || `clm-${out.length + 1}`;
    out.push({ sourceRef: id, data: { kind: type, resource } });
  }
  return out;
}

function validate(raw: RawRecord<ClaimResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { kind, resource } = raw.data;
  if (!subjectSourceId(resource)) issues.push({ reasonCode: 'missing-subject', fieldPath: 'patient.reference' });
  if (kind === 'ClaimResponse' && !str(obj(resource.request).reference)) {
    issues.push({ reasonCode: 'missing-claim-reference', fieldPath: 'request.reference' });
  }
  if (kind === 'ExplanationOfBenefit' && !str(obj(resource.claim).reference)) {
    issues.push({ reasonCode: 'missing-claim-reference', fieldPath: 'claim.reference' });
  }
  return { ok: issues.length === 0, issues };
}

function base(resource: Record<string, unknown>, deps: PipelineDeps): { memberId: string; created: string; occurredAt: string } {
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const created = str(resource.created);
  return { memberId, created, occurredAt: created ? `${created}T00:00:00Z` : new Date(deps.now()).toISOString() };
}

function normalizeClaim(resource: Record<string, unknown>, deps: PipelineDeps): NormalizedRecord {
  const id = str(resource.id);
  const { memberId, created, occurredAt } = base(resource, deps);
  const claimRef = `Claim/${id}`;
  const typeCode = str(obj(arr(obj(resource.type).coding)[0]).code, 'professional');
  const payload: ClaimPayload = {
    claimRef,
    claimType: typeCode,
    use: str(resource.use, 'claim'),
    status: str(resource.status, 'active'),
    created,
    billablePeriodStart: str(obj(resource.billablePeriod).start),
    total: num(obj(resource.total).value),
    provenance: 'provider-submitted',
  };
  return {
    domain: 'claims-financial', memberId, resourceType: 'Claim', fhirResourceId: claimRef,
    eventType: 'claim.submitted', tier: 'T1', idempotencyKey: `claim:${id}`,
    provenance: 'provider-submitted', consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE, occurredAt, payload: payload as unknown as Record<string, unknown>,
  };
}

function normalizeResponse(resource: Record<string, unknown>, deps: PipelineDeps): NormalizedRecord {
  const id = str(resource.id);
  const { memberId, created, occurredAt } = base(resource, deps);
  const responseRef = `ClaimResponse/${id}`;
  const adjustments = adjustmentCodes(resource);
  const payload: ClaimResponsePayload = {
    responseRef,
    claimRef: str(obj(resource.request).reference),
    outcome: str(resource.outcome, 'complete'),
    disposition: str(resource.disposition),
    paymentAmount: num(obj(obj(resource.payment).amount).value),
    carcCodes: adjustments.filter((a) => a.category === 'CARC').map((a) => a.code),
    rarcCodes: adjustments.filter((a) => a.category === 'RARC').map((a) => a.code),
    created,
    provenance: 'payer-adjudication',
  };
  return {
    domain: 'claims-financial', memberId, resourceType: 'ClaimResponse', fhirResourceId: responseRef,
    eventType: 'claim.adjudicated', tier: 'T1', idempotencyKey: `claim-response:${id}`,
    provenance: 'payer-adjudication', consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE, occurredAt, payload: payload as unknown as Record<string, unknown>,
  };
}

function normalizeEob(resource: Record<string, unknown>, deps: PipelineDeps): NormalizedRecord {
  const id = str(resource.id);
  const { memberId, created, occurredAt } = base(resource, deps);
  const eobRef = `ExplanationOfBenefit/${id}`;
  const payload: EobPayload = {
    eobRef,
    responseRef: str(obj(resource.claimResponse).reference),
    claimRef: str(obj(resource.claim).reference),
    outcome: str(resource.outcome, 'complete'),
    paymentAmount: num(obj(obj(resource.payment).amount).value),
    created,
    provenance: 'payer-eob',
  };
  return {
    domain: 'claims-financial', memberId, resourceType: 'ExplanationOfBenefit', fhirResourceId: eobRef,
    eventType: 'claim.explained', tier: 'T1', idempotencyKey: `claim-eob:${id}`,
    provenance: 'payer-eob', consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE, occurredAt, payload: payload as unknown as Record<string, unknown>,
  };
}

function normalize(raw: RawRecord<ClaimResource>, deps: PipelineDeps): NormalizedRecord {
  if (raw.data.kind === 'Claim') return normalizeClaim(raw.data.resource, deps);
  if (raw.data.kind === 'ClaimResponse') return normalizeResponse(raw.data.resource, deps);
  return normalizeEob(raw.data.resource, deps);
}

/** The claims-financial FHIR-JSON batch adapter (Claim + ClaimResponse + EOB chain). */
export const claimsFinancialAdapter: DomainAdapter<ClaimResource> = {
  source: SOURCE,
  domain: 'claims-financial',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
