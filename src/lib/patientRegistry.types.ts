// patientRegistry.types.ts — Type and interface declarations for the patient registry

export interface CareGapEntry {
  id: string;
  domain: 'Clinical' | 'BH' | 'Social';
  name: string;
  status: 'Open' | 'In Progress' | 'Closed' | 'Waived';
  daysOpen: number;
  assignedTo: string;
}

export interface ConditionEntry {
  key: string;
  code: string;
  name: string;
  onset: string;
  status: string;
  source: string;
}

export interface MedicationEntry {
  key: string;
  name: string;
  dose: string;
  frequency: string;
  prescriber: string;
  lastFill: string;
  adherence: number | null;
  ddi: boolean;
}

export interface OrderEntry {
  key: string;
  type: string;
  name: string;
  result: string;
  date: string;
  status: string;
  flag: string | null;
}

export interface PathwayStepEntry {
  id: string;
  label: string;
  status: 'completed' | 'in_progress' | 'pending';
  date?: string;
  metric?: string;
}

export interface CdsCardEntry {
  id: string;
  indicator: 'critical' | 'warning' | 'info';
  summary: string;
  detail: string;
}

export interface HouseholdDependentRec {
  name: string;
  relation: string;
  age: number;
  dob: string;
  plan: string;
  consent: string;
  gaps: { label: string; urgency: 'critical' | 'high' | 'due'; detail: string }[];
  coordinatedOutreach?: string;
}

export interface HouseholdCaregiverRec {
  name: string;
  relation: string;
  age: number;
  condition: string;
  clinicalMetric: string;
  pharmacy: string;
  prescriber: string;
  meds: { name: string; dose: string; indication: string }[];
  consentScopeItems: string[];
  consentExclusions: string[];
}

export interface Household {
  dependents?: HouseholdDependentRec[];
  caregiverFor?: HouseholdCaregiverRec[];
}

export interface RegistryPatient {
  platformId: string;
  fhirId: string;
  ehrMrn: string;
  mockOnly?: boolean;
  name: string;
  age: number;
  gender: string;
  dob: string;
  location: string;
  phone: string;
  pcp: string;
  careManager: string;
  careManagerInitials: string;
  organization: string;
  contract: string;
  attribution: string;
  rafScore: number;
  riskTier: 'Critical' | 'High' | 'Moderate' | 'Low';
  riskLabel: string;
  erRiskPct: number;
  hccSuspects: number;
  hccValue: number;
  openCareGaps: number;
  episodeType: string;
  episodeStatus: 'Active' | 'Stable' | 'Closed' | 'Escalated';
  episodeDaysActive: number;
  pmpm: number;
  pmpmTarget: number;
  lastContact: string;
  bhScreeningLabel: string;
  bhScore: number | null;
  bhScoreLabel: string;
  auditC: number;
  bhRisk: 'Low' | 'Moderate' | 'High' | 'Crisis';
  bhReferralStatus: string;
  bhProvider: string;
  burdenScore: string;
  patientGoal: string;
  transportStatus: string;
  foodSecurity: string;
  housingStatus: string;
  language: string;
  ruralDistance: string;
  disparityFlag: string;
  cohortFlag: string;
  snapStatus: string;
  digitalAccess: string;
  careGaps: CareGapEntry[];
  pathwaySteps: PathwayStepEntry[];
  aiCopilot: string;
  cdsCards: CdsCardEntry[];
  conditions?: ConditionEntry[];
  medications?: MedicationEntry[];
  recentOrders?: OrderEntry[];
  carePlanDomains?: CarePlanDomain[];
  recentEncounters?: {
    id: string;
    date: string;
    type: string;
    setting: string;
    provider: string;
    reason: string;
    status: string;
  }[];
  fhirGoals?: { id: string; description: string; status: string; dueDate: string; note: string }[];
  household?: Household;
  journey?: { id: string; currentDay: number };
}

export interface CarePlanGoal {
  goal: string;
  status: string;
  owner: string;
  dueDate: string;
  tasks: string[];
}

export interface CarePlanDomain {
  domain: string;
  color: string;
  icon: string;
  goals: CarePlanGoal[];
}
