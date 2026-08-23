// Care plans, care plan templates, ReferralStore singleton, and episodes of care
import { log } from '@/lib/server/log'; // structured logging seam
import * as clock from './clock'; // determinism seam (Cycle 1)
import type {
  CarePlan, Referral, QualityMetrics, GainshareRecord, Episode,
} from './mockData.types';
import { mockCareGaps } from './mockData.data';

// ── CARE PLANS ──────────────────────────────────────────────
export const mockCarePlans: CarePlan[] = [
  {
    id: 'careplan-001',
    patientId: 'patient-001',
    title: 'Hypertension Management',
    description: 'Comprehensive management of uncontrolled hypertension with specialist consultation and home monitoring program.',
    status: 'Active',
    template: 'Cardiology',
    createdDate: '2026-05-20',
    startDate: '2026-05-20',
    endDate: '2026-11-20',
    lastUpdated: '2026-05-20',
    createdBy: 'Dr. James Whitfield',
    addresses: ['I10 - Essential Hypertension', 'Medication non-response'],
    goals: [
      { id: 'goal-001', description: 'Blood Pressure Control', target: '<140/90 mmHg', current: '165/95 mmHg', status: 'In Progress', dueDate: '2026-08-20', progress: 40, notes: 'Patient reports good medication compliance. BP trending down slowly.' },
      { id: 'goal-002', description: 'Sodium Intake Reduction', target: '<2000mg/day', current: '~3500mg/day (estimated)', status: 'In Progress', dueDate: '2026-08-20', progress: 20, notes: 'Dietitian consultation scheduled. Patient education materials provided.' },
    ],
    interventions: [
      { id: 'intervention-001', type: 'Referral', description: 'Cardiology Consultation', status: 'Scheduled', scheduledDate: '2026-06-01', provider: 'Dr. Emily Chen', notes: 'Evaluation for medication adjustment or additional therapy.' },
      { id: 'intervention-002', type: 'Monitoring', description: 'Home BP Monitoring', status: 'Active', scheduledDate: '2026-05-20', frequency: 'Twice daily', notes: 'Patient provided with home BP monitor. Last reading: 162/93 (May 19, 8:00 AM)' },
      { id: 'intervention-003', type: 'Appointment', description: 'Follow-up Appointment', status: 'Scheduled', scheduledDate: '2026-06-15', provider: 'Dr. James Whitfield', notes: 'Review cardiology consultation and adjust treatment plan.' },
      { id: 'intervention-004', type: 'Medication', description: 'Medication Review', status: 'Pending', notes: 'Pending cardiology input. Current: Lisinopril 20mg daily.' },
    ],
    careTeam: [
      { id: 'team-001', name: 'Dr. James Whitfield', role: 'Primary Care Physician', relationship: 'Primary', phone: '(312) 555-0100' },
      { id: 'team-002', name: 'Dr. Emily Chen', role: 'Cardiologist', specialty: 'Cardiology', relationship: 'Consultant', phone: '(312) 555-0200' },
      { id: 'team-003', name: 'Angela Torres, NP', role: 'Care Manager', relationship: 'Care Manager', phone: '(312) 555-0150' },
    ],
    clinicalNotes: [
      { date: '2026-05-20', author: 'Dr. James Whitfield', note: 'Patient reports medication compliance. BP remains elevated despite 6 months on Lisinopril 20mg. Referring to cardiology for evaluation of medication adjustment or additional therapy. Home BP monitoring initiated.' },
    ],
    sharedWith: ['Dr. Emily Chen (Cardiology)', 'Patient Portal'],
  },
  {
    id: 'careplan-002',
    patientId: 'patient-001',
    title: 'Diabetes Care Plan',
    description: 'Type 2 diabetes management with focus on glycemic control and prevention of complications.',
    status: 'Active',
    template: 'Endocrinology',
    createdDate: '2026-01-15',
    startDate: '2026-01-15',
    endDate: '2027-01-15',
    lastUpdated: '2026-05-18',
    createdBy: 'Dr. James Whitfield',
    addresses: ['E11.9 - Type 2 Diabetes Mellitus', 'Suboptimal glycemic control'],
    goals: [
      { id: 'goal-003', description: 'HbA1c Control', target: '<7.0%', current: '7.8%', status: 'In Progress', dueDate: '2026-07-15', progress: 60, notes: 'Improved from 8.2% three months ago. Continue current regimen.' },
      { id: 'goal-004', description: 'Daily Blood Glucose Monitoring', target: 'Fasting <130 mg/dL', current: 'Avg 145 mg/dL', status: 'In Progress', dueDate: '2026-07-15', progress: 50 },
      { id: 'goal-005', description: 'Diabetic Retinopathy Screening', target: 'Annual exam completed', current: 'Completed 2026-03-10', status: 'Achieved', dueDate: '2026-03-31', progress: 100, notes: 'No retinopathy detected. Next screening due March 2027.' },
    ],
    interventions: [
      { id: 'intervention-005', type: 'Education', description: 'Diabetes Self-Management Education', status: 'Completed', scheduledDate: '2026-02-01', completedDate: '2026-02-15', notes: '4-session program completed. Patient demonstrates good understanding.' },
      { id: 'intervention-006', type: 'Monitoring', description: 'Continuous Glucose Monitoring', status: 'Active', frequency: 'Daily', notes: 'Patient using CGM device. Data reviewed weekly.' },
      { id: 'intervention-007', type: 'Appointment', description: 'Quarterly Diabetes Check', status: 'Scheduled', scheduledDate: '2026-07-15', provider: 'Dr. James Whitfield' },
    ],
    careTeam: [
      { id: 'team-004', name: 'Dr. James Whitfield', role: 'Primary Care Physician', relationship: 'Primary', phone: '(312) 555-0100' },
      { id: 'team-005', name: 'Sarah Mitchell, RD', role: 'Diabetes Educator', relationship: 'Support', phone: '(312) 555-0175' },
    ],
    clinicalNotes: [
      { date: '2026-05-18', author: 'Dr. James Whitfield', note: 'HbA1c improved to 7.8% from 8.2%. Patient adherent to medication and diet plan. Continue current management. Next HbA1c in 2 months.' },
      { date: '2026-03-10', author: 'Dr. James Whitfield', note: 'Annual diabetic retinopathy screening completed. No retinopathy detected. Patient counseled on importance of continued glycemic control.' },
    ],
    sharedWith: ['Patient Portal', 'Diabetes Educator'],
  },
];

