// actionRegistry.types.ts — All types and interfaces for the action registry

import type { UserRole, HCCStatus, GapStatus, AlertTier, AttributionStatus } from './mockData';

// ─── Entry Context ────────────────────────────────────────────────────────────
export type EntryContext = 'cerner-launch' | 'browse';

// ─── Screen Scope ─────────────────────────────────────────────────────────────
export type ScreenScope =
  | 'contract-selection'
  | 'panel-cohort'
  | 'patient-detail'
  | 'financial-dashboard'
  | 'provider-selection'
  | 'sign-in';

// ─── Patient Tab Scope (sub-scope within patient-detail) ──────────────────────
export type PatientTab = 'risk' | 'clinical' | 'financial' | 'attribution' | 'actions';

// ─── Action Variant ───────────────────────────────────────────────────────────
export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'success';

// ─── Action Category ──────────────────────────────────────────────────────────
export type ActionCategory =
  | 'hcc'
  | 'care-gap'
  | 'utilization'
  | 'task'
  | 'attribution'
  | 'financial'
  | 'clinical'
  | 'navigation'
  | 'export'
  | 'panel';

// ─── State Guard ──────────────────────────────────────────────────────────────
export interface StateGuard {
  hccStatus?: HCCStatus[];
  gapStatus?: GapStatus[];
  attributionStatus?: AttributionStatus[];
  alertTier?: AlertTier[];
  requiresOpenHCC?: boolean;
  requiresOpenGaps?: boolean;
  requiresActiveAlerts?: boolean;
  requiresConfirmedAttribution?: boolean;
  requiresWorkflowIdle?: boolean;
  customCondition?: string;
}

// ─── Action Definition ────────────────────────────────────────────────────────
export interface ActionDefinition {
  id: string;
  label: string;
  shortLabel?: string;
  description: string;
  icon: string;
  variant: ActionVariant;
  category: ActionCategory;
  roles: UserRole[];
  contexts: EntryContext[];
  screens: ScreenScope[];
  tabs?: PatientTab[];
  stateGuard?: StateGuard;
  initiatesWorkflow?: WorkflowType;
  workflowStep?: { workflow: WorkflowType; step: number };
  priority: number;
  requiresConfirmation?: boolean;
  auditLabel: string;
}

// ─── Workflow Types ───────────────────────────────────────────────────────────
export type WorkflowType =
  | 'hcc-confirmation'
  | 'care-gap-closure'
  | 'utilization-escalation'
  | 'attribution-dispute'
  | 'provider-referral'
  | 'stars-payer-bonus'
  | 'hedis-measure-doc'
  | 'mips-payment-adj';

// ─── Workflow State ───────────────────────────────────────────────────────────
export type WorkflowStatus = 'idle' | 'in-progress' | 'awaiting-review' | 'completed' | 'rejected';

export interface WorkflowState {
  workflowType: WorkflowType;
  entityId: string;
  currentStep: number;
  totalSteps: number;
  status: WorkflowStatus;
  startedAt: string;
  startedBy: string;
  startedByRole: UserRole;
  lastUpdatedAt: string;
  stepHistory: WorkflowStepRecord[];
}

export interface WorkflowStepRecord {
  step: number;
  label: string;
  completedAt: string;
  completedBy: string;
  completedByRole: UserRole;
  notes?: string;
}

export interface WorkflowDefinition {
  type: WorkflowType;
  label: string;
  description: string;
  steps: WorkflowStepDefinition[];
}

export interface WorkflowStepDefinition {
  step: number;
  label: string;
  description: string;
  requiredRole: UserRole;
  actionId: string;
}

export interface ActionContext {
  role: UserRole;
  entryContext: EntryContext;
  screen: ScreenScope;
  tab?: PatientTab;
  patientState?: {
    openHCCSuspects: number;
    openCareGaps: number;
    activeAlerts: number;
    attributionStatus?: AttributionStatus;
    hccStatuses?: HCCStatus[];
    gapStatuses?: GapStatus[];
    alertTiers?: AlertTier[];
  };
}

export interface AuditEntry {
  id: string;
  actionId: string;
  auditLabel: string;
  entityId?: string;
  entityType?: 'patient' | 'hcc' | 'gap' | 'alert' | 'contract' | 'provider';
  performedBy: string;
  performedByRole: UserRole;
  entryContext: EntryContext;
  screen: ScreenScope;
  tab?: PatientTab;
  timestamp: string;
  notes?: string;
  workflowType?: WorkflowType;
  workflowStep?: number;
}
