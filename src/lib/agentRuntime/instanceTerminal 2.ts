/**
 * THE THREE WAYS A WORKFLOW INSTANCE ENDS, in one file.
 *
 * Extracted from `engine.ts` under the quality ratchet, and the boundary is real rather than
 * arithmetic: these are the only three functions that may set `done.settled`, and every one of them
 * must emit a terminal event. Keeping them apart is how the runtime ended up with `settle()`
 * emitting and `fail()` silent — two routes to a terminal status, one of them invisible to the audit
 * stream, which made an approved-then-threw workflow byte-identical to a crash. Side by side, the
 * asymmetry is a diff.
 *
 * THE ONE INVARIANT THIS FILE OWNS: settled ⇒ exactly one `agent.task.settled`. `terminate` is the
 * deliberate exception and says why at its own site.
 */
import type { AgentTaskEvent, WorkflowSnapshot } from './types';
import { settledOutcome, setAwaiting, type Instance } from './engineSupport';

/** Emit one terminal event. Narrow on purpose: a terminal may emit, and may do nothing else. */
export type TerminalEmit = (
  inst: Instance,
  occurredAtMs: number,
  payload: Record<string, unknown>
) => void;

export interface TerminalDeps {
  now(): number;
  emit: TerminalEmit;
}

/** Guard + stamp shared by all three terminals. Returns false when the instance already ended. */
function claim(
  inst: Instance | undefined,
  status: WorkflowSnapshot['status'],
  d: TerminalDeps
): boolean {
  if (!inst || inst.done.settled) return false;
  inst.done.settled = true;
  inst.snapshot.status = status;
  inst.snapshot.updatedAtMs = d.now();
  return true;
}

/**
 * THE TRUTHFUL RECORD (register G-002): what the workflow reported, at the moment it actually
 * settled — replacing an `agent.task.executed` the engine emitted at APPROVAL time for an effect it
 * neither performed nor observed. The outcome is a code from the closed vocabulary; anything else
 * becomes `'unreported'`.
 *
 * `lastProposalId` may be undefined, and is then OMITTED rather than filled with the workflowId. A
 * workflow that suppressed with reason proposed nothing; writing its workflowId into a field named
 * `proposalId` would make every such settle event join to a proposal that never existed.
 */
export function settleInstance(
  inst: Instance | undefined,
  status: 'completed' | 'failed',
  result: unknown,
  d: TerminalDeps
): void {
  if (!claim(inst, status, d) || !inst) return;
  inst.snapshot.result = result;
  d.emit(inst, inst.snapshot.updatedAtMs, { status, outcome: settledOutcome(result) });
  inst.done.resolve(result);
}

/**
 * The body threw.
 *
 * THIS EMITS, and that is the correction. It used to set `status: 'failed'` and reject in silence,
 * which made the stream for an approved-then-threw workflow — `proposed`, `approved{effectPending:
 * true}`, nothing — byte-identical to a crash between approval and settle. That is the exact case
 * `effectPending` was added to make distinguishable, so its justification was false on the one path
 * that most needed it: the effect may genuinely have run in one reading and not in the other, and an
 * auditor could not tell which.
 *
 * The error TEXT never reaches the event. `snapshot.error` can carry a message that names a member;
 * the error CLASS cannot, and is what an operator actually triages on.
 */
export function failInstance(inst: Instance | undefined, err: unknown, d: TerminalDeps): void {
  if (!claim(inst, 'failed', d) || !inst) return;
  inst.snapshot.error = err instanceof Error ? err.message : String(err);
  d.emit(inst, inst.snapshot.updatedAtMs, {
    status: 'failed',
    outcome: 'errored',
    errorClass: err instanceof Error ? err.name : 'Error',
  });
  inst.done.reject(err);
}

/**
 * The escalation ladder gave up. The body is left suspended, which is the honest representation: it
 * genuinely never ran further.
 *
 * NO `agent.task.settled` HERE, and this is the one exception to this file's invariant. A settle
 * event reports what THE WORKFLOW said, and this workflow said nothing — it was terminated from
 * outside, mid-await. `agent.task.abandoned` is already emitted by the ladder and is the runtime's
 * own record of the same instant, so emitting both would put two terminal events on one workflow
 * with different authorities behind them.
 */
export function terminateInstance(inst: Instance | undefined, d: TerminalDeps): void {
  if (!claim(inst, 'abandoned', d) || !inst) return;
  setAwaiting(inst.snapshot, undefined, undefined);
  inst.done.resolve({ outcome: 'abandoned' });
}

/** The shape `engine.emit` must satisfy to serve as a `TerminalEmit`. */
export type EventSinkEmit = (event: AgentTaskEvent) => Promise<void>;
