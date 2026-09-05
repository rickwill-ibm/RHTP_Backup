'use client';

import React, { useState, useEffect, useRef } from 'react';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import MariaStatusStrip from '@/uhg/components/shared/MariaStatusStrip';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientById, placeholderMember } from '@/lib/patientRegistry';
import { journeyForPatient } from '@/uhg/data/journeys';

// ─── Types ────────────────────────────────────────────────────────────────────

type DispositionDecision = 'ACT_NOW' | 'DELAY' | 'SUPPRESS' | 'PRIORITIZE' | 'SEQUENCE';

interface SignalEvaluation {
  id: string;
  signalType: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
  journeyContext: string;
  competingSignals: string;
  dependencyCheck: string;
  decision: DispositionDecision;
  decisionDetail: string;
  rationale: string[];
  color: string;
}

interface SequencingStep {
  id: string;
  step: number;
  action: string;
  reason: string;
  color: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function buildSignalEvaluations(
  firstName: string,
  org: string,
  topGapName: string,
  episode: string,
  day: number,
  contract: string,
  sdohSummary: string
): SignalEvaluation[] {
  return [
    {
      id: 'sig-auth',
      signalType: 'AUTH_EXPIRY',
      severity: 'HIGH',
      journeyContext: `${episode}, Day ${day}, auth window critical`,
      competingSignals: 'None blocking',
      dependencyCheck: `${org} eligibility — active but expiring`,
      decision: 'ACT_NOW',
      decisionDetail: 'ACT NOW — but sequence AFTER eligibility check',
      rationale: [
        'Auth renewal cannot finalize if eligibility lapses first',
        'Dependency creates sequencing obligation — not a blocker',
        'T-4 day window requires immediate initiation',
      ],
      color: '#f1c21b',
    },
    {
      id: 'sig-caregap',
      signalType: `CARE_GAP — ${topGapName}`,
      severity: 'HIGH',
      journeyContext: `${contract} quality window — care gap closure CRITICAL`,
      competingSignals: 'None blocking',
      dependencyCheck:
        'SDOH: Food security MODERATE · Transport barrier PROBABLE · Financial strain ELEVATED',
      decision: 'ACT_NOW',
      decisionDetail: 'ACT NOW — SDOH-modified intervention required',
      rationale: [
        'Standard "schedule lab appointment" will fail — transportation barrier PROBABLE',
        'Financial strain ELEVATED — standard Rx reminder risks abandonment',
        'SDOH-informed: Home lab kit + generic substitution + food resource referral',
      ],
      color: '#fa4d56',
    },
    {
      id: 'sig-behavioral',
      signalType: 'BEHAVIORAL — portal engagement',
      severity: 'MEDIUM',
      journeyContext: 'Elevated engagement = receptivity window',
      competingSignals: 'Elevates urgency of AUTH_EXPIRY + CARE_GAP',
      dependencyCheck: 'No dependency — contextual amplifier',
      decision: 'PRIORITIZE',
      decisionDetail: 'PRIORITIZE — elevates urgency of both above signals',
      rationale: [
        'Member readiness detected — act within this window',
        'Window closes if engagement drops — time-sensitive',
        'Behavioral signal is a multiplier, not an independent action',
      ],
      color: '#42be65',
    },
    {
      id: 'sig-sdoh',
      signalType: 'SDOH — Multi-barrier profile',
      severity: 'HIGH',
      journeyContext: sdohSummary,
      competingSignals: 'Modifies ALL active signal dispositions',
      dependencyCheck: 'SDOH Intelligence Agent — profile assembled from 8 signal sources',
      decision: 'SEQUENCE',
      decisionDetail: 'SEQUENCE — SDOH context modifies intervention type',
      rationale: [
        `Without SDOH: system schedules appointment — ${firstName} cannot get there`,
        'With SDOH: home kit ordered, copay program flagged, caregiver-sensitive message',
        'SDOH context changes the intervention, not just the timing',
      ],
      color: '#c084fc',
    },
    {
      id: 'sig-mtm',
      signalType: 'Med review_ALERT — DUPLICATE_THERAPY',
      severity: 'CRITICAL',
      journeyContext: `${episode} Day ${day} — ${topGapName} monitoring`,
      competingSignals:
        'Elevates urgency — postpartum episode context amplifies medication safety risk',
      dependencyCheck:
        'Martin Pharmacy consent domain — LIMITED — diagnosis codes EXCLUDED — Med review partial only',
      decision: 'ACT_NOW',
      decisionDetail: 'ACT NOW — URGENT — patient safety risk',
      rationale: [
        `Lisinopril (CVS #4821, ${org}) + Metformin (Walgreens #7734, ${org}) — same molecule — two active fills`,
        'Duplicate BP med therapy creates active safety risk — A1C instability during postpartum recovery is a readmission predictor',
        `Martin Pharmacy consent scope insufficient for full Med review — prescriber alerts dispatched to ${org} — consent expansion queued`,
      ],
      color: '#fa4d56',
    },
  ];
}

function buildSequencingSteps(org: string, topGapName: string): SequencingStep[] {
  return [
    {
      id: 'seq-1',
      step: 1,
      action: 'Eligibility verification',
      reason: `Must confirm ${org} status before auth can finalize`,
      color: '#8b5cf6',
    },
    {
      id: 'seq-2',
      step: 2,
      action: 'Auth evidence assembly',
      reason: 'Clinical package built while eligibility confirms',
      color: '#f1c21b',
    },
    {
      id: 'seq-3',
      step: 3,
      action: 'SDOH-modified outreach',
      reason: 'Home kit + financial assist + brief caregiver-sensitive message',
      color: '#c084fc',
    },
    {
      id: 'seq-4',
      step: 4,
      action: 'Food resource referral',
      reason: `SNAP-eligible programs flagged — ${topGapName} gap partially food-driven`,
      color: '#f59e0b',
    },
  ];
}

const DECISION_CONFIG: Record<
  DispositionDecision,
  { color: string; bg: string; border: string; label: string; glow: string }
> = {
  ACT_NOW: {
    color: '#42be65',
    bg: 'rgba(66,190,101,0.22)',
    border: 'rgba(66,190,101,0.7)',
    label: '► ACT NOW',
    glow: '0 0 18px rgba(66,190,101,0.4)',
  },
  DELAY: {
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.22)',
    border: 'rgba(245,158,11,0.7)',
    label: '⏸ DELAY',
    glow: '0 0 18px rgba(245,158,11,0.4)',
  },
  SUPPRESS: {
    color: '#9ca3af',
    bg: 'rgba(156,163,175,0.22)',
    border: 'rgba(156,163,175,0.7)',
    label: '✕ SUPPRESS',
    glow: 'none',
  },
  PRIORITIZE: {
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.22)',
    border: 'rgba(96,165,250,0.7)',
    label: '▲ PRIORITIZE',
    glow: '0 0 18px rgba(96,165,250,0.4)',
  },
  SEQUENCE: {
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.22)',
    border: 'rgba(167,139,250,0.7)',
    label: '⟳ SEQUENCE',
    glow: '0 0 18px rgba(167,139,250,0.4)',
  },
};

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  HIGH: { color: '#fbbf24', bg: 'rgba(251,191,36,0.18)', border: 'rgba(251,191,36,0.6)' },
  MEDIUM: { color: '#93c5fd', bg: 'rgba(147,197,253,0.18)', border: 'rgba(147,197,253,0.6)' },
  CRITICAL: { color: '#f87171', bg: 'rgba(248,113,113,0.18)', border: 'rgba(248,113,113,0.6)' },
  LOW: { color: '#9ca3af', bg: 'rgba(156,163,175,0.18)', border: 'rgba(156,163,175,0.6)' },
};

