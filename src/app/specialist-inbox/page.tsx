'use client';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/lib/appContext';
import { getPatientById, PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { effectiveMemberId } from '@/lib/careTeam/identity';
import { getMemberName } from '@/lib/careTeam/members';
import { useGapClosureStore } from '@/lib/patientContext';
import type { GapClosureEvidence } from '@/lib/patientContext';
import { getFhirClient } from '@/lib/services/fhirClient';
import { completeServiceAndCloseGap } from '@/lib/services/referralService';

interface SpecialistTask {
  id: string;
  gapId?: string;
  patient: string;
  patientId: string;
  dob: string;
  requestedIntervention: string;
  referringProvider: string;
  referringOrg: string;
  dueDate: string;
  urgency: 'Routine' | 'Urgent' | 'STAT';
  status: 'Pending' | 'Accepted' | 'In Progress' | 'Completed';
  specialty: string;
  qualityMeasure: string;
  qualityProgram: string;
  gainShareValue: string;
  sharedSavingsAttribution: string;
  networkIncentiveImpact: string;
  icdCode: string;
  clinicalContext: string;
}

const STATIC_SPECIALIST_TASKS: Omit<SpecialistTask, 'patient' | 'patientId' | 'dob'>[] = [
  {
    id: 'st-001',
    requestedIntervention: 'Cardiology Evaluation — Uncontrolled Hypertension',
    referringProvider: 'Dr. James Whitfield',
    referringOrg: 'Shannon Valley PCP Group',
    dueDate: '2026-06-15',
    urgency: 'Urgent',
    status: 'Pending',
    specialty: 'Cardiology',
    qualityMeasure: 'HEDIS CBP-236 — Controlling Hypertension',
    qualityProgram: 'HEDIS',
    gainShareValue: '$195',
    sharedSavingsAttribution: '$72',
    networkIncentiveImpact: 'High',
    icdCode: 'I10',
    clinicalContext: 'BP 158/96 on 3 medications. HFpEF comorbidity. JNC 8 resistant HTN criteria met.',
  },
];

const OTHER_SPECIALIST_TASKS: SpecialistTask[] = [
  {
    id: 'st-002',
    patient: 'James Wilson',
    patientId: 'PAT-0087',
    dob: '1948-07-22',
    requestedIntervention: 'Nephrology Consult — CKD Stage 3b Monitoring',
    referringProvider: 'Dr. Sarah Johnson',
    referringOrg: 'Ozark Regional FQHC',
    dueDate: '2026-05-30',
    urgency: 'Urgent',
    status: 'Accepted',
    specialty: 'Nephrology',
    qualityMeasure: 'HEDIS CDC-001 — A1C Control',
    qualityProgram: 'HEDIS',
    gainShareValue: '$220',
    sharedSavingsAttribution: '$85',
    networkIncentiveImpact: 'High',
    icdCode: 'N18.32',
    clinicalContext: 'eGFR 42, trending down. T2DM comorbidity. Requires nephrology co-management.',
  },
  {
    id: 'st-003',
    patient: 'Margaret Okonkwo',
    patientId: 'PAT-0113',
    dob: '1955-11-08',
    requestedIntervention: 'Diabetic Eye Exam',
    referringProvider: 'Dr. Sarah Chen',
    referringOrg: 'Winner Community Health FQHC',
    dueDate: '2026-09-30',
    urgency: 'Routine',
    status: 'Pending',
    specialty: 'Ophthalmology',
    qualityMeasure: 'HEDIS EED — Diabetic Eye Exam',
    qualityProgram: 'HEDIS',
    gainShareValue: '$110',
    sharedSavingsAttribution: '$42',
    networkIncentiveImpact: 'Medium',
    icdCode: 'E11.65',
    clinicalContext: 'T2DM diagnosed 2018. No eye exam documented in 24 months. HEDIS EED gap open.',
  },
  {
    id: 'st-004',
    patient: 'James Whitaker',
    patientId: 'PAT-0156',
    dob: '1943-05-30',
    requestedIntervention: 'Colorectal Cancer Screening — Colonoscopy',
    referringProvider: 'Dr. Michael Rivera',
    referringOrg: 'Gregory County Medical Associates',
    dueDate: '2026-12-31',
    urgency: 'Routine',
    status: 'In Progress',
    specialty: 'Gastroenterology',
    qualityMeasure: 'HEDIS COL-113 — Colorectal Cancer Screening',
    qualityProgram: 'HEDIS',
    gainShareValue: '$75',
    sharedSavingsAttribution: '$28',
    networkIncentiveImpact: 'Medium',
    icdCode: 'Z12.11',
    clinicalContext: 'Age 82. No prior colonoscopy documented. FOBT acceptable alternative.',
  },
  {
    id: 'st-005',
    patient: 'Patricia Nguyen',
    patientId: 'PAT-0201',
    dob: '1960-09-17',
    requestedIntervention: 'Pulmonology Follow-up — COPD Exacerbation Risk',
    referringProvider: 'Dr. James Whitfield',
    referringOrg: 'Winner Regional Medical Center',
    dueDate: '2026-06-01',
    urgency: 'STAT',
    status: 'Pending',
    specialty: 'Pulmonology',
    qualityMeasure: 'MIPS-398 — COPD Management',
    qualityProgram: 'MIPS',
    gainShareValue: '$165',
    sharedSavingsAttribution: '$63',
    networkIncentiveImpact: 'High',
    icdCode: 'J44.1',
    clinicalContext: '2 ER visits in 90 days. Spirometry not done in 12 months. High readmission risk.',
  },
];

const URGENCY_STYLE: Record<string, string> = {
  'STAT': 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  'Urgent': 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  'Routine': 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
};

const STATUS_STYLE: Record<string, string> = {
  'Pending': 'bg-[#fff1f1] text-[#da1e28]',
  'Accepted': 'bg-[#fdf6dd] text-[#b45309]',
  'In Progress': 'bg-[#d0e2ff] text-[#0043ce]',
  'Completed': 'bg-[#defbe6] text-[#0e6027]',
};

// ─── Diagnosis panel state ────────────────────────────────────────────────────
interface DiagnosisEntry {
  icdCode: string;
  description: string;
  savedToFhir: boolean;
}

function deriveGapContext(task: SpecialistTask) {
  const normalizedMeasure = `${task.qualityMeasure} ${task.requestedIntervention} ${task.clinicalContext}`.toLowerCase();

  if (normalizedMeasure.includes('retinal') || normalizedMeasure.includes('eye exam') || normalizedMeasure.includes('hedis eed')) {
    return {
      gapId: task.patientId === 'PAT-0087' ? 'jw-3' : (task.gapId ?? task.id),
      procedureCode: '2022F',
      observationCode: 'retinal-exam',
      resultValue: undefined,
      resultUnit: undefined,
      placeOfService: 'Ophthalmology Clinic',
    };
  }

  if (normalizedMeasure.includes('a1c') || normalizedMeasure.includes('hba1c') || normalizedMeasure.includes('diabetes')) {
    const defaultValue = task.patientId === 'PAT-0087' ? 7.4 : 6.8;
    return {
      gapId: task.patientId === 'PAT-0087' ? 'jw-1' : 'CG_MARIA_001',
      procedureCode: '83036',
      observationCode: '4548-4',
      resultValue: defaultValue,
      resultUnit: '%',
      placeOfService: 'Lab',
    };
  }

  return {
    gapId: task.gapId ?? task.id,
    procedureCode: task.icdCode !== '—' ? task.icdCode : 'PROC-001',
    observationCode: task.icdCode !== '—' ? task.icdCode : 'PROC-001',
    resultValue: undefined,
    resultUnit: undefined,
    placeOfService: 'Specialty Clinic',
  };
}

export default function SpecialistInboxPage() {
  const router = useRouter();
  const { activePatientId, assignments, activePhysician, useMockData, setPhysicianPersona } = useAppContext();
  const activePatient = getPatientById(activePatientId);
  const { submitClosure, isGapClosed } = useGapClosureStore();

  // ── FHIR live tasks (Step 4) ──────────────────────────────────────────────
  const [fhirTasks, setFhirTasks] = useState<SpecialistTask[]>([]);
  const [fhirLoading, setFhirLoading] = useState(false);

  useEffect(() => {
    if (useMockData) return; // skip in mock mode
    const load = async () => {
      setFhirLoading(true);
      try {
        const client = getFhirClient();
        // Fetch Tasks where owner = current physician (jon = social, rick = clinical/BH)
        const bundle = await client.search('Task', {
          owner: `Practitioner/${activePhysician.fhirId}`,
          _count: 100,
        }) as any;
        const entries: any[] = bundle.entry ?? [];
        const tasks: SpecialistTask[] = entries
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === 'Task')
          .map((t: any) => {
            // Resolve the FHIR patient id → platform id → registry data
            const fhirPatientId: string = t.for?.reference?.split('/')[1] ?? '';
            const platformId = Object.entries(PLATFORM_TO_FHIR_ID_MAP).find(
              ([, fhirId]) => fhirId === fhirPatientId,
            )?.[0] ?? '';
            const reg = platformId ? getPatientById(platformId) : undefined;
            const domain: string = t.extension?.find(
              (ex: any) => ex.url === 'http://tcoc.example.org/fhir/StructureDefinition/care-gap-domain',
            )?.valueString ?? 'Clinical';
            const domainSpecialty: Record<string, string> = {
              Clinical: 'Primary Care', BH: 'Behavioral Health', Social: 'Social Work',
            };
            const derivedGapId = t.extension?.find(
              (ex: any) => ex.url === 'http://tcoc.example.org/fhir/StructureDefinition/tcoc-gap-id',
            )?.valueString;
            return {
              id: t.id,
              gapId: derivedGapId,
              patient: reg?.name ?? t.for?.display ?? 'Unknown Patient',
              patientId: platformId || fhirPatientId,
              dob: reg?.dob ?? '—',
              requestedIntervention: t.description ?? t.code?.text ?? 'Care Gap Task',
              referringProvider: t.requester?.display ?? reg?.careManager ?? 'Care Team',
              referringOrg: reg?.organization ?? 'RHTP Network',
              dueDate: t.executionPeriod?.end?.split('T')[0] ?? '—',
              urgency: (t.priority === 'stat' ? 'STAT' : t.priority === 'urgent' ? 'Urgent' : 'Routine') as SpecialistTask['urgency'],
              status: (t.status === 'completed' ? 'Completed' : t.status === 'in-progress' ? 'In Progress' : t.status === 'accepted' ? 'Accepted' : 'Pending') as SpecialistTask['status'],
              specialty: domainSpecialty[domain] ?? 'Specialist',
              qualityMeasure: `HEDIS — ${domain} Care Gap`,
              qualityProgram: 'HEDIS',
              gainShareValue: domain === 'Clinical' ? '$185' : domain === 'BH' ? '$140' : '$95',
              sharedSavingsAttribution: domain === 'Clinical' ? '$72' : domain === 'BH' ? '$55' : '$38',
              networkIncentiveImpact: t.priority === 'urgent' ? 'High' : 'Medium',
              icdCode: reg?.conditions?.[0]?.code ?? '—',
              clinicalContext: t.note?.[0]?.text ?? reg?.aiCopilot?.slice(0, 120) ?? '',
              fhirTaskId: t.id,
              serviceRequestRef: t.focus?.reference ?? '',
            };
          });
        if (tasks.length > 0) setFhirTasks(tasks);
      } catch (err) {
        console.warn('[SpecialistInbox] FHIR task load failed, using mock:', err);
      } finally {
        setFhirLoading(false);
      }
    };
    load();
  }, [activePhysician.fhirId, useMockData]);

  // Build the first task dynamically from the active patient (mock)
  const firstTask: SpecialistTask = {
    ...STATIC_SPECIALIST_TASKS[0],
    patient: activePatient?.name ?? 'Unknown Patient',
    patientId: activePatient?.platformId ?? activePatientId,
    dob: activePatient?.dob ?? '—',
  };

  // Use FHIR tasks if available, otherwise fall back to mock
  const SPECIALIST_TASKS: SpecialistTask[] = !useMockData && fhirTasks.length > 0
    ? fhirTasks
    : [firstTask, ...OTHER_SPECIALIST_TASKS];

  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterUrgency, setFilterUrgency] = useState('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [closedByFhir, setClosedByFhir] = useState<Set<string>>(new Set());

  // ── Diagnosis panel (Step 6) ──────────────────────────────────────────────
  const [showDiagnosisPanel, setShowDiagnosisPanel] = useState<string | null>(null);
  const [diagnosisInput, setDiagnosisInput] = useState({ icdCode: '', description: '' });
  const [savedDiagnoses, setSavedDiagnoses] = useState<Record<string, DiagnosisEntry[]>>({});
  const [diagnosisSaving, setDiagnosisSaving] = useState(false);

  // Auto-populate gap closure evidence for the active patient's HbA1c gap.
  // fhirObservationId uses the canonical migration pattern so submitClosure
  // issues a PUT against the existing Observation rather than POSTing a duplicate.
  const autoPopulateEvidence = useCallback((task: SpecialistTask): GapClosureEvidence => {
    const clinicalContext = task.clinicalContext || '';
    const hba1cMatch = clinicalContext.match(/(\d+\.?\d*)\s*%/);
    const derivedGap = deriveGapContext(task);
    const resultValue = derivedGap.resultValue ?? (hba1cMatch ? parseFloat(hba1cMatch[1]) : undefined);
    const hedisCompliance = resultValue !== undefined ? (resultValue < 8.0 ? 'MET' : 'NOT_MET') : 'MET';

    return {
      gapId: derivedGap.gapId,
      status: 'CLOSED',
      closedFrom: 'SMART_LAUNCH',
      dateOfService: new Date().toISOString().split('T')[0],
      performingProvider: task.referringProvider || 'Bennett County Health PCP',
      placeOfService: derivedGap.placeOfService,
      procedureCode: derivedGap.procedureCode,
      resultValue,
      resultUnit: derivedGap.resultUnit,
      hedisCompliance,
      gainshare: 8100,
      fhirObservationId: `patient-${PLATFORM_TO_FHIR_ID_MAP[task.patientId] ?? task.patientId}-gap-${derivedGap.gapId}`,
      closedAt: new Date().toISOString(),
    };
  }, []);

  // Handle gap closure attestation — Step 5: writes to FHIR when live
  const handleAttestAndClose = useCallback(async (task: SpecialistTask) => {
    setIsSubmitting(true);
    const evidence = autoPopulateEvidence(task);
    submitClosure(evidence); // always update local store

    if (!useMockData) {
      try {
        const derivedGap = deriveGapContext(task);
        const patientFhirId = PLATFORM_TO_FHIR_ID_MAP[task.patientId] ?? task.patientId;
        await completeServiceAndCloseGap({
          taskId: (task as any).fhirTaskId ?? `task-${task.id}`,
          serviceRequestId: (task as any).serviceRequestRef ?? `sr-${task.id}`,
          patientId: patientFhirId,
          performerId: activePhysician.fhirId,
          procedureCode: derivedGap.procedureCode,
          procedureDisplay: task.requestedIntervention,
          performedDate: new Date().toISOString().split('T')[0],
          observations: [{
            code: derivedGap.observationCode,
            codeSystem: 'http://loinc.org',
            display: task.requestedIntervention,
            valueQuantity: { value: evidence.resultValue ?? 6.8, unit: evidence.resultUnit ?? '%', system: 'http://unitsofmeasure.org', code: '%' },
          }],
          notes: `Gap closed by ${activePhysician.displayName} on ${new Date().toLocaleDateString()}`,
        });
        setClosedByFhir(prev => new Set(prev).add(task.id));

        // ── DetectedIssue PUT: mark gap as mitigated on HAPI ─────────────────
        // Try to find and update the DetectedIssue for this gap if one exists.
        // We search by patient and look for a DetectedIssue with status=preliminary.
        const client = getFhirClient();
        client.search('DetectedIssue', {
          patient: `Patient/${patientFhirId}`,
          status: 'preliminary',
          _count: 10,
        }).then((bundle: any) => {
          const issues: any[] = (bundle?.entry ?? [])
            .map((e: any) => e?.resource)
            .filter(Boolean)
            .filter((r: any) => r?.resourceType === 'DetectedIssue');
          // Update the first matching DetectedIssue (or the one linked to this task)
          const issue = issues.find((i: any) =>
            i.implicated?.some((ref: any) => ref.reference?.includes(task.id))
          ) ?? issues[0];
          if (issue?.id) {
            client.update({
              resourceType: 'DetectedIssue',
              id: issue.id,
              status: 'mitigated',
              patient: { reference: `Patient/${patientFhirId}` },
              code: issue.code,
              mitigation: [{
                action: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'RESOLVED', display: 'Resolved' }] },
                date: new Date().toISOString(),
                author: { reference: `Practitioner/${activePhysician.fhirId}`, display: activePhysician.displayName },
              }],
            } as any).catch((err: unknown) => console.warn('[DetectedIssue] PUT mitigated failed:', err));
          }
        }).catch(() => { /* DetectedIssue search is best-effort */ });

      } catch (err) {
        console.warn('[SpecialistInbox] FHIR gap closure failed (local store updated):', err);
      }
    }

    setShowSuccessToast(true);
    setSelectedTask(null);
    setTimeout(() => {
      setIsSubmitting(false);
      router.push('/care-gap-closure-verification');
    }, 1500);
  }, [autoPopulateEvidence, submitClosure, router, activePhysician]);

  // Handle diagnosis save to FHIR — Step 6
  const handleSaveDiagnosis = useCallback(async (task: SpecialistTask) => {
    if (!diagnosisInput.icdCode.trim()) return;
    setDiagnosisSaving(true);
    const entry: DiagnosisEntry = { ...diagnosisInput, savedToFhir: false };

    if (!useMockData) {
      try {
        const client = getFhirClient();
        const patientFhirId = task.patientId.startsWith('patient-') ? task.patientId : 'patient-maria-001';
        const condition = {
          resourceType: 'Condition',
          id: `cond-${activePhysician.id}-${Date.now()}`,
          clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
          verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
          code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: diagnosisInput.icdCode, display: diagnosisInput.description }], text: diagnosisInput.description },
          subject: { reference: `Patient/${patientFhirId}` },
          recorder: { reference: `Practitioner/${activePhysician.fhirId}`, display: activePhysician.displayName },
          recordedDate: new Date().toISOString().split('T')[0],
          note: [{ text: `Added by ${activePhysician.displayName} from Specialist Inbox` }],
        };
        await client.create(condition as any);
        entry.savedToFhir = true;
      } catch (err) {
        console.warn('[SpecialistInbox] FHIR Condition save failed:', err);
      }
    } else {
      entry.savedToFhir = false;
    }

    setSavedDiagnoses(prev => ({
      ...prev,
      [task.id]: [...(prev[task.id] ?? []), entry],
    }));
    setDiagnosisInput({ icdCode: '', description: '' });
    setDiagnosisSaving(false);
  }, [diagnosisInput, activePhysician]);

  const filtered = SPECIALIST_TASKS.filter((t) => {
    const statusMatch = filterStatus === 'All' || t.status === filterStatus;
    const urgencyMatch = filterUrgency === 'All' || t.urgency === filterUrgency;
    return statusMatch && urgencyMatch;
  });

  const totalGainShare = SPECIALIST_TASKS
    .filter((t) => t.status !== 'Completed')
    .reduce((s, t) => s + parseInt(t.gainShareValue.replace('$', '')), 0);

  const pendingCount = SPECIALIST_TASKS.filter((t) => t.status === 'Pending').length;
  const statCount = SPECIALIST_TASKS.filter((t) => t.urgency === 'STAT').length;

  // Get auto-populated evidence for display
  const mariaEvidence = useMemo(() => {
    const mariaTask = SPECIALIST_TASKS.find(t => t.id === 'st-001');
    return mariaTask ? autoPopulateEvidence(mariaTask) : null;
  }, [SPECIALIST_TASKS, autoPopulateEvidence]);

  return (
    <AppLayout
      pageTitle="Specialist Inbox — RHTP Task Queue"
      breadcrumbs={[
        { label: 'RHTP Platform', href: '/contract-program-selection' },
        { label: 'Specialist Inbox' },
      ]}
      contextBanner={
        <div className="bg-[#f6f2ff] border-b border-[#d4bbff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#6929c4]">Dr. Jon Noyes — Specialist Inbox</span>
          <span className="text-xs text-[#6929c4]">{pendingCount} Pending Tasks</span>
          {statCount > 0 && <span className="text-xs font-bold text-[#da1e28]">⚠ {statCount} STAT</span>}
          <span className="text-xs text-[#6929c4]">Potential Gain Share: ${totalGainShare}</span>
          <span className="ml-auto flex items-center gap-2">
            {fhirLoading && (
              <span className="flex items-center gap-1 text-xs text-carbon-gray-50">
                <div className="w-3 h-3 border border-[#6929c4] border-t-transparent rounded-full animate-spin" />
                Loading FHIR tasks…
              </span>
            )}
            {!fhirLoading && !useMockData && fhirTasks.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-[#0e6027] font-medium">
                <Icon name="CheckCircleIcon" size={12} style={{ color: '#24a148' }} />
                {fhirTasks.length} FHIR tasks loaded
              </span>
            )}
            <span className="text-xs text-carbon-gray-50">Data as of May 29, 2026</span>
            <button
              onClick={() => { setPhysicianPersona('rick'); router.push(`/md-smart-launch?patientId=${PLATFORM_TO_FHIR_ID_MAP[activePatientId] ?? activePatientId}`); }}
              className="flex items-center gap-1 text-xs font-semibold text-[#6929c4] hover:text-[#491d8b] border border-[#d4bbff] bg-white px-2 py-0.5 hover:bg-[#f6f2ff] transition-colors"
              title="Switch back to Dr. Rick — Smart App"
            >
              <Icon name="ArrowLeftIcon" size={12} />
              ⚡ Back to Smart App (RW)
            </button>
          </span>
        </div>
      }
    >
      {/* Success Toast */}
      {showSuccessToast && (
        <div className="mx-6 mt-4 bg-[#defbe6] border border-[#a7f0ba] px-5 py-4 flex items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 bg-[#24a148] flex items-center justify-center flex-shrink-0">
            <Icon name="CheckCircleIcon" size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-[#0e6027]">Gap Closed Successfully!</p>
            <p className="text-xs text-[#0e6027] mt-0.5">
              HbA1c gap closed for Maria Redhawk · $8,100 gainshare attributed · Navigating to verification...
            </p>
          </div>
          <button
            onClick={() => setShowSuccessToast(false)}
            className="text-[#0e6027] hover:text-[#044317]"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
      )}
      {/* KPI strip */}
      <div className="mx-6 mt-4 mb-4 bg-white border border-carbon-gray-20 grid grid-cols-4 divide-x divide-carbon-gray-20">
        {[
          { label: 'Pending Tasks', value: pendingCount, color: 'text-[#da1e28]' },
          { label: 'STAT Priority', value: statCount, color: 'text-[#da1e28]' },
          { label: 'Potential Gain Share', value: `$${totalGainShare}`, color: 'text-[#24a148]' },
          { label: 'Completion Rate', value: '72%', color: 'text-[#0043ce]' },
        ].map((k) => (
          <div key={k.label} className="px-5 py-4">
            <p className="carbon-label">{k.label}</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 space-y-4">
        {/* Filters */}
        <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">Filter</span>
          {['All', 'Pending', 'Accepted', 'In Progress', 'Completed'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 text-xs font-medium border transition-colors ${
                filterStatus === s ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
              }`}
            >
              {s}
            </button>
          ))}
          <div className="w-px h-4 bg-carbon-gray-20 mx-1" />
          {['All', 'STAT', 'Urgent', 'Routine'].map((u) => (
            <button
              key={u}
              onClick={() => setFilterUrgency(u)}
              className={`px-3 py-1 text-xs font-medium border transition-colors ${
                filterUrgency === u ? 'bg-[#6929c4] text-white border-[#6929c4]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="space-y-3">
          {filtered.map((task) => {
            const isSelected = selectedTask === task.id;
            const totalValue = parseInt(task.gainShareValue.replace('$', '')) + parseInt(task.sharedSavingsAttribution.replace('$', ''));
            return (
              <div
                key={task.id}
                className={`bg-white border transition-shadow ${
                  task.urgency === 'STAT' ? 'border-l-4 border-l-[#da1e28] border-carbon-gray-20' :
                  task.urgency === 'Urgent' ? 'border-l-4 border-l-[#b45309] border-carbon-gray-20' :
                  'border border-carbon-gray-20'
                } ${isSelected ? 'ring-2 ring-[#6929c4]' : 'hover:shadow-carbon-md'}`}
              >
                {/* Task header */}
                <div
                  className="px-5 py-4 cursor-pointer"
                  onClick={() => setSelectedTask(isSelected ? null : task.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-2xs font-semibold px-2 py-0.5 border ${URGENCY_STYLE[task.urgency]}`}>
                          {task.urgency}
                        </span>
                        <span className={`text-2xs font-semibold px-2 py-0.5 ${STATUS_STYLE[task.status]}`}>
                          {task.status}
                        </span>
                        <span className="text-2xs font-semibold px-2 py-0.5 bg-[#f6f2ff] text-[#6929c4]">
                          {task.qualityProgram}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-carbon-gray-100">{task.requestedIntervention}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-carbon-gray-50">
                        <span>
                          <span className="font-medium text-carbon-gray-70">{task.patient}</span>
                          <span className="text-carbon-gray-30 mx-1">·</span>
                          <span className="font-mono">{task.patientId}</span>
                          <span className="text-carbon-gray-30 mx-1">·</span>
                          <span>DOB: {task.dob}</span>
                        </span>
                        <span className="text-carbon-gray-30">|</span>
                        <span>{task.specialty}</span>
                        <span className="text-carbon-gray-30">·</span>
                        <span className="font-mono text-carbon-gray-30">ICD: {task.icdCode}</span>
                        {(() => {
                          const cm = getMemberName(effectiveMemberId(task.patientId, assignments) ?? '');
                          return cm ? (
                            <>
                              <span className="text-carbon-gray-30">·</span>
                              <span className="inline-flex items-center gap-1 text-carbon-gray-50">
                                <Icon name="UserCircleIcon" size={11} />
                                CM: <span className="font-medium text-carbon-gray-70">{cm}</span>
                              </span>
                            </>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs font-semibold text-[#24a148]">{task.gainShareValue}</p>
                      <p className="text-2xs text-carbon-gray-50">gain share</p>
                      <p className="text-2xs text-carbon-gray-30 mt-0.5">Due {task.dueDate}</p>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div className="border-t border-carbon-gray-20 px-5 py-4 space-y-4">
                    {/* Physician context banner */}
                    <div className="flex items-center gap-2 px-3 py-2 border rounded text-xs font-medium"
                      style={{ borderColor: activePhysician.color, color: activePhysician.color, background: activePhysician.color + '15' }}>
                      <Icon name="UserCircleIcon" size={14} />
                      Viewing as {activePhysician.displayName} · {activePhysician.role}
                      {closedByFhir.has(task.id) && (
                        <span className="ml-auto text-[#198038] font-semibold">✓ Closed in FHIR</span>
                      )}
                    </div>
                    {/* Quality measure */}
                    <div className="bg-[#f6f2ff] border border-[#d4bbff] px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name="StarIcon" size={14} className="text-[#6929c4]" />
                        <span className="text-xs font-semibold text-[#6929c4]">Quality Measure</span>
                      </div>
                      <p className="text-sm font-medium text-carbon-gray-100">{task.qualityMeasure}</p>
                    </div>

                    {/* Clinical context */}
                    <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-4 py-3">
                      <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-1">Clinical Context</p>
                      <p className="text-xs text-carbon-gray-70">{task.clinicalContext}</p>
                    </div>

                    {/* Referring provider */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">Referring Provider</p>
                        <p className="text-xs font-medium text-carbon-gray-100">{task.referringProvider}</p>
                        <p className="text-2xs text-carbon-gray-50">{task.referringOrg}</p>
                      </div>
                      <div>
                        <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">Value Attribution</p>
                        <p className="text-xs font-medium text-carbon-gray-100">
                          Gain Share: <span className="text-[#24a148] font-bold">{task.gainShareValue}</span>
                          <span className="text-carbon-gray-30 mx-1">+</span>
                          Shared Savings: <span className="text-[#0043ce] font-bold">{task.sharedSavingsAttribution}</span>
                        </p>
                        <p className="text-2xs text-carbon-gray-50">Network Impact: {task.networkIncentiveImpact}</p>
                      </div>
                    </div>

                    {/* Inline Attestation Panel for Maria Redhawk */}
                    {task.id === 'st-001' && mariaEvidence && (
                      <div className="border-t border-carbon-gray-20 mt-4 pt-4 bg-[#f0f4ff]">
                        <div className="flex items-center gap-2 mb-3">
                          <Icon name="SparklesIcon" size={14} className="text-[#6929c4]" />
                          <span className="text-xs font-semibold text-[#6929c4]">Auto-Populated Gap Closure Evidence</span>
                          <span className="ml-auto text-2xs text-carbon-gray-50">Review and attest below</span>
                        </div>
                        
                        {/* Auto-populated fields */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-white border border-carbon-gray-20 px-3 py-2">
                            <p className="text-2xs text-carbon-gray-50 mb-0.5">Date of Service</p>
                            <p className="text-xs font-medium text-carbon-gray-100">{mariaEvidence.dateOfService}</p>
                          </div>
                          <div className="bg-white border border-carbon-gray-20 px-3 py-2">
                            <p className="text-2xs text-carbon-gray-50 mb-0.5">Performing Provider</p>
                            <p className="text-xs font-medium text-carbon-gray-100">{mariaEvidence.performingProvider}</p>
                          </div>
                          <div className="bg-white border border-carbon-gray-20 px-3 py-2">
                            <p className="text-2xs text-carbon-gray-50 mb-0.5">Place of Service</p>
                            <p className="text-xs font-medium text-carbon-gray-100">{mariaEvidence.placeOfService}</p>
                          </div>
                          <div className="bg-white border border-[#a7f0ba] px-3 py-2 bg-[#defbe6]">
                            <p className="text-2xs text-[#0e6027] mb-0.5">HbA1c Result</p>
                            <p className="text-xs font-bold text-[#0e6027]">
                              {mariaEvidence.resultValue}% {mariaEvidence.hedisCompliance === 'MET' ? '✓ COMPLIANT' : '✗ NOT MET'}
                            </p>
                          </div>
                        </div>
                        
                        {/* Gainshare preview */}
                        <div className="bg-[#defbe6] border border-[#a7f0ba] px-3 py-2 mb-3 flex items-center justify-between">
                          <span className="text-xs text-[#0e6027]">Gainshare Attribution</span>
                          <span className="text-sm font-bold text-[#0e6027]">${mariaEvidence.gainshare?.toLocaleString()}</span>
                        </div>
                        
                        {/* Attest button */}
                        <button
                          onClick={() => handleAttestAndClose(task)}
                          disabled={isSubmitting}
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-[#24a148] text-white hover:bg-[#0e6027] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Icon name="CheckCircleIcon" size={14} />
                          {isSubmitting ? 'Submitting...' : 'Attest & Close Gap'}
                        </button>
                      </div>
                    )}

                    {/* Diagnosis panel — Step 6 */}
                    <div className="border border-carbon-gray-20 bg-carbon-gray-10">
                      <button
                        onClick={() => setShowDiagnosisPanel(showDiagnosisPanel === task.id ? null : task.id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-carbon-gray-70 hover:bg-carbon-gray-20 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <Icon name="DocumentTextIcon" size={13} />
                          Add / Edit Diagnosis Code
                          {(savedDiagnoses[task.id]?.length ?? 0) > 0 && (
                            <span className="bg-[#0043ce] text-white text-2xs px-1.5 py-0.5 rounded">
                              {savedDiagnoses[task.id].length} saved
                            </span>
                          )}
                        </span>
                        <Icon name={showDiagnosisPanel === task.id ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={13} />
                      </button>
                      {showDiagnosisPanel === task.id && (
                        <div className="border-t border-carbon-gray-20 px-4 py-3 space-y-3 bg-white">
                          {(savedDiagnoses[task.id] ?? []).map((d, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-semibold text-carbon-gray-100">{d.icdCode}</span>
                              <span className="text-carbon-gray-70">{d.description}</span>
                              {d.savedToFhir
                                ? <span className="ml-auto text-[#198038] text-2xs font-semibold">✓ In FHIR</span>
                                : <span className="ml-auto text-carbon-gray-40 text-2xs">mock only</span>
                              }
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <input
                              className="border border-carbon-gray-20 px-2 py-1.5 text-xs w-24 font-mono focus:outline-none focus:border-[#0043ce]"
                              placeholder="ICD-10"
                              value={diagnosisInput.icdCode}
                              onChange={e => setDiagnosisInput(p => ({ ...p, icdCode: e.target.value.toUpperCase() }))}
                            />
                            <input
                              className="border border-carbon-gray-20 px-2 py-1.5 text-xs flex-1 focus:outline-none focus:border-[#0043ce]"
                              placeholder="Description (e.g. Type 2 Diabetes)"
                              value={diagnosisInput.description}
                              onChange={e => setDiagnosisInput(p => ({ ...p, description: e.target.value }))}
                            />
                            <button
                              onClick={() => handleSaveDiagnosis(task)}
                              disabled={diagnosisSaving || !diagnosisInput.icdCode.trim()}
                              className="px-3 py-1.5 text-xs font-medium bg-[#0043ce] text-white hover:bg-[#0035a8] disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {diagnosisSaving ? 'Saving...' : useMockData ? 'Save (mock)' : 'Save to FHIR'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => router.push(`/patient-detail?id=${task.patientId}`)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors"
                      >
                        <Icon name="UserIcon" size={13} />
                        View Patient
                      </button>
                      <button
                        onClick={() => handleAttestAndClose(task)}
                        disabled={isSubmitting || closedByFhir.has(task.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#24a148] text-white hover:bg-[#0e6027] transition-colors disabled:opacity-50"
                      >
                        <Icon name="CheckCircleIcon" size={13} />
                        {closedByFhir.has(task.id) ? '✓ Closed in FHIR' : isSubmitting ? 'Closing...' : 'Attest & Close Gap'}
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
                        <Icon name="DocumentTextIcon" size={13} />
                        Add Note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
