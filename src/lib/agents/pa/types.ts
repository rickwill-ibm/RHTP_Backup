/**
 * PA documentation agent — domain types (O-8).
 *
 * The agent drives the existing goldenThread /prior-auth flow from thread context:
 * it prepares documentation and proposes a PA-advancement action HITL. The CRITICAL
 * guardrail lives here as a value: the agent may apply only NON-authoritative
 * advancement events. It NEVER applies `claim-response` — the single event by which
 * the paMachine sets Approved/Denied. Authoritative PA state is the state machine's
 * alone; the agent proposes evidence/documentation, a human gates, the machine decides.
 */
import type { EscalationPriority } from '@/lib/agentRuntime';
import type { PaContext, PaEvent, PaState } from '@/lib/workflow/paMachine';

export const PA_AGENT_ID = 'pa-documentation-agent';

/** A unit of PA documentation work, projected from the /prior-auth thread (O-8). */
export interface PaTask {
  /** PHI-safe reference to the thread / evidence record. */
  threadRef: string;
  /** The current PA machine state read from thread context. */
  currentState: PaState;
  /** The PA machine context (priority, any denial reasons). */
  paContext: PaContext;
  /** Escalation priority tier for the proposal. */
  priority: EscalationPriority;
  /**
   * The documentation/advancement event the agent proposes to apply on approval.
   * MUST be non-authoritative — a `claim-response` here is refused by the guardrail.
   */
  advanceEvent: PaEvent;
}

/** The terminal outcome of a PA documentation workflow run (PHI-safe). */
/**
 * INVARIANT: `executed` means the advancement WAS applied. A transition that did not
 * happen is `not-advanced`, which carries the reason as a REQUIRED field.
 *
 * WHY THE SHAPE CHANGED. `transitionError?: string` used to sit on the `executed` member,
 * so the type itself said "executed, with an error" — and `paAgent` returned
 * `outcome: 'executed'` whenever `transition()` came back with one. `transition()` fails
 * SOFT (paMachine.ts: an illegal transition returns `{ state: current, error }`, it does
 * not throw), so a human approved the proposal, `evidence.append` fired, the PA thread
 * stayed where it was, and the audited demo row read `executed`. `transitionError` was
 * written and read by NOTHING in the repo. That is the exact harm `parseDemoOutcome`'s
 * docstring says it exists to prevent — a record telling an auditor an action was taken
 * when it was not — reached through the outcome field instead of the outcome vocabulary.
 */
export type PaResult =
  | { outcome: 'executed'; threadRef: string; state: PaState; decidedBy: string }
  | {
      outcome: 'not-advanced';
      threadRef: string;
      state: PaState;
      decidedBy: string;
      transitionError: string;
    }
  | { outcome: 'rejected'; threadRef: string; state: PaState; decidedBy: string };

/** Injected effects for the PA workflow (deterministic; mockable). */
export interface PaDeps {
  /** Prepare the DTR questionnaire (a `dtr.generate` tool call, mockable). */
  generateDtr(task: PaTask): Promise<{ questionnaireRef: string }>;
  /** Append the prepared documentation as evidence (an `evidence.append` tool call). */
  appendEvidence(task: PaTask): Promise<{ evidenceRef: string }>;
}

/**
 * Raised when the PA agent is asked to apply an AUTHORITATIVE PA event. The agent
 * has no authority to set Approved/Denied; only the state machine does, and only
 * from a payer `ClaimResponse` (`claim-response`). This is the guardrail as code.
 */
export class AgentAuthorityError extends Error {
  constructor(public readonly eventType: string) {
    super(
      `pa-documentation-agent may not apply the authoritative PA event "${eventType}"; ` +
        `only a payer ClaimResponse (claim-response), applied by the paMachine, sets Approved/Denied`
    );
    this.name = 'AgentAuthorityError';
  }
}

/** The single authoritative PA event the agent may NEVER apply. */
export const AUTHORITATIVE_PA_EVENTS: ReadonlyArray<PaEvent['type']> = ['claim-response'];

/** Guardrail: refuse any authoritative PA event; the state machine owns those. */
export function assertAgentPaEventAllowed(event: PaEvent): void {
  if (AUTHORITATIVE_PA_EVENTS.includes(event.type)) throw new AgentAuthorityError(event.type);
}
