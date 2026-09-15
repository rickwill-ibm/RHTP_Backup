/**
 * FHIR → view-model projections (plan Slice 1 / blueprint §6.1).
 * Read-optimized, NON-authoritative. Raw FHIR is retained by the BFF for audit;
 * these VMs are for display only.
 */

// Minimal structural FHIR shapes (avoid inventing fields — see F-5).
interface Coding {
  system?: string;
  code?: string;
  display?: string;
}
interface CodeableConcept {
  text?: string;
  coding?: Coding[];
}
interface Reference {
  reference?: string;
  display?: string;
}

export interface CoverageVM {
  id: string;
  status: string;
  payer: string;
  type: string;
  period?: string;
}
export function toCoverageVM(r: {
  id?: string;
  status?: string;
  type?: CodeableConcept;
  payor?: Reference[];
  period?: { start?: string; end?: string };
}): CoverageVM {
  const start = r.period?.start?.slice(0, 10) ?? '';
  const end = r.period?.end?.slice(0, 10) ?? '';
  return {
    id: r.id ?? '',
    status: r.status ?? 'unknown',
    payer: r.payor?.[0]?.display ?? 'Unknown payer',
    type: r.type?.text ?? codingText(r.type),
    period: start && end ? `${start} – ${end}` : undefined,
  };
}

export interface ConditionVM {
  id: string;
  display: string;
  clinicalStatus: string;
  recordedDate?: string;
}
export function toConditionVM(r: {
  id?: string;
  code?: CodeableConcept;
  clinicalStatus?: CodeableConcept;
  recordedDate?: string;
}): ConditionVM {
  return {
    id: r.id ?? '',
    display: r.code?.text ?? codingText(r.code),
    clinicalStatus: codingText(r.clinicalStatus) || 'unknown',
    recordedDate: r.recordedDate?.slice(0, 10),
  };
}

export type PaStatusLabel = 'approved' | 'denied' | 'pending' | 'unknown';
export interface PaStatusVM {
  id: string;
  status: PaStatusLabel;
  service: string;
  denialReasons: string[];
  authNumber?: string;
  requestedDate?: string;
}
/** Project a FHIR ClaimResponse into a human-readable PA status. */
export function toPaStatusVM(r: {
  id?: string;
  outcome?: string;
  type?: CodeableConcept;
  disposition?: string;
  created?: string;
  error?: { code?: CodeableConcept }[];
}): PaStatusVM {
  const status: PaStatusLabel =
    r.outcome === 'complete'
      ? 'approved'
      : r.outcome === 'error'
        ? 'denied'
        : r.outcome
          ? 'pending'
          : 'unknown';
  return {
    id: r.id ?? '',
    status,
    service: r.type?.text ?? codingText(r.type),
    denialReasons: (r.error ?? []).map((e) => e.code?.text ?? codingText(e.code)).filter(Boolean),
    authNumber: r.id,
    requestedDate: r.created?.slice(0, 10),
  };
}

function codingText(c?: CodeableConcept): string {
  return c?.text ?? c?.coding?.[0]?.display ?? c?.coding?.[0]?.code ?? '';
}
