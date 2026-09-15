'use client';
import React, { useState, useEffect } from 'react';

interface LegendSection {
  id: string;
  title: string;
  items: React.ReactNode;
}

function useSectionState(key: string, defaultOpen: boolean) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOpen;
    const stored = sessionStorage.getItem(key);
    return stored !== null ? stored === 'true' : defaultOpen;
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem(key, String(next));
      return next;
    });
  };

  return [open, toggle] as const;
}

function SectionRow({
  label,
  color,
  shape = 'circle',
  textColor,
}: {
  label: string;
  color: string;
  shape?: 'circle' | 'square' | 'pill';
  textColor?: string;
}) {
  const shapeClass =
    shape === 'circle'
      ? 'w-3 h-3 rounded-full flex-shrink-0'
      : shape === 'square'
        ? 'w-3 h-3 rounded-sm flex-shrink-0'
        : 'px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0';

  return (
    <div className="flex items-center gap-2">
      <span className={`${shapeClass} ${color}`} />
      <span className={`text-[11px] ${textColor || 'text-gray-600'}`}>{label}</span>
    </div>
  );
}

function CollapsibleSection({
  sectionKey,
  title,
  children,
}: {
  sectionKey: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, toggle] = useSectionState(`legend-section-${sectionKey}`, false);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-[11px] font-semibold text-gray-700">{title}</span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-3 pb-2.5 space-y-1.5">{children}</div>}
    </div>
  );
}

export default function LegendPanel() {
  const [panelOpen, setPanelOpen] = useState<boolean>(() => false);

  useEffect(() => {
    const stored = sessionStorage.getItem('legend-panel-open');
    if (stored !== null) setPanelOpen(stored === 'true');
  }, []);

  const togglePanel = () => {
    setPanelOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem('legend-panel-open', String(next));
      return next;
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-64 shadow-xl rounded-lg overflow-hidden border border-gray-200 bg-white">
      {/* Header / Toggle */}
      <button
        onClick={togglePanel}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800 hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-3.5 h-3.5 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
          </svg>
          <span className="text-[12px] font-semibold text-white tracking-wide">Legend</span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-300 transition-transform ${panelOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Expandable body */}
      {panelOpen && (
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
          {/* Risk Tiers */}
          <CollapsibleSection sectionKey="risk-tiers" title="Risk Tiers">
            <SectionRow label="Critical" color="bg-red-600" />
            <SectionRow label="High" color="bg-orange-500" />
            <SectionRow label="Moderate" color="bg-yellow-400" />
            <SectionRow label="Low" color="bg-green-500" />
            <SectionRow label="Stable" color="bg-gray-300" />
          </CollapsibleSection>

          {/* Gap Status */}
          <CollapsibleSection sectionKey="gap-status" title="Gap Status">
            <SectionRow label="In Process" color="bg-blue-500" />
            <SectionRow label="Not Started" color="bg-gray-300" />
            <SectionRow label="Waiting on Patient" color="bg-amber-400" />
            <SectionRow label="Closed / Complete" color="bg-green-500" />
          </CollapsibleSection>

          {/* Data Source Freshness */}
          <CollapsibleSection sectionKey="data-freshness" title="Data Source Freshness">
            <SectionRow label="Live (today)" color="bg-green-500" />
            <SectionRow label="Fresh (1–7 days)" color="bg-green-400" />
            <SectionRow label="Stale (8–14 days)" color="bg-amber-400" />
            <SectionRow label="Outdated (15+ days)" color="bg-red-500" />
          </CollapsibleSection>

          {/* Patient Journey */}
          <CollapsibleSection sectionKey="patient-journey" title="Patient Journey">
            <div className="space-y-1.5">
              {[
                { label: 'Stable', color: 'bg-green-500' },
                { label: 'Gap in Care', color: 'bg-yellow-400' },
                { label: 'Deteriorating', color: 'bg-orange-500' },
                { label: 'High Risk Transition', color: 'bg-red-600' },
                { label: 'Post-Acute', color: 'bg-purple-500' },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${color}`} />
                  <span className="text-[11px] text-gray-600">{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400">
              <span>◉</span>
              <span>= Active phase (animated pulse)</span>
            </div>
          </CollapsibleSection>

          {/* Workflow Step Badges */}
          <CollapsibleSection sectionKey="workflow-steps" title="Workflow Step Badges">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-green-600 text-white text-[9px] font-bold">
                  ▶
                </span>
                <span className="text-[11px] text-gray-600">Available — action ready</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold">
                  S2
                </span>
                <span className="text-[11px] text-gray-600">Step 2 required first</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-gray-500 text-white text-[9px] font-bold">
                  S3
                </span>
                <span className="text-[11px] text-gray-600">Step 3 required first</span>
              </div>
            </div>
          </CollapsibleSection>

          {/* HCC Confidence */}
          <CollapsibleSection sectionKey="hcc-confidence" title="HCC Confidence">
            <SectionRow label="High (≥ 80%)" color="bg-green-500" />
            <SectionRow label="Medium (50–79%)" color="bg-yellow-400" />
            <SectionRow label="Low (< 50%)" color="bg-red-500" />
          </CollapsibleSection>

          {/* Referral Status */}
          <CollapsibleSection sectionKey="referral-status" title="Referral Status">
            <SectionRow label="Not Sent" color="bg-gray-300" />
            <SectionRow label="Pending" color="bg-amber-400" />
            <SectionRow label="Scheduled" color="bg-blue-500" />
            <SectionRow label="Completed" color="bg-green-500" />
            <SectionRow label="Cancelled" color="bg-red-400" />
          </CollapsibleSection>

          {/* CDS Card Types */}
          <CollapsibleSection sectionKey="cds-cards" title="CDS Card Types">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-blue-400" />
                <span className="text-[11px] text-gray-600">Info</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-amber-400" />
                <span className="text-[11px] text-gray-600">Warning</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-red-600" />
                <span className="text-[11px] text-gray-600">Critical</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-green-500" />
                <span className="text-[11px] text-gray-600">Suggestion</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-purple-500" />
                <span className="text-[11px] text-gray-600">Smart Link</span>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