// ─── Enterprise Outreach Coordination data with channel info ─────────────────

interface OutreachRow {
  team: string;
  status: string;
  decision: string;
  color: string;
  icon: string;
  reason?: string;
  channel: string;
  channelColor: string;
  lastTouch?: string;
}

const OUTREACH_ROWS: OutreachRow[] = [
  {
    team: 'Clinical team',
    status: '2 messages sent this week',
    decision: 'ACTIVE',
    color: '#42be65',
    icon: '✓',
    channel: 'PORTAL',
    channelColor: '#42be65',
    lastTouch: 'Day 28 · 12 min session',
  },
  {
    team: 'Employer / Wellness (SD-MCD)',
    status: 'Wellness survey queued',
    decision: 'SUPPRESSED',
    color: '#9ca3af',
    icon: '✕',
    reason: 'Active care episode — clinical priority window',
    channel: 'EMAIL',
    channelColor: '#6b7280',
    lastTouch: 'Day 3 · Email opened',
  },
  {
    team: 'Service team',
    status: 'Satisfaction survey queued',
    decision: 'SUPPRESSED',
    color: '#9ca3af',
    icon: '✕',
    reason: 'Clinical priority window — defer 14 days',
    channel: 'SMS',
    channelColor: '#6b7280',
    lastTouch: 'Day 5 · SMS delivered',
  },
  {
    team: 'Growth team',
    status: 'Renewal notice queued',
    decision: 'DELAYED 14 days',
    color: '#f59e0b',
    icon: '⏸',
    reason: 'Active care episode — not appropriate now',
    channel: 'EMAIL',
    channelColor: '#f59e0b',
    lastTouch: 'Day 1 · Welcome email',
  },
  {
    team: 'Care manager (Sarah Johnson)',
    status: '10am outreach — H1ab',
    decision: 'APPROVED',
    color: '#42be65',
    icon: '►',
    reason: 'Only active communication this cycle',
    channel: 'PORTAL',
    channelColor: '#42be65',
    lastTouch: 'Recent · Active session',
  },
  {
    team: 'Martin Pharmacy Med review outreach',
    status: 'Med review enrollment outreach queued',
    decision: 'SUPPRESSED',
    color: '#9ca3af',
    icon: '✕',
    reason:
      'Martin Pharmacy consent scope insufficient — diagnosis context required for Med review — not authorized. Request expanded consent before Med review activation.',
    channel: 'PHONE',
    channelColor: '#6b7280',
    lastTouch: 'Day 8 · No answer',
  },
];

