'use client';
import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';

interface BreadcrumbStep {
  label: string;
  sublabel?: string;
  href?: string;
  active?: boolean;
}

interface PatientBreadcrumbProps {
  contractName?: string;
  panelName?: string;
  patientName?: string;
}

export default function PatientBreadcrumb({
  contractName = 'Medicaid RHTP Track 3',
  panelName = 'Panel & Cohort',
  patientName = 'Margaret Okonkwo',
}: PatientBreadcrumbProps) {
  const steps: BreadcrumbStep[] = [
    {
      label: 'Contract',
      sublabel: contractName,
      href: '/contract-program-selection',
    },
    {
      label: 'Panel',
      sublabel: panelName,
      href: '/panel-cohort-view',
    },
    {
      label: 'Patient',
      sublabel: patientName,
      active: true,
    },
  ];

  return (
    <nav
      aria-label="Patient navigation breadcrumb"
      className="bg-white border border-carbon-gray-20 mb-4 px-6 py-3 flex items-center gap-0"
    >
      {steps.map((step, i) => (
        <React.Fragment key={`step-${i}`}>
          {/* Step */}
          <div
            className={`flex items-center gap-2 px-4 py-2 ${
              step.active ? 'bg-carbon-blue' : 'bg-white hover:bg-carbon-gray-10 transition-colors'
            }`}
          >
            {/* Step number circle */}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                step.active ? 'bg-white text-carbon-blue' : 'bg-carbon-gray-20 text-carbon-gray-70'
              }`}
            >
              {i + 1}
            </div>

            {/* Labels */}
            {step.href ? (
              <Link href={step.href} className="group flex flex-col min-w-0">
                <span
                  className={`text-2xs font-semibold uppercase tracking-wide ${
                    step.active ? 'text-blue-100' : 'text-carbon-gray-50'
                  }`}
                >
                  {step.label}
                </span>
                <span
                  className={`text-xs font-medium truncate max-w-[160px] group-hover:underline ${
                    step.active ? 'text-white' : 'text-carbon-gray-100'
                  }`}
                >
                  {step.sublabel}
                </span>
              </Link>
            ) : (
              <div className="flex flex-col min-w-0">
                <span
                  className={`text-2xs font-semibold uppercase tracking-wide ${
                    step.active ? 'text-blue-100' : 'text-carbon-gray-50'
                  }`}
                >
                  {step.label}
                </span>
                <span
                  className={`text-xs font-medium truncate max-w-[160px] ${
                    step.active ? 'text-white' : 'text-carbon-gray-100'
                  }`}
                >
                  {step.sublabel}
                </span>
              </div>
            )}

            {/* Return arrow for clickable steps */}
            {step.href && (
              <Icon
                name="ArrowLeftIcon"
                size={12}
                className={`flex-shrink-0 ${step.active ? 'text-white' : 'text-carbon-gray-50'}`}
              />
            )}
          </div>

          {/* Chevron separator */}
          {i < steps.length - 1 && (
            <div className="flex items-center px-1 text-carbon-gray-30">
              <Icon name="ChevronRightIcon" size={16} />
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Right side: back to panel shortcut */}
      <div className="ml-auto flex items-center gap-3">
        <Link
          href="/panel-cohort-view"
          className="flex items-center gap-1.5 text-xs text-carbon-gray-50 hover:text-carbon-blue transition-colors border border-carbon-gray-20 px-3 py-1.5 hover:border-carbon-blue"
        >
          <Icon name="ArrowLeftIcon" size={13} />
          <span>Back to Panel</span>
        </Link>
        <Link
          href="/contract-program-selection"
          className="flex items-center gap-1.5 text-xs text-carbon-gray-50 hover:text-carbon-blue transition-colors border border-carbon-gray-20 px-3 py-1.5 hover:border-carbon-blue"
        >
          <Icon name="ArrowLeftIcon" size={13} />
          <span>Back to Contracts</span>
        </Link>
      </div>
    </nav>
  );
}
