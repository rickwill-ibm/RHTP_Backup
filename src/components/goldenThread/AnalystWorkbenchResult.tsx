/**
 * AnalystWorkbenchResult — the presentational half of the Wave-10 live-wired workbench
 * (split from `AnalystWorkbench.tsx` for the file-size cap; that module owns the state +
 * the fetch handlers). Pure rendering of the REAL responses: the shared response types, the
 * analyst-action → governed-action mapping, and the components that render an AnalysisRun
 * (plan/eval outcome, finding, interlock-gated action + Approve, routed ticket).
 *
 * No '@/lib/evidence' barrel — types are declared here so nothing pulls node:crypto into the
 * client bundle. PHI: only the server-masked `recordRef` is rendered; the member-embedding
 * record id / `workItemId` never reach this layer.
 */
/**
 * The wire token for the process gate. Declared LOCALLY, not imported, because this module's own
 * contract (above) is that no `@/lib/evidence` barrel reaches the client bundle — and
 * `escalationSignals` pulls in the recovery/work-queue chain.
 *
 * It was `gate?: string`, and `gate` crosses an HTTP boundary: `/api/evidence/[id]` returns it inside
 * `analysis.routed`, this module renders the raw token to a reviewer, and `EscalationConsole` renders
 * a LABEL for the same value. An unbound `string` meant the wire vocabulary could move with no signal
 * at either render site. Equality with `ProcessGate` is pinned by a type-level assertion in
 * `tests/goldenThread/autonomyVocabulary.test.ts` rather than by an import, so the bundle stays clean
 * and a divergence is still a red test.
 */
export type ProcessGateToken = 'assist' | 'hitl' | 'hotl' | 'autonomous';

export type Party = 'payer' | 'provider';
export type Outcome = 'ok' | 'plan-rejected' | 'eval-rejected';
export type ActPhase = 'idle' | 'working' | 'done' | 'error';

export interface WorkbenchAnalysis {
  id: string;
  label: string;
  party: Party | 'both';
}
export interface AnalysisAction {
  actionType: string;
  priority: string;
  isSubmission: boolean;
  rung: string;
  requiresHuman: boolean;
  resolved: boolean;
  reason: string;
}
export interface AnalysisFinding {
  analysisId: string;
  kind: string;
  party: string;
  /** Server-masked, member-free reference ('evidence-record') — safe to render. */
  recordRef: string;
  tier: string;
  summary: string;
  anomaly: boolean;
  data: Record<string, unknown>;
}
export interface AnalysisTicket {
  kind: string;
  reason: string;
  routed?: { gate?: ProcessGateToken; queueItem?: { queue?: string; disposition?: string } | null };
}
export interface AnalysisRun {
  analysisId: string;
  party: string;
  outcome: Outcome;
  finding?: AnalysisFinding;
  action?: AnalysisAction;
  ticket?: AnalysisTicket;
}
export interface ActionOutcome {
  outcome: 'executed' | 'rejected';
  actionType: string;
  rung?: string;
  isSubmission?: boolean;
  ref?: string;
}
export interface ActState {
  actPhase: ActPhase;
  actResult: ActionOutcome | null;
  actError: string;
}

/**
 * A6 — map each analyst-proposed action disposition onto its FAITHFUL governed-action type,
 * rather than collapsing everything except `draft-appeal` into a generic `ticket-update`.
 * Each disposition keeps its semantics + routing:
 *   • draft-appeal                  → `appeal`             (payer-facing SUBMISSION, human-gated)
 *   • draft-resubmission            → `x12-837-corrected`  (payer-facing SUBMISSION — corrected claim)
 *   • escalate-reconciliation-review→ `provider-notice`    (reconciliation/education communication)
 *   • freeze-and-escalate-integrity → `integrity-freeze`   (urgent internal freeze/escalate — NOT a
 *                                                           generic ticket, NOT a payer submission)
 *   • confirm-reconciliation / monitor / other → `ticket-update` (routine internal lifecycle update)
 * Only the two payer-facing types are submission-class (human-gated at the interlock); the
 * internal dispositions are not. The UI states which governed action Approve will trigger —
 * no urgent integrity tamper or reconciliation escalation silently becomes a generic ticket.
 */
