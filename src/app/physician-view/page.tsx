'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useAppContext } from '@/lib/appContext';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';
import { toast } from 'sonner';

type TeamNBA = {
  id: string;
  type: 'sprint' | 'coverage' | 'rebalance';
  title: string;
  whyNow: string;
  detail: string;
  impact: string;
  owner: string;
  agent: string;
  confidence: 'High' | 'Medium';
  tone: 'balance' | 'perf' | 'cov';
  targetName: string;
  link?: string;
};

type MemberRole = 'Clinical PCP' | 'BH Counselor' | 'CHW Supervisor' | 'Specialist';

interface CareTeamMemberData {
  id: string;
  name: string;
  npi: string;
  role: MemberRole;
  specialty: string;
  credential: string;
  status: 'Active' | 'Inactive';
  attributedPatients: number;
  gapClosure: number;
  qualityScore: number;
  gainShare: string;
  gainShareNum: number;
  pmpmCost: number;
  pmpmTarget: number;
  openGaps: number;
  closedGaps: number;
  activeEpisodes: number;
  closedEpisodes: number;
  episodeTypes: string[];
  practicePeerAvg: number;
  regionalAvg: number;
  stateTarget: number;
  vspeers: number;
  vsRegional: number;
  vsState: number;
  // Whole-person metrics
  screeningRate?: number;
  bhAccessRate?: number;
  homeVisits?: number;
  enrollmentRate?: number;
}

const ROLE_CONFIG: Record<
  MemberRole,
  { color: string; bg: string; border: string; icon: string; description: string }
> = {
  'Clinical PCP': {
    color: '#0043ce',
    bg: '#d0e2ff',
    border: '#97c1ff',
    icon: '🩺',
    description: 'Primary care physicians — clinical gap closure & quality',
  },
  'BH Counselor': {
    color: '#9f1853',
    bg: '#ffd6e8',
    border: '#ffafd2',
    icon: '🧠',
    description: 'Behavioral health counselors — BH access, FUH/FUM, SUD measures',
  },
  'CHW Supervisor': {
    color: '#198038',
    bg: '#defbe6',
    border: '#a7f0ba',
    icon: '🤝',
    description: 'Community health worker supervisors — social screening, home visits, enrollment',
  },
  Specialist: {
    color: '#6929c4',
    bg: '#f6f2ff',
    border: '#d4bbff',
    icon: '🔬',
    description: 'Specialist care team members — referral completion, specialist quality',
  },
};

