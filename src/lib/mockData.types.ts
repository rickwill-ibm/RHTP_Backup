// Type and interface declarations for mockData domain

export type RiskTier = 'Critical' | 'High' | 'Moderate' | 'Low';
export type AttributionStatus = 'Confirmed' | 'Provisional' | 'Disputed' | 'Dropped';
export type HCCStatus =
  | 'Surfaced'
  | 'Evidence Reviewed'
  | 'Clinician Review'
  | 'Documented'
  | 'Submitted'
  | 'Confirmed'
  | 'Rejected';
export type GapStatus = 'Open' | 'In Progress' | 'Closed' | 'Excluded' | 'Expired';
export type AlertTier = 'Critical' | 'Important' | 'Informational';
export type ProgramType = 'MSSP ACO' | 'ACO REACH' | 'Commercial VBC' | 'Medicaid MCO';
export type NetworkTier = 'Preferred' | 'In-Network' | 'Out-of-Network';
export type UserRole = 'care_manager' | 'physician';

export interface Contract {
  id: string;
  name: string;
  payer: string;
  programType: ProgramType;
  contractPeriod: string;
  attributedLives: number;
  pmpmTarget: number;
  pmpmActual: number;
  gapClosureRate: number;
  gapClosureTarget: number;
  rafCaptureRate: number;
  starsRating: number;
  activeAlerts: number;
  openHCCSuspects: number;
  hccRevenueAtRisk: number;
  performanceStatus: 'On Track' | 'At Risk' | 'Below Target';
  expiresInDays: number | null;
  lastUpdated: string;
}

export interface Patient {
  id: string;
  name: string;
  dob: string;
  age: number;
  gender: string;
  mrn: string;
  riskTier: RiskTier;
  rafScore: number;
  rafScoreDelta: number;
  predictedErRisk: number;
  openHCCSuspects: number;
  hccSuspectValue: number;
  openCareGaps: number;
  lastContactDate: string;
  attributionStatus: AttributionStatus;
  pmpmCost: number;
  pmpmTarget: number;
  primaryCareProvider: string;
  activeAlerts: number;
  carePlanStatus: 'Active' | 'Pending' | 'None';
  contractId: string;
  phone: string;
  address: string;
  insuranceId: string;
  payer: string;
  enrollmentDate: string;
}

export interface HCCSuspect {
  id: string;
  patientId: string;
  hccCode: string;
  hccDescription: string;
  icdCode: string;
  icdDescription: string;
  estimatedRafDelta: number;
  estimatedRevenueDelta: number;
  status: HCCStatus;
  evidenceSources: string[];
  lastEncounterDate: string;
  suspectConfidence: number;
  assignedPhysician: string;
  submissionDeadline: string;
  dataSource: 'EMR' | 'Claims' | 'HIE' | 'LPR';
  freshnessDate: string;
}

export interface CareGap {
  id: string;
  patientId: string;
  measureId: string;
  measureName: string;
  program: 'HEDIS' | 'STARS' | 'MIPS';
  status: GapStatus;
  dueDate: string;
  daysOpen: number;
  lastActionDate: string;
  assignedTo: string;
  notes: string;
  closureRequirement: string;
}

export interface UtilizationAlert {
  id: string;
  patientId: string;
  tier: AlertTier;
  type:
    | 'Predicted ER Risk'
    | 'Avoidable Admission'
    | 'High-Cost Imaging'
    | 'Poly-Pharmacy'
    | 'SNF Readmission Risk';
  description: string;
  riskScore: number;
  estimatedCost: number;
  createdDate: string;
  source: 'LPR' | 'CDS Hooks' | 'Claims' | 'EMR';
  status: 'Active' | 'Escalated' | 'Intervention Assigned' | 'Resolved' | 'Dismissed';
  freshnessDate: string;
}

export interface CostEnvelope {
  patientId: string;
  contractId: string;
  period: string;
  inpatient: number;
  er: number;
  specialty: number;
  pharmacy: number;
  postAcute: number;
  primaryCare: number;
  total: number;
  targetTotal: number;
  pmpm: number;
  pmpmTarget: number;
}

export interface Provider {
  id: string;
  npi: string;
  name: string;
  specialty: string;
  networkTier: NetworkTier;
  costPercentile: number;
  qualityScore: number;
  acceptingNewPatients: boolean;
  affiliatedFacility: string;
  distance: number;
  starsRating: number;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  boardCertified: boolean;
  languagesSpoken: string[];
  avgWaitDays: number;
  patientSatisfaction: number;
  vbcAligned: boolean;
}

export interface SpecialistProvider {
  id: string;
  name: string;
  npi: string;
  specialty: string;
  organization: string;
}

// ── Care Plan types ──────────────────────────────────────────
export type CarePlanStatus = 'Active' | 'Draft' | 'Completed' | 'Cancelled' | 'On Hold';
export type GoalStatus = 'In Progress' | 'Achieved' | 'Not Started' | 'Cancelled';
export type InterventionStatus = 'Scheduled' | 'Active' | 'Completed' | 'Cancelled' | 'Pending';
export type CarePlanTemplate =
  | 'Cardiology'
  | 'Endocrinology'
  | 'Pulmonology'
  | 'Nephrology'
  | 'Orthopedics'
  | 'Neurology'
  | 'Custom';

