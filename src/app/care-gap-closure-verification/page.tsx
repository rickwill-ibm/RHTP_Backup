'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useRouter } from 'next/navigation';
import { PROGRAM_TYPE_CONFIG } from '@/lib/fhirCareTeamData';
import type { TaskProgramType } from '@/lib/fhirCareTeamData';
import { useDemoStore } from '@/uhg/store/demoStore';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { getPatientSync } from '@/lib/services/patientService';
import { personaFor } from '@/uhg/data/persona';
import MemberScopeNotice from '@/components/wpc/MemberScopeNotice';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import { useGapClosureStore } from '@/lib/patientContext';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Program-specific evidence configurations ─────────────────────────────────

type ProgramEvidenceConfig = {
  programType: TaskProgramType;
  gapLabel: string;
  measure: string;
  closedDate: string;
  gainShare: string;
  qualityPoints: string;
  evidence: {
    id: string;
    type: string;
    label: string;
    value: string;
    icon: string;
    color: string;
  }[];
  provenance: { label: string; value: string; icon: string }[];
  timeline: { label: string; date: string; actor: string; org: string }[];
};

function buildClinicalEvidenceConfig(
  gapId: string,
  patientName: string,
  closure?: ReturnType<ReturnType<typeof useGapClosureStore>['getGapClosure']>
): ProgramEvidenceConfig {
  const gapIdLower = gapId.toLowerCase();
  const isRetinal =
    gapIdLower.includes('retinal') || gapIdLower.includes('jw-3') || gapIdLower.includes('eed');

  if (isRetinal) {
    const closedDate = closure?.dateOfService ?? '2026-06-10';
    const performingProvider = closure?.performingProvider ?? 'Winner Regional Ophthalmology';
    const placeOfService = closure?.placeOfService ?? 'Ophthalmology Clinic';

    return {
      programType: 'Clinical',
      gapLabel: 'HEDIS EED — Retinal Exam Completed',
      measure: `HEDIS EED Measure — Diabetic Eye Exam · ${patientName}`,
      closedDate,
      gainShare: '$8,100',
      qualityPoints: '+7.0',
      evidence: [
        {
          id: 'ret-001',
          type: 'Procedure',
          label: 'Procedure Performed',
          value: `Retinal exam documented — ${placeOfService}`,
          icon: 'EyeIcon',
          color: 'text-[#0043ce]',
        },
        {
          id: 'ret-002',
          type: 'Date',
          label: 'Date of Service',
          value: closedDate,
          icon: 'CalendarIcon',
          color: 'text-carbon-gray-70',
        },
        {
          id: 'ret-003',
          type: 'Provider',
          label: 'Performing Provider',
          value: performingProvider,
          icon: 'UserIcon',
          color: 'text-[#6929c4]',
        },
        {
          id: 'ret-004',
          type: 'Organization',
          label: 'Organization',
          value: placeOfService,
          icon: 'BuildingOffice2Icon',
          color: 'text-carbon-gray-70',
        },
        {
          id: 'ret-005',
          type: 'Result',
          label: 'Closure Evidence',
          value: 'Retinal screening completed and documented for diabetic eye exam measure.',
          icon: 'ClipboardDocumentCheckIcon',
          color: 'text-[#0043ce]',
        },
        {
          id: 'ret-006',
          type: 'Measure',
          label: 'HEDIS EED Compliance',
          value: 'HEDIS EED — COMPLIANT · retinal exam completed in measurement year',
          icon: 'CheckBadgeIcon',
          color: 'text-[#24a148]',
        },
      ],
      provenance: [
        { label: 'Source System', value: `${placeOfService} — EHR`, icon: 'ComputerDesktopIcon' },
        {
          label: 'FHIR Resource',
          value: `Observation/${gapId} (R4) · Retinal exam closure evidence`,
          icon: 'CodeBracketIcon',
        },
        { label: 'Timestamp', value: `${closedDate}T10:30:00Z`, icon: 'ClockIcon' },
        {
          label: 'Submitting Organization',
          value: `${placeOfService} — RHTP Network`,
          icon: 'BuildingOffice2Icon',
        },
        {
          label: 'EDW Submission',
          value: `Transmitted to South Dakota DHSS EDW — ${closedDate}T11:00:00Z`,
          icon: 'ArrowUpTrayIcon',
        },
        {
          label: 'Quality Report',
          value: 'HEDIS EED retinal exam closure reported',
          icon: 'DocumentChartBarIcon',
        },
      ],
      timeline: [
        {
          label: 'Retinal Gap Identified',
          date: '2026-04-06',
          actor: 'Sarah Johnson',
          org: 'RHTP Care Management',
        },
        {
          label: 'Eye Exam Outreach Initiated',
          date: '2026-04-18',
          actor: 'Sarah Johnson',
          org: 'Winner Regional Medical Center',
        },
        {
          label: 'Retinal Exam Scheduled',
          date: closedDate,
          actor: performingProvider,
          org: placeOfService,
        },
        {
          label: 'Retinal Exam Performed',
          date: closedDate,
          actor: performingProvider,
          org: placeOfService,
        },
        {
          label: 'Evidence Submitted',
          date: closedDate,
          actor: 'RHTP Platform',
          org: 'Auto-submitted via FHIR',
        },
        { label: 'Gap Closed', date: closedDate, actor: 'Care Gap Engine', org: 'RHTP Platform' },
        {
          label: 'EDW Updated',
          date: closedDate,
          actor: 'South Dakota DHSS EDW',
          org: 'Quality Reporting System',
        },
      ],
    };
  }

  return {
    programType: 'Clinical',
    gapLabel: 'HEDIS CDC — HbA1c Control (poor) · HbA1c Lab Test',
    measure: `HEDIS CDC Measure — HbA1c Control (poor) · ${patientName}`,
    closedDate: closure?.dateOfService ?? '2026-06-10',
    gainShare: '$8,100',
    qualityPoints: '+7.0',
    evidence: buildHbA1cEvidence(
      closure?.dateOfService ?? '2026-06-10',
      closure?.performingProvider ?? 'Bennett County Health PCP',
      closure?.placeOfService ?? 'Lab',
      closure?.resultValue ?? 6.8,
      closure?.hedisCompliance ?? 'MET'
    ),
    provenance: buildHbA1cProvenance(closure?.dateOfService ?? '2026-06-10'),
    timeline: buildHbA1cTimeline(
      closure?.dateOfService ?? '2026-06-10',
      closure?.performingProvider ?? 'Bennett County Health PCP'
    ),
  };
}

