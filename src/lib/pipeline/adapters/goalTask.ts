// CONTRACT: C9  // CONTRACT: C10
/**
 * Goals/tasks FHIR-JSON adapter (arrival mode: batch). ONE care-planning feed
 * carries TWO related resource kinds — the member's Goal and the Task that works
 * toward it — so it exercises the two-node-type shape (like medications). Parses a
 * synthetic FHIR Goal + Task bundle into normalized records at tier T1:
 *   Goal -> Goal (recorded),  provenance = care-plan-goal
 *   Task -> Task (recorded),  provenance = care-plan-task
 * A Task may reference the Goal it advances (Task.focus); that reference is carried
 * on the payload so the has-task edge can attach to the Goal rather than the Member.
 * Generic over records: no member is hardcoded; the subject reference is anchored
 * through the injected identity seam, never used as the graph key (plan §1.2).
 *
 * C9.2 yield: goals/tasks feed -> goals-tasks T1 (goal + task).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One tagged FHIR resource pulled from the bundle (goal or task lane). */
interface GtResource {
  kind: 'goal' | 'task';
  resource: Record<string, unknown>;
}

/** Normalized goal payload (the Goal node's projection seed). */
export interface GoalPayload {
  goalRef: string;
  code: string;
  lifecycleStatus: string;
  startDate: string;
  dueDate: string;
}

/** Normalized task payload (the Task node's projection seed). */
export interface TaskPayload {
  taskRef: string;
  code: string;
  status: string;
  /** The Goal (or other resource) this Task advances; '' -> attaches to the Member. */
  goalRef: string;
  authoredOn: string;
}

const SOURCE = { system: 'care-plan-hub', feed: 'goals-tasks-fhir' } as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** description.coding[0].code (Goal) or code.coding[0].code (Task). */
function codeOf(container: Record<string, unknown>): string {
  const coding = obj(container).coding;
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return str(first.code);
}

/** Goal.subject / Task.for "Patient/GT-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>, field: 'subject' | 'for'): string {
  return str(obj(resource[field]).reference).split('/').pop() ?? '';
}

function parse(payload: string): RawRecord<GtResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<GtResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    const type = str(resource.resourceType);
    const id = str(resource.id) || `gt-${out.length + 1}`;
    if (type === 'Goal') out.push({ sourceRef: id, data: { kind: 'goal', resource } });
    else if (type === 'Task') out.push({ sourceRef: id, data: { kind: 'task', resource } });
  }
  return out;
}

function validate(raw: RawRecord<GtResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { kind, resource } = raw.data;
  if (kind === 'goal') {
    if (!subjectSourceId(resource, 'subject'))
      issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
    if (!codeOf(obj(resource.description)))
      issues.push({ reasonCode: 'missing-goal-code', fieldPath: 'description.coding' });
  } else {
    if (!subjectSourceId(resource, 'for'))
      issues.push({ reasonCode: 'missing-subject', fieldPath: 'for.reference' });
    if (!codeOf(obj(resource.code)))
      issues.push({ reasonCode: 'missing-task-code', fieldPath: 'code.coding' });
  }
  return { ok: issues.length === 0, issues };
}

function normalizeGoal(resource: Record<string, unknown>, deps: PipelineDeps): NormalizedRecord {
  const goalId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource, 'subject'), {
    feed: SOURCE.feed,
  });
  const goalRef = `Goal/${goalId}`;
  const startDate = str(resource.startDate);
  const target = Array.isArray(resource.target) ? obj(resource.target[0]) : {};
  const dueDate = str(target.dueDate);
  const payload: GoalPayload = {
    goalRef,
    code: codeOf(obj(resource.description)),
    lifecycleStatus: str(resource.lifecycleStatus, 'active'),
    startDate,
    dueDate,
  };
  return {
    domain: 'goals-tasks',
    memberId,
    resourceType: 'Goal',
    fhirResourceId: goalRef,
    eventType: 'goal.recorded',
    tier: 'T1',
    idempotencyKey: `gt:goal:${goalId}`,
    provenance: 'care-plan-goal',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: startDate ? `${startDate}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

function normalizeTask(resource: Record<string, unknown>, deps: PipelineDeps): NormalizedRecord {
  const taskId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource, 'for'), { feed: SOURCE.feed });
  const taskRef = `Task/${taskId}`;
  const focusRef = str(obj(resource.focus).reference);
  const goalRef = focusRef.startsWith('Goal/') ? focusRef : '';
  const authoredOn = str(resource.authoredOn);
  const payload: TaskPayload = {
    taskRef,
    code: codeOf(obj(resource.code)),
    status: str(resource.status, 'requested'),
    goalRef,
    authoredOn,
  };
  return {
    domain: 'goals-tasks',
    memberId,
    resourceType: 'Task',
    fhirResourceId: taskRef,
    eventType: 'task.recorded',
    tier: 'T1',
    idempotencyKey: `gt:task:${taskId}`,
    provenance: 'care-plan-task',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: authoredOn ? `${authoredOn}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

function normalize(raw: RawRecord<GtResource>, deps: PipelineDeps): NormalizedRecord {
  return raw.data.kind === 'goal'
    ? normalizeGoal(raw.data.resource, deps)
    : normalizeTask(raw.data.resource, deps);
}

/** The goals/tasks FHIR-JSON batch adapter (Goal + Task). */
export const goalTaskAdapter: DomainAdapter<GtResource> = {
  source: SOURCE,
  domain: 'goals-tasks',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
