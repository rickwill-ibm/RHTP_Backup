// ─── holisticContextEngine.types.ts ──────────────────────────────────────────
// TypeScript interfaces for the Holistic Context Engine.

export interface HolisticPatientContext {
  patient: PatientBasicInfo;
  clinicalProfile: ClinicalProfile;
  barriers: BarrierProfile;
  caregiverStatus: CaregiverStatus;
  financialProfile: FinancialProfile;
  accessProfile: AccessProfile;
  digitalProfile: DigitalProfile;
  psychosocialProfile: PsychosocialProfile;
  contextGeneratedAt: string;
  /**
   * Provenance (WPC-01 Phase 3): which sections were populated from the REAL
   * projected graph vs. filled with neutral null-objects pending their domain
   * mapper. Absent on the authored (mock) engine's contexts. Makes the
   * fail-honest contract machine-readable — a neutral section is never silently
   * presented as the member's real data.
   */
  contextProvenance?: HolisticContextProvenance;
}

export interface HolisticContextProvenance {
  source: 'projected-graph';
  projectedSections: string[];
  neutralSections: string[];
}

export interface PatientBasicInfo {
  id: string;
  name: string;
  age: number;
  gender: string;
  mrn?: string;
}

export interface ClinicalProfile {
  chronicConditions: ChronicCondition[];
  conditionCount: number;
  complexityScore: number; // 0-100
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  openCareGaps: CareGap[];
  medications: Medication[];
  recentHospitalizations: number;
  erVisits: number;
}

export interface ChronicCondition {
  name: string;
  icdCode?: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  controlled: boolean;
  diagnosisDate?: string;
}

export interface CareGap {
  id: string;
  type: string;
  description: string;
  hedisCode?: string;
  dueDate?: string;
  priority: 'low' | 'moderate' | 'high' | 'critical';
}

export interface Medication {
  name: string;
  dosage?: string;
  frequency?: string;
  class?: string;
}

export interface BarrierProfile {
  transportation: BarrierDetail;
  financial: BarrierDetail;
  housing: BarrierDetail;
  food: BarrierDetail;
  technology: BarrierDetail;
  language: BarrierDetail;
}

export interface BarrierDetail {
  severity: 'none' | 'low' | 'moderate' | 'high' | 'critical';
  status: 'not-screened' | 'identified' | 'intervention-active' | 'resolved';
  description?: string;
  interventionProvider?: string;
  screeningDate?: string;
}

export interface CaregiverStatus {
  isCaregiverForOthers: boolean;
  dependents: Dependent[];
  caregiverBurdenScore: number; // 0-100
  timeAvailability: TimeAvailability;
  respiteCareAvailable: boolean;
  supportSystem: SupportSystem;
}

export interface Dependent {
  name: string;
  relationship: 'child' | 'parent' | 'spouse' | 'sibling' | 'other';
  age: number;
  healthStatus: 'healthy' | 'chronic-condition' | 'special-needs' | 'frail';
  careRequirements: CareRequirements;
}

export interface CareRequirements {
  dailyCareHours: number;
  medicalAppointments: number; // per month
  specialNeeds: string[];
  canBeLeftAlone: boolean;
}

export interface TimeAvailability {
  weekdayMorning: 'none' | 'limited' | 'available';
  weekdayAfternoon: 'none' | 'limited' | 'available';
  weekdayEvening: 'none' | 'limited' | 'available';
  weekend: 'none' | 'limited' | 'available';
}

export interface SupportSystem {
  familyNearby: boolean;
  friendSupport: boolean;
  communityResources: string[];
}

export interface FinancialProfile {
  householdIncome: 'low' | 'moderate' | 'high';
  insuranceCoverage: InsuranceCoverage;
  outOfPocketBurden: number; // monthly
  employmentStatus: 'employed' | 'unemployed' | 'disabled' | 'caregiver' | 'retired';
  financialStressScore: number; // 0-100
}

export interface InsuranceCoverage {
  type: 'Medicare' | 'Medicaid' | 'Commercial' | 'Dual' | 'Uninsured';
  copays: boolean;
  deductible: number;
  hasSupplemental?: boolean;
}

export interface AccessProfile {
  ruralStatus: 'urban' | 'suburban' | 'rural' | 'frontier';
  distanceToProvider: number; // miles
  publicTransitAvailable: boolean;
  broadbandAccess: boolean;
  cellularCoverage: 'excellent' | 'good' | 'fair' | 'poor' | 'none';
  nearestPharmacy: number; // miles
  nearestER: number; // miles
  distanceToNearestFacility?: number;
  nearestLabLocation?: string;
}

export interface DigitalProfile {
  hasSmartphone: boolean;
  hasComputer: boolean;
  hasInternet: boolean;
  videoCapable: boolean;
  digitalLiteracy: 'low' | 'moderate' | 'high';
  preferredContactMethod: 'phone' | 'text' | 'email' | 'portal' | 'mail';
}

export interface PsychosocialProfile {
  healthLiteracy: 'low' | 'moderate' | 'high';
  motivationLevel: 'low' | 'moderate' | 'high';
  depressionScreening?: PHQ9Score;
  anxietyScreening?: GAD7Score;
  socialIsolation: boolean;
  stressLevel: 'low' | 'moderate' | 'high' | 'severe';
}

export interface PHQ9Score {
  score: number; // 0-27
  severity: 'none' | 'minimal' | 'mild' | 'moderate' | 'moderately-severe' | 'severe';
  screeningDate?: string;
}

export interface GAD7Score {
  score: number; // 0-21
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  screeningDate?: string;
}
