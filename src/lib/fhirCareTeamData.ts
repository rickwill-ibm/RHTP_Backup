'use client';

// ─── fhirCareTeamData.ts ──────────────────────────────────────────────────────
// Barrel re-export — import from here as before.
// Types → fhirCareTeamData.types.ts
// Data  → fhirCareTeamData.data.ts

export type {
  CareTeamRoleCategory,
  TaskProgramType,
  TaskStatus,
  TaskPriority,
  FHIRCareTeamParticipant,
  FHIRCareTeam,
  FHIRTask,
  CareTeamInboxTask,
} from './fhirCareTeamData.types';

export {
  PATIENT_CARE_TEAM,
  FHIR_TASKS,
  buildCareTeamInboxTasks,
  CARE_TEAM_INBOX_TASKS,
  PROGRAM_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
  PRIORITY_CONFIG,
} from './fhirCareTeamData.data';
