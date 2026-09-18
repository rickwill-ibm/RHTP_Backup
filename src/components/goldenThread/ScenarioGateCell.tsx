/**
 * ScenarioGateCell (Wave-13.1, HIGH-3) — a small presentational badge for the recovery
 * simulation's scenario table. It renders the interlock GATE outcome for one scenario so a
 * viewer can SEE the gate hold an adverse / submission action:
 *
 *   • resolved            → the action may proceed autonomously at the current tier
 *   • BLOCKED (human-gated)→ the interlock refuses autonomy — a qualified human is required
 *                            (adverse coverage/financial action, payer-facing submission,
 *                            or an assist/HITL low rung)
 *
 * Extracted into its own file so SimulationConsole.tsx stays within the file-size cap
 * (the honest fix per the size ratchet: extract, do not baseline a breach). Computes
 * NOTHING of its own governance — it displays booleans the REAL `evaluateInterlock`
 * produced (via recoverySimulation). PHI-safe: renders a status word only.
 */

export interface ScenarioGateCellProps {
  /** May the action resolve autonomously now (no human decision)? */
  resolved: boolean;
  /** Does the action require a qualified human regardless of rung? */
  requiresHuman: boolean;
  /** The action is an adverse coverage/financial action (money-moving). */
  adverse: boolean;
  /** The action is a payer-facing submission (x12/appeal). */
  submission: boolean;
}

function reasonFor(props: ScenarioGateCellProps): string {
  if (props.adverse) return 'adverse — human-gated';
  if (props.submission) return 'submission — human-gated';
  if (props.requiresHuman) return 'human required';
  return '';
}

export function ScenarioGateCell(props: ScenarioGateCellProps): React.ReactElement {
  if (props.resolved) {
    return (
      <span className="inline-flex items-center rounded bg-carbon-green-light px-1.5 py-0.5 font-medium text-[#0e6027]">
        resolved
      </span>
    );
  }
  const reason = reasonFor(props);
  return (
    <span
      className="inline-flex items-center rounded bg-carbon-red-light px-1.5 py-0.5 font-semibold text-carbon-red"
      title={reason || undefined}
    >
      BLOCKED
      {reason ? <span className="ml-1 font-normal text-carbon-red">· {reason}</span> : null}
    </span>
  );
}
