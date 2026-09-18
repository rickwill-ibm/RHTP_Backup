'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

interface RhtpPlatformHeaderProps {
  launchContext: SmartLaunchContext | null;
}

export default function RhtpPlatformHeader({ launchContext }: RhtpPlatformHeaderProps) {
  const [archOpen, setArchOpen] = useState(false);

  return (
    <div className="bg-white border-b border-carbon-gray-20">
      {/* Primary header */}
      <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap bg-[#f0f4ff] border-b border-[#97c1ff]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#0043ce] flex items-center justify-center">
              <Icon name="BoltIcon" size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-carbon-gray-100 leading-tight">
                Rural Health Transformation Platform
              </p>
              <p className="text-xs text-carbon-gray-50">
                Powered by Regional Technology Center · South Dakota DHSS
              </p>
            </div>
          </div>
          <div className="w-px h-8 bg-carbon-gray-20" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
              <Icon name="ComputerDesktopIcon" size={11} />
              Embedded in EMR
            </span>
            <span className="flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]">
              <Icon name="BoltIcon" size={11} />
              SMART on FHIR
            </span>
            <span className="flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]">
              <Icon name="BuildingOffice2Icon" size={11} />
              Rural Health Program
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {launchContext && (
            <div className="text-right hidden md:block">
              <p className="text-xs font-semibold text-carbon-gray-100">
                {launchContext.practitionerName}
              </p>
              <p className="text-2xs text-carbon-gray-50">{launchContext.fhirBaseUrl}</p>
            </div>
          )}
          <button
            onClick={() => setArchOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#97c1ff] bg-white text-[#0043ce] hover:bg-[#d0e2ff] transition-colors"
          >
            <Icon name="CpuChipIcon" size={13} />
            Architecture
            <Icon name={archOpen ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={12} />
          </button>
        </div>
      </div>

      {/* Architecture panel */}
      {archOpen && (
        <div className="px-6 py-4 bg-[#161616] border-b border-carbon-gray-80">
          <p className="text-2xs font-semibold text-carbon-gray-30 uppercase tracking-widest mb-3">
            Platform Architecture
          </p>
          <div className="flex items-center gap-0 flex-wrap">
            {[
              {
                label: 'EMR / Cerner',
                sub: 'EHR System',
                color: 'bg-[#393939]',
                icon: 'ComputerDesktopIcon',
              },
              {
                label: 'RHTP Platform',
                sub: 'SMART on FHIR',
                color: 'bg-[#0043ce]',
                icon: 'BoltIcon',
              },
              {
                label: 'Care Gap Engine',
                sub: 'HEDIS / STARS / MIPS',
                color: 'bg-[#6929c4]',
                icon: 'ExclamationTriangleIcon',
              },
              {
                label: 'AI Care Planning',
                sub: 'Recommendation Engine',
                color: 'bg-[#9f1853]',
                icon: 'SparklesIcon',
              },
              {
                label: 'EDW / Quality Reporting',
                sub: 'Closed-Loop Reporting',
                color: 'bg-[#005d5d]',
                icon: 'ChartBarIcon',
              },
            ].map((step, i, arr) => (
              <React.Fragment key={step.label}>
                <div className={`flex flex-col items-center px-4 py-3 ${step.color} min-w-[120px]`}>
                  <Icon name={step.icon as any} size={16} className="text-white mb-1" />
                  <p className="text-xs font-semibold text-white text-center leading-tight">
                    {step.label}
                  </p>
                  <p className="text-2xs text-white/60 text-center mt-0.5">{step.sub}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className="flex items-center px-1">
                    <Icon name="ArrowRightIcon" size={14} className="text-carbon-gray-50" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <p className="text-2xs text-carbon-gray-50 mt-3">
            This application is supplied by the Regional Rural Health Technology Platform — not by
            the provider EMR vendor. All clinical data flows through SMART on FHIR and returns to
            the EDW for quality reporting.
          </p>
        </div>
      )}
    </div>
  );
}
