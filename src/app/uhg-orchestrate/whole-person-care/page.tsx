'use client';

import React, { useState, useEffect, useRef } from 'react';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import MariaStatusStrip from '@/uhg/components/shared/MariaStatusStrip';
import { useDemoStore } from '@/uhg/store/demoStore';
import { personaFor } from '@/uhg/data/persona';
import { contextFor } from '@/uhg/data/citizenContext';
import { getPatientById, placeholderMember } from '@/lib/patientRegistry';

interface SdohDomain {
  id: string;
  label: string;
  status: string;
  level: 'ELEVATED' | 'HIGH' | 'PROBABLE' | 'MODERATE' | 'LIMITED';
  score: number; // 0–100
  signals: string[];
  color: string;
  amplifies: string;
}

interface CarePlanMod {
  standard: string;
  sdohInformed: string;
  barrier: string;
  color: string;
}

function buildSdohDomains(
  reg: NonNullable<ReturnType<typeof getPatientById>>,
  ctx: ReturnType<typeof contextFor>,
  topGapName: string,
  caregiverSignal: string
): SdohDomain[] {
  // Maria Redhawk — authored verbatim (flagship)
  if (reg.platformId === 'MARIA_SD_001') {
    return [
      {
        id: 'financial',
        label: 'Financial Strain',
        status: 'ELEVATED',
        level: 'ELEVATED',
        score: 82,
        signals: ['2 unpaid claims >90d', 'Rx abandonment detected', 'Income tier: LOW-MODERATE'],
        color: '#fa4d56',
        amplifies: 'Prescription Abandonment',
      },
      {
        id: 'caregiver',
        label: 'Caregiver Burden',
        status: 'HIGH',
        level: 'HIGH',
        score: 88,
        signals: [
          caregiverSignal,
          'Portal engagement HIGH — digital lifeline',
          'Social support: LIMITED',
        ],
        color: '#c084fc',
        amplifies: 'Readmission Risk',
      },
      {
        id: 'transport',
        label: 'Transportation',
        status: 'BLOCKER',
        level: 'PROBABLE',
        score: 68,
        signals: [
          'Vehicle access: Unknown',
          'Transit score: LOW (suburban)',
          '2 missed appts in 12 months',
          `${topGapName} appointment: BLOCKED`,
        ],
        color: '#ef4444',
        amplifies: `${topGapName} Care Gap — BLOCKED`,
      },
      {
        id: 'food',
        label: 'Food Security',
        status: 'MODERATE',
        level: 'MODERATE',
        score: 55,
        signals: [
          'SNAP enrollment: None detected',
          'Food desert proximity: MODERATE',
          'Diabetes mgmt risk: HIGH',
        ],
        color: '#f59e0b',
        amplifies: `${topGapName} Care Gap`,
      },
      {
        id: 'isolation',
        label: 'Social Isolation',
        status: 'MODERATE',
        level: 'MODERATE',
        score: 52,
        signals: [
          'Caregiver role limits social time',
          'Portal = primary connection',
          'Community engagement: LOW',
        ],
        color: '#78a9ff',
        amplifies: 'Engagement Drop-off',
      },
    ];
  }

  type Lvl = SdohDomain['level'];
  const lvlColor: Record<Lvl, string> = {
    ELEVATED: '#fa4d56',
    HIGH: '#c084fc',
    PROBABLE: '#ef4444',
    MODERATE: '#f59e0b',
    LIMITED: '#78a9ff',
  };
  const mk = (
    id: string,
    label: string,
    level: Lvl,
    score: number,
    signals: string[],
    amplifies: string,
    status?: string
  ): SdohDomain => ({
    id,
    label,
    status: status ?? level,
    level,
    score,
    signals: signals.filter(Boolean),
    color: lvlColor[level],
    amplifies,
  });
  const D: SdohDomain[] = [];
  const has = (id: string) => D.some((d) => d.id === id);

  if (reg.bhRisk !== 'Low') {
    const lvl: Lvl = reg.bhRisk === 'Crisis' || reg.bhRisk === 'High' ? 'ELEVATED' : 'MODERATE';
    D.push(
      mk(
        'bh',
        'Behavioral Health',
        lvl,
        lvl === 'ELEVATED' ? 84 : 60,
        [reg.bhScoreLabel, reg.bhReferralStatus, `Screen: ${reg.bhScreeningLabel}`],
        'Engagement & Adherence'
      )
    );
  }
  if (ctx.household.caregiverFor.length) {
    D.push(
      mk(
        'caregiver',
        'Caregiver Burden',
        'HIGH',
        80,
        [caregiverSignal, 'Manages a dependent medication regimen', 'Social support: LIMITED'],
        'Readmission Risk'
      )
    );
  }
  const t = reg.transportStatus || '';
  if (/barrier|high|mile/i.test(t))
    D.push(
      mk(
        'transport',
        'Transportation',
        'PROBABLE',
        68,
        ['Vehicle access: limited', reg.ruralDistance || t, `${topGapName} appointment: BLOCKED`],
        `${topGapName} Care Gap — BLOCKED`,
        'BLOCKER'
      )
    );
  else if (/active|unite us|referral/i.test(t))
    D.push(
      mk(
        'transport',
        'Transportation',
        'LIMITED',
        32,
        [`NEMT active — ${t}`, 'Rides coordinated'],
        'Access — managed',
        'MANAGED'
      )
    );
  if (
    /expired|lapsed|not enrolled|waitlist/i.test(reg.snapStatus || '') ||
    /low income/i.test(reg.disparityFlag || '')
  )
    D.push(
      mk(
        'financial',
        'Financial Strain',
        'ELEVATED',
        76,
        [reg.snapStatus, reg.disparityFlag, 'Rx abandonment risk'],
        'Prescription Abandonment'
      )
    );
  if (/insecur|desert/i.test(reg.foodSecurity || ''))
    D.push(
      mk(
        'food',
        'Food Security',
        'MODERATE',
        55,
        [reg.foodSecurity, 'Food resource referral indicated'],
        `${topGapName} adherence`
      )
    );
  if (/waitlist|instab|unstable|assistance/i.test(reg.housingStatus || ''))
    D.push(
      mk(
        'housing',
        'Housing Instability',
        'MODERATE',
        50,
        [reg.housingStatus, 'Housing navigation indicated'],
        'Care continuity'
      )
    );
  if (
    /single|isolat|rural|seasonal/i.test(reg.cohortFlag || '') ||
    /rural/i.test(reg.disparityFlag || '')
  )
    D.push(
      mk(
        'isolation',
        'Social Isolation',
        'MODERATE',
        45,
        [reg.cohortFlag, reg.disparityFlag],
        'Engagement Drop-off'
      )
    );
  if (
    /asian|language|interpreter|mandarin|spanish/i.test(reg.disparityFlag || '') ||
    /interpreter/i.test(ctx.household.caregiverFor[0]?.consent || '')
  )
    D.push(
      mk(
        'language',
        'Language & Cultural Access',
        'MODERATE',
        42,
        [reg.disparityFlag, `Primary language: ${reg.language}`],
        'Care comprehension'
      )
    );

  // Social care gaps → domains (ties to the member's flagged barrier count)
  (reg.careGaps || [])
    .filter((g) => g.domain === 'Social' && g.status !== 'Closed')
    .forEach((g, i) => {
      const n = g.name.toLowerCase();
      let id = `social-${i}`;
      if (/transport/.test(n)) id = 'transport';
      else if (/food|snap|wic|nutrition/.test(n)) id = 'food';
      else if (/hous|liheap|utility/.test(n)) id = 'housing';
      else if (/financ|cost|subsid|copay|adherence/.test(n)) id = 'financial';
      if (!has(id))
        D.push(
          mk(
            id,
            g.name.replace(/ \(.*\)/, ''),
            'MODERATE',
            48,
            [g.name, `Assigned: ${g.assignedTo}`],
            'Care-plan adherence'
          )
        );
    });

  if (!D.length)
    D.push(
      mk(
        'screen',
        'Whole-Person Screen',
        'LIMITED',
        25,
        ['PRAPARE completed — low SDOH burden', 'No active barriers flagged'],
        'Routine monitoring'
      )
    );
  D.sort((a, b) => b.score - a.score);
  return D.slice(0, 6);
}

