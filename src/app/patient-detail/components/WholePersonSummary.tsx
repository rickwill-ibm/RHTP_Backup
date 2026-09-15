'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { usePatientContext, useGapClosureStore } from '@/lib/patientContext';
import type { CareGap, GapDomain, GapStatus, GapClosureEvidence } from '@/lib/patientContext';

// ─── Domain badge colors ──────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<GapDomain, { bg: string; text: string; border: string }> = {
  Clinical: { bg: '#d0e2ff', text: '#0043ce', border: '#97c1ff' },
  BH: { bg: '#f6f2ff', text: '#6929c4', border: '#d4bbff' },
  Social: { bg: '#d9fbfb', text: '#007d79', border: '#9ef0f0' },
};

const STATUS_COLORS: Record<GapStatus, { bg: string; text: string }> = {
  Open: { bg: '#fff1f1', text: '#da1e28' },
  'In Progress': { bg: '#fdf6dd', text: '#b45309' },
  Closed: { bg: '#defbe6', text: '#0e6027' },
  Waived: { bg: '#f4f4f4', text: '#6f6f6f' },
};

// ─── Domain-Aware Evidence Drawer ─────────────────────────────────────────────
type DrawerStep = 'capture' | 'confirm' | 'chain';

interface ClinicalEvidence {
  procedureCode: string;
  dateOfService: string;
  renderingProvider: string;
  hedisResult: string;
  fhirResourceId: string;
  notes: string;
}

interface BHEvidence {
  assessmentType: string;
  score: string;
  sessionDate: string;
  bhCounselor: string;
  measureLinkage: string;
  followUpPlan: string;
}

interface SocialEvidence {
  programEnrolled: string;
  benefitId: string;
  cboWorker: string;
  enrollmentDate: string;
  sdohDomain: string;
  notes: string;
}

