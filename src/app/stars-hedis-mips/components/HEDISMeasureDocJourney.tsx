'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { workflowDefinitions } from '@/lib/actionRegistry';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HEDISMeasure {
  id: string;
  measureId: string;
  measureName: string;
  domain: string;
  complianceRate: number; // 0-100
  targetRate: number;
  patientsDue: number;
  patientsCompliant: number;
  dueDate: string;
  contractName: string;
  evidenceTypes: string[];
  status: 'open' | 'in-progress' | 'certified' | 'closed';
}

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

// ─── Compliance Bar ───────────────────────────────────────────────────────────
function ComplianceBar({ rate, target }: { rate: number; target: number }) {
  const color = rate >= target ? '#24a148' : rate >= target * 0.8 ? '#b45309' : '#da1e28';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xs text-carbon-gray-50">Compliance Rate</span>
        <span className="font-mono text-xs font-bold" style={{ color }}>
          {rate}%
        </span>
      </div>
      <div className="w-full h-2 bg-carbon-gray-20 relative">
        <div
          className="h-full transition-all"
          style={{ width: `${rate}%`, backgroundColor: color }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-[#0043ce]"
          style={{ left: `${target}%` }}
          title={`Target: ${target}%`}
        />
      </div>
      <p className="text-2xs text-carbon-gray-30 mt-0.5">Target: {target}%</p>
    </div>
  );
}

// ─── Step 1: Assign Measure ───────────────────────────────────────────────────
function AssignMeasurePanel({
  measure,
  onAdvance,
}: {
  measure: HEDISMeasure;
  onAdvance: (notes: string) => void;
}) {
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');
  const [notes, setNotes] = useState('');

  const assignees = [
    'Sarah Johnson (Care Manager)',
    'Dr. James Whitfield (Physician)',
    'Quality Improvement Team',
    'Chronic Disease Management Team',
    'Pharmacy Team',
  ];
  const priorities = [
    'Critical — deadline < 30 days',
    'High — deadline 30-60 days',
    'Medium — deadline 60-90 days',
    'Low — deadline > 90 days',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
          <Icon name="UserPlusIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Assign HEDIS Measure</p>
      </div>
      <div className="bg-[#edf5ff] border border-[#97c1ff] p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-[#0043ce]">
                {measure.measureId}
              </span>
              <span className="text-xs font-semibold text-carbon-gray-100">
                {measure.measureName}
              </span>
            </div>
            <p className="text-xs text-carbon-gray-50">{measure.domain}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xs text-carbon-gray-50">Patients Due</p>
            <p className="font-mono text-base font-bold text-[#da1e28]">{measure.patientsDue}</p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">Due Date</p>
            <p className="font-mono text-xs font-semibold text-[#da1e28]">{measure.dueDate}</p>
          </div>
        </div>
        <ComplianceBar rate={measure.complianceRate} target={measure.targetRate} />
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">
          Assign To <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
        >
          <option value="">Select assignee...</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">
          Priority <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
        >
          <option value="">Select priority...</option>
          {priorities.map((p) => (
            <option key={p} value={p}>
              {p}
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
          placeholder="Context for the assignee — patient cohort details, prior documentation attempts..."
        />
      </div>
      <button
        onClick={() =>
          assignee &&
          priority &&
          onAdvance(`Assigned: ${assignee} | Priority: ${priority}${notes ? ` | ${notes}` : ''}`)
        }
        disabled={!assignee || !priority}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#0043ce] text-white text-xs font-semibold hover:bg-[#002d9c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="ArrowRightIcon" size={14} />
        Assign &amp; Advance to Documentation
      </button>
    </div>
  );
}

// ─── Step 2: Document Evidence ────────────────────────────────────────────────
function DocumentEvidencePanel({
  measure,
  onAdvance,
}: {
  measure: HEDISMeasure;
  onAdvance: (notes: string) => void;
}) {
  const [evidenceType, setEvidenceType] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [providerName, setProviderName] = useState('');
  const [notes, setNotes] = useState('');

  const evidenceOptions = [
    'Lab result — value documented',
    'Encounter note — service rendered',
    'Claims data — CPT code confirmed',
    'Patient attestation — self-reported',
    'Referral completion — specialist note',
    'Pharmacy fill — medication adherence',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
          <Icon name="DocumentTextIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Document Measure Evidence</p>
      </div>
      <p className="text-xs text-carbon-gray-50">
        Upload or attest clinical evidence demonstrating compliance with the HEDIS measure
        specification.
      </p>
      <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3">
        <p className="text-2xs font-semibold text-carbon-gray-70 mb-1.5">Accepted Evidence Types</p>
        <div className="flex flex-wrap gap-1.5">
          {measure.evidenceTypes.map((e) => (
            <span key={e} className="text-2xs bg-[#d0e2ff] text-[#0043ce] px-2 py-0.5 font-medium">
              {e}
            </span>
          ))}
        </div>
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">
          Evidence Type <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={evidenceType}
          onChange={(e) => setEvidenceType(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
        >
          <option value="">Select evidence type...</option>
          {evidenceOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="carbon-label mb-1.5 block">
            Service Date <span className="text-[#da1e28]">*</span>
          </label>
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
          />
        </div>
        <div>
          <label className="carbon-label mb-1.5 block">Rendering Provider</label>
          <input
            type="text"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white"
            placeholder="Provider name or NPI"
          />
        </div>
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">
          Documentation Notes <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] bg-white resize-none"
          placeholder="Describe the clinical evidence — lab values, service details, CPT/LOINC codes, patient response..."
        />
      </div>
      <button
        onClick={() =>
          evidenceType &&
          serviceDate &&
          notes.trim() &&
          onAdvance(
            `Evidence: ${evidenceType} | Date: ${serviceDate}${providerName ? ` | Provider: ${providerName}` : ''} | ${notes}`
          )
        }
        disabled={!evidenceType || !serviceDate || !notes.trim()}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#0043ce] text-white text-xs font-semibold hover:bg-[#002d9c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="ArrowRightIcon" size={14} />
        Submit Evidence &amp; Advance to Certification
      </button>
    </div>
  );
}

// ─── Step 3: Certify & Close ──────────────────────────────────────────────────
function CertifyClosePanel({
  measure,
  onComplete,
}: {
  measure: HEDISMeasure;
  onComplete: (notes: string) => void;
}) {
  const [attestation, setAttestation] = useState(false);
  const [certNotes, setCertNotes] = useState('');

  const certChecklist = [
    'Evidence meets HEDIS technical specification',
    'Service date falls within measurement year',
    'Patient eligibility confirmed for measure',
    'CPT/LOINC/ICD codes verified',
    'Documentation is complete and legible',
  ];
  const [checked, setChecked] = useState<boolean[]>(certChecklist.map(() => false));
  const allChecked = checked.every(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#24a148] flex items-center justify-center flex-shrink-0">
          <Icon name="ShieldCheckIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Physician Certification</p>
      </div>
      <p className="text-xs text-carbon-gray-50">
        Review the submitted evidence and certify that the HEDIS measure is compliant. This step
        requires physician sign-off.
      </p>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-carbon-gray-70">Certification Checklist</p>
        {certChecklist.map((item, i) => (
          <label key={i} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={(e) => {
                const n = [...checked];
                n[i] = e.target.checked;
                setChecked(n);
              }}
              className="w-3.5 h-3.5 accent-[#24a148]"
            />
            <span
              className={`text-xs ${checked[i] ? 'text-[#24a148] line-through' : 'text-carbon-gray-70'}`}
            >
              {item}
            </span>
          </label>
        ))}
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">Certification Notes</label>
        <textarea
          value={certNotes}
          onChange={(e) => setCertNotes(e.target.value)}
          rows={2}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#24a148] bg-white resize-none"
          placeholder="Optional physician notes for the audit record..."
        />
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={attestation}
          onChange={(e) => setAttestation(e.target.checked)}
          className="w-3.5 h-3.5 mt-0.5 accent-[#24a148]"
        />
        <span className="text-xs text-carbon-gray-70">
          I certify that the submitted documentation satisfies the HEDIS measure specification and
          is accurate to the best of my clinical knowledge.
        </span>
      </label>
      <button
        onClick={() =>
          allChecked &&
          attestation &&
          onComplete(
            `Physician certified HEDIS ${measure.measureId}${certNotes ? ` | ${certNotes}` : ''}`
          )
        }
        disabled={!allChecked || !attestation}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#24a148] text-white text-xs font-semibold hover:bg-[#1a7a38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="CheckCircleIcon" size={14} />
        Certify Measure &amp; Close Workflow
      </button>
    </div>
  );
}

// ─── Audit Trail ──────────────────────────────────────────────────────────────
function AuditTrail({
  workflow,
}: {
  workflow: ReturnType<ReturnType<typeof useWorkflowMachine>['getWorkflow']>;
}) {
  if (!workflow || workflow.stepHistory.length === 0) return null;
  return (
    <div className="mt-4 pt-4 border-t border-carbon-gray-20">
      <p className="text-xs font-semibold text-carbon-gray-70 mb-2 flex items-center gap-1.5">
        <Icon name="ClockIcon" size={12} className="text-carbon-gray-50" />
        Audit Trail
      </p>
      <div className="space-y-2">
        {workflow.stepHistory.map((record, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <div className="w-4 h-4 bg-[#24a148] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon name="CheckIcon" size={8} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-carbon-gray-100">{record.label}</p>
              <p className="text-carbon-gray-50 text-2xs">
                {record.completedBy} · {new Date(record.completedAt).toLocaleString()}
              </p>
              {record.notes && <p className="text-carbon-gray-70 mt-0.5 italic">{record.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Journey Panel ───────────────────────────────────────────────────────
interface HEDISMeasureDocJourneyProps {
  measure: HEDISMeasure;
  onClose: () => void;
}

export default function HEDISMeasureDocJourney({ measure, onClose }: HEDISMeasureDocJourneyProps) {
  const { user } = useAppContext();
  const {
    getWorkflow,
    getWorkflowStatus,
    startWorkflow,
    advanceStep,
    completeWorkflow,
    resetWorkflow,
  } = useWorkflowMachine();
  const wfType = 'hedis-measure-doc' as const;
  const workflow = getWorkflow(wfType, measure.id);
  const status = getWorkflowStatus(wfType, measure.id);
  const def = workflowDefinitions[wfType];

  const handleStart = () => startWorkflow(wfType, measure.id, user.name, user.role);
  const handleAdvance = (notes: string) =>
    advanceStep(wfType, measure.id, user.name, user.role, notes);
  const handleComplete = (notes: string) => {
    completeWorkflow(wfType, measure.id, user.name, user.role, notes);

    // ── FHIR DocumentReference POST on final attestation (fire-and-forget) ───
    if (!getFhirMockMode()) {
      getFhirClient()
        .create({
          resourceType: 'DocumentReference',
          status: 'current',
          type: {
            coding: [{ system: 'http://loinc.org', code: '11488-4', display: 'Consult note' }],
            text: 'HEDIS Measure Certification',
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
          date: new Date().toISOString(),
          author: [{ display: user.name }],
          description: `HEDIS ${measure.measureId} — ${measure.measureName} — Physician Certified`,
          content: [
            {
              attachment: {
                contentType: 'text/plain',
                title: `HEDIS ${measure.measureId} Certification — ${measure.contractName}`,
                creation: new Date().toISOString(),
              },
            },
          ],
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/measure-id',
              valueString: measure.measureId,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/measure-name',
              valueString: measure.measureName,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/contract-name',
              valueString: measure.contractName,
            },
          ],
        })
        .then(() =>
          console.info(`[DocumentReference] HEDIS ${measure.measureId} certification posted`)
        )
        .catch((err) => console.warn('[DocumentReference] HEDIS cert POST failed:', err));
    }
  };
  const handleReset = () => resetWorkflow(wfType, measure.id);

  return (
    <div className="bg-white border border-carbon-gray-20 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#edf5ff] border-b border-[#97c1ff]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center">
            <Icon name="DocumentCheckIcon" size={12} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#0043ce] uppercase tracking-wide">
              HEDIS Measure Documentation Workflow
            </p>
            <p className="text-2xs text-carbon-gray-50">
              {measure.measureId} — {measure.measureName}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10 transition-colors"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {status !== 'idle' && workflow && (
          <StepIndicator steps={def.steps} currentStep={workflow.currentStep} status={status} />
        )}

        {status === 'idle' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-[#edf5ff] border border-[#97c1ff] flex items-center justify-center mx-auto mb-3">
              <Icon name="DocumentCheckIcon" size={24} className="text-[#0043ce]" />
            </div>
            <p className="text-sm font-semibold text-carbon-gray-100 mb-1">
              HEDIS Measure Documentation Workflow
            </p>
            <p className="text-xs text-carbon-gray-50 mb-4 max-w-xs mx-auto">
              Document compliance evidence for{' '}
              <span className="font-bold text-[#0043ce]">{measure.measureId}</span>. Current rate:{' '}
              <span className="font-bold">{measure.complianceRate}%</span> vs target{' '}
              {measure.targetRate}%.
            </p>
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0043ce] text-white text-sm font-semibold hover:bg-[#002d9c] transition-colors mx-auto"
            >
              <Icon name="PlayIcon" size={14} />
              Start Documentation Workflow
            </button>
          </div>
        )}

        {status === 'in-progress' && workflow?.currentStep === 1 && (
          <AssignMeasurePanel measure={measure} onAdvance={handleAdvance} />
        )}
        {status === 'in-progress' && workflow?.currentStep === 2 && (
          <DocumentEvidencePanel measure={measure} onAdvance={handleAdvance} />
        )}
        {(status === 'in-progress' || status === 'awaiting-review') &&
          workflow?.currentStep === 3 && (
            <CertifyClosePanel measure={measure} onComplete={handleComplete} />
          )}

        {status === 'completed' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-[#defbe6] border border-[#24a148] flex items-center justify-center mx-auto mb-3">
              <Icon name="CheckCircleIcon" size={24} className="text-[#24a148]" />
            </div>
            <p className="text-sm font-bold text-[#0e6027] mb-1">Measure Certified &amp; Closed</p>
            <p className="text-xs text-carbon-gray-50 mb-3">
              HEDIS measure {measure.measureId} has been certified by a physician and the workflow
              is closed.
            </p>
            <button
              onClick={handleReset}
              className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 underline"
            >
              Reset Workflow
            </button>
          </div>
        )}

        {workflow && <AuditTrail workflow={workflow} />}
      </div>
    </div>
  );
}
