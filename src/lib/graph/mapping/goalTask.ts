// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Goals/tasks mapping spec: care-planning events -> the member's goals + tasks
 * subgraph. TWO node types and two dated factual links:
 *
 *   (Member)-[:HAS_GOAL {valid from startDate}]->(Goal)              associative
 *   (Goal|Member)-[:HAS_TASK {valid from authoredOn}]->(Task)        associative
 *
 * HAS_GOAL is the factual care-plan link (associative, dated from the goal start),
 * so an asOf query can ask "what goals were active as of date X" and the
 * whole-person lens surfaces the Goal off the member. HAS_TASK attaches the Task to
 * the GOAL it advances when the source Task referenced a Goal (Task.focus), else to
 * the MEMBER directly (a free-standing task). Both are factual assignments, not
 * asserted causal claims, so both are associative. Edges are dated where the FHIR
 * resource carries a date (Goal.startDate, Task.authoredOn); absent a date the edge
 * falls back to the event time so every edge still has a validity interval.
 *
 * The pinned namespace (L3) is exported so tests/pipeline/domainNamespaceIntegrity
 * can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned goals-tasks namespace — the single source of truth the integrity test pins. */
export const GOAL_TASK_DOMAIN = 'goals-tasks';
export const GOAL_KIND = 'Goal';
export const TASK_KIND = 'Task';
export const HAS_GOAL = 'HAS_GOAL';
export const HAS_TASK = 'HAS_TASK';

/** Goal.lifecycleStatus (FHIR): proposed -> active -> completed | cancelled. */
export const GOAL_LIFECYCLE_STATUSES = ['proposed', 'active', 'completed', 'cancelled'] as const;
/** Goal.achievementStatus (FHIR): whether the goal is being / has been met. */
export const GOAL_ACHIEVEMENT_STATUSES = ['in-progress', 'achieved', 'not-achieved'] as const;

/**
 * A goal is MET only when its lifecycle has COMPLETED and its achievement is ACHIEVED.
 * E9: neither can be silently defaulted to its terminal value, so `met` is false unless
 * BOTH were explicitly asserted — a missing status never marks a goal met.
 */
export function isGoalMet(lifecycleStatus: string, achievementStatus: string): boolean {
  return lifecycleStatus === 'completed' && achievementStatus === 'achieved';
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export const goalTaskSpec = {
  domain: GOAL_TASK_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('goal.') || eventType.startsWith('task.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    return event.eventType.startsWith('task.') ? task(event, deps) : goal(event, deps);
  },
};

/** goal.recorded -> Member + Goal + dated associative HAS_GOAL. */
function goal(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const goalRef = str(p.goalRef, `Goal/${event.memberId}`);
  const start = str(p.startDate) || event.occurredAt || new Date(deps.now()).toISOString();

  // Lifecycle + achievement, so a goal can be MET. E9: defaults are the OPEN states
  // ('active' lifecycle, 'in-progress' achievement) — a missing status must never
  // silently complete or achieve a goal, so `met` is derived, not defaulted true.
  const lifecycleStatus = str(p.lifecycleStatus, 'active');
  const achievementStatus = str(p.achievementStatus, 'in-progress');
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, GOAL_KIND, goalRef, {
      code: str(p.code),
      lifecycleStatus,
      achievementStatus,
      target: str(p.target),
      met: isGoalMet(lifecycleStatus, achievementStatus),
      startDate: str(p.startDate),
      dueDate: str(p.dueDate),
    })
  );
  out.push({
    op: 'UpsertEdge',
    type: HAS_GOAL,
    from: { kind: MEMBER_KIND, key: event.memberId },
    to: { kind: GOAL_KIND, key: goalRef },
    properties: { code: str(p.code) },
    validity: { start, end: null },
    semantics: associative,
  });
  return out;
}

/** task.recorded -> Task + dated associative HAS_TASK from its Goal (or the Member). */
function task(event: C2Event, deps: ProjectorDeps): Mutation[] {
  const p = event.payload;
  const taskRef = str(p.taskRef, `Task/${event.memberId}`);
  const goalRef = str(p.goalRef);
  const start = str(p.authoredOn) || event.occurredAt || new Date(deps.now()).toISOString();
  const out: Mutation[] = [memberNode(event)];
  out.push(
    ...resourceNode(event, TASK_KIND, taskRef, {
      code: str(p.code),
      status: str(p.status, 'requested'),
      authoredOn: str(p.authoredOn),
    })
  );
  // The task advances a Goal when the source referenced one; otherwise it hangs
  // off the member directly. Either way the edge is HAS_TASK, associative, dated.
  const from = goalRef
    ? { kind: GOAL_KIND, key: goalRef }
    : { kind: MEMBER_KIND, key: event.memberId };
  out.push({
    op: 'UpsertEdge',
    type: HAS_TASK,
    from,
    to: { kind: TASK_KIND, key: taskRef },
    properties: { code: str(p.code), status: str(p.status, 'requested') },
    validity: { start, end: null },
    semantics: associative,
  });
  return out;
}
