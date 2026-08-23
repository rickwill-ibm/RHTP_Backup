/**
 * Goal ACHIEVEMENT status (iter11 wave C).
 *
 * Proves: a Goal carries lifecycleStatus (proposed -> active -> completed | cancelled),
 * achievementStatus (in-progress / achieved / not-achieved), and a target, so a goal
 * can be MET (lifecycle completed AND achievement achieved); the Task.focus -> Goal
 * linkage is intact; and E9 holds — a missing status never silently marks a goal met.
 */
import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import { projectEvent, type Mutation, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import {
  GOAL_LIFECYCLE_STATUSES,
  GOAL_ACHIEVEMENT_STATUSES,
  isGoalMet,
} from '@/lib/graph/mapping/goalTask';
import { c2, fixedNow } from '../graph/helpers';

const deps = { now: fixedNow };

function goalNode(muts: Mutation[]): UpsertNode {
  return muts.find((m): m is UpsertNode => m.op === 'UpsertNode' && m.kind === 'Goal')!;
}
function edges(muts: Mutation[]): UpsertEdge[] {
  return muts.filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
}

function goal(payload: Record<string, unknown>, memberId = 'M1'): C2Event {
  return c2({
    eventId: `${memberId}-g1`, eventType: 'goal.recorded', memberId,
    occurredAt: '2026-02-01T00:00:00Z',
    payload: { goalRef: `Goal/${memberId}-g1`, code: '443402002', startDate: '2026-02-01', dueDate: '2026-08-01', ...payload },
  });
}
function task(payload: Record<string, unknown>, memberId = 'M1'): C2Event {
  return c2({
    eventId: `${memberId}-t1`, eventType: 'task.recorded', memberId,
    occurredAt: '2026-02-05T00:00:00Z',
    payload: { taskRef: `Task/${memberId}-t1`, code: 'schedule-visit', authoredOn: '2026-02-05', ...payload },
  });
}

describe('a Goal carries lifecycle + achievement + target so it can be MET', () => {
  it('a completed + achieved goal (with its target) is MET', () => {
    const props = goalNode(projectEvent(goal({
      lifecycleStatus: 'completed', achievementStatus: 'achieved', target: 'HbA1c < 7.0',
    }), deps)).properties;
    expect(props).toMatchObject({
      lifecycleStatus: 'completed', achievementStatus: 'achieved', target: 'HbA1c < 7.0', met: true,
    });
  });

  it('completed but not-achieved is NOT met (the goal closed without success)', () => {
    const props = goalNode(projectEvent(goal({ lifecycleStatus: 'completed', achievementStatus: 'not-achieved' }), deps)).properties;
    expect(props.met).toBe(false);
  });

  it('active + in-progress is NOT met (still being worked)', () => {
    const props = goalNode(projectEvent(goal({ lifecycleStatus: 'active', achievementStatus: 'in-progress' }), deps)).properties;
    expect(props.met).toBe(false);
  });

  it('met requires BOTH completed lifecycle AND achieved achievement (isGoalMet)', () => {
    expect(isGoalMet('completed', 'achieved')).toBe(true);
    expect(isGoalMet('completed', 'in-progress')).toBe(false);
    expect(isGoalMet('active', 'achieved')).toBe(false);
    expect(isGoalMet('cancelled', 'not-achieved')).toBe(false);
    // The modelled vocabularies.
    expect([...GOAL_LIFECYCLE_STATUSES]).toEqual(['proposed', 'active', 'completed', 'cancelled']);
    expect([...GOAL_ACHIEVEMENT_STATUSES]).toEqual(['in-progress', 'achieved', 'not-achieved']);
  });
});

describe('E9: a status default must not silently mark a goal met', () => {
  it('a goal with NO lifecycle/achievement defaults to the OPEN states and is not met', () => {
    const props = goalNode(projectEvent(goal({}), deps)).properties;
    expect(props.lifecycleStatus).toBe('active');      // not 'completed'
    expect(props.achievementStatus).toBe('in-progress'); // not 'achieved'
    expect(props.met).toBe(false);
    expect(props.target).toBe('');
  });
});

describe('the Task.focus -> Goal linkage is preserved alongside status', () => {
  it('a task that references its goal (Task.focus) attaches HAS_TASK from the Goal', () => {
    const onGoal = edges(projectEvent(task({ goalRef: 'Goal/M1-g1' }), deps)).find((e) => e.type === 'HAS_TASK')!;
    expect(onGoal.from).toEqual({ kind: 'Goal', key: 'Goal/M1-g1' });
    expect(onGoal.to).toEqual({ kind: 'Task', key: 'Task/M1-t1' });
  });

  it('a free-standing task (no focus) attaches HAS_TASK from the Member', () => {
    const onMember = edges(projectEvent(task({ goalRef: '' }), deps)).find((e) => e.type === 'HAS_TASK')!;
    expect(onMember.from).toEqual({ kind: 'Member', key: 'M1' });
  });
});