// ─── HbA1c evidence builder from store ───────────────────────────────────────
function buildHbA1cEvidence(
  dateOfService: string,
  performingProvider: string,
  placeOfService: string,
  resultValue: number,
  hedisCompliance: string
): ProgramEvidenceConfig['evidence'] {
  return [
    {
      id: 'hba1c-001',
      type: 'Procedure',
      label: 'Procedure Performed',
      value: `HbA1c Lab Test — ${placeOfService} · Procedure Code 83036`,
      icon: 'ClipboardDocumentCheckIcon',
      color: 'text-[#0043ce]',
    },
    {
      id: 'hba1c-002',
      type: 'Date',
      label: 'Date of Service',
      value: dateOfService || '2026-06-10',
      icon: 'CalendarIcon',
      color: 'text-carbon-gray-70',
    },
    {
      id: 'hba1c-003',
      type: 'Provider',
      label: 'Performing Provider',
      value: performingProvider || 'Bennett County Health PCP',
      icon: 'UserIcon',
      color: 'text-[#6929c4]',
    },
    {
      id: 'hba1c-004',
      type: 'Organization',
      label: 'Organization',
      value: 'Bennett County Health Services — Martin, SD',
      icon: 'BuildingOffice2Icon',
      color: 'text-carbon-gray-70',
    },
    {
      id: 'hba1c-005',
      type: 'Result',
      label: 'Lab Result Value',
      value: `HbA1c ${resultValue}% · LOINC 4548-4 · ${placeOfService}`,
      icon: 'BeakerIcon',
      color: 'text-[#0043ce]',
    },
    {
      id: 'hba1c-006',
      type: 'Measure',
      label: 'HEDIS CDC Measure Compliance',
      value: `HEDIS CDC — HbA1c Control (poor) — ${hedisCompliance === 'MET' ? 'COMPLIANT · HbA1c < 8.0%' : 'NOT MET · HbA1c ≥ 8.0%'}`,
      icon: 'CheckBadgeIcon',
      color: hedisCompliance === 'MET' ? 'text-[#24a148]' : 'text-[#da1e28]',
    },
  ];
}

function buildHbA1cProvenance(dateOfService: string): ProgramEvidenceConfig['provenance'] {
  return [
    {
      label: 'Source System',
      value: 'Bennett County Health — Cerner PowerChart',
      icon: 'ComputerDesktopIcon',
    },
    {
      label: 'FHIR Resource',
      value: `Observation/HbA1c-${dateOfService || '2026-06-10'}-001 (R4) · LOINC 4548-4`,
      icon: 'CodeBracketIcon',
    },
    { label: 'Timestamp', value: `${dateOfService || '2026-06-10'}T10:30:00Z`, icon: 'ClockIcon' },
    {
      label: 'Submitting Organization',
      value: 'Bennett County Health Services — RHTP Network',
      icon: 'BuildingOffice2Icon',
    },
    {
      label: 'EDW Submission',
      value: `Transmitted to South Dakota DHSS EDW — ${dateOfService || '2026-06-10'}T11:00:00Z`,
      icon: 'ArrowUpTrayIcon',
    },
    {
      label: 'Quality Report',
      value: 'HEDIS CDC HbA1c Control Measure Report generated and submitted',
      icon: 'DocumentChartBarIcon',
    },
  ];
}

function buildHbA1cTimeline(
  dateOfService: string,
  performingProvider: string
): ProgramEvidenceConfig['timeline'] {
  return [
    {
      label: 'HbA1c Gap Identified',
      date: '2026-04-06',
      actor: 'Sarah Johnson',
      org: 'RHTP Care Management',
    },
    {
      label: 'Outreach Initiated',
      date: '2026-04-18',
      actor: 'Sarah Johnson',
      org: 'Bennett County Health Services',
    },
    {
      label: 'Lab Order Placed',
      date: dateOfService || '2026-06-08',
      actor: performingProvider || 'Bennett County Health PCP',
      org: 'Bennett County Health Services',
    },
    {
      label: 'HbA1c Lab Performed',
      date: dateOfService || '2026-06-10',
      actor: performingProvider || 'Bennett County Health PCP',
      org: 'Bennett County Health Services',
    },
    {
      label: 'Evidence Submitted',
      date: dateOfService || '2026-06-10',
      actor: 'RHTP Platform',
      org: 'Auto-submitted via FHIR',
    },
    {
      label: 'Gap Closed',
      date: dateOfService || '2026-06-10',
      actor: 'Care Gap Engine',
      org: 'RHTP Platform',
    },
    {
      label: 'EDW Updated',
      date: dateOfService || '2026-06-10',
      actor: 'South Dakota DHSS EDW',
      org: 'Quality Reporting System',
    },
  ];
}

