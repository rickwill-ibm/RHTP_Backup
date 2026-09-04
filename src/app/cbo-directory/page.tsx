'use client';
import React, { useState, useEffect } from 'react';
import { getPatientSync } from '@/lib/services/patientService';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

type Provider = 'findhelp' | 'uniteus';
type Capacity = 'Accepting' | 'Waitlist' | 'Full';
type TaskStatus = 'Pending' | 'Accepted' | 'Completed';

interface MoCBO {
  id: string;
  number: number;
  name: string;
  org: string;
  domain: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  county: string;
  zip: string;
  capacity: Capacity;
  connected: boolean;
  provider: Provider;
  lat: number;
  lng: number;
}

// ─── Bennett County Action Referral Tasks ─────────────────────────────────────
interface ReferralTask {
  id: string;
  taskId: string;
  program: string;
  domain: string;
  status: TaskStatus;
  createdDate: string;
  dueDate: string;
  priority: 'High' | 'Medium' | 'Low';
  patientName: string;
  patientId: string;
  patientMrn: string;
  patientPhone: string;
  patientAddress: string;
  patientDob: string;
  enrolledBy: string;
  notes: string;
  monthlyValue: string;
}

const BENNETT_REFERRAL_TASKS: ReferralTask[] = [
  {
    id: 'rt-001',
    taskId: 'UU-SD-48821',
    program: 'WIC — Women, Infants & Children',
    domain: 'Nutrition',
    status: 'Pending',
    createdDate: '2026-06-10',
    dueDate: '2026-06-17',
    priority: 'High',
    patientName: 'Maria Redhawk',
    patientId: 'MARIA_SD_001',
    patientMrn: 'MRN-SD-001',
    patientPhone: '(605) 555-0122',
    patientAddress: '412 Main St, Martin, SD 57551',
    patientDob: '1992-03-22',
    enrolledBy: 'Sarah Johnson (Care Manager)',
    notes:
      'Eligible — income ≤185% FPL. Postpartum + infant Sophia. Documents partially collected. NEMT available for appointment.',
    monthlyValue: '$320/mo',
  },
  {
    id: 'rt-002',
    taskId: 'UU-SD-48822',
    program: 'SD Childcare Assistance Program (CCAP)',
    domain: 'Childcare',
    status: 'Accepted',
    createdDate: '2026-06-10',
    dueDate: '2026-06-17',
    priority: 'High',
    patientName: 'Maria Redhawk',
    patientId: 'MARIA_SD_001',
    patientMrn: 'MRN-SD-001',
    patientPhone: '(605) 555-0122',
    patientAddress: '412 Main St, Martin, SD 57551',
    patientDob: '1992-03-22',
    enrolledBy: 'Sarah Johnson (Care Manager)',
    notes:
      'Childcare barrier blocking HbA1c appointment. CCAP enrollment unblocks A1C recheck. Sophia (24mo) — childcare provider TBD.',
    monthlyValue: '$487/mo',
  },
  {
    id: 'rt-003',
    taskId: 'UU-SD-48823',
    program: 'SNAP Food Assistance — Renewal',
    domain: 'Food',
    status: 'Pending',
    createdDate: '2026-06-08',
    dueDate: '2026-06-15',
    priority: 'High',
    patientName: 'Maria Redhawk',
    patientId: 'MARIA_SD_001',
    patientMrn: 'MRN-SD-001',
    patientPhone: '(605) 555-0122',
    patientAddress: '412 Main St, Martin, SD 57551',
    patientDob: '1992-03-22',
    enrolledBy: 'Angela Torres (CHW Supervisor)',
    notes:
      'SNAP expired T+47d. Renewal overdue. SD DSS online renewal available at dss.sd.gov. Reminder SMS set for T+30d.',
    monthlyValue: '$281/mo',
  },
  {
    id: 'rt-004',
    taskId: 'UU-SD-48824',
    program: 'TANF — Temporary Assistance for Needy Families',
    domain: 'Financial',
    status: 'Pending',
    createdDate: '2026-06-11',
    dueDate: '2026-06-18',
    priority: 'Medium',
    patientName: 'Maria Redhawk',
    patientId: 'MARIA_SD_001',
    patientMrn: 'MRN-SD-001',
    patientPhone: '(605) 555-0122',
    patientAddress: '412 Main St, Martin, SD 57551',
    patientDob: '1992-03-22',
    enrolledBy: 'Sarah Johnson (Care Manager)',
    notes:
      'Single parent household. Eligible for TANF cash assistance. Documents needed: birth certificates for Sophia, proof of income.',
    monthlyValue: '$463/mo',
  },
  {
    id: 'rt-005',
    taskId: 'UU-SD-48825',
    program: 'LIHEAP — Low Income Home Energy Assistance',
    domain: 'Utility',
    status: 'Completed',
    createdDate: '2026-05-20',
    dueDate: '2026-05-27',
    priority: 'Low',
    patientName: 'Maria Redhawk',
    patientId: 'MARIA_SD_001',
    patientMrn: 'MRN-SD-001',
    patientPhone: '(605) 555-0122',
    patientAddress: '412 Main St, Martin, SD 57551',
    patientDob: '1992-03-22',
    enrolledBy: 'Angela Torres (CHW Supervisor)',
    notes:
      'LIHEAP application submitted. Approved for $180/season heating assistance. Community Action Partnership of the Black Hills processed.',
    monthlyValue: '$180/season',
  },
];

