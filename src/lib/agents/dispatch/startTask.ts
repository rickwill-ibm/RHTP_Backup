// CONTRACT: C-DISCLOSURE
/**
 * Running a dispatched task on the runtime — the workflow-per-kind half of dispatch.
 *
 * Split out of `dispatcher.ts` by responsibility (conventions §2), the same way
 * `routingSchema.ts` (parsing) and `dispatchTasks.ts` (task construction) were: that
 * file DECIDES which agent receives a signal, this one STARTS the work. It was also the
 * §2 size cap forcing the issue — `dispatcher.ts` reached 419 lines against a 400 cap
 * and `check-file-sizes.sh` exited 1, so `npm run check:all` failed at its second rung.
 *
 * INVARIANT: starting is TOTAL over `AgentTaskKind` and there is no default workflow.
 *            Every kind is started on its own declared workflow or refused with a coded
 *            `AgentRoutingError`; nothing falls through to another agent.
 */
import type { WorkflowDefinition, WorkflowEngine, WorkflowHandle } from '@/lib/agentRuntime';
import { createOutreachWorkflow, type OutreachResult } from '@/lib/agents/outreach';
import { createReferralWorkflow, type ReferralResult } from '@/lib/agents/referral';
import { createPaWorkflow, type PaResult } from '@/lib/agents/pa';
import {
  AgentRoutingError,
  type AgentTaskKind,
  type AgentTaskPayload,
  type DispatchedTask,
} from './types';

/** The result each kind's workflow settles to; the sibling of `AgentTaskPayload`. */
interface AgentResultPayload {
  outreach: OutreachResult;
  referral: ReferralResult;
  pa: PaResult;
}

/**
 * INVARIANT: mapped over `AgentTaskKind`, so a new kind makes this type demand a
 * workflow and `defaultAgentWorkflows` fail to satisfy it — rather than the old
 * hand-written three keys, which a new kind left silently complete.
 */
export type AgentWorkflows = {
  [K in AgentTaskKind]: WorkflowDefinition<AgentTaskPayload[K], AgentResultPayload[K]>;
};

/** Assemble the default agent workflows (mock deps). */
export function defaultAgentWorkflows(): AgentWorkflows {
  return {
    outreach: createOutreachWorkflow(),
    referral: createReferralWorkflow(),
    pa: createPaWorkflow(),
  };
}

/**
 * Start ONE dispatched task on the workflow its kind names — totally and explicitly.
 *
 * THE DEFECT THIS CLOSES. This was three `if`s and a bare
 * `return engine.start(workflows.pa, …)`, so EVERY taskKind that was not `outreach` or
 * `referral` ran as the PRIOR-AUTHORISATION agent. Adding any routed agent with a new
 * kind therefore silently made it the PA agent — which is why `bh-screening-triage-agent`
 * shipped with `routes: []`. A behavioural-health triage item dispatched to an
 * appeal-documentation agent is not a mislabel; it is the wrong agent acting on a
 * member's mental-health signal.
 *
 * SCOPE: PA appeal-documentation IS in scope — the `pa` route is live and dispatches on
 * every demo run. An earlier version of this note claimed it was withdrawn; that was
 * false (coalition-log.md, Wave 0, PA scope ruling).
 *
 * `const unhandled: never = t` is the compile-time half — widen `DispatchedTask` and
 * THIS LINE fails `tsc --noEmit`, so a new kind cannot reach a fallback. The throw is the
 * runtime half, for a task assembled by an untyped caller or from a `routing` object that
 * never went through `parseAgentRouting`. The per-kind `case` also narrows `t.task`, so
 * the three `as StartOptions<…>` casts that used to launder the task type are gone.
 */
function startTask(
  engine: WorkflowEngine,
  t: DispatchedTask,
  workflows: AgentWorkflows
): WorkflowHandle {
  switch (t.taskKind) {
    case 'outreach':
      return engine.start(workflows.outreach, { memberId: t.memberId, input: t.task });
    case 'referral':
      return engine.start(workflows.referral, { memberId: t.memberId, input: t.task });
    case 'pa':
      return engine.start(workflows.pa, { memberId: t.memberId, input: t.task });
    default: {
      const unhandled: never = t;
      const bad = unhandled as DispatchedTask;
      throw new AgentRoutingError(
        `routes.${bad.routeId}.taskKind`,
        `"${String(bad.taskKind)}" has no declared workflow: dispatch refuses rather than ` +
          'starting another agent — the default here ran every unrecognised kind as the ' +
          'prior-authorisation agent'
      );
    }
  }
}

/**
 * Start each dispatched task on the runtime with its agent workflow. The engine
 * partitions by memberId, so per-member start order (hence event order) is preserved.
 */
export function runDispatch(
  engine: WorkflowEngine,
  tasks: DispatchedTask[],
  workflows: AgentWorkflows = defaultAgentWorkflows()
): WorkflowHandle[] {
  return tasks.map((t) => startTask(engine, t, workflows));
}
