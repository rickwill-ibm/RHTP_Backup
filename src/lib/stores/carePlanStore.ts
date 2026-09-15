import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Care Plan Store
 *
 * Zustand store for managing active care plans and their progress
 */

import { create } from 'zustand';
import type { CarePlan, CarePlanGoal, CarePlanIntervention } from '@/lib/mockData';

// Extended types for monitoring
export interface ActionNote {
  id: string;
  text: string;
  author: string;
  timestamp: string;
}

export interface MonitoredAction extends Omit<CarePlanIntervention, 'notes'> {
  goalId: string;
  tier?: number;
  completedDate?: string;
  actionNotes?: ActionNote[]; // Renamed to avoid conflict with base type
}

export interface MonitoredCarePlan extends CarePlan {
  generatedDate: string;
  lastUpdated: string;
  overallProgress: number; // 0-100
  tierProgress: Record<number, number>; // tier -> progress percentage
  rootCauseInfo?: {
    type: string;
    description: string;
    burdenScore?: number;
    successProbability?: number;
  };
}

interface CarePlanStore {
  // State
  activePlans: Map<string, MonitoredCarePlan>;

  // Actions
  setCarePlan: (patientId: string, plan: CarePlan) => void;
  getCarePlan: (patientId: string) => MonitoredCarePlan | null;
  updateActionStatus: (
    patientId: string,
    actionId: string,
    status: CarePlanIntervention['status']
  ) => void;
  addActionNote: (patientId: string, actionId: string, note: string, author: string) => void;
  calculateProgress: (patientId: string) => void;
}

export const useCarePlanStore = create<CarePlanStore>((set, get) => ({
  activePlans: new Map(),

  /**
   * Set or update a care plan for a patient
   */
  setCarePlan: (patientId: string, plan: CarePlan) => {
    const monitoredPlan: MonitoredCarePlan = {
      ...plan,
      generatedDate: clock.nowIso(),
      lastUpdated: clock.nowIso(),
      overallProgress: 0,
      tierProgress: {},
    };

    // Calculate initial progress
    const { activePlans } = get();
    const newPlans = new Map(activePlans);
    newPlans.set(patientId, monitoredPlan);

    set({ activePlans: newPlans });
    get().calculateProgress(patientId);
  },

  /**
   * Get care plan for a patient
   */
  getCarePlan: (patientId: string) => {
    const { activePlans } = get();
    return activePlans.get(patientId) || null;
  },

  /**
   * Update status of a specific action
   */
  updateActionStatus: (
    patientId: string,
    actionId: string,
    status: CarePlanIntervention['status']
  ) => {
    const { activePlans } = get();
    const plan = activePlans.get(patientId);

    if (!plan) return;

    // Find and update the action
    let updated = false;
    const updatedGoals = plan.goals.map((goal) => ({
      ...goal,
      interventions: goal.interventions?.map((intervention) => {
        if (intervention.id === actionId) {
          updated = true;
          return {
            ...intervention,
            status,
            ...(status === 'Completed' ? { completedDate: clock.nowIso() } : {}),
          };
        }
        return intervention;
      }),
    }));

    if (updated) {
      const updatedPlan: MonitoredCarePlan = {
        ...plan,
        goals: updatedGoals,
        lastUpdated: clock.nowIso(),
      };

      const newPlans = new Map(activePlans);
      newPlans.set(patientId, updatedPlan);
      set({ activePlans: newPlans });

      // Recalculate progress
      get().calculateProgress(patientId);
    }
  },

  /**
   * Add a note to an action
   */
  addActionNote: (patientId: string, actionId: string, noteText: string, author: string) => {
    const { activePlans } = get();
    const plan = activePlans.get(patientId);

    if (!plan) return;

    const note: ActionNote = {
      id: `note-${clock.now()}`,
      text: noteText,
      author,
      timestamp: clock.nowIso(),
    };

    // Find and update the action with the note
    const updatedGoals = plan.goals.map((goal) => ({
      ...goal,
      interventions: goal.interventions?.map((intervention) => {
        if (intervention.id === actionId) {
          const existingNotes = (intervention as any).actionNotes || [];
          return {
            ...intervention,
            actionNotes: [...existingNotes, note],
          } as any; // Type assertion to work with extended interface
        }
        return intervention;
      }),
    }));

    const updatedPlan: MonitoredCarePlan = {
      ...plan,
      goals: updatedGoals,
      lastUpdated: clock.nowIso(),
    };

    const newPlans = new Map(activePlans);
    newPlans.set(patientId, updatedPlan);
    set({ activePlans: newPlans });
  },

  /**
   * Calculate overall and tier-level progress
   */
  calculateProgress: (patientId: string) => {
    const { activePlans } = get();
    const plan = activePlans.get(patientId);

    if (!plan) return;

    let totalActions = 0;
    let completedActions = 0;
    const tierProgress: Record<number, number> = {};

    // Count actions by tier
    const tierActions: Record<number, { total: number; completed: number }> = {};

    plan.goals.forEach((goal) => {
      const tier = (goal as any).tier || 0;

      if (!tierActions[tier]) {
        tierActions[tier] = { total: 0, completed: 0 };
      }

      goal.interventions?.forEach((intervention) => {
        totalActions++;
        tierActions[tier].total++;

        if (intervention.status === 'Completed') {
          completedActions++;
          tierActions[tier].completed++;
        }
      });
    });

    // Calculate tier progress percentages
    Object.keys(tierActions).forEach((tierKey) => {
      const tier = parseInt(tierKey);
      const { total, completed } = tierActions[tier];
      tierProgress[tier] = total > 0 ? Math.round((completed / total) * 100) : 0;
    });

    // Calculate overall progress
    const overallProgress =
      totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

    // Update plan with progress
    const updatedPlan: MonitoredCarePlan = {
      ...plan,
      overallProgress,
      tierProgress,
    };

    const newPlans = new Map(activePlans);
    newPlans.set(patientId, updatedPlan);
    set({ activePlans: newPlans });
  },
}));

// Made with Bob
