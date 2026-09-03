'use client';
// AppContext — provides role, entry context, and current user state to all screens.
// This is the single source of truth for who the user is and how they entered the app.

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { UserRole } from './mockData';

// ─── Physician Personas ───────────────────────────────────────────────────────
export type PhysicianPersona = 'rick' | 'jon';

export interface PhysicianProfile {
  id: PhysicianPersona;
  fhirId: string;          // FHIR Practitioner resource id
  displayName: string;
  role: 'PCP' | 'Specialist';
  specialty: string;
  color: string;           // accent color for UI distinction
}

export const PHYSICIAN_PROFILES: Record<PhysicianPersona, PhysicianProfile> = {
  rick: {
    id: 'rick',
    fhirId: 'practitioner-rick',
    displayName: 'Dr. Rick',
    role: 'PCP',
    specialty: 'Primary Care',
    color: '#0043ce',
  },
  jon: {
    id: 'jon',
    fhirId: 'practitioner-jon',
    displayName: 'Dr. Jon',
    role: 'Specialist',
    specialty: 'Specialist',
    color: '#6929c4',
  },
};

import type { EntryContext, ScreenScope } from './actionRegistry';
import { getAvailableActions } from './actionRegistry';
import type { ActionDefinition, ActionContext, PatientTab } from './actionRegistry';
import type { Cohort } from './careTeam/cohorts';
import {
  deriveAssignments,
  makeAuditEntry,
  type Assignment,
  type AuditEntry,
} from './careTeam/assignments';

export interface ReferralTask {
  id: string;
  patientId: string;
  citizenName: string;
  action: string;
  category: string;
  cboName: string;
  keystone: boolean;
  status: 'pending';
  source: 'screening' | 'manual';
  createdAt: string;
}

export interface OpsTask {
  id: string;
  type: 'sprint' | 'coverage' | 'rebalance' | 'program';
  title: string;
  targetName: string;
  detail: string;
  status: 'scheduled' | 'requested' | 'in-progress';
  createdAt: string;
}

// ─── User Session ─────────────────────────────────────────────────────────────
export interface UserSession {
  userId: string;
  name: string;
  initials: string;
  role: UserRole;
  email: string;
}

// ─── App Context Shape ────────────────────────────────────────────────────────
interface AppContextValue {
  // Current user
  user: UserSession;
  setUser: (user: UserSession) => void;

  // Active physician persona for two-physician demo (Rick=PCP / Jon=Specialist)
  physicianPersona: PhysicianPersona;
  setPhysicianPersona: (persona: PhysicianPersona) => void;
  activePhysician: PhysicianProfile;

  // Runtime data source toggle — overrides NEXT_PUBLIC_USE_MOCK_DATA
  useMockData: boolean;
  setUseMockData: (val: boolean) => void;

  // The roster member the logged-in user maps to (single identity model).
  currentMemberId: string | null;

  // Entry context — how the user entered the app
  entryContext: EntryContext;
  setEntryContext: (ctx: EntryContext) => void;

  // Selected contract
  selectedContractId: string | null;
  setSelectedContractId: (id: string | null) => void;

  // Selected patient
  selectedPatientId: string | null;
  setSelectedPatientId: (id: string | null) => void;

  // Active patient — persists across all patient-facing screens
  // Default: MARIA_SD_001 (Maria Redhawk — primary demo patient)
  activePatientId: string;
  setActivePatientId: (id: string) => void;

  // Care Team domain: cohorts, assignments, audit (single source of truth)
  cohorts: Cohort[];
  addCohort: (cohort: Cohort) => void;
  activeCohortId: string | null;
  setActiveCohortId: (id: string | null) => void;
  assignments: Record<string, Assignment>;
  reassignPatient: (patientId: string, toMemberId: string, reason: string, fromMemberId?: string) => void;
  auditLog: AuditEntry[];

  // Referral tasks created from screening / resource navigation (closed loop to caseload)
  referralTasks: ReferralTask[];
  addReferralTasks: (tasks: ReferralTask[]) => void;
  opsTasks: OpsTask[];
  addOpsTask: (task: OpsTask) => void;