function buildCarePlanMods(
  reg: NonNullable<ReturnType<typeof getPatientById>>,
  topGapName: string,
  domains: SdohDomain[]
): CarePlanMod[] {
  if (reg.platformId === 'MARIA_SD_001') {
    return [
      {
        standard: 'Schedule clinic lab appointment',
        sdohInformed: 'Home lab kit ordered — eliminates transportation barrier',
        barrier: 'Transportation',
        color: '#f1c21b',
      },
      {
        standard: `"Your ${topGapName} is due. Please schedule."`,
        sdohInformed:
          'Brief caregiver-sensitive message — acknowledges complexity, offers home option',
        barrier: 'Caregiver Burden',
        color: '#c084fc',
      },
      {
        standard: 'Standard medication refill reminder',
        sdohInformed:
          'Preferred generic substitution flagged + manufacturer copay program identified',
        barrier: 'Financial Strain',
        color: '#fa4d56',
      },
      {
        standard: 'Clinic referral for diabetes nutrition',
        sdohInformed: 'Telehealth option added + 2 SNAP-eligible programs nearby flagged',
        barrier: 'Food Security',
        color: '#f59e0b',
      },
      {
        standard: 'Standard care gap outreach protocol',
        sdohInformed:
          'SDOH-aware sequencing: home kit → financial assist → food resource → follow-up',
        barrier: 'Multi-barrier',
        color: '#42be65',
      },
    ];
  }
  const modFor = (d: SdohDomain): { standard: string; sdohInformed: string } => {
    if (d.id === 'transport')
      return d.status === 'BLOCKER'
        ? {
            standard: 'Schedule clinic appointment',
            sdohInformed: 'Home lab kit or NEMT — eliminates the trip',
          }
        : {
            standard: 'Assume patient can attend',
            sdohInformed: 'Confirm active NEMT ride before each appointment',
          };
    if (d.id === 'caregiver')
      return {
        standard: `"Your ${topGapName} is due. Please schedule."`,
        sdohInformed: 'Brief caregiver-sensitive message — offers home option',
      };
    if (d.id === 'bh')
      return {
        standard: 'Standard BH referral letter mailed',
        sdohInformed: 'Warm handoff within 42 CFR Part 2 consent scope',
      };
    if (d.id === 'financial')
      return {
        standard: 'Standard medication refill reminder',
        sdohInformed: 'Generic substitution + manufacturer copay program',
      };
    if (d.id === 'food')
      return {
        standard: 'Nutrition clinic referral',
        sdohInformed: 'Telehealth option + SNAP/WIC programs flagged',
      };
    if (d.id === 'housing')
      return {
        standard: 'Standard discharge instructions',
        sdohInformed: 'Housing navigation + utility (LIHEAP) assistance',
      };
    if (d.id === 'isolation')
      return {
        standard: 'Standard outreach cadence',
        sdohInformed: 'Preferred-channel, community-linked outreach',
      };
    if (d.id === 'language')
      return {
        standard: 'English-only materials sent',
        sdohInformed: 'Interpreter + translated materials scheduled',
      };
    return {
      standard: `Standard ${d.label} protocol`,
      sdohInformed: `SDOH-informed ${d.label} intervention`,
    };
  };
  const mods: CarePlanMod[] = domains
    .slice(0, 4)
    .map((d) => ({ ...modFor(d), barrier: d.label, color: d.color }));
  mods.push({
    standard: 'Standard care gap outreach protocol',
    sdohInformed: 'SDOH-aware sequencing: keystone barrier → resource referral → follow-up',
    barrier: 'Multi-barrier',
    color: '#42be65',
  });
  return mods;
}

