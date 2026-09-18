'use client';

// ─── fhirCareTeamData.types.ts ────────────────────────────────────────────────
// Type aliases and interfaces for FHIR CareTeam & Task mock data.

export type CareTeamRoleCategory =
  'Clinical' | 'Care Management' | 'Behavioral Health' | 'Community & Social';
export type TaskProgramType =
  | 'Clinical'
  | 'Behavioral Health'
  | 'Food Security'
  | 'Housing'
  | 'Transportation'
  | 'Social Isolation';
export type TaskStatus =
  'requested' | 'accepted' | 'in-progress' | 'completed' | 'rejected' | 'cancelled';
export type TaskPriority = 'routine' | 'urgent' | 'asap' | 'stat';

export interface FHIRCareTeamParticipant {
  id: string;
  name: string;
  roleCode: string;
  roleDisplay: string;
  roleCategory: CareTeamRoleCategory;
  organization: string;
  organizationId: string;
  contact: string;
  period: { start: string; end?: string };
  onBehalfOf: string;
  activeTaskCount: number;
  status: 'active' | 'inactive';
  participantType: 'Practitioner' | 'PractitionerRole' | 'RelatedPerson' | 'Organization';
}

export interface FHIRCareTeam {
  resourceType: 'CareTeam';
  id: string;
  status: 'active' | 'inactive';
  name: string;
  subject: { reference: string; display: string };
  managingOrganization: string;
  participants: FHIRCareTeamParticipant[];
  period: { start: string };
}

export interface FHIRTask {
  id: string;
  resourceType: 'Task';
  status: TaskStatus;
  intent: 'order' | 'plan' | 'proposal';
  priority: TaskPriority;
  programType: TaskProgramType;
  code: string;
  description: string;
  for: { reference: string; display: string };
  requester: { reference: string; display: string; role: string };
  owner: { reference: string; display: string; role: string; organization: string };
  authoredOn: string;
  lastModified: string;
  dueDate: string;
  basedOn?: string;
  reasonCode?: string;
  reasonDisplay?: string;
  output?: {
    type: string;
    valueReference: string;
    description: string;
    date: string;
  };
  note?: string;
  gainShareValue?: string;
  qualityMeasureImpact?: string;
}

export interface CareTeamInboxTask extends FHIRTask {
  patientName: string;
  patientId: string;
  patientDob: string;
  patientRiskTier: string;
  assignedParticipantId: string;
}
