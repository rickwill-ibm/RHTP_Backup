'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useAppContext } from '@/lib/appContext';
import { mockPatients } from '@/lib/mockData';
import { exportPanelCSV, generatePDFReport } from '@/lib/exportUtils';

// ─── Bulk Action Modal ────────────────────────────────────────────────────────

interface BulkActionModalProps {
  mode: 'task' | 'care-gap' | 'outreach' | 'export';
  count: number;
  onClose: () => void;
  onConfirm: (data: BulkFormData) => void;
}

interface BulkFormData {
  type: string;
  assignedTo: string;
  priority: string;
  dueDate: string;
  notes: string;
}

const CARE_TEAM = [
  'Sarah Johnson',
  'Dr. James Whitfield',
  'Maria Chen',
  'Robert Kim',
  'Pharmacy Team',
  'Social Work Team',
];
const TASK_TYPES = [
  'HCC Review',
  'Care Gap Closure',
  'Outreach Call',
  'Medication Review',
  'AWV Scheduling',
  'Utilization Review',
  'Care Plan Update',
];
const CARE_GAP_TYPES = [
  'HbA1c Poor Control',
  'Annual Wellness Visit',
  'Eye Exam for Diabetics',
  'Colorectal Cancer Screening',
  'Medication Adherence',
  'Blood Pressure Control',
];
const OUTREACH_TYPES = [
  'Phone Call',
  'Care Gap Outreach',
  'AWV Reminder',
  'Medication Adherence Follow-up',
  'Post-Discharge Follow-up',
  'Social Determinants Screening',
];