// ─── SD-focused CBO data ──────────────────────────────────────────────────────
const MO_CBOS: MoCBO[] = [
  {
    id: 'sd-001',
    number: 1,
    name: 'Benefit Enrollment Assistance',
    org: 'Bennett County Action CBO',
    domain: 'Financial',
    email: 'enroll@bennettcountyaction.org',
    phone: '(605) 685-6100',
    address: '204 W 3rd St',
    city: 'Martin',
    county: 'Bennett',
    zip: '57551',
    capacity: 'Accepting',
    connected: true,
    provider: 'uniteus',
    lat: 43.18,
    lng: -101.73,
  },
  {
    id: 'sd-002',
    number: 2,
    name: 'Medical Transportation (NEMT)',
    org: 'Medicaid NEMT — Bennett County',
    domain: 'Transportation',
    email: 'nemt@sd.gov',
    phone: '(800) 843-8394',
    address: '102 N Van Buren St',
    city: 'Martin',
    county: 'Bennett',
    zip: '57551',
    capacity: 'Accepting',
    connected: true,
    provider: 'uniteus',
    lat: 43.18,
    lng: -101.74,
  },
  {
    id: 'sd-003',
    number: 3,
    name: 'Food Pantry & SNAP Assistance',
    org: 'Oglala Sioux Tribe Community Services',
    domain: 'Food',
    email: 'food@ostcs.org',
    phone: '(605) 867-5821',
    address: '1 Crazy Horse Dr',
    city: 'Pine Ridge',
    county: 'Oglala Lakota',
    zip: '57770',
    capacity: 'Accepting',
    connected: true,
    provider: 'findhelp',
    lat: 43.02,
    lng: -102.55,
  },
  {
    id: 'sd-004',
    number: 4,
    name: 'Emergency Housing & Shelter',
    org: 'SD Housing Development Authority',
    domain: 'Housing',
    email: 'housing@sdhda.org',
    phone: '(605) 773-3181',
    address: '3060 E Elizabeth St',
    city: 'Pierre',
    county: 'Hughes',
    zip: '57501',
    capacity: 'Waitlist',
    connected: true,
    provider: 'uniteus',
    lat: 44.37,
    lng: -100.34,
  },
  {
    id: 'sd-005',
    number: 5,
    name: 'Postpartum Support Group',
    org: 'Bennett County Health Services',
    domain: 'Mental Health',
    email: 'bh@bennettcountyhealth.org',
    phone: '(605) 685-6622',
    address: '102 N Van Buren St',
    city: 'Martin',
    county: 'Bennett',
    zip: '57551',
    capacity: 'Accepting',
    connected: true,
    provider: 'uniteus',
    lat: 43.18,
    lng: -101.73,
  },
  {
    id: 'sd-006',
    number: 6,
    name: 'WIC — Women, Infants & Children',
    org: 'Bennett County WIC Office',
    domain: 'Nutrition',
    email: 'wic@bennett.sd.gov',
    phone: '(605) 685-6622',
    address: '102 N Van Buren St',
    city: 'Martin',
    county: 'Bennett',
    zip: '57551',
    capacity: 'Accepting',
    connected: true,
    provider: 'findhelp',
    lat: 43.18,
    lng: -101.73,
  },
  {
    id: 'sd-007',
    number: 7,
    name: 'Childcare Assistance (CCAP)',
    org: 'SD DSS Bennett County Office',
    domain: 'Childcare',
    email: 'dss@bennett.sd.gov',
    phone: '(605) 685-6622',
    address: '102 N Van Buren St',
    city: 'Martin',
    county: 'Bennett',
    zip: '57551',
    capacity: 'Accepting',
    connected: true,
    provider: 'uniteus',
    lat: 43.18,
    lng: -101.73,
  },
  {
    id: 'sd-008',
    number: 8,
    name: 'Behavioral Health Services',
    org: 'Avera Sacred Heart CAH — BH',
    domain: 'Mental Health',
    email: 'bh@averasacredheart.org',
    phone: '(605) 842-7100',
    address: '501 Summit St',
    city: 'Winner',
    county: 'Tripp',
    zip: '57580',
    capacity: 'Accepting',
    connected: false,
    provider: 'findhelp',
    lat: 43.37,
    lng: -99.86,
  },
  {
    id: 'sd-009',
    number: 9,
    name: 'Employment & Job Training',
    org: 'SD Department of Labor — Bennett County',
    domain: 'Employment',
    email: 'jobs@sd.gov',
    phone: '(605) 685-6622',
    address: '102 N Van Buren St',
    city: 'Martin',
    county: 'Bennett',
    zip: '57551',
    capacity: 'Accepting',
    connected: false,
    provider: 'findhelp',
    lat: 43.18,
    lng: -101.73,
  },
  {
    id: 'sd-010',
    number: 10,
    name: 'Utility Assistance (LIHEAP)',
    org: 'Community Action Partnership of the Black Hills',
    domain: 'Utility',
    email: 'liheap@capbh.org',
    phone: '(605) 348-0820',
    address: '601 E St Joseph St',
    city: 'Rapid City',
    county: 'Pennington',
    zip: '57701',
    capacity: 'Accepting',
    connected: true,
    provider: 'uniteus',
    lat: 44.08,
    lng: -103.23,
  },
  {
    id: 'sd-011',
    number: 11,
    name: 'Tribal Health Services',
    org: 'Oglala Sioux Tribe Health Administration',
    domain: 'Health',
    email: 'health@ostadmin.org',
    phone: '(605) 867-5131',
    address: '1 Crazy Horse Dr',
    city: 'Pine Ridge',
    county: 'Oglala Lakota',
    zip: '57770',
    capacity: 'Accepting',
    connected: true,
    provider: 'uniteus',
    lat: 43.02,
    lng: -102.55,
  },
  {
    id: 'sd-012',
    number: 12,
    name: 'Crisis & Safety Services',
    org: 'Monument Health Crisis Line',
    domain: 'Safety',
    email: 'crisis@monument.health',
    phone: '(605) 755-1000',
    address: '677 Cathedral Dr',
    city: 'Rapid City',
    county: 'Pennington',
    zip: '57701',
    capacity: 'Accepting',
    connected: true,
    provider: 'uniteus',
    lat: 44.08,
    lng: -103.23,
  },
  {
    id: 'sd-013',
    number: 13,
    name: 'Substance Use Treatment',
    org: 'Fall River Health Services',
    domain: 'Substance Use',
    email: 'su@fallriverhealth.org',
    phone: '(605) 745-3159',
    address: '1201 Highway 71',
    city: 'Hot Springs',
    county: 'Fall River',
    zip: '57747',
    capacity: 'Accepting',
    connected: false,
    provider: 'findhelp',
    lat: 43.43,
    lng: -103.47,
  },
  {
    id: 'sd-014',
    number: 14,
    name: 'Disability & Independent Living',
    org: 'SD Advocacy Services',
    domain: 'Disabilities',
    email: 'advocacy@sdadvocacy.org',
    phone: '(605) 224-8294',
    address: '221 S Central Ave',
    city: 'Pierre',
    county: 'Hughes',
    zip: '57501',
    capacity: 'Accepting',
    connected: false,
    provider: 'findhelp',
    lat: 44.37,
    lng: -100.34,
  },
  {
    id: 'sd-015',
    number: 15,
    name: 'Domestic Violence Services',
    org: 'Sacred Heart Center — DV',
    domain: 'Safety',
    email: 'dv@sacredheartcenter.org',
    phone: '(605) 842-1234',
    address: '501 Summit St',
    city: 'Winner',
    county: 'Tripp',
    zip: '57580',
    capacity: 'Accepting',
    connected: true,
    provider: 'findhelp',
    lat: 43.37,
    lng: -99.86,
  },
  {
    id: 'sd-016',
    number: 16,
    name: 'Education & Literacy',
    org: 'SD Literacy Council',
    domain: 'Education',
    email: 'learn@sdliteracy.org',
    phone: '(605) 224-9738',
    address: '104 N Euclid Ave',
    city: 'Pierre',
    county: 'Hughes',
    zip: '57501',
    capacity: 'Accepting',
    connected: false,
    provider: 'findhelp',
    lat: 44.37,
    lng: -100.34,
  },
  {
    id: 'sd-017',
    number: 17,
    name: 'Physical Activity & Wellness',
    org: 'Gregory County Medical Associates',
    domain: 'Physical Activity',
    email: 'wellness@gregorycountymed.org',
    phone: '(605) 835-8394',
    address: '400 Park St',
    city: 'Burke',
    county: 'Gregory',
    zip: '57523',
    capacity: 'Accepting',
    connected: false,
    provider: 'findhelp',
    lat: 43.18,
    lng: -99.29,
  },
  {
    id: 'sd-018',
    number: 18,
    name: 'Financial Counseling',
    org: 'SD Consumer Credit Counseling',
    domain: 'Financial',
    email: 'counsel@sdccc.org',
    phone: '(605) 334-6004',
    address: '4901 E 26th St',
    city: 'Sioux Falls',
    county: 'Minnehaha',
    zip: '57110',
    capacity: 'Accepting',
    connected: true,
    provider: 'uniteus',
    lat: 43.54,
    lng: -96.73,
  },
];

