import { describe, it, expect } from 'vitest';
// Companion to domainNamespaceIntegrity.test.ts (kept separate for the ≤500-line
// test cap): the DOMAIN NAMESPACE PINNING test (L3, F-C1 lesson) for the two
// Iteration-6 wave-A domains — care-team and goals-tasks. Import from the EXACT
// pinned module paths (the import itself pins the paths), then assert every surface
// (adapter, mapping, BOTH registries) agrees on domain id, node kinds, edge types.
import { careTeamAdapter } from '@/lib/pipeline/adapters/careTeam';
import {
  careteamSpec,
  CARE_TEAM_DOMAIN,
  CARE_TEAM_KIND,
  CARE_TEAM_MEMBER_KIND,
  PRACTITIONER_KIND,
  CARE_TEAM_FOR,
  MEMBER_OF_CARE_TEAM,
  HAS_CARE_TEAM,
} from '@/lib/graph/mapping/careteam';
import { goalTaskAdapter } from '@/lib/pipeline/adapters/goalTask';
import {
  goalTaskSpec,
  GOAL_TASK_DOMAIN,
  GOAL_KIND,
  TASK_KIND,
  HAS_GOAL,
  HAS_TASK,
} from '@/lib/graph/mapping/goalTask';
import { behavioralHealthAdapter } from '@/lib/pipeline/adapters/behavioralHealth';
import {
  behavioralHealthSpec,
  BEHAVIORAL_HEALTH_DOMAIN,
  CONDITION_KIND,
  HAS_CONDITION,
} from '@/lib/graph/mapping/behavioralHealth';
import { MAPPING_SPECS, specFor, projectEvent, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import { batchStep, defaultPipelineDeps, landStage, type PipelineDeps } from '@/lib/pipeline';
import type { C2Event } from '@/lib/outbox';
import careTeam from './fixtures/careTeam.json';
import goalTask from './fixtures/goalTask.json';
import behavioralHealth from './fixtures/behavioralHealth.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

// ─── care-team (wave A, now a pipeline domain) ────────────────────────────────
const CARE_TEAM_PINNED = {
  domain: 'care-team',
  nodeKinds: { team: 'CareTeam', member: 'CareTeamMember', practitioner: 'Practitioner' },
  edgeTypes: { forMember: 'CARE_TEAM_FOR', memberOf: 'MEMBER_OF_CARE_TEAM', hasTeam: 'HAS_CARE_TEAM' },
  eventTypes: ['care-team.formed'] as const,
} as const;

describe('domain namespace integrity — care-team', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(CARE_TEAM_DOMAIN).toBe(CARE_TEAM_PINNED.domain);
    expect(CARE_TEAM_KIND).toBe(CARE_TEAM_PINNED.nodeKinds.team);
    expect(CARE_TEAM_MEMBER_KIND).toBe(CARE_TEAM_PINNED.nodeKinds.member);
    expect(PRACTITIONER_KIND).toBe(CARE_TEAM_PINNED.nodeKinds.practitioner);
    expect(CARE_TEAM_FOR).toBe(CARE_TEAM_PINNED.edgeTypes.forMember);
    expect(MEMBER_OF_CARE_TEAM).toBe(CARE_TEAM_PINNED.edgeTypes.memberOf);
    expect(HAS_CARE_TEAM).toBe(CARE_TEAM_PINNED.edgeTypes.hasTeam);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(careTeamAdapter.domain).toBe(CARE_TEAM_PINNED.domain);
    expect(careteamSpec.domain).toBe(CARE_TEAM_PINNED.domain);
    expect(careteamSpec.domain).toBe(CARE_TEAM_DOMAIN);
  });

  it('both registries carry the care-team surfaces', () => {
    expect(MAPPING_SPECS).toContain(careteamSpec);
    for (const et of CARE_TEAM_PINNED.eventTypes) expect(specFor(et)).toBe(careteamSpec);
    expect(careTeamAdapter.format).toBe('fhir-json');
    expect(careTeamAdapter.arrivalMode).toBe('batch');
  });

  it('the extended spec still owns the Iteration-2 demo events (lens unbroken)', () => {
    // Both the pipeline event and the pre-existing demo events resolve to this spec.
    expect(specFor('careteam.assigned')).toBe(careteamSpec);
    expect(specFor('careteam.unassigned')).toBe(careteamSpec);
    expect(specFor('care-team.formed')).toBe(careteamSpec);
  });

  it('every eventType the adapter emits is claimed by exactly the care-team spec', () => {
    const landed = landStage.run(
      { source: careTeamAdapter.source, format: 'fhir-json', payload: careTeam.payload },
      deps,
    );
    const records = batchStep(careTeamAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(CARE_TEAM_PINNED.domain);
      expect(specFor(r.eventType)).toBe(careteamSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...CARE_TEAM_PINNED.eventTypes].sort());
  });

  it('the mapping projects the pinned node kinds + edge types (CareTeam + roster)', () => {
    const formed = ev('care-team.formed', {
      careTeamRef: 'CareTeam/ct-1', status: 'active', category: 'longitudinal',
      periodStart: '2026-03-01', periodEnd: null,
      participants: [
        { participantRef: 'Practitioner/prac-1', kind: 'Practitioner', role: 'pcp' },
        { participantRef: 'CareManager/cm-1', kind: 'CareTeamMember', role: 'care-manager' },
      ],
    });
    const nodeKinds = projectEvent(formed, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const edgeTypes = projectEvent(formed, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(nodeKinds).toContain(CARE_TEAM_KIND);
    expect(nodeKinds).toContain(CARE_TEAM_MEMBER_KIND);
    expect(nodeKinds).toContain(PRACTITIONER_KIND);
    expect(edgeTypes).toContain(CARE_TEAM_FOR);
    expect(edgeTypes).toContain(MEMBER_OF_CARE_TEAM);
    expect(edgeTypes).toContain(HAS_CARE_TEAM);
  });
});