const MEMBERS_BY_PROVIDER: Record<string, CareTeamMemberData[]> = {
  'prov-001': [
    {
      id: 'ctm-001',
      name: 'Dr. Sarah Okonkwo',
      npi: '1234567890',
      role: 'Clinical PCP',
      specialty: 'Family Medicine',
      credential: 'MD, FAAFP',
      status: 'Active',
      attributedPatients: 842,
      gapClosure: 74,
      qualityScore: 81,
      gainShare: '$28.4K',
      gainShareNum: 28400,
      pmpmCost: 408,
      pmpmTarget: 430,
      openGaps: 62,
      closedGaps: 178,
      activeEpisodes: 8,
      closedEpisodes: 31,
      episodeTypes: ['Chronic', 'Preventive'],
      practicePeerAvg: 71,
      regionalAvg: 68,
      stateTarget: 75,
      vspeers: 3,
      vsRegional: 6,
      vsState: -1,
      screeningRate: 72,
    },
    {
      id: 'ctm-002',
      name: 'Dr. Robert Chen',
      npi: '1234567891',
      role: 'Clinical PCP',
      specialty: 'Internal Medicine',
      credential: 'DO',
      status: 'Active',
      attributedPatients: 710,
      gapClosure: 69,
      qualityScore: 76,
      gainShare: '$21.2K',
      gainShareNum: 21200,
      pmpmCost: 418,
      pmpmTarget: 430,
      openGaps: 88,
      closedGaps: 196,
      activeEpisodes: 11,
      closedEpisodes: 28,
      episodeTypes: ['Chronic', 'Acute'],
      practicePeerAvg: 71,
      regionalAvg: 68,
      stateTarget: 75,
      vspeers: -2,
      vsRegional: 1,
      vsState: -6,
      screeningRate: 61,
    },
    {
      id: 'ctm-003',
      name: 'Dr. Linda Castillo',
      npi: '1234567892',
      role: 'Clinical PCP',
      specialty: 'Family Medicine',
      credential: 'MD',
      status: 'Active',
      attributedPatients: 634,
      gapClosure: 78,
      qualityScore: 85,
      gainShare: '$24.8K',
      gainShareNum: 24800,
      pmpmCost: 394,
      pmpmTarget: 430,
      openGaps: 41,
      closedGaps: 148,
      activeEpisodes: 6,
      closedEpisodes: 22,
      episodeTypes: ['Preventive', 'Chronic'],
      practicePeerAvg: 71,
      regionalAvg: 68,
      stateTarget: 75,
      vspeers: 7,
      vsRegional: 10,
      vsState: 3,
      screeningRate: 79,
    },
    {
      id: 'ctm-bh-001',
      name: 'Keisha Morales, LCSW',
      npi: '2234567890',
      role: 'BH Counselor',
      specialty: 'Behavioral Health',
      credential: 'LCSW, CADC',
      status: 'Active',
      attributedPatients: 284,
      gapClosure: 68,
      qualityScore: 74,
      gainShare: '$9.2K',
      gainShareNum: 9200,
      pmpmCost: 298,
      pmpmTarget: 320,
      openGaps: 34,
      closedGaps: 72,
      activeEpisodes: 14,
      closedEpisodes: 38,
      episodeTypes: ['BH Acute', 'SUD'],
      practicePeerAvg: 65,
      regionalAvg: 62,
      stateTarget: 70,
      vspeers: 3,
      vsRegional: 6,
      vsState: -2,
      bhAccessRate: 74,
      screeningRate: 88,
    },
    {
      id: 'ctm-chw-001',
      name: 'Marcus Johnson, CHW',
      npi: '3234567890',
      role: 'CHW Supervisor',
      specialty: 'Community Health',
      credential: 'CHW, CHS',
      status: 'Active',
      attributedPatients: 198,
      gapClosure: 0,
      qualityScore: 0,
      gainShare: '$6.1K',
      gainShareNum: 6100,
      pmpmCost: 0,
      pmpmTarget: 0,
      openGaps: 0,
      closedGaps: 0,
      activeEpisodes: 0,
      closedEpisodes: 0,
      episodeTypes: [],
      practicePeerAvg: 0,
      regionalAvg: 0,
      stateTarget: 0,
      vspeers: 0,
      vsRegional: 0,
      vsState: 0,
      homeVisits: 142,
      enrollmentRate: 76,
      screeningRate: 91,
    },
  ],
  'prov-002': [
    {
      id: 'ctm-004',
      name: 'Dr. Priya Nair',
      npi: '1234567894',
      role: 'Clinical PCP',
      specialty: 'Hospitalist',
      credential: 'MD',
      status: 'Active',
      attributedPatients: 1240,
      gapClosure: 62,
      qualityScore: 70,
      gainShare: '$44.1K',
      gainShareNum: 44100,
      pmpmCost: 558,
      pmpmTarget: 510,
      openGaps: 284,
      closedGaps: 462,
      activeEpisodes: 22,
      closedEpisodes: 68,
      episodeTypes: ['Acute', 'Chronic'],
      practicePeerAvg: 64,
      regionalAvg: 64,
      stateTarget: 75,
      vspeers: -2,
      vsRegional: -2,
      vsState: -13,
      screeningRate: 48,
    },
    {
      id: 'ctm-005',
      name: 'Dr. Thomas Brandt',
      npi: '1234567895',
      role: 'Clinical PCP',
      specialty: 'Internal Medicine',
      credential: 'MD, FACP',
      status: 'Active',
      attributedPatients: 980,
      gapClosure: 67,
      qualityScore: 74,
      gainShare: '$38.8K',
      gainShareNum: 38800,
      pmpmCost: 534,
      pmpmTarget: 510,
      openGaps: 196,
      closedGaps: 396,
      activeEpisodes: 18,
      closedEpisodes: 54,
      episodeTypes: ['Chronic', 'Acute'],
      practicePeerAvg: 64,
      regionalAvg: 64,
      stateTarget: 75,
      vspeers: 3,
      vsRegional: 3,
      vsState: -8,
      screeningRate: 55,
    },
    {
      id: 'ctm-bh-002',
      name: 'Dr. Amara Diallo, PsyD',
      npi: '2234567891',
      role: 'BH Counselor',
      specialty: 'Psychology',
      credential: 'PsyD, BCBA',
      status: 'Active',
      attributedPatients: 312,
      gapClosure: 71,
      qualityScore: 78,
      gainShare: '$11.4K',
      gainShareNum: 11400,
      pmpmCost: 312,
      pmpmTarget: 340,
      openGaps: 28,
      closedGaps: 84,
      activeEpisodes: 18,
      closedEpisodes: 44,
      episodeTypes: ['BH Chronic', 'SUD'],
      practicePeerAvg: 65,
      regionalAvg: 62,
      stateTarget: 70,
      vspeers: 6,
      vsRegional: 9,
      vsState: 1,
      bhAccessRate: 79,
      screeningRate: 84,
    },
    {
      id: 'ctm-chw-002',
      name: 'Rosa Gutierrez, CHW',
      npi: '3234567891',
      role: 'CHW Supervisor',
      specialty: 'Community Health',
      credential: 'CHW',
      status: 'Active',
      attributedPatients: 224,
      gapClosure: 0,
      qualityScore: 0,
      gainShare: '$7.8K',
      gainShareNum: 7800,
      pmpmCost: 0,
      pmpmTarget: 0,
      openGaps: 0,
      closedGaps: 0,
      activeEpisodes: 0,
      closedEpisodes: 0,
      episodeTypes: [],
      practicePeerAvg: 0,
      regionalAvg: 0,
      stateTarget: 0,
      vspeers: 0,
      vsRegional: 0,
      vsState: 0,
      homeVisits: 168,
      enrollmentRate: 69,
      screeningRate: 86,
    },
  ],
  'prov-003': [
    {
      id: 'ctm-006',
      name: 'Dr. Angela Torres',
      npi: '1234567896',
      role: 'Clinical PCP',
      specialty: 'Family Medicine',
      credential: 'MD',
      status: 'Active',
      attributedPatients: 620,
      gapClosure: 80,
      qualityScore: 87,
      gainShare: '$22.4K',
      gainShareNum: 22400,
      pmpmCost: 381,
      pmpmTarget: 420,
      openGaps: 38,
      closedGaps: 152,
      activeEpisodes: 5,
      closedEpisodes: 19,
      episodeTypes: ['Preventive', 'Chronic'],
      practicePeerAvg: 78,
      regionalAvg: 68,
      stateTarget: 75,
      vspeers: 2,
      vsRegional: 12,
      vsState: 5,
      screeningRate: 82,
    },
    {
      id: 'ctm-007',
      name: 'Dr. Kevin Marsh',
      npi: '1234567897',
      role: 'Clinical PCP',
      specialty: 'Family Medicine',
      credential: 'DO',
      status: 'Active',
      attributedPatients: 540,
      gapClosure: 76,
      qualityScore: 82,
      gainShare: '$18.9K',
      gainShareNum: 18900,
      pmpmCost: 396,
      pmpmTarget: 420,
      openGaps: 52,
      closedGaps: 166,
      activeEpisodes: 7,
      closedEpisodes: 24,
      episodeTypes: ['Chronic', 'Preventive'],
      practicePeerAvg: 78,
      regionalAvg: 68,
      stateTarget: 75,
      vspeers: -2,
      vsRegional: 8,
      vsState: 1,
      screeningRate: 74,
    },
    {
      id: 'ctm-chw-003',
      name: 'Darnell Washington, CHW',
      npi: '3234567892',
      role: 'CHW Supervisor',
      specialty: 'Community Health',
      credential: 'CHW, CHS',
      status: 'Active',
      attributedPatients: 176,
      gapClosure: 0,
      qualityScore: 0,
      gainShare: '$5.4K',
      gainShareNum: 5400,
      pmpmCost: 0,
      pmpmTarget: 0,
      openGaps: 0,
      closedGaps: 0,
      activeEpisodes: 0,
      closedEpisodes: 0,
      episodeTypes: [],
      practicePeerAvg: 0,
      regionalAvg: 0,
      stateTarget: 0,
      vspeers: 0,
      vsRegional: 0,
      vsState: 0,
      homeVisits: 118,
      enrollmentRate: 81,
      screeningRate: 93,
    },
  ],
};

