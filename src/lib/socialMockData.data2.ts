// ─── socialMockData.data2.ts ──────────────────────────────────────────────────
// CHW visits, outreach log, crisis events/contacts, CBO directory,
// and shared UI color/status config maps.

import type { CHWVisit, OutreachRecord, CrisisEvent, CBO } from './socialMockData.types';

// ─── CHW Home Visits ──────────────────────────────────────────────────────────

export const CHW_VISITS: CHWVisit[] = [
  {
    id: 'v-000',
    patientId: 'MARIA_SD_001',
    patient: 'Maria Redhawk',
    mrn: 'MRN-SD-001',
    address: '412 Prairie Main St, Martin, SD 57551 (Bennett County)',
    date: '2026-06-04',
    time: '9:00 AM',
    purpose: 'SNAP renewal + WIC enrollment + Edinburgh PND screening + A1C recheck scheduling',
    status: 'scheduled',
    priority: 'High',
    riskScore: 78,
  },
  {
    id: 'v-001',
    patientId: 'PAT-0042',
    patient: 'Dorothy Simmons',
    mrn: 'MRN-0042',
    address: '3301 Regional Ave, Martin, SD 57551',
    date: '2026-06-04',
    time: '10:00 AM',
    purpose: 'SNAP recertification + Meals on Wheels enrollment + BH check-in',
    status: 'scheduled',
    priority: 'High',
    riskScore: 92,
  },
  {
    id: 'v-002',
    patientId: 'PAT-0087',
    patient: 'James Wilson',
    mrn: 'MRN-0087',
    address: '1842 Cedar Bluff Street, Winner, SD 57580',
    date: '2026-06-04',
    time: '2:00 PM',
    purpose: 'BH medication adherence check + transport benefit follow-up',
    status: 'scheduled',
    priority: 'High',
    riskScore: 87,
  },
  {
    id: 'v-003',
    patientId: 'PAT-0156',
    patient: 'Lisa Thompson',
    mrn: 'MRN-0156',
    address: '789 Riverside Blvd, Gregory, SD 57533',
    date: '2026-06-05',
    time: '11:00 AM',
    purpose: 'Housing application follow-up + SNAP renewal check',
    status: 'scheduled',
    priority: 'High',
    riskScore: 84,
  },
  {
    id: 'v-004',
    patientId: 'PAT-0103',
    patient: 'Robert Chen',
    mrn: 'MRN-0103',
    address: '512 Statehouse Ave, Pierre, SD 57501',
    date: '2026-06-03',
    time: '9:00 AM',
    purpose: 'Workforce enrollment assistance + SNAP renewal',
    status: 'completed',
    priority: 'Medium',
    riskScore: 61,
  },
  {
    id: 'v-005',
    patientId: 'PAT-0201',
    patient: 'James Okafor',
    mrn: 'MRN-0201',
    address: '4400 E Hwy 18, Oglala, SD 57764',
    date: '2026-06-06',
    time: '1:00 PM',
    purpose: 'Post-crisis follow-up + BH care plan review + housing navigation',
    status: 'scheduled',
    priority: 'High',
    riskScore: 89,
  },
];

// ─── CHW Outreach Log ─────────────────────────────────────────────────────────

export const OUTREACH_LOG: OutreachRecord[] = [
  {
    id: 'ol-001',
    patientId: 'PAT-0042',
    patient: 'Dorothy Simmons',
    date: '2026-05-30',
    channel: 'In-Person',
    outcome: 'Completed',
    notes:
      'Home visit. SNAP expired — completed recertification paperwork. Meals on Wheels waitlist application submitted. BH counselor notified of mood concerns.',
    nextAction: '2026-06-04 follow-up home visit',
  },
  {
    id: 'ol-002',
    patientId: 'PAT-0087',
    patient: 'James Wilson',
    date: '2026-05-28',
    channel: 'Phone',
    outcome: 'Reached',
    notes:
      'Confirmed BH medication adherence. Patient reports anxiety increasing. Scheduled home visit and notified BH counselor.',
    nextAction: '2026-06-04 home visit',
  },
  {
    id: 'ol-003',
    patientId: 'PAT-0201',
    patient: 'James Okafor',
    date: '2026-05-31',
    channel: 'Phone',
    outcome: 'Left VM',
    notes:
      'Called to schedule post-crisis follow-up. Left voicemail. Crisis team confirmed stabilization.',
    nextAction: '2026-06-02 retry + 2026-06-06 home visit',
  },
  {
    id: 'ol-004',
    patientId: 'PAT-0156',
    patient: 'Lisa Thompson',
    date: '2026-05-29',
    channel: 'Phone',
    outcome: 'Reached',
    notes:
      'Confirmed housing application status. Patient anxious about timeline. Reassured and escalated to housing CBO. SNAP renewal reminder sent.',
    nextAction: '2026-06-05 home visit',
  },
  {
    id: 'ol-005',
    patientId: 'PAT-0103',
    patient: 'Robert Chen',
    date: '2026-06-03',
    channel: 'In-Person',
    outcome: 'Completed',
    notes:
      'Home visit completed. Workforce Development enrollment paperwork submitted. SNAP renewal confirmed active through Aug 2026.',
    nextAction: 'Follow up on workforce enrollment status',
  },
];

