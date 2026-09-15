// SEAM: agentRuntime  (dataMode)
/**
 * Agent demo seam. Mirrors the SDE demo seam: in mock mode `getAgentDemoActions()`
 * returns the demo's AUTHORED agent actions (the hardcoded page stays green); in
 * production mode it runs the REAL agents via the runtime over the seeded SDE demo
 * batch (SDE dispositions -> dispatcher -> agents -> HITL auto-approved -> executed),
 * projecting the resulting executed/rejected/suppressed actions into the same shape.
 *
 * The action shape is EMERGENT from the runtime in production mode, never authored.
 */
import { agentRuntimeMode, createRuntime, type WorkflowHandle } from '@/lib/agentRuntime';
import { loadDemoBatch, runRealDemo } from '@/lib/sde';
import { routeBatch, runDispatch, type DispatchedTask } from '@/lib/agents/dispatch';
import authoredJson from './authored-agent-actions.json';

/** One PHI-safe agent action row for the demo screen. */
export interface AgentDemoAction {
  agentId: string;
  taskKind: string;
  actionType: string;
  memberId: string;
  outcome: 'executed' | 'rejected' | 'suppressed';
  refs: Record<string, string>;
}

/** The authored demo actions (mock mode) — the reference the demo screen renders. */
export function authoredAgentActions(): AgentDemoAction[] {
  return (authoredJson as unknown as { actions: AgentDemoAction[] }).actions;
}

/**
 * The `agentRuntime` dataMode seam: mock/seeded returns authored actions;
 * production runs the real agents. Async because the runtime is async.
 */
export async function getAgentDemoActions(): Promise<{ actions: AgentDemoAction[]; mode: string }> {
  const mode = agentRuntimeMode();
  if (mode === 'production') return { actions: await runRealAgentDemo(), mode };
  return { actions: authoredAgentActions(), mode };
}

/** Approve every pending proposal until all workflows settle (demo driver). */
async function driveAutoApprove(
  engine: ReturnType<typeof createRuntime>['engine'],
  handles: WorkflowHandle[]
): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    let acted = false;
    for (const h of handles) {
      const snap = engine.query(h.workflowId);
      if (snap?.status === 'waiting-decision' && snap.awaitingProposalId) {
        await engine.signal(h.workflowId, {
          name: 'agent.task.approved',
          proposalId: snap.awaitingProposalId,
          decidedBy: 'demo-reviewer',
        });
        acted = true;
      }
    }
    await Promise.resolve();
    const allSettled = handles.every((h) => {
      const s = engine.query(h.workflowId)?.status;
      return s === 'completed' || s === 'failed';
    });
    if (!acted && allSettled) break;
  }
}

/** Project a settled task result into the PHI-safe demo-action shape. */
function projectResult(task: DispatchedTask, result: unknown): AgentDemoAction {
  const r = result as { outcome?: string };
  const outcome = (
    r.outcome === 'executed' || r.outcome === 'rejected' || r.outcome === 'suppressed'
      ? r.outcome
      : 'executed'
  ) as AgentDemoAction['outcome'];
  const actionType =
    task.taskKind === 'outreach'
      ? 'send-outreach'
      : task.taskKind === 'referral'
        ? 'referral-followup'
        : 'advance-pa-documentation';
  const refs: Record<string, string> =
    task.taskKind === 'outreach'
      ? { touchpoint: task.task.touchpoint.touchpointId, channel: task.task.touchpoint.channel }
      : task.taskKind === 'referral'
        ? { referral: task.task.referralRef }
        : { thread: task.task.threadRef, event: task.task.advanceEvent.type };
  return {
    agentId: task.agentId,
    taskKind: task.taskKind,
    actionType,
    memberId: task.memberId,
    outcome,
    refs,
  };
}

/** Run the real agents over the seeded SDE demo batch and return the emergent actions. */
export async function runRealAgentDemo(): Promise<AgentDemoAction[]> {
  const demo = loadDemoBatch();
  const batch = runRealDemo();
  const tasks = routeBatch({ batch, memberContext: demo.memberContext, signals: demo.signals });
  const { engine } = createRuntime();
  const handles = runDispatch(engine, tasks);
  await driveAutoApprove(engine, handles);
  const results = await Promise.all(handles.map((h) => h.done));
  return tasks.map((t, i) => projectResult(t, results[i]));
}
