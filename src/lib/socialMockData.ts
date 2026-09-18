// ─── socialMockData.ts ────────────────────────────────────────────────────────
// Barrel re-export — import from here as before.
// Types  → socialMockData.types.ts
// Data1  → socialMockData.data1.ts (patients, screening, programs, enrollments)
// Data2  → socialMockData.data2.ts (CHW, crisis, CBOs, config)

export type {
  SocialPatient,
  ScreeningRecord,
  FindhelpScreeningResult,
  Program,
  Enrollment,
  CHWVisit,
  OutreachRecord,
  CrisisEvent,
  CBO,
} from './socialMockData.types';

export {
  SOCIAL_PATIENTS,
  PRAPARE_DOMAINS,
  DOMAIN_COLORS,
  SCREENING_HISTORY,
  FINDHELP_RESULTS,
  PROGRAMS_BY_PATIENT,
  ENROLLMENTS,
} from './socialMockData.data1';

export {
  CHW_VISITS,
  OUTREACH_LOG,
  ACTIVE_CRISES,
  CRISIS_CONTACTS,
  CBOS,
  PROGRAM_DOMAIN_COLORS,
  STATUS_CONFIG,
  ENROLLMENT_STATUS_CONFIG,
} from './socialMockData.data2';