// ── CARE PLAN TEMPLATES ──────────────────────────────────────
export const carePlanTemplates = {
  Cardiology: {
    title: 'Cardiology Referral Care Plan',
    defaultGoals: [
      { description: 'Blood Pressure Control', target: '<140/90 mmHg' },
      { description: 'Medication Optimization', target: 'Effective BP control with minimal side effects' },
    ],
    defaultInterventions: [
      { type: 'Referral' as const, description: 'Cardiology Consultation' },
      { type: 'Monitoring' as const, description: 'Home BP Monitoring', frequency: 'Twice daily' },
      { type: 'Appointment' as const, description: 'Follow-up Appointment' },
    ],
  },
  Endocrinology: {
    title: 'Endocrinology Referral Care Plan',
    defaultGoals: [
      { description: 'HbA1c Control', target: '<7.0%' },
      { description: 'Blood Glucose Monitoring', target: 'Fasting <130 mg/dL' },
    ],
    defaultInterventions: [
      { type: 'Referral' as const, description: 'Endocrinology Consultation' },
      { type: 'Monitoring' as const, description: 'Blood Glucose Monitoring', frequency: 'Daily' },
      { type: 'Education' as const, description: 'Diabetes Self-Management Education' },
    ],
  },
  Pulmonology: {
    title: 'Pulmonology Referral Care Plan',
    defaultGoals: [
      { description: 'Respiratory Function', target: 'Improved lung function tests' },
      { description: 'Symptom Management', target: 'Reduced dyspnea episodes' },
    ],
    defaultInterventions: [
      { type: 'Referral' as const, description: 'Pulmonology Consultation' },
      { type: 'Monitoring' as const, description: 'Peak Flow Monitoring', frequency: 'Daily' },
      { type: 'Medication' as const, description: 'Inhaler Technique Review' },
    ],
  },
  Nephrology: {
    title: 'Nephrology Referral Care Plan',
    defaultGoals: [
      { description: 'Kidney Function Preservation', target: 'Stable eGFR' },
      { description: 'Blood Pressure Control', target: '<130/80 mmHg' },
    ],
    defaultInterventions: [
      { type: 'Referral' as const, description: 'Nephrology Consultation' },
      { type: 'Monitoring' as const, description: 'Kidney Function Labs', frequency: 'Monthly' },
      { type: 'Education' as const, description: 'Kidney Disease Education' },
    ],
  },
  Orthopedics: {
    title: 'Orthopedics Referral Care Plan',
    defaultGoals: [
      { description: 'Pain Management', target: 'Pain level <3/10' },
      { description: 'Functional Improvement', target: 'Improved mobility and ADLs' },
    ],
    defaultInterventions: [
      { type: 'Referral' as const, description: 'Orthopedic Consultation' },
      { type: 'Referral' as const, description: 'Physical Therapy' },
      { type: 'Medication' as const, description: 'Pain Management Review' },
    ],
  },
  Neurology: {
    title: 'Neurology Referral Care Plan',
    defaultGoals: [
      { description: 'Neurological Assessment', target: 'Complete neurological evaluation' },
      { description: 'Symptom Control', target: 'Reduced symptom frequency/severity' },
    ],
    defaultInterventions: [
      { type: 'Referral' as const, description: 'Neurology Consultation' },
      { type: 'Procedure' as const, description: 'Neurological Imaging' },
      { type: 'Appointment' as const, description: 'Follow-up Appointment' },
    ],
  },
};

