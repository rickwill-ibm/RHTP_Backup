'use client';
// Workflow State Machine — tracks multi-step workflow progression per patient per action type
// Provides React context + hooks for workflow state across all screens.

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type {
  WorkflowType,
  WorkflowState,
  WorkflowStepRecord,
  WorkflowStatus,
} from './actionRegistry';
import { workflowDefinitions } from './actionRegistry';
import type { UserRole } from './mockData';
import * as clock from './clock'; // determinism seam (Cycle 1)

// ─── State Shape ──────────────────────────────────────────────────────────────
interface WorkflowMachineState {
  // Key: `${workflowType}:${entityId}`
  workflows: Record<string, WorkflowState>;
}

// ─── Actions ──────────────────────────────────────────────────────────────────
type WorkflowAction =
  | {
      type: 'START_WORKFLOW';
      payload: {
        workflowType: WorkflowType;
        entityId: string;
        startedBy: string;
        startedByRole: UserRole;
      };
    }
  | {
      type: 'ADVANCE_STEP';
      payload: {
        workflowType: WorkflowType;
        entityId: string;
        completedBy: string;
        completedByRole: UserRole;
        notes?: string;
      };
    }
  | {
      type: 'COMPLETE_WORKFLOW';
      payload: {
        workflowType: WorkflowType;
        entityId: string;
        completedBy: string;
        completedByRole: UserRole;
        notes?: string;
      };
    }
  | {
      type: 'REJECT_WORKFLOW';
      payload: {
        workflowType: WorkflowType;
        entityId: string;
        rejectedBy: string;
        rejectedByRole: UserRole;
        notes?: string;
      };
    }
  | { type: 'RESET_WORKFLOW'; payload: { workflowType: WorkflowType; entityId: string } };

// ─── Reducer ──────────────────────────────────────────────────────────────────
function workflowKey(workflowType: WorkflowType, entityId: string): string {
  return `${workflowType}:${entityId}`;
}