// ─── goals-tasks (wave A) ─────────────────────────────────────────────────────
const GOAL_TASK_PINNED = {
  domain: 'goals-tasks',
  nodeKinds: { goal: 'Goal', task: 'Task' },
  edgeTypes: { hasGoal: 'HAS_GOAL', hasTask: 'HAS_TASK' },
  eventTypes: ['goal.recorded', 'task.recorded'] as const,
} as const;

describe('domain namespace integrity — goals-tasks', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(GOAL_TASK_DOMAIN).toBe(GOAL_TASK_PINNED.domain);
    expect(GOAL_KIND).toBe(GOAL_TASK_PINNED.nodeKinds.goal);
    expect(TASK_KIND).toBe(GOAL_TASK_PINNED.nodeKinds.task);
    expect(HAS_GOAL).toBe(GOAL_TASK_PINNED.edgeTypes.hasGoal);
    expect(HAS_TASK).toBe(GOAL_TASK_PINNED.edgeTypes.hasTask);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(goalTaskAdapter.domain).toBe(GOAL_TASK_PINNED.domain);
    expect(goalTaskSpec.domain).toBe(GOAL_TASK_PINNED.domain);
    expect(goalTaskSpec.domain).toBe(GOAL_TASK_DOMAIN);
  });

  it('both registries carry the goals-tasks surfaces', () => {
    expect(MAPPING_SPECS).toContain(goalTaskSpec);
    for (const et of GOAL_TASK_PINNED.eventTypes) expect(specFor(et)).toBe(goalTaskSpec);
    expect(goalTaskAdapter.format).toBe('fhir-json');
    expect(goalTaskAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the goals-tasks spec', () => {
    const landed = landStage.run(
      { source: goalTaskAdapter.source, format: 'fhir-json', payload: goalTask.payload },
      deps,
    );
    const records = batchStep(goalTaskAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(GOAL_TASK_PINNED.domain);
      expect(specFor(r.eventType)).toBe(goalTaskSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...GOAL_TASK_PINNED.eventTypes].sort());
  });

  it('the mapping projects Goal via HAS_GOAL and Task via HAS_TASK (Goal- or Member-anchored)', () => {
    const goal = ev('goal.recorded', { goalRef: 'Goal/g-1', code: '443402002', startDate: '2026-02-01' });
    expect(projectEvent(goal, deps).filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind)).toContain(GOAL_KIND);
    expect(projectEvent(goal, deps).filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type)).toEqual([HAS_GOAL]);

    const taskOnGoal = ev('task.recorded', { taskRef: 'Task/t-1', code: 'schedule-visit', goalRef: 'Goal/g-1', authoredOn: '2026-02-05' });
    const onGoalEdge = projectEvent(taskOnGoal, deps).filter((m): m is UpsertEdge => m.op === 'UpsertEdge').find((m) => m.type === HAS_TASK)!;
    expect(onGoalEdge.from).toEqual({ kind: GOAL_KIND, key: 'Goal/g-1' });

    const taskOnMember = ev('task.recorded', { taskRef: 'Task/t-2', code: 'outreach', goalRef: '', authoredOn: '2026-02-10' });
    const onMemberEdge = projectEvent(taskOnMember, deps).filter((m): m is UpsertEdge => m.op === 'UpsertEdge').find((m) => m.type === HAS_TASK)!;
    expect(onMemberEdge.from).toEqual({ kind: 'Member', key: 'M1' });
  });
});

