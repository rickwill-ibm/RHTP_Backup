'use client';
import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { workflowDefinitions } from '@/lib/actionRegistry';
import { useGapClosureStore, usePatientContext } from '@/lib/patientContext';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import type { CareGap } from '@/lib/mockData';

// ─── Step Indicator ───────────────────────────────────────────────────────────
interface StepIndicatorProps {
  steps: { step: number; label: string; description: string; requiredRole: string }[];
  currentStep: number;
  status: string;
}

function StepIndicator({ steps, currentStep, status }: StepIndicatorProps) {
  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-1">
      {steps.map((s, idx) => {
        const isCompleted =
          status === 'completed' || (status !== 'rejected' && s.step < currentStep);
        const isActive = s.step === currentStep && status !== 'completed' && status !== 'rejected';
        const isRejected = status === 'rejected' && s.step === currentStep;

        return (
          <div key={s.step} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 transition-all
                ${
                  isCompleted
                    ? 'bg-[#24a148] border-[#24a148] text-white'
                    : isActive
                      ? 'bg-[#0043ce] border-[#0043ce] text-white'
                      : isRejected
                        ? 'bg-[#da1e28] border-[#da1e28] text-white'
                        : 'bg-white border-carbon-gray-30 text-carbon-gray-50'
                }`}
              >
                {isCompleted ? (
                  <Icon name="CheckIcon" size={12} />
                ) : isRejected ? (
                  <Icon name="XMarkIcon" size={12} />
                ) : (
                  s.step
                )}
              </div>
              <div className="mt-1.5 text-center px-1">
                <p
                  className={`text-2xs font-semibold leading-tight ${isActive ? 'text-[#0043ce]' : isCompleted ? 'text-[#24a148]' : isRejected ? 'text-[#da1e28]' : 'text-carbon-gray-50'}`}
                >
                  {s.label}
                </p>
                <p className="text-2xs text-carbon-gray-30 mt-0.5 hidden sm:block leading-tight">
                  {s.requiredRole === 'care_manager' ? 'Care Mgr' : 'Physician'}
                </p>
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mt-3.5 mx-1 transition-all ${isCompleted ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Gap Summary Card ─────────────────────────────────────────────────────────
function GapSummaryCard({ gap }: { gap: CareGap }) {
  const programColors: Record<string, string> = {
    HEDIS: 'bg-[#d0e2ff] text-[#0043ce]',
    STARS: 'bg-[#fdf6dd] text-[#b45309]',
    MIPS: 'bg-[#f6f2ff] text-[#6929c4]',
  };
  return (
    <div className="bg-[#f0f4ff] border border-[#97c1ff] p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-2xs font-semibold px-2 py-0.5 ${programColors[gap.program] ?? 'bg-carbon-gray-10 text-carbon-gray-70'}`}
            >
              {gap.program}
            </span>
            <span className="font-mono text-xs font-bold text-carbon-gray-70">{gap.measureId}</span>
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100">{gap.measureName}</p>
          <p className="text-xs text-carbon-gray-50 mt-0.5">{gap.closureRequirement}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xs text-carbon-gray-50">Days Open</p>
          <p
            className={`font-mono text-base font-bold ${gap.daysOpen > 120 ? 'text-[#da1e28]' : gap.daysOpen > 60 ? 'text-[#b45309]' : 'text-carbon-gray-70'}`}
          >
            {gap.daysOpen}d
          </p>
          <p className="text-2xs text-carbon-gray-50 mt-0.5">Due Date</p>
          <p className="font-mono text-xs font-semibold text-carbon-gray-70">{gap.dueDate}</p>
        </div>
      </div>
      {gap.notes && (
        <div className="flex items-start gap-2 mt-2 pt-2 border-t border-[#97c1ff]/50">
          <Icon
            name="ChatBubbleLeftEllipsisIcon"
            size={12}
            className="text-[#0043ce] mt-0.5 flex-shrink-0"
          />
          <p className="text-xs text-carbon-gray-70 italic">{gap.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Before / After Animated Graphic ─────────────────────────────────────────
interface BeforeAfterGraphicProps {
  resultValue: number;
  hedisCompliance: 'MET' | 'NOT_MET';
  dateOfService: string;
  performingProvider: string;
}

function BeforeAfterGraphic({
  resultValue,
  hedisCompliance,
  dateOfService,
  performingProvider,
}: BeforeAfterGraphicProps) {
  const [animating, setAnimating] = useState(false);
  const [showAfter, setShowAfter] = useState(false);

  useEffect(() => {
    // Trigger animation sequence on mount
    const t1 = setTimeout(() => setAnimating(true), 200);
    const t2 = setTimeout(() => setShowAfter(true), 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const beforeData = {
    openGaps: 9,
    clinicalOpen: 3,
    hedisStatus: 'NOT MET',
    gainshare: '$0',
    qualityScore: 61,
    hbA1cStatus: 'OPEN · 38 days',
    hbA1cResult: '—',
  };

  const afterData = {
    openGaps: 8,
    clinicalOpen: 2,
    hedisStatus: hedisCompliance === 'MET' ? 'MET ✓' : 'NOT MET',
    gainshare: '$8,100',
    qualityScore: 68,
    hbA1cStatus: 'CLOSED ✓',
    hbA1cResult: `${resultValue}%`,
  };

  return (
    <div className="border border-[#24a148] bg-[#defbe6]/10 overflow-hidden">
      <div className="px-4 py-2.5 bg-[#defbe6] border-b border-[#a7f0ba] flex items-center gap-2">
        <Icon name="ChartBarIcon" size={14} className="text-[#0e6027]" />
        <p className="text-sm font-semibold text-[#0e6027]">Gap Closure Impact — Before / After</p>
        <span className="ml-auto text-2xs text-[#0e6027] font-mono">HbA1c CDC · HEDIS</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-[#a7f0ba]">
        {/* BEFORE */}
        <div
          className={`p-4 transition-all duration-700 ${showAfter ? 'opacity-60' : 'opacity-100'}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#da1e28]" />
            <p className="text-xs font-bold text-[#da1e28] uppercase tracking-wide">Before</p>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Open Gaps', value: String(beforeData.openGaps), color: 'text-[#da1e28]' },
              {
                label: 'Clinical Open',
                value: String(beforeData.clinicalOpen),
                color: 'text-[#da1e28]',
              },
              { label: 'HEDIS CDC', value: beforeData.hedisStatus, color: 'text-[#da1e28]' },
              { label: 'Gainshare', value: beforeData.gainshare, color: 'text-carbon-gray-50' },
              {
                label: 'Quality Score',
                value: `${beforeData.qualityScore}/100`,
                color: 'text-carbon-gray-70',
              },
              { label: 'HbA1c Status', value: beforeData.hbA1cStatus, color: 'text-[#da1e28]' },
              { label: 'A1C Result', value: beforeData.hbA1cResult, color: 'text-carbon-gray-50' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <span className="text-2xs text-carbon-gray-50">{row.label}</span>
                <span className={`text-2xs font-semibold font-mono ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AFTER */}
        <div
          className={`p-4 transition-all duration-700 ${showAfter ? 'opacity-100 bg-[#defbe6]/20' : 'opacity-0'}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#24a148]" />
            <p className="text-xs font-bold text-[#24a148] uppercase tracking-wide">After</p>
          </div>
          <div className="space-y-2">
            {[
              {
                label: 'Open Gaps',
                value: String(afterData.openGaps),
                color: 'text-[#24a148]',
                delta: '↓1',
              },
              {
                label: 'Clinical Open',
                value: String(afterData.clinicalOpen),
                color: 'text-[#24a148]',
                delta: '↓1',
              },
              {
                label: 'HEDIS CDC',
                value: afterData.hedisStatus,
                color: hedisCompliance === 'MET' ? 'text-[#24a148]' : 'text-[#da1e28]',
                delta: '',
              },
              {
                label: 'Gainshare',
                value: afterData.gainshare,
                color: 'text-[#24a148]',
                delta: '↑',
              },
              {
                label: 'Quality Score',
                value: `${afterData.qualityScore}/100`,
                color: 'text-[#24a148]',
                delta: '↑7',
              },
              {
                label: 'HbA1c Status',
                value: afterData.hbA1cStatus,
                color: 'text-[#24a148]',
                delta: '',
              },
              {
                label: 'A1C Result',
                value: afterData.hbA1cResult,
                color: 'text-[#0043ce]',
                delta: '',
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <span className="text-2xs text-carbon-gray-50">{row.label}</span>
                <div className="flex items-center gap-1">
                  {row.delta && (
                    <span className="text-2xs font-bold text-[#24a148]">{row.delta}</span>
                  )}
                  <span className={`text-2xs font-semibold font-mono ${row.color}`}>
                    {row.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Evidence summary strip */}
      <div
        className={`px-4 py-3 bg-[#defbe6] border-t border-[#a7f0ba] transition-all duration-500 ${showAfter ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xs text-[#0e6027]">Date of Service</p>
            <p className="text-xs font-semibold font-mono text-[#0e6027]">{dateOfService || '—'}</p>
          </div>
          <div>
            <p className="text-2xs text-[#0e6027]">Procedure</p>
            <p className="text-xs font-semibold font-mono text-[#0e6027]">83036 · LOINC 4548-4</p>
          </div>
          <div>
            <p className="text-2xs text-[#0e6027]">Provider</p>
            <p className="text-xs font-semibold text-[#0e6027] truncate">
              {performingProvider || 'Bennett County Health PCP'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Assign Coordinator ───────────────────────────────────────────────
interface AssignCoordinatorPanelProps {
  gap: CareGap;
  onAssign: (coordinator: string, notes: string) => void;
}

function AssignCoordinatorPanel({ gap, onAssign }: AssignCoordinatorPanelProps) {
  const [coordinator, setCoordinator] = useState(gap.assignedTo ?? '');
  const [notes, setNotes] = useState('');

  const coordinators = [
    'Sarah Johnson (Care Manager)',
    'Dr. James Whitfield (Physician)',
    'Pharmacy Team',
    'Ophthalmology Referral Coordinator',
    'Social Work Team',
    'Chronic Disease Management Team',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
          <Icon name="UserPlusIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Assign Care Coordinator</p>
      </div>
      <p className="text-xs text-carbon-gray-50">
        Assign this care gap to a coordinator responsible for patient outreach and closure
        documentation.
      </p>

      <div>
        <label className="carbon-label mb-1.5 block">
          Assign To <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={coordinator}
          onChange={(e) => setCoordinator(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
        >
          <option value="">Select coordinator...</option>
          {coordinators.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Assignment Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white resize-none"
          placeholder="Context for the coordinator — patient barriers, prior attempts, preferred contact method..."
        />
      </div>

      <button
        onClick={() => coordinator && onAssign(coordinator, notes)}
        disabled={!coordinator}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#0043ce] text-white text-xs font-semibold hover:bg-[#002d9c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="UserPlusIcon" size={14} />
        Assign Coordinator &amp; Advance
      </button>
    </div>
  );
}

// ─── Step 2: Initiate Outreach ────────────────────────────────────────────────
interface InitiateOutreachPanelProps {
  gap: CareGap;
  onOutreach: (method: string, notes: string) => void;
}

function InitiateOutreachPanel({ gap, onOutreach }: InitiateOutreachPanelProps) {
  const [method, setMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');

  const outreachMethods = [
    'Phone call — patient contacted',
    'Phone call — left voicemail',
    'Secure patient portal message sent',
    'Letter mailed to patient address',
    'In-person discussion at encounter',
    'Care manager home visit',
    'Referral order placed in Cerner',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
          <Icon name="PhoneIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Initiate Patient Outreach</p>
      </div>
      <p className="text-xs text-carbon-gray-50">
        Document outreach attempt to schedule the required service for gap closure.
      </p>

      <div>
        <label className="carbon-label mb-1.5 block">
          Outreach Method <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
        >
          <option value="">Select method...</option>
          {outreachMethods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Service Scheduled Date (if applicable)</label>
        <input
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
        />
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">
          Outreach Notes <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white resize-none"
          placeholder="Document outreach outcome — patient response, barriers identified, next steps, scheduled appointment details..."
        />
      </div>

      <button
        onClick={() =>
          method &&
          notes.trim() &&
          onOutreach(
            method,
            `${method}${scheduledDate ? ` | Scheduled: ${scheduledDate}` : ''} | ${notes}`
          )
        }
        disabled={!method || !notes.trim()}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#0043ce] text-white text-xs font-semibold hover:bg-[#002d9c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="PhoneArrowUpRightIcon" size={14} />
        Document Outreach &amp; Advance
      </button>
    </div>
  );
}

// ─── Evidence Source Row ──────────────────────────────────────────────────────
function EvidenceSourceRow({ source, index }: { source: string; index: number }) {
  const sourceTypes: Record<string, string> = {
    Lab: 'DocumentChartBarIcon',
    Encounter: 'ComputerDesktopIcon',
    Claim: 'DocumentTextIcon',
    Referral: 'ArrowTopRightOnSquareIcon',
    Order: 'ClipboardDocumentListIcon',
  };
  const sourceType =
    source.toLowerCase().includes('lab') || source.toLowerCase().includes('result')
      ? 'Lab'
      : source.toLowerCase().includes('encounter') || source.toLowerCase().includes('visit')
        ? 'Encounter'
        : source.toLowerCase().includes('claim')
          ? 'Claim'
          : source.toLowerCase().includes('referral')
            ? 'Referral'
            : 'Order';

  return (
    <div className="flex items-start gap-3 p-3 bg-carbon-gray-10 border border-carbon-gray-20 hover:bg-white transition-colors">
      <div className="w-6 h-6 flex items-center justify-center bg-[#d0e2ff] flex-shrink-0 mt-0.5">
        <Icon
          name={(sourceTypes[sourceType] ?? 'DocumentTextIcon') as any}
          size={12}
          className="text-[#0043ce]"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-carbon-gray-100">{source}</p>
        <span className="text-2xs font-mono text-carbon-gray-50 bg-carbon-gray-20 px-1.5 py-0.5 mt-1 inline-block">
          {sourceType}
        </span>
      </div>
      <Icon name="CheckCircleIcon" size={14} className="text-[#24a148] flex-shrink-0 mt-0.5" />
    </div>
  );
}

// ─── HbA1c Enhanced Closure Panel ────────────────────────────────────────────
interface HbA1cClosurePanelProps {
  gap: CareGap;
  onClose: (
    attestation: string,
    evidenceSources: string[],
    notes: string,
    hbA1cData: {
      dateOfService: string;
      performingProvider: string;
      placeOfService: string;
      resultValue: number;
    }
  ) => void;
  onDefer: (reason: string) => void;
}

function HbA1cClosurePanel({ gap, onClose, onDefer }: HbA1cClosurePanelProps) {
  const [mode, setMode] = useState<'close' | 'defer' | null>(null);
  const [attestation] = useState('Lab result received — meets measure threshold');
  const [closureNotes, setClosureNotes] = useState('');
  const [deferReason, setDeferReason] = useState('');
  const [dateOfService, setDateOfService] = useState('');
  const [performingProvider, setPerformingProvider] = useState('Bennett County Health PCP');
  const [placeOfService, setPlaceOfService] = useState('Lab');
  const [resultValue, setResultValue] = useState('');
  const [evidenceSources, setEvidenceSources] = useState<string[]>([]);
  const [newEvidence, setNewEvidence] = useState('');

  const hedisCompliance = resultValue ? (parseFloat(resultValue) < 8.0 ? 'MET' : 'NOT_MET') : null;

  const isHbA1cGap =
    gap.measureId?.includes('CDC') ||
    gap.measureName?.toLowerCase().includes('hba1c') ||
    gap.measureName?.toLowerCase().includes('a1c');

  const deferReasons = [
    'Patient declined — documented refusal on file',
    'Medically contraindicated — physician documented',
    'Patient unreachable — exhausted outreach attempts',
    'Service not available in measurement year — defer to next cycle',
    'Excluded — patient meets exclusion criteria',
    'Awaiting specialist availability — rescheduled',
  ];

  const addEvidence = () => {
    if (newEvidence.trim()) {
      setEvidenceSources((prev) => [...prev, newEvidence.trim()]);
      setNewEvidence('');
    }
  };

  const canSubmit = isHbA1cGap
    ? dateOfService && performingProvider && placeOfService && resultValue && closureNotes.trim()
    : attestation && closureNotes.trim();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#24a148] flex items-center justify-center flex-shrink-0">
          <Icon name="ClipboardDocumentCheckIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Document Gap Closure</p>
      </div>

      {/* Closure requirement reminder */}
      <div className="flex items-start gap-2 p-3 bg-[#defbe6]/40 border border-[#24a148]/30">
        <Icon
          name="InformationCircleIcon"
          size={14}
          className="text-[#24a148] flex-shrink-0 mt-0.5"
        />
        <div>
          <p className="text-2xs font-semibold text-[#0e6027] mb-0.5">Closure Requirement</p>
          <p className="text-xs text-carbon-gray-70">{gap.closureRequirement}</p>
        </div>
      </div>

      {mode === null && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('close')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#24a148] text-white text-sm font-semibold hover:bg-[#1a7a38] transition-colors"
          >
            <Icon name="CheckCircleIcon" size={16} />
            Close Gap
          </button>
          <button
            onClick={() => setMode('defer')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#b45309] text-[#b45309] text-sm font-semibold hover:bg-[#fdf6dd] transition-colors"
          >
            <Icon name="ClockIcon" size={16} />
            Defer with Reason
          </button>
        </div>
      )}

      {/* Close flow */}
      {mode === 'close' && (
        <div className="space-y-4 border border-[#24a148] bg-[#defbe6]/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="CheckCircleIcon" size={16} className="text-[#24a148]" />
            <p className="text-sm font-semibold text-[#0e6027]">Document Gap Closure</p>
          </div>

          {/* HbA1c-specific fields */}
          {isHbA1cGap && (
            <div className="space-y-3 p-3 bg-[#f0f4ff] border border-[#97c1ff]">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="BeakerIcon" size={13} className="text-[#0043ce]" />
                <p className="text-xs font-semibold text-[#0043ce]">
                  HbA1c Lab Evidence — HEDIS CDC Required Fields
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="carbon-label mb-1 block">
                    Date of Service <span className="text-[#da1e28]">*</span>
                  </label>
                  <input
                    type="date"
                    value={dateOfService}
                    onChange={(e) => setDateOfService(e.target.value)}
                    className="w-full border border-carbon-gray-30 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
                  />
                </div>
                <div>
                  <label className="carbon-label mb-1 block">
                    Place of Service <span className="text-[#da1e28]">*</span>
                  </label>
                  <select
                    value={placeOfService}
                    onChange={(e) => setPlaceOfService(e.target.value)}
                    className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
                  >
                    <option value="Lab">Lab</option>
                    <option value="Office">Office</option>
                    <option value="Home">Home</option>
                    <option value="Telehealth">Telehealth</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="carbon-label mb-1 block">
                  Performing Provider <span className="text-[#da1e28]">*</span>
                </label>
                <input
                  type="text"
                  value={performingProvider}
                  onChange={(e) => setPerformingProvider(e.target.value)}
                  className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
                  placeholder="Provider name and NPI..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="carbon-label mb-1 block">Procedure Code</label>
                  <input
                    type="text"
                    value="83036 (HbA1c) · LOINC 4548-4"
                    readOnly
                    className="w-full border border-carbon-gray-20 px-3 py-2 text-xs font-mono text-carbon-gray-50 bg-carbon-gray-10 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="carbon-label mb-1 block">
                    Result Value (%) <span className="text-[#da1e28]">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="3"
                      max="20"
                      value={resultValue}
                      onChange={(e) => setResultValue(e.target.value)}
                      className="flex-1 border border-carbon-gray-30 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
                      placeholder="e.g. 6.8"
                    />
                    <span className="text-xs font-semibold text-carbon-gray-70 px-2">%</span>
                  </div>
                </div>
              </div>

              {/* HEDIS auto-calc */}
              {resultValue && (
                <div
                  className={`flex items-center gap-3 p-3 border ${hedisCompliance === 'MET' ? 'bg-[#defbe6] border-[#a7f0ba]' : 'bg-[#fff1f1] border-[#ffb3b8]'}`}
                >
                  <Icon
                    name={hedisCompliance === 'MET' ? 'CheckBadgeIcon' : 'ExclamationCircleIcon'}
                    size={16}
                    className={hedisCompliance === 'MET' ? 'text-[#24a148]' : 'text-[#da1e28]'}
                  />
                  <div>
                    <p
                      className={`text-xs font-bold ${hedisCompliance === 'MET' ? 'text-[#0e6027]' : 'text-[#da1e28]'}`}
                    >
                      HEDIS CDC — {hedisCompliance === 'MET' ? 'COMPLIANT (MET)' : 'NOT MET'}
                    </p>
                    <p className="text-2xs text-carbon-gray-50">
                      {hedisCompliance === 'MET'
                        ? `HbA1c ${resultValue}% < 8.0% threshold — measure satisfied`
                        : `HbA1c ${resultValue}% ≥ 8.0% threshold — poor control, gap not met`}
                    </p>
                  </div>
                  {hedisCompliance === 'MET' && (
                    <div className="ml-auto text-right">
                      <p className="text-xs font-bold text-[#24a148]">$8,100</p>
                      <p className="text-2xs text-[#0e6027]">Gainshare</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Evidence sources */}
          <div>
            <label className="carbon-label mb-1.5 block">Supporting Evidence Sources</label>
            <div className="space-y-2 mb-2">
              {evidenceSources.map((src, i) => (
                <EvidenceSourceRow key={`ev-${i}`} source={src} index={i} />
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newEvidence}
                onChange={(e) => setNewEvidence(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addEvidence()}
                className="flex-1 border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#24a148] bg-white"
                placeholder="e.g. HbA1c lab result 6.8% — Quest Diagnostics 06/10/2026"
              />
              <button
                onClick={addEvidence}
                disabled={!newEvidence.trim()}
                className="px-3 py-2 bg-carbon-gray-10 border border-carbon-gray-20 text-xs text-carbon-gray-70 hover:bg-white hover:text-carbon-gray-100 transition-colors disabled:opacity-40"
              >
                <Icon name="PlusIcon" size={14} />
              </button>
            </div>
          </div>

          <div>
            <label className="carbon-label mb-1.5 block">
              Clinical Documentation Notes <span className="text-[#da1e28]">*</span>
            </label>
            <textarea
              value={closureNotes}
              onChange={(e) => setClosureNotes(e.target.value)}
              rows={3}
              className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#24a148] bg-white resize-none"
              placeholder="Document the clinical basis for closure — service performed, result values, provider attestation, date of service..."
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!canSubmit) return;
                onClose(attestation, evidenceSources, closureNotes, {
                  dateOfService,
                  performingProvider,
                  placeOfService,
                  resultValue: parseFloat(resultValue),
                });
              }}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-4 py-2 bg-[#24a148] text-white text-xs font-semibold hover:bg-[#1a7a38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="CheckIcon" size={14} />
              Submit Gap Closure
            </button>
            <button
              onClick={() => setMode(null)}
              className="px-4 py-2 text-xs text-carbon-gray-70 hover:text-carbon-gray-100 border border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Defer flow */}
      {mode === 'defer' && (
        <div className="space-y-4 border border-[#b45309] bg-[#fdf6dd]/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="ClockIcon" size={16} className="text-[#b45309]" />
            <p className="text-sm font-semibold text-[#b45309]">Defer Gap Closure</p>
          </div>

          <div>
            <label className="carbon-label mb-1.5 block">
              Deferral Reason <span className="text-[#da1e28]">*</span>
            </label>
            <select
              value={deferReason}
              onChange={(e) => setDeferReason(e.target.value)}
              className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
            >
              <option value="">Select reason...</option>
              {deferReasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => deferReason && onDefer(deferReason)}
              disabled={!deferReason}
              className="flex items-center gap-2 px-4 py-2 bg-[#b45309] text-white text-xs font-semibold hover:bg-[#8a3e06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="ClockIcon" size={14} />
              Submit Deferral
            </button>
            <button
              onClick={() => setMode(null)}
              className="px-4 py-2 text-xs text-carbon-gray-70 hover:text-carbon-gray-100 border border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Completed State ──────────────────────────────────────────────────────────
function ClosureCompletedPanel({
  gap,
  stepHistory,
}: {
  gap: CareGap;
  stepHistory: { label: string; completedBy: string; completedAt: string; notes?: string }[];
}) {
  const { getGapClosure } = useGapClosureStore();
  const closure = getGapClosure(gap.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-[#defbe6] border border-[#24a148]">
        <div className="w-8 h-8 bg-[#24a148] flex items-center justify-center flex-shrink-0">
          <Icon name="CheckCircleIcon" size={18} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#0e6027]">Care Gap Closed</p>
          <p className="text-xs text-[#0e6027]/80">
            {gap.measureName} has been successfully closed and documented.
          </p>
        </div>
      </div>

      {/* Before/After graphic on completion */}
      {closure?.resultValue !== undefined && (
        <BeforeAfterGraphic
          resultValue={closure.resultValue}
          hedisCompliance={closure.hedisCompliance === 'MET' ? 'MET' : 'NOT_MET'}
          dateOfService={closure.dateOfService ?? ''}
          performingProvider={closure.performingProvider ?? 'Bennett County Health PCP'}
        />
      )}

      {/* Quality measure update */}
      {closure && (
        <div className="border border-[#0043ce] bg-[#f0f4ff] p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="ChartBarIcon" size={14} className="text-[#0043ce]" />
            <p className="text-xs font-semibold text-[#0043ce]">HEDIS Quality Measure Updated</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Measure', value: 'HbA1c Control (CDC)' },
              {
                label: 'Compliance',
                value: closure.hedisCompliance === 'MET' ? 'MET ✓' : 'NOT MET',
              },
              { label: 'Result', value: `${closure.resultValue}%` },
              { label: 'Gainshare', value: '$8,100 Attributed' },
              { label: 'Track', value: 'Medicaid RHTP Track 3' },
              { label: 'Procedure', value: '83036 · LOINC 4548-4' },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-2xs text-carbon-gray-50">{item.label}</p>
                <p
                  className={`text-xs font-semibold ${item.label === 'Compliance' && closure.hedisCompliance === 'MET' ? 'text-[#24a148]' : 'text-carbon-gray-100'}`}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="carbon-label mb-2">Closure Audit Trail</p>
        <div className="space-y-2">
          {stepHistory.map((record, i) => (
            <div
              key={`closed-step-${i}`}
              className="flex items-start gap-3 p-3 bg-carbon-gray-10 border border-carbon-gray-20"
            >
              <div className="w-5 h-5 bg-[#24a148] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon name="CheckIcon" size={9} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-carbon-gray-100">{record.label}</p>
                  <span className="text-2xs font-mono text-carbon-gray-50 whitespace-nowrap">
                    {new Date(record.completedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-2xs text-carbon-gray-50 mt-0.5">by {record.completedBy}</p>
                {record.notes && (
                  <p className="text-xs text-carbon-gray-70 mt-1 italic">{record.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Rejected / Deferred State ────────────────────────────────────────────────
function DeferredPanel({
  gap,
  reason,
  onReset,
}: {
  gap: CareGap;
  reason?: string;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-[#fdf6dd] border border-[#f1c21b]">
        <div className="w-8 h-8 bg-[#b45309] flex items-center justify-center flex-shrink-0">
          <Icon name="ClockIcon" size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#b45309]">Gap Deferred</p>
          {reason && <p className="text-xs text-carbon-gray-70 mt-0.5">{reason}</p>}
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#0043ce] border border-[#0043ce] hover:bg-[#d0e2ff] transition-colors"
        >
          <Icon name="ArrowPathIcon" size={12} />
          Restart
        </button>
      </div>
    </div>
  );
}

// ─── Main Journey Component ───────────────────────────────────────────────────
interface CareGapClosureJourneyProps {
  gap: CareGap;
  onClose: () => void;
}

export default function CareGapClosureJourney({ gap, onClose }: CareGapClosureJourneyProps) {
  const { user } = useAppContext();
  const { patient } = usePatientContext();
  const { submitClosure, startClosing } = useGapClosureStore();
  // Track the FHIR Task ID created in Step 1 so Step 2 can update it to in-progress
  const [assignedTaskId, setAssignedTaskId] = useState<string | null>(null);
  const {
    getWorkflow,
    getWorkflowStatus,
    getWorkflowProgress,
    startWorkflow,
    advanceStep,
    completeWorkflow,
    rejectWorkflow,
    resetWorkflow,
  } = useWorkflowMachine();

  const wfDef = workflowDefinitions['care-gap-closure'];
  const wf = getWorkflow('care-gap-closure', gap.id);
  const status = getWorkflowStatus('care-gap-closure', gap.id);
  const { current, total } = getWorkflowProgress('care-gap-closure', gap.id);

  const currentStep = wf?.currentStep ?? 1;
  const userName = user?.name ?? 'Care Manager';
  const userRole = user?.role ?? 'care_manager';

  const isHbA1cGap =
    gap.measureId?.includes('CDC') ||
    gap.measureName?.toLowerCase().includes('hba1c') ||
    gap.measureName?.toLowerCase().includes('a1c');

  // Canonical FHIR Observation ID for this gap — matches migrate-patients.mjs pattern
  const patientFhirId = PLATFORM_TO_FHIR_ID_MAP[patient.patientId] ?? patient.patientId;
  const canonicalObsId = `patient-${patientFhirId}-gap-${gap.id}`;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = () => {
    startWorkflow('care-gap-closure', gap.id, userName, userRole);
    if (isHbA1cGap) startClosing(gap.id);
  };

  const handleAssign = (coordinator: string, notes: string) => {
    if (!wf) return;
    advanceStep(
      'care-gap-closure',
      gap.id,
      userName,
      userRole,
      `Assigned to: ${coordinator}${notes ? ` | ${notes}` : ''}`
    );

    // ── FHIR Task POST → requested (fire-and-forget) ─────────────────────────
    if (!getFhirMockMode()) {
      const taskId = `task-journey-${patientFhirId}-${gap.id}-${Date.now()}`;
      getFhirClient()
        .create({
          resourceType: 'Task',
          id: taskId,
          status: 'requested',
          intent: 'order',
          code: {
            coding: [{ system: 'http://loinc.org', code: '18776-5', display: 'Plan of care note' }],
            text: 'Care Gap Assignment',
          },
          description: `Care gap assignment: ${gap.measureName}`,
          for: { reference: `Patient/${patientFhirId}` },
          authoredOn: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          requester: { display: userName },
          owner: { display: coordinator },
          note: notes ? [{ text: notes }] : undefined,
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/tcoc-gap-id',
              valueString: gap.id,
            },
          ],
        })
        .then((res: unknown) => {
          const createdId = (res as { id?: string })?.id ?? taskId;
          setAssignedTaskId(createdId);
          console.info(`[Task] Journey task ${createdId} created for gap ${gap.id}`);
        })
        .catch((err) => console.warn('[Task] Journey assign POST failed:', err));
    }
  };

  const handleOutreach = (method: string, notes: string) => {
    if (!wf) return;
    advanceStep('care-gap-closure', gap.id, userName, userRole, notes);

    // ── FHIR Communication POST (fire-and-forget) ─────────────────────────────
    if (!getFhirMockMode()) {
      getFhirClient()
        .create({
          resourceType: 'Communication',
          status: 'in-progress',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/communication-category',
                  code: 'notification',
                  display: 'Notification',
                },
              ],
            },
          ],
          subject: { reference: `Patient/${patientFhirId}` },
          recipient: [{ reference: `Patient/${patientFhirId}` }],
          sender: { display: userName },
          sent: new Date().toISOString(),
          payload: [{ contentString: `${method}${notes ? ' — ' + notes : ''}` }],
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/tcoc-gap-id',
              valueString: gap.id,
            },
          ],
        })
        .then(() => console.info(`[Communication] Outreach record posted for gap ${gap.id}`))
        .catch((err) => console.warn('[Communication] Journey outreach POST failed:', err));

      // ── FHIR Task PUT → in-progress (if we have the Task ID from Step 1) ──
      if (assignedTaskId) {
        getFhirClient()
          .update({
            resourceType: 'Task',
            id: assignedTaskId,
            status: 'in-progress',
            intent: 'order',
            for: { reference: `Patient/${patientFhirId}` },
            lastModified: new Date().toISOString(),
            note: [{ text: `Outreach initiated: ${method}` }],
          })
          .then(() => console.info(`[Task] ${assignedTaskId} → in-progress`))
          .catch((err) => console.warn('[Task] Journey outreach Task PUT failed:', err));
      }
    }
  };

  const handleClosure = (
    attestation: string,
    evidenceSources: string[],
    notes: string,
    hbA1cData?: {
      dateOfService: string;
      performingProvider: string;
      placeOfService: string;
      resultValue: number;
    }
  ) => {
    if (!wf) return;
    const evidenceStr =
      evidenceSources.length > 0 ? ` | Evidence: ${evidenceSources.join('; ')}` : '';
    completeWorkflow(
      'care-gap-closure',
      gap.id,
      userName,
      userRole,
      `${attestation}${evidenceStr} | ${notes}`
    );

    // Write to FHIR gap closure store — use actual gap.id and canonical Observation ID
    // so submitClosure issues PUT against the pre-migrated Observation on HAPI FHIR.
    if (hbA1cData) {
      submitClosure({
        gapId: gap.id,
        status: 'CLOSED',
        closedFrom: 'PATIENT_DETAIL',
        dateOfService: hbA1cData.dateOfService,
        performingProvider: hbA1cData.performingProvider,
        placeOfService: hbA1cData.placeOfService,
        procedureCode: '83036',
        resultValue: hbA1cData.resultValue,
        resultUnit: '%',
        gainshare: 8100,
        fhirObservationId: canonicalObsId,
      });
    } else {
      // Non-HbA1c gap — still write the closure with canonical ID
      submitClosure({
        gapId: gap.id,
        status: 'CLOSED',
        closedFrom: 'PATIENT_DETAIL',
        fhirObservationId: canonicalObsId,
      });
    }
  };

  const handleDefer = (reason: string) => {
    if (!wf) return;
    rejectWorkflow('care-gap-closure', gap.id, userName, userRole, reason);
  };

  const handleReset = () => {
    resetWorkflow('care-gap-closure', gap.id);
  };

  // ── Status badge config ────────────────────────────────────────────────────
  const statusCfg = {
    idle: {
      cls: 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20',
      label: 'Not Started',
    },
    'in-progress': {
      cls: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
      label: `Step ${current}/${total}`,
    },
    'awaiting-review': {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Awaiting Review',
    },
    completed: { cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]', label: 'Closed' },
    rejected: { cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]', label: 'Deferred' },
  } as const;
  const sc = statusCfg[status] ?? statusCfg['idle'];

  return (
    <div className="border border-[#0043ce] bg-white shadow-sm">
      {/* Journey Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#f0f4ff] border-b border-[#97c1ff]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
            <Icon name="ClipboardDocumentCheckIcon" size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">Care Gap Closure Journey</p>
            <p className="text-2xs text-carbon-gray-50 font-mono">
              {gap.measureId} — {gap.measureName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xs font-semibold px-2.5 py-1 border ${sc.cls}`}>{sc.label}</span>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-20 transition-colors"
            title="Close journey panel"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Step Indicator */}
      {status !== 'idle' && (
        <div className="px-4 py-3 border-b border-carbon-gray-20 bg-white">
          <StepIndicator steps={wfDef.steps} currentStep={currentStep} status={status} />
        </div>
      )}

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Gap summary always visible */}
        <GapSummaryCard gap={gap} />

        {/* State-driven content */}
        {status === 'idle' && (
          <div className="space-y-3">
            <p className="text-xs text-carbon-gray-50">
              This care gap has not been assigned to a closure workflow. Start the journey to assign
              a coordinator, document outreach, and close the gap with evidence.
            </p>
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#0043ce] text-white text-xs font-semibold hover:bg-[#002d9c] transition-colors"
            >
              <Icon name="PlayIcon" size={14} />
              Start Closure Journey
            </button>
          </div>
        )}

        {status === 'in-progress' && currentStep === 1 && (
          <AssignCoordinatorPanel gap={gap} onAssign={handleAssign} />
        )}

        {status === 'in-progress' && currentStep === 2 && (
          <InitiateOutreachPanel gap={gap} onOutreach={handleOutreach} />
        )}

        {(status === 'in-progress' || status === 'awaiting-review') && currentStep === 3 && (
          <HbA1cClosurePanel gap={gap} onClose={handleClosure} onDefer={handleDefer} />
        )}

        {status === 'completed' && (
          <ClosureCompletedPanel gap={gap} stepHistory={wf?.stepHistory ?? []} />
        )}

        {status === 'rejected' && (
          <DeferredPanel
            gap={gap}
            reason={wf?.stepHistory[wf.stepHistory.length - 1]?.notes}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}
