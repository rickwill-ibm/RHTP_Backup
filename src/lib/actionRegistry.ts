import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
// Central Action Registry — role, state, and context guards for all 6 screens
// Every user-facing action in the platform is defined here with its full guard set.

export type {
  EntryContext,
  ScreenScope,
  PatientTab,
  ActionVariant,
  ActionCategory,
  StateGuard,
  ActionDefinition,
  WorkflowType,
  WorkflowStatus,
  WorkflowState,
  WorkflowStepRecord,
  WorkflowDefinition,
  WorkflowStepDefinition,
  ActionContext,
  AuditEntry,
} from './actionRegistry.types';
export { workflowDefinitions, actionRegistry } from './actionRegistry.data';

import { actionRegistry } from './actionRegistry.data';
import { workflowDefinitions } from './actionRegistry.data';
import type { ActionDefinition, ActionContext, WorkflowType, AuditEntry } from './actionRegistry.types';
import type { UserRole } from './mockData';

/**
 * Returns the filtered, ordered list of actions available for the given context.
 * Applies role, context, screen, tab, and state guards.
 */
export function getAvailableActions(ctx: ActionContext): ActionDefinition[] {
  return actionRegistry
    .filter((action) => {
      if (!action.roles.includes(ctx.role)) return false;
      if (!action.contexts.includes(ctx.entryContext)) return false;
      if (!action.screens.includes(ctx.screen)) return false;

      if (ctx.screen === 'patient-detail' && ctx.tab && action.tabs) {
        if (!action.tabs.includes(ctx.tab)) return false;
      }

      if (action.stateGuard && ctx.patientState) {
        const sg = action.stateGuard;
        const ps = ctx.patientState;

        if (sg.requiresOpenHCC && ps.openHCCSuspects === 0) return false;
        if (sg.requiresOpenGaps && ps.openCareGaps === 0) return false;
        if (sg.requiresActiveAlerts && ps.activeAlerts === 0) return false;
        if (sg.requiresConfirmedAttribution && ps.attributionStatus !== 'Confirmed') return false;

        if (sg.hccStatus && ps.hccStatuses) {
          if (!ps.hccStatuses.some((s) => sg.hccStatus!.includes(s))) return false;
        }
        if (sg.gapStatus && ps.gapStatuses) {
          if (!ps.gapStatuses.some((s) => sg.gapStatus!.includes(s))) return false;
        }
        if (sg.alertTier && ps.alertTiers) {
          if (!ps.alertTiers.some((t) => sg.alertTier!.includes(t))) return false;
        }
        if (sg.attributionStatus && ps.attributionStatus) {
          if (!sg.attributionStatus.includes(ps.attributionStatus)) return false;
        }
      }

      return true;
    })
    .sort((a, b) => a.priority - b.priority);
}

/** Returns a single action definition by ID. */
export function getActionById(id: string): ActionDefinition | undefined {
  return actionRegistry.find((a) => a.id === id);
}

/** Returns all actions for a given workflow type. */
export function getWorkflowActions(workflowType: WorkflowType): ActionDefinition[] {
  return actionRegistry.filter(
    (a) => a.initiatesWorkflow === workflowType || a.workflowStep?.workflow === workflowType
  );
}

/** Returns the next step action for a workflow given current step. */
export function getNextWorkflowAction(
  workflowType: WorkflowType,
  currentStep: number,
  role: UserRole
): ActionDefinition | undefined {
  const def = workflowDefinitions[workflowType];
  const nextStep = def.steps.find((s) => s.step === currentStep + 1 && s.requiredRole === role);
  if (!nextStep) return undefined;
  return getActionById(nextStep.actionId);
}

/** Creates a new audit entry for a performed action. */
export function createAuditEntry(
  action: ActionDefinition,
  ctx: ActionContext,
  performedBy: string,
  entityId?: string,
  entityType?: AuditEntry['entityType'],
  notes?: string
): AuditEntry {
  return {
    id: `audit-${clock.now()}-${clock.rng().toString(36).slice(2, 7)}`,
    actionId: action.id,
    auditLabel: action.auditLabel,
    entityId,
    entityType,
    performedBy,
    performedByRole: ctx.role,
    entryContext: ctx.entryContext,
    screen: ctx.screen,
    tab: ctx.tab,
    timestamp: clock.nowIso(),
    notes,
    workflowType: action.initiatesWorkflow ?? action.workflowStep?.workflow,
    workflowStep: action.workflowStep?.step,
  };
}