// ─── Evaluation Card ──────────────────────────────────────────────────────────

function EvaluationCard({
  eval: ev,
  visible,
  index,
}: {
  eval: SignalEvaluation;
  visible: boolean;
  index: number;
}) {
  const decCfg = DECISION_CONFIG[ev.decision];
  const sevCfg = SEVERITY_CONFIG[ev.severity];

  return (
    <div
      className="rounded flex flex-col gap-0 overflow-hidden transition-all duration-500"
      style={{
        background: `${ev.color}0d`,
        border: `1.5px solid ${ev.color}45`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transitionDelay: `${index * 0.15}s`,
      }}
    >
      {/* Signal header — larger, more prominent */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${ev.color}30`, background: `${ev.color}10` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="rounded-full"
            style={{
              width: 10,
              height: 10,
              background: ev.color,
              flexShrink: 0,
              boxShadow: `0 0 8px ${ev.color}80`,
            }}
          />
          <span
            className="font-mono font-bold"
            style={{ fontSize: '15px', color: '#f4f4f4', letterSpacing: '0.06em' }}
          >
            SIGNAL: {ev.signalType}
          </span>
          {/* Severity badge — larger */}
          <div
            className="rounded px-2.5 py-1"
            style={{ background: sevCfg.bg, border: `1px solid ${sevCfg.border}` }}
          >
            <span
              className="font-mono font-bold"
              style={{ fontSize: '11px', color: sevCfg.color, letterSpacing: '0.1em' }}
            >
              {ev.severity} severity
            </span>
          </div>
        </div>

        {/* Decision badge — MUCH larger and more prominent */}
        <div
          className="rounded px-4 py-2 flex items-center gap-2"
          style={{
            background: decCfg.bg,
            border: `2px solid ${decCfg.border}`,
            boxShadow: decCfg.glow,
          }}
        >
          <span
            className="font-mono font-bold"
            style={{ fontSize: '14px', color: decCfg.color, letterSpacing: '0.1em' }}
          >
            {ev.decisionDetail}
          </span>
        </div>
      </div>

      {/* Context grid */}
      <div className="grid gap-0 px-5 py-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {[
          { label: 'Journey context', value: ev.journeyContext, color: '#d4d4d4' },
          { label: 'Competing signals', value: ev.competingSignals, color: '#a3a3a3' },
          { label: 'Dependency check', value: ev.dependencyCheck, color: '#fbbf24' },
        ].map((item) => (
          <div key={item.label} className="flex flex-col gap-1 pr-4">
            <span
              style={{
                fontSize: '10px',
                color: '#6f6f6f',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {item.label}
            </span>
            <span style={{ fontSize: '13px', color: item.color, lineHeight: 1.45 }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* Rationale — larger text, more visual weight */}
      <div className="px-5 pb-4 flex flex-col gap-1.5">
        <span
          style={{
            fontSize: '10px',
            color: '#6f6f6f',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Reasoning
        </span>
        {ev.rationale.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <span style={{ fontSize: '13px', color: ev.color, flexShrink: 0, marginTop: 1 }}>
              ›
            </span>
            <span style={{ fontSize: '13px', color: '#c6c6c6', lineHeight: 1.5 }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

function SignalDispositionEngineInner() {
  const setScreen = useDemoStore((s) => s.setScreen);
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const __reg = getPatientById(activeCitizenId) ?? placeholderMember(activeCitizenId);
  const __org = __reg.organization.replace(/ \(.*\)/, '');
  const __firstName = __reg.name.split(' ')[0];
  const __tg =
    (__reg.careGaps || []).find((g) => g.domain === 'Clinical' && g.status !== 'Closed') ||
    __reg.careGaps?.[0];
  const __topGapName = __tg ? __tg.name.replace(/ \(.*\)/, '') : 'Care gap';
  const __journey = journeyForPatient(__reg);
  const __episode = __reg.episodeType;
  const __sdohBits: string[] = [];
  if (__reg.household?.caregiverFor?.length) __sdohBits.push('Caregiver HIGH');
  if (/mile|barrier|high/i.test(__reg.transportStatus || '')) __sdohBits.push('Transport PROBABLE');
  else if (/active|unite|referral/i.test(__reg.transportStatus || ''))
    __sdohBits.push('Transport MANAGED');
  if (
    /not enrolled|expired|lapsed/i.test(__reg.snapStatus || '') ||
    /low income/i.test(__reg.disparityFlag || '')
  )
    __sdohBits.push('Financial ELEVATED');
  if (/insecur|desert/i.test(__reg.foodSecurity || '')) __sdohBits.push('Food MODERATE');
  if (__reg.bhRisk !== 'Low')
    __sdohBits.push(
      `Behavioral ${__reg.bhRisk === 'High' || __reg.bhRisk === 'Crisis' ? 'ELEVATED' : 'MODERATE'}`
    );
  const __sdohSummary = __sdohBits.slice(0, 3).join(' · ') || 'Low SDOH burden';
  const SIGNAL_EVALUATIONS = buildSignalEvaluations(
    __firstName,
    __org,
    __topGapName,
    __episode,
    __journey.currentDay,
    __reg.contract,
    __sdohSummary
  );
  const SEQUENCING_STEPS = buildSequencingSteps(__org, __topGapName);
  const [visibleEvals, setVisibleEvals] = useState(0);
  const [showSuppressionCheck, setShowSuppressionCheck] = useState(false);
  const [showSequencing, setShowSequencing] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [enginePhase, setEnginePhase] = useState<
    'initializing' | 'evaluating' | 'sequencing' | 'complete'
  >('initializing');
  const [engineLines, setEngineLines] = useState<string[]>([]);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const ENGINE_INIT_LINES = [
    'SIGNAL DISPOSITION ENGINE — 14:31:20',
    `Loading journey context for ${__reg.platformId}...`,
    `Consumer journey: ${__episode}, Day ${__journey.currentDay}/${__journey.windowDays} — loaded`,
    `Provider journey: ${__org} — eligibility constraint — loaded`,
    `Operational journey: ${__reg.contract} quality window — loaded`,
    `SDOH Intelligence Agent: loading barrier profile for ${__reg.platformId}...`,
    `SDOH profile: ${__sdohSummary} — loaded`,
    `Evaluating ${SIGNAL_EVALUATIONS.length} signals against active journey + SDOH context...`,
  ];

  useEffect(() => {
    setScreen('signal-disposition-engine');

    ENGINE_INIT_LINES.forEach((line, i) => {
      const t = setTimeout(
        () => {
          setEngineLines((prev) => [...prev, line]);
          if (i === ENGINE_INIT_LINES.length - 1) setEnginePhase('evaluating');
        },
        300 + i * 400
      );
      timerRefs.current.push(t);
    });

    const evalStart = 300 + ENGINE_INIT_LINES.length * 400 + 300;
    SIGNAL_EVALUATIONS.forEach((_, i) => {
      const t = setTimeout(() => setVisibleEvals(i + 1), evalStart + i * 800);
      timerRefs.current.push(t);
    });

    const afterEvals = evalStart + SIGNAL_EVALUATIONS.length * 800 + 400;

    const t1 = setTimeout(() => setShowSuppressionCheck(true), afterEvals);
    const t2 = setTimeout(() => {
      setShowSequencing(true);
      setEnginePhase('sequencing');
    }, afterEvals + 600);
    const t3 = setTimeout(() => {
      setShowComplete(true);
      setEnginePhase('complete');
    }, afterEvals + 1400);

    timerRefs.current.push(t1, t2, t3);

    return () => {
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
  }, [setScreen]);

  const phaseColors: Record<string, string> = {
    initializing: '#78a9ff',
    evaluating: '#f1c21b',
    sequencing: '#8b5cf6',
    complete: '#42be65',
  };

  return (
    <ScreenLayout
      screenId="signal-disposition-engine"
      showPhaseArc
      phaseArcState={{ foundation: true, orchestration: true, autonomous: false }}
      showMiniProfile
    >
      <div
        className="flex flex-col relative overflow-y-auto h-full"
        style={{ background: '#161616', minHeight: '100%' }}
      >
        <PresenterControls currentScreenId="signal-disposition-engine" />

        {/* Phase badge row */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-8 py-2"
          style={{ borderBottom: '1px solid rgba(57,57,57,0.4)' }}
        >
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: '13px', color: '#f4f4f4', letterSpacing: '0.12em' }}
          >
            Signal Disposition Engine
          </span>
          <div className="flex items-center gap-3">
            <div
              className="rounded px-3 py-1 flex items-center gap-2"
              style={{
                background: `${phaseColors[enginePhase]}18`,
                border: `1px solid ${phaseColors[enginePhase]}55`,
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  background: phaseColors[enginePhase],
                  animation:
                    enginePhase !== 'complete' ? 'authPulse 1s ease-in-out infinite' : 'none',
                  boxShadow: `0 0 8px ${phaseColors[enginePhase]}80`,
                }}
              />
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: '12px',
                  color: phaseColors[enginePhase],
                  letterSpacing: '0.1em',
                }}
              >
                {enginePhase === 'initializing'
                  ? 'INITIALIZING'
                  : enginePhase === 'evaluating'
                    ? 'EVALUATING SIGNALS'
                    : enginePhase === 'sequencing'
                      ? 'SEQUENCING'
                      : 'DISPOSITION COMPLETE'}
              </span>
            </div>
          </div>
        </div>

        <MariaStatusStrip
          state="active"
          authStatus="AUTH T-4 days"
          careGapStatus="HbA1c Gap 45d"
          episodeStatus="Postpartum Health"
          visible
        />

        {/* Main layout */}
        <div className="flex gap-0">
          {/* Left: Engine console */}
          <div
            className="flex-shrink-0 flex flex-col"
            style={{
              width: 300,
              borderRight: '1px solid rgba(57,57,57,0.6)',
              background: '#1c1c1c',
            }}
          >
            <div
              className="flex-shrink-0 px-4 py-3"
              style={{ borderBottom: '1px solid rgba(57,57,57,0.6)', background: '#262626' }}
            >
              <span
                className="font-mono uppercase"
                style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}
              >
                ENGINE CONSOLE
              </span>
            </div>
            <div className="flex-1 p-4 flex flex-col gap-2">
              {engineLines.map((line, i) => (
                <div key={i} className="fade-in" style={{ opacity: 0 }}>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '12px',
                      lineHeight: 1.6,
                      color: line.includes('SIGNAL DISPOSITION')
                        ? '#f4f4f4'
                        : line.includes('loaded')
                          ? '#42be65'
                          : line.includes('Evaluating')
                            ? '#f1c21b'
                            : '#8d8d8d',
                      fontWeight: line.includes('SIGNAL DISPOSITION') ? 700 : 400,
                    }}
                  >
                    {line}
                  </span>
                </div>
              ))}
              {enginePhase !== 'initializing' && engineLines.length > 0 && (
                <span
                  className="typewriter-cursor font-mono"
                  style={{ fontSize: '12px', color: '#FF6310' }}
                />
              )}
            </div>

            {/* Journey context summary */}
            <div
              className="flex-shrink-0 p-4"
              style={{ borderTop: '1px solid rgba(57,57,57,0.6)', background: '#262626' }}
            >
              <span
                className="font-mono uppercase"
                style={{
                  fontSize: '9px',
                  color: '#6f6f6f',
                  letterSpacing: '0.1em',
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                JOURNEY + SDOH CONTEXT LOADED
              </span>
              {[
                {
                  label: 'Consumer',
                  value: `Day ${__journey.currentDay}/${__journey.windowDays} · HIGH sensitivity`,
                  color: '#fa4d56',
                },
                { label: 'Provider', value: 'Eligibility constraint active', color: '#78a9ff' },
                {
                  label: 'Operational',
                  value: `${__reg.contract} quality · TCOC at ceiling`,
                  color: '#42be65',
                },
                { label: 'SDOH', value: __sdohSummary, color: '#c084fc' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: '11px', color: '#6f6f6f' }}>{item.label}</span>
                  <span style={{ fontSize: '11px', color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Signal evaluations + sequencing */}
          <div className="flex-1 flex flex-col">
            <div className="p-5 flex flex-col gap-4">
              {/* Signal evaluations */}
              <div className="flex flex-col gap-4">
                {SIGNAL_EVALUATIONS.map((ev, i) => (
                  <EvaluationCard key={ev.id} eval={ev} visible={visibleEvals > i} index={i} />
                ))}
              </div>

              {/* Suppression check — expanded enterprise coordination */}
              {showSuppressionCheck && (
                <div
                  className="rounded p-4 flex flex-col gap-3 fade-in"
                  style={{
                    background: 'rgba(66,190,101,0.08)',
                    border: '1.5px solid rgba(66,190,101,0.45)',
                    opacity: 0,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-full"
                      style={{
                        width: 9,
                        height: 9,
                        background: '#42be65',
                        boxShadow: '0 0 8px rgba(66,190,101,0.6)',
                      }}
                    />
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '13px', color: '#42be65', letterSpacing: '0.1em' }}
                    >
                      ENTERPRISE OUTREACH COORDINATION CHECK — {__reg.platformId}
                    </span>
                  </div>
                  {/* Column headers */}
                  <div
                    className="grid gap-0 px-1"
                    style={{ gridTemplateColumns: '1fr 90px 110px' }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '9px',
                        color: '#4b5563',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Team / Status
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '9px',
                        color: '#4b5563',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Channel
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '9px',
                        color: '#4b5563',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Last Touch
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {OUTREACH_ROWS.map((item, i) => (
                      <div
                        key={i}
                        className="rounded px-3 py-2.5 grid gap-3 items-start"
                        style={{
                          gridTemplateColumns: '1fr 90px 110px',
                          background:
                            item.decision === 'APPROVED'
                              ? 'rgba(66,190,101,0.08)'
                              : item.decision === 'DELAYED 14 days'
                                ? 'rgba(245,158,11,0.08)'
                                : 'rgba(28,28,28,0.6)',
                          border: `1px solid ${item.decision === 'APPROVED' ? 'rgba(66,190,101,0.3)' : item.decision === 'DELAYED 14 days' ? 'rgba(245,158,11,0.3)' : 'rgba(57,57,57,0.5)'}`,
                        }}
                      >
                        {/* Team + decision */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span style={{ fontSize: '12px', color: '#c6c6c6', fontWeight: 600 }}>
                              {item.team}
                            </span>
                            <div
                              className="rounded px-2 py-0.5 flex-shrink-0"
                              style={{
                                background: `${item.color}18`,
                                border: `1px solid ${item.color}40`,
                              }}
                            >
                              <span
                                className="font-mono font-bold"
                                style={{
                                  fontSize: '10px',
                                  color: item.color,
                                  letterSpacing: '0.06em',
                                }}
                              >
                                {item.icon} {item.decision}
                              </span>
                            </div>
                          </div>
                          <span style={{ fontSize: '11px', color: '#8d8d8d' }}>{item.status}</span>
                          {item.reason && (
                            <span
                              style={{ fontSize: '10px', color: '#6f6f6f', fontStyle: 'italic' }}
                            >
                              {item.reason}
                            </span>
                          )}
                        </div>
                        {/* Channel badge */}
                        <div className="flex items-start pt-0.5">
                          <div
                            className="rounded px-2 py-1 flex items-center gap-1.5"
                            style={{
                              background: `${item.channelColor}12`,
                              border: `1px solid ${item.channelColor}40`,
                            }}
                          >
                            <div
                              className="rounded-full"
                              style={{
                                width: 5,
                                height: 5,
                                background: item.channelColor,
                                flexShrink: 0,
                              }}
                            />
                            <span
                              className="font-mono font-bold"
                              style={{
                                fontSize: '10px',
                                color: item.channelColor,
                                letterSpacing: '0.06em',
                              }}
                            >
                              {item.channel}
                            </span>
                          </div>
                        </div>
                        {/* Last touch timestamp */}
                        <div className="flex items-start pt-0.5">
                          {item.lastTouch && (
                            <span style={{ fontSize: '10px', color: '#6f6f6f', lineHeight: 1.4 }}>
                              {item.lastTouch}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="rounded px-3 py-2 flex items-center justify-between"
                    style={{
                      background: 'rgba(66,190,101,0.06)',
                      border: '1px solid rgba(66,190,101,0.25)',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#8d8d8d' }}>Outreach decision:</span>
                    <span style={{ fontSize: '12px', color: '#42be65', fontWeight: 600 }}>
                      1 approved · 3 suppressed · 1 delayed — single coordinated touchpoint
                    </span>
                  </div>
                </div>
              )}

              {/* Sequencing decision */}
              {showSequencing && (
                <div
                  className="rounded p-5 flex flex-col gap-3 fade-in"
                  style={{
                    background: 'rgba(139,92,246,0.08)',
                    border: '1.5px solid rgba(139,92,246,0.5)',
                    opacity: 0,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-full"
                      style={{
                        width: 9,
                        height: 9,
                        background: '#8b5cf6',
                        boxShadow: '0 0 8px rgba(139,92,246,0.6)',
                      }}
                    />
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '13px', color: '#8b5cf6', letterSpacing: '0.1em' }}
                    >
                      SEQUENCING DECISION
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span style={{ fontSize: '11px', color: '#6f6f6f', letterSpacing: '0.06em' }}>
                      CORRECT SEQUENCE:
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {SEQUENCING_STEPS.map((step, i) => (
                        <React.Fragment key={step.id}>
                          <div
                            className="rounded px-4 py-2.5 flex flex-col gap-0.5"
                            style={{
                              background: `${step.color}15`,
                              border: `1.5px solid ${step.color}50`,
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="rounded-full flex items-center justify-center font-mono font-bold"
                                style={{
                                  width: 22,
                                  height: 22,
                                  background: `${step.color}30`,
                                  color: step.color,
                                  fontSize: '11px',
                                }}
                              >
                                {step.step}
                              </div>
                              <span
                                className="font-bold"
                                style={{ fontSize: '14px', color: '#f4f4f4' }}
                              >
                                {step.action}
                              </span>
                            </div>
                            <span style={{ fontSize: '12px', color: '#8d8d8d', paddingLeft: 26 }}>
                              {step.reason}
                            </span>
                          </div>
                          {i < SEQUENCING_STEPS.length - 1 && (
                            <span style={{ fontSize: '20px', color: '#8b5cf6' }}>→</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div
                    className="flex items-start gap-2 rounded px-4 py-2.5"
                    style={{
                      background: 'rgba(250,77,86,0.08)',
                      border: '1px solid rgba(250,77,86,0.3)',
                    }}
                  >
                    <span style={{ fontSize: '14px', color: '#fa4d56', flexShrink: 0 }}>✕</span>
                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#6f6f6f',
                          letterSpacing: '0.06em',
                          display: 'block',
                          marginBottom: 2,
                        }}
                      >
                        NOT THIS:
                      </span>
                      <span style={{ fontSize: '12px', color: '#8d8d8d' }}>
                        Auth → Outreach → Eligibility — would create continuity risk if eligibility
                        lapses mid-sequence
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Disposition complete */}
              {showComplete && (
                <div
                  className="rounded p-5 flex items-center justify-between fade-in"
                  style={{
                    background: 'rgba(66,190,101,0.12)',
                    border: '2px solid rgba(66,190,101,0.65)',
                    boxShadow: '0 0 24px rgba(66,190,101,0.2)',
                    opacity: 0,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="rounded-full"
                      style={{
                        width: 14,
                        height: 14,
                        background: '#42be65',
                        boxShadow: '0 0 16px rgba(66,190,101,0.8)',
                      }}
                    />
                    <div>
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '16px', color: '#42be65', letterSpacing: '0.1em' }}
                      >
                        DISPOSITION COMPLETE — SDOH-INFORMED
                      </span>
                      <span
                        style={{
                          fontSize: '13px',
                          color: '#8d8d8d',
                          display: 'block',
                          marginTop: 3,
                        }}
                      >
                        Routing to Orchestration Controller — 5 signals sequenced, 0 suppressed, 0
                        delayed · SDOH barriers modify intervention type · Med review prescriber
                        alerts dispatched
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '14px', color: '#42be65' }}
                    >
                      14:31:20
                    </span>
                    <span style={{ fontSize: '11px', color: '#6f6f6f' }}>
                      Processing time: 0.4s
                    </span>
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

// Re-mount per active citizen so the engine console + signal evaluations re-animate
// with the selected member's data instead of retaining the previously loaded citizen.
export default function SignalDispositionEngineScreen() {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  return <SignalDispositionEngineInner key={activeCitizenId} />;
}