const STATIC_PROGRAM_EVIDENCE: Record<string, ProgramEvidenceConfig> = {
  bh: {
    programType: 'Behavioral Health',
    gapLabel: 'BH Integration — PHQ-9 Depression Screening Completed',
    measure: 'BH Integration Program — Depression Screening (PHQ-9)',
    closedDate: '2026-05-18',
    gainShare: '$145',
    qualityPoints: '+0.8',
    evidence: [
      {
        id: 'bh-001',
        type: 'Assessment',
        label: 'Assessment Completed',
        value: 'PHQ-9 Depression Screening — Score: 8 (Mild Depression)',
        icon: 'ClipboardDocumentCheckIcon',
        color: 'text-[#6929c4]',
      },
      {
        id: 'bh-002',
        type: 'Score',
        label: 'PHQ-9 Score',
        value: '8/27 — Mild Depression. Baseline established. Follow-up in 4 weeks.',
        icon: 'ChartBarIcon',
        color: 'text-[#6929c4]',
      },
      {
        id: 'bh-003',
        type: 'Provider',
        label: 'BH Counselor',
        value: 'Dr. Renata Osei, PhD — Behavioral Health',
        icon: 'UserIcon',
        color: 'text-[#6929c4]',
      },
      {
        id: 'bh-004',
        type: 'Organization',
        label: 'Organization',
        value: 'South Dakota BH Integration Network',
        icon: 'BuildingOffice2Icon',
        color: 'text-carbon-gray-70',
      },
      {
        id: 'bh-005',
        type: 'CarePlan',
        label: 'Care Plan Updated',
        value: 'BH care plan created. Therapy sessions scheduled. PCP notified of BH integration.',
        icon: 'DocumentTextIcon',
        color: 'text-carbon-gray-70',
      },
      {
        id: 'bh-006',
        type: 'Measure',
        label: 'Program Compliance',
        value: 'BH Integration Program — ENROLLED. Screening complete. Care plan active.',
        icon: 'CheckBadgeIcon',
        color: 'text-[#24a148]',
      },
    ],
    provenance: [
      {
        label: 'Source System',
        value: 'South Dakota BH Integration Network — EHR',
        icon: 'ComputerDesktopIcon',
      },
      {
        label: 'FHIR Resource',
        value: 'Observation/PHQ9-2026-05-18-001 (R4)',
        icon: 'CodeBracketIcon',
      },
      { label: 'Timestamp', value: '2026-05-18T11:15:00Z', icon: 'ClockIcon' },
      {
        label: 'Submitting Organization',
        value: 'South Dakota BH Integration Network',
        icon: 'BuildingOffice2Icon',
      },
      {
        label: 'EDW Submission',
        value: 'Transmitted to South Dakota DHSS BH Registry — 2026-05-18T12:00:00Z',
        icon: 'ArrowUpTrayIcon',
      },
      {
        label: 'Quality Report',
        value: 'BH Integration Program enrollment confirmed and reported',
        icon: 'DocumentChartBarIcon',
      },
    ],
    timeline: [
      {
        label: 'BH Task Created',
        date: '2026-04-15',
        actor: 'Sarah Johnson',
        org: 'RHTP Care Management',
      },
      {
        label: 'BH Counselor Accepted',
        date: '2026-04-16',
        actor: 'Dr. Renata Osei',
        org: 'South Dakota BH Integration Network',
      },
      {
        label: 'Initial Assessment Scheduled',
        date: '2026-04-20',
        actor: 'Scheduling Team',
        org: 'South Dakota BH Integration Network',
      },
      {
        label: 'PHQ-9 Screening Completed',
        date: '2026-05-18',
        actor: 'Dr. Renata Osei',
        org: 'South Dakota BH Integration Network',
      },
      {
        label: 'Care Plan Created',
        date: '2026-05-18',
        actor: 'Dr. Renata Osei',
        org: 'South Dakota BH Integration Network',
      },
      {
        label: 'BH Task Completed',
        date: '2026-05-18',
        actor: 'RHTP Platform',
        org: 'Auto-submitted via FHIR',
      },
      {
        label: 'BH Registry Updated',
        date: '2026-05-18',
        actor: 'South Dakota DHSS BH Registry',
        org: 'Quality Reporting System',
      },
    ],
  },
  food: {
    programType: 'Food Security',
    gapLabel: 'Food Security — SNAP Enrollment + Food Box Delivery Confirmed',
    measure: 'AHC-HRSN Food Insecurity Domain — Intervention Completed',
    closedDate: '2026-05-10',
    gainShare: '$85',
    qualityPoints: '+0.4',
    evidence: [
      {
        id: 'food-001',
        type: 'Enrollment',
        label: 'SNAP Application Submitted',
        value: 'SNAP Application #MO-2026-04892 submitted. Approval pending 30 days.',
        icon: 'ClipboardDocumentCheckIcon',
        color: 'text-[#b45309]',
      },
      {
        id: 'food-002',
        type: 'Delivery',
        label: 'Food Box Delivery Confirmed',
        value: 'Emergency food box delivered 2026-05-10. 2-week supply. SD Food Bank Network.',
        icon: 'TruckIcon',
        color: 'text-[#b45309]',
      },
      {
        id: 'food-003',
        type: 'Provider',
        label: 'Food Security Case Worker',
        value: 'James Holloway — SD Food Bank Network',
        icon: 'UserIcon',
        color: 'text-[#b45309]',
      },
      {
        id: 'food-004',
        type: 'Organization',
        label: 'CBO Organization',
        value: 'SD Food Bank Network — Bennett County',
        icon: 'BuildingOffice2Icon',
        color: 'text-carbon-gray-70',
      },
      {
        id: 'food-005',
        type: 'Screening',
        label: 'AHC-HRSN Screening Result',
        value: 'Food insecurity domain positive. Patient reports skipping meals 3+ days/week.',
        icon: 'DocumentTextIcon',
        color: 'text-carbon-gray-70',
      },
      {
        id: 'food-006',
        type: 'Measure',
        label: 'Intervention Status',
        value: 'Food Security Intervention — COMPLETED. Immediate need addressed. SNAP pending.',
        icon: 'CheckBadgeIcon',
        color: 'text-[#24a148]',
      },
    ],
    provenance: [
      {
        label: 'Source System',
        value: 'SD Food Bank Network — Case Management System',
        icon: 'ComputerDesktopIcon',
      },
      {
        label: 'FHIR Resource',
        value: 'DocumentReference/food-delivery-2026-05-10-001 (R4)',
        icon: 'CodeBracketIcon',
      },
      { label: 'Timestamp', value: '2026-05-10T14:00:00Z', icon: 'ClockIcon' },
      {
        label: 'Submitting Organization',
        value: 'SD Food Bank Network via RHTP Platform',
        icon: 'BuildingOffice2Icon',
      },
      {
        label: 'EDW Submission',
        value: 'Transmitted to South Dakota DHSS SDOH Registry — 2026-05-10T15:30:00Z',
        icon: 'ArrowUpTrayIcon',
      },
      {
        label: 'Quality Report',
        value: 'AHC-HRSN Food Domain intervention confirmed and reported',
        icon: 'DocumentChartBarIcon',
      },
    ],
    timeline: [
      {
        label: 'Food Insecurity Identified',
        date: '2026-04-18',
        actor: 'Robert Chen',
        org: 'Bennett County Health Services',
      },
      {
        label: 'Food Task Created',
        date: '2026-04-18',
        actor: 'Robert Chen',
        org: 'RHTP Care Management',
      },
      {
        label: 'CBO Case Worker Assigned',
        date: '2026-04-19',
        actor: 'James Holloway',
        org: 'SD Food Bank Network',
      },
      {
        label: 'SNAP Application Filed',
        date: '2026-04-25',
        actor: 'James Holloway',
        org: 'SD Food Bank Network',
      },
      {
        label: 'Emergency Food Box Delivered',
        date: '2026-05-10',
        actor: 'James Holloway',
        org: 'SD Food Bank Network',
      },
      {
        label: 'Task Completed',
        date: '2026-05-10',
        actor: 'RHTP Platform',
        org: 'Auto-submitted via FHIR',
      },
      {
        label: 'SDOH Registry Updated',
        date: '2026-05-10',
        actor: 'South Dakota DHSS SDOH Registry',
        org: 'Quality Reporting System',
      },
    ],
  },
  housing: {
    programType: 'Housing',
    gapLabel: 'Housing Stability — Section 8 Voucher Application Initiated',
    measure: 'PRAPARE Housing Domain — Navigation Intervention Completed',
    closedDate: '2026-05-28',
    gainShare: '$120',
    qualityPoints: '+0.5',
    evidence: [
      {
        id: 'hous-001',
        type: 'Assessment',
        label: 'Housing Assessment Completed',
        value: 'PRAPARE Housing Domain — Positive. At risk of eviction within 30 days.',
        icon: 'ClipboardDocumentCheckIcon',
        color: 'text-[#0e6027]',
      },
      {
        id: 'hous-002',
        type: 'Application',
        label: 'Section 8 Application Filed',
        value:
          'HUD Section 8 Voucher Application #MO-HUD-2026-7821 submitted. Waitlist position: 142.',
        icon: 'HomeIcon',
        color: 'text-[#0e6027]',
      },
      {
        id: 'hous-003',
        type: 'Provider',
        label: 'Housing Navigator',
        value: 'Sandra Kim — South Dakota Housing Stability Coalition',
        icon: 'UserIcon',
        color: 'text-[#0e6027]',
      },
      {
        id: 'hous-004',
        type: 'Organization',
        label: 'CBO Organization',
        value: 'South Dakota Housing Stability Coalition',
        icon: 'BuildingOffice2Icon',
        color: 'text-carbon-gray-70',
      },
      {
        id: 'hous-005',
        type: 'Interim',
        label: 'Interim Stabilization',
        value: 'Emergency rental assistance application filed. 60-day bridge funding approved.',
        icon: 'DocumentTextIcon',
        color: 'text-carbon-gray-70',
      },
      {
        id: 'hous-006',
        type: 'Measure',
        label: 'Intervention Status',
        value:
          'Housing Navigation — COMPLETED. Immediate eviction risk mitigated. Long-term voucher pending.',
        icon: 'CheckBadgeIcon',
        color: 'text-[#24a148]',
      },
    ],
    provenance: [
      {
        label: 'Source System',
        value: 'South Dakota Housing Stability Coalition — Case System',
        icon: 'ComputerDesktopIcon',
      },
      {
        label: 'FHIR Resource',
        value: 'DocumentReference/housing-nav-2026-05-28-001 (R4)',
        icon: 'CodeBracketIcon',
      },
      { label: 'Timestamp', value: '2026-05-28T10:00:00Z', icon: 'ClockIcon' },
      {
        label: 'Submitting Organization',
        value: 'South Dakota Housing Stability Coalition via RHTP Platform',
        icon: 'BuildingOffice2Icon',
      },
      {
        label: 'EDW Submission',
        value: 'Transmitted to South Dakota DHSS SDOH Registry — 2026-05-28T11:00:00Z',
        icon: 'ArrowUpTrayIcon',
      },
      {
        label: 'Quality Report',
        value: 'PRAPARE Housing Domain intervention confirmed and reported',
        icon: 'DocumentChartBarIcon',
      },
    ],
    timeline: [
      {
        label: 'Housing Instability Identified',
        date: '2026-04-19',
        actor: 'Lisa Fontaine, LCSW',
        org: 'Fall River County Mental Health Center',
      },
      {
        label: 'Housing Task Created',
        date: '2026-04-19',
        actor: 'Lisa Fontaine, LCSW',
        org: 'RHTP Care Management',
      },
      {
        label: 'Housing Navigator Accepted',
        date: '2026-04-21',
        actor: 'Sandra Kim',
        org: 'South Dakota Housing Stability Coalition',
      },
      {
        label: 'Housing Assessment Completed',
        date: '2026-04-28',
        actor: 'Sandra Kim',
        org: 'South Dakota Housing Stability Coalition',
      },
      {
        label: 'Section 8 Application Filed',
        date: '2026-05-10',
        actor: 'Sandra Kim',
        org: 'South Dakota Housing Stability Coalition',
      },
      {
        label: 'Emergency Rental Assistance Approved',
        date: '2026-05-28',
        actor: 'Sandra Kim',
        org: 'South Dakota Housing Stability Coalition',
      },
      {
        label: 'SDOH Registry Updated',
        date: '2026-05-28',
        actor: 'South Dakota DHSS SDOH Registry',
        org: 'Quality Reporting System',
      },
    ],
  },
};

