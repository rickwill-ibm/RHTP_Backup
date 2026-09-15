import { getMember, type MemberFunction } from './members';

export type SignalDomain = 'Clinical' | 'BH' | 'Social' | 'Administrative';
export type TriageTier = 'Do Now' | 'This Week' | 'Routine';
export type SignalSource = 'ADT' | 'Task' | 'Transition' | 'BH' | 'Social' | 'Admin';

export interface TriagedItem {
  id: string;
  domain: SignalDomain;
  signalType: string;
  patientName: string;
  patientId?: string;
  summary: string;
  whyNow: string;
  nextAction: string;
  ownerFunction: MemberFunction;
  ownerName: string;
  tier: TriageTier;
  producedBy: string;
  source: SignalSource;
  isNew?: boolean;
}

const DOMAIN_OWNER: Record<SignalDomain, string> = {
  Clinical: 'cm-sarah-johnson',
  BH: 'cm-lisa-fontaine',
  Social: 'chw-angela-torres',
  Administrative: 'cm-sarah-johnson',
};

function ownerFor(domain: SignalDomain): { fn: MemberFunction; name: string } {
  const m = getMember(DOMAIN_OWNER[domain]);
  return { fn: m?.function ?? 'CaseManager', name: m?.name ?? '—' };
}

const O = {
  Clinical: ownerFor('Clinical'),
  BH: ownerFor('BH'),
  Social: ownerFor('Social'),
  Administrative: ownerFor('Administrative'),
};

export interface AdtInput {
  id: string;
  patientId?: string;
  patientName: string;
  eventType: 'Admission' | 'Discharge' | 'Transfer';
  toSetting: string;
  facility: string;
  isNew: boolean;
  actionRequired: string;
}
export interface TaskInput {
  id: string;
  patientId?: string;
  patient: string;
  task: string;
  due: string;
  priority: 'High' | 'Medium' | 'Low';
}
export interface TransitionInput {
  patientId: string;
  patientName?: string;
  currentSetting: string;
  status: string;
  expectedDischarge: string | null;
  nextSetting: string | null;
}

function priorityToTier(p: 'High' | 'Medium' | 'Low'): TriageTier {
  return p === 'High' ? 'Do Now' : p === 'Medium' ? 'This Week' : 'Routine';
}

function taskDomain(text: string): SignalDomain {
  const t = text.toLowerCase();
  if (/snap|wic|liheap|housing|transport|nemt|food|childcare|benefit|cbo|utility/.test(t))
    return 'Social';
  if (/phq|bh|depression|counsel|behavioral|psych/.test(t)) return 'BH';
  if (/consent|eligib|redetermination|authorization|attribution/.test(t)) return 'Administrative';
  return 'Clinical';
}

const INJECTED: TriagedItem[] = [
  {
    id: 'sig-bh-1',
    domain: 'BH',
    signalType: 'BH Follow-up Window',
    patientName: 'James Wilson',
    patientId: 'pt-001',
    summary: 'FUH 7-day follow-up after psychiatric inpatient discharge',
    whyNow: 'Window closes in 2 days — measure + relapse risk',
    nextAction: 'Schedule 7-day BH follow-up visit',
    tier: 'Do Now',
    source: 'BH',
    producedBy: 'BH Follow-up Sentinel',
    ownerFunction: O.BH.fn,
    ownerName: O.BH.name,
    isNew: true,
  },
  {
    id: 'sig-soc-1',
    domain: 'Social',
    signalType: 'Benefit Lapse',
    patientName: 'Maria Redhawk',
    patientId: 'pt-maria',
    summary: 'SNAP lapses in 5 days; WIC already expired',
    whyNow: 'Food access gap blocks appointment adherence',
    nextAction: 'Submit SNAP renewal + WIC re-enrollment',
    tier: 'This Week',
    source: 'Social',
    producedBy: 'SDOH Navigator',
    ownerFunction: O.Social.fn,
    ownerName: O.Social.name,
    isNew: true,
  },
  {
    id: 'sig-soc-2',
    domain: 'Social',
    signalType: 'Transport Breakdown',
    patientName: 'Maria Redhawk',
    patientId: 'pt-maria',
    summary: 'NEMT no-show — overdue A1C appointment at risk',
    whyNow: 'Keystone barrier: unblocks 2 overdue clinical gaps',
    nextAction: 'Re-book NEMT and confirm childcare',
    tier: 'Do Now',
    source: 'Social',
    producedBy: 'SDOH Navigator',
    ownerFunction: O.Social.fn,
    ownerName: O.Social.name,
  },
  {
    id: 'sig-adm-1',
    domain: 'Administrative',
    signalType: 'Consent Expiry',
    patientName: 'Dorothy Simmons',
    patientId: 'pt-003',
    summary: 'Cross-org data share blocked — consent expired',
    whyNow: 'Blocks care-team coordination right now',
    nextAction: 'Re-capture consent to unblock coordination',
    tier: 'Do Now',
    source: 'Admin',
    producedBy: 'Consent Enforcer',
    ownerFunction: O.Administrative.fn,
    ownerName: O.Administrative.name,
    isNew: true,
  },
  {
    id: 'sig-adm-2',
    domain: 'Administrative',
    signalType: 'Eligibility Lapse',
    patientName: 'James Wilson',
    summary: 'Medicaid redetermination due in 10 days',
    whyNow: 'Coverage gap risk if not filed',
    nextAction: 'Initiate Medicaid redetermination',
    tier: 'This Week',
    source: 'Admin',
    producedBy: 'Eligibility Intelligence',
    ownerFunction: O.Administrative.fn,
    ownerName: O.Administrative.name,
  },
];