const GOVERNED_ACTION_MAP: Record<string, { type: string; submission: boolean }> = {
  'draft-appeal': { type: 'appeal', submission: true },
  'draft-resubmission': { type: 'x12-837-corrected', submission: true },
  'escalate-reconciliation-review': { type: 'provider-notice', submission: false },
  'freeze-and-escalate-integrity': { type: 'integrity-freeze', submission: false },
  'confirm-reconciliation': { type: 'ticket-update', submission: false },
  monitor: { type: 'ticket-update', submission: false },
};

export function governedActionFor(actionType: string): { type: string; submission: boolean } {
  return GOVERNED_ACTION_MAP[actionType] ?? { type: 'ticket-update', submission: false };
}

/** Extract a PHI-safe human message from a FHIR OperationOutcome error body. */
export function messageFromError(json: unknown, status: number): string {
  const oo = json as { issue?: { diagnostics?: string; details?: { text?: string } }[] } | null;
  const issue = oo?.issue?.[0];
  const msg = issue?.diagnostics ?? issue?.details?.text;
  return msg ? `${msg} (HTTP ${status})` : `Request was refused (HTTP ${status}).`;
}

/** A finding is "present-but-empty" when its body flags an absent input (seed has no data). */
function isEmptyFinding(f: AnalysisFinding): boolean {
  const d = f.data || {};
  return (
    d.hasRemittance === false ||
    d.verifiable === false ||
    d.sealed === false ||
    d.verified === false
  );
}

/** Render the REAL AnalysisRun — plan/eval outcome, finding, interlock-gated action, ticket. */
export function RunResult({
  run,
  hasRecovery,
  onApprove,
  act,
}: {
  run: AnalysisRun;
  /** FIX-2: the analyzed record carries a PERSISTED recovery draft (routed queue item present). */
  hasRecovery: boolean;
  onApprove: (a: AnalysisAction) => void;
  act: ActState;
}): React.ReactElement {
  if (run.outcome !== 'ok') {
    const rejected = run.outcome === 'plan-rejected' ? 'PLAN-VALIDATE' : 'RESULT-EVALUATE';
    return (
      <div
        className="space-y-2 rounded border border-carbon-yellow bg-carbon-yellow-light p-3 text-sm"
        role="status"
      >
        <p className="font-semibold">{rejected} rejected the analysis</p>
        {run.ticket ? (
          <Ticket ticket={run.ticket} />
        ) : (
          <p className="text-carbon-gray-70">The gate refused this analysis.</p>
        )}
      </div>
    );
  }
  const f = run.finding;
  const empty = f ? isEmptyFinding(f) : true;
  return (
    <div className="space-y-3">
      <div className="rounded border border-carbon-gray-20 bg-white p-3 text-sm">
        <p className="font-semibold">
          Finding{f?.anomaly ? ' — anomaly' : empty ? ' — present, no matching data' : ''}
        </p>
        <p className="mt-1 break-words text-carbon-gray-70">{f?.summary}</p>
        {f ? (
          <p className="mt-1 text-xs text-carbon-gray-50">
            kind {f.kind} · party {f.party} · evidence tier{' '}
            <span className="font-mono">{f.tier}</span> · ref{' '}
            <span className="font-mono">{f.recordRef}</span>
          </p>
        ) : null}
      </div>
      {run.action && hasRecovery ? (
        <ActionBlock action={run.action} onApprove={onApprove} act={act} />
      ) : run.action ? (
        <NoRecoveryToActOn />
      ) : null}
      <Ticket ticket={run.ticket} />
    </div>
  );
}

/**
 * FIX-2: honest state when the analysis ran over a record with NO persisted recovery draft
 * (e.g. a seed skeleton served because the thread was not persisted in this process). The
 * governed action targets the recovery, so instead of offering an Approve that would 404 on
 * the store, we say so plainly — mirroring golden-thread's "no recovery was proposed" panel.
 */
