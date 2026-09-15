'use client';
import React, { useState } from 'react';
import { mockPatients, mockContracts } from '@/lib/mockData';
import StatusBadge from '@/components/ui/StatusBadge';
import Icon from '@/components/ui/AppIcon';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import AttributionDisputeJourney, { type AttributionRecord } from './AttributionDisputeJourney';

// ─── Mock attribution discrepancy records ─────────────────────────────────────
const attributionDiscrepancies: AttributionRecord[] = [
  {
    id: 'attr-disp-001',
    patientName: 'Margaret L. Chen',
    payer: 'BlueCross BlueShield ACO',
    attributedPCP: 'Dr. Robert Nguyen',
    attributionMethod: 'Plurality Rule — Claims-Based',
    attributionDate: '2026-01-01',
    discrepancyType: 'Wrong PCP attributed — patient primarily sees different provider',
    discrepancyDetail:
      'Patient has 6 E&M visits with Dr. James Whitfield vs. 2 with Dr. Nguyen in prior 12 months',
    contractImpact: '-$4,200 PMPM adjustment',
    rafImpact: '−0.34 RAF',
  },
  {
    id: 'attr-disp-002',
    patientName: 'Margaret L. Chen',
    payer: 'Aetna Medicare Advantage',
    attributedPCP: 'Dr. Sarah Kim',
    attributionMethod: 'Prospective Attribution — Enrollment-Based',
    attributionDate: '2025-10-15',
    discrepancyType: 'Patient disenrolled — still showing as attributed',
    discrepancyDetail:
      'Patient disenrolled from Aetna MA plan on 2025-12-31 but remains on 2026 attribution roster',
    contractImpact: 'Inflated attributed lives count',
    rafImpact: '−0.18 RAF',
  },
];

// ─── Dispute Workflow Chip ─────────────────────────────────────────────────────
function DisputeWorkflowChip({ disputeId }: { disputeId: string }) {
  const { getWorkflowStatus, getWorkflow } = useWorkflowMachine();
  const status = getWorkflowStatus('attribution-dispute', disputeId);
  const wf = getWorkflow('attribution-dispute', disputeId);

  if (status === 'idle') return null;

  const cfg = {
    'in-progress': {
      cls: 'bg-[#e8daff] text-[#6929c4] border-[#d4bbff]',
      label: `Step ${wf?.currentStep ?? 1}/3`,
    },
    'awaiting-review': {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Awaiting Submission',
    },
    completed: { cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]', label: 'Submitted' },
    rejected: { cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]', label: 'Withdrawn' },
    idle: { cls: '', label: '' },
  } as const;

  const c = cfg[status];
  return <span className={`text-2xs font-semibold px-2 py-0.5 border ${c.cls}`}>{c.label}</span>;
}