const PROGRAM_TABS = [
  { key: 'clinical', label: 'Clinical · HbA1c', programType: 'Clinical' as TaskProgramType },
  { key: 'bh', label: 'Behavioral Health', programType: 'Behavioral Health' as TaskProgramType },
  { key: 'food', label: 'Food Security', programType: 'Food Security' as TaskProgramType },
  { key: 'housing', label: 'Housing', programType: 'Housing' as TaskProgramType },
];

// ─── FHIR Observation type for care gap reads ──────────────────────────────────
interface FhirObsResult {
  id: string;
  status?: string;
  code?: { text?: string };
  valueInteger?: number;
  valueString?: string;
  effectiveDateTime?: string;
  note?: { text?: string }[];
  extension?: { url: string; valueString?: string; valueInteger?: number }[];
}

export default function CareGapClosureVerificationPage() {
  const router = useRouter();
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const patient = getPatientSync(activePatientId);
  // Member-derived identity — no golden fallback (never leak Maria onto another member).
  const patientName = patient?.name ?? personaFor(activePatientId).name;
  const patientId = patient?.platformId ?? activePatientId;

  const { getGapClosure, getMostRecentClosedGapId } = useGapClosureStore();
  const mostRecentGapId =
    getMostRecentClosedGapId(patientId) ??
    patient?.careGaps.find((gap) => gap.status === 'Closed')?.id ??
    '';
  const clinicalClosure = getGapClosure(mostRecentGapId);

  const [activeSection, setActiveSection] = useState<'evidence' | 'provenance' | 'timeline'>(
    'evidence'
  );
  const [activeProgramTab, setActiveProgramTab] = useState<string>('clinical');

  // Live FHIR: read closed care gap observations
  const [fhirClosedGaps, setFhirClosedGaps] = useState<FhirObsResult[]>([]);
  const [fhirSourceLabel, setFhirSourceLabel] = useState<string | null>(null);
  const [fhirTaskTimeline, setFhirTaskTimeline] = useState<
    { label: string; date: string; actor: string; org: string }[]
  >([]);

  useEffect(() => {
    if (getFhirMockMode()) return;
    const fhirPatientId =
      PLATFORM_TO_FHIR_ID_MAP[activePatientId] ??
      (activePatientId.startsWith('patient-') ? activePatientId : 'patient-maria-001');
    const loadFhirData = async () => {
      const client = getFhirClient();
      try {
        // Search for final (closed) care gap observations for this patient
        const bundle = (await client.search('Observation', {
          subject: `Patient/${fhirPatientId}`,
          status: 'final',
          _count: 50,
        })) as { resourceType: string; entry?: { resource?: FhirObsResult }[] };
        const obs = (bundle.entry ?? [])
          .map((e) => e.resource)
          .filter((r): r is FhirObsResult => r?.status === 'final');
        if (obs.length > 0) {
          setFhirClosedGaps(obs);
          setFhirSourceLabel(`FHIR · ${obs.length} closed observations loaded`);
        }
      } catch {
        // fall back to static data silently
      }

      // Also load Task history for provenance timeline enrichment
      try {
        const taskBundle = (await client.search('Task', {
          patient: `Patient/${fhirPatientId}`,
          _count: 20,
        })) as { entry?: { resource?: Record<string, unknown> }[] };
        const tasks = (taskBundle.entry ?? []).map((e) => e.resource).filter(Boolean);
        if (tasks.length > 0) {
          const taskTimelineEntries = tasks.map((t) => ({
            label:
              (t?.description as string) ??
              ((t?.code as Record<string, unknown>)?.text as string) ??
              'Task',
            date: ((t?.lastModified as string) ?? (t?.authoredOn as string) ?? '').slice(0, 10),
            actor: (t?.owner as { display?: string })?.display ?? 'Care Team',
            org: 'RHTP Network',
          }));
          setFhirTaskTimeline(taskTimelineEntries);
        }
      } catch {
        // task enrichment is optional
      }
    };
    loadFhirData();
  }, [activePatientId]);

  const clinicalProgramData = buildClinicalEvidenceConfig(
    mostRecentGapId,
    patientName,
    clinicalClosure
  );

  // Overlay FHIR data into the provenance section if available
  const fhirProvenance: ProgramEvidenceConfig['provenance'] =
    fhirClosedGaps.length > 0
      ? [
          {
            label: 'FHIR Source',
            value: `HAPI FHIR R4 · ${fhirClosedGaps.length} Observations loaded`,
            icon: 'CodeBracketIcon',
          },
          {
            label: 'Patient FHIR ID',
            value: PLATFORM_TO_FHIR_ID_MAP[activePatientId] ?? activePatientId,
            icon: 'IdentificationIcon',
          },
          {
            label: 'Status',
            value: 'Observations confirmed final on FHIR server',
            icon: 'CheckCircleIcon',
          },
          ...clinicalProgramData.provenance.slice(1),
        ]
      : clinicalProgramData.provenance;

  const clinicalProgramDataWithFhir: ProgramEvidenceConfig = {
    ...clinicalProgramData,
    provenance: activeProgramTab === 'clinical' ? fhirProvenance : clinicalProgramData.provenance,
  };

  const PROGRAM_EVIDENCE: Record<string, ProgramEvidenceConfig> = {
    clinical: clinicalProgramDataWithFhir,
    ...STATIC_PROGRAM_EVIDENCE,
  };

  const programData = PROGRAM_EVIDENCE[activeProgramTab];
  const progCfg = PROGRAM_TYPE_CONFIG[programData.programType];

  // Generalized: the HbA1c clinical-evidence block applies to any member who has an
  // HbA1c/A1c care gap — derived from their own gaps, not two hardcoded gap ids.
  const isClinicalHbA1c = (patient?.careGaps ?? []).some((g) => /hba1c|a1c/i.test(g.name ?? ''));
  const hedisCompliance = clinicalClosure?.hedisCompliance ?? 'MET';
  const resultValue = clinicalClosure?.resultValue ?? 6.8;

  // P0 scope-guard: the closure evidence/provenance/timeline below is authored for
  // the golden member (HbA1c $8,100 HEDIS CDC closure). Fail closed for any other
  // member so no member ever shows another member's gainshare or clinical evidence.
  const isGoldenMember = activePatientId === DEMO_MEMBER_ID;
  if (!isGoldenMember) {
    return (
      <AppLayout
        pageTitle="Care Gap Closure Verification — Multi-Program Evidence"
        breadcrumbs={[
          { label: 'RHTP Platform', href: '/contract-program-selection' },
          { label: patientName, href: '/patient-detail' },
          { label: 'Gap Closure Verification' },
        ]}
      >
        <MemberScopeNotice name={patientName} id={patientId} view="Care Gap Closure Verification" />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      pageTitle="Care Gap Closure Verification — Multi-Program Evidence"
      breadcrumbs={[
        { label: 'RHTP Platform', href: '/contract-program-selection' },
        { label: patientName, href: '/patient-detail' },
        { label: 'Gap Closure Verification' },
      ]}
      contextBanner={
        <div className="bg-[#defbe6] border-b border-[#a7f0ba] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0e6027]">Gap Status: CLOSED ✓</span>
          <span className="text-xs text-[#0e6027]">
            Patient: {patientName} · {patientId}
          </span>
          <span className="text-xs text-[#0e6027]">Program: {programData.programType}</span>
          {activeProgramTab === 'clinical' && (
            <span className="text-xs font-semibold text-[#0e6027]">HEDIS CDC · HbA1c Control</span>
          )}
          {fhirSourceLabel && (
            <span className="flex items-center gap-1 text-xs text-[#0e6027] font-medium">
              <Icon name="CheckCircleIcon" size={12} style={{ color: '#24a148' }} />
              {fhirSourceLabel}
            </span>
          )}
          <span className="ml-auto text-xs text-carbon-gray-50">
            Closed: {programData.closedDate}
          </span>
        </div>
      }
    >
      <div className="px-6 py-4 space-y-4">
        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/specialist-inbox')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            <Icon name="ArrowLeftIcon" size={14} />
            Return to Task Queue
          </button>
          <button
            onClick={() => {
              window.print();
              // ── FHIR DocumentReference POST — persist evidence export record ─
              if (!getFhirMockMode()) {
                const fhirPatientId =
                  PLATFORM_TO_FHIR_ID_MAP[activePatientId] ??
                  (activePatientId.startsWith('patient-') ? activePatientId : 'patient-maria-001');
                getFhirClient()
                  .create({
                    resourceType: 'DocumentReference',
                    status: 'current',
                    type: {
                      coding: [
                        { system: 'http://loinc.org', code: '11488-4', display: 'Consult note' },
                      ],
                      text: 'Care Gap Closure Evidence Export',
                    },
                    category: [
                      {
                        coding: [
                          {
                            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                            code: 'CLINNOTEREF',
                            display: 'Clinical note reference',
                          },
                        ],
                      },
                    ],
                    subject: { reference: `Patient/${fhirPatientId}` },
                    date: new Date().toISOString(),
                    author: [{ display: 'TCOC Platform' }],
                    description: `Care Gap Closure Verification — ${programData.gapLabel}`,
                    content: [
                      {
                        attachment: {
                          contentType: 'text/plain',
                          title: `Care Gap Evidence — ${patientName} — ${programData.closedDate}`,
                          creation: new Date().toISOString(),
                        },
                      },
                    ],
                    context: { event: [{ coding: [{ display: 'Care Gap Closure' }] }] },
                    extension: [
                      {
                        url: 'http://tcoc.example.org/fhir/StructureDefinition/program-type',
                        valueString: programData.programType,
                      },
                    ],
                  })
                  .then(() => console.info('[DocumentReference] Evidence export record posted'))
                  .catch((err) => console.warn('[DocumentReference] POST failed:', err));
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors"
          >
            <Icon name="DocumentArrowDownIcon" size={14} />
            Print Evidence
          </button>
        </div>

        {/* Program type selector */}
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
            <Icon name="ShieldCheckIcon" size={15} className="text-[#0043ce]" />
            <h3 className="text-sm font-semibold text-carbon-gray-100">Program Evidence Type</h3>
            <span className="ml-auto text-xs text-carbon-gray-50">
              Select program to view evidence chain
            </span>
          </div>
          <div className="flex gap-0.5 p-2">
            {PROGRAM_TABS.map((tab) => {
              const cfg = PROGRAM_TYPE_CONFIG[tab.programType];
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveProgramTab(tab.key);
                    setActiveSection('evidence');
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors border ${
                    activeProgramTab === tab.key
                      ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                      : 'bg-white border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10'
                  }`}
                >
                  <Icon name={cfg.icon as any} size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status banner */}
        <div className={`border px-6 py-5 flex items-center gap-5 ${progCfg.bg} ${progCfg.border}`}>
          <div className="w-14 h-14 bg-[#24a148] flex items-center justify-center flex-shrink-0">
            <Icon name="CheckCircleIcon" size={28} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-[#0e6027]">
              {activeProgramTab === 'clinical'
                ? `${programData.gapLabel} Successfully Closed`
                : `${programData.programType} Intervention Successfully Closed`}
            </p>
            <p className="text-sm text-[#0e6027] mt-0.5">
              {programData.gapLabel} · {patientName} · Closed {programData.closedDate}
            </p>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-center bg-white border border-[#a7f0ba] px-4 py-3">
              <p className="text-xl font-bold font-mono text-[#24a148]">{programData.gainShare}</p>
              <p className="text-xs text-[#0e6027]">Program Value</p>
            </div>
            <div className="text-center bg-white border border-[#a7f0ba] px-4 py-3">
              <p className="text-xl font-bold font-mono text-[#0043ce]">
                {programData.qualityPoints}
              </p>
              <p className="text-xs text-[#0e6027]">Quality Score Pts</p>
            </div>
          </div>
        </div>

        {/* HbA1c HEDIS Quality Measure Panel — only for HbA1c clinical tab */}
        {activeProgramTab === 'clinical' && isClinicalHbA1c && (
          <div className="bg-white border border-[#0043ce] p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon name="ChartBarIcon" size={15} className="text-[#0043ce]" />
              <h3 className="text-sm font-semibold text-[#0043ce]">
                HEDIS Quality Measure Updated — HbA1c Control (CDC)
              </h3>
              <span
                className={`ml-auto text-xs font-bold px-2 py-1 ${hedisCompliance === 'MET' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fff1f1] text-[#da1e28]'}`}
              >
                {hedisCompliance === 'MET' ? '✓ COMPLIANT' : '✗ NOT MET'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Measure', value: 'HbA1c Control (poor) — CDC' },
                { label: 'Denominator', value: `MET — ${patientName} enrolled` },
                { label: 'Numerator', value: `${resultValue}% recorded` },
                {
                  label: 'Compliance',
                  value: hedisCompliance === 'MET' ? 'MET (< 8.0%)' : 'NOT MET (≥ 8.0%)',
                },
                { label: 'Gainshare Attribution', value: '$8,100 · Bennett County Health' },
                { label: 'Track', value: 'Medicaid RHTP Track 3' },
              ].map((item) => (
                <div key={item.label} className="border border-carbon-gray-20 p-3">
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                    {item.label}
                  </p>
                  <p
                    className={`text-xs font-semibold ${item.label === 'Compliance' ? (hedisCompliance === 'MET' ? 'text-[#24a148]' : 'text-[#da1e28]') : 'text-carbon-gray-100'}`}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Gainshare attribution */}
            <div className="flex items-center gap-4 p-4 bg-[#defbe6] border border-[#a7f0ba]">
              <Icon name="CurrencyDollarIcon" size={20} className="text-[#0e6027] flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-[#0e6027]">Gainshare Attributed — $8,100</p>
                <p className="text-xs text-[#0e6027]/80">
                  Patient: {patientName} · Attribution: Bennett County Health · Track: Medicaid RHTP
                  Track 3 · Status: ATTRIBUTED ✓
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-xs font-bold px-3 py-1.5 bg-[#24a148] text-white">
                  ATTRIBUTED ✓
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Gap summary */}
        <div className="bg-white border border-carbon-gray-20 px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Patient', value: patientName, sub: `DOB: 1992-03-22 · ${patientId}` },
            { label: 'Program', value: programData.programType, sub: programData.measure },
            {
              label: 'Requester',
              value: programData.timeline[0]?.actor ?? '—',
              sub: programData.timeline[0]?.org ?? '—',
            },
            {
              label: 'Closed By',
              value: programData.timeline[programData.timeline.length - 2]?.actor ?? '—',
              sub: programData.timeline[programData.timeline.length - 2]?.org ?? '—',
            },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                {item.label}
              </p>
              <p className="text-sm font-semibold text-carbon-gray-100">{item.value}</p>
              <p className="text-xs text-carbon-gray-50">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Section tabs */}
        <div className="flex gap-0.5 bg-carbon-gray-10 p-0.5 border border-carbon-gray-20">
          {[
            { key: 'evidence' as const, label: 'Evidence Submitted', icon: 'DocumentCheckIcon' },
            { key: 'provenance' as const, label: 'Provenance & Audit', icon: 'ShieldCheckIcon' },
            { key: 'timeline' as const, label: 'Closure Timeline', icon: 'MapIcon' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeSection === s.key
                  ? 'bg-[#0043ce] text-white'
                  : 'text-carbon-gray-70 hover:bg-white hover:text-carbon-gray-100'
              }`}
            >
              <Icon name={s.icon as any} size={13} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Evidence section */}
        {activeSection === 'evidence' && (
          <div className="space-y-2">
            <div
              className={`border px-5 py-3 flex items-center gap-2 ${progCfg.bg} ${progCfg.border}`}
            >
              <Icon name={progCfg.icon as any} size={15} className={progCfg.color} />
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                {programData.programType} Evidence Submitted for Gap Closure
              </h3>
              <span className="ml-auto text-xs text-carbon-gray-50">
                Auditable compliance record
              </span>
            </div>
            {programData.evidence.map((ev) => (
              <div
                key={ev.id}
                className="bg-white border border-carbon-gray-20 px-5 py-4 flex items-start gap-4"
              >
                <div
                  className={`w-8 h-8 ${progCfg.bg} border ${progCfg.border} flex items-center justify-center flex-shrink-0`}
                >
                  <Icon name={ev.icon as any} size={14} className={ev.color} />
                </div>
                <div className="flex-1">
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                    {ev.label}
                  </p>
                  <p
                    className={`text-sm font-medium ${ev.type === 'Measure' ? (hedisCompliance === 'MET' ? 'text-[#24a148] font-semibold' : 'text-[#da1e28] font-semibold') : 'text-carbon-gray-100'}`}
                  >
                    {ev.value}
                  </p>
                </div>
                {ev.type === 'Measure' && (
                  <div className="flex-shrink-0">
                    <span
                      className={`text-2xs font-bold px-2 py-1 border ${hedisCompliance === 'MET' ? 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]' : 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]'}`}
                    >
                      {hedisCompliance === 'MET' ? '✓ COMPLIANT' : '✗ NOT MET'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Provenance section */}
        {activeSection === 'provenance' && (
          <div className="space-y-2">
            <div className="bg-white border border-carbon-gray-20 px-5 py-3 flex items-center gap-2">
              <Icon name="ShieldCheckIcon" size={15} className="text-[#6929c4]" />
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                Provenance & Data Lineage
              </h3>
              <span className="ml-auto text-xs text-carbon-gray-50">
                FHIR R4 · Immutable audit trail · {programData.programType}
              </span>
            </div>
            {programData.provenance.map((p, i) => (
              <div
                key={i}
                className="bg-white border border-carbon-gray-20 px-5 py-4 flex items-start gap-4"
              >
                <div className="w-8 h-8 bg-[#f6f2ff] border border-[#d4bbff] flex items-center justify-center flex-shrink-0">
                  <Icon name={p.icon as any} size={14} className="text-[#6929c4]" />
                </div>
                <div className="flex-1">
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                    {p.label}
                  </p>
                  <p className="text-sm font-medium text-carbon-gray-100 font-mono">{p.value}</p>
                </div>
              </div>
            ))}
            <div className="bg-[#f0f4ff] border border-[#97c1ff] px-5 py-4 flex items-center gap-4">
              <Icon name="ArrowUpTrayIcon" size={20} className="text-[#0043ce] flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#0043ce]">
                  Returned to EDW & Quality Reporting System
                </p>
                <p className="text-xs text-carbon-gray-50 mt-0.5">
                  {programData.programType} intervention evidence submitted to South Dakota DHSS EDW
                  on {programData.closedDate}. Included in Q2 2026 quality reporting cycle.
                  Provenance chain: Source → FHIR R4 → EDW.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Timeline section */}
        {activeSection === 'timeline' && (
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="MapIcon" size={15} className="text-[#0043ce]" />
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                {programData.programType} Closure Timeline
              </h3>
              <span className="ml-auto text-xs text-carbon-gray-50">
                {(fhirTaskTimeline.length > 0 ? fhirTaskTimeline : programData.timeline).length}{' '}
                steps · Closed {programData.closedDate}
              </span>
              {fhirTaskTimeline.length > 0 && (
                <span className="text-2xs font-medium px-2 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
                  FHIR Task history
                </span>
              )}
            </div>
            <div className="p-5">
              <div className="relative">
                <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-[#24a148]" />
                <div className="space-y-0">
                  {(fhirTaskTimeline.length > 0 ? fhirTaskTimeline : programData.timeline).map(
                    (step, i) => (
                      <div key={i} className="flex items-start gap-4 pb-6 last:pb-0">
                        <div className="relative z-10 w-10 h-10 bg-[#24a148] flex items-center justify-center flex-shrink-0">
                          <Icon name="CheckIcon" size={14} className="text-white" />
                        </div>
                        <div className="flex-1 pt-1.5">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-sm font-semibold text-carbon-gray-100">
                              {step.label}
                            </p>
                            <span className="text-2xs font-mono text-carbon-gray-50 bg-carbon-gray-10 px-2 py-0.5 border border-carbon-gray-20">
                              {step.date}
                            </span>
                          </div>
                          <p className="text-xs text-carbon-gray-50 mt-0.5">
                            {step.actor} · <span className="text-carbon-gray-30">{step.org}</span>
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
