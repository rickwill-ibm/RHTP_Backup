/**
 * decisionSupport.ts — mechanics extracted from the recovery decision route (Wave-4;
 * split out in Wave-5 to keep the route within the size cap). Two responsibilities:
 *
 *   1. `terminalOutcome` — the exactly-once short-circuit read: the existing terminal
 *      outcome for a recovery if a `recovery-decision` marker is already on the spine
 *      (PHI-safe, references only).
 *   2. `runReconstructAndSignal` — the reconstruct-and-signal core: re-execute the
 *      DETERMINISTIC recovery workflow on a FRESH per-request engine to its
 *      proposeAndWait suspension, assert the deterministic proposalId, then
 *      `engine.signal` the qualified-human decision so the SAME governed body runs its
 *      post-approval SUBMISSION effect. It CAPTURES the mock, not-transmitted receipt;
 *      the caller re-applies the submission/terminal appends onto the freshly-read
 *      latest record (lost-update guard). This is NOT a durable Temporal resume — the
 *      engine has no history/replay (FAKE_FIDELITY.md row 6).
 *
 * Pure of HTTP: it throws on any failure (workflow never suspended, mis-targeted
 * proposal, the qualified-human assert, or the production submission seam) so the
 * route's catch maps it to a fail-closed 500 with NOTHING saved (safely retryable).
 */
import {
  createRecoveryWorkflow,
  type RecoveryDeps,
  type RecoveryTask,
} from '@/lib/agents/revenueCycle';
import { createRuntime, createManualClock } from '@/lib/agentRuntime';
import { getSubmissionGatewayLoader } from '@/lib/dataSources/submissionGateway';
import { presetRegistryForRecoveryId } from '@/lib/goldenThread/presetRegistry';
import { awaitSuspension } from '@/lib/goldenThread/recoveryDispatch';
import type { EvidenceRecord, EvidenceEntry } from '@/lib/evidence';

type DecisionEntry = Extract<EvidenceEntry, { type: 'recovery-decision' }>;
type SubmissionEntry = Extract<EvidenceEntry, { type: 'submission' }>;

export interface TerminalOutcome {
  outcome: 'submitted' | 'rejected';
  submissionRef?: string;
}

/**
 * The existing terminal outcome for a recovery, if a `recovery-decision` marker is on
 * the spine (exactly-once short-circuit). Reads the marker's status + the submission
 * ref (approve) — PHI-safe, references only.
 */
export function terminalOutcome(
  record: EvidenceRecord,
  recoveryId: string
): TerminalOutcome | null {
  const marker = record.entries.find(
    (e) => e.type === 'recovery-decision' && e.id === `${recoveryId}-decision`
  ) as DecisionEntry | undefined;
  if (!marker) return null;
  if (marker.status === 'rejected') return { outcome: 'rejected' };
  const submission = record.entries.find(
    (e) => e.type === 'submission' && e.id === `${recoveryId}-submission`
  ) as SubmissionEntry | undefined;
  return {
    outcome: 'submitted',
    ...(submission ? { submissionRef: submission.submissionRef } : {}),
  };
}

export interface ReconstructSignalArgs {
  memberId: string;
  task: RecoveryTask;
  decision: 'approved' | 'rejected';
  decidedBy: string;
  decisionTs: string;
  recoveryId: string;
}

export interface ReconstructSignalResult {
  submissionRef?: string;
  submissionChannel?: 'mock';
}

/**
 * Re-execute the deterministic workflow to its suspension on a fresh engine, then
 * signal the qualified-human decision and await completion. Returns the captured mock
 * submission receipt (approve path) or an empty result (reject path). Throws on any
 * failure so the caller fails closed.
 */
export async function runReconstructAndSignal(
  args: ReconstructSignalArgs
): Promise<ReconstructSignalResult> {
  const { memberId, task, decision, decidedBy, decisionTs, recoveryId } = args;
  const workflowId = `${recoveryId}::wf`;
  const proposalId = `${workflowId}::p0`;

  let submissionRef: string | undefined;
  let submissionChannel: 'mock' | undefined;
  const recDeps: RecoveryDeps = {
    async recordDraft() {
      return { recoveryRef: recoveryId };
    },
    async submitAppeal(t) {
      // Fail-closed real-EDI seam: the mock returns a deterministic, not-transmitted
      // receipt; production load() THROWS before any transmission (no fake send).
      // TRANSMIT-SIDE CAVEAT (a named gate BEFORE real EDI): two concurrent approves
      // invoke gateway.submitAppeal TWICE. Harmless today (mock no-op; prod throws), but
      // a REAL 837/appeal EDI seam MUST add a pre-gateway first-writer-wins claim
      // (CAS/idempotency key) BEFORE this call so a losing racer never transmits a
      // duplicate appeal (FAKE_FIDELITY.md row 6). Ledger exactly-once does NOT cover
      // transmission.
      const gateway = await getSubmissionGatewayLoader().load(decisionTs);
      const receipt = gateway.submitAppeal(t); // mock: channel:'mock', transmitted:false
      submissionRef = receipt.submissionRef;
      submissionChannel = receipt.channel;
      return { submissionRef: receipt.submissionRef };
    },
  };

  // Finding #1 fix: decide under the SAME manifest the recovery was DRAFTED under.
  // The preset is recovered from the recoveryId (which folds `-{presetId}-`), so the
  // decision-time engine's permittedRung matches draft time — no default-vs-preset drift.
  const { engine } = createRuntime({
    clock: createManualClock(Date.parse(decisionTs)),
    registry: presetRegistryForRecoveryId(recoveryId),
  });
  const handle = engine.start(createRecoveryWorkflow(recDeps), {
    memberId,
    input: task,
    workflowId,
    correlationId: `corr::${recoveryId}`,
  });
  await awaitSuspension(engine, workflowId);
  if (engine.query(workflowId)?.awaitingProposalId !== proposalId) {
    throw new Error(
      'reconstruct-and-signal: awaiting proposal id did not match the deterministic target'
    );
  }
  await engine.signal(workflowId, {
    name: decision === 'approved' ? 'agent.task.approved' : 'agent.task.rejected',
    proposalId,
    decidedBy,
  });
  await handle.done;

  return {
    ...(submissionRef !== undefined ? { submissionRef } : {}),
    ...(submissionChannel !== undefined ? { submissionChannel } : {}),
  };
}
