'use client';

import React, { useEffect, useState, useRef } from 'react';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import MariaStatusStrip from '@/uhg/components/shared/MariaStatusStrip';
import { useDemoStore } from '@/uhg/store/demoStore';

interface MemberProfile {
  id: string;
  initials: string;
  risk: 'HIGH' | 'MEDIUM';
  conditions: string;
  openIssues: number;
  color: string;
}

function generatePortfolioMembers(): MemberProfile[] {
  const highRiskConditions = [
    'Postpartum Health',
    'CHF · CKD',
    'COPD · Diabetes',
    'Postpartum · Hypertension',
    'Diabetes · Obesity',
    'CHF · Diabetes',
    'COPD · CKD',
    'Postpartum · CKD',
    'Diabetes · Depression',
    'CHF · COPD',
  ];
  const medRiskConditions = [
    'Hypertension',
    'Diabetes',
    'Asthma',
    'Obesity',
    'Depression',
    'Arthritis',
    'Hypertension · Obesity',
    'Diabetes · Asthma',
  ];
  const initials = [
    'MR',
    'JD',
    'SK',
    'PL',
    'AT',
    'RN',
    'CW',
    'BH',
    'LM',
    'TK',
    'GF',
    'NP',
    'VR',
    'DQ',
    'EJ',
  ];
  const members: MemberProfile[] = [];

  for (let i = 0; i < 48; i++) {
    const isHigh = i < 18;
    members.push({
      id: `m-${i}`,
      initials: initials[i % initials.length],
      risk: isHigh ? 'HIGH' : 'MEDIUM',
      conditions: isHigh
        ? highRiskConditions[i % highRiskConditions.length]
        : medRiskConditions[i % medRiskConditions.length],
      openIssues: isHigh ? 2 + (i % 4) : 1 + (i % 2),
      color: isHigh ? '#fa4d56' : '#f1c21b',
    });
  }
  return members;
}

const PORTFOLIO_MEMBERS = generatePortfolioMembers();

const ENTITY_ROWS = [
  {
    id: 'uhc',
    entity: 'SD Medicaid',
    color: '#78a9ff',
    lines: [
      { label: 'Readmission avoided', value: '+$47,000', note: 'TCOC protection' },
      { label: 'Care gap closed', value: '+0.3 pts', note: 'Star Rating impact' },
      { label: 'Auth cycle: 8.2d → 0.3d', value: '+$2,100', note: 'Admin cost avoided' },
    ],
    subtotal: '$49,100',
  },
  {
    id: 'bennett-county',
    entity: 'Bennett County Health',
    color: '#42be65',
    lines: [
      { label: 'Preventive care protocol', value: '+$3,200', note: 'Care delivery revenue' },
      { label: 'Home visit + lab kit', value: '+$840', note: 'Bennett County-delivered service' },
      { label: 'Managed care enrollment', value: '+$14,400', note: 'Annual care revenue' },
    ],
    subtotal: '$18,440',
  },
  {
    id: 'martin-pharmacy',
    entity: 'Martin Pharmacy',
    color: '#a78bfa',
    lines: [
      {
        label: 'Med review program enrollment',
        value: '+$1,200',
        note: 'Pharmacy program revenue',
      },
      { label: 'Medication adherence retained', value: '+$2,800', note: 'Ongoing fill revenue' },
      { label: 'Duplicate therapy resolved', value: '+$8,400', note: 'Avoided adverse event cost' },
    ],
    subtotal: '$12,400',
  },
  {
    id: 'rhtp-care-mgmt',
    entity: 'RHTP Care Management',
    color: '#f59e0b',
    lines: [
      { label: 'Citizen engagement retained', value: '+$180', note: 'Digital program value' },
      { label: 'Portal activation deepened', value: '—', note: 'Retention signal: POSITIVE' },
      { label: 'Satisfaction score: ELEVATED', value: '—', note: 'Disenrollment risk: REDUCED' },
    ],
    subtotal: '$180+',
  },
  {
    id: 'provider-bennett',
    entity: 'Provider (Bennett County Health)',
    color: '#42be65',
    lines: [
      {
        label: 'Unnecessary utilization avoided',
        value: '+$4,200',
        note: 'Point-of-care decision support',
      },
      {
        label: 'Adverse event prevented (A1C)',
        value: '+$12,000',
        note: 'Duplicate therapy caught pre-visit',
      },
      { label: 'Auth friction eliminated', value: '+$2,100', note: 'Pre-approval visible in EHR' },
    ],
    subtotal: '$18,300',
  },
];

