// CONTRACT: C2
/**
 * PA documentation agent behavior (O-8, G4).
 *
 * Drives the existing goldenThread /prior-auth flow from thread context: prepares
 * documentation (DTR) and proposes a PA-advancement action under a human gate. On
 * approval it appends evidence and applies a NON-authoritative advancement to the
 * paMachine (documentation events, or a human-gated submit/close-gap carrying the
 * reviewer as approvedBy).
 *
 * AI GUARDRAIL: the agent NEVER sets an authoritative PA state. `claim-response`
 * (the only event that resolves Approved/Denied) is refused by
 * `assertAgentPaEventAllowed` both before proposing and at the transition tool.
 * The paMachine remains the single authority; the agent only proposes, a human
 * gates, the machine decides.
 */
import type { ProposedAction, WorkflowContext, WorkflowDefinition } from '@/lib/agentRuntime';
import { requiresHumanApproval, transition, type PaEvent } from '@/lib/workflow/paMachine';
import {
  PA_AGENT_ID,
  assertAgentPaEventAllowed,
  type PaDeps,
  type PaResult,
  type PaTask,
} from './types';

/** Build the PHI-safe PA-advancement proposal from thread context. Pure. */
export function buildPaAction(task: PaTask): ProposedAction {
  return {
    actionType: 'advance-pa-documentation',
    priority: task.priority,
    refs: { thread: task.threadRef, fromState: task.currentState, event: task.advanceEvent.type },
    summary: `PA documentation: apply "${task.advanceEvent.type}" from ${task.currentState} (human-gated)`,
  };
}

/** Attach the human approver to a human-gated event (submit / close-gap). */
function withApprover(event: PaEvent, decidedBy: string): PaEvent {
  return requiresHumanApproval(event) ? ({ ...event, approvedBy: decidedBy } as PaEvent) : event;
}

/** The default injected effects: mock DTR generation + evidence append. */
export function defaultPaDeps(): PaDeps {
  return {
    async generateDtr(task) {
      return { questionnaireRef: `dtr::${task.threadRef}` };
    },
    async appendEvidence(task) {
      return { evidenceRef: `evidence::${task.threadRef}::${task.advanceEvent.type}` };
    },
  };
}

/**
 * The PA documentation workflow, governed by the `pa-documentation-agent` manifest.
 * Flow: guardrail-check the advance event -> read thread context -> prepare DTR ->
 * propose + wait -> on approval, append evidence and apply a NON-authoritative
 * advancement to the paMachine. The agent can reach Submitted (a workflow state)
 * but NEVER Approved/Denied (only a payer claim-response does, via the machine).
 */
export function createPaWorkflow(
  deps: PaDeps = defaultPaDeps(),
): WorkflowDefinition<PaTask, PaResult> {
  return {
    name: 'pa-documentation-journey',
    agentId: PA_AGENT_ID,
    async run(ctx: WorkflowContext, task: PaTask): Promise<PaResult> {
      // Guardrail up front: the agent never proposes an authoritative PA event.
      assertAgentPaEventAllowed(task.advanceEvent);

      await ctx.useTool('person-context.read', () => task.threadRef);
      await ctx.useTool('dtr.generate', () => deps.generateDtr(task));

      const action = buildPaAction(task);
      const decision = await ctx.proposeAndWait(action);
      if (decision.decision === 'rejected') {
        return { outcome: 'rejected', threadRef: task.threadRef, state: task.currentState, decidedBy: decision.decidedBy };
      }

      // Approved: append evidence, then apply the non-authoritative advancement.
      await ctx.useTool('evidence.append', () => deps.appendEvidence(task));
      const applied = withApprover(task.advanceEvent, decision.decidedBy);
      const outcome = await ctx.useTool('pa-machine.transition', () => {
        // Defense in depth: refuse an authoritative event even here.
        assertAgentPaEventAllowed(applied);
        return transition(task.currentState, applied, task.paContext);
      });

      const result: PaResult = {
        outcome: 'executed',
        threadRef: task.threadRef,
        state: outcome.state,
        decidedBy: decision.decidedBy,
      };
      if (outcome.error) result.transitionError = outcome.error;
      return result;
    },
  };
}
