import React from 'react';
import { mockCostEnvelopes } from '@/lib/mockData';
import Icon from '@/components/ui/AppIcon';
import FreshnessIndicator from '@/components/ui/FreshnessIndicator';

export default function FinancialTab() {
  const envelope = mockCostEnvelopes.find((e) => e.patientId === 'patient-001')!;
  const categories = [
    {
      key: 'cat-inpatient',
      label: 'Inpatient',
      value: envelope.inpatient,
      icon: 'BuildingOffice2Icon',
      color: 'bg-[#da1e28]',
    },
    {
      key: 'cat-er',
      label: 'Emergency Room',
      value: envelope.er,
      icon: 'ExclamationTriangleIcon',
      color: 'bg-[#f1c21b]',
    },
    {
      key: 'cat-specialty',
      label: 'Specialty Care',
      value: envelope.specialty,
      icon: 'UserIcon',
      color: 'bg-[#0f62fe]',
    },
    {
      key: 'cat-pharmacy',
      label: 'Pharmacy',
      value: envelope.pharmacy,
      icon: 'BeakerIcon',
      color: 'bg-[#6929c4]',
    },
    {
      key: 'cat-postacute',
      label: 'Post-Acute',
      value: envelope.postAcute,
      icon: 'HomeIcon',
      color: 'bg-[#b45309]',
    },
    {
      key: 'cat-pc',
      label: 'Primary Care',
      value: envelope.primaryCare,
      icon: 'HeartIcon',
      color: 'bg-[#24a148]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* PMPM summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            key: 'fin-pmpm',
            label: 'PMPM Actual',
            value: `$${envelope.pmpm.toLocaleString()}`,
            color: 'text-[#da1e28]',
            sub: `Target: $${envelope.pmpmTarget}`,
          },
          {
            key: 'fin-total',
            label: 'YTD Total Cost',
            value: `$${envelope.total.toLocaleString()}`,
            color: 'text-[#da1e28]',
            sub: `Target: $${envelope.targetTotal.toLocaleString()}`,
          },
          {
            key: 'fin-var',
            label: 'Cost Variance',
            value: `+$${(envelope.total - envelope.targetTotal).toLocaleString()}`,
            color: 'text-[#da1e28]',
            sub: 'Above contract target',
          },
          {
            key: 'fin-ratio',
            label: 'Cost/Target Ratio',
            value: `${((envelope.total / envelope.targetTotal) * 100).toFixed(0)}%`,
            color: 'text-[#da1e28]',
            sub: 'Of contract PMPM target',
          },
        ].map((m) => (
          <div key={m.key} className="bg-carbon-gray-10 border border-carbon-gray-20 px-4 py-3">
            <p className="carbon-label">{m.label}</p>
            <p className={`text-2xl font-bold tabular-nums font-mono mt-1 ${m.color}`}>{m.value}</p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Cost envelope breakdown */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2">
            <Icon name="ChartBarIcon" size={16} className="text-carbon-gray-70" />
            Cost Envelope Breakdown — YTD 2026
          </h3>
          <FreshnessIndicator source="Claims" date="2026-04-10" />
        </div>
        <div className="space-y-2">
          {categories.map((cat) => {
            const pct = (cat.value / envelope.total) * 100;
            return (
              <div key={cat.key} className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-36 flex-shrink-0">
                  <Icon name={cat.icon as any} size={14} className="text-carbon-gray-50" />
                  <span className="text-xs text-carbon-gray-70">{cat.label}</span>
                </div>
                <div className="flex-1 h-5 bg-carbon-gray-20 relative overflow-hidden">
                  <div
                    className={`h-full ${cat.color} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-28 text-right flex-shrink-0">
                  <span className="font-mono text-sm tabular-nums text-carbon-gray-100">
                    ${cat.value.toLocaleString()}
                  </span>
                  <span className="text-2xs text-carbon-gray-50 ml-1">({pct.toFixed(1)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Payer data */}
      <section>
        <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2 mb-3">
          <Icon name="DocumentTextIcon" size={16} className="text-carbon-gray-70" />
          Payer Data — Claims Summary
        </h3>
        <div className="border border-carbon-gray-20 bg-carbon-gray-10 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            {[
              { key: 'p-payer', label: 'Payer', value: 'CMS / Medicare' },
              { key: 'p-id', label: 'Insurance ID', value: 'MCR-8821047' },
              { key: 'p-enroll', label: 'Enrollment Date', value: '01/01/2025' },
              { key: 'p-claims', label: 'YTD Claims', value: '47 claims' },
              { key: 'p-raf', label: 'Payer RAF Score', value: '3.24' },
              { key: 'p-recon', label: 'Reconciliation Status', value: 'Q1 2026 Pending' },
            ].map((f) => (
              <div key={f.key}>
                <p className="carbon-label">{f.label}</p>
                <p className="font-mono text-carbon-gray-100 font-medium">{f.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-carbon-gray-20">
            <p className="text-2xs text-carbon-gray-50 flex items-center gap-1">
              <Icon name="InformationCircleIcon" size={12} />
              Payer API integration deferred to Phase 2. Data sourced from claims adjudication feed.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
