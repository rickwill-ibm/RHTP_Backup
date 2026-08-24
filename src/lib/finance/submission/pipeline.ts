/**
 * Encounter-submission pipeline (HW-FIN-B / I24), program-spine contract C-SUB
 * (pipeline half). Addresses the financial-integrity Crit "no encounter-submission
 * pipeline so no risk revenue is earned".
 *
 * Flow: submittable encounters (from the RADV scrub, HW-FIN) -> a submission BATCH
 * -> the encounter data intake (EDPS/RAPS/Medicaid) -> ACKNOWLEDGMENTS come back at
 * three levels (999 = X12 syntax, 277CA = claim acknowledgment, MAO-002 =
 * encounter accept/reject) -> reconcile each encounter's status -> the REJECTED set
 * becomes the resubmission worklist. Nothing is "earned" until it is ACCEPTED.
 */

export type SubmissionStatus = 'submitted' | 'accepted' | 'rejected' | 'resubmitted';
export type AckLevel = '999' | '277CA' | 'MAO-002';

export interface EncounterSubmission {
  encounterId: string;
  memberId: string;
  /** The captured HCCs / diagnoses on this encounter. */
  diagnoses: string[];
  status: SubmissionStatus;
  attempts: number;
  /** Last rejection reason, if any (PHI-safe code). */
  rejectionCode?: string;
}

export interface Acknowledgment {
  level: AckLevel;
  encounterId: string;
  accepted: boolean;
  /** X12/CMS status code (e.g. 'A' accepted, 'R277' claim reject, 'MAO-002-R'). */
  code: string;
}

export interface SubmissionBatch {
  batchId: string;
  encounters: EncounterSubmission[];
}

export interface ReconResult {
  accepted: string[];
  rejected: string[];
  resubmit: EncounterSubmission[];
  /** Encounters still awaiting an ack at some level. */
  pending: string[];
}

/** Build a submission batch from submittable encounters. */
export function buildBatch(batchId: string, encounters: Array<Omit<EncounterSubmission, 'status' | 'attempts'>>): SubmissionBatch {
  return {
    batchId,
    encounters: encounters.map((e) => ({ ...e, status: 'submitted', attempts: 1 })),
  };
}

/**
 * Reconcile a batch against the acknowledgments. An encounter is ACCEPTED only if
 * it has NO rejecting ack at ANY level (999 syntax reject, 277CA claim reject, or
 * MAO-002 encounter reject all block acceptance). A rejected encounter with < max
 * attempts is a resubmission candidate.
 */
export function reconcile(batch: SubmissionBatch, acks: Acknowledgment[], maxAttempts = 3): ReconResult {
  const byEnc = new Map<string, Acknowledgment[]>();
  for (const a of acks) {
    const list = byEnc.get(a.encounterId) ?? [];
    list.push(a);
    byEnc.set(a.encounterId, list);
  }
  const result: ReconResult = { accepted: [], rejected: [], resubmit: [], pending: [] };
  for (const enc of batch.encounters) {
    const encAcks = byEnc.get(enc.encounterId) ?? [];
    if (encAcks.length === 0) {
      result.pending.push(enc.encounterId);
      continue;
    }
    const reject = encAcks.find((a) => !a.accepted);
    if (reject) {
      enc.status = 'rejected';
      enc.rejectionCode = reject.code;
      result.rejected.push(enc.encounterId);
      if (enc.attempts < maxAttempts) result.resubmit.push(enc);
    } else {
      enc.status = 'accepted';
      result.accepted.push(enc.encounterId);
    }
  }
  return result;
}

/** Prepare a resubmission batch from the rejected-but-retryable encounters. */
export function buildResubmission(batchId: string, resubmit: EncounterSubmission[]): SubmissionBatch {
  return {
    batchId,
    encounters: resubmit.map((e) => ({ ...e, status: 'resubmitted', attempts: e.attempts + 1, rejectionCode: undefined })),
  };
}