export default function PortfolioScaleScreen() {
  const setScreen = useDemoStore((s) => s.setScreen);
  const [visibleCount, setVisibleCount] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [showEnterprise, setShowEnterprise] = useState(false);
  const [counterValue, setCounterValue] = useState(0);
  const [highlightMaria, setHighlightMaria] = useState(false);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setScreen('portfolio-scale');

    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= PORTFOLIO_MEMBERS.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 3;
      });
    }, 60);

    const counterStart = setTimeout(() => {
      let val = 0;
      const target = 14847;
      const step = Math.ceil(target / 60);
      const counterInterval = setInterval(() => {
        val = Math.min(val + step, target);
        setCounterValue(val);
        if (val >= target) clearInterval(counterInterval);
      }, 30);
    }, 500);

    const t1 = setTimeout(() => setHighlightMaria(true), 1200);
    const t2 = setTimeout(() => setShowStats(true), 2000);
    const t3 = setTimeout(() => setShowEnterprise(true), 2800);

    timerRefs.current.push(counterStart, t1, t2, t3);

    return () => {
      clearInterval(interval);
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
  }, [setScreen]);

  return (
    <ScreenLayout
      screenId="portfolio-scale"
      showPhaseArc
      phaseArcState={{ foundation: true, orchestration: true, autonomous: true }}
      showMiniProfile
    >
      <PresenterControls currentScreenId="portfolio-scale" />

      <MariaStatusStrip
        state="resolved"
        authStatus="✓ Submitted"
        careGapStatus="✓ In Progress"
        episodeStatus="Postpartum Health"
        visible
      />

      <div
        className="flex flex-col overflow-hidden"
        style={{ height: 'calc(100% - 36px)', marginTop: 36, background: '#161616' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3"
          style={{ borderBottom: '1px solid rgba(57,57,57,0.6)', background: '#1c1c1c' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="rounded px-3 py-1.5 flex items-center gap-2"
              style={{
                background: 'rgba(120,169,255,0.15)',
                border: '1px solid rgba(120,169,255,0.4)',
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: '#78a9ff',
                  animation: 'authPulse 2s ease-in-out infinite',
                }}
              />
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '11px', color: '#78a9ff', letterSpacing: '0.1em' }}
              >
                LIVE POPULATION FILTER
              </span>
            </div>
            <span className="text-white font-semibold" style={{ fontSize: '20px' }}>
              How Maria Was Handled
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end gap-0.5">
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: '28px',
                  color: '#78a9ff',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {counterValue.toLocaleString()}
              </span>
              <span style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.06em' }}>
                CITIZENS LIKE MARIA — RIGHT NOW
              </span>
            </div>
          </div>
        </div>

        {/* Main content — three columns */}
        <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">
          {/* Col 1: Member grid */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ width: '34%', borderRight: '1px solid rgba(57,57,57,0.5)' }}
          >
            <div
              className="flex-shrink-0 px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(57,57,57,0.5)' }}
            >
              <span
                className="font-mono uppercase tracking-wider"
                style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.12em' }}
              >
                COMPLEX MULTI-CONDITION MEMBERS
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div
                    className="rounded-full"
                    style={{ width: 7, height: 7, background: '#fa4d56' }}
                  />
                  <span style={{ fontSize: '10px', color: '#8d8d8d' }}>HIGH</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="rounded-full"
                    style={{ width: 7, height: 7, background: '#f1c21b' }}
                  />
                  <span style={{ fontSize: '10px', color: '#8d8d8d' }}>MED</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}
              >
                {/* Maria card */}
                <div
                  className="rounded p-2.5 flex flex-col gap-1.5 transition-all duration-500"
                  style={{
                    background: highlightMaria ? 'rgba(66,190,101,0.12)' : 'rgba(250,77,86,0.08)',
                    border: `2px solid ${highlightMaria ? '#42be65' : '#fa4d56'}`,
                    boxShadow: highlightMaria ? '0 0 16px rgba(66,190,101,0.2)' : 'none',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="rounded-full flex items-center justify-center"
                      style={{
                        width: 24,
                        height: 24,
                        background: 'rgba(66,190,101,0.15)',
                        border: '1px solid #42be65',
                      }}
                    >
                      <span className="font-semibold text-white" style={{ fontSize: '9px' }}>
                        MR
                      </span>
                    </div>
                    <div
                      className="rounded px-1 py-0.5"
                      style={{
                        background: 'rgba(66,190,101,0.15)',
                        border: '1px solid rgba(66,190,101,0.4)',
                      }}
                    >
                      <span
                        className="font-mono"
                        style={{ fontSize: '7px', color: '#42be65', letterSpacing: '0.08em' }}
                      >
                        RESOLVED
                      </span>
                    </div>
                  </div>
                  <span className="font-semibold text-white" style={{ fontSize: '10px' }}>
                    Maria Redhawk
                  </span>
                  <span style={{ fontSize: '9px', color: '#8d8d8d' }}>Postpartum Health</span>
                  <span style={{ fontSize: '9px', color: '#42be65' }}>✓ Orchestrated</span>
                </div>

                {PORTFOLIO_MEMBERS.slice(0, visibleCount).map((member) => (
                  <div
                    key={member.id}
                    className="rounded p-2.5 flex flex-col gap-1.5"
                    style={{
                      background: `${member.color}08`,
                      border: `1px solid ${member.color}30`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="rounded-full flex items-center justify-center"
                        style={{
                          width: 24,
                          height: 24,
                          background: `${member.color}15`,
                          border: `1px solid ${member.color}`,
                        }}
                      >
                        <span className="font-semibold text-white" style={{ fontSize: '9px' }}>
                          {member.initials}
                        </span>
                      </div>
                      <div
                        className="rounded px-1 py-0.5"
                        style={{
                          background: `${member.color}15`,
                          border: `1px solid ${member.color}40`,
                        }}
                      >
                        <span
                          className="font-mono"
                          style={{ fontSize: '7px', color: member.color, letterSpacing: '0.08em' }}
                        >
                          {member.risk}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: '9px', color: '#8d8d8d' }}>{member.conditions}</span>
                    <span style={{ fontSize: '9px', color: member.color }}>
                      {member.openIssues} open gaps
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Col 2: SD Medicaid Payer View */}
          <div
            className="flex flex-col overflow-hidden"
            style={{
              width: '30%',
              borderRight: '1px solid rgba(57,57,57,0.5)',
              background: '#1a1a1a',
            }}
          >
            {/* Column header */}
            <div
              className="flex-shrink-0 px-4 py-3 flex items-center gap-2"
              style={{
                borderBottom: '1px solid rgba(57,57,57,0.5)',
                background: 'rgba(120,169,255,0.06)',
              }}
            >
              <div
                className="rounded-full"
                style={{ width: 7, height: 7, background: '#78a9ff' }}
              />
              <span
                className="font-mono uppercase tracking-wider"
                style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.12em' }}
              >
                SD Medicaid PAYER VIEW — WHAT YOUR CFO SEES
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 flex flex-col gap-4">
              {showStats && (
                <div className="flex flex-col gap-3 fade-in">
                  <div
                    className="rounded p-4"
                    style={{
                      background: 'rgba(120,169,255,0.06)',
                      border: '1px solid rgba(120,169,255,0.2)',
                      borderLeft: '3px solid #78a9ff',
                    }}
                  >
                    <div className="flex flex-col gap-1 mb-3">
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '32px', color: '#78a9ff', lineHeight: 1 }}
                      >
                        $47,000
                      </span>
                      <span style={{ fontSize: '11px', color: '#8d8d8d' }}>
                        per failed episode — payer cost avoided
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { label: 'Readmission avoided', value: '$47,000', color: '#78a9ff' },
                        { label: 'Auth cycle savings', value: '$2,100', color: '#78a9ff' },
                        { label: 'Care gap closure', value: '+0.3 Stars', color: '#78a9ff' },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between">
                          <span style={{ fontSize: '11px', color: '#8d8d8d' }}>{row.label}</span>
                          <span
                            className="font-mono font-semibold"
                            style={{ fontSize: '12px', color: row.color }}
                          >
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {[
                      {
                        id: 's1',
                        label: 'Multi-condition, HIGH risk',
                        value: '4,847',
                        color: '#fa4d56',
                        pct: 33,
                      },
                      {
                        id: 's2',
                        label: 'Auth + care gap overlap',
                        value: '6,291',
                        color: '#f59e0b',
                        pct: 42,
                      },
                      {
                        id: 's3',
                        label: 'Provider eligibility',
                        value: '2,109',
                        color: '#f1c21b',
                        pct: 14,
                      },
                      {
                        id: 's4',
                        label: 'Appeal window open',
                        value: '1,600',
                        color: '#8b5cf6',
                        pct: 11,
                      },
                    ].map((stat) => (
                      <div key={stat.id} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span style={{ fontSize: '11px', color: '#c6c6c6' }}>{stat.label}</span>
                          <span
                            className="font-mono font-semibold"
                            style={{ fontSize: '13px', color: stat.color }}
                          >
                            {stat.value}
                          </span>
                        </div>
                        <div
                          className="w-full rounded-full overflow-hidden"
                          style={{ height: 4, background: 'rgba(57,57,57,0.6)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${stat.pct}%`,
                              background: stat.color,
                              transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Payer-only exposure */}
                  <div
                    className="rounded p-3"
                    style={{
                      background: 'rgba(250,77,86,0.06)',
                      border: '1px solid rgba(250,77,86,0.2)',
                      borderLeft: '3px solid #fa4d56',
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      <span
                        className="font-mono uppercase"
                        style={{ fontSize: '9px', color: '#fa4d56', letterSpacing: '0.1em' }}
                      >
                        PAYER EXPOSURE
                      </span>
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '22px', color: '#fa4d56', lineHeight: 1 }}
                      >
                        $697M
                      </span>
                      <span style={{ fontSize: '11px', color: '#8d8d8d' }}>
                        14,847 × $47K unmanaged cost
                      </span>
                    </div>
                  </div>

                  {/* Household multiplier */}
                  <div
                    className="rounded p-3"
                    style={{
                      background: 'rgba(255,126,182,0.06)',
                      border: '1px solid rgba(255,126,182,0.2)',
                      borderLeft: '3px solid #ff7eb6',
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="font-mono uppercase"
                        style={{ fontSize: '9px', color: '#ff7eb6', letterSpacing: '0.1em' }}
                      >
                        HOUSEHOLD MULTIPLIER
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '16px', color: '#ff7eb6' }}
                      >
                        14,847
                      </span>
                      <span style={{ fontSize: '11px', color: '#6f6f6f' }}>×</span>
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '14px', color: '#c084fc' }}
                      >
                        2.3
                      </span>
                      <span style={{ fontSize: '11px', color: '#6f6f6f' }}>=</span>
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '16px', color: '#f97316' }}
                      >
                        34,148
                      </span>
                      <span style={{ fontSize: '11px', color: '#8d8d8d' }}>people affected</span>
                    </div>
                  </div>

                  {/* Questions */}
                  <div
                    className="rounded p-3 flex flex-col gap-2"
                    style={{
                      background: 'rgba(38,38,38,0.7)',
                      border: '1px solid rgba(57,57,57,0.7)',
                      borderTop: '2px solid rgba(120,169,255,0.4)',
                    }}
                  >
                    <span
                      className="font-mono uppercase"
                      style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.1em' }}
                    >
                      QUESTIONS FOR THE ROOM
                    </span>
                    {[
                      {
                        id: 'q1',
                        q: "How many Marias haven't your coordinators found yet?",
                        color: '#fa4d56',
                      },
                      {
                        id: 'q2',
                        q: 'What does a missed 72-hour SD Medicaid appeal window cost per quarter?',
                        color: '#f59e0b',
                      },
                      {
                        id: 'q3',
                        q: 'What happens to Star Rating if you close 71% more care gaps?',
                        color: '#42be65',
                      },
                    ].map((item, i) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 rounded px-2.5 py-2"
                        style={{
                          background: `${item.color}06`,
                          border: `1px solid ${item.color}20`,
                        }}
                      >
                        <div
                          className="rounded-full flex items-center justify-center flex-shrink-0 font-mono font-bold"
                          style={{
                            width: 16,
                            height: 16,
                            background: `${item.color}15`,
                            border: `1px solid ${item.color}50`,
                            fontSize: '9px',
                            color: item.color,
                            marginTop: 1,
                          }}
                        >
                          {i + 1}
                        </div>
                        <p
                          style={{
                            fontSize: '11px',
                            color: '#c6c6c6',
                            lineHeight: 1.5,
                            fontStyle: 'italic',
                          }}
                        >
                          &quot;{item.q}&quot;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Col 3: Multi-Entity Enterprise Value */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ width: '36%', background: '#181818' }}
          >
            {/* Column header */}
            <div
              className="flex-shrink-0 px-4 py-3 flex items-center justify-between"
              style={{
                borderBottom: '1px solid rgba(57,57,57,0.5)',
                background: 'rgba(66,190,101,0.06)',
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="rounded-full"
                  style={{ width: 7, height: 7, background: '#42be65' }}
                />
                <span
                  className="font-mono uppercase tracking-wider"
                  style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.12em' }}
                >
                  ENTERPRISE VIEW — ONE RESOLUTION · FIVE P&amp;L LINES
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 flex flex-col gap-3">
              {showEnterprise && (
                <div className="flex flex-col gap-3 fade-in">
                  {/* Per-entity rows */}
                  {ENTITY_ROWS.map((entity) => (
                    <div
                      key={entity.id}
                      className="rounded overflow-hidden"
                      style={{ border: `1px solid ${entity.color}25` }}
                    >
                      {/* Entity header */}
                      <div
                        className="flex items-center justify-between px-3 py-2"
                        style={{
                          background: `${entity.color}10`,
                          borderBottom: `1px solid ${entity.color}20`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="rounded-full"
                            style={{ width: 6, height: 6, background: entity.color }}
                          />
                          <span
                            className="font-mono font-semibold"
                            style={{
                              fontSize: '11px',
                              color: entity.color,
                              letterSpacing: '0.04em',
                            }}
                          >
                            {entity.entity}
                          </span>
                        </div>
                        <span
                          className="font-mono font-bold"
                          style={{ fontSize: '13px', color: entity.color }}
                        >
                          {entity.subtotal}
                        </span>
                      </div>
                      {/* Value lines */}
                      <div
                        className="flex flex-col divide-y"
                        style={{ borderColor: `${entity.color}10` }}
                      >
                        {entity.lines.map((line, li) => (
                          <div
                            key={li}
                            className="flex items-center justify-between px-3 py-1.5"
                            style={{
                              background: li % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                            }}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span style={{ fontSize: '11px', color: '#c6c6c6' }}>
                                {line.label}
                              </span>
                              <span style={{ fontSize: '10px', color: '#6f6f6f' }}>
                                {line.note}
                              </span>
                            </div>
                            <span
                              className="font-mono font-semibold flex-shrink-0 ml-3"
                              style={{
                                fontSize: '12px',
                                color: line.value.startsWith('+') ? entity.color : '#6f6f6f',
                              }}
                            >
                              {line.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Total enterprise value vs payer-only */}
                  <div
                    className="rounded p-4"
                    style={{
                      background: 'rgba(66,190,101,0.08)',
                      border: '1px solid rgba(66,190,101,0.4)',
                      borderTop: '2px solid #42be65',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="rounded-full"
                        style={{ width: 6, height: 6, background: '#42be65' }}
                      />
                      <span
                        className="font-mono uppercase"
                        style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.12em' }}
                      >
                        TOTAL ENTERPRISE VALUE — SINGLE MARIA RESOLUTION
                      </span>
                    </div>
                    <div className="flex items-end justify-between gap-4 mb-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="font-mono font-bold"
                          style={{
                            fontSize: '36px',
                            color: '#42be65',
                            lineHeight: 1,
                            letterSpacing: '-0.02em',
                          }}
                        >
                          $96,420
                        </span>
                        <span style={{ fontSize: '11px', color: '#8d8d8d' }}>
                          enterprise value per resolution
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span
                          className="font-mono font-bold"
                          style={{ fontSize: '20px', color: '#fa4d56', lineHeight: 1 }}
                        >
                          $47,000
                        </span>
                        <span style={{ fontSize: '10px', color: '#6f6f6f' }}>payer-only view</span>
                      </div>
                    </div>

                    {/* Delta callout */}
                    <div
                      className="rounded px-3 py-2.5 flex items-center justify-between"
                      style={{
                        background: 'rgba(66,190,101,0.12)',
                        border: '1px solid rgba(66,190,101,0.3)',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: '#c6c6c6' }}>
                        Value invisible to TCOC story
                      </span>
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '16px', color: '#42be65' }}
                      >
                        +$49,420
                      </span>
                    </div>
                  </div>

                  <div
                    className="rounded px-3 py-2"
                    style={{
                      background: 'rgba(57,57,57,0.4)',
                      border: '1px solid rgba(57,57,57,0.6)',
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{ fontSize: '10px', color: '#4b5563', letterSpacing: '0.06em' }}
                    >
                      Population filter: risk score ≥ 6.0 · 2+ active conditions · 1+ open
                      coordination gap · 124,847 total members
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PORTFOLIO DELTA — Full-width breakout */}
        <div
          className="mx-6 mb-4 rounded-lg overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(10,20,14,0.98) 0%, rgba(15,30,20,0.98) 100%)',
            border: '2px solid rgba(66,190,101,0.6)',
            boxShadow: '0 0 32px rgba(66,190,101,0.18), 0 0 0 1px rgba(66,190,101,0.08)',
          }}
        >
          {/* Header bar */}
          <div
            className="px-5 py-2.5 flex items-center gap-3"
            style={{
              background: 'rgba(66,190,101,0.12)',
              borderBottom: '1px solid rgba(66,190,101,0.3)',
            }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: '#42be65', boxShadow: '0 0 6px #42be65' }}
            />
            <span
              className="font-mono font-bold uppercase tracking-widest"
              style={{ fontSize: '11px', color: '#42be65', letterSpacing: '0.18em' }}
            >
              PORTFOLIO DELTA — 14,847 MEMBERS
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(66,190,101,0.2)' }} />
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(66,190,101,0.5)' }}>
              BOARD-LEVEL SUMMARY
            </span>
          </div>

          {/* Three-column value story */}
          <div
            className="grid grid-cols-3 divide-x"
            style={{ borderColor: 'rgba(66,190,101,0.15)' }}
          >
            {/* Payer story */}
            <div className="px-5 py-4 flex flex-col gap-1.5">
              <span
                className="font-mono uppercase"
                style={{ fontSize: '9px', color: '#fa4d56', letterSpacing: '0.14em' }}
              >
                PAYER STORY · CFO SEES
              </span>
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: '28px',
                  color: '#fa4d56',
                  lineHeight: 1,
                  textShadow: '0 0 20px rgba(250,77,86,0.4)',
                }}
              >
                $697M
              </span>
              <span style={{ fontSize: '11px', color: '#6f6f6f' }}>
                Unmanaged cost exposure · SD Medicaid TCOC impact
              </span>
            </div>

            {/* Enterprise story */}
            <div
              className="px-5 py-4 flex flex-col gap-1.5"
              style={{ borderLeft: '1px solid rgba(66,190,101,0.15)' }}
            >
              <span
                className="font-mono uppercase"
                style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.14em' }}
              >
                ENTERPRISE STORY · BOARD PRESENTATION
              </span>
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: '28px',
                  color: '#42be65',
                  lineHeight: 1,
                  textShadow: '0 0 20px rgba(66,190,101,0.4)',
                }}
              >
                $1.16B
              </span>
              <span style={{ fontSize: '11px', color: '#6f6f6f' }}>
                SD Medicaid + Bennett County Health + Martin Pharmacy + RHTP + Provider combined
              </span>
            </div>

            {/* Invisible delta */}
            <div
              className="px-5 py-4 flex flex-col gap-1.5"
              style={{
                borderLeft: '1px solid rgba(66,190,101,0.15)',
                background: 'rgba(66,190,101,0.06)',
              }}
            >
              <span
                className="font-mono uppercase"
                style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.14em' }}
              >
                INVISIBLE TO TCOC STORY
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-mono font-bold"
                  style={{
                    fontSize: '28px',
                    color: '#42be65',
                    lineHeight: 1,
                    textShadow: '0 0 20px rgba(66,190,101,0.5)',
                  }}
                >
                  +$460M
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: '12px', color: 'rgba(66,190,101,0.6)' }}
                >
                  delta
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#a8f0c6' }}>
                Value that belongs in your board presentation
              </span>
            </div>
          </div>
        </div>

        {/* Screen indicator */}
        <div
          className="absolute bottom-4 right-6 z-10 font-mono"
          style={{ color: '#6f6f6f', fontSize: '12px' }}
        >
          17 / 19
        </div>
      </div>
    </ScreenLayout>
  );
}