export interface CarePlanGoal {
  id: string;
  description: string;
  target: string;
  current?: string;
  status: GoalStatus;
  dueDate: string;
  progress: number; // 0-100
  notes?: string;
  interventions?: CarePlanIntervention[];
}

export interface CarePlanIntervention {
  id: string;
  type: 'Referral' | 'Monitoring' | 'Appointment' | 'Medication' | 'Education' | 'Procedure';
  description: string;
  status: InterventionStatus;
  scheduledDate?: string;
  completedDate?: string;
  provider?: string;
  frequency?: string;
  notes?: string;
}

export interface CareTeamMember {
  id: string;
  name: string;
  role: string;
  specialty?: string;
  relationship: 'Primary' | 'Consultant' | 'Care Manager' | 'Specialist' | 'Support';
  phone?: string;
  email?: string;
  networkTier?: NetworkTier;
  npi?: string;
  /** Honesty markers (care-plan F5): true + provenance when the contact block is
   *  synthesized placeholder data, not directory-sourced. */
  synthetic?: boolean;
  contactProvenance?: 'record-sourced' | 'synthesized-placeholder';
}

export interface CarePlan {
  id: string;
  patientId: string;
  title: string;
  description: string;
  status: CarePlanStatus;
  template?: CarePlanTemplate;
  createdDate: string;
  startDate: string;
  endDate?: string;
  lastUpdated: string;
  createdBy: string;
  addresses: string[];
  goals: CarePlanGoal[];
  interventions: CarePlanIntervention[];
  careTeam: CareTeamMember[];
  clinicalNotes: { date: string; author: string; note: string }[];
  sharedWith: string[];
}

// ── Referral types ───────────────────────────────────────────
export type ReferralUrgency = 'routine' | 'urgent' | 'asap' | 'stat';
export type ReferralStatus = 'pending' | 'scheduled' | 'in-progress' | 'completed' | 'cancelled';

export interface Referral {
  referralId: string;
  serviceRequestId: string;
  patientName: string;
  patientId: string;
  patientDOB: string;
  patientMRN?: string;
  referringProvider: string;
  referringOrganization?: string;
  referralDate: string;
  urgency: ReferralUrgency;
  careGap?: {
    measure: string;
    description: string;
    daysOpen: number;
    gainshareAmount: number;
    targetCriteria: string;
    currentValue: string;
    requiredLab?: {
      name: string;
      loincCode: string;
      targetRange: string;
      unit: string;
      example: string;
    };
  };
  specialistType: string;
  clinicalNotes: string;
  status: ReferralStatus;
  appointmentDate?: string;
  clinicalContext?: {
    primaryDiagnosis: string;
    icd10: string;
    lastA1C?: string;
    lastLDL?: string;
    lastBP?: string;
    medications?: string[];
  };
}

export interface QualityMetrics {
  measureId: string;
  measureName: string;
  program: 'HEDIS' | 'STARS' | 'MIPS';
  numerator: number;
  denominator: number;
  rate: number;
  target: number;
  gapsClosed: number;
  gapsOpen: number;
  lastUpdated: string;
}

export interface GainshareRecord {
  referralId: string;
  patientId: string;
  patientName: string;
  measureId: string;
  measureName: string;
  closureDate: string;
  totalAmount: number;
  providerShare: number;
  specialistShare: number;
  providerId: string;
  providerName: string;
  specialistId: string;
  specialistName: string;
  status: 'pending' | 'approved' | 'paid';
}

// ── Episode types ────────────────────────────────────────────
export type EpisodeStatus = 'Active' | 'Closed' | 'Maintenance';
export type EpisodeCategory = 'Surgical' | 'Medical' | 'Chronic Care' | 'Preventive';
export type EventType =
  'ER' | 'Inpatient' | 'SNF' | 'Home Health' | 'Outpatient' | 'Procedure' | 'Lab' | 'Medication';

export interface EpisodeEvent {
  id: string;
  episodeId: string;
  eventDate: string;
  eventType: EventType;
  careSetting: string;
  description: string;
  cost: number;
  provider: string;
  facility: string;
  duration?: number;
  outcome?: string;
}

export interface Episode {
  id: string;
  patientId: string;
  patientName: string;
  patientDOB: string;
  patientAge: number;
  patientGender: 'M' | 'F';
  patientMRN: string;
  episodeType: string;
  episodeCategory: EpisodeCategory;
  startDate: string;
  endDate: string | null;
  duration: number;
  status: EpisodeStatus;
  totalCost: number;
  targetCost: number;
  costVariance: number;
  utilizationScore: number;
  events: EpisodeEvent[];
  qualityMetrics: {
    complications: boolean;
    readmission30Day: boolean;
    patientSatisfaction: number;
    carePlanAdherence: number;
  };
  assignedCareManager: string;
  primaryProvider: string;
}