const CAPACITY_CONFIG: Record<Capacity, { bg: string; text: string }> = {
  Accepting: { bg: '#defbe6', text: '#0e6027' },
  Waitlist: { bg: '#fdf6dd', text: '#b45309' },
  Full: { bg: '#fff1f1', text: '#da1e28' },
};

const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  { bg: string; text: string; border: string; icon: string }
> = {
  Pending: { bg: '#fdf6dd', text: '#b45309', border: '#f1c21b', icon: 'ClockIcon' },
  Accepted: { bg: '#d0e2ff', text: '#0043ce', border: '#97c1ff', icon: 'CheckBadgeIcon' },
  Completed: { bg: '#defbe6', text: '#0e6027', border: '#a7f0ba', icon: 'CheckCircleIcon' },
};

const DOMAIN_COLORS: Record<string, string> = {
  Food: '#b45309',
  Housing: '#da1e28',
  Transportation: '#0043ce',
  Utility: '#007d79',
  'Mental Health': '#6929c4',
  Employment: '#198038',
  Financial: '#da1e28',
  Safety: '#9f1853',
  'Substance Use': '#9f1853',
  Education: '#0043ce',
  Disabilities: '#005d5d',
  'Physical Activity': '#198038',
  Support: '#6929c4',
  Nutrition: '#b45309',
  Childcare: '#6929c4',
  Health: '#007d79',
};

interface SendNeedsModalProps {
  cbo: MoCBO;
  onClose: () => void;
  patientName?: string;
  patientContext?: string;
}