// ─── Crisis Events ────────────────────────────────────────────────────────────

export const ACTIVE_CRISES: CrisisEvent[] = [
  {
    id: 'cr-001',
    patientId: 'PAT-0201',
    patient: 'James Okafor',
    mrn: 'MRN-0201',
    age: 65,
    trigger:
      'Suicidal ideation — passive, no plan. Expressed hopelessness related to housing instability and financial stress.',
    acuity: 'High',
    timestamp: '2026-06-02 09:14',
    assignedTo: 'Sarah Johnson (CM)',
    status: 'dispatched',
    dispatchedTo: 'Swope Health Crisis Team',
    notes:
      'Patient expressed hopelessness during phone check-in. No immediate plan. CHW notified. Crisis team dispatched. BH counselor on standby.',
  },
  {
    id: 'cr-002',
    patientId: 'PAT-0087',
    patient: 'James Wilson',
    mrn: 'MRN-0087',
    age: 77,
    trigger: 'Acute anxiety — panic attack, chest pain ruled out by ED triage',
    acuity: 'Medium',
    timestamp: '2026-06-01 15:42',
    assignedTo: 'Sarah Johnson (CM)',
    status: 'stabilized',
    dispatchedTo: '988 Lifeline',
    notes:
      'Patient called 988. Stabilized via phone counseling. Follow-up BH Task created. CHW home visit scheduled for 2026-06-04.',
  },
];

// ─── Crisis Dispatch Contacts ─────────────────────────────────────────────────

export const CRISIS_CONTACTS = [
  {
    id: 'c-001',
    name: '988 Suicide & Crisis Lifeline — SD',
    type: '988',
    phone: '988',
    description:
      'Call or text 988 — 24/7 mental health crisis support. SD-specific counselors available.',
    available: true,
    responseTime: 'Immediate',
  },
  {
    id: 'c-002',
    name: 'Summit Regional Crisis Stabilization Unit',
    type: 'CSU',
    phone: '(605) 555-0172',
    description:
      'Walk-in crisis stabilization — 23-hour observation, no ED required. 1450 Summit Ridge Rd, Rapid City, SD 57701',
    available: true,
    responseTime: '< 30 min',
  },
  {
    id: 'c-003',
    name: 'Cedar Valley Behavioral Health Mobile Crisis',
    type: 'Mobile',
    phone: '(605) 555-0161',
    description: 'Mobile crisis team dispatch — community-based de-escalation across western SD',
    available: true,
    responseTime: '30–60 min',
  },
  {
    id: 'c-004',
    name: 'Cedar Valley Hospital ED',
    type: 'ED',
    phone: '(605) 555-0181',
    description:
      'Emergency Department — psychiatric evaluation and stabilization. 820 Cedar Bluff Dr, Winner, SD 57580',
    available: true,
    responseTime: 'Varies',
  },
];

// ─── CBO Directory ────────────────────────────────────────────────────────────