const LEVEL_CONFIG: Record<SdohDomain['level'], { color: string; bg: string; border: string }> = {
  ELEVATED: { color: '#fa4d56', bg: 'rgba(250,77,86,0.15)', border: 'rgba(250,77,86,0.5)' },
  HIGH: { color: '#c084fc', bg: 'rgba(192,132,252,0.15)', border: 'rgba(192,132,252,0.5)' },
  PROBABLE: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.5)' },
  MODERATE: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.5)' },
  LIMITED: { color: '#78a9ff', bg: 'rgba(120,169,255,0.15)', border: 'rgba(120,169,255,0.5)' },
};

export default function WholePersonCareScreen() {
  const setScreen = useDemoStore((s) => s.setScreen);
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const __persona = personaFor(activeCitizenId);
  const __ctx = contextFor(activeCitizenId);
  const __reg = getPatientById(activeCitizenId) ?? placeholderMember(activeCitizenId);
  const __topGapEntry =
    (__reg.careGaps || []).find((g) => g.domain === 'Clinical' && g.status !== 'Closed') ||
    __reg.careGaps?.[0];
  const topGapName = __topGapEntry ? __topGapEntry.name.replace(/ \(.*\)/, '') : 'Care gap';
  const caregiverSignal = __ctx.household.caregiverFor.length
    ? `${__ctx.household.caregiverFor[0].name}${__ctx.household.dependents[0] ? ' + ' + __ctx.household.dependents[0].name : ''} simultaneous care load`
    : 'Lives independently — low caregiver load';
  const SDOH_DOMAINS = buildSdohDomains(__reg, __ctx, topGapName, caregiverSignal);
  const CARE_PLAN_MODS = buildCarePlanMods(__reg, topGapName, SDOH_DOMAINS);
  const signalCount = SDOH_DOMAINS.reduce((acc, d) => acc + d.signals.length, 0);
  const [visibleDomains, setVisibleDomains] = useState(0);
  const [visibleMods, setVisibleMods] = useState(0);
  const [showAmplifies, setShowAmplifies] = useState(false);
  const [showConclusion, setShowConclusion] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>('financial');
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setScreen('whole-person-care');

    // Stagger domain reveals
    SDOH_DOMAINS.forEach((_, i) => {
      const t = setTimeout(() => setVisibleDomains(i + 1), 400 + i * 350);
      timerRefs.current.push(t);
    });

    const afterDomains = 400 + SDOH_DOMAINS.length * 350 + 300;

    const t1 = setTimeout(() => setShowAmplifies(true), afterDomains);
    CARE_PLAN_MODS.forEach((_, i) => {
      const t = setTimeout(() => setVisibleMods(i + 1), afterDomains + 400 + i * 300);
      timerRefs.current.push(t);
    });
    const t2 = setTimeout(
      () => setShowConclusion(true),
      afterDomains + 400 + CARE_PLAN_MODS.length * 300 + 400
    );

    timerRefs.current.push(t1, t2);
    return () => {
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
  }, [setScreen]);

  const activeDomain = SDOH_DOMAINS.find((d) => d.id === selectedDomain) ?? SDOH_DOMAINS[0];

  return (
    <ScreenLayout
      screenId="whole-person-care"
      showPhaseArc
      phaseArcState={{ foundation: true, orchestration: true, autonomous: false }}
      showMiniProfile
    >
      <div
        className="flex flex-col relative overflow-hidden"
        style={{ background: '#161616', minHeight: '100%' }}
      >
        <PresenterControls currentScreenId="whole-person-care" />

        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-8 py-3"
          style={{ borderBottom: '1px solid rgba(57,57,57,0.5)', background: '#1c1c1c' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="rounded px-3 py-1.5 flex items-center gap-2"
              style={{
                background: 'rgba(192,132,252,0.12)',
                border: '1px solid rgba(192,132,252,0.4)',
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  background: '#c084fc',
                  boxShadow: '0 0 8px rgba(192,132,252,0.7)',
                  animation: 'authPulse 2s ease-in-out infinite',
                }}
              />
              <span
                className="font-mono font-bold"
                style={{ fontSize: 11, color: '#c084fc', letterSpacing: '0.12em' }}
              >
                SDOH INTELLIGENCE ACTIVE
              </span>
            </div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 300,
                color: '#f4f4f4',
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              Whole Person Care Intelligence — {__persona.name}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="rounded px-3 py-1"
              style={{
                background: 'rgba(57,57,57,0.5)',
                border: '1px solid rgba(100,100,100,0.4)',
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: 10, color: '#8d8d8d', letterSpacing: '0.1em' }}
              >
                {SDOH_DOMAINS.length} DOMAINS · {signalCount} SIGNAL SOURCES
              </span>
            </div>
          </div>
        </div>

        <MariaStatusStrip
          state="active"
          authStatus="AUTH T-4 days"
          careGapStatus="HbA1c Gap 45d"
          visible
        />

        {/* Main layout — 3 columns */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT — SDOH Domain Profile */}
          <div
            className="flex flex-col overflow-hidden flex-shrink-0"
            style={{ width: 300, borderRight: '1px solid rgba(57,57,57,0.5)' }}
          >
            <div
              className="flex-shrink-0 px-5 py-3"
              style={{ borderBottom: '1px solid rgba(57,57,57,0.4)', background: '#1c1c1c' }}
            >
              <span
                className="font-mono uppercase"
                style={{ fontSize: 10, color: '#6f6f6f', letterSpacing: '0.12em' }}
              >
                SDOH Profile — {SDOH_DOMAINS.length} Domains
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {SDOH_DOMAINS.map((domain, i) => {
                const cfg = LEVEL_CONFIG[domain.level];
                const visible = visibleDomains > i;
                const isSelected = selectedDomain === domain.id;
                const isBlocker = domain.status === 'BLOCKER';
                return (
                  <button
                    key={domain.id}
                    onClick={() => setSelectedDomain(domain.id)}
                    className="rounded text-left transition-all duration-300"
                    style={{
                      background: isSelected ? `${domain.color}15` : 'rgba(28,28,28,0.8)',
                      border: `1.5px solid ${isSelected ? domain.color + '60' : isBlocker ? 'rgba(239,68,68,0.45)' : 'rgba(57,57,57,0.6)'}`,
                      padding: '12px 14px',
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateX(0)' : 'translateX(-12px)',
                      transition:
                        'opacity 0.4s ease, transform 0.4s ease, background 0.2s ease, border 0.2s ease',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isSelected ? domain.color : '#d4d4d4',
                        }}
                      >
                        {domain.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isBlocker && (
                          <div
                            className="rounded px-1.5 py-0.5"
                            style={{
                              background: 'rgba(239,68,68,0.2)',
                              border: '1px solid rgba(239,68,68,0.6)',
                            }}
                          >
                            <span
                              className="font-mono"
                              style={{
                                fontSize: 8,
                                color: '#ef4444',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                              }}
                            >
                              BLOCKER
                            </span>
                          </div>
                        )}
                        <div
                          className="rounded px-2 py-0.5"
                          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                        >
                          <span
                            className="font-mono"
                            style={{
                              fontSize: 9,
                              color: cfg.color,
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                            }}
                          >
                            {domain.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Bar */}
                    <div
                      style={{
                        height: 6,
                        background: 'rgba(57,57,57,0.6)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: visible ? `${domain.score}%` : '0%',
                          height: '100%',
                          background: domain.color,
                          borderRadius: 3,
                          transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                          transitionDelay: `${0.2 + i * 0.1}s`,
                          boxShadow: `0 0 6px ${domain.color}60`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span style={{ fontSize: 10, color: isBlocker ? '#ef4444' : '#6f6f6f' }}>
                        {isBlocker ? '⚠ BLOCKS → ' : 'AMPLIFIES → '}
                        {domain.amplifies}
                      </span>
                      <span
                        className="font-mono"
                        style={{ fontSize: 10, color: domain.color, fontWeight: 700 }}
                      >
                        {domain.score}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* AMPLIFIES summary */}
            {showAmplifies && (
              <div
                className="flex-shrink-0 p-4 fade-in"
                style={{
                  borderTop: '1px solid rgba(57,57,57,0.5)',
                  background: '#1c1c1c',
                  opacity: 0,
                }}
              >
                <span
                  className="font-mono uppercase"
                  style={{
                    fontSize: 9,
                    color: '#6f6f6f',
                    letterSpacing: '0.1em',
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  AMPLIFIES EDGES — CLINICAL IMPACT
                </span>
                {SDOH_DOMAINS.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 mb-1.5">
                    <div
                      className="rounded-full flex-shrink-0"
                      style={{ width: 6, height: 6, background: d.color }}
                    />
                    <span style={{ fontSize: 10, color: '#8d8d8d' }}>
                      <span style={{ color: d.color }}>{d.label}</span>
                      <span style={{ color: '#4a4a4a' }}> ──AMPLIFIES──► </span>
                      <span style={{ color: '#a3a3a3' }}>{d.amplifies}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CENTER — Domain Detail */}
          <div
            className="flex flex-col overflow-hidden flex-shrink-0"
            style={{ width: 320, borderRight: '1px solid rgba(57,57,57,0.5)' }}
          >
            <div
              className="flex-shrink-0 px-5 py-3"
              style={{ borderBottom: '1px solid rgba(57,57,57,0.4)', background: '#1c1c1c' }}
            >
              <span
                className="font-mono uppercase"
                style={{ fontSize: 10, color: '#6f6f6f', letterSpacing: '0.12em' }}
              >
                Domain Detail
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {/* Domain header */}
              <div
                className="rounded p-4"
                style={{
                  background: `${activeDomain.color}10`,
                  border: `1.5px solid ${activeDomain.color}40`,
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="rounded-full"
                    style={{
                      width: 12,
                      height: 12,
                      background: activeDomain.color,
                      boxShadow: `0 0 10px ${activeDomain.color}80`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 16, fontWeight: 700, color: activeDomain.color }}>
                    {activeDomain.label}
                  </span>
                  <div
                    className="rounded px-2 py-0.5 ml-auto"
                    style={{
                      background: LEVEL_CONFIG[activeDomain.level].bg,
                      border: `1px solid ${LEVEL_CONFIG[activeDomain.level].border}`,
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        color: LEVEL_CONFIG[activeDomain.level].color,
                        fontWeight: 700,
                      }}
                    >
                      {activeDomain.status}
                    </span>
                  </div>
                </div>

                {/* Score bar large */}
                <div
                  style={{
                    height: 10,
                    background: 'rgba(57,57,57,0.6)',
                    borderRadius: 5,
                    overflow: 'hidden',
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      width: `${activeDomain.score}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${activeDomain.color}80, ${activeDomain.color})`,
                      borderRadius: 5,
                      boxShadow: `0 0 10px ${activeDomain.color}60`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 10, color: '#6f6f6f' }}>Barrier intensity score</span>
                  <span
                    className="font-mono font-bold"
                    style={{ fontSize: 14, color: activeDomain.color }}
                  >
                    {activeDomain.score}/100
                  </span>
                </div>
              </div>

              {/* Signal sources */}
              <div>
                <span
                  className="font-mono uppercase"
                  style={{
                    fontSize: 9,
                    color: '#6f6f6f',
                    letterSpacing: '0.1em',
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  SIGNAL SOURCES
                </span>
                <div className="flex flex-col gap-2">
                  {activeDomain.signals.map((sig, i) => (
                    <div
                      key={i}
                      className="rounded px-3 py-2 flex items-start gap-2"
                      style={{
                        background: 'rgba(28,28,28,0.8)',
                        border: '1px solid rgba(57,57,57,0.5)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: activeDomain.color,
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        ›
                      </span>
                      <span style={{ fontSize: 12, color: '#c6c6c6', lineHeight: 1.45 }}>
                        {sig}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AMPLIFIES edge */}
              <div
                className="rounded p-3"
                style={{
                  background: 'rgba(28,28,28,0.8)',
                  border: `1px solid ${activeDomain.color}30`,
                }}
              >
                <span
                  className="font-mono uppercase"
                  style={{
                    fontSize: 9,
                    color: '#6f6f6f',
                    letterSpacing: '0.1em',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  AMPLIFIES EDGE
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="rounded px-2 py-1"
                    style={{
                      background: `${activeDomain.color}20`,
                      border: `1px solid ${activeDomain.color}50`,
                    }}
                  >
                    <span style={{ fontSize: 11, color: activeDomain.color, fontWeight: 600 }}>
                      {activeDomain.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: '#4a4a4a', fontFamily: 'monospace' }}>
                    ──AMPLIFIES──►
                  </span>
                  <div
                    className="rounded px-2 py-1"
                    style={{
                      background: 'rgba(250,77,86,0.15)',
                      border: '1px solid rgba(250,77,86,0.4)',
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#fa4d56', fontWeight: 600 }}>
                      {activeDomain.amplifies}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: '#8d8d8d', marginTop: 8, lineHeight: 1.5 }}>
                  This social barrier directly amplifies the clinical gap. Standard protocol ignores
                  this connection.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT — Care Plan Modifications */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div
              className="flex-shrink-0 px-5 py-3"
              style={{ borderBottom: '1px solid rgba(57,57,57,0.4)', background: '#1c1c1c' }}
            >
              <span
                className="font-mono uppercase"
                style={{ fontSize: 10, color: '#6f6f6f', letterSpacing: '0.12em' }}
              >
                Next-Best Action — Standard → SDOH-Informed
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 min-h-0">
              {CARE_PLAN_MODS.map((mod, i) => {
                const visible = visibleMods > i;
                return (
                  <div
                    key={i}
                    className="rounded overflow-hidden"
                    style={{
                      border: `1.5px solid ${mod.color}35`,
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateY(0)' : 'translateY(10px)',
                      transition: 'opacity 0.4s ease, transform 0.4s ease',
                    }}
                  >
                    {/* Barrier tag */}
                    <div
                      className="px-4 py-2 flex items-center gap-2"
                      style={{
                        background: `${mod.color}12`,
                        borderBottom: `1px solid ${mod.color}25`,
                      }}
                    >
                      <div
                        className="rounded-full"
                        style={{ width: 6, height: 6, background: mod.color, flexShrink: 0 }}
                      />
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 9,
                          color: mod.color,
                          letterSpacing: '0.1em',
                          fontWeight: 700,
                        }}
                      >
                        BARRIER: {mod.barrier.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      {/* Standard */}
                      <div className="p-4" style={{ borderRight: `1px solid ${mod.color}20` }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            style={{
                              fontSize: 9,
                              color: '#6b7280',
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                            }}
                          >
                            Standard Protocol
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span
                            style={{ fontSize: 13, color: '#6b7280', flexShrink: 0, marginTop: 1 }}
                          >
                            ✕
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: '#6b7280',
                              lineHeight: 1.5,
                              fontStyle: 'italic',
                            }}
                          >
                            {mod.standard}
                          </span>
                        </div>
                      </div>

                      {/* SDOH-Informed */}
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            style={{
                              fontSize: 9,
                              color: mod.color,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                            }}
                          >
                            NEXT-BEST ACTION
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span
                            style={{ fontSize: 13, color: mod.color, flexShrink: 0, marginTop: 1 }}
                          >
                            ►
                          </span>
                          <span style={{ fontSize: 12, color: '#d4d4d4', lineHeight: 1.5 }}>
                            {mod.sdohInformed}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Conclusion */}
              {showConclusion && (
                <div
                  className="rounded p-5 fade-in"
                  style={{
                    background: 'rgba(192,132,252,0.08)',
                    border: '2px solid rgba(192,132,252,0.45)',
                    boxShadow: '0 0 24px rgba(192,132,252,0.15)',
                    opacity: 0,
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="rounded-full"
                      style={{
                        width: 12,
                        height: 12,
                        background: '#c084fc',
                        boxShadow: '0 0 12px rgba(192,132,252,0.8)',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: 13, color: '#c084fc', letterSpacing: '0.1em' }}
                    >
                      WHOLE PERSON CARE — SYSTEM CONCLUSION
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      color: '#d4d4d4',
                      lineHeight: 1.65,
                      margin: 0,
                      fontStyle: 'italic',
                    }}
                  >
                    "The system doesn't just coordinate care. It coordinates care that will actually
                    work."
                  </p>
                  <div
                    className="flex items-center gap-6 mt-4 pt-4"
                    style={{ borderTop: '1px solid rgba(192,132,252,0.2)' }}
                  >
                    {[
                      {
                        label: 'Barriers identified',
                        value: String(SDOH_DOMAINS.length),
                        color: '#c084fc',
                      },
                      {
                        label: 'Interventions modified',
                        value: String(CARE_PLAN_MODS.length),
                        color: '#42be65',
                      },
                      { label: 'Signal sources', value: String(signalCount), color: '#78a9ff' },
                      {
                        label: 'AMPLIFIES edges',
                        value: String(SDOH_DOMAINS.length),
                        color: '#fa4d56',
                      },
                    ].map((stat) => (
                      <div key={stat.label} className="flex flex-col gap-0.5">
                        <span
                          className="font-mono font-bold"
                          style={{ fontSize: 22, color: stat.color, lineHeight: 1 }}
                        >
                          {stat.value}
                        </span>
                        <span style={{ fontSize: 10, color: '#6f6f6f' }}>{stat.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
}