export default function AttributionTab() {
  const patient = mockPatients.find((p) => p.id === 'patient-001')!;
  const contract = mockContracts.find((c) => c.id === 'contract-001')!;
  const [openDisputeId, setOpenDisputeId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Attribution status */}
      <section>
        <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2 mb-3">
          <Icon name="LinkIcon" size={16} className="text-carbon-gray-70" />
          Attribution Status
        </h3>
        <div className="border border-carbon-gray-20 bg-carbon-gray-10 p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                key: 'attr-status',
                label: 'Attribution Status',
                value: patient.attributionStatus,
                type: 'badge' as const,
                variant: 'success' as const,
              },
              {
                key: 'attr-enroll',
                label: 'Enrollment Date',
                value: patient.enrollmentDate,
                type: 'text' as const,
              },
              {
                key: 'attr-pcp',
                label: 'Attributed PCP',
                value: patient.primaryCareProvider,
                type: 'text' as const,
              },
              { key: 'attr-payer', label: 'Payer', value: patient.payer, type: 'text' as const },
            ].map((f) => (
              <div key={f.key}>
                <p className="carbon-label">{f.label}</p>
                {f.type === 'badge' ? (
                  <StatusBadge label={f.value} variant={f.variant!} />
                ) : (
                  <p className="text-sm font-medium text-carbon-gray-100 mt-1">{f.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Attribution Discrepancies */}
      <section>
        <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2 mb-3">
          <Icon name="ExclamationTriangleIcon" size={16} className="text-[#da1e28]" />
          Attribution Discrepancies
          <span className="text-2xs font-semibold px-2 py-0.5 bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]">
            {attributionDiscrepancies.length} Flagged
          </span>
        </h3>
        <div className="space-y-3">
          {attributionDiscrepancies.map((rec) => (
            <div key={rec.id}>
              <div className="border border-carbon-gray-20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-2xs font-semibold px-2 py-0.5 bg-[#e8daff] text-[#6929c4]">
                        {rec.payer}
                      </span>
                      <span className="font-mono text-2xs text-carbon-gray-50">{rec.id}</span>
                      <DisputeWorkflowChip disputeId={rec.id} />
                    </div>
                    <p className="text-xs font-semibold text-carbon-gray-100">
                      {rec.discrepancyType}
                    </p>
                    <p className="text-2xs text-carbon-gray-50 mt-0.5">{rec.discrepancyDetail}</p>
                    <div className="flex items-center gap-4 mt-2 text-2xs text-carbon-gray-50">
                      <span>
                        Current PCP:{' '}
                        <span className="text-carbon-gray-70 font-medium">{rec.attributedPCP}</span>
                      </span>
                      <span>
                        Method: <span className="text-carbon-gray-70">{rec.attributionMethod}</span>
                      </span>
                      <span className="text-[#da1e28] font-semibold">{rec.rafImpact}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenDisputeId(openDisputeId === rec.id ? null : rec.id)}
                    className="flex-shrink-0 text-xs font-medium px-3 py-1.5 border transition-colors flex items-center gap-1.5"
                    style={
                      openDisputeId === rec.id
                        ? { background: '#6929c4', borderColor: '#6929c4', color: 'white' }
                        : { background: 'white', borderColor: '#d4bbff', color: '#6929c4' }
                    }
                  >
                    <Icon name="ScaleIcon" size={13} />
                    {openDisputeId === rec.id ? 'Close Journey' : 'Dispute Attribution'}
                  </button>
                </div>
              </div>
              {openDisputeId === rec.id && (
                <AttributionDisputeJourney
                  disputeId={rec.id}
                  record={rec}
                  onClose={() => setOpenDisputeId(null)}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* VBC Contract context */}
      <section>
        <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2 mb-3">
          <Icon name="DocumentTextIcon" size={16} className="text-carbon-gray-70" />
          VBC Contract Context
        </h3>
        <div className="border border-carbon-gray-20 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-carbon-gray-100">{contract.name}</p>
              <p className="text-xs text-carbon-gray-50">
                {contract.payer} · {contract.contractPeriod}
              </p>
            </div>
            <StatusBadge
              label={contract.performanceStatus}
              variant={
                contract.performanceStatus === 'On Track'
                  ? 'success'
                  : contract.performanceStatus === 'At Risk'
                    ? 'warning'
                    : 'danger'
              }
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {[
              {
                key: 'ctx-lives',
                label: 'Attributed Lives',
                value: contract.attributedLives.toLocaleString(),
              },
              { key: 'ctx-pmpm', label: 'Contract PMPM Target', value: `$${contract.pmpmTarget}` },
              {
                key: 'ctx-gap',
                label: 'Gap Closure Target',
                value: `${(contract.gapClosureTarget * 100).toFixed(0)}%`,
              },
              { key: 'ctx-stars', label: 'STARS Rating', value: contract.starsRating.toString() },
            ].map((f) => (
              <div key={f.key}>
                <p className="carbon-label">{f.label}</p>
                <p className="font-mono text-sm font-semibold text-carbon-gray-100 mt-1">
                  {f.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Patient cost vs targets */}
      <section>
        <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2 mb-3">
          <Icon name="ChartBarIcon" size={16} className="text-carbon-gray-70" />
          Patient Performance vs Contract Targets
        </h3>
        <div className="space-y-3">
          {[
            {
              key: 'perf-pmpm',
              label: 'PMPM Cost',
              actual: patient.pmpmCost,
              target: patient.pmpmTarget,
              unit: '$',
              higher: 'bad',
            },
            {
              key: 'perf-raf',
              label: 'RAF Score vs Cohort Avg',
              actual: patient.rafScore,
              target: 1.8,
              unit: '',
              higher: 'neutral',
            },
            {
              key: 'perf-er',
              label: 'ER Risk Score',
              actual: Math.round(patient.predictedErRisk * 100),
              target: 30,
              unit: '%',
              higher: 'bad',
            },
          ].map((row) => {
            const over = row.actual > row.target;
            const pct = Math.min((row.actual / row.target) * 100, 200);
            return (
              <div key={row.key} className="flex items-center gap-4">
                <span className="text-xs text-carbon-gray-70 w-48 flex-shrink-0">{row.label}</span>
                <div className="flex-1 h-4 bg-carbon-gray-20 relative overflow-hidden">
                  <div
                    className={`h-full transition-all ${row.higher === 'bad' && over ? 'bg-[#da1e28]' : row.higher === 'bad' && !over ? 'bg-[#24a148]' : 'bg-[#0f62fe]'}`}
                    style={{ width: `${Math.min(pct / 2, 100)}%` }}
                  />
                  <div className="absolute top-0 left-1/2 w-px h-full bg-carbon-gray-50" />
                </div>
                <div className="w-32 text-right flex-shrink-0">
                  <span
                    className={`font-mono text-sm tabular-nums font-semibold ${row.higher === 'bad' && over ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                  >
                    {row.unit}
                    {typeof row.actual === 'number' && row.unit === '$'
                      ? row.actual.toLocaleString()
                      : row.actual}
                  </span>
                  <span className="text-2xs text-carbon-gray-50 ml-1">
                    / {row.unit}
                    {row.target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
