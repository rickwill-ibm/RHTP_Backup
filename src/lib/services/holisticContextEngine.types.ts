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
  /**
   * Care-team summary from the care-team lens. Previously the lens was computed on
   * every read and dropped; now surfaced on the projected-graph path (absent on the
   * authored engine, which has no lens bundle).
   */
  careTeam?: CareTeamSummary;
  /**
   * 42 CFR Part 2 restriction status from the part2-restricted lens — proves consent
   * enforcement is surfaced end-to-end, not silently computed and discarded. Present
   * on the projected-graph path.
   */
  part2Restricted?: Part2RestrictionSummary;
  /**
   * WPC payer dimensions (optional, projected-graph path only — the authored engine
   * has no lens bundle). Each is consent-filtered like every other lens-derived
   * section: a restricted (Part 2) Encounter/Flag is excluded from utilization/alerts
   * unless the read scope covers it. All PHI-minimal (codes + numbers, never narrative).
   */
  riskProfile?: RiskProfileSummary;
  coverage?: CoverageSummary;
  utilization?: UtilizationSummary;
  alerts?: AlertSummary;
  /**
   * Da Vinci Risk Adjustment coding gaps (projected-graph path only). PHI-minimal and
   * consent-filtered — a SUD-linked (Part 2) coding gap is excluded unless the read
   * scope covers it. A coding gap is a payer-analytics HYPOTHESIS, never an asserted
   * diagnosis, so `suspectType` is surfaced alongside `evidenceStatus`.
   */
  codingGaps?: CodingGapSummary;
}

/** Risk-stratification summary from RiskAssessment nodes (PHI-minimal: numbers + codes). */
export interface RiskProfileSummary {
  assessments: {
    predictedOutcome: string;
    probability: number;
    rafScore: number;
    method: string;
  }[];
  /** The highest RAF score across the member's assessments (0 when none). */
  highestRaf: number;
  /**
   * Hierarchy-aware RAF (Wave D) computed from the member's ASSERTED (coded) HCCs, with
   * disease-hierarchy suppression applied — never a naive sum. Absent when the member
   * has no coded HCCs. Shape mirrors `HierarchicalRaf` (kept inline so this types module
   * stays free of runtime imports).
   */
  hierarchicalRaf?: {
    raf: number;
    version: string;
    includedHccs: string[];
    suppressedHccs: string[];
    unweightedHccs: string[];
  };
  /**
   * ADVISORY RAF uplift SUGGESTED by the ICD→HCC crosswalk for conditions coded with an
   * ICD but no HCC — for human review, NEVER an asserted diagnosis. Absent when nothing
   * is suggested. `fromIcds` names the ICDs that produced the suggestion.
   */
  suggestedRaf?: { raf: number; version: string; fromIcds: string[] };
}

/** Coverage summary from Coverage nodes (PHI-minimal: plan code + status + period). */
export interface CoverageSummary {
  plans: { planCode: string; status: string; periodStart: string; periodEnd: string }[];
}

/** Utilization summary from Encounter nodes (PHI-minimal: count + encounter classes). */
export interface UtilizationSummary {
  encounterCount: number;
  classes: string[];
}

/** Alert summary from Flag nodes (PHI-minimal: active count + category codes). */
export interface AlertSummary {
  activeCount: number;
  categories: string[];
}

/**
 * Coding-gap summary from CodingGap nodes (Da Vinci Risk Adjustment). PHI-minimal:
 * HCC condition-category codes, statuses, and suspect types only — never narrative.
 */
export interface CodingGapSummary {
  gaps: {
    conditionCategory: string;
    model: string;
    modelVersion: string;
    evidenceStatus: string;
    suspectType: string;
    hierarchicalStatus: string;
  }[];
  /** Count of open-gaps (open + pending) — the actionable recapture backlog. */
  openCount: number;
  /** Count of gaps flagged `suspected` — hypotheses requiring clinical confirmation. */
  suspectedCount: number;
}

export interface HolisticContextProvenance {
  source: 'projected-graph';
  projectedSections: string[];
  neutralSections: string[];
}

/** Care-team composition surfaced from the care-team lens (consent-filtered). */
export interface CareTeamSummary {
  memberCount: number;
  roles: string[];
}

/**
 * 42 CFR Part 2 restriction status. `restrictedNodeCount` is how many restricted
 * nodes the consent-filtered lens returned; `disclosed` is whether the read scope
 * actually granted Part 2 data — so (disclosed=false, count=0) is an ENFORCED
 * restriction, not merely an absence of restricted data.
 */
export interface Part2RestrictionSummary {
  /**
   * Restricted nodes surfaced under the read scope. `null` when the scope did NOT
   * grant Part 2 — the count is then UNKNOWN (restricted data may exist, withheld),
   * and is never asserted as zero. Authoritative only when `disclosed` is true.
   */
  restrictedNodeCount: number | null;
  disclosed: boolean;
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
  // Honest defaults (WPC Unit 1): 'unknown' / optional fields let an absent fact be
  // ABSENT rather than a fabricated 'urban'/0/false. `dataAvailability` discriminates
  // a real reading from a fail-closed unknown.
  ruralStatus: 'urban' | 'suburban' | 'rural' | 'frontier' | 'unknown';
  distanceToProvider?: number; // miles
  publicTransitAvailable?: boolean;
  broadbandAccess?: boolean;
  cellularCoverage?: 'excellent' | 'good' | 'fair' | 'poor' | 'none';
  nearestPharmacy?: number; // miles
  nearestER?: number; // miles
  distanceToNearestFacility?: number;
  nearestLabLocation?: string;
  dataAvailability?: 'reported' | 'partial' | 'unknown';
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