function BulkActionModal({ mode, count, onClose, onConfirm }: BulkActionModalProps) {
  const [form, setForm] = useState<BulkFormData>({
    type:
      mode === 'care-gap'
        ? CARE_GAP_TYPES[0]
        : mode === 'outreach'
          ? OUTREACH_TYPES[0]
          : TASK_TYPES[0],
    assignedTo: CARE_TEAM[0],
    priority: 'High',
    dueDate: '',
    notes: '',
  });

  const title =
    mode === 'task' ? 'Assign Task' : mode === 'care-gap' ? 'Assign Care Gap' : 'Flag for Outreach';
  const typeOptions =
    mode === 'care-gap' ? CARE_GAP_TYPES : mode === 'outreach' ? OUTREACH_TYPES : TASK_TYPES;
  const accentColor = mode === 'outreach' ? '#da1e28' : mode === 'care-gap' ? '#0043ce' : '#0f62fe';
  const iconName =
    mode === 'task'
      ? 'ClipboardDocumentListIcon'
      : mode === 'care-gap'
        ? 'ClipboardDocumentCheckIcon'
        : 'FlagIcon';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-carbon-gray-20 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-carbon-gray-20"
          style={{ borderTopColor: accentColor, borderTopWidth: 3 }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 flex items-center justify-center"
              style={{ backgroundColor: accentColor }}
            >
              <Icon name={iconName as any} size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-carbon-gray-100">{title}</p>
              <p className="text-2xs text-carbon-gray-50">
                Bulk action — {count} patient{count !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
              {mode === 'care-gap'
                ? 'Care Gap Measure'
                : mode === 'outreach'
                  ? 'Outreach Type'
                  : 'Task Type'}
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                Assign To
              </label>
              <select
                value={form.assignedTo}
                onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
              >
                {CARE_TEAM.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
              >
                {['Critical', 'High', 'Medium', 'Low'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
            />
          </div>

          <div>
            <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
              Notes (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Additional context for all selected patients..."
              className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-carbon-gray-20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-carbon-gray-70 border border-carbon-gray-20 hover:bg-carbon-gray-10"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-white font-medium"
              style={{ backgroundColor: accentColor }}
            >
              Apply to {count} Patient{count !== 1 ? 's' : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Panel Action Bar ─────────────────────────────────────────────────────────

interface PanelActionBarProps {
  selectedPatients: Set<string>;
  onClearSelection: () => void;
}

export default function PanelActionBar({
  selectedPatients,
  onClearSelection,
}: PanelActionBarProps) {
  const { user } = useAppContext();
  const [modal, setModal] = useState<'task' | 'care-gap' | 'outreach' | null>(null);
  const count = selectedPatients.size;

  const handleConfirm = (data: BulkFormData) => {
    const modeLabel =
      modal === 'task' ? 'Tasks' : modal === 'care-gap' ? 'Care gaps' : 'Outreach flags';
    toast.success(`${modeLabel} assigned`, {
      description: `${data.type} → ${data.assignedTo} (${data.priority}) for ${count} patient${count !== 1 ? 's' : ''}`,
    });
    setModal(null);
    onClearSelection();
  };

  const handlePanelReport = () => {
    const patients = mockPatients;
    const criticalCount = patients.filter((p) => p.riskTier === 'Critical').length;
    const highCount = patients.filter((p) => p.riskTier === 'High').length;
    const avgRaf = (patients.reduce((s, p) => s + p.rafScore, 0) / patients.length).toFixed(2);
    const totalHCC = patients.reduce((s, p) => s + p.openHCCSuspects, 0);
    const totalGaps = patients.reduce((s, p) => s + p.openCareGaps, 0);
    const avgPmpm = Math.round(patients.reduce((s, p) => s + p.pmpmCost, 0) / patients.length);

    generatePDFReport({
      reportTitle: 'Panel Cohort Report — Medicare MSSP Track 3',
      subtitle: `${patients.length} attributed patients`,
      generatedBy: user.name,
      sections: [
        {
          title: 'Panel Summary',
          rows: [
            { label: 'Total Attributed Patients', value: String(patients.length) },
            { label: 'Critical Risk Patients', value: String(criticalCount) },
            { label: 'High Risk Patients', value: String(highCount) },
            { label: 'Average RAF Score', value: avgRaf },
            { label: 'Total Open HCC Suspects', value: String(totalHCC) },
            { label: 'Total Open Care Gaps', value: String(totalGaps) },
            { label: 'Average PMPM Cost', value: `$${avgPmpm.toLocaleString()}` },
            { label: 'Contract', value: 'Medicare MSSP Track 3' },
            {
              label: 'Report Date',
              value: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            },
          ],
        },
        {
          title: 'Risk Tier Distribution',
          rows: [
            {
              label: 'Critical',
              value: `${criticalCount} patients (${Math.round((criticalCount / patients.length) * 100)}%)`,
            },
            {
              label: 'High',
              value: `${highCount} patients (${Math.round((highCount / patients.length) * 100)}%)`,
            },
            {
              label: 'Moderate',
              value: `${patients.filter((p) => p.riskTier === 'Moderate').length} patients`,
            },
            {
              label: 'Low',
              value: `${patients.filter((p) => p.riskTier === 'Low').length} patients`,
            },
          ],
        },
        {
          title: 'Attribution Status',
          rows: [
            {
              label: 'Confirmed',
              value: String(patients.filter((p) => p.attributionStatus === 'Confirmed').length),
            },
            {
              label: 'Provisional',
              value: String(patients.filter((p) => p.attributionStatus === 'Provisional').length),
            },
            {
              label: 'Disputed',
              value: String(patients.filter((p) => p.attributionStatus === 'Disputed').length),
            },
            {
              label: 'Dropped',
              value: String(patients.filter((p) => p.attributionStatus === 'Dropped').length),
            },
          ],
        },
      ],
      tableHeaders: [
        'Patient Name',
        'Risk Tier',
        'RAF Score',
        'HCC Suspects',
        'Care Gaps',
        'PMPM Cost',
        'Attribution',
      ],
      tableRows: patients.map((p) => [
        p.name,
        p.riskTier,
        p.rafScore.toFixed(2),
        String(p.openHCCSuspects),
        String(p.openCareGaps),
        `$${p.pmpmCost.toLocaleString()}`,
        p.attributionStatus,
      ]),
    });
    toast.success('Panel report opened', {
      description: "Use your browser's Print dialog to save as PDF",
    });
  };

  const handleExportCSV = () => {
    exportPanelCSV(mockPatients);
    toast.success('CSV downloaded', { description: `${mockPatients.length} patients exported` });
  };

  return (
    <>
      {modal && (
        <BulkActionModal
          mode={modal}
          count={count}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}

      <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 flex-wrap mb-4">
        <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-2">
          Panel Actions
        </span>

        {/* Always-available panel actions */}
        <button
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
          onClick={handlePanelReport}
        >
          <Icon name="DocumentChartBarIcon" size={13} />
          Panel Report
        </button>
        <button
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
          onClick={handleExportCSV}
        >
          <Icon name="ArrowDownTrayIcon" size={13} />
          Export CSV
        </button>

        {/* Bulk actions — enabled when patients are selected */}
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-carbon-gray-20">
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium border transition-colors ${count > 0 ? 'bg-[#0f62fe] text-white border-[#0f62fe] hover:bg-[#0353e9]' : 'bg-carbon-gray-10 text-carbon-gray-30 border-carbon-gray-20 cursor-not-allowed'}`}
            disabled={count === 0}
            onClick={() => count > 0 && setModal('task')}
            title={
              count === 0
                ? 'Select patients first'
                : `Assign task to ${count} patient${count !== 1 ? 's' : ''}`
            }
          >
            <Icon name="ClipboardDocumentListIcon" size={13} />
            Assign Task{count > 0 ? ` (${count})` : ''}
          </button>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium border transition-colors ${count > 0 ? 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff] hover:bg-[#0043ce] hover:text-white' : 'bg-carbon-gray-10 text-carbon-gray-30 border-carbon-gray-20 cursor-not-allowed'}`}
            disabled={count === 0}
            onClick={() => count > 0 && setModal('care-gap')}
            title={
              count === 0
                ? 'Select patients first'
                : `Assign care gap to ${count} patient${count !== 1 ? 's' : ''}`
            }
          >
            <Icon name="ClipboardDocumentCheckIcon" size={13} />
            Assign Care Gap{count > 0 ? ` (${count})` : ''}
          </button>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium border transition-colors ${count > 0 ? 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28] hover:bg-[#da1e28] hover:text-white' : 'bg-carbon-gray-10 text-carbon-gray-30 border-carbon-gray-20 cursor-not-allowed'}`}
            disabled={count === 0}
            onClick={() => count > 0 && setModal('outreach')}
            title={
              count === 0
                ? 'Select patients first'
                : `Flag ${count} patient${count !== 1 ? 's' : ''} for outreach`
            }
          >
            <Icon name="FlagIcon" size={13} />
            Flag Outreach{count > 0 ? ` (${count})` : ''}
          </button>
          {count > 0 && (
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-carbon-gray-50 hover:text-carbon-gray-100 transition-colors"
              onClick={onClearSelection}
            >
              <Icon name="XMarkIcon" size={12} />
              Clear
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-2xs text-carbon-gray-50">Role:</span>
          <span
            className={`text-2xs font-semibold px-1.5 py-0.5 ${user.role === 'physician' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
          >
            {user.role === 'physician' ? 'Physician' : 'Care Manager'}
          </span>
        </div>
      </div>
    </>
  );
}