// ── REFERRAL STORE ───────────────────────────────────────────
class ReferralStore {
  private referrals: Referral[] = [
    {
      referralId: 'ref-001',
      serviceRequestId: 'sr-001',
      patientName: 'Maria Reyes',
      patientId: 'patient-001',
      patientDOB: '1957-03-14',
      patientMRN: 'MRN-00847291',
      referringProvider: 'Dr. James Chen, MD',
      referringOrganization: 'UHG Super Orchestration Controller',
      referralDate: '2026-05-20',
      urgency: 'urgent',
      specialistType: 'Labcorp',
      clinicalNotes: 'Maria requires urgent HbA1c closure workflow. Route lab through Labcorp and return result into SMART app.',
      careGap: {
        measure: 'HEDIS-CDC-HbA1c',
        description: 'HbA1c Poor Control (>9%)',
        daysOpen: 112,
        gainshareAmount: 450,
        targetCriteria: 'HbA1c <9.0%',
        currentValue: 'HbA1c 9.2% (2026-04-10)',
        requiredLab: { name: 'Hemoglobin A1C', loincCode: '4548-4', targetRange: '<9.0%', unit: '%', example: '8.1' },
      },
      status: 'pending',
      appointmentDate: undefined,
      clinicalContext: {
        primaryDiagnosis: 'Type 2 Diabetes with chronic complications',
        icd10: 'E11.65',
        lastA1C: '9.2%',
        medications: ['Metformin 500mg BID', 'Warfarin 5mg daily', 'Coumadin 5mg daily'],
      },
    },
    {
      referralId: 'ref-002',
      serviceRequestId: 'sr-002',
      patientName: 'Mary Johnson',
      patientId: 'patient-002',
      patientDOB: '1962-07-22',
      referringProvider: 'Dr. Michael Rodriguez, MD',
      referringOrganization: 'Community Health Center',
      referralDate: '2026-05-22',
      urgency: 'routine',
      specialistType: 'Cardiology',
      clinicalNotes: 'Patient needs cardiovascular risk assessment and statin therapy initiation.',
      careGap: {
        measure: 'HEDIS SPC-438',
        description: 'Statin Therapy - CVD',
        daysOpen: 89,
        gainshareAmount: 380,
        targetCriteria: 'Statin prescribed and filled',
        currentValue: 'No active statin therapy',
      },
      status: 'scheduled',
      appointmentDate: '2026-06-05',
      clinicalContext: {
        primaryDiagnosis: 'Atherosclerotic Heart Disease',
        icd10: 'I25.10',
        lastLDL: '142 mg/dL',
        medications: ['Aspirin 81mg QD', 'Metoprolol 50mg BID'],
      },
    },
    {
      referralId: 'ref-003',
      serviceRequestId: 'sr-003',
      patientName: 'Robert Williams',
      patientId: 'patient-003',
      patientDOB: '1955-11-08',
      referringProvider: 'Dr. Sarah Chen, MD',
      referringOrganization: 'Primary Care Clinic',
      referralDate: '2026-05-18',
      urgency: 'routine',
      specialistType: 'Cardiology',
      clinicalNotes: 'Hypertension not controlled on current regimen. Needs specialist evaluation.',
      careGap: {
        measure: 'HEDIS CBP-236',
        description: 'Controlling Hypertension',
        daysOpen: 134,
        gainshareAmount: 320,
        targetCriteria: 'BP <140/90 mmHg',
        currentValue: 'BP 158/96 (2026-04-01)',
      },
      status: 'in-progress',
      appointmentDate: '2026-05-28',
      clinicalContext: {
        primaryDiagnosis: 'Essential Hypertension',
        icd10: 'I10',
        lastBP: '158/96',
        medications: ['Lisinopril 10mg QD', 'HCTZ 25mg QD'],
      },
    },
  ];

