'use client';
// patientContext.builders.ts — Functions to build PatientSharedState from registry or FHIR data

import { getPatientById, type RegistryPatient } from './patientRegistry';
import type {
  PatientSharedState,
  EpisodeStatus,
  BHRiskLevel,
  GapDomain,
  GapStatus,
} from './patientContext.types';

/**
 * Map registry patient data to PatientSharedState shape
 */
export function buildStateFromRegistry(platformId: string): PatientSharedState | null {
  try {
    const rp = getPatientById(platformId);
    if (!rp) return null;

    return {
      patientId: rp.platformId,
      name: rp.name,
      mrn: rp.ehrMrn,
      age: rp.age,
      gender: rp.gender,
      dob: rp.dob,
      pcp: rp.pcp,
      careManager: rp.careManager,
      careManagerInitials: rp.careManagerInitials,
      organization: rp.organization,
      attribution: rp.attribution,

      episodeType: rp.episodeType,
      episodeStatus: rp.episodeStatus as EpisodeStatus,
      episodeDaysActive: rp.episodeDaysActive,
      pmpm: rp.pmpm,
      pmpmTarget: rp.pmpmTarget,
      rafScore: rp.rafScore,
      rafDelta: 0.12,
      riskTier: rp.riskLabel,
      erRiskPct: rp.erRiskPct,
      hccSuspects: rp.hccSuspects,
      hccValue: rp.hccValue,
      lastContact: rp.lastContact,
      attributionDetail: rp.attribution,

      phq9Score: rp.bhScore ?? 0,
      phq9Trend: rp.bhScoreLabel,
      auditC: rp.auditC,
      traumaFlag: false,
      bhRisk: rp.bhRisk as BHRiskLevel,
      bhReferralStatus: rp.bhReferralStatus,
      bhReferralDate: '',
      bhProvider: rp.bhProvider,
      pamScore: 2,
      pamLabel: rp.burdenScore,
      patientGoal: rp.patientGoal,

      transportStatus: rp.transportStatus,
      transportReferralId: '',
      referralStatus: 'Active',
      referralDaysOpen: 0,
      foodSecurity: rp.foodSecurity,
      housingStatus: rp.housingStatus,
      language: rp.language,
      literacy: 'moderate',
      cohortFlag: rp.cohortFlag,
      ruralDistance: rp.ruralDistance,
      disparityFlag: rp.disparityFlag,
      snapStatus: rp.snapStatus,

      careGaps: rp.careGaps.map((g: any) => ({
        id: g.id,
        domain: g.domain as GapDomain,
        name: g.name,
        status: g.status as GapStatus,
        daysOpen: g.daysOpen,
        assignedTo: g.assignedTo,
      })),

      pathwaySteps: rp.pathwaySteps.map((s: any) => ({
        id: s.id,
        label: s.label,
        completed: s.status === 'completed',
        date: s.date,
        metric: s.metric,
      })),

      riskLabel: rp.riskLabel,
      bhScore: rp.bhScore,
      bhScoreLabel: rp.bhScoreLabel,
      aiCopilot: rp.aiCopilot ?? '',
      conditions: rp.conditions,
      medications: rp.medications,
      recentOrders: rp.recentOrders,

      crisisCount30d: 0,
      lastCrisisDate: null,
      activeCrisis: false,
    };
  } catch {
    return null;
  }
}

/** Map a RegistryPatient fetched from FHIR into a PatientSharedState */
export function buildStateFromFhirPatient(rp: RegistryPatient): PatientSharedState {
  return {
    patientId: rp.platformId,
    name: rp.name,
    mrn: rp.ehrMrn,
    age: rp.age,
    gender: rp.gender,
    dob: rp.dob,
    pcp: rp.pcp,
    careManager: rp.careManager,
    careManagerInitials: rp.careManagerInitials,
    organization: rp.organization,
    attribution: rp.attribution,
    episodeType: rp.episodeType,
    episodeStatus: rp.episodeStatus as EpisodeStatus,
    episodeDaysActive: rp.episodeDaysActive,
    pmpm: rp.pmpm,
    pmpmTarget: rp.pmpmTarget,
    rafScore: rp.rafScore,
    rafDelta: 0,
    riskTier: rp.riskLabel,
    erRiskPct: rp.erRiskPct,
    hccSuspects: rp.hccSuspects,
    hccValue: rp.hccValue,
    lastContact: rp.lastContact,
    attributionDetail: rp.attribution,
    phq9Score: rp.bhScore ?? 0,
    phq9Trend: rp.bhScoreLabel,
    auditC: rp.auditC,
    traumaFlag: false,
    bhRisk: rp.bhRisk as BHRiskLevel,
    bhReferralStatus: rp.bhReferralStatus,
    bhReferralDate: '',
    bhProvider: rp.bhProvider,
    pamScore: 2,
    pamLabel: rp.burdenScore,
    patientGoal: rp.patientGoal,
    transportStatus: rp.transportStatus,
    transportReferralId: '',
    referralStatus: 'Active',
    referralDaysOpen: 0,
    foodSecurity: rp.foodSecurity,
    housingStatus: rp.housingStatus,
    language: rp.language,
    literacy: 'moderate',
    cohortFlag: rp.cohortFlag,
    ruralDistance: rp.ruralDistance,
    disparityFlag: rp.disparityFlag,
    snapStatus: rp.snapStatus,
    careGaps: rp.careGaps.map((g) => ({
      id: g.id,
      domain: g.domain as GapDomain,
      name: g.name,
      status: g.status as GapStatus,
      daysOpen: g.daysOpen,
      assignedTo: g.assignedTo,
    })),
    pathwaySteps: rp.pathwaySteps.map((s) => ({
      id: s.id,
      label: s.label,
      completed: s.status === 'completed',
      date: s.date,
      metric: s.metric,
    })),
    riskLabel: rp.riskLabel,
    bhScore: rp.bhScore,
    bhScoreLabel: rp.bhScoreLabel,
    aiCopilot: rp.aiCopilot ?? '',
    conditions: rp.conditions,
    medications: rp.medications,
    recentOrders: rp.recentOrders,
    crisisCount30d: 0,
    lastCrisisDate: null,
    activeCrisis: false,
  };
}