function EvidenceDrawer({
  gap,
  onClose,
  onSubmit,
}: {
  gap: CareGap;
  onClose: () => void;
  onSubmit: (evidence: GapClosureEvidence) => void;
}) {
  const [step, setStep] = useState<DrawerStep>('capture');
  const dc = DOMAIN_COLORS[gap.domain];

  // Clinical fields
  const [clinical, setClinical] = useState<ClinicalEvidence>({
    procedureCode: '',
    dateOfService: '',
    renderingProvider: gap.assignedTo,
    hedisResult: '',
    fhirResourceId: '', // populated from canonical obs ID at submit time
    notes: '',
  });

  // BH fields
  const [bh, setBH] = useState<BHEvidence>({
    assessmentType: 'PHQ-9',
    score: '',
    sessionDate: '',
    bhCounselor: gap.assignedTo,
    measureLinkage: 'FUH/FUM',
    followUpPlan: '',
  });

  // Social fields
  const [social, setSocial] = useState<SocialEvidence>({
    programEnrolled: '',
    benefitId: '',
    cboWorker: gap.assignedTo,
    enrollmentDate: '',
    sdohDomain: gap.name,
    notes: '',
  });

  const [gainShareCalc] = useState(() => {
    const base = Math.floor(Math.random() * 400) + 120;
    return { amount: base, measure: gap.name, contract: 'Medicaid RHTP Track 3' };
  });

  const canProceed = () => {
    if (gap.domain === 'Clinical')
      return clinical.procedureCode.length > 0 && clinical.dateOfService.length > 0;
    if (gap.domain === 'BH') return bh.score.length > 0 && bh.sessionDate.length > 0;
    if (gap.domain === 'Social') return social.programEnrolled.length > 0;
    return true;
  };

  const buildEvidenceSummary = () => {
    if (gap.domain === 'Clinical') {
      return `Procedure: ${clinical.procedureCode} | DOS: ${clinical.dateOfService} | Provider: ${clinical.renderingProvider} | HEDIS: ${clinical.hedisResult || 'Compliant'} | FHIR: ${clinical.fhirResourceId}${clinical.notes ? ' | Notes: ' + clinical.notes : ''}`;
    }
    if (gap.domain === 'BH') {
      return `Assessment: ${bh.assessmentType} | Score: ${bh.score} | Session: ${bh.sessionDate} | Counselor: ${bh.bhCounselor} | Measure: ${bh.measureLinkage}${bh.followUpPlan ? ' | Follow-up: ' + bh.followUpPlan : ''}`;
    }
    return `Program: ${social.programEnrolled} | Benefit ID: ${social.benefitId} | CBO: ${social.cboWorker} | Enrolled: ${social.enrollmentDate} | SDOH Domain: ${social.sdohDomain}`;
  };

  const inputCls =
    'w-full px-3 py-2 text-sm bg-white border border-carbon-gray-30 focus:outline-none focus:border-[#0f62fe]';
  const labelCls = 'block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-carbon-gray-20 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b border-carbon-gray-20"
          style={{ borderTopColor: dc.border, borderTopWidth: 3 }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold px-2 py-0.5 border"
              style={{ background: dc.bg, color: dc.text, borderColor: dc.border }}
            >
              {gap.domain}
            </span>
            <span className="text-sm font-semibold text-carbon-gray-100">{gap.name}</span>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100 p-1">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-5 py-2 bg-[#f4f4f4] border-b border-carbon-gray-20">
          {(['capture', 'confirm', 'chain'] as DrawerStep[]).map((s, i) => {
            const labels = ['Evidence Capture', 'Review & Confirm', 'Confirmation Chain'];
            const active = step === s;
            const done = (step === 'confirm' && i === 0) || (step === 'chain' && i < 2);
            return (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-5 h-5 flex items-center justify-center text-2xs font-bold border ${
                      done
                        ? 'bg-[#24a148] border-[#24a148] text-white'
                        : active
                          ? 'bg-[#0f62fe] border-[#0f62fe] text-white'
                          : 'bg-white border-carbon-gray-30 text-carbon-gray-50'
                    }`}
                  >
                    {done ? <Icon name="CheckIcon" size={10} /> : i + 1}
                  </div>
                  <span
                    className={`text-2xs font-medium ${active ? 'text-[#0f62fe]' : done ? 'text-[#24a148]' : 'text-carbon-gray-50'}`}
                  >
                    {labels[i]}
                  </span>
                </div>
                {i < 2 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${done ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-3 px-5 pt-4 pb-2 text-xs">
          <div>
            <span className="text-carbon-gray-50">Days Open</span>
            <p className="font-semibold text-carbon-gray-100">{gap.daysOpen} days</p>
          </div>
          <div>
            <span className="text-carbon-gray-50">Assigned To</span>
            <p className="font-semibold text-carbon-gray-100">{gap.assignedTo}</p>
          </div>
        </div>

        {/* ── Step 1: Evidence Capture ── */}
        {step === 'capture' && (
          <div className="px-5 pb-5 space-y-3">
            {gap.domain === 'Clinical' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Procedure Code (CPT/HCPCS)</label>
                    <input
                      type="text"
                      value={clinical.procedureCode}
                      onChange={(e) => setClinical({ ...clinical, procedureCode: e.target.value })}
                      placeholder="e.g. 94010"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Date of Service</label>
                    <input
                      type="date"
                      value={clinical.dateOfService}
                      onChange={(e) => setClinical({ ...clinical, dateOfService: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Rendering Provider</label>
                    <input
                      type="text"
                      value={clinical.renderingProvider}
                      onChange={(e) =>
                        setClinical({ ...clinical, renderingProvider: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>HEDIS Measure Result</label>
                    <select
                      value={clinical.hedisResult}
                      onChange={(e) => setClinical({ ...clinical, hedisResult: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">Select result...</option>
                      <option>Compliant</option>
                      <option>Numerator Met</option>
                      <option>Exclusion Applied</option>
                      <option>Exception Documented</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>FHIR Resource ID</label>
                  <input
                    type="text"
                    value={clinical.fhirResourceId}
                    onChange={(e) => setClinical({ ...clinical, fhirResourceId: e.target.value })}
                    className={`${inputCls} font-mono text-xs`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Clinical Notes</label>
                  <textarea
                    value={clinical.notes}
                    onChange={(e) => setClinical({ ...clinical, notes: e.target.value })}
                    rows={3}
                    placeholder="Supporting clinical documentation..."
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </>
            )}

            {gap.domain === 'BH' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Assessment Type</label>
                    <select
                      value={bh.assessmentType}
                      onChange={(e) => setBH({ ...bh, assessmentType: e.target.value })}
                      className={inputCls}
                    >
                      <option>PHQ-9</option>
                      <option>GAD-7</option>
                      <option>AUDIT-C</option>
                      <option>Columbia Suicide Severity</option>
                      <option>ACE Screening</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Score Recorded</label>
                    <input
                      type="number"
                      value={bh.score}
                      onChange={(e) => setBH({ ...bh, score: e.target.value })}
                      placeholder="e.g. 14"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Session Date</label>
                    <input
                      type="date"
                      value={bh.sessionDate}
                      onChange={(e) => setBH({ ...bh, sessionDate: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>BH Counselor</label>
                    <input
                      type="text"
                      value={bh.bhCounselor}
                      onChange={(e) => setBH({ ...bh, bhCounselor: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>FUH/FUM Measure Linkage</label>
                  <select
                    value={bh.measureLinkage}
                    onChange={(e) => setBH({ ...bh, measureLinkage: e.target.value })}
                    className={inputCls}
                  >
                    <option>FUH/FUM</option>
                    <option>AMM (Antidepressant Medication Management)</option>
                    <option>FUH 7-day</option>
                    <option>FUH 30-day</option>
                    <option>Initiation of Alcohol/Drug Treatment</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Follow-up Plan</label>
                  <textarea
                    value={bh.followUpPlan}
                    onChange={(e) => setBH({ ...bh, followUpPlan: e.target.value })}
                    rows={3}
                    placeholder="Document follow-up plan and next steps..."
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </>
            )}

            {gap.domain === 'Social' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Program Enrolled</label>
                    <input
                      type="text"
                      value={social.programEnrolled}
                      onChange={(e) => setSocial({ ...social, programEnrolled: e.target.value })}
                      placeholder="e.g. SNAP, Section 8, NEMT"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Benefit / Case ID</label>
                    <input
                      type="text"
                      value={social.benefitId}
                      onChange={(e) => setSocial({ ...social, benefitId: e.target.value })}
                      placeholder="e.g. SNAP-2026-4821"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>CBO Worker</label>
                    <input
                      type="text"
                      value={social.cboWorker}
                      onChange={(e) => setSocial({ ...social, cboWorker: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Enrollment Date</label>
                    <input
                      type="date"
                      value={social.enrollmentDate}
                      onChange={(e) => setSocial({ ...social, enrollmentDate: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>SDOH Domain Closed</label>
                  <input
                    type="text"
                    value={social.sdohDomain}
                    onChange={(e) => setSocial({ ...social, sdohDomain: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Provenance / Screening Record</label>
                  <textarea
                    value={social.notes}
                    onChange={(e) => setSocial({ ...social, notes: e.target.value })}
                    rows={2}
                    placeholder="Link back to original screening record or referral..."
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('confirm')}
                disabled={!canProceed()}
                className="px-4 py-2 text-sm bg-[#0f62fe] text-white hover:bg-[#0353e9] font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Review & Confirm
                <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review & Confirm ── */}
        {step === 'confirm' && (
          <div className="px-5 pb-5 space-y-4">
            <div className="bg-[#f4f4f4] border border-carbon-gray-20 p-4 space-y-2">
              <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
                Evidence Summary
              </p>
              <p className="text-xs text-carbon-gray-100 leading-relaxed">
                {buildEvidenceSummary()}
              </p>
            </div>

            {/* Gain-share calculation */}
            <div className="bg-[#defbe6] border border-[#24a148] p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="CurrencyDollarIcon" size={14} className="text-[#0e6027]" />
                <p className="text-2xs font-semibold text-[#0e6027] uppercase tracking-wide">
                  Gain-Share Attribution
                </p>
              </div>
              <p className="text-xs text-[#0e6027]">
                Closing <strong>{gainShareCalc.measure}</strong> contributes an estimated{' '}
                <strong>${gainShareCalc.amount}</strong> gain-share credit under{' '}
                <strong>{gainShareCalc.contract}</strong>.
              </p>
            </div>

            {/* FHIR confirmation preview */}
            <div className="bg-[#edf5ff] border border-[#97c1ff] p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="ServerIcon" size={14} className="text-[#0043ce]" />
                <p className="text-2xs font-semibold text-[#0043ce] uppercase tracking-wide">
                  FHIR Resource Update
                </p>
              </div>
              <p className="text-xs text-[#0043ce] font-mono">
                PATCH /Observation/
                {gap.domain === 'Clinical'
                  ? clinical.fhirResourceId
                  : `FHIR-${gap.id.toUpperCase()}`}
              </p>
              <p className="text-2xs text-[#0043ce] mt-0.5">
                status: final · effectiveDateTime: {new Date().toISOString().slice(0, 10)}
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setStep('capture')}
                className="px-4 py-2 text-sm border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 flex items-center gap-1"
              >
                <Icon name="ChevronLeftIcon" size={14} />
                Back
              </button>
              <button
                onClick={() => setStep('chain')}
                className="px-4 py-2 text-sm bg-[#0f62fe] text-white hover:bg-[#0353e9] font-medium flex items-center gap-1.5"
              >
                Close Gap
                <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirmation Chain ── */}
        {step === 'chain' && (
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs text-carbon-gray-70 pt-1">
              Gap closure confirmed. The following systems have been updated:
            </p>

            {[
              {
                icon: 'CheckCircleIcon',
                color: '#24a148',
                bg: '#defbe6',
                border: '#24a148',
                label: 'Gap Closed',
                detail: `${gap.name} marked closed · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
              },
              {
                icon: 'ChartBarIcon',
                color: '#0043ce',
                bg: '#d0e2ff',
                border: '#97c1ff',
                label: 'Quality Measure Updated',
                detail: `HEDIS / Quality measure compliance recorded for ${gap.domain} domain`,
              },
              {
                icon: 'CurrencyDollarIcon',
                color: '#0e6027',
                bg: '#defbe6',
                border: '#24a148',
                label: 'Gain Share Attributed',
                detail: `$${gainShareCalc.amount} credited · Medicaid RHTP Track 3 · Pending EDW sync`,
              },
              {
                icon: 'ServerIcon',
                color: '#6929c4',
                bg: '#f6f2ff',
                border: '#d4bbff',
                label: 'EDW Notified',
                detail: `Enterprise Data Warehouse submission queued · Batch ID: EDW-${Date.now().toString().slice(-6)}`,
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 border"
                style={{ background: item.bg, borderColor: item.border }}
              >
                <Icon
                  name={item.icon as any}
                  size={16}
                  style={{ color: item.color }}
                  className="flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-xs font-semibold" style={{ color: item.color }}>
                    {item.label}
                  </p>
                  <p className="text-2xs mt-0.5" style={{ color: item.color, opacity: 0.85 }}>
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  // Build a rich GapClosureEvidence object so submitClosure can
                  // write structured fields to FHIR (not just a flat string).
                  const fhirEvidence: GapClosureEvidence = {
                    gapId: gap.id,
                    status: 'CLOSED',
                    closedFrom: 'PATIENT_DETAIL',
                    dateOfService:
                      gap.domain === 'Clinical'
                        ? clinical.dateOfService
                        : gap.domain === 'BH'
                          ? bh.sessionDate
                          : social.enrollmentDate,
                    performingProvider:
                      gap.domain === 'Clinical'
                        ? clinical.renderingProvider
                        : gap.domain === 'BH'
                          ? bh.bhCounselor
                          : social.cboWorker,
                    procedureCode: gap.domain === 'Clinical' ? clinical.procedureCode : undefined,
                    resultValue: gap.domain === 'BH' && bh.score ? parseFloat(bh.score) : undefined,
                    resultUnit: gap.domain === 'BH' ? 'score' : undefined,
                  };
                  onSubmit(fhirEvidence);
                }}
                className="px-5 py-2 text-sm bg-[#24a148] text-white hover:bg-[#198038] font-medium flex items-center gap-1.5"
              >
                <Icon name="CheckIcon" size={14} />
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Unified Gap Closure Panel ────────────────────────────────────────────────
function UnifiedGapPanel() {
  const { patient, closeGap } = usePatientContext();
  const { submitClosure } = useGapClosureStore();
  const [drawerGap, setDrawerGap] = useState<CareGap | null>(null);
  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(new Set());
  const [filterDomain, setFilterDomain] = useState<GapDomain | 'All'>('All');

  const openGaps = patient.careGaps.filter((g) => g.status !== 'Closed' && g.status !== 'Waived');
  const filtered =
    filterDomain === 'All' ? openGaps : openGaps.filter((g) => g.domain === filterDomain);

  const clinicalCount = openGaps.filter((g) => g.domain === 'Clinical').length;
  const bhCount = openGaps.filter((g) => g.domain === 'BH').length;
  const socialCount = openGaps.filter((g) => g.domain === 'Social').length;

  const toggleSelect = (id: string) => {
    setSelectedGaps((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const handleBulkClose = () => {
    selectedGaps.forEach((id) => {
      closeGap(id, 'Bulk closed by care manager');
      submitClosure({ gapId: id, status: 'CLOSED', closedFrom: 'PATIENT_DETAIL' });
    });
    setSelectedGaps(new Set());
  };

  return (
    <div className="bg-white border border-carbon-gray-20 mt-4">
      {/* Header */}
      <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-carbon-gray-100">Unified Gap Closure</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff] font-medium">
              Clinical {clinicalCount}
            </span>
            <span className="px-2 py-0.5 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff] font-medium">
              BH {bhCount}
            </span>
            <span className="px-2 py-0.5 bg-[#d9fbfb] text-[#007d79] border border-[#9ef0f0] font-medium">
              Social {socialCount}
            </span>
            <span className="text-carbon-gray-50">= {openGaps.length} total open</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['All', 'Clinical', 'BH', 'Social'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setFilterDomain(d)}
              className={`px-3 py-1 text-xs font-medium border transition-colors ${
                filterDomain === d
                  ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                  : 'border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10'
              }`}
            >
              {d}
            </button>
          ))}
          {selectedGaps.size > 0 && (
            <button
              onClick={handleBulkClose}
              className="px-3 py-1 text-xs font-medium bg-[#24a148] text-white hover:bg-[#198038] ml-2"
            >
              Close {selectedGaps.size} Selected
            </button>
          )}
        </div>
      </div>

      {/* Gap rows */}
      <div className="divide-y divide-carbon-gray-10">
        {filtered.map((gap) => {
          const dc = DOMAIN_COLORS[gap.domain];
          const sc = STATUS_COLORS[gap.status];
          return (
            <div
              key={gap.id}
              className={`flex items-center gap-3 px-5 py-3 hover:bg-carbon-gray-10 transition-colors ${
                selectedGaps.has(gap.id) ? 'bg-[#edf5ff]' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedGaps.has(gap.id)}
                onChange={() => toggleSelect(gap.id)}
                className="w-4 h-4 accent-[#0f62fe]"
              />
              <span
                className="text-2xs font-semibold px-2 py-0.5 border flex-shrink-0 w-16 text-center"
                style={{ background: dc.bg, color: dc.text, borderColor: dc.border }}
              >
                {gap.domain}
              </span>
              <span className="flex-1 text-sm text-carbon-gray-100 font-medium">{gap.name}</span>
              <span
                className="text-2xs font-medium px-2 py-0.5 flex-shrink-0"
                style={{ background: sc.bg, color: sc.text }}
              >
                {gap.status}
              </span>
              <span className="text-xs text-carbon-gray-50 flex-shrink-0 w-20 text-right">
                {gap.daysOpen}d open
              </span>
              <span className="text-xs text-carbon-gray-50 flex-shrink-0 w-32 text-right truncate">
                {gap.assignedTo}
              </span>
              <button
                onClick={() => setDrawerGap(gap)}
                className="flex-shrink-0 px-3 py-1 text-xs font-medium bg-[#0f62fe] text-white hover:bg-[#0353e9] ml-2"
              >
                Close Gap
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-carbon-gray-50">
            No open gaps in this domain.
          </div>
        )}
      </div>

      {drawerGap && (
        <EvidenceDrawer
          gap={drawerGap}
          onClose={() => setDrawerGap(null)}
          onSubmit={(fhirEvidence) => {
            // Update local patient state (UI)
            const evidenceStr =
              [
                fhirEvidence.procedureCode && `CPT: ${fhirEvidence.procedureCode}`,
                fhirEvidence.dateOfService && `DOS: ${fhirEvidence.dateOfService}`,
                fhirEvidence.performingProvider && `By: ${fhirEvidence.performingProvider}`,
              ]
                .filter(Boolean)
                .join(' | ') || 'Closed by care manager';
            closeGap(drawerGap.id, evidenceStr);
            // Write / update the Observation on the FHIR server with full evidence
            submitClosure(fhirEvidence);
            setDrawerGap(null);
          }}
        />
      )}
    </div>
  );
}

// ─── AI Copilot Panel ─────────────────────────────────────────────────────────
function AICopilotPanel() {
  const [talkTrackOpen, setTalkTrackOpen] = useState(false);
  const { patient } = usePatientContext();

  const openGapCount = patient.careGaps.filter((g) => g.status !== 'Closed').length;
  const transportGaps = patient.careGaps.filter(
    (g) => g.domain === 'Social' && g.name.toLowerCase().includes('transport')
  ).length;

  return (
    <div id="ai-copilot-panel" className="bg-[#001d3d] border border-[#003a75] mt-4">
      <div className="px-5 py-3 border-b border-[#003a75] flex items-center gap-2">
        <Icon name="SparklesIcon" size={14} className="text-[#78a9ff]" />
        <span className="text-xs font-bold text-[#78a9ff] uppercase tracking-wider">
          AI Copilot (NEW)
        </span>
      </div>
      <div className="px-5 py-3">
        <p className="text-sm text-[#c6e2ff] leading-relaxed">
          Lead with transport barrier — resolving it unblocks {transportGaps > 0 ? '3' : '2'} of{' '}
          {openGapCount} gaps. PHQ-9 of {patient.phq9Score} warrants BH check-in before clinical
          discussion. Best call time: Tue 10am (80% answer rate).{' '}
          {patient.cohortFlag.includes('Ag worker')
            ? 'Ag worker — avoid scheduling labs May–Jun (planting season).'
            : ''}
        </p>
      </div>
      <div className="px-5 pb-3">
        <button
          onClick={() => setTalkTrackOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#42be65] hover:text-[#6fdc8c] transition-colors"
        >
          <Icon name={talkTrackOpen ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={12} />
          TALK TRACK ›
        </button>
        {talkTrackOpen && (
          <div className="mt-2 border-l-2 border-[#42be65] pl-3">
            <p className="text-sm text-[#a8c8e8] italic leading-relaxed">
              &quot;The AI copilot at the bottom reads all three columns together and tells the care
              manager what to do first. &apos;Lead with transport — it unblocks three gaps.&apos; No
              care manager has to synthesize this themselves. That&apos;s the whole-person
              difference.&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Three-Column Panel ───────────────────────────────────────────────────────
function ThreeColumnPanel() {
  const { patient } = usePatientContext();

  const clinicalRows = [
    {
      label: 'RAF Score',
      value: `${patient.rafScore.toFixed(2)} (+${patient.rafDelta.toFixed(2)} YTD)`,
      highlight: false,
    },
    { label: 'Risk Tier', value: patient.riskTier, highlight: true, color: '#da1e28' },
    {
      label: 'HCC Suspects',
      value: `${patient.hccSuspects} open · $${(patient.hccValue / 1000).toFixed(1)}K value`,
      highlight: false,
    },
    {
      label: 'Open Care Gaps',
      value: `${patient.careGaps.filter((g) => g.status !== 'Closed').length} open · ${patient.careGaps.filter((g) => g.status === 'In Progress').length} in progress`,
      highlight: false,
    },
    {
      label: 'Episode',
      value: `${patient.episodeType} · ${patient.episodeStatus}`,
      highlight: false,
    },
    {
      label: 'PMPM',
      value: `$${patient.pmpm.toLocaleString()} · Target: $${patient.pmpmTarget}`,
      highlight: false,
    },
    { label: 'Last Contact', value: patient.lastContact, highlight: false },
    { label: 'Attribution', value: patient.attributionDetail, highlight: false },
  ];

  const bhRows = [
    {
      label: 'PHQ-9',
      value:
        patient.bhScoreLabel ||
        (patient.phq9Score ? `${patient.phq9Score} — ${patient.bhRisk}` : '—'),
      highlight: true,
      color: '#8a3ffc',
    },
    {
      label: 'PHQ-9 trend',
      value: (patient as any).phq9Trend || patient.bhRisk || '—',
      highlight: true,
      color: '#8a3ffc',
    },
    {
      label: 'AUDIT-C',
      value:
        patient.auditC != null
          ? `${patient.auditC} — ${patient.auditC >= 4 ? 'Moderate risk' : 'Low risk'}`
          : '—',
      highlight: false,
    },
    {
      label: 'Trauma flag',
      value: patient.traumaFlag ? 'Screened positive' : 'Not screened — rec. ACE',
      highlight: patient.traumaFlag,
      color: '#8a3ffc',
    },
    {
      label: 'BH referral',
      value: [patient.bhReferralStatus, patient.bhReferralDate].filter(Boolean).join(' · ') || '—',
      highlight: !!patient.bhReferralStatus,
      color: '#8a3ffc',
    },
    { label: 'BH provider', value: patient.bhProvider || '—', highlight: false },
    {
      label: 'PAM score',
      value: patient.pamScore ? `${patient.pamScore} — ${patient.pamLabel}` : '—',
      highlight: true,
      color: '#8a3ffc',
    },
    { label: 'Patient goal', value: patient.patientGoal || '—', highlight: false },
  ];

  const socialRows = [
    {
      label: 'Transport',
      value:
        [patient.transportStatus, patient.transportReferralId].filter(Boolean).join(' · ') || '—',
      highlight: !!patient.transportStatus,
      color: '#007d79',
    },
    {
      label: 'Referral status',
      value: patient.referralStatus
        ? `${patient.referralStatus}${patient.referralDaysOpen ? ` · ${patient.referralDaysOpen} days open` : ''}`
        : 'Active · 0 days open',
      highlight: true,
      color: '#007d79',
    },
    { label: 'Food security', value: patient.foodSecurity || '—', highlight: false },
    { label: 'Housing', value: patient.housingStatus || '—', highlight: false },
    {
      label: 'Language',
      value:
        [patient.language, patient.literacy ? `Literacy: ${patient.literacy}` : '']
          .filter(Boolean)
          .join(' · ') || '—',
      highlight: false,
    },
    {
      label: 'Cohort',
      value: patient.cohortFlag || '—',
      highlight: !!patient.cohortFlag,
      color: '#007d79',
    },
    { label: 'Rural distance', value: patient.ruralDistance || '—', highlight: false },
    { label: 'Disparity flag', value: patient.disparityFlag || '—', highlight: false },
  ];

  const renderColumn = (
    title: string,
    titleColor: string,
    rows: { label: string; value: string; highlight: boolean; color?: string }[]
  ) => (
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-bold mb-2" style={{ color: titleColor }}>
        {title}
      </h3>
      <div className="border border-carbon-gray-20 divide-y divide-carbon-gray-10">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 px-3 py-2 ${row.highlight ? 'bg-carbon-gray-90' : 'bg-white'}`}
          >
            <span
              className={`text-xs w-32 flex-shrink-0 ${row.highlight ? 'text-carbon-gray-30' : 'text-carbon-gray-50'}`}
            >
              {row.label}
            </span>
            <span
              className={`text-xs font-medium flex-1 ${row.highlight ? 'font-semibold' : 'text-carbon-gray-100'}`}
              style={row.highlight && row.color ? { color: row.color } : undefined}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex gap-4 flex-wrap lg:flex-nowrap">
      {renderColumn('Clinical', '#0f62fe', clinicalRows)}
      {renderColumn('Behavioral health  (NEW)', '#8a3ffc', bhRows)}
      {renderColumn('Social & equity  (NEW)', '#007d79', socialRows)}
    </div>
  );
}

// ─── Pathway Progress Strip ───────────────────────────────────────────────────
function PathwayStrip() {
  const { patient } = usePatientContext();
  return (
    <div className="bg-white border border-carbon-gray-20 px-5 py-3 mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="ArrowPathIcon" size={14} className="text-[#007d79]" />
        <span className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
          Whole-Person Pathway Progress
        </span>
      </div>
      <div className="flex items-center gap-0 overflow-x-auto">
        {patient.pathwaySteps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center min-w-[120px] px-2">
              <div
                className={`w-7 h-7 flex items-center justify-center border-2 ${
                  step.completed
                    ? 'bg-[#24a148] border-[#24a148] text-white'
                    : 'bg-white border-carbon-gray-30 text-carbon-gray-50'
                }`}
              >
                {step.completed ? (
                  <Icon name="CheckIcon" size={14} />
                ) : (
                  <span className="text-xs">{idx + 1}</span>
                )}
              </div>
              <span className="text-2xs text-carbon-gray-70 text-center mt-1 leading-tight">
                {step.label}
              </span>
              {step.metric && (
                <span
                  className={`text-2xs font-semibold mt-0.5 ${step.completed ? 'text-[#24a148]' : 'text-carbon-gray-50'}`}
                >
                  {step.metric}
                </span>
              )}
            </div>
            {idx < patient.pathwaySteps.length - 1 && (
              <div
                className={`h-0.5 flex-1 min-w-[20px] ${
                  step.completed ? 'bg-[#24a148]' : 'bg-carbon-gray-20'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── Whole Person Summary (main export) ──────────────────────────────────────
export default function WholePersonSummary({ patientId: _patientId }: { patientId?: string } = {}) {
  const { patient } = usePatientContext();

  return (
    <div className="space-y-0">
      {/* Whole Person Record Header */}
      <div className="bg-[#001141] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">{patient.name} — Whole Person Record</h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-[#a8c8e8] flex-wrap">
            <span className="font-mono">{patient.mrn}</span>
            <span>·</span>
            <span>
              {patient.age}y {patient.gender}
            </span>
            <span>·</span>
            <span>{patient.pcp}</span>
            <span>·</span>
            <span>{patient.attribution}</span>
            <span>·</span>
            <span>{patient.organization}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="#ai-copilot-panel"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8a3ffc] text-white text-xs font-semibold hover:bg-[#6929c4] transition-colors"
          >
            <Icon name="SparklesIcon" size={13} />
            AI Copilot ↓
          </a>
          <span className="text-xs text-[#a8c8e8]">Care Manager</span>
          <div className="w-9 h-9 bg-[#007d79] flex items-center justify-center">
            <span className="text-white text-sm font-bold">{patient.careManagerInitials}</span>
          </div>
        </div>
      </div>

      {/* Three-column panel */}
      <div className="bg-white border border-carbon-gray-20 border-t-0 p-4">
        <ThreeColumnPanel />
        <PathwayStrip />
        <UnifiedGapPanel />
        <div className="text-xs text-carbon-gray-50 mt-3">
          <button
            onClick={() => {
              const panel = document.getElementById('ai-copilot-panel');
              if (panel) {
                panel.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="text-[#007d79] hover:underline"
          >
            Jump to AI Copilot ↓
          </button>
        </div>
        <AICopilotPanel />
      </div>
    </div>
  );
}
