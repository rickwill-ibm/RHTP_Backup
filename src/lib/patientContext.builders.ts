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

/**
 * Map a RegistryPatient fetched from FHIR into a PatientSharedState.
 *
 * FHIR resources on HAPI don't carry proprietary extensions like raf-score,
 * bhScore, lastContact, etc. When the FHIR mapper returns 0/null/empty for
 * these fields, fall back to the static registry value so the Citizen Detail
 * screen doesn't show zeroes in live FHIR mode.
 */
export function buildStateFromFhirPatient(rp: RegistryPatient): PatientSharedState {
  // Pull registry fallback values for fields FHIR doesn't carry.
  const reg = getPatientById(rp.platformId);

  return {
    patientId: rp.platformId,
    name: rp.name,
    mrn: rp.ehrMrn,
    age: rp.age,
    gender: rp.gender,
    dob: rp.dob,
    pcp: rp.pcp || reg?.pcp || '',
    careManager: rp.careManager || reg?.careManager || '',
    careManagerInitials: rp.careManagerInitials || reg?.careManagerInitials || '',
    organization: rp.organization || reg?.organization || '',
    attribution: rp.attribution || reg?.attribution || '',
    episodeType: rp.episodeType || reg?.episodeType || '',
    episodeStatus: (rp.episodeStatus || reg?.episodeStatus || 'Active') as EpisodeStatus,
    episodeDaysActive: rp.episodeDaysActive || reg?.episodeDaysActive || 0,
    pmpm: rp.pmpm || reg?.pmpm || 0,
    pmpmTarget: rp.pmpmTarget || reg?.pmpmTarget || 0,
    // RAF score is a proprietary extension — HAPI won't carry it; always use registry.
    rafScore: (rp.rafScore > 0 ? rp.rafScore : null) ?? reg?.rafScore ?? 0,
    rafDelta: reg ? 0.12 : 0,
    riskTier: rp.riskLabel || reg?.riskLabel || '',
    erRiskPct: rp.erRiskPct || reg?.erRiskPct || 0,
    hccSuspects: rp.hccSuspects || reg?.hccSuspects || 0,
    hccValue: rp.hccValue || reg?.hccValue || 0,
    lastContact: rp.lastContact || reg?.lastContact || '',
    attributionDetail: rp.attribution || reg?.attribution || '',
    // BH scores — fall back to registry if FHIR doesn't carry them.
    phq9Score: (rp.bhScore ?? 0) > 0 ? (rp.bhScore ?? 0) : (reg?.bhScore ?? 0),
    phq9Trend: rp.bhScoreLabel || reg?.bhScoreLabel || '',
    auditC: rp.auditC || reg?.auditC || 0,
    traumaFlag: false,
    bhRisk: (rp.bhRisk || reg?.bhRisk || 'low') as BHRiskLevel,
    bhReferralStatus: rp.bhReferralStatus || reg?.bhReferralStatus || '',
    bhReferralDate: '',
    bhProvider: rp.bhProvider || reg?.bhProvider || '',
    pamScore: 2,
    pamLabel: rp.burdenScore || reg?.burdenScore || '',
    patientGoal: rp.patientGoal || reg?.patientGoal || '',
    transportStatus: rp.transportStatus || reg?.transportStatus || '',
    transportReferralId: '',
    referralStatus: 'Active',
    referralDaysOpen: 0,
    foodSecurity: rp.foodSecurity || reg?.foodSecurity || '',
    housingStatus: rp.housingStatus || reg?.housingStatus || '',
    language: rp.language || reg?.language || '',
    literacy: 'moderate',
    cohortFlag: rp.cohortFlag || reg?.cohortFlag || '',
    ruralDistance: String(rp.ruralDistance || reg?.ruralDistance || ''),
    disparityFlag: String(rp.disparityFlag ?? reg?.disparityFlag ?? ''),
    snapStatus: rp.snapStatus || reg?.snapStatus || '',
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