export function buildTriageQueue(inputs: {
  adt: AdtInput[];
  tasks: TaskInput[];
  transitions: TransitionInput[];
}): TriagedItem[] {
  const items: TriagedItem[] = [];

  for (const a of inputs.adt) {
    const tier: TriageTier = a.isNew || a.eventType !== 'Discharge' ? 'Do Now' : 'This Week';
    const o = ownerFor('Clinical');
    items.push({
      id: `adt-${a.id}`,
      domain: 'Clinical',
      signalType: `ADT ${a.eventType}`,
      patientName: a.patientName,
      patientId: a.patientId,
      summary: `${a.eventType} → ${a.toSetting} · ${a.facility}`,
      whyNow:
        a.eventType === 'Transfer'
          ? 'Care handoff window'
          : a.eventType === 'Admission'
            ? 'New admission — care plan review'
            : 'Post-discharge follow-up window',
      nextAction: a.actionRequired,
      tier,
      source: 'ADT',
      producedBy: 'ADT Watcher',
      ownerFunction: o.fn,
      ownerName: o.name,
      isNew: a.isNew,
    });
  }

  for (const t of inputs.tasks) {
    const domain = taskDomain(t.task);
    const o = ownerFor(domain);
    const agent =
      domain === 'Social'
        ? 'SDOH Navigator'
        : domain === 'BH'
          ? 'BH Follow-up Sentinel'
          : domain === 'Administrative'
            ? 'Eligibility Intelligence'
            : 'CareGap Sentinel';
    items.push({
      id: `task-${t.id}`,
      domain,
      signalType: 'Open Task',
      patientName: t.patient,
      patientId: t.patientId,
      summary: t.task,
      whyNow: `Due ${t.due}`,
      nextAction: t.task,
      tier: priorityToTier(t.priority),
      source: 'Task',
      producedBy: agent,
      ownerFunction: o.fn,
      ownerName: o.name,
    });
  }

  for (const tr of inputs.transitions) {
    if (tr.status !== 'Pending Discharge') continue;
    const o = ownerFor('Clinical');
    items.push({
      id: `trans-${tr.patientId}`,
      domain: 'Clinical',
      signalType: 'Care Transition',
      patientName: tr.patientName ?? tr.patientId,
      patientId: tr.patientId,
      summary: `${tr.currentSetting} → ${tr.nextSetting ?? 'TBD'} · discharge ${tr.expectedDischarge ?? 'pending'}`,
      whyNow: 'Discharge handoff to arrange',
      nextAction: `Coordinate ${tr.nextSetting ?? 'post-acute'} handoff`,
      tier: 'This Week',
      source: 'Transition',
      producedBy: 'Referral Orchestrator',
      ownerFunction: o.fn,
      ownerName: o.name,
    });
  }

  return [...items, ...INJECTED];
}

export const TIER_ORDER: TriageTier[] = ['Do Now', 'This Week', 'Routine'];

export const DOMAIN_STYLE: Record<SignalDomain, { bg: string; text: string }> = {
  Clinical: { bg: 'bg-[#d0e2ff]', text: 'text-[#0043ce]' },
  BH: { bg: 'bg-[#f6f2ff]', text: 'text-[#6929c4]' },
  Social: { bg: 'bg-[#d9fbfb]', text: 'text-[#007d79]' },
  Administrative: { bg: 'bg-[#fdf6dd]', text: 'text-[#b45309]' },
};