  private listeners: Array<() => void> = [];

  private qualityMetrics: QualityMetrics[] = [
    { measureId: 'HEDIS-CDC-HbA1c', measureName: 'HbA1c Poor Control (>9%)', program: 'HEDIS', numerator: 142, denominator: 487, rate: 0.291, target: 0.25, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
    { measureId: 'STARS-C01', measureName: 'Annual Wellness Visit', program: 'STARS', numerator: 3621, denominator: 4872, rate: 0.743, target: 0.80, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
    { measureId: 'HEDIS-EED', measureName: 'Eye Exam for Diabetics', program: 'HEDIS', numerator: 2891, denominator: 4872, rate: 0.593, target: 0.70, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
    { measureId: 'MIPS-PREV-12', measureName: 'Colorectal Cancer Screening', program: 'MIPS', numerator: 3142, denominator: 4872, rate: 0.645, target: 0.75, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
    { measureId: 'STARS-D12', measureName: 'Medication Adherence — Diabetes', program: 'STARS', numerator: 3456, denominator: 4872, rate: 0.709, target: 0.80, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
  ];

  private gainshareRecords: GainshareRecord[] = [];

  getAllReferrals(): Referral[] { return [...this.referrals]; }

  getReferralById(id: string): Referral | undefined {
    return this.referrals.find(r => r.referralId === id);
  }

  addReferral(referral: Referral): void {
    this.referrals.push(referral);
    this.notifyListeners();
  }

  updateReferral(id: string, updates: Partial<Referral>): void {
    const index = this.referrals.findIndex(r => r.referralId === id);
    if (index !== -1) {
      this.referrals[index] = { ...this.referrals[index], ...updates };
      this.notifyListeners();
    }
  }

  closeGap(referralId: string, specialistId: string, specialistName: string): void {
    const referral = this.getReferralById(referralId);
    if (!referral || !referral.careGap) {
      console.error('Referral or care gap not found');
      return;
    }
    this.updateReferral(referralId, { status: 'completed' });
    const metric = this.qualityMetrics.find(m => m.measureId === referral.careGap!.measure);
    if (metric) {
      metric.numerator += 1;
      metric.rate = metric.numerator / metric.denominator;
      metric.gapsClosed += 1;
      metric.gapsOpen = Math.max(0, metric.gapsOpen - 1);
      metric.lastUpdated = clock.nowIso();
    }
    const gapIndex = mockCareGaps.findIndex(g => g.measureId === referral.careGap!.measure && g.patientId === referral.patientId);
    if (gapIndex !== -1) {
      mockCareGaps[gapIndex].status = 'Closed';
      mockCareGaps[gapIndex].lastActionDate = clock.nowIso().split('T')[0];
      mockCareGaps[gapIndex].daysOpen = 0;
    }
    const totalAmount = referral.careGap.gainshareAmount;
    const providerShare = Math.round(totalAmount * 0.6);
    const specialistShare = Math.round(totalAmount * 0.4);
    const gainshareRecord: GainshareRecord = {
      referralId,
      patientId: referral.patientId,
      patientName: referral.patientName,
      measureId: referral.careGap.measure,
      measureName: referral.careGap.description,
      closureDate: clock.nowIso().split('T')[0],
      totalAmount,
      providerShare,
      specialistShare,
      providerId: 'dr-whitfield-001',
      providerName: referral.referringProvider,
      specialistId,
      specialistName,
      status: 'approved',
    };
    this.gainshareRecords.push(gainshareRecord);
    // Structured logging (PHI-safe ids/amounts); see src/lib/server/log.ts
    log.info('demo.gapClosed', { referralId: referral.referralId, measure: referral.careGap.measure, providerShare, specialistShare });
    this.notifyListeners();
  }

  getQualityMetrics(): QualityMetrics[] { return [...this.qualityMetrics]; }
  getGainshareRecords(): GainshareRecord[] { return [...this.gainshareRecords]; }

  getProviderGainshare(providerId: string): number {
    return this.gainshareRecords
      .filter(r => r.providerId === providerId && r.status === 'approved')
      .reduce((sum, r) => sum + r.providerShare, 0);
  }

  getSpecialistGainshare(specialistId: string): number {
    return this.gainshareRecords
      .filter(r => r.specialistId === specialistId && r.status === 'approved')
      .reduce((sum, r) => sum + r.specialistShare, 0);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  resetDemo(): void {
    this.referrals = this.referrals.filter(r => {
      if (r.patientId === 'patient-001' || r.patientName === 'Maria Reyes') return false;
      return r.referralId === 'ref-001' || r.referralId === 'ref-002' || r.referralId === 'ref-003';
    });
    this.referrals.forEach(r => { r.status = 'pending'; r.appointmentDate = undefined; });
    this.gainshareRecords = [];
    this.qualityMetrics = [
      { measureId: 'HEDIS-CDC-HbA1c', measureName: 'HbA1c Poor Control (>9%)', program: 'HEDIS', numerator: 142, denominator: 487, rate: 0.291, target: 0.25, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
      { measureId: 'STARS-C01', measureName: 'Annual Wellness Visit', program: 'STARS', numerator: 3621, denominator: 4872, rate: 0.743, target: 0.80, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
      { measureId: 'HEDIS-EED', measureName: 'Eye Exam for Diabetics', program: 'HEDIS', numerator: 2891, denominator: 4872, rate: 0.593, target: 0.70, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
      { measureId: 'MIPS-PREV-12', measureName: 'Colorectal Cancer Screening', program: 'MIPS', numerator: 3142, denominator: 4872, rate: 0.645, target: 0.75, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
      { measureId: 'STARS-D12', measureName: 'Medication Adherence — Diabetes', program: 'STARS', numerator: 3456, denominator: 4872, rate: 0.709, target: 0.80, gapsClosed: 0, gapsOpen: 1, lastUpdated: clock.nowIso() },
    ];
    mockCareGaps.forEach(gap => {
      if (gap.patientId === 'patient-001') {
        gap.status = gap.measureId === 'HEDIS-CBP' ? 'Closed' : 'Open';
        gap.daysOpen = gap.measureId === 'HEDIS-CBP' ? 0 : Math.floor(clock.rng() * 100) + 20;
      }
    });
    log.info('demo.reset.complete', { referrals: this.referrals.length, gainshareRecords: this.gainshareRecords.length, qualityMetrics: this.qualityMetrics.length });
    this.notifyListeners();
  }
}

export const referralStore = new ReferralStore();

// ── EPISODES OF CARE ──────────────────────────────────────────────────────────
export const mockEpisodes: Episode[] = [
  {
    id: 'ep-001', patientId: 'patient-001', patientName: 'Margaret Okonkwo', patientDOB: '03/14/1948', patientAge: 78, patientGender: 'F', patientMRN: 'MRN-204817',
    episodeType: 'CHF Exacerbation', episodeCategory: 'Medical', startDate: '2026-03-15', endDate: '2026-06-13', duration: 90, status: 'Closed',
    totalCost: 32650, targetCost: 28000, costVariance: 16.6, utilizationScore: 72,
    events: [
      { id: 'ev-001', episodeId: 'ep-001', eventDate: '2026-03-15', eventType: 'ER', careSetting: 'Emergency Department', description: 'CHF exacerbation, SOB, edema', cost: 2400, provider: 'Dr. Emergency', facility: 'County Hospital ER' },
      { id: 'ev-002', episodeId: 'ep-001', eventDate: '2026-03-15', eventType: 'Inpatient', careSetting: 'Acute Care Hospital', description: 'Admitted for CHF management', cost: 18500, provider: 'Dr. James Whitfield', facility: 'County Hospital', duration: 5, outcome: 'Stabilized, discharged to SNF' },
      { id: 'ev-003', episodeId: 'ep-001', eventDate: '2026-03-20', eventType: 'SNF', careSetting: 'Skilled Nursing Facility', description: 'Post-acute care and rehabilitation', cost: 8200, provider: 'SNF Care Team', facility: 'Riverside Rehabilitation Center', duration: 14, outcome: 'Improved, transitioned to home health' },
      { id: 'ev-004', episodeId: 'ep-001', eventDate: '2026-04-03', eventType: 'Home Health', careSetting: 'Home Health Services', description: 'Nursing visits and medication management', cost: 3100, provider: 'Home Health RN', facility: 'Community Home Health', duration: 30, outcome: 'Stable, transitioned to outpatient' },
      { id: 'ev-005', episodeId: 'ep-001', eventDate: '2026-05-15', eventType: 'Outpatient', careSetting: 'Cardiology Clinic', description: 'Follow-up cardiology visit', cost: 450, provider: 'Dr. Emily Chen', facility: 'Heart & Vascular Institute', outcome: 'Stable, episode closed' },
    ],
    qualityMetrics: { complications: false, readmission30Day: false, patientSatisfaction: 4.5, carePlanAdherence: 85 },
    assignedCareManager: 'Linda Marsh', primaryProvider: 'Dr. James Whitfield',
  },
  {
    id: 'ep-002', patientId: 'patient-002', patientName: 'Mary Johnson', patientDOB: '07/22/1962', patientAge: 63, patientGender: 'F', patientMRN: 'MRN-305928',
    episodeType: 'Hip Replacement', episodeCategory: 'Surgical', startDate: '2026-02-10', endDate: '2026-05-10', duration: 90, status: 'Closed',
    totalCost: 28450, targetCost: 25000, costVariance: 13.8, utilizationScore: 78,
    events: [
      { id: 'ev-006', episodeId: 'ep-002', eventDate: '2026-02-10', eventType: 'Procedure', careSetting: 'Operating Room', description: 'Total hip arthroplasty', cost: 22000, provider: 'Dr. Sarah Martinez', facility: 'Regional Medical Center', duration: 1, outcome: 'Successful surgery' },
      { id: 'ev-007', episodeId: 'ep-002', eventDate: '2026-02-11', eventType: 'Inpatient', careSetting: 'Acute Care Hospital', description: 'Post-operative recovery', cost: 4200, provider: 'Dr. Sarah Martinez', facility: 'Regional Medical Center', duration: 3, outcome: 'Discharged to home with PT' },
      { id: 'ev-008', episodeId: 'ep-002', eventDate: '2026-02-14', eventType: 'Home Health', careSetting: 'Physical Therapy', description: 'Home physical therapy sessions', cost: 1800, provider: 'PT Services', facility: 'Home Health PT', duration: 45, outcome: 'Good progress' },
      { id: 'ev-009', episodeId: 'ep-002', eventDate: '2026-04-01', eventType: 'Outpatient', careSetting: 'Orthopedic Clinic', description: '6-week follow-up', cost: 450, provider: 'Dr. Sarah Martinez', facility: 'Orthopedic Specialists', outcome: 'Healing well' },
    ],
    qualityMetrics: { complications: false, readmission30Day: false, patientSatisfaction: 4.8, carePlanAdherence: 92 },
    assignedCareManager: 'Linda Marsh', primaryProvider: 'Dr. Sarah Martinez',
  },
  {
    id: 'ep-003', patientId: 'patient-003', patientName: 'Robert Williams', patientDOB: '11/08/1955', patientAge: 70, patientGender: 'M', patientMRN: 'MRN-407139',
    episodeType: 'Pneumonia', episodeCategory: 'Medical', startDate: '2026-04-05', endDate: '2026-04-25', duration: 20, status: 'Closed',
    totalCost: 18200, targetCost: 20000, costVariance: -9.0, utilizationScore: 85,
    events: [
      { id: 'ev-010', episodeId: 'ep-003', eventDate: '2026-04-05', eventType: 'ER', careSetting: 'Emergency Department', description: 'Fever, cough, SOB - pneumonia', cost: 1800, provider: 'Dr. Emergency', facility: 'County Hospital ER' },
      { id: 'ev-011', episodeId: 'ep-003', eventDate: '2026-04-05', eventType: 'Inpatient', careSetting: 'Acute Care Hospital', description: 'Admitted for IV antibiotics', cost: 14200, provider: 'Dr. Michael Chen', facility: 'County Hospital', duration: 4, outcome: 'Improved, discharged home' },
      { id: 'ev-012', episodeId: 'ep-003', eventDate: '2026-04-10', eventType: 'Outpatient', careSetting: 'Primary Care', description: 'Follow-up visit', cost: 200, provider: 'Dr. Sarah Chen', facility: 'Primary Care Clinic' },
      { id: 'ev-012b', episodeId: 'ep-003', eventDate: '2026-04-20', eventType: 'Outpatient', careSetting: 'Primary Care', description: 'Follow-up visit', cost: 200, provider: 'Dr. Sarah Chen', facility: 'Primary Care Clinic', outcome: 'Resolved, episode closed' },
    ],
    qualityMetrics: { complications: false, readmission30Day: false, patientSatisfaction: 4.2, carePlanAdherence: 88 },
    assignedCareManager: 'Linda Marsh', primaryProvider: 'Dr. Sarah Chen',
  },
  {
    id: 'ep-004', patientId: 'patient-004', patientName: 'James Anderson', patientDOB: '05/30/1952', patientAge: 74, patientGender: 'M', patientMRN: 'MRN-508240',
    episodeType: 'Diabetes Management', episodeCategory: 'Chronic Care', startDate: '2026-01-01', endDate: null, duration: 148, status: 'Active',
    totalCost: 8450, targetCost: 12000, costVariance: -29.6, utilizationScore: 92,
    events: [
      { id: 'ev-013', episodeId: 'ep-004', eventDate: '2026-01-15', eventType: 'Outpatient', careSetting: 'Endocrinology', description: 'Initial diabetes consultation', cost: 450, provider: 'Dr. Emily Rodriguez', facility: 'Chicago Diabetes Center' },
      { id: 'ev-014', episodeId: 'ep-004', eventDate: '2026-02-01', eventType: 'Lab', careSetting: 'Laboratory', description: 'A1C, lipid panel, kidney function', cost: 280, provider: 'Lab Services', facility: 'Quest Diagnostics' },
      { id: 'ev-015', episodeId: 'ep-004', eventDate: '2026-03-01', eventType: 'Outpatient', careSetting: 'Endocrinology', description: 'Follow-up visit', cost: 350, provider: 'Dr. Emily Rodriguez', facility: 'Chicago Diabetes Center' },
      { id: 'ev-016', episodeId: 'ep-004', eventDate: '2026-04-15', eventType: 'Outpatient', careSetting: 'Ophthalmology', description: 'Diabetic eye exam', cost: 420, provider: 'Dr. Vision', facility: 'Eye Care Center' },
      { id: 'ev-017', episodeId: 'ep-004', eventDate: '2026-05-01', eventType: 'Medication', careSetting: 'Pharmacy', description: 'Insulin and oral medications', cost: 1200, provider: 'Pharmacy', facility: 'CVS Pharmacy' },
    ],
    qualityMetrics: { complications: false, readmission30Day: false, patientSatisfaction: 4.6, carePlanAdherence: 94 },
    assignedCareManager: 'Linda Marsh', primaryProvider: 'Dr. Emily Rodriguez',
  },
  {
    id: 'ep-005', patientId: 'patient-005', patientName: 'Patricia Davis', patientDOB: '09/12/1958', patientAge: 67, patientGender: 'F', patientMRN: 'MRN-609351',
    episodeType: 'COPD Exacerbation', episodeCategory: 'Medical', startDate: '2026-03-20', endDate: null, duration: 70, status: 'Maintenance',
    totalCost: 24800, targetCost: 22000, costVariance: 12.7, utilizationScore: 68,
    events: [
      { id: 'ev-018', episodeId: 'ep-005', eventDate: '2026-03-20', eventType: 'ER', careSetting: 'Emergency Department', description: 'COPD exacerbation, severe dyspnea', cost: 1800, provider: 'Dr. Emergency', facility: 'County Hospital ER' },
      { id: 'ev-019', episodeId: 'ep-005', eventDate: '2026-03-20', eventType: 'Inpatient', careSetting: 'Acute Care Hospital', description: 'Admitted for respiratory support', cost: 16500, provider: 'Dr. James Williams', facility: 'County Hospital', duration: 6, outcome: 'Stabilized, discharged home' },
      { id: 'ev-020', episodeId: 'ep-005', eventDate: '2026-03-26', eventType: 'Home Health', careSetting: 'Home Health Services', description: 'Respiratory therapy and nursing', cost: 2800, provider: 'Home Health RN', facility: 'Community Home Health', duration: 21 },
      { id: 'ev-021', episodeId: 'ep-005', eventDate: '2026-04-20', eventType: 'Outpatient', careSetting: 'Pulmonology', description: 'Follow-up pulmonology visit', cost: 380, provider: 'Dr. James Williams', facility: 'Respiratory Health Center' },
      { id: 'ev-022', episodeId: 'ep-005', eventDate: '2026-05-15', eventType: 'Outpatient', careSetting: 'Pulmonology', description: 'Maintenance visit', cost: 320, provider: 'Dr. James Williams', facility: 'Respiratory Health Center', outcome: 'Stable, ongoing maintenance' },
    ],
    qualityMetrics: { complications: false, readmission30Day: false, patientSatisfaction: 4.0, carePlanAdherence: 78 },
    assignedCareManager: 'Linda Marsh', primaryProvider: 'Dr. James Williams',
  },
];