const DEFAULT_MEMBERS: CareTeamMemberData[] = [
  {
    id: 'ctm-default-1',
    name: 'Dr. Robert Chen',
    npi: '1234567898',
    role: 'Clinical PCP',
    specialty: 'Family Medicine',
    credential: 'MD',
    status: 'Active',
    attributedPatients: 580,
    gapClosure: 71,
    qualityScore: 78,
    gainShare: '$19.8K',
    gainShareNum: 19800,
    pmpmCost: 415,
    pmpmTarget: 430,
    openGaps: 72,
    closedGaps: 178,
    activeEpisodes: 9,
    closedEpisodes: 34,
    episodeTypes: ['Chronic', 'Preventive'],
    practicePeerAvg: 70,
    regionalAvg: 68,
    stateTarget: 75,
    vspeers: 1,
    vsRegional: 3,
    vsState: -4,
    screeningRate: 66,
  },
  {
    id: 'ctm-default-bh',
    name: 'Yolanda Pierce, LMFT',
    npi: '2234567898',
    role: 'BH Counselor',
    specialty: 'Behavioral Health',
    credential: 'LMFT',
    status: 'Active',
    attributedPatients: 198,
    gapClosure: 64,
    qualityScore: 71,
    gainShare: '$7.2K',
    gainShareNum: 7200,
    pmpmCost: 288,
    pmpmTarget: 320,
    openGaps: 22,
    closedGaps: 58,
    activeEpisodes: 11,
    closedEpisodes: 28,
    episodeTypes: ['BH Acute', 'BH Chronic'],
    practicePeerAvg: 65,
    regionalAvg: 62,
    stateTarget: 70,
    vspeers: -1,
    vsRegional: 2,
    vsState: -6,
    bhAccessRate: 68,
    screeningRate: 81,
  },
  {
    id: 'ctm-default-chw',
    name: 'Tamika Brown, CHW',
    npi: '3234567898',
    role: 'CHW Supervisor',
    specialty: 'Community Health',
    credential: 'CHW',
    status: 'Active',
    attributedPatients: 142,
    gapClosure: 0,
    qualityScore: 0,
    gainShare: '$4.8K',
    gainShareNum: 4800,
    pmpmCost: 0,
    pmpmTarget: 0,
    openGaps: 0,
    closedGaps: 0,
    activeEpisodes: 0,
    closedEpisodes: 0,
    episodeTypes: [],
    practicePeerAvg: 0,
    regionalAvg: 0,
    stateTarget: 0,
    vspeers: 0,
    vsRegional: 0,
    vsState: 0,
    homeVisits: 98,
    enrollmentRate: 72,
    screeningRate: 87,
  },
];

const EPISODE_COLORS: Record<string, string> = {
  Chronic: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
  Acute: 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]',
  Specialist: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
  Preventive: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
  'BH Acute': 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]',
  'BH Chronic': 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  SUD: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
  Crisis: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
};

