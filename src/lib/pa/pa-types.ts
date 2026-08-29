/**
 * PA domain types — CRD · DTR · PAS layers.
 * Ported from PA-Standalone-SmartApp; SmartContext dependency removed — all
 * network calls go through RHTP's BFF layer (lib/client/bff.ts).
 */

// ── CRD ─────────────────────────────────────────────────────────────────────

export interface CrdCheckResult {
  patientEnrolled: CheckItem;
  patientEligible: CheckItem;
  providerInNetwork: CheckItem;
  noConflictingGuideline: CheckItem;
  paRequired: CheckItem & { required: boolean };
}

export interface CheckItem {
  pass: boolean;
  label: string;
  detail: string;
  source: 'emr' | 'pa' | 'guideline' | null;
}

// ── DTR ─────────────────────────────────────────────────────────────────────

export interface DtrFhirQuery {
  resourceType?: string;
  searchParam?: string;
  system?: string;
  codes?: string[];
  valueComparison?: string | null;
}

export interface DtrGroup {
  id: number;
  title: string;
  status: 'met' | 'gap' | 'pending';
  required?: boolean;
  description?: string;
  fhirQuery?: DtrFhirQuery;
  sourceExcerpt?: string;
  leaf?: DtrLeaf;
  candidateCodes?: CandidateCode[];
  uploadedEvidence?: string;
  uploadedDocumentReference?: DocumentReference;
}

export interface DtrLeaf {
  code: string;
  label: string;
  evidence: string;
  source: 'emr' | 'pa' | 'upload' | null;
  resourceType?: string;
  dateOfService?: string | null;
  recordedDate?: string | null;
  performerName?: string | null;
  performerReference?: string | null;
  encounterReference?: string | null;
}

export interface CandidateCode {
  code: string;
  system: 'http://hl7.org/fhir/sid/icd-10-cm' | 'http://www.ama-assn.org/go/cpt';
  label: string;
}

export interface DtrMatchResult {
  policyTitle: string;
  cptCode: string;
  groups: DtrGroup[];
  allMet: boolean;
}

// ── PAS ─────────────────────────────────────────────────────────────────────

export type SubmissionChannel = 'fhir' | 'edi';

export interface PasSubmission {
  channel: SubmissionChannel;
  paNumber: string;
  payerEndpoint: string;
  payloadType: string;
  timestamp: string;
  /** Truthful transport result (M2): the payer accepted (submitted), pended (202), or errored.
   *  Absent ⇒ legacy/optimistic path. */
  outcome?: 'submitted' | 'pended' | 'error';
  /** Human note about the outcome (e.g. the error reason) for honest UI. */
  disposition?: string;
}

export type PaStatus =
  'Submitted' | 'Pended' | 'Approved' | 'Partially Approved / Modified' | 'Denied' | 'Pending';

export interface PaCase {
  authId: string;
  patient: string;
  memberId: string;
  service: string;
  cpt: string;
  procedures?: OrderProcedure[];
  dateRequested: string;
  channel: 'FHIR' | 'EDI';
  status: PaStatus;
  checklist: CheckItem[];
  dtr: {
    title: string;
    /** 'attached' = evidence uploaded, pending payer review (NOT a failure). Distinct from 'gap'. */
    status: 'met' | 'gap' | 'attached';
    evidence: string;
    source: 'emr' | 'pa' | 'upload' | null;
  }[];
  submission: PasSubmission;
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  status: string;
  ts: string;
  color: 'blue' | 'amber' | 'green' | 'teal' | 'red' | 'gray';
}

// ── Order ─────────────────────────────────────────────────────────────────────

export interface OrderProcedure {
  cpt: string;
  cptSystem:
    'http://www.ama-assn.org/go/cpt' | 'https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets';
  cptDesc: string;
}

export interface PaOrder {
  procedures: OrderProcedure[];
  orderingProvider: string;
  facility: string;
  orderDate: string;
}

export interface CrdResultEntry {
  cpt: string;
  cptDesc: string;
  result: CrdCheckResult;
}

export type DtrResultEntry = DtrMatchResult;

export interface PatientBanner {
  name: string;
  dob: string;
  memberId: string;
}

// ── CDex DocumentReference (inline — avoids separate import) ─────────────────

export interface DocumentReference {
  resourceType: 'DocumentReference';
  status: 'current';
  docStatus: 'preliminary' | 'final';
  type: { coding: { system: string; code: string; display: string }[]; text?: string };
  category: { coding: { system: string; code: string; display: string }[] }[];
  subject: { reference: string };
  date: string;
  content: { attachment: { contentType: string; title: string; size: number; creation: string } }[];
  context: { related: { display: string }[] };
}
