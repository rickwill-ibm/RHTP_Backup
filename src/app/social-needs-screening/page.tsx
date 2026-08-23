'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  SOCIAL_PATIENTS,
  SCREENING_HISTORY,
  CBOS,
} from '@/lib/socialMockData';
import { useAppContext } from '@/lib/appContext';
import { SD_RECOMMENDATIONS } from '@/lib/sdResourceData';
import { getPatientSync } from '@/lib/services/patientService';
import { getVisiblePatients } from '@/lib/patientRegistry';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { citizenNeeds, nbaForCategory, type ResourceCategory } from '@/lib/careTeam/graph/resources';
import { toast } from 'sonner';

type ScreeningView = 'list' | 'screen' | 'history';
type Provider = 'findhelp' | 'uniteus';

// ─── 13-Domain findhelp Instrument ───────────────────────────────────────────
interface Domain {
  id: string;
  label: string;
  emoji: string;
  color: string;
  questions: Question[];
}

interface Question {
  id: string;
  text: string;
  options: string[];
  riskOptions: number[]; // indices that indicate unmet need
  type: 'radio';
}

const FINDHELP_DOMAINS: Domain[] = [
  {
    id: 'housing', label: 'Housing', emoji: '🏠', color: '#da1e28',
    questions: [
      { id: 'h1', text: 'What is your housing situation today?', options: ['I have housing', 'I do not have housing', 'I am worried about losing my housing'], riskOptions: [1, 2], type: 'radio' },
      { id: 'h2', text: 'Are you worried about losing your housing?', options: ['Yes', 'No'], riskOptions: [0], type: 'radio' },
    ],
  },
  {
    id: 'food', label: 'Food', emoji: '🍎', color: '#b45309',
    questions: [
      { id: 'f1', text: 'Within the past 12 months, did you worry that food would run out before you got money to buy more?', options: ['Never true', 'Sometimes true', 'Often true'], riskOptions: [1, 2], type: 'radio' },
      { id: 'f2', text: 'Within the past 12 months, the food you bought just didn\'t last and you didn\'t have money to get more.', options: ['Never true', 'Sometimes true', 'Often true'], riskOptions: [1, 2], type: 'radio' },
    ],
  },
  {
    id: 'transportation', label: 'Transportation', emoji: '🚌', color: '#0043ce',
    questions: [
      { id: 't1', text: 'In the past 12 months, has lack of reliable transportation kept you from medical appointments, meetings, work, or from getting things needed for daily living?', options: ['No', 'Yes, some of the time', 'Yes, most of the time'], riskOptions: [1, 2], type: 'radio' },
    ],
  },
  {
    id: 'utility', label: 'Utility', emoji: '💡', color: '#007d79',
    questions: [
      { id: 'u1', text: 'In the past 12 months, have you or any member of your household been unable to get utilities (heat, electricity) when it was really needed?', options: ['No', 'Yes, some of the time', 'Yes, most of the time'], riskOptions: [1, 2], type: 'radio' },
    ],
  },
  {
    id: 'safety', label: 'Safety', emoji: '🛡️', color: '#9f1853',
    questions: [
      { id: 's1', text: 'How often does anyone, including family and friends, physically hurt you?', options: ['Never', 'Rarely', 'Sometimes', 'Fairly often', 'Frequently'], riskOptions: [2, 3, 4], type: 'radio' },
      { id: 's2', text: 'How often does anyone, including family and friends, insult or talk down to you?', options: ['Never', 'Rarely', 'Sometimes', 'Fairly often', 'Frequently'], riskOptions: [2, 3, 4], type: 'radio' },
      { id: 's3', text: 'How often does anyone, including family and friends, threaten you with harm?', options: ['Never', 'Rarely', 'Sometimes', 'Fairly often', 'Frequently'], riskOptions: [2, 3, 4], type: 'radio' },
      { id: 's4', text: 'How often does anyone, including family and friends, scream or curse at you?', options: ['Never', 'Rarely', 'Sometimes', 'Fairly often', 'Frequently'], riskOptions: [2, 3, 4], type: 'radio' },
    ],
  },
  {
    id: 'financial', label: 'Financial', emoji: '💰', color: '#da1e28',
    questions: [
      { id: 'fi1', text: 'How hard is it for you to pay for the very basics like food, housing, medical care, and heating?', options: ['Not hard at all', 'A little hard', 'Somewhat hard', 'Very hard', 'Extremely hard'], riskOptions: [2, 3, 4], type: 'radio' },
      { id: 'fi2', text: 'Do you have any problems with your income or benefits?', options: ['No', 'Yes'], riskOptions: [1], type: 'radio' },
    ],
  },
  {
    id: 'employment', label: 'Employment', emoji: '💼', color: '#198038',
    questions: [
      { id: 'e1', text: 'What is your current work situation?', options: ['Full-time', 'Part-time', 'Unemployed — looking for work', 'Unemployed — not looking for work', 'Retired', 'Unable to work'], riskOptions: [2, 3, 5], type: 'radio' },
    ],
  },
  {
    id: 'support', label: 'Support', emoji: '🤝', color: '#6929c4',
    questions: [
      { id: 'su1', text: 'If for any reason you need help with day-to-day activities such as bathing, preparing meals, shopping, managing finances, etc., do you get the help you need?', options: ['I don\'t need any help', 'I get all the help I need', 'I could use a little more help', 'I need a lot more help'], riskOptions: [2, 3], type: 'radio' },
      { id: 'su2', text: 'How often do you feel lonely or isolated from those around you?', options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'], riskOptions: [3, 4], type: 'radio' },
    ],
  },
  {
    id: 'education', label: 'Education', emoji: '📚', color: '#0043ce',
    questions: [
      { id: 'ed1', text: 'What is the highest level of school that you have finished?', options: ['Less than high school', 'High school diploma or GED', 'Some college', 'College degree or more'], riskOptions: [0], type: 'radio' },
    ],
  },
  {
    id: 'physical_activity', label: 'Physical Activity', emoji: '🏃', color: '#198038',
    questions: [
      { id: 'pa1', text: 'How many days per week do you engage in moderate to strenuous exercise (like walking fast, running, jogging, dancing, swimming, biking, or other activities that cause a light or heavy sweat)?', options: ['0 days', '1–2 days', '3–4 days', '5 or more days'], riskOptions: [0, 1], type: 'radio' },
    ],
  },
  {
    id: 'substance_use', label: 'Substance Use', emoji: '🚫', color: '#9f1853',
    questions: [
      { id: 'sb1', text: 'How many times in the past 12 months have you had 5 or more drinks in a day (males) or 4 or more drinks in a day (females)?', options: ['Never', '1–3 times', '4–6 times', '7–11 times', '12 or more times'], riskOptions: [1, 2, 3, 4], type: 'radio' },
      { id: 'sb2', text: 'How often have you used any tobacco product in the past 12 months?', options: ['Never', 'Some days', 'Most days', 'Every day'], riskOptions: [1, 2, 3], type: 'radio' },
    ],
  },
  {
    id: 'mental_health', label: 'Mental Health', emoji: '🧠', color: '#6929c4',
    questions: [
      { id: 'mh1', text: 'Over the last 2 weeks, how often have you been bothered by feeling down, depressed, or hopeless?', options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'], riskOptions: [1, 2, 3], type: 'radio' },
      { id: 'mh2', text: 'Over the last 2 weeks, how often have you been bothered by little interest or pleasure in doing things?', options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'], riskOptions: [1, 2, 3], type: 'radio' },
      { id: 'mh3', text: 'Stress means a situation in which a person feels tense, restless, nervous, or anxious. In the last month, how often have you felt this kind of stress?', options: ['Never', 'Rarely', 'Sometimes', 'Fairly often', 'Very often'], riskOptions: [3, 4], type: 'radio' },
    ],
  },
  {
    id: 'disabilities', label: 'Disabilities', emoji: '♿', color: '#005d5d',
    questions: [
      { id: 'di1', text: 'Do you have a physical, mental, or emotional disability?', options: ['No', 'Yes'], riskOptions: [1], type: 'radio' },
      { id: 'di2', text: 'Because of a physical, mental, or emotional condition, do you have serious difficulty concentrating, remembering, or making decisions?', options: ['No', 'Yes'], riskOptions: [1], type: 'radio' },
    ],
  },
];

// Emoji scale component
const EMOJI_SCALE = [
  { label: 'NotOkay', emoji: '😢', color: '#da1e28' },
  { label: 'Okay', emoji: '😕', color: '#f1620a' },
  { label: 'Good', emoji: '😐', color: '#f1c21b' },
  { label: 'Great', emoji: '🙂', color: '#42be65' },
  { label: 'Excellent', emoji: '😊', color: '#24a148' },
];

function EmojiScale({ value }: { value: number | undefined }) {
  const idx = value !== undefined ? Math.min(4, Math.floor((value / 4) * 4)) : 2;
  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
      <div className="flex items-end gap-3">
        {EMOJI_SCALE.map((e, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className="text-xs">{e.label}</span>
            <span className="text-lg">{e.emoji}</span>
          </div>
        ))}
      </div>
      <div className="relative w-full h-3 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #da1e28, #f1620a, #f1c21b, #42be65, #24a148)', minWidth: 200 }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0 h-0"
          style={{ left: `${(idx / 4) * 100}%`, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '8px solid white' }} />
      </div>
    </div>
  );
}

// South Dakota CBO recommendations by domain — sourced from sdResourceData
const MO_RECOMMENDATIONS: Record<string, { name: string; org: string; phone: string; address: string; city: string; connected: boolean }[]> = SD_RECOMMENDATIONS;

interface SendNeedsModalProps {
  orgName: string;
  domain: string;
  onClose: () => void;
}

function SendNeedsModal({ orgName, domain, onClose }: SendNeedsModalProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-[#defbe6] rounded-full flex items-center justify-center mx-auto">
            <Icon name="CheckCircleIcon" size={24} style={{ color: '#0e6027' }} />
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100">Needs Request Sent</p>
          <p className="text-xs text-carbon-gray-70">Your request has been sent to <span className="font-semibold">{orgName}</span>. They will contact you at the email or phone number provided.</p>
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-carbon-gray-20">
          <p className="text-sm font-semibold text-carbon-gray-100">Send Needs Request</p>
          <button onClick={onClose} className="p-1 text-carbon-gray-50 hover:text-carbon-gray-100"><Icon name="XMarkIcon" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-[#0043ce] mb-2">Needs Request for {domain} Services</p>
            <div className="bg-carbon-gray-10 border-l-4 border-carbon-gray-30 px-3 py-2 text-2xs text-carbon-gray-70">
              Sending a Needs Request will email the provider. The provider may not respond right away. For faster service, you may want to call the provider directly.
            </div>
          </div>
          <div>
            <p className="text-2xs font-semibold text-[#0043ce] mb-1.5">Service Categories</p>
            <div className="border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 bg-white flex items-center justify-between">
              <span>{domain} Services</span>
              <Icon name="ChevronDownIcon" size={14} className="text-carbon-gray-50" />
            </div>
          </div>
          <div>
            <label className="text-2xs text-carbon-gray-70 block mb-1">Contact Email</label>
            <input type="email" placeholder="Enter your email address" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs focus:outline-none focus:border-[#0043ce]" />
          </div>
          <div>
            <label className="text-2xs text-carbon-gray-70 block mb-1">Contact Phone Number</label>
            <input type="tel" placeholder="(555) 555-5555" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs focus:outline-none focus:border-[#0043ce]" />
          </div>
          <div>
            <label className="text-2xs text-carbon-gray-70 block mb-1">Needs Request Details</label>
            <textarea placeholder="Please enter your message..." value={details} onChange={e => setDetails(e.target.value)} rows={4}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs focus:outline-none focus:border-[#0043ce] resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-carbon-gray-20 bg-carbon-gray-10">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">Cancel</button>
          <button onClick={() => setSent(true)} className="px-4 py-2 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors">Send</button>
        </div>
      </div>
    </div>
  );
}

// Simple SVG map for recommendations
function RecommendationsMap({ count }: { count: number }) {
  const pins = Array.from({ length: Math.min(count, 8) }, (_, i) => ({
    x: 80 + (i % 4) * 120 + Math.sin(i * 1.5) * 30,
    y: 80 + Math.floor(i / 4) * 100 + Math.cos(i * 1.2) * 20,
    n: i + 1,
  }));
  return (
    <div className="bg-[#e8eedf] border border-carbon-gray-20 overflow-hidden" style={{ height: 300 }}>
      <svg width="100%" height="100%" viewBox="0 0 560 300">
        <rect x="0" y="0" width="560" height="300" fill="#e8eedf" />
        <line x1="0" y1="150" x2="560" y2="150" stroke="#c8b89a" strokeWidth="2.5" opacity="0.6" />
        <line x1="280" y1="0" x2="280" y2="300" stroke="#c8b89a" strokeWidth="2" opacity="0.5" />
        <line x1="0" y1="100" x2="560" y2="180" stroke="#c8b89a" strokeWidth="1.5" opacity="0.4" />
        <path d="M 540 0 Q 520 60 500 120 Q 480 180 460 300" stroke="#7ab8d4" strokeWidth="6" fill="none" opacity="0.5" />
        <text x="200" y="165" fontSize="8" fill="#444" fontWeight="700">Bennett County, SD</text>
        {pins.map(p => (
          <g key={p.n}>
            <circle cx={p.x} cy={p.y} r={11} fill="#1a56db" opacity={0.9} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="8" fill="white" fontWeight="700">{p.n}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Maria Redhawk confirmed PRAPARE results ──────────────────────────────────
// Pre-populated from confirmed PRAPARE screening results per PDF
const MARIA_PRAPARE_RESPONSES: Record<string, number> = {
  // Transportation: Yes, most of the time (index 2 = HIGH risk) — 47 miles, no vehicle
  t1: 2,
  // Food: Often true (index 2 = HIGH risk) — SNAP active, WIC lapsed
  f1: 2,
  f2: 2,
  // Financial: Very hard (index 3 = HIGH risk) — single parent, early shift
  fi1: 3,
  fi2: 1,
  // Employment: Part-time (index 1) — Bennett County School District
  e1: 1,
  // Mental Health: More than half the days (index 2) — Edinburgh PND 11
  mh1: 2,
  mh2: 2,
  mh3: 3,
  // Housing: worried about losing housing (index 2) — rental waitlist #47
  h1: 2,
  h2: 0,
  // Support: Could use a little more help (index 2) — childcare blocker
  su1: 2,
  su2: 3,
  // Utility: Yes, some of the time (index 1) — LIHEAP eligible not applied
  u1: 1,
};

const DOMAIN_CATEGORY: Record<string, ResourceCategory | undefined> = {
  housing: 'Housing', food: 'Food', transportation: 'Transportation', utilities: 'Financial',
  safety: 'Behavioral Health', financial: 'Financial', employment: 'Employment',
  support: 'Social Isolation', 'mental-health': 'Behavioral Health', substance: 'Behavioral Health', disability: 'Social Isolation',
};
const CATEGORY_DOMAIN: Record<string, string> = {
  Housing: 'housing', Food: 'food', Transportation: 'transportation', Financial: 'financial',
  'Behavioral Health': 'mental-health', 'Social Isolation': 'support', Employment: 'employment',
};
function prefillFromNeeds(citizenId: string): Record<string, number> {
  const r: Record<string, number> = {};
  for (const need of citizenNeeds(citizenId)) {
    const dom = FINDHELP_DOMAINS.find(d => d.id === CATEGORY_DOMAIN[need.category]);
    const q = dom?.questions[0];
    if (q && q.riskOptions.length) r[q.id] = q.riskOptions[0];
  }
  return r;
}

interface ReferItem { action: string; cboName: string; keystone: boolean; category: string }
function ScreeningReferralModal({ items, citizenName, onConfirm, onClose }: { items: ReferItem[]; citizenName: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-carbon-gray-20 bg-[#edf5ff] flex items-center justify-between">
          <div className="flex items-center gap-2"><Icon name="SparklesIcon" size={15} className="text-[#0043ce]" /><p className="text-sm font-semibold text-[#0043ce]">Send {items.length} referral{items.length !== 1 ? 's' : ''} to caseload</p></div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100"><Icon name="XMarkIcon" size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-2 text-xs max-h-[50vh] overflow-auto">
          <div className="flex justify-between"><span className="text-carbon-gray-50">Citizen</span><span className="font-semibold text-carbon-gray-100">{citizenName}</span></div>
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 border-l-2 border-[#0043ce] pl-2 py-1">
              <span className="font-medium text-carbon-gray-100">{it.action}</span>
              {it.keystone && <span className="text-2xs font-bold px-1 bg-[#fff1f1] text-[#da1e28]">KEYSTONE</span>}
              <span className="text-2xs text-carbon-gray-50 ml-auto">via {it.cboName}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-2xs font-semibold text-[#0e6027] pt-1"><Icon name="ShieldCheckIcon" size={12} /> Consent on file — cross-org referral permitted</div>
          <div className="flex justify-between text-2xs"><span className="text-carbon-gray-50">Owner</span><span className="font-medium text-carbon-gray-100">CHW · Social</span></div>
        </div>
        <div className="px-6 py-4 border-t border-carbon-gray-20 bg-carbon-gray-10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 bg-white hover:bg-carbon-gray-10">Cancel</button>
          <button onClick={onConfirm} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0043ce] hover:bg-[#002d9c]"><Icon name="CheckIcon" size={12} /> Confirm</button>
        </div>
      </div>
    </div>
  );
}

export default function SocialNeedsScreeningPage() {
  const { activePatientId, setActivePatientId, addReferralTasks } = useAppContext();
  const [referModal, setReferModal] = useState<ReferItem[] | null>(null);

  // ── FHIR: past screening Observations for this patient ──────────────────────
  const [fhirScreenings, setFhirScreenings] = useState<{ date: string; domains: string[]; id: string }[]>([]);
  const [fhirScreeningLoading, setFhirScreeningLoading] = useState(false);
  const lastFhirPatientId = useRef('');

  useEffect(() => {
    if (getFhirMockMode()) { setFhirScreenings([]); return; }
    const fhirId = PLATFORM_TO_FHIR_ID_MAP[activePatientId] ?? (activePatientId.startsWith('patient-') ? activePatientId : null);
    if (!fhirId || fhirId === lastFhirPatientId.current) return;
    lastFhirPatientId.current = fhirId;
    setFhirScreeningLoading(true);
    getFhirClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .search('Observation', { 'category': 'social-history', 'subject': `Patient/${fhirId}`, '_count': '50', '_sort': '-date' } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((bundle: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entries: { date: string; domains: string[]; id: string }[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byDate: Record<string, string[]> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const e of (bundle?.entry ?? [])) {
          const obs = e?.resource;
          if (!obs || obs.resourceType !== 'Observation') continue;
          const date: string = (obs.effectiveDateTime ?? obs.meta?.lastUpdated ?? '').slice(0, 10);
          const domain: string = obs.code?.text ?? obs.code?.coding?.[0]?.display ?? 'Unknown';
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(domain);
        }
        for (const [date, domains] of Object.entries(byDate)) {
          entries.push({ date, domains, id: `fhir-${date}` });
        }
        entries.sort((a, b) => b.date.localeCompare(a.date));
        setFhirScreenings(entries);
      })
      .catch(() => setFhirScreenings([]))
      .finally(() => setFhirScreeningLoading(false));
  }, [activePatientId]);

  const screenedDate = new Map(SCREENING_HISTORY.map(r => [r.patientId, r.date]));
  const monthsSince = (d?: string) => d ? (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30) : Infinity;
  const screeningStatus = (pid: string): 'Current' | 'Due Soon' | 'Overdue' | 'Never' => {
    const m = monthsSince(screenedDate.get(pid));
    return m === Infinity ? 'Never' : m > 12 ? 'Overdue' : m > 10 ? 'Due Soon' : 'Current';
  };
  const dueCitizens = getVisiblePatients(getFhirMockMode()).filter(c => screeningStatus(c.platformId) !== 'Current');

  // ── confirmReferrals: add to caseload + POST ServiceRequest to FHIR ─────────
  const confirmReferrals = async () => {
    if (!referModal) return;
    const cname = getPatientSync(activePatientId)?.name ?? 'Citizen';
    const fhirId = PLATFORM_TO_FHIR_ID_MAP[activePatientId] ?? (activePatientId.startsWith('patient-') ? activePatientId : null);
    addReferralTasks(referModal.map((it, i) => ({ id: `ref-${activePatientId}-${it.category}-${Date.now()}-${i}`, patientId: activePatientId, citizenName: cname, action: it.action, category: it.category, cboName: it.cboName, keystone: it.keystone, status: 'pending' as const, source: 'screening' as const, createdAt: new Date().toISOString() })));
    // POST a ServiceRequest to FHIR for each referral item in live mode
    if (!getFhirMockMode() && fhirId) {
      const client = getFhirClient();
      await Promise.allSettled(referModal.map((it) =>
        client.create({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'referral',
          priority: it.keystone ? 'urgent' : 'routine',
          category: [{ coding: [{ system: 'http://snomed.info/sct', code: '306206005', display: 'Referral to service' }] }],
          code: { text: it.action, coding: [{ system: 'http://snomed.info/sct', display: it.action }] },
          subject: { reference: `Patient/${fhirId}` },
          requester: { display: 'TCOC Social Screening' },
          performer: [{ display: it.cboName }],
          reasonCode: [{ text: `SDOH domain: ${it.category}` }],
          authoredOn: new Date().toISOString(),
          note: [{ text: `Referral from PRAPARE screening. CBO: ${it.cboName}. Category: ${it.category}. Keystone: ${it.keystone}.` }],
        } as Record<string, unknown>)
      ));
      toast.success(`${referModal.length} referral${referModal.length !== 1 ? 's' : ''} sent to caseload + FHIR`, { description: `${cname} — ServiceRequest written to FHIR` });
    } else {
      toast.success(`${referModal.length} referral${referModal.length !== 1 ? 's' : ''} sent to caseload`, { description: `${cname} — now in the CHW Action Queue` });
    }
    setReferModal(null);
  };
  const isMaria = activePatientId === 'MARIA_SD_001' || activePatientId === 'patient-maria';

  // Build patient list from registry (all visible patients) — overlaid onto SOCIAL_PATIENTS shape
  const registryPatients = getVisiblePatients(getFhirMockMode());
  // Merge registry into SOCIAL_PATIENTS shape so existing table columns work
  const allPatientRows = registryPatients.length > 0
    ? registryPatients.map(rp => {
        const sp = SOCIAL_PATIENTS.find(p => p.patientId === rp.platformId || p.name === rp.name);
        return {
          id: rp.platformId,
          name: rp.name,
          mrn: rp.ehrMrn,
          patientId: rp.platformId,
          pcp: rp.pcp,
          lastScreened: sp?.lastScreened ?? undefined,
          riskLevel: rp.riskTier === 'Critical' ? 'High' : rp.riskTier === 'High' ? 'High' : rp.riskTier === 'Moderate' ? 'Medium' : 'Low',
          unmetNeeds: sp?.unmetNeeds ?? rp.openCareGaps ?? 0,
          dob: rp.dob,
        };
      })
    : SOCIAL_PATIENTS;

  // For the screening form we still use SOCIAL_PATIENTS shape (has questions/domains)
  const mariaPatient = SOCIAL_PATIENTS.find(p => p.patientId === 'PAT-0006' || p.name === 'Maria Redhawk') ?? SOCIAL_PATIENTS[0];

  const [view, setView] = useState<ScreeningView>(isMaria ? 'screen' : 'list');
  const [selectedPatient, setSelectedPatient] = useState<typeof SOCIAL_PATIENTS[0] | null>(isMaria ? mariaPatient : null);
  const [provider, setProvider] = useState<Provider>('findhelp');
  const [currentStep, setCurrentStep] = useState(0); // 0-12 domain index
  const [responses, setResponses] = useState<Record<string, number>>(isMaria ? MARIA_PRAPARE_RESPONSES : prefillFromNeeds(activePatientId));
  const [submitted, setSubmitted] = useState(isMaria ? true : false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [sendNeedsModal, setSendNeedsModal] = useState<{ orgName: string; domain: string } | null>(null);
  const [recPage, setRecPage] = useState<Record<string, number>>({});

  // Use registry patients for the queue; filter by search term
  const filteredPatients = allPatientRows.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.mrn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentDomain = FINDHELP_DOMAINS[currentStep];
  const totalSteps = FINDHELP_DOMAINS.length;

  // Determine unmet domains from responses
  const unmetDomains = FINDHELP_DOMAINS.filter(domain =>
    domain.questions.some(q => {
      const resp = responses[q.id];
      return resp !== undefined && q.riskOptions.includes(resp);
    })
  );

  // Agentic: each positive domain -> SDOH node + ranked next best action
  const screeningNBAs = unmetDomains.flatMap(d => {
    const cat = DOMAIN_CATEGORY[d.id];
    const nba = cat ? nbaForCategory(activePatientId, cat, CBOS) : undefined;
    return nba ? [{ domain: d, nba }] : [];
  });
  const snGraphNodes = unmetDomains.length;
  const snGraphEdges = screeningNBAs.filter(x => x.nba.keystone).length;

  const handleResponse = (questionId: string, optionIdx: number) => {
    setResponses(prev => ({ ...prev, [questionId]: optionIdx }));
  };

  const allCurrentAnswered = currentDomain?.questions.every(q => responses[q.id] !== undefined) ?? false;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) setCurrentStep(s => s + 1);
    else handleSubmit();
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };

  // PRAPARE LOINC codes — all 13 domains
  const DOMAIN_LOINC: Record<string, string> = {
    housing:          '93030-5',
    food:             '93031-3',
    transportation:   '93034-7',
    safety:           '93039-7',
    financial:        '93033-9',
    employment:       '93032-1',
    support:          '93027-1',
    substance_use:    '93038-9',
    mental_health:    '93029-7',
    utility:          '93038-8',
    education:        '93039-6',
    physical_activity:'89555-7',
    disabilities:     '69858-9',
  };

  // Gravity Project Z-codes — ICD-10-CM for problem list (3 SDOH domains for VBC)
  const DOMAIN_ZCODE: Record<string, { code: string; display: string }> = {
    food:           { code: 'Z59.41',  display: 'Food insecurity' },
    housing:        { code: 'Z59.812', display: 'Housing instability' },
    transportation: { code: 'Z59.82',  display: 'Transportation insecurity' },
  };

  // POST active Condition (Z-code) to problem list for each VBC-mapped domain
  const postZCodeConditions = async (patientFhirId: string) => {
    const client = getFhirClient();
    const date = new Date().toISOString().split('T')[0];
    const vbcDomains = unmetDomains.filter(d => DOMAIN_ZCODE[d.id]);
    await Promise.allSettled(
      vbcDomains.map(d => {
        const zcode = DOMAIN_ZCODE[d.id];
        return client.create({
          resourceType: 'Condition',
          id: `${patientFhirId}-sdoh-${d.id}`,
          clinicalStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' }],
          },
          verificationStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
          },
          category: [
            { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] },
            { coding: [{ system: 'http://hl7.org/fhir/us/sdoh-clinicalcare/CodeSystem/SDOHCC-CodeSystemTemporaryCodes', code: 'sdoh-condition', display: 'SDOH Condition' }] },
          ],
          code: {
            coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: zcode.code, display: zcode.display }],
            text: zcode.display,
          },
          subject: { reference: `Patient/${patientFhirId}` },
          onsetDateTime: date,
          note: [{
            text: `SDOH gap identified via PRAPARE screening on ${date}. Domain: ${d.label}. Gravity Project Z-code: ${zcode.code}.`,
          }],
          extension: [{
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-domain',
            valueString: d.id,
          }, {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-status',
            valueString: 'open',
          }],
        } as Record<string, unknown>).catch((err: unknown) => {
          console.warn(`[SocialScreening] Failed to post Z-code Condition for ${d.id}:`, err);
        });
      })
    );
  };

  const postPrapareObservations = async (patientFhirId: string) => {
    const client = getFhirClient();
    const date = new Date().toISOString().split('T')[0];
    const postPromises = unmetDomains
      .filter((d) => DOMAIN_LOINC[d.id])
      .map((d) => {
        const loinc = DOMAIN_LOINC[d.id];
        const obs = {
          resourceType: 'Observation',
          status: 'final' as const,
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'social-history',
                  display: 'Social History',
                },
              ],
            },
          ],
          code: {
            coding: [{ system: 'http://loinc.org', code: loinc, display: d.label }],
            text: d.label,
          },
          subject: { reference: `Patient/${patientFhirId}` },
          effectiveDateTime: date,
          valueString: `${d.label} — unmet need identified via PRAPARE screening on ${date}`,
          note: [{ text: `PRAPARE screening. Domain: ${d.label}. Identified as unmet.` }],
        };
        return client.create(obs as Record<string, unknown>).catch((err: unknown) => {
          console.warn(`[SocialScreening] Failed to post PRAPARE obs for ${d.label}:`, err);
        });
      });
    await Promise.allSettled(postPromises);
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    if (!getFhirMockMode()) {
      const fhirId =
        PLATFORM_TO_FHIR_ID_MAP[activePatientId] ??
        (activePatientId.startsWith('patient-') ? activePatientId : null);
      if (fhirId) {
        try {
          await postPrapareObservations(fhirId);
          // POST Z-code Conditions to problem list for VBC-mapped domains
          await postZCodeConditions(fhirId);

          // ── POST QuestionnaireResponse for full PRAPARE instrument ────────
          const client = getFhirClient();
          const qrDate = new Date().toISOString();
          client.create({
            resourceType: 'QuestionnaireResponse',
            questionnaire: 'http://loinc.org/q/93025-5',  // PRAPARE questionnaire
            status: 'completed',
            subject: { reference: `Patient/${fhirId}` },
            authored: qrDate,
            author: { display: 'TCOC Social Screening' },
            item: FINDHELP_DOMAINS.flatMap((domain) =>
              domain.questions.map((q) => ({
                linkId: q.id,
                text: q.text,
                answer: responses[q.id] !== undefined
                  ? [{ valueString: q.options[responses[q.id]] ?? '' }]
                  : [],
              }))
            ),
          } as Record<string, unknown>)
            .then(() => console.info(`[QuestionnaireResponse] PRAPARE QR posted for ${fhirId}`))
            .catch((err: unknown) => console.warn('[QuestionnaireResponse] POST failed:', err));

          // POST AuditEvent for the screening save
          client.create({
            resourceType: 'AuditEvent',
            type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest', display: 'RESTful Operation' },
            subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'create', display: 'create' }],
            action: 'C',
            recorded: new Date().toISOString(),
            outcome: '0',
            agent: [{ who: { display: 'TCOC Social Screening' }, requestor: true }],
            source: { observer: { display: 'TCOC-Platform' } },
            entity: [
              { what: { reference: `Patient/${fhirId}` }, type: { code: '1', display: 'Person' } },
              { what: { display: 'PRAPARE Social Screening' }, type: { code: '4', display: 'Other' },
                detail: [{ type: 'domains-screened', valueBase64Binary: btoa(unmetDomains.map(d => d.label).join(', ')) }] },
            ],
          } as Record<string, unknown>).catch(() => {/* ignore */});
        } catch (err) {
          console.warn('[SocialScreening] FHIR PRAPARE post failed (local only):', err);
        }
      }
    }
  };

  const riskColor = (level: string) =>
    level === 'High' ? '#da1e28' : level === 'Medium' ? '#b45309' : '#198038';

  const getQuestionScore = (q: Question): number => {
    const resp = responses[q.id];
    if (resp === undefined) return 2;
    const maxIdx = q.options.length - 1;
    return maxIdx > 0 ? Math.round((1 - resp / maxIdx) * 4) : 2;
  };

  return (
    <AppLayout
      pageTitle="Social Needs Screening"
      breadcrumbs={[
        { label: 'Whole Person Care', href: '/social-needs-screening' },
        { label: 'Social Needs Screening' },
      ]}
    >
      {/* Maria context banner */}
      {isMaria && (
        <div className="bg-[#d0e2ff] border border-[#97c1ff] px-4 py-2.5 mb-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-2xs font-bold">MR</span>
            </div>
            <span className="text-xs font-semibold text-[#001d6c]">Maria Redhawk · Bennett County · PRAPARE Results</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap ml-auto">
            <span className="text-2xs px-2 py-0.5 bg-[#fff1f1] text-[#da1e28] font-bold">Transportation HIGH</span>
            <span className="text-2xs px-2 py-0.5 bg-[#fff1f1] text-[#da1e28] font-bold">Childcare HIGH</span>
            <span className="text-2xs px-2 py-0.5 bg-[#fdf6dd] text-[#b45309] font-bold">Food MODERATE</span>
            <span className="text-2xs px-2 py-0.5 bg-[#fff1f1] text-[#da1e28] font-bold">Economic Fragility HIGH</span>
            <span className="text-2xs px-2 py-0.5 bg-[#fff1f1] text-[#da1e28] font-bold">Mental Health HIGH</span>
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Screened This Month', value: '247', sub: '68% of due panel', color: '#0043ce' },
          { label: 'Unmet Needs Identified', value: '89', sub: 'Across 3 domains', color: '#da1e28' },
          { label: 'Social Tasks Created', value: '76', sub: 'From screening results', color: '#6929c4' },
          { label: 'Overdue for Screening', value: '34', sub: '>12 months since last', color: '#b45309' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-carbon-gray-20 p-4">
            <p className="font-mono text-xl font-bold leading-tight" style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-xs font-semibold text-carbon-gray-100">{kpi.label}</p>
            <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(['list', 'screen', 'history'] as ScreeningView[]).map(v => (
          <button key={v} onClick={() => { setView(v); setSubmitted(false); setCurrentStep(0); setResponses({}); }}
            className={`px-4 py-2 text-xs font-semibold border transition-colors ${view === v ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}>
            {v === 'list' ? 'Patient Queue' : v === 'screen' ? 'Conduct Screening' : 'Screening History'}
          </button>
        ))}
      </div>

      {/* ── Patient Queue ── */}
      {view === 'list' && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20">
            <p className="text-sm font-semibold text-carbon-gray-100">Patients Due for Social Needs Screening</p>
            <div className="relative">
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-carbon-gray-50" />
              <input type="text" placeholder="Search patient..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-carbon-gray-20 bg-carbon-gray-10 focus:outline-none focus:border-[#0043ce] w-48" />
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                {['Patient', 'MRN', 'Patient ID', 'PCP', 'Last Screened', 'Risk Level', 'Open Needs', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map(p => (
                <tr key={p.id} className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors">
                  <td className="px-4 py-3 font-medium text-carbon-gray-100">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-carbon-gray-50">{p.mrn}</td>
                  <td className="px-4 py-3 font-mono text-carbon-gray-50">{p.patientId}</td>
                  <td className="px-4 py-3 text-carbon-gray-70">{p.pcp}</td>
                  <td className="px-4 py-3">
                    {p.lastScreened ? <span className="text-carbon-gray-70">{p.lastScreened}</span> : <span className="text-[#da1e28] font-semibold">Never screened</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-2xs font-bold text-white" style={{ backgroundColor: riskColor(p.riskLevel) }}>{p.riskLevel}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.unmetNeeds > 0 ? <span className="font-mono font-bold text-[#da1e28]">{p.unmetNeeds}</span> : <span className="text-carbon-gray-50">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => {
                      // Switch the active patient in AppContext so FHIR writes go to the right patient
                      setActivePatientId(p.patientId);
                      // For the screening form, use SOCIAL_PATIENTS shape (has legacy fields)
                      const sp = SOCIAL_PATIENTS.find(s => s.patientId === p.patientId || s.name === p.name);
                      setSelectedPatient(sp ?? null);
                      setView('screen'); setResponses({}); setSubmitted(false); setCurrentStep(0);
                    }}
                      className="px-3 py-1 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#0035a8] transition-colors">
                      Screen Now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Check-in & Screening (findhelp 13-domain instrument) ── */}
      {view === 'screen' && !submitted && (
        <div className="space-y-4">
          {/* Patient + Provider selector */}
          <div className="bg-white border border-carbon-gray-20 p-4 flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide font-semibold">Patient</p>
              <p className="text-sm font-semibold text-carbon-gray-100">{selectedPatient?.name ?? 'Select a patient from the queue'}</p>
              {selectedPatient && <p className="text-2xs text-carbon-gray-50 font-mono">{selectedPatient.mrn} · {selectedPatient.patientId}</p>}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-2xs text-carbon-gray-50 font-semibold uppercase tracking-wide">Instrument Source:</span>
              <div className="flex border border-carbon-gray-20 overflow-hidden">
                {(['findhelp', 'uniteus'] as Provider[]).map(p => (
                  <button key={p} onClick={() => setProvider(p)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${provider === p ? 'bg-[#0043ce] text-white' : 'bg-white text-carbon-gray-70 hover:bg-carbon-gray-10'}`}>
                    {p === 'findhelp' ? 'findhelp' : 'Unite Us'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Instrument panel */}
          <div className="bg-white border border-carbon-gray-20">
            {/* Header */}
            <div className="px-6 pt-5 pb-3 border-b border-carbon-gray-20 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-carbon-gray-100">Check-in &amp; Screening</p>
                <p className="text-xs text-carbon-gray-50 mt-0.5">STEP {currentStep + 1} of {totalSteps}</p>
              </div>
              <button onClick={() => { setView('list'); setCurrentStep(0); setResponses({}); }}
                className="px-3 py-1.5 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
                Exit Check-in
              </button>
            </div>

            {/* Domain tab strip */}
            <div className="flex overflow-x-auto border-b border-carbon-gray-20 px-4">
              {FINDHELP_DOMAINS.map((d, i) => {
                const isAnswered = d.questions.every(q => responses[q.id] !== undefined);
                const hasRisk = d.questions.some(q => {
                  const r = responses[q.id];
                  return r !== undefined && q.riskOptions.includes(r);
                });
                return (
                  <button key={d.id} onClick={() => setCurrentStep(i)}
                    className={`flex-shrink-0 px-3 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      currentStep === i
                        ? 'border-[#0043ce] text-[#0043ce] bg-[#edf5ff]'
                        : isAnswered
                          ? hasRisk ? 'border-[#da1e28] text-[#da1e28]' : 'border-[#24a148] text-[#198038]'
                          : 'border-transparent text-carbon-gray-70 hover:text-carbon-gray-100'
                    }`}>
                    <span>{d.emoji}</span>
                    {d.label}
                  </button>
                );
              })}
            </div>

            {/* Questions */}
            <div className="px-6 py-5 space-y-8">
              {currentDomain?.questions.map(q => {
                const resp = responses[q.id];
                const score = getQuestionScore(q);
                return (
                  <div key={q.id}>
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-medium text-carbon-gray-100 flex-1">{q.text}</p>
                      <EmojiScale value={resp !== undefined ? score : undefined} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {q.options.map((opt, oi) => {
                        const isRisk = q.riskOptions.includes(oi);
                        const isSelected = resp === oi;
                        return (
                          <label key={oi} className="flex items-center gap-2.5 cursor-pointer group">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected ? (isRisk ? 'border-[#da1e28] bg-[#da1e28]' : 'border-[#0043ce] bg-[#0043ce]') : 'border-carbon-gray-30 group-hover:border-carbon-gray-70'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <input type="radio" name={q.id} value={oi} checked={isSelected}
                              onChange={() => handleResponse(q.id, oi)} className="sr-only" />
                            <span className={`text-xs ${isSelected ? (isRisk ? 'text-[#da1e28] font-semibold' : 'text-[#0043ce] font-semibold') : 'text-carbon-gray-70'}`}>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                    {resp !== undefined && q.riskOptions.includes(resp) && (
                      <div className="mt-2 flex items-center gap-1.5 text-2xs text-[#da1e28] font-semibold">
                        <Icon name="ExclamationTriangleIcon" size={12} />
                        Unmet need identified — social task will be created
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-carbon-gray-20">
              <button onClick={handlePrev} disabled={currentStep === 0}
                className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Previous
              </button>
              <button onClick={handleNext}
                className="px-4 py-2 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors">
                {currentStep === totalSteps - 1 ? 'Submit Screening' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Recommendations (post-screening) ── */}
      {view === 'screen' && submitted && (
        <div className="space-y-6">
          {dueCitizens.length > 0 && (
            <div className="bg-[#fdf6dd] border border-[#f1c21b] px-4 py-3 flex items-center gap-3 flex-wrap">
              <Icon name="ClockIcon" size={15} className="text-[#b45309]" />
              <span className="text-xs font-semibold text-[#8a3e07]">{dueCitizens.length} citizen{dueCitizens.length !== 1 ? 's' : ''} due for annual PRAPARE screening</span>
              <span className="text-2xs text-[#8a3e07]">no current screening on record (&gt;12 months) — next best action is to screen</span>
              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                {dueCitizens.slice(0, 4).map(c => (
                  <button key={c.platformId} onClick={() => { setActivePatientId(c.platformId); setSubmitted(false); setCurrentStep(0); setResponses(prefillFromNeeds(c.platformId)); }} className="px-2.5 py-1 text-2xs font-semibold bg-[#b45309] text-white hover:bg-[#8a3e07]">Screen {c.name.split(' ')[0]} <span className="opacity-70">({screeningStatus(c.platformId)})</span></button>
                ))}
              </div>
            </div>
          )}
          {/* Header */}
          <div className="bg-white border border-carbon-gray-20 p-5">
            <h2 className="text-lg font-semibold text-[#0043ce] mb-1">Service Recommendations</h2>
            <p className="text-xs text-carbon-gray-70">
              Based on your screening, here are services that can help with your needs. Click on a category below to see relevant services in your area.
            </p>
            {unmetDomains.length === 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-[#0e6027] font-semibold">
                <Icon name="CheckCircleIcon" size={16} />
                No unmet needs identified. Screening results saved to patient record.
              </div>
            )}
          </div>

          {/* Agentic insight from this screening */}
          {screeningNBAs.length > 0 && (
            <div className="bg-white border border-[#97c1ff]">
              <div className="px-5 py-3 bg-[#edf5ff] border-b border-carbon-gray-20 flex items-center gap-2 flex-wrap">
                <Icon name="SparklesIcon" size={15} className="text-[#0043ce]" />
                <p className="text-sm font-semibold text-[#0043ce]">Agentic insight from this screening</p>
                <span className="text-2xs text-carbon-gray-50">{snGraphNodes} need{snGraphNodes !== 1 ? 's' : ''} detected · {screeningNBAs.length} actionable referral{screeningNBAs.length !== 1 ? 's' : ''} · {snGraphEdges} keystone</span>
                <button onClick={() => setReferModal(screeningNBAs.map(x => ({ action: x.nba.action, cboName: x.nba.cbo.name, keystone: x.nba.keystone, category: x.nba.need.category })))} className="ml-auto px-3 py-1.5 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#002d9c]">Send {screeningNBAs.length} to caseload</button>
              </div>
              <div className="divide-y divide-carbon-gray-20">
                {screeningNBAs.map(({ domain, nba }) => (
                  <div key={domain.id} className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{domain.emoji}</span>
                      <span className="text-xs font-semibold text-carbon-gray-100">{nba.action}</span>
                      {nba.keystone && <span className="text-2xs font-bold px-1 py-0.5 bg-[#fff1f1] text-[#da1e28]">KEYSTONE</span>}
                      <span className={`text-2xs font-semibold px-1.5 py-0.5 ${nba.confidence === 'High' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}>{nba.confidence}</span>
                    </div>
                    <p className="text-2xs text-carbon-gray-70 mt-0.5">{nba.impact} · via {nba.cbo.name} ({nba.cbo.capacity}, {nba.cbo.avgDaysToClose}d)</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-2xs text-carbon-gray-50">
                      <span className="inline-flex items-center gap-1 text-[#6929c4]"><Icon name="CpuChipIcon" size={11} /> {nba.agent}</span>
                      <span className="font-mono text-[#0e6027] break-all">{nba.need.cypher}</span>
                    </div>
                    <button onClick={() => setReferModal([{ action: nba.action, cboName: nba.cbo.name, keystone: nba.keystone, category: nba.need.category }])} className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#002d9c]"><Icon name="BoltIcon" size={10} /> Act</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {referModal && (
            <ScreeningReferralModal items={referModal} citizenName={getPatientSync(activePatientId)?.name ?? 'Citizen'} onConfirm={confirmReferrals} onClose={() => setReferModal(null)} />
          )}

          {/* Domain filter pills */}
          {unmetDomains.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unmetDomains.map(d => (
                <button key={d.id} onClick={() => setActiveDomain(activeDomain === d.id ? null : d.id)}
                  className={`px-3 py-1.5 text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                    activeDomain === d.id ? 'text-white border-transparent' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                  style={activeDomain === d.id ? { backgroundColor: d.color, borderColor: d.color } : {}}>
                  <span>{d.emoji}</span>{d.label}
                </button>
              ))}
            </div>
          )}

          {/* Recommendations per domain */}
          {(activeDomain ? unmetDomains.filter(d => d.id === activeDomain) : unmetDomains).map(domain => {
            const recs = MO_RECOMMENDATIONS[domain.id] ?? [];
            const pg = recPage[domain.id] ?? 1;
            const perPage = 5;
            const totalPg = Math.max(1, Math.ceil(recs.length / perPage));
            const paginated = recs.slice((pg - 1) * perPage, pg * perPage);
            return (
              <div key={domain.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-carbon-gray-100">Search Results</p>
                  <p className="text-2xs text-carbon-gray-50">Showing {(pg - 1) * perPage + 1}–{Math.min(pg * perPage, recs.length)} of {recs.length} items</p>
                </div>
                <div className="flex gap-4">
                  {/* Cards */}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {paginated.map((rec, i) => (
                        <div key={i} className="bg-white border border-carbon-gray-20 p-4">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-[#1a56db] text-white text-2xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{(pg - 1) * perPage + i + 1}</span>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <p className="text-xs font-semibold text-carbon-gray-100">{rec.name}</p>
                                {rec.connected && <span className="text-2xs font-bold text-[#0e6027] bg-[#defbe6] px-1.5 py-0.5">✓ Connected</span>}
                              </div>
                              <p className="text-2xs text-[#0043ce] font-medium">{rec.org}</p>
                            </div>
                          </div>
                          <div className="space-y-0.5 text-2xs text-carbon-gray-70 mb-3">
                            <p className="flex items-center gap-1"><Icon name="PhoneIcon" size={10} />{rec.phone}</p>
                            <p className="flex items-center gap-1"><Icon name="MapPinIcon" size={10} />{rec.address}, {rec.city}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <button className="text-2xs text-[#0043ce] hover:underline">Show Details</button>
                            <button onClick={() => setSendNeedsModal({ orgName: rec.org, domain: domain.label })}
                              className="px-2.5 py-1 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors flex items-center gap-1">
                              Get Results <Icon name="ChevronDownIcon" size={10} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Pagination */}
                    <div className="flex items-center justify-between bg-white border border-carbon-gray-20 px-4 py-2 text-2xs text-carbon-gray-70">
                      <span>Items per page: <strong>5</strong></span>
                      <div className="flex items-center gap-2">
                        <span>{(pg - 1) * perPage + 1}–{Math.min(pg * perPage, recs.length)} of {recs.length} items</span>
                        <select value={pg} onChange={e => setRecPage(prev => ({ ...prev, [domain.id]: Number(e.target.value) }))}
                          className="border border-carbon-gray-20 px-1 py-0.5 text-2xs">
                          {Array.from({ length: totalPg }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                        </select>
                        <span>of {totalPg} pages</span>
                        <button onClick={() => setRecPage(prev => ({ ...prev, [domain.id]: Math.max(1, pg - 1) }))} disabled={pg === 1} className="p-0.5 disabled:opacity-40"><Icon name="ChevronLeftIcon" size={12} /></button>
                        <button onClick={() => setRecPage(prev => ({ ...prev, [domain.id]: Math.min(totalPg, pg + 1) }))} disabled={pg === totalPg} className="p-0.5 disabled:opacity-40"><Icon name="ChevronRightIcon" size={12} /></button>
                      </div>
                    </div>
                  </div>
                  {/* Mini map */}
                  <div className="w-72 flex-shrink-0">
                    <RecommendationsMap count={paginated.length} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Footer CTAs */}
          <div className="space-y-3">
            <div className="bg-white border border-carbon-gray-20 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-carbon-gray-100">Don&apos;t see what you need?</p>
                <p className="text-2xs text-carbon-gray-50">Search our full Service Directory for more options.</p>
              </div>
              <a href="/cbo-directory" className="px-3 py-1.5 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
                Go to Service Directory
              </a>
            </div>
            <div className="bg-white border border-carbon-gray-20 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-carbon-gray-100">Feel like you need more help?</p>
                <p className="text-2xs text-carbon-gray-50">Find a Neighborhood Navigation Center near you to speak with a Navigator at your convenience.</p>
              </div>
              <button onClick={() => setSendNeedsModal({ orgName: 'Navigation Center', domain: 'General' })}
                className="px-3 py-1.5 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
                Send Results
              </button>
            </div>
          </div>

          <div className="text-center">
            <button onClick={() => { setSubmitted(false); setCurrentStep(0); setResponses({}); setActiveDomain(null); }}
              className="px-6 py-2.5 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors">
              Start New Screening
            </button>
          </div>
        </div>
      )}

      {/* ── Screening History ── */}
      {view === 'history' && (
        <div className="space-y-4">
          {/* Live FHIR screenings for active patient */}
          {!getFhirMockMode() && (
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
                <p className="text-sm font-semibold text-carbon-gray-100">FHIR Screening Records</p>
                {fhirScreeningLoading && <span className="text-2xs text-carbon-gray-50 animate-pulse">Loading from FHIR…</span>}
                {!fhirScreeningLoading && fhirScreenings.length > 0 && (
                  <span className="text-2xs font-bold px-1.5 py-0.5 bg-[#defbe6] text-[#198038]">Live FHIR · {fhirScreenings.length} session{fhirScreenings.length !== 1 ? 's' : ''}</span>
                )}
                <span className="ml-auto text-2xs text-carbon-gray-50 font-mono">{getPatientSync(activePatientId)?.name ?? activePatientId}</span>
              </div>
              {fhirScreenings.length === 0 && !fhirScreeningLoading ? (
                <p className="px-4 py-6 text-xs text-carbon-gray-50 italic">No SDOH Observations found in FHIR for this patient. Submit a screening to create records.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                      {['Date', 'Domains Identified', 'Count', 'Source'].map(h => (
                        <th key={h} className="px-4 py-2.5 font-semibold text-carbon-gray-70 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fhirScreenings.map(fs => (
                      <tr key={fs.id} className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors">
                        <td className="px-4 py-3 font-mono text-carbon-gray-70">{fs.date}</td>
                        <td className="px-4 py-3 text-carbon-gray-70">{fs.domains.join(', ')}</td>
                        <td className="px-4 py-3 font-mono font-bold text-[#da1e28]">{fs.domains.length}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 text-2xs font-bold bg-[#defbe6] text-[#0e6027]">Live FHIR</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {/* Mock / static history */}
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
              <p className="text-sm font-semibold text-carbon-gray-100">Screening History</p>
              <span className="text-2xs font-bold px-1.5 py-0.5 bg-[#fff8e1] text-[#8a3800] border border-[#f1c21b]">Mock Data</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  {['Patient', 'Patient ID', 'Date', 'Instrument', 'Screener', 'Unmet Needs', 'Tasks Created', 'Status'].map(h => (
                    <th key={h} className={`px-4 py-2.5 font-semibold text-carbon-gray-70 ${h === 'Unmet Needs' || h === 'Tasks Created' ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCREENING_HISTORY.map(sh => {
                  const patient = SOCIAL_PATIENTS.find(p => p.patientId === sh.patientId);
                  return (
                    <tr key={sh.id} className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors">
                      <td className="px-4 py-3 font-medium text-carbon-gray-100">{patient?.name ?? sh.patientId}</td>
                      <td className="px-4 py-3 font-mono text-carbon-gray-50">{sh.patientId}</td>
                      <td className="px-4 py-3 font-mono text-carbon-gray-70">{sh.date}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 text-2xs font-bold bg-[#f6f2ff] text-[#6929c4]">{sh.instrument}</span></td>
                      <td className="px-4 py-3 text-carbon-gray-70">{sh.screener}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-[#da1e28]">{sh.unmetNeeds}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-[#6929c4]">{sh.tasksCreated}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 text-2xs font-bold bg-[#defbe6] text-[#0e6027]">{sh.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sendNeedsModal && (
        <SendNeedsModal orgName={sendNeedsModal.orgName} domain={sendNeedsModal.domain} onClose={() => setSendNeedsModal(null)} />
      )}
    </AppLayout>
  );
}
