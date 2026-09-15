// SMART on FHIR + CDS Hooks type definitions

// ─── SMART Launch Context ─────────────────────────────────────────────────────
export interface SmartLaunchContext {
  patientId: string;
  encounterId: string;
  practitionerId: string;
  practitionerName: string;
  practitionerNpi: string;
  fhirBaseUrl: string;
  accessToken: string;
  tokenExpiry: number;
  launchTimestamp: string;
  cernerOrgId: string;
  // Optional fields used by audit log and display
  launchToken?: string;
  patientName?: string;
  encounterType?: string;
}

// ─── FHIR Resources ───────────────────────────────────────────────────────────
export interface FhirServiceRequest {
  resourceType: 'ServiceRequest';
  id?: string;
  status: 'draft' | 'active' | 'completed' | 'revoked';
  intent: 'order' | 'proposal' | 'plan';
  category: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  encounter?: FhirReference;
  requester?: FhirReference;
  performer?: FhirReference[];
  reasonCode?: FhirCodeableConcept[];
  note?: FhirAnnotation[];
  authoredOn?: string;
  priority?: 'routine' | 'urgent' | 'stat';
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirReference {
  reference: string;
  display?: string;
}

export interface FhirAnnotation {
  text: string;
  time?: string;
}

// ─── CDS Hooks ────────────────────────────────────────────────────────────────
export type CdsHookType =
  'patient-view' | 'encounter-start' | 'order-select' | 'order-sign' | 'care-gap-closure';

export type CdsCardType = 'info' | 'warning' | 'critical' | 'suggestion' | 'smart-link';

export interface CdsCard {
  id: string;
  hookType: CdsHookType;
  cardType: CdsCardType;
  summary: string;
  detail?: string;
  source: string;
  indicator: 'info' | 'warning' | 'critical';
  suggestions?: CdsSuggestion[];
  links?: CdsLink[];
  overrideReasons?: string[];
  acknowledged?: boolean;
  snoozedUntil?: string;
  overrideReason?: string;
  timestamp: string;
}

export interface CdsSuggestion {
  id: string;
  label: string;
  actions: CdsSuggestionAction[];
}

export interface CdsSuggestionAction {
  type: 'create' | 'update' | 'delete';
  description: string;
  resource?: FhirServiceRequest;
}

export interface CdsLink {
  label: string;
  url: string;
  type: 'absolute' | 'smart';
  appContext?: string;
}

// ─── Order Types ──────────────────────────────────────────────────────────────
export type OrderCategory = 'medication' | 'lab' | 'referral' | 'procedure' | 'imaging';
export type OrderPriority = 'routine' | 'urgent' | 'stat';
export type OrderStatus = 'draft' | 'pending-sign' | 'signed' | 'submitted' | 'cancelled';

export interface MdOrder {
  id: string;
  category: OrderCategory;
  code: string;
  display: string;
  priority: OrderPriority;
  status: OrderStatus;
  note?: string;
  fromCdsSuggestion?: boolean;
  cdsSuggestionId?: string;
  fhirServiceRequestId?: string;
  createdAt: string;
  signedAt?: string;
}

// ─── Care Team Assignment ─────────────────────────────────────────────────────
export interface CareTeamAssignment {
  id: string;
  patientId: string;
  encounterId: string;
  providerId: string;
  providerName: string;
  providerNpi: string;
  specialty: string;
  role: 'PCP' | 'Specialist' | 'Care Coordinator' | 'Behavioral Health' | 'Pharmacist';
  networkTier: 'Preferred' | 'In-Network' | 'Out-of-Network';
  qualityScore: number;
  waitDays: number;
  distance: number;
  autoSelected: boolean;
  selectionReason: string;
  status: 'proposed' | 'confirmed' | 'submitted';
  fhirServiceRequestId?: string;
  confirmedAt?: string;
}

// ─── Patient Journey ──────────────────────────────────────────────────────────
export type JourneyPhase =
  | 'stable-management'
  | 'deteriorating'
  | 'high-risk-transition'
  | 'post-acute-recovery'
  | 'gap-in-care';

export interface PatientJourneyPosition {
  phase: JourneyPhase;
  phaseLabel: string;
  phaseDescription: string;
  signals: JourneySignal[];
  riskTrajectory: 'improving' | 'stable' | 'worsening';
  daysInPhase: number;
  nextMilestone: string;
  urgencyScore: number; // 0-100
}

export interface JourneySignal {
  source: 'EMR' | 'Claims' | 'LPR' | 'HIE';
  label: string;
  value: string;
  flagged: boolean;
}

// ─── Cerner Return Payload ────────────────────────────────────────────────────
export interface CernerReturnPayload {
  encounterId: string;
  patientId: string;
  completedOrders: string[];
  signedServiceRequestIds: string[];
  careTeamAssignments: string[];
  careGapsClosed: string[];
  returnTimestamp: string;
  returnReason: 'order-signed' | 'team-assigned' | 'manual';
}