function NoRecoveryToActOn(): React.ReactElement {
  return (
    <div
      className="rounded border border-carbon-gray-20 bg-carbon-gray-10 p-3 text-sm text-carbon-gray-70"
      role="status"
    >
      No persisted recovery draft on this Evidence Record — there is nothing to submit. Open the
      Analyst Workbench so the seed order&#8594;cash thread is persisted, then run the analysis
      again to act on the real recovery.
    </div>
  );
}

function ActionBlock({
  action,
  onApprove,
  act,
}: {
  action: AnalysisAction;
  onApprove: (a: AnalysisAction) => void;
  act: ActState;
}): React.ReactElement {
  const gov = governedActionFor(action.actionType);
  return (
    <div className="rounded border border-carbon-gray-20 bg-white p-3 text-sm">
      <p className="font-semibold">Interlock-gated action</p>
      <p className="mt-1 text-carbon-gray-70">
        proposed <span className="font-mono">{action.actionType}</span> · authority rung{' '}
        <span className="font-mono font-semibold">{action.rung}</span> · priority {action.priority}{' '}
        · {action.requiresHuman ? 'requires a human decider' : 'auto-eligible'}
      </p>
      <p className="mt-1 text-xs text-carbon-gray-50">
        Approve triggers the governed action <span className="font-mono">{gov.type}</span>
        {gov.submission
          ? ' (payer-facing submission — MOCK, not transmitted end-to-end)'
          : ' (internal ticket update)'}{' '}
        via the Wave-9 route; the decider is your authenticated session.
      </p>

      {act.actPhase === 'done' && act.actResult ? (
        <div
          className={`mt-2 rounded border p-2 ${
            act.actResult.outcome === 'executed'
              ? 'border-carbon-green bg-carbon-green-light'
              : 'border-carbon-gray-20 bg-carbon-gray-10'
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">
            Governed action {act.actResult.outcome}
            {act.actResult.rung ? (
              <>
                {' '}
                at rung <span className="font-mono">{act.actResult.rung}</span>
              </>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-carbon-gray-70">
            actionType <span className="font-mono">{act.actResult.actionType}</span>
            {act.actResult.isSubmission
              ? ' · MOCK submission receipt — not transmitted end-to-end'
              : ' · durable ticket lifecycle updated'}
            {act.actResult.ref ? (
              <>
                {' '}
                · ref <span className="font-mono">{act.actResult.ref}</span>
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onApprove(action)}
          disabled={act.actPhase === 'working'}
          className="mt-2 rounded bg-carbon-blue px-4 py-1.5 text-sm font-medium text-white hover:bg-carbon-blue-hover disabled:opacity-50"
        >
          {act.actPhase === 'working' ? 'Working…' : 'Approve & execute governed action'}
        </button>
      )}

      {act.actPhase === 'error' ? (
        <p
          className="mt-2 rounded border border-[#ffb3b8] bg-carbon-red-light p-2 text-xs text-carbon-red"
          role="alert"
        >
          {act.actError}
        </p>
      ) : null}
    </div>
  );
}

/** Render the routed ticket (Wave-7 escalation) when the analysis opened one. */
function Ticket({ ticket }: { ticket?: AnalysisTicket }): React.ReactElement | null {
  if (!ticket) return null;
  return (
    <div className="rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2 text-xs text-carbon-gray-70">
      <span className="font-semibold">Ticket ({ticket.kind}):</span> {ticket.reason}
      {ticket.routed?.gate ? (
        <>
          {' '}
          · gate <span className="font-mono">{ticket.routed.gate}</span>
        </>
      ) : null}
      {ticket.routed?.queueItem?.queue ? (
        <>
          {' '}
          · queue <span className="font-mono">{ticket.routed.queueItem.queue}</span>
        </>
      ) : null}
    </div>
  );
}
