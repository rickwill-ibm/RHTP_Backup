'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  SOCIAL_PATIENTS,
  PROGRAMS_BY_PATIENT,
  STATUS_CONFIG,
  PROGRAM_DOMAIN_COLORS,
} from '@/lib/socialMockData';
import type { Program } from '@/lib/socialMockData';
import { useDemoStore } from '@/uhg/store/demoStore';

// ─── Enroll Modal ─────────────────────────────────────────────────────────────
interface EnrollModalProps {
  program: Program;
  patientName: string;
  onClose: () => void;
  onComplete: (programId: string) => void;
}

const ENROLL_STEPS = ['Eligibility', 'Documents', 'SD Office', 'Unite Us Task', 'Confirmation'];
const RENEW_STEPS = ['Current Benefit', 'SD DSS Renewal', 'Documents', 'Reminder', 'Confirmation'];
const WAITLIST_STEPS = ['Waitlist Status', 'SDHDA Contact', 'Alternatives'];

function EnrollModal({ program, patientName, onClose, onComplete }: EnrollModalProps) {
  const [step, setStep] = useState(0);
  const isRenew = program.status === 'expired';
  const isWaitlist = program.domain === 'Housing' && program.status === 'pending';
  const steps = isWaitlist ? WAITLIST_STEPS : isRenew ? RENEW_STEPS : ENROLL_STEPS;
  const totalSteps = steps.length;

  const programValues: Record<string, string> = {
    'WIC — Women, Infants & Children': '$320/mo',
    'SD Childcare Assistance Program (CCAP)': '$487/mo',
    'SNAP Food Assistance': '$281/mo',
    'TANF — Temporary Assistance for Needy Families': '$463/mo',
    'LIHEAP — Low Income Home Energy Assistance': '$180/season',
  };

  const programDocs: Record<string, string[]> = {
    'WIC — Women, Infants & Children': [
      'Proof of identity (SD ID or tribal ID)',
      'Proof of residency (utility bill or lease)',
      'Proof of income (pay stubs or benefit letter)',
      'Infant/child birth certificate or pregnancy documentation',
    ],
    'SD Childcare Assistance Program (CCAP)': [
      'Proof of identity (SD ID or tribal ID)',
      'Proof of residency in Bennett County',
      'Proof of income (last 30 days)',
      "Child's birth certificate",
      'Childcare provider information',
    ],
    'SNAP Food Assistance': [
      'Proof of identity',
      'Proof of SD residency',
      'Proof of income or zero-income statement',
      'Social Security numbers for all household members',
    ],
    'TANF — Temporary Assistance for Needy Families': [
      'Proof of identity',
      'Proof of SD residency',
      'Birth certificates for all children',
      'Proof of income',
      'Social Security cards',
    ],
    'LIHEAP — Low Income Home Energy Assistance': [
      'Proof of identity',
      'Proof of residency',
      'Most recent utility bill',
      'Proof of income',
    ],
  };

  const sdOffices: Record<string, { name: string; address: string; phone: string; hours: string }> =
    {
      'WIC — Women, Infants & Children': {
        name: 'Bennett County WIC Office',
        address: '102 N. Van Buren St, Martin, SD 57551',
        phone: '(605) 685-6622',
        hours: 'Mon–Fri 8am–5pm',
      },
      'SD Childcare Assistance Program (CCAP)': {
        name: 'SD DSS Bennett County Office',
        address: '102 N. Van Buren St, Martin, SD 57551',
        phone: '(605) 685-6622',
        hours: 'Mon–Fri 8am–5pm',
      },
      'SNAP Food Assistance': {
        name: 'SD DSS Bennett County Office',
        address: '102 N. Van Buren St, Martin, SD 57551',
        phone: '(605) 685-6622',
        hours: 'Mon–Fri 8am–5pm',
      },
      'TANF — Temporary Assistance for Needy Families': {
        name: 'SD DSS Bennett County Office',
        address: '102 N. Van Buren St, Martin, SD 57551',
        phone: '(605) 685-6622',
        hours: 'Mon–Fri 8am–5pm',
      },
      'LIHEAP — Low Income Home Energy Assistance': {
        name: 'Community Action Partnership of the Black Hills',
        address: '601 E. St. Joseph St, Rapid City, SD 57701',
        phone: '(605) 348-0820',
        hours: 'Mon–Fri 8am–4:30pm',
      },
    };

  const monthlyValue = programValues[program.name] || 'Value TBD';
  const docs = programDocs[program.name] || [
    'Proof of identity',
    'Proof of residency',
    'Proof of income',
  ];
  const office = sdOffices[program.name] || {
    name: 'SD DSS Bennett County Office',
    address: '102 N. Van Buren St, Martin, SD 57551',
    phone: '(605) 685-6622',
    hours: 'Mon–Fri 8am–5pm',
  };

  const handleComplete = () => {
    onComplete(program.id);
    onClose();
  };

  const renderEnrollStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="bg-[#defbe6] border border-[#a7f0ba] p-4">
              <div className="flex items-start gap-3">
                <Icon
                  name="CheckCircleIcon"
                  size={18}
                  className="text-[#24a148] flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold text-[#0e6027]">Eligibility Confirmed</p>
                  <p className="text-xs text-[#198038] mt-1">
                    {patientName} meets all eligibility criteria for {program.name} based on PRAPARE
                    screening and income verification.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Patient', value: patientName },
                { label: 'Program', value: program.name },
                { label: 'Funding Source', value: program.fundingSource },
                { label: 'Monthly Benefit Value', value: monthlyValue },
                { label: 'County', value: 'Bennett County, SD' },
                {
                  label: 'Eligibility Basis',
                  value: 'Income ≤ 185% FPL · SD Resident · Qualifying household',
                },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex justify-between items-start gap-2 py-1.5 border-b border-carbon-gray-10 last:border-0"
                >
                  <span className="text-2xs text-carbon-gray-50">{f.label}</span>
                  <span className="text-xs font-medium text-carbon-gray-100 text-right">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-xs text-carbon-gray-70">
              The following documents are required to complete enrollment. Check off items as they
              are collected:
            </p>
            <div className="space-y-2">
              {docs.map((doc, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-carbon-gray-10 border border-carbon-gray-20"
                >
                  <div className="w-4 h-4 border-2 border-[#0043ce] flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-carbon-gray-100">{doc}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#fdf6dd] border border-[#f1c21b] p-3">
              <p className="text-xs text-[#b45309]">
                <span className="font-semibold">Note:</span> Bennett County Action CBO can assist
                with document collection. Transportation available via Medicaid NEMT.
              </p>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-xs text-carbon-gray-70">
              Contact the SD county office to schedule an enrollment appointment:
            </p>
            <div className="bg-[#edf5ff] border border-[#97c1ff] p-4 space-y-3">
              <p className="text-sm font-semibold text-carbon-gray-100">{office.name}</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon name="MapPinIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
                  {office.address}
                </div>
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon name="PhoneIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
                  {office.phone}
                </div>
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon name="ClockIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
                  {office.hours}
                </div>
              </div>
            </div>
            <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3">
              <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                Online Option
              </p>
              <p className="text-xs text-carbon-gray-70">
                Apply online at <span className="text-[#0043ce] font-medium">dss.sd.gov</span> or
                call SD DSS statewide: <span className="font-medium">(605) 773-3165</span>
              </p>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div className="bg-[#f6f2ff] border border-[#d4bbff] p-4">
              <div className="flex items-start gap-3">
                <Icon
                  name="CheckBadgeIcon"
                  size={18}
                  className="text-[#6929c4] flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold text-[#6929c4]">Unite Us Task Created</p>
                  <p className="text-xs text-[#6929c4] mt-1">
                    Task #UU-SD-{program.id.replace(/\D/g, '').padStart(5, '4')}21 assigned to
                    Bennett County Action CBO
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Task Type', value: 'Benefit Enrollment Assistance' },
                { label: 'Program', value: program.name },
                { label: 'Assigned CBO', value: 'Bennett County Action CBO' },
                { label: 'Priority', value: 'High' },
                {
                  label: 'Due Date',
                  value: new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }),
                },
                { label: 'Status', value: 'Open — Awaiting CBO Acceptance' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex justify-between items-start gap-2 py-1.5 border-b border-carbon-gray-10 last:border-0"
                >
                  <span className="text-2xs text-carbon-gray-50">{f.label}</span>
                  <span className="text-xs font-medium text-carbon-gray-100 text-right">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3">
              <p className="text-2xs text-carbon-gray-70">
                Track task status in{' '}
                <a href="/cbo-directory" className="text-[#0043ce] font-semibold hover:underline">
                  CBO Directory → Bennett County Action Tasks
                </a>
              </p>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <div className="bg-[#defbe6] border border-[#a7f0ba] p-4 text-center">
              <Icon name="CheckCircleIcon" size={32} className="text-[#24a148] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#0e6027]">Enrollment Initiated</p>
              <p className="text-xs text-[#198038] mt-1">Status updated to ENROLLMENT_INITIATED</p>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Expected Monthly Value', value: monthlyValue },
                { label: 'Expected Start', value: '2–4 weeks after appointment' },
                {
                  label: 'Unite Us Task',
                  value: 'Created & assigned to Bennett County Action CBO',
                },
                { label: 'Next Step', value: 'CBO will contact patient within 48 hours' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex justify-between items-start gap-2 py-1.5 border-b border-carbon-gray-10 last:border-0"
                >
                  <span className="text-2xs text-carbon-gray-50">{f.label}</span>
                  <span className="text-xs font-medium text-carbon-gray-100 text-right">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderRenewStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="bg-[#fff1f1] border border-[#ffb3b8] p-4">
              <div className="flex items-start gap-3">
                <Icon
                  name="ExclamationTriangleIcon"
                  size={18}
                  className="text-[#da1e28] flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold text-[#da1e28]">
                    Renewal Overdue — T+47 Days
                  </p>
                  <p className="text-xs text-[#da1e28] mt-1">
                    SNAP benefits expired {program.expiryDate}. Patient has been without food
                    assistance for 47 days.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Program', value: program.name },
                { label: 'Last Benefit Period', value: `Through ${program.expiryDate}` },
                { label: 'Monthly Allotment', value: '$281/mo' },
                { label: 'Renewal Status', value: 'OVERDUE — immediate action required' },
                { label: 'Household Size', value: '2 (Maria + Sophia, 24mo)' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex justify-between items-start gap-2 py-1.5 border-b border-carbon-gray-10 last:border-0"
                >
                  <span className="text-2xs text-carbon-gray-50">{f.label}</span>
                  <span
                    className={`text-xs font-medium text-right ${f.label === 'Renewal Status' ? 'text-[#da1e28]' : 'text-carbon-gray-100'}`}
                  >
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-xs text-carbon-gray-70">Renew SNAP benefits through SD DSS:</p>
            <div className="bg-[#edf5ff] border border-[#97c1ff] p-4 space-y-3">
              <p className="text-sm font-semibold text-carbon-gray-100">SD DSS Online Renewal</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon
                    name="ComputerDesktopIcon"
                    size={14}
                    className="text-[#0043ce] flex-shrink-0"
                  />
                  <span className="text-[#0043ce] font-medium">dss.sd.gov/snap</span> — Online
                  renewal portal
                </div>
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon name="PhoneIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
                  SD DSS Statewide: (605) 773-3165
                </div>
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon name="MapPinIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
                  Bennett County DSS: 102 N. Van Buren St, Martin, SD 57551
                </div>
              </div>
            </div>
            <div className="bg-[#fdf6dd] border border-[#f1c21b] p-3">
              <p className="text-xs text-[#b45309]">
                <span className="font-semibold">Expedited Processing:</span> Due to lapse in
                benefits, patient may qualify for expedited 7-day processing. Request at time of
                application.
              </p>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-xs text-carbon-gray-70">Documents needed for SNAP renewal:</p>
            <div className="space-y-2">
              {[
                'Proof of identity (SD ID or tribal ID)',
                'Proof of SD residency',
                'Proof of current income or zero-income statement',
                'Social Security numbers for all household members',
                'Proof of any changes since last certification',
              ].map((doc, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-carbon-gray-10 border border-carbon-gray-20"
                >
                  <div className="w-4 h-4 border-2 border-[#0043ce] flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-carbon-gray-100">{doc}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div className="bg-[#defbe6] border border-[#a7f0ba] p-4">
              <div className="flex items-start gap-3">
                <Icon name="BellIcon" size={18} className="text-[#24a148] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#0e6027]">Renewal Reminder Set</p>
                  <p className="text-xs text-[#198038] mt-1">
                    SMS reminder will be sent to {patientName} at T+30 days before next expiration.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Reminder Channel', value: 'SMS to (605) 555-0122' },
                { label: 'Reminder Trigger', value: '30 days before expiration' },
                { label: 'Next Renewal Deadline', value: 'Jan 31, 2027 (est.)' },
                { label: 'Unite Us Task', value: 'Created for renewal follow-up' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex justify-between items-start gap-2 py-1.5 border-b border-carbon-gray-10 last:border-0"
                >
                  <span className="text-2xs text-carbon-gray-50">{f.label}</span>
                  <span className="text-xs font-medium text-carbon-gray-100 text-right">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <div className="bg-[#defbe6] border border-[#a7f0ba] p-4 text-center">
              <Icon name="CheckCircleIcon" size={32} className="text-[#24a148] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#0e6027]">Renewal Initiated</p>
              <p className="text-xs text-[#198038] mt-1">
                SNAP renewal process started. Status updated.
              </p>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Expected Monthly Allotment', value: '$281/mo' },
                { label: 'Processing Time', value: '7–30 days (expedited may apply)' },
                { label: 'Renewal Deadline', value: 'Jan 31, 2027 (est.)' },
                { label: 'Reminder Set', value: 'SMS at T+30d before expiration' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex justify-between items-start gap-2 py-1.5 border-b border-carbon-gray-10 last:border-0"
                >
                  <span className="text-2xs text-carbon-gray-50">{f.label}</span>
                  <span className="text-xs font-medium text-carbon-gray-100 text-right">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderWaitlistStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="bg-[#fdf6dd] border border-[#f1c21b] p-4">
              <div className="flex items-start gap-3">
                <Icon name="ClockIcon" size={18} className="text-[#b45309] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#b45309]">Waitlist Position 47</p>
                  <p className="text-xs text-[#b45309] mt-1">
                    Estimated wait: 18 months. Application submitted to SD Housing Development
                    Authority.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Program', value: 'SD Housing Development Authority — Rental Assistance' },
                { label: 'Waitlist Position', value: '#47 of 312' },
                { label: 'Estimated Wait', value: '18 months' },
                { label: 'Application Date', value: 'Feb 10, 2026' },
                { label: 'Monthly Benefit Value', value: 'Est. $650–$850/mo' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex justify-between items-start gap-2 py-1.5 border-b border-carbon-gray-10 last:border-0"
                >
                  <span className="text-2xs text-carbon-gray-50">{f.label}</span>
                  <span className="text-xs font-medium text-carbon-gray-100 text-right">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-xs text-carbon-gray-70">
              Contact SD Housing Development Authority for status updates:
            </p>
            <div className="bg-[#edf5ff] border border-[#97c1ff] p-4 space-y-3">
              <p className="text-sm font-semibold text-carbon-gray-100">
                SD Housing Development Authority
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon name="PhoneIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
                  (605) 773-3181
                </div>
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon
                    name="ComputerDesktopIcon"
                    size={14}
                    className="text-[#0043ce] flex-shrink-0"
                  />
                  sdhda.org
                </div>
                <div className="flex items-center gap-2 text-xs text-carbon-gray-70">
                  <Icon name="MapPinIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
                  3060 E. Elizabeth St, Pierre, SD 57501
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-carbon-gray-100 mb-2">
              Emergency Alternatives While on Waitlist:
            </p>
            <div className="space-y-3">
              {[
                {
                  name: 'Emergency Rental Assistance (ERA)',
                  desc: 'SD ERA program — apply at dss.sd.gov/era',
                  urgency: 'Apply Now',
                },
                {
                  name: 'Bennett County Action CBO',
                  desc: 'Emergency housing assistance, 1–3 month bridge',
                  urgency: 'Contact CBO',
                },
                {
                  name: 'Rapid Rehousing Program',
                  desc: 'Short-term rental assistance + case management',
                  urgency: 'Refer',
                },
              ].map((alt, i) => (
                <div key={i} className="p-3 bg-carbon-gray-10 border border-carbon-gray-20">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-carbon-gray-100">{alt.name}</p>
                      <p className="text-2xs text-carbon-gray-50 mt-0.5">{alt.desc}</p>
                    </div>
                    <span className="text-2xs font-semibold px-2 py-0.5 bg-[#0043ce] text-white flex-shrink-0">
                      {alt.urgency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderStep = () => {
    if (isWaitlist) return renderWaitlistStep();
    if (isRenew) return renderRenewStep();
    return renderEnrollStep();
  };

  const isLastStep = step === totalSteps - 1;
  const modalTitle = isWaitlist
    ? 'Housing Waitlist Status'
    : isRenew
      ? `Renew: ${program.name}`
      : `Enroll: ${program.name}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-carbon-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-carbon-gray-20 bg-carbon-gray-10 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-carbon-gray-100">{modalTitle}</h3>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              {patientName} · Bennett County, SD
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Step indicator */}
        {!isWaitlist && (
          <div className="px-5 py-3 border-b border-carbon-gray-20 flex-shrink-0">
            <div className="flex items-center gap-0">
              {steps.map((s, i) => (
                <React.Fragment key={s}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold border-2 transition-all
                      ${
                        i < step
                          ? 'bg-[#24a148] border-[#24a148] text-white'
                          : i === step
                            ? 'bg-[#0043ce] border-[#0043ce] text-white'
                            : 'bg-white border-carbon-gray-30 text-carbon-gray-50'
                      }`}
                    >
                      {i < step ? <Icon name="CheckIcon" size={10} /> : i + 1}
                    </div>
                    <span
                      className={`text-2xs mt-1 whitespace-nowrap ${i === step ? 'text-[#0043ce] font-semibold' : i < step ? 'text-[#24a148]' : 'text-carbon-gray-30'}`}
                      style={{ fontSize: '9px' }}
                    >
                      {s}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-1 mb-4 transition-all ${i < step ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">{renderStep()}</div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-carbon-gray-20 bg-carbon-gray-10 flex-shrink-0">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="carbon-btn-secondary text-xs py-2 disabled:opacity-40"
          >
            <Icon name="ChevronLeftIcon" size={14} />
            Back
          </button>
          {isLastStep ? (
            <button onClick={handleComplete} className="carbon-btn-primary text-xs py-2">
              <Icon name="CheckCircleIcon" size={14} />
              {isWaitlist ? 'Close' : 'Complete'}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}
              className="carbon-btn-primary text-xs py-2"
            >
              Next
              <Icon name="ChevronRightIcon" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProgramEligibilityPage() {
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);

  // Single source of context: this screen's patient FOLLOWS the global active citizen
  // (set by the top switcher / demo pill / prior screen), instead of defaulting to Maria.
  const resolvePatient = React.useCallback(
    () =>
      SOCIAL_PATIENTS.find((p) => p.patientId === activePatientId) ??
      SOCIAL_PATIENTS.find((p) => p.name === 'Maria Redhawk') ??
      SOCIAL_PATIENTS[0],
    [activePatientId]
  );
  const [selectedPatient, setSelectedPatient] = useState(resolvePatient);
  // Re-sync when the active citizen changes (e.g. navigating in from another screen).
  useEffect(() => {
    setSelectedPatient(resolvePatient());
  }, [resolvePatient]);
  const [domainFilter, setDomainFilter] = useState('All');
  const [activeModal, setActiveModal] = useState<Program | null>(null);
  const [enrolledPrograms, setEnrolledPrograms] = useState<Set<string>>(new Set());

  const programs = PROGRAMS_BY_PATIENT[selectedPatient.patientId] ?? [];
  const domains = ['All', ...Array.from(new Set(programs.map((p) => p.domain)))];
  const filtered =
    domainFilter === 'All' ? programs : programs.filter((p) => p.domain === domainFilter);

  const getEffectiveStatus = (prog: Program) => {
    if (enrolledPrograms.has(prog.id)) return 'enrolled';
    return prog.status;
  };

  const counts = {
    enrolled: programs.filter((p) => getEffectiveStatus(p) === 'enrolled').length,
    eligible: programs.filter((p) => getEffectiveStatus(p) === 'eligible').length,
    pending: programs.filter((p) => getEffectiveStatus(p) === 'pending').length,
    expired: programs.filter((p) => getEffectiveStatus(p) === 'expired').length,
  };

  const handleEnrollComplete = (programId: string) => {
    setEnrolledPrograms((prev) => new Set([...prev, programId]));
  };

  return (
    <AppLayout
      pageTitle="Program Eligibility Engine"
      breadcrumbs={[
        { label: 'Whole Person Care', href: '/social-needs-screening' },
        { label: 'Program Eligibility' },
      ]}
    >
      {/* Selected-patient context banner — follows the active citizen, data-driven */}
      {programs.length > 0 && (
        <div className="bg-[#d0e2ff] border border-[#97c1ff] px-4 py-2.5 mb-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-2xs font-bold">
                {selectedPatient.name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
            <span className="text-xs font-semibold text-[#001d6c]">
              {selectedPatient.name} · {selectedPatient.patientId} · {programs.length} benefit
              programs
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap ml-auto">
            <span className="text-2xs text-[#0043ce]">
              {programs
                .map((pr) => pr.name.split(' — ')[0].split(' (')[0])
                .slice(0, 9)
                .join(' · ')}
            </span>
          </div>
        </div>
      )}

      {activeModal && (
        <EnrollModal
          program={activeModal}
          patientName={selectedPatient.name}
          onClose={() => setActiveModal(null)}
          onComplete={handleEnrollComplete}
        />
      )}

      <div className="flex gap-4">
        {/* Patient list */}
        <div className="w-64 flex-shrink-0 space-y-2">
          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest px-1">
            Select Patient
          </p>
          {SOCIAL_PATIENTS.map((p) => (
            <button
              key={p.patientId}
              onClick={() => {
                setActiveCitizen(p.patientId);
                setSelectedPatient(p);
                setDomainFilter('All');
                setEnrolledPrograms(new Set());
              }}
              className={`w-full text-left p-3 border transition-colors ${selectedPatient.patientId === p.patientId ? 'border-[#0043ce] bg-[#edf5ff]' : 'border-carbon-gray-20 bg-white hover:bg-carbon-gray-10'}`}
            >
              <p className="text-xs font-semibold text-carbon-gray-100">{p.name}</p>
              <p className="text-2xs font-mono text-carbon-gray-50">
                {p.patientId} · {p.mrn}
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {p.needs.map((n) => (
                  <span
                    key={n}
                    className="text-2xs px-1.5 py-0.5 bg-[#fff1f1] text-[#da1e28] font-semibold"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </button>
          ))}
          <div className="mt-4 p-3 bg-[#f6f2ff] border border-[#8a3ffc]">
            <p className="text-2xs font-semibold text-[#6929c4] uppercase tracking-wide mb-1">
              Screening Source
            </p>
            <p className="text-xs text-carbon-gray-70">
              {selectedPatient.lastScreened
                ? `Last screened: ${selectedPatient.lastScreened}`
                : 'Not yet screened'}
            </p>
            <a
              href="/social-needs-screening"
              className="text-2xs text-[#0043ce] hover:underline mt-1 block"
            >
              View screening →
            </a>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Patient header */}
          <div className="bg-white border border-carbon-gray-20 p-3 flex items-center gap-4">
            <div>
              <p className="text-sm font-semibold text-carbon-gray-100">{selectedPatient.name}</p>
              <p className="text-2xs font-mono text-carbon-gray-50">
                {selectedPatient.patientId} · {selectedPatient.mrn} · DOB {selectedPatient.dob} ·
                PCP: {selectedPatient.pcp}
              </p>
            </div>
            <div className="ml-auto">
              <span
                className="px-2 py-0.5 text-2xs font-bold text-white"
                style={{
                  backgroundColor:
                    selectedPatient.riskLevel === 'High'
                      ? '#da1e28'
                      : selectedPatient.riskLevel === 'Medium'
                        ? '#b45309'
                        : '#198038',
                }}
              >
                {selectedPatient.riskLevel} Risk
              </span>
            </div>
          </div>

          {/* Status summary */}
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(counts).map(([status, count]) => {
              const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
              return (
                <div
                  key={status}
                  className="bg-white border border-carbon-gray-20 p-4 flex items-center gap-3"
                >
                  <Icon name={cfg.icon as any} size={20} style={{ color: cfg.text }} />
                  <div>
                    <p className="font-mono text-xl font-bold" style={{ color: cfg.text }}>
                      {count}
                    </p>
                    <p className="text-xs font-semibold text-carbon-gray-70">{cfg.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Domain filter */}
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <button
                key={d}
                onClick={() => setDomainFilter(d)}
                className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${domainFilter === d ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Programs table */}
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
              <p className="text-sm font-semibold text-carbon-gray-100">
                Programs for {selectedPatient.name}
              </p>
              <span className="text-2xs text-carbon-gray-50">{filtered.length} programs</span>
            </div>
            <div className="divide-y divide-carbon-gray-10">
              {filtered.map((prog) => {
                const effectiveStatus = getEffectiveStatus(prog);
                const cfg =
                  STATUS_CONFIG[effectiveStatus as keyof typeof STATUS_CONFIG] ??
                  STATUS_CONFIG['eligible'];
                const domainColor = PROGRAM_DOMAIN_COLORS[prog.domain] ?? '#6f6f6f';
                const isEnrolledNow = enrolledPrograms.has(prog.id);
                return (
                  <div
                    key={prog.id}
                    className="p-4 flex items-start gap-4 hover:bg-carbon-gray-10 transition-colors"
                  >
                    <div
                      className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                      style={{ backgroundColor: domainColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-carbon-gray-100">{prog.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-2xs text-carbon-gray-50">{prog.domain}</span>
                            <span className="text-2xs text-carbon-gray-30">·</span>
                            <span className="text-2xs font-mono text-carbon-gray-50">
                              {prog.fundingSource}
                            </span>
                          </div>
                        </div>
                        <span
                          className="px-2 py-0.5 text-2xs font-bold flex items-center gap-1"
                          style={{ backgroundColor: cfg.bg, color: cfg.text }}
                        >
                          <Icon name={cfg.icon as any} size={11} />
                          {isEnrolledNow ? 'ENROLLMENT INITIATED' : cfg.label}
                        </span>
                      </div>
                      {(prog.enrolledDate || prog.expiryDate) && !isEnrolledNow && (
                        <div className="flex items-center gap-4 mt-1.5 text-2xs text-carbon-gray-50">
                          {prog.enrolledDate && (
                            <span>
                              Enrolled: <span className="font-mono">{prog.enrolledDate}</span>
                            </span>
                          )}
                          {prog.expiryDate && (
                            <span
                              className={
                                prog.status === 'expired' ? 'text-[#da1e28] font-semibold' : ''
                              }
                            >
                              Expires: <span className="font-mono">{prog.expiryDate}</span>
                            </span>
                          )}
                        </div>
                      )}
                      {prog.actionRequired && !isEnrolledNow && (
                        <div
                          className="mt-2 flex items-start gap-1.5 text-2xs"
                          style={{ color: prog.status === 'expired' ? '#da1e28' : '#b45309' }}
                        >
                          <Icon
                            name="ExclamationTriangleIcon"
                            size={11}
                            className="mt-0.5 flex-shrink-0"
                          />
                          <span className="font-medium">{prog.actionRequired}</span>
                        </div>
                      )}
                      {isEnrolledNow && (
                        <div className="mt-2 flex items-center gap-1.5 text-2xs text-[#24a148]">
                          <Icon name="CheckCircleIcon" size={11} className="flex-shrink-0" />
                          <span className="font-medium">
                            Unite Us task created · Bennett County Action CBO assigned
                          </span>
                        </div>
                      )}
                    </div>
                    {(effectiveStatus === 'eligible' || effectiveStatus === 'expired') &&
                      !isEnrolledNow && (
                        <button
                          onClick={() => setActiveModal(prog)}
                          className="px-3 py-1 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors flex-shrink-0"
                        >
                          {effectiveStatus === 'expired' ? 'Renew' : 'Enroll'}
                        </button>
                      )}
                    {effectiveStatus === 'pending' &&
                      prog.domain === 'Housing' &&
                      !isEnrolledNow && (
                        <button
                          onClick={() => setActiveModal(prog)}
                          className="px-3 py-1 text-2xs font-semibold bg-[#b45309] text-white hover:bg-[#8a3800] transition-colors flex-shrink-0"
                        >
                          View Waitlist
                        </button>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