function workflowReducer(
  state: WorkflowMachineState,
  action: WorkflowAction
): WorkflowMachineState {
  switch (action.type) {
    case 'START_WORKFLOW': {
      const { workflowType, entityId, startedBy, startedByRole } = action.payload;
      const def = workflowDefinitions[workflowType];
      const key = workflowKey(workflowType, entityId);
      const now = clock.nowIso();
      return {
        ...state,
        workflows: {
          ...state.workflows,
          [key]: {
            workflowType,
            entityId,
            currentStep: 1,
            totalSteps: def.steps.length,
            status: 'in-progress',
            startedAt: now,
            startedBy,
            startedByRole,
            lastUpdatedAt: now,
            stepHistory: [],
          },
        },
      };
    }

    case 'ADVANCE_STEP': {
      const { workflowType, entityId, completedBy, completedByRole, notes } = action.payload;
      const key = workflowKey(workflowType, entityId);
      const existing = state.workflows[key];
      if (!existing) return state;
      const def = workflowDefinitions[workflowType];
      const now = clock.nowIso();
      const completedStep = def.steps.find((s) => s.step === existing.currentStep);
      const stepRecord: WorkflowStepRecord = {
        step: existing.currentStep,
        label: completedStep?.label ?? `Step ${existing.currentStep}`,
        completedAt: now,
        completedBy,
        completedByRole,
        notes,
      };
      const nextStep = existing.currentStep + 1;
      const isLast = nextStep > existing.totalSteps;
      return {
        ...state,
        workflows: {
          ...state.workflows,
          [key]: {
            ...existing,
            currentStep: isLast ? existing.currentStep : nextStep,
            status: isLast ? 'awaiting-review' : 'in-progress',
            lastUpdatedAt: now,
            stepHistory: [...existing.stepHistory, stepRecord],
          },
        },
      };
    }

    case 'COMPLETE_WORKFLOW': {
      const { workflowType, entityId, completedBy, completedByRole, notes } = action.payload;
      const key = workflowKey(workflowType, entityId);
      const existing = state.workflows[key];
      if (!existing) return state;
      const def = workflowDefinitions[workflowType];
      const now = clock.nowIso();
      const completedStep = def.steps.find((s) => s.step === existing.currentStep);
      const stepRecord: WorkflowStepRecord = {
        step: existing.currentStep,
        label: completedStep?.label ?? `Step ${existing.currentStep}`,
        completedAt: now,
        completedBy,
        completedByRole,
        notes,
      };
      return {
        ...state,
        workflows: {
          ...state.workflows,
          [key]: {
            ...existing,
            status: 'completed',
            lastUpdatedAt: now,
            stepHistory: [...existing.stepHistory, stepRecord],
          },
        },
      };
    }

    case 'REJECT_WORKFLOW': {
      const { workflowType, entityId, rejectedBy, rejectedByRole, notes } = action.payload;
      const key = workflowKey(workflowType, entityId);
      const existing = state.workflows[key];
      if (!existing) return state;
      const now = clock.nowIso();
      const stepRecord: WorkflowStepRecord = {
        step: existing.currentStep,
        label: 'Rejected',
        completedAt: now,
        completedBy: rejectedBy,
        completedByRole: rejectedByRole,
        notes,
      };
      return {
        ...state,
        workflows: {
          ...state.workflows,
          [key]: {
            ...existing,
            status: 'rejected',
            lastUpdatedAt: now,
            stepHistory: [...existing.stepHistory, stepRecord],
          },
        },
      };
    }

    case 'RESET_WORKFLOW': {
      const { workflowType, entityId } = action.payload;
      const key = workflowKey(workflowType, entityId);
      const next = { ...state.workflows };
      delete next[key];
      return { ...state, workflows: next };
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface WorkflowMachineContextValue {
  workflows: Record<string, WorkflowState>;
  getWorkflow: (workflowType: WorkflowType, entityId: string) => WorkflowState | undefined;
  getWorkflowStatus: (workflowType: WorkflowType, entityId: string) => WorkflowStatus | 'idle';
  getWorkflowProgress: (
    workflowType: WorkflowType,
    entityId: string
  ) => { current: number; total: number; pct: number };
  startWorkflow: (
    workflowType: WorkflowType,
    entityId: string,
    startedBy: string,
    startedByRole: UserRole
  ) => void;
  advanceStep: (
    workflowType: WorkflowType,
    entityId: string,
    completedBy: string,
    completedByRole: UserRole,
    notes?: string
  ) => void;
  completeWorkflow: (
    workflowType: WorkflowType,
    entityId: string,
    completedBy: string,
    completedByRole: UserRole,
    notes?: string
  ) => void;
  rejectWorkflow: (
    workflowType: WorkflowType,
    entityId: string,
    rejectedBy: string,
    rejectedByRole: UserRole,
    notes?: string
  ) => void;
  resetWorkflow: (workflowType: WorkflowType, entityId: string) => void;
}

const WorkflowMachineContext = createContext<WorkflowMachineContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function WorkflowMachineProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, { workflows: {} });

  const getWorkflow = useCallback(
    (workflowType: WorkflowType, entityId: string) =>
      state.workflows[workflowKey(workflowType, entityId)],
    [state.workflows]
  );

  const getWorkflowStatus = useCallback(
    (workflowType: WorkflowType, entityId: string): WorkflowStatus | 'idle' =>
      state.workflows[workflowKey(workflowType, entityId)]?.status ?? 'idle',
    [state.workflows]
  );

  const getWorkflowProgress = useCallback(
    (workflowType: WorkflowType, entityId: string) => {
      const wf = state.workflows[workflowKey(workflowType, entityId)];
      if (!wf) return { current: 0, total: workflowDefinitions[workflowType].steps.length, pct: 0 };
      const pct = Math.round((wf.currentStep / wf.totalSteps) * 100);
      return { current: wf.currentStep, total: wf.totalSteps, pct };
    },
    [state.workflows]
  );

  const startWorkflow = useCallback(
    (workflowType: WorkflowType, entityId: string, startedBy: string, startedByRole: UserRole) =>
      dispatch({
        type: 'START_WORKFLOW',
        payload: { workflowType, entityId, startedBy, startedByRole },
      }),
    []
  );

  const advanceStep = useCallback(
    (
      workflowType: WorkflowType,
      entityId: string,
      completedBy: string,
      completedByRole: UserRole,
      notes?: string
    ) =>
      dispatch({
        type: 'ADVANCE_STEP',
        payload: { workflowType, entityId, completedBy, completedByRole, notes },
      }),
    []
  );

  const completeWorkflow = useCallback(
    (
      workflowType: WorkflowType,
      entityId: string,
      completedBy: string,
      completedByRole: UserRole,
      notes?: string
    ) =>
      dispatch({
        type: 'COMPLETE_WORKFLOW',
        payload: { workflowType, entityId, completedBy, completedByRole, notes },
      }),
    []
  );

  const rejectWorkflow = useCallback(
    (
      workflowType: WorkflowType,
      entityId: string,
      rejectedBy: string,
      rejectedByRole: UserRole,
      notes?: string
    ) =>
      dispatch({
        type: 'REJECT_WORKFLOW',
        payload: { workflowType, entityId, rejectedBy, rejectedByRole, notes },
      }),
    []
  );

  const resetWorkflow = useCallback(
    (workflowType: WorkflowType, entityId: string) =>
      dispatch({ type: 'RESET_WORKFLOW', payload: { workflowType, entityId } }),
    []
  );

  return (
    <WorkflowMachineContext.Provider
      value={{
        workflows: state.workflows,
        getWorkflow,
        getWorkflowStatus,
        getWorkflowProgress,
        startWorkflow,
        advanceStep,
        completeWorkflow,
        rejectWorkflow,
        resetWorkflow,
      }}
    >
      {children}
    </WorkflowMachineContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWorkflowMachine() {
  const ctx = useContext(WorkflowMachineContext);
  if (!ctx) throw new Error('useWorkflowMachine must be used within WorkflowMachineProvider');
  return ctx;
}