export const CBOS: CBO[] = [
  {
    id: 'cbo-001',
    name: 'Frontier Community Action CBO',
    type: 'Community Action',
    domain: 'Financial',
    counties: ['Bennett'],
    phone: '(605) 555-0166',
    address: '212 Frontier Way, Martin, SD 57551',
    capacity: 'Accepting',
    activeReferrals: 47,
    completionRate: 91,
    avgDaysToClose: 4,
    certifications: ['USDA Partner', 'SNAP Enrollment', 'Unite Us Partner'],
    contact: 'Angela Torres',
    linkedPatients: ['MARIA_SD_001', 'PAT-0042', 'PAT-0103', 'PAT-0156'],
  },
  {
    id: 'cbo-002',
    name: 'State Housing Finance Agency',
    type: 'Housing Authority',
    domain: 'Housing',
    counties: ['Bennett', 'Hughes', 'Pennington'],
    phone: '(605) 555-0174',
    address: '500 Capitol Plaza, Pierre, SD 57501',
    capacity: 'Waitlist',
    activeReferrals: 23,
    completionRate: 68,
    avgDaysToClose: 45,
    certifications: ['HUD Certified', 'Section 8 Admin', 'State Housing Finance Agency'],
    contact: 'Housing Navigator',
    linkedPatients: ['MARIA_SD_001', 'PAT-0042', 'PAT-0156', 'PAT-0201'],
  },
  {
    id: 'cbo-003',
    name: 'Cedar Valley BH',
    type: 'FQHC / BH',
    domain: 'Behavioral Health',
    counties: ['Tripp', 'Bennett', 'Gregory'],
    phone: '(605) 555-0181',
    address: '820 Cedar Bluff Dr, Winner, SD 57580',
    capacity: 'Accepting',
    activeReferrals: 31,
    completionRate: 84,
    avgDaysToClose: 12,
    certifications: ['CCBHC', 'CAH', 'Crisis Certified'],
    contact: 'Dr. Sarah Nakamura',
    linkedPatients: ['MARIA_SD_001', 'PAT-0042', 'PAT-0087', 'PAT-0201'],
  },
  {
    id: 'cbo-004',
    name: 'Medicaid NEMT — Bennett County',
    type: 'Transport Coordinator',
    domain: 'Transportation',
    counties: ['Bennett', 'Tripp', 'Gregory'],
    phone: '(800) 555-0190',
    address: '410 Prairie Ridge Rd, Martin, SD 57551',
    capacity: 'Accepting',
    activeReferrals: 18,
    completionRate: 96,
    avgDaysToClose: 2,
    certifications: ['Medicaid NEMT', 'ADA Compliant', 'SD Medicaid'],
    contact: 'Transport Coordinator',
    linkedPatients: ['MARIA_SD_001', 'PAT-0087', 'PAT-0156'],
  },
  {
    id: 'cbo-005',
    name: 'State Area Agency on Aging',
    type: 'Senior Services',
    domain: 'Social Isolation',
    counties: ['Bennett', 'Tripp', 'Gregory', 'Fall River'],
    phone: '(605) 555-0177',
    address: '700 Statehouse Dr, Pierre, SD 57501',
    capacity: 'Waitlist',
    activeReferrals: 14,
    completionRate: 78,
    avgDaysToClose: 21,
    certifications: ['Older Americans Act', 'Meals on Wheels', 'State DOH'],
    contact: 'Senior Services Coordinator',
    linkedPatients: ['PAT-0042', 'PAT-0087'],
  },
  {
    id: 'cbo-006',
    name: 'Prairie Roots Food Network',
    type: 'Tribal Services',
    domain: 'Food',
    counties: ['Oglala Lakota', 'Bennett'],
    phone: '(605) 555-0183',
    address: '45 Cottonwood Dr, Pine Ridge, SD 57770',
    capacity: 'Accepting',
    activeReferrals: 9,
    completionRate: 88,
    avgDaysToClose: 3,
    certifications: ['USDA Partner', 'Tribal SNAP', 'IHS Partner'],
    contact: 'Tribal Services Coordinator',
    linkedPatients: ['PAT-0156', 'PAT-0201'],
  },
  {
    id: 'cbo-007',
    name: 'State Workforce Office — Frontier District',
    type: 'Employment Services',
    domain: 'Employment',
    counties: ['Bennett', 'Tripp', 'Gregory'],
    phone: '(605) 555-0168',
    address: '410 Prairie Ridge Rd, Martin, SD 57551',
    capacity: 'Accepting',
    activeReferrals: 7,
    completionRate: 72,
    avgDaysToClose: 30,
    certifications: ['WIOA Partner', 'State Workforce Agy'],
    contact: 'Employment Specialist',
    linkedPatients: ['PAT-0103'],
  },
];

// ─── Shared Color Maps & UI Config ───────────────────────────────────────────

export const PROGRAM_DOMAIN_COLORS: Record<string, string> = {
  Housing: '#da1e28',
  'Food Security': '#b45309',
  Transportation: '#0043ce',
  'Behavioral Health': '#6929c4',
  Financial: '#007d79',
  'Social Isolation': '#8a3ffc',
  'Care Coordination': '#198038',
  Employment: '#007d79',
};

export const STATUS_CONFIG = {
  eligible: { label: 'Eligible', bg: '#d0e2ff', text: '#0043ce', icon: 'CheckCircleIcon' },
  enrolled: { label: 'Enrolled', bg: '#defbe6', text: '#0e6027', icon: 'CheckBadgeIcon' },
  pending: { label: 'Pending', bg: '#fdf6dd', text: '#b45309', icon: 'ClockIcon' },
  expired: { label: 'Expired', bg: '#fff1f1', text: '#da1e28', icon: 'ExclamationCircleIcon' },
  'not-eligible': {
    label: 'Not Eligible',
    bg: '#f4f4f4',
    text: '#6f6f6f',
    icon: 'MinusCircleIcon',
  },
};

export const ENROLLMENT_STATUS_CONFIG = {
  active: { label: 'Active', bg: '#defbe6', text: '#0e6027', icon: 'CheckBadgeIcon' },
  pending: { label: 'Pending', bg: '#fdf6dd', text: '#b45309', icon: 'ClockIcon' },
  expired: { label: 'Expired', bg: '#fff1f1', text: '#da1e28', icon: 'ExclamationCircleIcon' },
  gap: { label: 'Coverage Gap', bg: '#fff1f1', text: '#da1e28', icon: 'ExclamationTriangleIcon' },
};