  // Action availability helper — returns filtered actions for current user + screen
  getActions: (
    screen: ScreenScope,
    tab?: PatientTab,
    patientState?: ActionContext['patientState']
  ) => ActionDefinition[];
}

// ─── Default User (Care Manager) ─────────────────────────────────────────────
const defaultUser: UserSession = {
  userId: 'user-001',
  name: 'Sarah Johnson',
  initials: 'SJ',
  role: 'care_manager',
  email: 'sarah.johnson@rhtp-health.org',
};

const USER_TO_MEMBER: Record<string, string> = {
  'user-001': 'cm-sarah-johnson',
  'user-002': '',
  'user-003': 'chw-angela-torres',
};

// ─── Context ──────────────────────────────────────────────────────────────────
const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession>(defaultUser);
  const [physicianPersona, setPhysicianPersona] = useState<PhysicianPersona>('rick');
  const [useMockData, setUseMockData] = useState<boolean>(
    (process.env.NEXT_PUBLIC_USE_MOCK_DATA ?? 'true').toLowerCase() === 'true'
  );
  const [entryContext, setEntryContext] = useState<EntryContext>('browse');
  const [selectedContractId, setSelectedContractId] = useState<string | null>('contract-001');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>('patient-001');
  // Maria Redhawk is the default active patient for all patient-facing demo screens
  const [activePatientId, setActivePatientId] = useState<string>('MARIA_SD_001');

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [activeCohortId, setActiveCohortId] = useState<string | null>(null);
  const [manualOverrides, setManualOverrides] = useState<Record<string, Assignment>>({});
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [referralTasks, setReferralTasks] = useState<ReferralTask[]>([]);
  const addReferralTasks = useCallback((tasks: ReferralTask[]) => setReferralTasks(prev => [...tasks, ...prev]), []);
  const [opsTasks, setOpsTasks] = useState<OpsTask[]>([]);
  const addOpsTask = useCallback((task: OpsTask) => setOpsTasks(prev => [task, ...prev]), []);

  const addCohort = useCallback((cohort: Cohort) => {
    setCohorts((prev) => [...prev.filter((c) => c.measureKey !== cohort.measureKey), cohort]);
    setActiveCohortId(cohort.id);
  }, []);

  const assignments = React.useMemo(
    () => deriveAssignments(cohorts, manualOverrides),
    [cohorts, manualOverrides]
  );

  const reassignPatient = useCallback(
    (patientId: string, toMemberId: string, reason: string, fromMemberId?: string) => {
      setManualOverrides((prev) => {
        const existing = assignments[patientId];
        return {
          ...prev,
          [patientId]: {
            patientId,
            memberId: toMemberId,
            source: 'manual',
            rationale: reason || 'Manual reassignment',
            riskTier: existing?.riskTier ?? 'Moderate',
            cohortId: existing?.cohortId,
            assignedAt: new Date().toISOString(),
            assignedBy: user.name,
          },
        };
      });
      setAuditLog((prev) => [makeAuditEntry(patientId, toMemberId, reason, user.name, fromMemberId), ...prev]);
    },
    [assignments, user.name]
  );

  const getActions = useCallback(
    (screen: ScreenScope, tab?: PatientTab, patientState?: ActionContext['patientState']): ActionDefinition[] => {
      return getAvailableActions({
        role: user.role,
        entryContext,
        screen,
        tab,
        patientState,
      });
    },
    [user.role, entryContext]
  );

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        physicianPersona,
        setPhysicianPersona,
        activePhysician: PHYSICIAN_PROFILES[physicianPersona],
        useMockData,
        setUseMockData,
        currentMemberId: USER_TO_MEMBER[user.userId] || null,
        entryContext,
        setEntryContext,
        selectedContractId,
        setSelectedContractId,
        selectedPatientId,
        setSelectedPatientId,
        activePatientId,
        setActivePatientId,
        cohorts,
        addCohort,
        activeCohortId,
        setActiveCohortId,
        assignments,
        reassignPatient,
        auditLog,
        referralTasks,
        addReferralTasks,
        opsTasks,
        addOpsTask,
        getActions,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContextProvider');
  return ctx;
}