function FourWayBenchmark({
  value,
  peers,
  regional,
  state,
  label,
}: {
  value: number;
  peers: number;
  regional: number;
  state: number;
  label: string;
}) {
  const max = Math.max(value, peers, regional, state, 100);
  const bars = [
    { name: 'This Member', val: value, color: '#0043ce' },
    { name: 'Practice Peers', val: peers, color: '#6929c4' },
    { name: 'Regional Avg', val: regional, color: '#b45309' },
    { name: 'Program Target', val: state, color: '#24a148' },
  ];
  return (
    <div className="space-y-2">
      <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">{label}</p>
      {bars.map((b) => (
        <div key={b.name} className="flex items-center gap-2">
          <span className="text-2xs text-carbon-gray-50 w-24 flex-shrink-0">{b.name}</span>
          <div className="flex-1 h-2 bg-carbon-gray-20">
            <div
              className="h-full transition-all"
              style={{ width: `${(b.val / max) * 100}%`, backgroundColor: b.color }}
            />
          </div>
          <span
            className="text-xs font-mono font-semibold w-10 flex-shrink-0"
            style={{ color: b.color }}
          >
            {b.val}%
          </span>
        </div>
      ))}
    </div>
  );
}

function CareTeamMembersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addOpsTask, opsTasks } = useAppContext();
  const [opsModal, setOpsModal] = useState<TeamNBA | null>(null);
  const [fhirPractitionerCount, setFhirPractitionerCount] = useState<number | null>(null);
  const fhirLoadedRef = useRef(false);

  // Live FHIR: verify practitioners are present in HAPI on mount
  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    getFhirClient()
      .search('Practitioner', { _count: 20, active: 'true' })
      .then((bundle: any) => {
        const count = (bundle?.entry ?? []).filter(
          (e: any) => e?.resource?.resourceType === 'Practitioner'
        ).length;
        if (count > 0) setFhirPractitionerCount(count);
      })
      .catch(() => {
        /* non-fatal */
      });
  }, []);
  const confirmOps = () => {
    if (!opsModal) return;
    const st =
      opsModal.type === 'sprint'
        ? 'scheduled'
        : opsModal.type === 'coverage'
          ? 'requested'
          : 'in-progress';
    addOpsTask({
      id: `ops-${opsModal.id}-${Date.now()}`,
      type: opsModal.type,
      title: opsModal.title,
      targetName: opsModal.targetName,
      detail: opsModal.detail,
      status: st as 'scheduled' | 'requested' | 'in-progress',
      createdAt: new Date().toISOString(),
    });
    toast.success(
      opsModal.type === 'sprint'
        ? 'Gap-closure sprint scheduled'
        : opsModal.type === 'coverage'
          ? 'Staffing request submitted'
          : 'Rebalance initiated',
      { description: opsModal.targetName }
    );
    const link = opsModal.link;
    if (opsModal.type === 'rebalance' && link) router.push(link);
    setOpsModal(null);
  };
  const providerId = searchParams.get('provider') || '';
  const providerName = searchParams.get('providerName') || 'Organization';
  const regionId = searchParams.get('region') || '';
  const regionName = searchParams.get('regionName') || '';

  const allMembers = MEMBERS_BY_PROVIDER[providerId] || DEFAULT_MEMBERS;

  // ── Team-level next best actions (operations: balance / performance / coverage) ──
  const TEAM_TARGET = 78;
  const ROLE_BENCHMARK: Record<string, number> = {
    'BH Counselor': 300,
    'CHW Supervisor': 250,
    Specialist: 400,
  };
  const byRole: Record<string, CareTeamMemberData[]> = {};
  allMembers.forEach((m) => {
    (byRole[m.role] ??= []).push(m);
  });
  const teamNBAs: TeamNBA[] = [];
  const pcps = (byRole['Clinical PCP'] ?? []).filter((m) => m.status === 'Active');
  if (pcps.length >= 2) {
    const sorted = [...pcps].sort((a, b) => b.attributedPatients - a.attributedPatients);
    const over = sorted[0],
      under = sorted[sorted.length - 1];
    const avg = Math.round(pcps.reduce((sum, m) => sum + m.attributedPatients, 0) / pcps.length);
    if (over.attributedPatients > avg * 1.25) {
      const move = Math.round((over.attributedPatients - avg) / 2);
      teamNBAs.push({
        id: 'bal',
        type: 'rebalance',
        title: `Rebalance panel — ${over.name}`,
        whyNow: `${over.attributedPatients.toLocaleString()} vs peer avg ${avg.toLocaleString()}`,
        detail: `Redistribute ~${move} attributed from ${over.name} toward ${under.name} (${under.attributedPatients.toLocaleString()}).`,
        impact: `~${move} panel slots freed`,
        owner: 'Network Ops',
        agent: 'Panel Balancer',
        confidence: 'High',
        tone: 'balance',
        targetName: over.name,
        link: '/care-manager?tab=dashboard',
      });
    }
  } else if (pcps.length === 1 && pcps[0].attributedPatients > 500) {
    teamNBAs.push({
      id: 'conc',
      type: 'coverage',
      title: `Panel concentration risk — ${pcps[0].name}`,
      whyNow: `single PCP carries ${pcps[0].attributedPatients.toLocaleString()} attributed`,
      detail: `Entire clinical panel rests on one PCP. Recruit or assign an additional PCP to reduce single-point dependency and coverage risk.`,
      impact: 'reduce single-point dependency',
      owner: 'Workforce Lead',
      agent: 'Workforce Orchestrator',
      confidence: 'High',
      tone: 'cov',
      targetName: pcps[0].name,
    });
  }
  const perf = allMembers
    .filter((m) => m.gapClosure > 0 && m.status === 'Active')
    .sort((a, b) => a.gapClosure - b.gapClosure)[0];
  if (perf && perf.gapClosure < TEAM_TARGET) {
    const delta = TEAM_TARGET - perf.gapClosure;
    const recoverable = Math.round((delta / 100) * perf.attributedPatients);
    teamNBAs.push({
      id: 'perf',
      type: 'sprint',
      title: `Gap-closure sprint — ${perf.name}`,
      whyNow: `${perf.gapClosure}% vs ${TEAM_TARGET}% target (${delta}pp behind)`,
      detail: `A targeted sprint could recover ~${recoverable} open gaps across the panel.`,
      impact: `~${recoverable} gaps recoverable`,
      owner: 'Quality Lead',
      agent: 'Network Performance Agent',
      confidence: delta >= 10 ? 'High' : 'Medium',
      tone: 'perf',
      targetName: perf.name,
    });
  }
  for (const [role, ms] of Object.entries(byRole)) {
    const bench = ROLE_BENCHMARK[role];
    if (!bench) continue;
    const act = ms.filter((m) => m.status === 'Active');
    if (act.length === 0) continue;
    const avg = Math.round(act.reduce((sum, m) => sum + m.attributedPatients, 0) / act.length);
    if (avg > bench) {
      teamNBAs.push({
        id: `cov-${role}`,
        type: 'coverage',
        title: `Coverage gap — ${role}`,
        whyNow: `~${avg.toLocaleString()} per ${role} vs ${bench.toLocaleString()} benchmark`,
        detail: `${act.length} ${role}${act.length !== 1 ? 's' : ''} carrying ~${avg.toLocaleString()} each — over the ${bench.toLocaleString()} benchmark. Add ${role} capacity for this organization.`,
        impact: `1:${avg.toLocaleString()} (benchmark 1:${bench.toLocaleString()})`,
        owner: 'Workforce Lead',
        agent: 'Workforce Orchestrator',
        confidence: 'Medium',
        tone: 'cov',
        targetName: role,
      });
    }
  }
  const [roleFilter, setRoleFilter] = useState<MemberRole | 'All'>('All');
  const [selectedMember, setSelectedMember] = useState<CareTeamMemberData | null>(null);

  const filtered =
    roleFilter === 'All' ? allMembers : allMembers.filter((m) => m.role === roleFilter);
  const roles: Array<MemberRole | 'All'> = [
    'All',
    'Clinical PCP',
    'BH Counselor',
    'CHW Supervisor',
    'Specialist',
  ];

  // Clear selectedMember when role filter changes so the benchmarking panel
  // always shows the first member in the newly-filtered list, not a stale pick.
  const prevRoleFilterRef = React.useRef(roleFilter);
  if (prevRoleFilterRef.current !== roleFilter) {
    prevRoleFilterRef.current = roleFilter;
    setSelectedMember(null);
  }

  const totalPatients = allMembers.reduce((a, m) => a + m.attributedPatients, 0);
  const clinicalMembers = allMembers.filter((m) => m.role === 'Clinical PCP');
  const bhMembers = allMembers.filter((m) => m.role === 'BH Counselor');
  const chwMembers = allMembers.filter((m) => m.role === 'CHW Supervisor');
  const avgGapClosure = clinicalMembers.length
    ? Math.round(clinicalMembers.reduce((a, m) => a + m.gapClosure, 0) / clinicalMembers.length)
    : 0;
  const totalGainShare = allMembers.reduce((a, m) => a + m.gainShareNum, 0);

  const breadcrumbs: { label: string; href?: string }[] = [
    { label: 'RHTP Overview', href: '/contract-program-selection' },
    { label: 'Regions', href: '/region-view' },
  ];
  if (regionName) {
    breadcrumbs.push({
      label: regionName,
      href: `/provider-level?region=${regionId}&regionName=${encodeURIComponent(regionName)}`,
    });
  }
  breadcrumbs.push({
    label: providerName,
    href: `/provider-level?region=${regionId}&regionName=${encodeURIComponent(regionName)}`,
  });
  breadcrumbs.push({ label: 'Care Team Members' });

  const handleDrillToPanel = (member: CareTeamMemberData) => {
    const params = new URLSearchParams({
      physician: member.id,
      physicianName: member.name,
      provider: providerId,
      providerName,
      region: regionId,
      regionName,
    });
    router.push(`/panel-cohort-view?${params.toString()}`);
  };

  // activeMember: prefer the explicitly selected one, else the first visible (filtered) member
  const activeMember = selectedMember ?? filtered[0] ?? allMembers[0];

  return (
    <AppLayout
      pageTitle={`${providerName} — Care Team Members`}
      breadcrumbs={breadcrumbs}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0043ce]">Organization: {providerName}</span>
          <span className="text-xs text-[#0043ce]">{allMembers.length} Care Team Members</span>
          <span className="text-xs text-[#0043ce]">
            {clinicalMembers.length} PCPs · {bhMembers.length} BH Counselors · {chwMembers.length}{' '}
            CHW Supervisors
          </span>
          {fhirPractitionerCount !== null && (
            <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
              FHIR R4 · {fhirPractitionerCount} practitioners verified
            </span>
          )}
          <span className="ml-auto text-xs text-carbon-gray-50">Data as of May 29, 2026</span>
        </div>
      }
    >
      {/* KPI strip */}
      <div className="bg-white border-b border-carbon-gray-20 grid grid-cols-4 divide-x divide-carbon-gray-20">
        {[
          {
            label: 'Attributed Lives',
            value: totalPatients.toLocaleString(),
            color: 'text-[#0043ce]',
          },
          {
            label: 'Clinical Gap Closure',
            value: `${avgGapClosure}%`,
            color:
              avgGapClosure >= 75
                ? 'text-[#24a148]'
                : avgGapClosure >= 65
                  ? 'text-[#b45309]'
                  : 'text-[#da1e28]',
          },
          { label: 'BH Counselors', value: bhMembers.length, color: 'text-[#9f1853]' },
          {
            label: 'Total Gain Share YTD',
            value: `$${(totalGainShare / 1000).toFixed(0)}K`,
            color: 'text-[#24a148]',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="px-6 py-4">
            <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">{kpi.label}</p>
            <p className={`text-2xl font-bold font-mono mt-0.5 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Benchmarking panel for selected member */}
        {activeMember.role === 'Clinical PCP' && (
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2 flex-wrap">
              <Icon name="ChartBarIcon" size={15} className="text-[#0043ce]" />
              <h3 className="text-sm font-semibold text-carbon-gray-100">Care Team Benchmarking</h3>
              <span className="text-2xs text-carbon-gray-50 ml-1">— {activeMember.name}</span>
              <span className="ml-auto text-2xs text-carbon-gray-50">
                This Member / Practice Peers / Regional Avg / Program Target
              </span>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-6">
              <FourWayBenchmark
                value={activeMember.gapClosure}
                peers={activeMember.practicePeerAvg}
                regional={activeMember.regionalAvg}
                state={activeMember.stateTarget}
                label="Gap Closure Rate"
              />
              <FourWayBenchmark
                value={activeMember.qualityScore}
                peers={Math.round(activeMember.practicePeerAvg * 1.08)}
                regional={Math.round(activeMember.regionalAvg * 1.06)}
                state={80}
                label="Quality Score"
              />
              <div className="space-y-3">
                <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Episode Summary
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-carbon-gray-10 px-3 py-2.5">
                    <p className="text-2xs text-carbon-gray-50">Active Episodes</p>
                    <p className="text-xl font-bold font-mono text-[#b45309]">
                      {activeMember.activeEpisodes}
                    </p>
                  </div>
                  <div className="bg-carbon-gray-10 px-3 py-2.5">
                    <p className="text-2xs text-carbon-gray-50">Closed Episodes</p>
                    <p className="text-xl font-bold font-mono text-[#24a148]">
                      {activeMember.closedEpisodes}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BH member metrics */}
        {activeMember.role === 'BH Counselor' && (
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="ChartBarIcon" size={15} style={{ color: '#9f1853' }} />
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                BH Counselor Metrics — {activeMember.name}
              </h3>
            </div>
            <div className="px-5 py-4 grid grid-cols-3 gap-6">
              <div className="space-y-2">
                <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  BH Access Rate
                </p>
                {[
                  { name: 'This Counselor', val: activeMember.bhAccessRate || 0, color: '#9f1853' },
                  { name: 'Program Target', val: 70, color: '#24a148' },
                ].map((b) => (
                  <div key={b.name} className="flex items-center gap-2">
                    <span className="text-2xs text-carbon-gray-50 w-28 flex-shrink-0">
                      {b.name}
                    </span>
                    <div className="flex-1 h-2 bg-carbon-gray-20">
                      <div
                        className="h-full"
                        style={{ width: `${b.val}%`, backgroundColor: b.color }}
                      />
                    </div>
                    <span
                      className="text-xs font-mono font-semibold w-10 flex-shrink-0"
                      style={{ color: b.color }}
                    >
                      {b.val}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Screening Rate
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-carbon-gray-20">
                    <div
                      className="h-full bg-[#6929c4]"
                      style={{ width: `${activeMember.screeningRate || 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-semibold text-[#6929c4]">
                    {activeMember.screeningRate}%
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-carbon-gray-10 px-3 py-2.5">
                  <p className="text-2xs text-carbon-gray-50">Active Episodes</p>
                  <p className="text-xl font-bold font-mono text-[#9f1853]">
                    {activeMember.activeEpisodes}
                  </p>
                </div>
                <div className="bg-carbon-gray-10 px-3 py-2.5">
                  <p className="text-2xs text-carbon-gray-50">Closed Episodes</p>
                  <p className="text-xl font-bold font-mono text-[#24a148]">
                    {activeMember.closedEpisodes}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CHW metrics */}
        {activeMember.role === 'CHW Supervisor' && (
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="ChartBarIcon" size={15} style={{ color: '#198038' }} />
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                CHW Supervisor Metrics — {activeMember.name}
              </h3>
            </div>
            <div className="px-5 py-4 grid grid-cols-3 gap-6">
              <div className="bg-carbon-gray-10 px-4 py-3 text-center">
                <p className="text-2xs text-carbon-gray-50">Home Visits (YTD)</p>
                <p className="text-2xl font-bold font-mono text-[#198038]">
                  {activeMember.homeVisits}
                </p>
              </div>
              <div className="bg-carbon-gray-10 px-4 py-3 text-center">
                <p className="text-2xs text-carbon-gray-50">Enrollment Rate</p>
                <p className="text-2xl font-bold font-mono text-[#0043ce]">
                  {activeMember.enrollmentRate}%
                </p>
              </div>
              <div className="bg-carbon-gray-10 px-4 py-3 text-center">
                <p className="text-2xs text-carbon-gray-50">Screening Rate</p>
                <p className="text-2xl font-bold font-mono text-[#6929c4]">
                  {activeMember.screeningRate}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Team Next Best Actions — operations (members & panels, not citizens) */}
        {teamNBAs.length > 0 && (
          <div className="bg-white border border-[#d4bbff]">
            <div className="px-4 py-2.5 bg-[#f6f2ff] border-b border-carbon-gray-20 flex items-center gap-2 flex-wrap">
              <Icon name="CpuChipIcon" size={15} className="text-[#6929c4]" />
              <p className="text-sm font-semibold text-[#6929c4]">
                Team Next Best Actions — {providerName}
              </p>
              <span className="text-2xs text-carbon-gray-50">
                panel &amp; performance operations · agent coalition
              </span>
            </div>
            <div className="divide-y divide-carbon-gray-20">
              {teamNBAs.map((n) => {
                const c =
                  n.tone === 'balance' ? '#0043ce' : n.tone === 'perf' ? '#b45309' : '#6929c4';
                const cta =
                  n.type === 'sprint'
                    ? 'Schedule sprint'
                    : n.type === 'coverage'
                      ? 'Request staffing'
                      : 'Rebalance';
                return (
                  <div key={n.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-carbon-gray-100">
                          {n.title}
                        </span>
                        <span
                          className="text-2xs font-bold px-1.5 py-0.5"
                          style={{ background: c + '20', color: c }}
                        >
                          {n.impact}
                        </span>
                        <span
                          className={`text-2xs font-semibold px-1.5 py-0.5 ${n.confidence === 'High' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
                        >
                          {n.confidence}
                        </span>
                      </div>
                      <p className="text-2xs text-carbon-gray-70 mt-0.5">{n.detail}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-2xs text-carbon-gray-50">
                        <span>
                          <span className="font-semibold text-carbon-gray-70">Why now:</span>{' '}
                          {n.whyNow}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Icon name="UserCircleIcon" size={10} /> {n.owner}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-[#6929c4]">
                          <Icon name="CpuChipIcon" size={10} /> {n.agent}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setOpsModal(n)}
                      className="px-2.5 py-1.5 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#002d9c] whitespace-nowrap flex-shrink-0 flex items-center gap-1"
                    >
                      <Icon name="BoltIcon" size={10} /> {cta}
                    </button>
                  </div>
                );
              })}
            </div>
            {opsTasks.length > 0 && (
              <div className="px-4 py-2.5 border-t border-carbon-gray-20 bg-carbon-gray-10">
                <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1">
                  Ops actions taken
                </p>
                {opsTasks.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="text-2xs text-carbon-gray-70 flex items-center gap-2 py-0.5"
                  >
                    <Icon name="CheckCircleIcon" size={10} className="text-[#0e6027]" />
                    <span className="font-medium">{t.title}</span>
                    <span className="text-carbon-gray-50">· {t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {opsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white w-full max-w-lg shadow-2xl">
              <div className="px-6 py-4 border-b border-carbon-gray-20 bg-[#f6f2ff] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="CpuChipIcon" size={15} className="text-[#6929c4]" />
                  <p className="text-sm font-semibold text-[#6929c4]">{opsModal.title}</p>
                </div>
                <button
                  onClick={() => setOpsModal(null)}
                  className="text-carbon-gray-50 hover:text-carbon-gray-100"
                >
                  <Icon name="XMarkIcon" size={18} />
                </button>
              </div>
              <div className="px-6 py-4 space-y-2 text-xs">
                <p className="text-carbon-gray-70">{opsModal.detail}</p>
                <div className="flex justify-between">
                  <span className="text-carbon-gray-50">Why now</span>
                  <span className="font-medium text-carbon-gray-100">{opsModal.whyNow}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-carbon-gray-50">Expected impact</span>
                  <span className="font-medium text-carbon-gray-100">{opsModal.impact}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-carbon-gray-50">Owner</span>
                  <span className="font-medium text-carbon-gray-100">{opsModal.owner}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-carbon-gray-50">Produced by</span>
                  <span className="font-medium text-[#6929c4]">{opsModal.agent}</span>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-carbon-gray-20 bg-carbon-gray-10 flex items-center justify-end gap-2">
                <button
                  onClick={() => setOpsModal(null)}
                  className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 bg-white hover:bg-carbon-gray-10"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmOps}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0043ce] hover:bg-[#002d9c]"
                >
                  <Icon name="CheckIcon" size={12} />{' '}
                  {opsModal.type === 'sprint'
                    ? 'Schedule sprint'
                    : opsModal.type === 'coverage'
                      ? 'Submit staffing request'
                      : 'Open caseload & log'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Role filter bar */}
        <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-2">
            Filter by Role
          </span>
          {roles.map((r) => {
            const cfg = r !== 'All' ? ROLE_CONFIG[r] : null;
            const isActive = roleFilter === r;
            return (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1 text-xs font-medium border transition-colors flex items-center gap-1.5`}
                style={
                  isActive && cfg
                    ? { backgroundColor: cfg.color, color: '#fff', borderColor: cfg.color }
                    : isActive
                      ? { backgroundColor: '#0043ce', color: '#fff', borderColor: '#0043ce' }
                      : { backgroundColor: '#fff', color: '#6f6f6f', borderColor: '#e0e0e0' }
                }
              >
                {cfg && <span>{cfg.icon}</span>}
                {r}
              </button>
            );
          })}
        </div>

        {/* Care team table */}
        <div className="bg-white border border-carbon-gray-20 overflow-x-auto">
          <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
            <p className="text-sm font-semibold text-carbon-gray-100">
              {filtered.length} Care Team Member{filtered.length !== 1 ? 's' : ''}
            </p>
            <p className="text-2xs text-carbon-gray-50">
              Click a row to view benchmarks · Click &quot;View Panel&quot; to drill to patients
            </p>
          </div>
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                {[
                  'Member',
                  'Role',
                  'Specialty',
                  'Patients',
                  'Primary Metric',
                  'vs Peers',
                  'vs Regional',
                  'vs Target',
                  'Gain Share',
                  'Status',
                  '',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {filtered.map((member) => {
                const isSelected = activeMember.id === member.id;
                const cfg = ROLE_CONFIG[member.role];
                const primaryMetric =
                  member.role === 'Clinical PCP'
                    ? `${member.gapClosure}% gap closure`
                    : member.role === 'BH Counselor'
                      ? `${member.bhAccessRate}% BH access`
                      : member.role === 'CHW Supervisor'
                        ? `${member.homeVisits} home visits`
                        : `${member.gapClosure}% gap closure`;
                const vsP = member.vspeers;
                const vsR = member.vsRegional;
                const vsS = member.vsState;
                return (
                  <tr
                    key={member.id}
                    className={`transition-colors cursor-pointer group ${isSelected ? 'bg-[#edf5ff]' : 'hover:bg-[#f4f4f4]'}`}
                    onClick={() => setSelectedMember(member)}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p
                          className={`font-medium whitespace-nowrap ${isSelected ? 'text-[#0043ce]' : 'text-carbon-gray-100 group-hover:text-[#0043ce]'}`}
                        >
                          {member.name}
                        </p>
                        <p className="text-2xs text-carbon-gray-50">
                          {member.credential} · NPI {member.npi}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-2xs font-semibold px-2 py-0.5 border whitespace-nowrap"
                        style={{
                          backgroundColor: cfg.bg,
                          color: cfg.color,
                          borderColor: cfg.border,
                        }}
                      >
                        {cfg.icon} {member.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-carbon-gray-70 whitespace-nowrap">
                        {member.specialty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm tabular-nums">
                        {member.attributedPatients.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-mono font-semibold"
                        style={{ color: cfg.color }}
                      >
                        {primaryMetric}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {member.role !== 'CHW Supervisor' ? (
                        <span
                          className={`text-xs font-mono font-semibold ${vsP >= 0 ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                        >
                          {vsP >= 0 ? '+' : ''}
                          {vsP}pp
                        </span>
                      ) : (
                        <span className="text-2xs text-carbon-gray-30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {member.role !== 'CHW Supervisor' ? (
                        <span
                          className={`text-xs font-mono font-semibold ${vsR >= 0 ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                        >
                          {vsR >= 0 ? '+' : ''}
                          {vsR}pp
                        </span>
                      ) : (
                        <span className="text-2xs text-carbon-gray-30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {member.role !== 'CHW Supervisor' ? (
                        <span
                          className={`text-xs font-mono font-semibold ${vsS >= 0 ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                        >
                          {vsS >= 0 ? '+' : ''}
                          {vsS}pp
                        </span>
                      ) : (
                        <span className="text-2xs text-carbon-gray-30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-[#24a148]">
                        {member.gainShare}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 ${member.status === 'Active' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fdf6dd] text-[#b45309]'}`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDrillToPanel(member);
                        }}
                        className="text-2xs font-semibold text-[#0043ce] hover:underline whitespace-nowrap flex items-center gap-1"
                      >
                        View Panel <Icon name="ArrowRightIcon" size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Gain-share attribution */}
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
            <Icon name="CurrencyDollarIcon" size={15} className="text-[#24a148]" />
            <h3 className="text-sm font-semibold text-carbon-gray-100">
              Gain-Share Attribution by Care Team Member
            </h3>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {allMembers.map((member) => {
              const pct = Math.round((member.gainShareNum / (totalGainShare || 1)) * 100);
              const cfg = ROLE_CONFIG[member.role];
              return (
                <div key={member.id} className="space-y-1.5">
                  <p className="text-2xs font-semibold text-carbon-gray-70 truncate">
                    {member.name.split(',')[0]}
                  </p>
                  <p className="text-2xs" style={{ color: cfg.color }}>
                    {cfg.icon} {member.role}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-carbon-gray-20">
                      <div
                        className="h-full"
                        style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                      />
                    </div>
                    <span
                      className="text-2xs font-mono font-semibold w-8 flex-shrink-0"
                      style={{ color: cfg.color }}
                    >
                      {pct}%
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-carbon-gray-100">{member.gainShare}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function CareTeamMembersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-carbon-gray-50 text-sm">
          Loading care team members...
        </div>
      }
    >
      <CareTeamMembersContent />
    </Suspense>
  );
}
