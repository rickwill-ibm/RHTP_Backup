/**
 * Appeal-submission gateway seam (Wave-4 must-fix 6 — honest EDI stub).
 *
 * The payer-facing appeal/837 submission transport. Seeded/mock mode returns a
 * MOCK receipt — a deterministic submissionRef with `channel:'mock'` and
 * `transmitted:false` — so the demo is honest end-to-end: NOTHING is transmitted
 * to a real clearinghouse. Production mode throws DataSourceNotConfiguredError
 * until a real 837/appeal EDI clearinghouse client is wired. There is deliberately
 * NO plausible-but-fake production transmission: a real appeal must never appear to
 * have been sent when it was not.
 *
 * Mirrors the goldCardRoster.ts / signingKey.ts idiom exactly. SEAM:
 * submissionGateway — mode-registry switch point (lib/config/dataMode.ts).
 */
import { createHash } from 'node:crypto';
import { type DataSourceLoader, DataSourceNotConfiguredError, selectLoader } from './common';

const SEAM = 'submissionGateway';

/**
 * Mint a PHI-SAFE, deterministic mock receipt reference (Wave-12 FIX-1, PHI-in-DOM).
 *
 * A submission/notice ref crosses the API boundary and is RENDERED (the recovery-decision
 * success receipt, the governed-action outcome). The `claimId` can be a member-embedding
 * evidence id — in the seeded demo the claim id is `ev-<memberId>-…-claim` — so it is NEVER
 * placed raw in a ref: it is reduced to a short, non-reversible sha256 token (`c-<hex12>`).
 * The `remittanceId` is a payer-assigned advice reference (PHI-safe, no member data) kept
 * plain as the human-readable correlation anchor, so the receipt stays useful for
 * reconciliation. Deterministic: same refs → same ref (no wall-clock / random), so a replay
 * mints the SAME ref (exactly-once ledger appends stay id-idempotent). Reuses the same
 * "mask the member-embedding portion at the source" discipline as `partyView`/escalation.
 */
export function mockReceiptRef(
  prefix: string,
  refs: { claimId?: string; remittanceId?: string }
): string {
  const remittance = refs.remittanceId ?? 'n/a';
  const claimToken = refs.claimId
    ? `c-${createHash('sha256').update(refs.claimId).digest('hex').slice(0, 12)}`
    : 'c-none';
  return `${prefix}::${remittance}::${claimToken}`;
}

/**
 * The PHI-safe references a submission is keyed on. A minimal local shape (refs +
 * amount only) so this transport seam has no upward dependency on the agent layer;
 * a RecoveryTask is structurally assignable to it.
 */
export interface AppealSubmissionTask {
  claimId: string;
  remittanceId: string;
  authId?: string;
}

/**
 * A submission receipt. `transmitted:false` + `channel:'mock'` state plainly that
 * NO real EDI transmission occurred — the honest mock disposition.
 */
export interface SubmissionReceipt {
  submissionRef: string;
  channel: 'mock';
  transmitted: false;
}

/** The gateway resolved from the seam: the transport used to submit an appeal. */
export interface SubmissionGateway {
  asOf: string;
  submitAppeal(task: AppealSubmissionTask): SubmissionReceipt;
}

/**
 * The MOCK submission path. Deterministic: the submissionRef is derived from the
 * task refs (no wall-clock / random), so a replay produces the SAME ref. Returns a
 * not-transmitted receipt — this is a demo mock, not a real clearinghouse send.
 */
export function submitAppealMock(task: AppealSubmissionTask): SubmissionReceipt {
  return {
    // PHI-safe at the source: never embed the (possibly member-embedding) claimId raw.
    submissionRef: mockReceiptRef('appeal-mock', {
      claimId: task.claimId,
      remittanceId: task.remittanceId,
    }),
    channel: 'mock',
    transmitted: false,
  };
}

export const seededSubmissionGatewayLoader: DataSourceLoader<SubmissionGateway> = {
  id: 'seeded-submission-gateway',
  async load(asOf: string): Promise<SubmissionGateway> {
    return { asOf, submitAppeal: submitAppealMock };
  },
};

export const productionSubmissionGatewayLoader: DataSourceLoader<SubmissionGateway> = {
  id: 'production-submission-gateway',
  async load(): Promise<SubmissionGateway> {
    throw new DataSourceNotConfiguredError(SEAM, 'Wire a real 837/appeal EDI clearinghouse here.');
  },
};

/** Resolve the submission-gateway loader for the configured 'submissionGateway' mode. */
export function getSubmissionGatewayLoader(): DataSourceLoader<SubmissionGateway> {
  return selectLoader(SEAM, seededSubmissionGatewayLoader, productionSubmissionGatewayLoader);
}