// ─── behavioral-health (wave A, Iteration 7 — the F2 Part 2 domain) ───────────
const BEHAVIORAL_HEALTH_PINNED = {
  domain: 'behavioral-health',
  nodeKinds: { condition: 'Condition' },
  edgeTypes: { hasCondition: 'HAS_CONDITION' },
  eventTypes: ['behavioral-health.condition-recorded'] as const,
} as const;

describe('domain namespace integrity — behavioral-health', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(BEHAVIORAL_HEALTH_DOMAIN).toBe(BEHAVIORAL_HEALTH_PINNED.domain);
    expect(CONDITION_KIND).toBe(BEHAVIORAL_HEALTH_PINNED.nodeKinds.condition);
    expect(HAS_CONDITION).toBe(BEHAVIORAL_HEALTH_PINNED.edgeTypes.hasCondition);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(behavioralHealthAdapter.domain).toBe(BEHAVIORAL_HEALTH_PINNED.domain);
    expect(behavioralHealthSpec.domain).toBe(BEHAVIORAL_HEALTH_PINNED.domain);
    expect(behavioralHealthSpec.domain).toBe(BEHAVIORAL_HEALTH_DOMAIN);
  });

  it('both registries carry the behavioral-health surfaces', () => {
    expect(MAPPING_SPECS).toContain(behavioralHealthSpec);
    for (const et of BEHAVIORAL_HEALTH_PINNED.eventTypes) expect(specFor(et)).toBe(behavioralHealthSpec);
    expect(behavioralHealthAdapter.format).toBe('fhir-json');
    expect(behavioralHealthAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the behavioral-health spec', () => {
    const landed = landStage.run(
      { source: behavioralHealthAdapter.source, format: 'fhir-json', payload: behavioralHealth.payload },
      deps,
    );
    const records = batchStep(behavioralHealthAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(BEHAVIORAL_HEALTH_PINNED.domain);
      expect(specFor(r.eventType)).toBe(behavioralHealthSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...BEHAVIORAL_HEALTH_PINNED.eventTypes].sort());
  });

  it('the mapping projects Condition via HAS_CONDITION, and the Part 2 subset is restricted', () => {
    const plain = ev('behavioral-health.condition-recorded', {
      conditionRef: 'Condition/c-1', code: { code: 'F32.1' }, recordedDate: '2026-04-03',
    });
    expect(projectEvent(plain, deps).filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind)).toContain(CONDITION_KIND);
    expect(projectEvent(plain, deps).filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type)).toEqual([HAS_CONDITION]);
    // A Part 2-labeled envelope makes the same node kind project as RESTRICTED.
    const restricted: C2Event = {
      ...ev('behavioral-health.condition-recorded', { conditionRef: 'Condition/c-2', code: { code: 'F11.20' }, recordedDate: '2026-04-01' }),
      consentContext: { part2Restricted: true, segmentLabels: ['42-CFR-Part-2'] },
    };
    const cond = projectEvent(restricted, deps).find((m): m is UpsertNode => m.op === 'UpsertNode' && m.kind === CONDITION_KIND)!;
    expect(cond.restricted).toBe(true);
  });
});

/** Minimal C2 event for the projector-surface pinning assertions. */
function ev(eventType: string, payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType, eventVersion: '1.0',
    occurredAt: '2026-05-01T00:00:00Z', recordedAt: '2026-05-01T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { system: 'care-hub', feed: 'care-team-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