function SendNeedsModal({ cbo, onClose, patientName, patientContext }: SendNeedsModalProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [details, setDetails] = useState(patientContext ?? '');
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-[#defbe6] rounded-full flex items-center justify-center mx-auto">
            <Icon name="CheckCircleIcon" size={24} style={{ color: '#0e6027' }} />
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100">Needs Request Sent</p>
          <p className="text-xs text-carbon-gray-70">
            Your request has been sent to <span className="font-semibold">{cbo.org}</span>. They
            will contact you at the email or phone number provided.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-carbon-gray-20">
          <p className="text-sm font-semibold text-carbon-gray-100">Send Needs Request</p>
          <button onClick={onClose} className="p-1 text-carbon-gray-50 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {patientName && (
            <div className="bg-[#d0e2ff] border border-[#97c1ff] px-3 py-2 flex items-center gap-2">
              <Icon name="UserIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
              <span className="text-xs font-semibold text-[#001d6c]">Referring: {patientName}</span>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-[#0043ce] mb-2">
              Needs Request for {cbo.name}
            </p>
            <div className="bg-carbon-gray-10 border-l-4 border-carbon-gray-30 px-3 py-2 text-2xs text-carbon-gray-70">
              Sending a Needs Request will email the provider. The provider may not respond right
              away. For faster service, you may want to call the provider directly.
            </div>
          </div>
          <div>
            <p className="text-2xs font-semibold text-[#0043ce] mb-1.5">Service Categories</p>
            <div className="border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 bg-white flex items-center justify-between">
              <span>{cbo.domain} Services</span>
              <Icon name="ChevronDownIcon" size={14} className="text-carbon-gray-50" />
            </div>
          </div>
          <div>
            <label className="text-2xs text-carbon-gray-70 block mb-1">Contact Email</label>
            <input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs focus:outline-none focus:border-[#0043ce]"
            />
          </div>
          <div>
            <label className="text-2xs text-carbon-gray-70 block mb-1">Contact Phone Number</label>
            <input
              type="tel"
              placeholder="(555) 555-5555"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs focus:outline-none focus:border-[#0043ce]"
            />
          </div>
          <div>
            <label className="text-2xs text-carbon-gray-70 block mb-1">Needs Request Details</label>
            <textarea
              placeholder="Please enter your message..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs focus:outline-none focus:border-[#0043ce] resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-carbon-gray-20 bg-carbon-gray-10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => setSent(true)}
            className="px-4 py-2 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Detail Modal ────────────────────────────────────────────────────────
function TaskDetailModal({
  task,
  onClose,
  onStatusChange,
}: {
  task: ReferralTask;
  onClose: () => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  const cfg = TASK_STATUS_CONFIG[task.status];
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-carbon-gray-20 bg-carbon-gray-10">
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">
              Referral Task #{task.taskId}
            </p>
            <p className="text-2xs text-carbon-gray-50">{task.program}</p>
          </div>
          <button onClick={onClose} className="p-1 text-carbon-gray-50 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {/* Status badge */}
          <div className="flex items-center gap-3">
            <span
              className="px-3 py-1 text-xs font-bold border flex items-center gap-1.5"
              style={{ backgroundColor: cfg.bg, color: cfg.text, borderColor: cfg.border }}
            >
              <Icon name={cfg.icon as any} size={13} />
              {task.status}
            </span>
            <span className="text-2xs text-carbon-gray-50">
              Created {task.createdDate} · Due {task.dueDate}
            </span>
            <span
              className={`text-2xs font-bold px-2 py-0.5 ${task.priority === 'High' ? 'bg-[#fff1f1] text-[#da1e28]' : task.priority === 'Medium' ? 'bg-[#fdf6dd] text-[#b45309]' : 'bg-carbon-gray-10 text-carbon-gray-70'}`}
            >
              {task.priority} Priority
            </span>
          </div>

          {/* Patient info */}
          <div className="bg-[#edf5ff] border border-[#97c1ff] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#0043ce]">Patient Information</p>
              <Link
                href={`/patient-detail?id=${task.patientId}`}
                className="flex items-center gap-1 text-2xs font-semibold text-[#0043ce] hover:underline"
                onClick={onClose}
              >
                <Icon name="ArrowTopRightOnSquareIcon" size={12} />
                View Unified Record
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Name', value: task.patientName },
                { label: 'Patient ID', value: task.patientId },
                { label: 'MRN', value: task.patientMrn },
                { label: 'Date of Birth', value: task.patientDob },
                { label: 'Phone', value: task.patientPhone },
                { label: 'Address', value: task.patientAddress },
              ].map((f) => (
                <div key={f.label} className="space-y-0.5">
                  <p className="text-2xs text-carbon-gray-50 font-semibold uppercase tracking-wide">
                    {f.label}
                  </p>
                  <p className="text-xs text-carbon-gray-100 font-medium">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Program details */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-carbon-gray-100">Program Details</p>
            {[
              { label: 'Program', value: task.program },
              { label: 'Domain', value: task.domain },
              { label: 'Monthly Value', value: task.monthlyValue },
              { label: 'Enrolled By', value: task.enrolledBy },
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

          {/* Notes */}
          <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3">
            <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
              Notes
            </p>
            <p className="text-xs text-carbon-gray-70">{task.notes}</p>
          </div>

          {/* Actions */}
          {task.status !== 'Completed' && (
            <div className="flex items-center gap-2 pt-2">
              {task.status === 'Pending' && (
                <button
                  onClick={() => {
                    onStatusChange(task.id, 'Accepted');
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors flex items-center gap-1.5"
                >
                  <Icon name="CheckBadgeIcon" size={14} />
                  Accept Task
                </button>
              )}
              {task.status === 'Accepted' && (
                <button
                  onClick={() => {
                    onStatusChange(task.id, 'Completed');
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-[#198038] text-white hover:bg-[#0e6027] transition-colors flex items-center gap-1.5"
                >
                  <Icon name="CheckCircleIcon" size={14} />
                  Mark Completed
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SD Map ───────────────────────────────────────────────────────────────────
// Pins are coloured by service domain using the SAME DOMAIN_COLORS the result cards use,
// so the map and the list read as one colour language.
const domainColor = (d: string): string => DOMAIN_COLORS[d] ?? '#6f6f6f';

function SouthDakotaMap({ cbos, highlightId }: { cbos: MoCBO[]; highlightId: string | null }) {
  const presentDomains = Array.from(new Set(cbos.map((c) => c.domain)));
  // SD bounding box approx: lat 42.5–45.9, lng -104.1 to -96.4
  const minLat = 42.5,
    maxLat = 46.0,
    minLng = -104.5,
    maxLng = -96.0;
  const toX = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * 560 + 20;
  const toY = (lat: number) => ((maxLat - lat) / (maxLat - minLat)) * 320 + 20;

  return (
    <div>
      <div
        className="relative bg-[#e8eedf] border border-carbon-gray-20 overflow-hidden"
        style={{ height: 420 }}
      >
        <svg width="100%" height="100%" viewBox="0 0 600 360" className="absolute inset-0">
          <rect x="0" y="0" width="600" height="360" fill="#e8eedf" />
          {/* SD highway network */}
          <line x1="0" y1="200" x2="600" y2="200" stroke="#c8b89a" strokeWidth="3" opacity="0.7" />
          <line x1="0" y1="240" x2="600" y2="240" stroke="#c8b89a" strokeWidth="2" opacity="0.5" />
          <line
            x1="290"
            y1="0"
            x2="290"
            y2="360"
            stroke="#c8b89a"
            strokeWidth="2.5"
            opacity="0.6"
          />
          <line
            x1="0"
            y1="160"
            x2="600"
            y2="220"
            stroke="#c8b89a"
            strokeWidth="1.5"
            opacity="0.4"
          />
          <line x1="150" y1="0" x2="150" y2="360" stroke="#c8b89a" strokeWidth="1" opacity="0.3" />
          <line x1="450" y1="0" x2="450" y2="360" stroke="#c8b89a" strokeWidth="1" opacity="0.3" />
          {/* Missouri River */}
          <path
            d="M 580 20 Q 540 60 500 100 Q 460 140 420 160 Q 380 180 340 185 Q 300 190 260 195 Q 220 200 180 210 Q 140 220 100 240 Q 60 260 20 280"
            stroke="#7ab8d4"
            strokeWidth="7"
            fill="none"
            opacity="0.55"
          />
          {/* County labels */}
          <text x="82" y="75" fontSize="7" fill="#888">
            Bennett County
          </text>
          <rect
            x="80"
            y="80"
            width="120"
            height="80"
            fill="none"
            stroke="#0043ce"
            strokeWidth="1.5"
            strokeDasharray="4,3"
            opacity="0.6"
          />
          <text x="265" y="192" fontSize="8" fill="#444" fontWeight="700">
            South Dakota
          </text>
          {/* CBO pins */}
          {cbos.map((cbo) => {
            const x = toX(cbo.lng);
            const y = toY(cbo.lat);
            const isHighlight = cbo.id === highlightId;
            return (
              <g key={cbo.id}>
                {isHighlight && (
                  <circle
                    cx={x}
                    cy={y}
                    r={16}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth={2}
                    opacity={0.9}
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isHighlight ? 13 : 10}
                  fill={domainColor(cbo.domain)}
                  stroke="#fff"
                  strokeWidth={1.5}
                  opacity={0.95}
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="8"
                  fill="white"
                  fontWeight="700"
                >
                  {cbo.number}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-2 right-2 bg-white/80 px-2 py-1 text-2xs text-carbon-gray-50 border border-carbon-gray-20">
          South Dakota — 14 Frontier Counties
        </div>
      </div>
      {/* Legend — below the map; service-type colours match the result-card badges */}
      <div className="mt-2 bg-white border border-carbon-gray-20 px-3 py-2">
        <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1.5">
          Service type
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {presentDomains.map((d) => (
            <span key={d} className="flex items-center gap-1.5 text-2xs text-carbon-gray-70">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: domainColor(d) }}
              />
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Bennett County Action Panel ─────────────────────────────────────────────
function BennettCountyActionPanel() {
  const [tasks, setTasks] = useState<ReferralTask[]>(BENNETT_REFERRAL_TASKS);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>('All');
  const [selectedTask, setSelectedTask] = useState<ReferralTask | null>(null);

  const handleStatusChange = (id: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  };

  const filtered = statusFilter === 'All' ? tasks : tasks.filter((t) => t.status === statusFilter);

  const counts = {
    Pending: tasks.filter((t) => t.status === 'Pending').length,
    Accepted: tasks.filter((t) => t.status === 'Accepted').length,
    Completed: tasks.filter((t) => t.status === 'Completed').length,
  };

  const totalValue = tasks.reduce((sum, t) => {
    const match = t.monthlyValue.match(/\$(\d+)/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* CBO Header */}
      <div className="bg-[#f6f2ff] border border-[#d4bbff] p-4 flex items-start gap-4">
        <div className="w-10 h-10 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
          <Icon name="BuildingOffice2Icon" size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-carbon-gray-100">Bennett County Action CBO</p>
          <p className="text-xs text-carbon-gray-70">
            204 W 3rd St, Martin, SD 57551 · <span className="font-medium">(605) 685-6100</span> ·{' '}
            <span className="text-[#0043ce]">enroll@bennettcountyaction.org</span>
          </p>
          <p className="text-2xs text-carbon-gray-50 mt-0.5">
            Unite Us Connected · Accepting Referrals · Bennett County, SD
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-semibold text-[#6929c4]">${totalValue.toLocaleString()}/mo</p>
          <p className="text-2xs text-carbon-gray-50">total benefit value</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(counts) as [TaskStatus, number][]).map(([status, count]) => {
          const cfg = TASK_STATUS_CONFIG[status];
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? 'All' : status)}
              className={`p-4 border text-left transition-colors ${statusFilter === status ? 'ring-2 ring-[#0043ce]' : 'hover:border-[#0043ce]'}`}
              style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
            >
              <p className="font-mono text-2xl font-bold" style={{ color: cfg.text }}>
                {count}
              </p>
              <p className="text-xs font-semibold" style={{ color: cfg.text }}>
                {status}
              </p>
              <p className="text-2xs text-carbon-gray-50">referral tasks</p>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
          Filter:
        </span>
        {(['All', 'Pending', 'Accepted', 'Completed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs font-semibold border transition-colors ${statusFilter === s ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-2xs text-carbon-gray-50">
          {filtered.length} task{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {filtered.map((task) => {
          const cfg = TASK_STATUS_CONFIG[task.status];
          const domColor = DOMAIN_COLORS[task.domain] ?? '#6f6f6f';
          return (
            <div
              key={task.id}
              className="bg-white border border-carbon-gray-20 hover:border-[#0043ce] transition-colors"
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-2xs font-mono font-bold text-carbon-gray-50">
                        #{task.taskId}
                      </span>
                      <span
                        className="px-2 py-0.5 text-2xs font-bold border flex items-center gap-1"
                        style={{
                          backgroundColor: cfg.bg,
                          color: cfg.text,
                          borderColor: cfg.border,
                        }}
                      >
                        <Icon name={cfg.icon as any} size={10} />
                        {task.status}
                      </span>
                      <span
                        className={`text-2xs font-bold px-1.5 py-0.5 ${task.priority === 'High' ? 'bg-[#fff1f1] text-[#da1e28]' : task.priority === 'Medium' ? 'bg-[#fdf6dd] text-[#b45309]' : 'bg-carbon-gray-10 text-carbon-gray-70'}`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className="text-2xs font-bold px-1.5 py-0.5 text-white"
                        style={{ backgroundColor: domColor }}
                      >
                        {task.domain}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-carbon-gray-100">{task.program}</p>
                    <p className="text-2xs text-carbon-gray-50 mt-0.5">
                      Due {task.dueDate} · {task.monthlyValue} benefit value
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right space-y-1">
                    <button
                      onClick={() => setSelectedTask(task)}
                      className="block px-3 py-1 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                </div>

                {/* Patient contact row */}
                <div className="mt-3 pt-3 border-t border-carbon-gray-10 flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Icon name="UserIcon" size={12} className="text-carbon-gray-50 flex-shrink-0" />
                    <span className="text-xs font-semibold text-carbon-gray-100">
                      {task.patientName}
                    </span>
                    <span className="text-2xs font-mono text-carbon-gray-50">
                      · {task.patientMrn}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icon
                      name="PhoneIcon"
                      size={12}
                      className="text-carbon-gray-50 flex-shrink-0"
                    />
                    <span className="text-xs text-carbon-gray-70">{task.patientPhone}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icon
                      name="MapPinIcon"
                      size={12}
                      className="text-carbon-gray-50 flex-shrink-0"
                    />
                    <span className="text-xs text-carbon-gray-70">{task.patientAddress}</span>
                  </div>
                  <Link
                    href={`/patient-detail?id=${task.patientId}`}
                    className="ml-auto flex items-center gap-1 text-2xs font-semibold text-[#0043ce] hover:underline flex-shrink-0"
                  >
                    <Icon name="ArrowTopRightOnSquareIcon" size={11} />
                    Unified Record
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

/** Map a FHIR Organization resource to the MoCBO shape used by card rendering. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fhirOrgToMoCBO(org: any, index: number): MoCBO {
  const phone = org.telecom?.find((t: any) => t.system === 'phone')?.value ?? '';
  const email = org.telecom?.find((t: any) => t.system === 'email')?.value ?? '';
  const addr = org.address?.[0] ?? {};
  const domainExt =
    org.extension?.find((e: any) => e.url?.endsWith('domain'))?.valueString ?? 'Other';
  const capacityRaw =
    org.extension?.find((e: any) => e.url?.endsWith('capacity'))?.valueString ?? 'Accepting';
  const capacity: Capacity = (['Accepting', 'Waitlist', 'Full'] as Capacity[]).includes(
    capacityRaw as Capacity
  )
    ? (capacityRaw as Capacity)
    : 'Accepting';
  return {
    id: org.id ?? `fhir-org-${index}`,
    number: index + 1,
    name: org.name ?? 'Unknown CBO',
    org: org.name ?? 'Unknown',
    domain: domainExt,
    email,
    phone,
    address: (addr.line ?? []).join(', '),
    city: addr.city ?? '',
    county: addr.district ?? addr.city ?? '',
    zip: addr.postalCode ?? '',
    capacity,
    connected: true,
    provider: 'uniteus' as Provider,
    lat: 0,
    lng: 0,
  };
}

export default function CBODirectoryPage() {
  const { activeCitizenId: activePatientId } = useActiveCitizen();
  const { useMockData } = useAppContext();
  // Population/network directory: it shows the whole SD network by default and is NOT
  // pre-filtered to any member's context. The active member only supplies the 'refer this
  // member' workflow, derived from data — never hardcoded to one persona.
  const activeMember = getPatientSync(activePatientId);
  const memberName = activeMember?.name;

  // In live mode: fetch full Organization list and use as CBO data source.
  // In mock mode: fall back to static MO_CBOS.
  const [fhirCBOs, setFhirCBOs] = useState<MoCBO[] | null>(null);
  const [fhirOrgCount, setFhirOrgCount] = useState<number | null>(null);

  useEffect(() => {
    if (useMockData) {
      setFhirCBOs(null);
      setFhirOrgCount(null);
      return;
    }
    getFhirClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .search('Organization', { _count: 50 } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((bundle: any) => {
        const entries: any[] = bundle.entry?.map((e: any) => e.resource).filter(Boolean) ?? [];
        if (entries.length > 0) {
          const mapped = entries.map(fhirOrgToMoCBO);
          setFhirCBOs(mapped);
          setFhirOrgCount(bundle.total ?? entries.length);
        } else if (bundle.total !== undefined) {
          setFhirOrgCount(bundle.total);
        }
      })
      .catch(() => {
        /* silent — fall back to mock data */
      });
  }, [useMockData]);

  // Active data source: FHIR orgs in live mode (if fetched), else static mock array
  const activeCBOs = fhirCBOs ?? MO_CBOS;

  const [provider, setProvider] = useState<Provider>('findhelp');
  const [domainFilter, setDomainFilter] = useState('All');
  const [connectedFilter, setConnectedFilter] = useState('All');
  const [countyFilter, setCountyFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [sendNeedsCBO, setSendNeedsCBO] = useState<MoCBO | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'directory' | 'bennett-tasks'>('directory');
  const itemsPerPage = 9;

  // In live mode FHIR orgs all come back as provider-agnostic; show them all regardless of provider toggle
  const domains = ['All', ...Array.from(new Set(activeCBOs.map((c) => c.domain)))];
  const counties = ['All', ...Array.from(new Set(activeCBOs.map((c) => c.county)))];

  const zipQuery = zipCode.trim();
  const filtered = activeCBOs.filter(
    (c) =>
      (fhirCBOs ? true : c.provider === provider) &&
      (domainFilter === 'All' || c.domain === domainFilter) &&
      (connectedFilter === 'All' ||
        (connectedFilter === 'Connected' ? c.connected : !c.connected)) &&
      (countyFilter === 'All' || c.county === countyFilter) &&
      (zipQuery === '' || c.zip.startsWith(zipQuery)) &&
      (searchTerm === '' ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.org.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.domain.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const providerCBOs = fhirCBOs ?? MO_CBOS.filter((c) => c.provider === provider);
  const kpis = [
    {
      label: 'Active CBOs',
      value: fhirOrgCount !== null ? String(fhirOrgCount) : String(providerCBOs.length),
      sub: fhirOrgCount !== null ? 'FHIR Organization resources' : 'South Dakota network',
      color: '#0043ce',
    },
    {
      label: 'Connected',
      value: String(providerCBOs.filter((c) => c.connected).length),
      sub: 'Registered with platform',
      color: '#198038',
    },
    {
      label: 'Accepting Referrals',
      value: String(providerCBOs.filter((c) => c.capacity === 'Accepting').length),
      sub: 'Available now',
      color: '#007d79',
    },
    {
      label: 'Counties Covered',
      value: String(new Set(providerCBOs.map((c) => c.county)).size),
      sub: 'South Dakota counties',
      color: '#6929c4',
    },
  ];

  return (
    <AppLayout
      pageTitle="CBO Directory"
      breadcrumbs={[
        { label: 'Whole Person Care', href: '/social-needs-screening' },
        { label: 'CBO Directory' },
      ]}
    >
      {/* Referral context — the network directory is population-scoped; this only names the
          active member available for a referral, derived from data (no persona hardcoding). */}
      {memberName && (
        <div className="bg-[#d0e2ff] border border-[#97c1ff] px-4 py-2.5 mb-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-2xs font-bold">
                {memberName
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
            <span className="text-xs font-semibold text-[#001d6c]">
              Refer active member: {memberName} · {activeMember?.location ?? ''}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap ml-auto">
            <span className="text-2xs text-[#0043ce]">
              Use “Refer” on any organization to send a referral
            </span>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-carbon-gray-20 mb-4">
        <button
          onClick={() => setActiveTab('directory')}
          className={`px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'directory' ? 'border-[#0043ce] text-[#0043ce]' : 'border-transparent text-carbon-gray-70 hover:text-carbon-gray-100'}`}
        >
          CBO Directory
        </button>
        <button
          onClick={() => setActiveTab('bennett-tasks')}
          className={`px-5 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'bennett-tasks' ? 'border-[#6929c4] text-[#6929c4]' : 'border-transparent text-carbon-gray-70 hover:text-carbon-gray-100'}`}
        >
          Bennett County Action — Referral Tasks
          <span className="px-1.5 py-0.5 text-2xs font-bold bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]">
            {BENNETT_REFERRAL_TASKS.filter((t) => t.status === 'Pending').length} Pending
          </span>
        </button>
      </div>

      {activeTab === 'bennett-tasks' ? (
        <BennettCountyActionPanel />
      ) : (
        <>
          {/* Provider Toggle */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-xs font-semibold text-carbon-gray-70">Directory Source:</span>
            <div className="flex border border-carbon-gray-20 overflow-hidden">
              {(['findhelp', 'uniteus'] as Provider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setProvider(p);
                    setPage(1);
                    setDomainFilter('All');
                  }}
                  className={`px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-2 ${provider === p ? 'bg-[#0043ce] text-white' : 'bg-white text-carbon-gray-70 hover:bg-carbon-gray-10'}`}
                >
                  <span className="w-2 h-2 rounded-full bg-current opacity-80" />
                  {p === 'findhelp' ? 'findhelp' : 'Unite Us'}
                  <span
                    className={`text-2xs font-normal ${provider === p ? 'opacity-80' : 'opacity-50'}`}
                  >
                    South Dakota
                  </span>
                </button>
              ))}
            </div>
            <span className="text-2xs font-semibold bg-[#defbe6] text-[#0e6027] px-2 py-0.5">
              ✓ South Dakota Contract Active
            </span>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="bg-white border border-carbon-gray-20 p-4">
                <p
                  className="font-mono text-xl font-bold leading-tight"
                  style={{ color: kpi.color }}
                >
                  {kpi.value}
                </p>
                <p className="text-xs font-semibold text-carbon-gray-100">{kpi.label}</p>
                <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Search + Filters */}
          <div className="bg-white border border-carbon-gray-20 p-4 mb-4 space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Icon
                  name="MagnifyingGlassIcon"
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-carbon-gray-50"
                />
                <input
                  type="text"
                  placeholder={`Search ${provider === 'findhelp' ? 'findhelp' : 'Unite Us'} directory...`}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-carbon-gray-20 focus:outline-none focus:border-[#0043ce]"
                />
              </div>
              <div className="relative">
                <Icon
                  name="MapPinIcon"
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-carbon-gray-50"
                />
                <input
                  type="text"
                  placeholder="Enter Zip Code"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className="pl-8 pr-3 py-2 text-xs border border-carbon-gray-20 focus:outline-none focus:border-[#0043ce] w-36"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-center text-2xs">
              <div className="flex items-center gap-1.5">
                <span className="text-carbon-gray-50 font-semibold">Connected</span>
                <select
                  value={connectedFilter}
                  onChange={(e) => {
                    setConnectedFilter(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs border border-carbon-gray-20 px-2 py-1 focus:outline-none focus:border-[#0043ce]"
                >
                  <option>All</option>
                  <option>Connected</option>
                  <option>Unregistered</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-carbon-gray-50 font-semibold">Domain</span>
                <select
                  value={domainFilter}
                  onChange={(e) => {
                    setDomainFilter(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs border border-carbon-gray-20 px-2 py-1 focus:outline-none focus:border-[#0043ce]"
                >
                  {domains.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-carbon-gray-50 font-semibold">County</span>
                <select
                  value={countyFilter}
                  onChange={(e) => {
                    setCountyFilter(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs border border-carbon-gray-20 px-2 py-1 focus:outline-none focus:border-[#0043ce]"
                >
                  {counties.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Results + Map */}
          <div className="flex gap-4">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-carbon-gray-100">Search Results</p>
                <p className="text-2xs text-carbon-gray-50">
                  Showing {filtered.length > 0 ? (page - 1) * itemsPerPage + 1 : 0}–
                  {Math.min(page * itemsPerPage, filtered.length)} of {filtered.length} items
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {paginated.map((cbo) => {
                  const cap = CAPACITY_CONFIG[cbo.capacity];
                  const domColor = DOMAIN_COLORS[cbo.domain] ?? '#6f6f6f';
                  const isBennett = cbo.org === 'Bennett County Action CBO';
                  return (
                    <div
                      key={cbo.id}
                      onMouseEnter={() => setHighlightId(cbo.id)}
                      onMouseLeave={() => setHighlightId(null)}
                      className={`bg-white border p-4 hover:border-[#0043ce] transition-colors cursor-default ${isBennett ? 'border-[#6929c4] ring-1 ring-[#6929c4]/30' : 'border-carbon-gray-20'}`}
                    >
                      {isBennett && (
                        <div className="flex items-center gap-1 mb-2 text-2xs font-bold text-[#6929c4]">
                          <Icon name="StarIcon" size={11} />
                          Primary Referral Partner
                        </div>
                      )}
                      <div className="flex items-start gap-2 mb-2">
                        <span className="w-5 h-5 rounded-full bg-[#1a56db] text-white text-2xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {cbo.number}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <p className="text-xs font-semibold text-carbon-gray-100">{cbo.name}</p>
                            {cbo.connected && (
                              <span className="text-2xs font-bold text-[#0e6027] bg-[#defbe6] px-1.5 py-0.5">
                                ✓ Connected
                              </span>
                            )}
                          </div>
                          <p className="text-2xs text-[#0043ce] font-medium truncate">{cbo.org}</p>
                        </div>
                      </div>
                      <div className="space-y-0.5 text-2xs text-carbon-gray-70 mb-3">
                        <p className="flex items-center gap-1">
                          <Icon name="EnvelopeIcon" size={10} className="flex-shrink-0" />
                          <span className="truncate">{cbo.email}</span>
                        </p>
                        <p className="flex items-center gap-1">
                          <Icon name="PhoneIcon" size={10} className="flex-shrink-0" />
                          {cbo.phone}
                        </p>
                        <p className="flex items-center gap-1">
                          <Icon name="MapPinIcon" size={10} className="flex-shrink-0" />
                          <span className="truncate">
                            {cbo.address}, {cbo.city}, SD {cbo.zip}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-2xs font-bold px-1.5 py-0.5 text-white"
                            style={{ backgroundColor: domColor }}
                          >
                            {cbo.domain}
                          </span>
                          <span
                            className="text-2xs font-bold px-1.5 py-0.5"
                            style={{ backgroundColor: cap.bg, color: cap.text }}
                          >
                            {cbo.capacity}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isBennett && (
                            <button
                              onClick={() => setActiveTab('bennett-tasks')}
                              className="px-2 py-1 text-2xs font-semibold bg-[#6929c4] text-white hover:bg-[#4f2196] transition-colors flex items-center gap-1"
                            >
                              Tasks
                            </button>
                          )}
                          <button
                            onClick={() => setSendNeedsCBO(cbo)}
                            className="px-2.5 py-1 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors flex items-center gap-1"
                          >
                            Refer <Icon name="ChevronDownIcon" size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div className="bg-white border border-carbon-gray-20 p-8 text-center text-xs text-carbon-gray-50">
                  No CBOs found matching your filters.
                </div>
              )}

              {/* Pagination */}
              <div className="flex items-center justify-between bg-white border border-carbon-gray-20 px-4 py-2">
                <div className="flex items-center gap-2 text-2xs text-carbon-gray-70">
                  <span>
                    Items per page: <strong>9</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-2xs text-carbon-gray-70">
                  <span>
                    {filtered.length > 0 ? (page - 1) * itemsPerPage + 1 : 0}–
                    {Math.min(page * itemsPerPage, filtered.length)} of {filtered.length} items
                  </span>
                  <select
                    value={page}
                    onChange={(e) => setPage(Number(e.target.value))}
                    className="border border-carbon-gray-20 px-1 py-0.5 text-2xs"
                  >
                    {Array.from({ length: totalPages }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                  <span>of {totalPages} pages</span>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-0.5 disabled:opacity-40 hover:text-carbon-gray-100"
                  >
                    <Icon name="ChevronLeftIcon" size={12} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-0.5 disabled:opacity-40 hover:text-carbon-gray-100"
                  >
                    <Icon name="ChevronRightIcon" size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="w-[420px] flex-shrink-0">
              <SouthDakotaMap cbos={filtered} highlightId={highlightId} />
            </div>
          </div>
        </>
      )}

      {sendNeedsCBO && (
        <SendNeedsModal
          cbo={sendNeedsCBO}
          onClose={() => setSendNeedsCBO(null)}
          patientName={memberName}
          patientContext={
            activeMember
              ? `Referring: ${activeMember.name} · ${activeMember.platformId}${activeMember.location ? ` · ${activeMember.location}` : ''}`
              : undefined
          }
        />
      )}
    </AppLayout>
  );
}
