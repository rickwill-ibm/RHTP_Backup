'use client';

import React, { useState } from 'react';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import { useDemoStore } from '@/uhg/store/demoStore';

type TimeRange = 'today' | 'week' | 'month';

const DATA: Record<
  TimeRange,
  {
    signalVolume: number;
    highRisk: number;
    routine: number;
    medium: number;
    avgResolution: string;
    autoResolution: number;
    humanIntervention: number;
    governanceIntercepts: number;
    careGapsClosed: number;
    readmissionsPrevented: number;
    authCycleTime: string;
    hedisImprovement: string;
    costAvoidance: string;
    tcocImpact: string;
  }
> = {
  today: {
    signalVolume: 847,
    highRisk: 3,
    routine: 82,
    medium: 15,
    avgResolution: '47 min',
    autoResolution: 96,
    humanIntervention: 4,
    governanceIntercepts: 2,
    careGapsClosed: 23,
    readmissionsPrevented: 3,
    authCycleTime: '0.3 days',
    hedisImprovement: '+2.1%',
    costAvoidance: '$284K',
    tcocImpact: '-0.3%',
  },
  week: {
    signalVolume: 5923,
    highRisk: 4,
    routine: 79,
    medium: 17,
    avgResolution: '51 min',
    autoResolution: 94,
    humanIntervention: 6,
    governanceIntercepts: 14,
    careGapsClosed: 162,
    readmissionsPrevented: 21,
    authCycleTime: '0.4 days',
    hedisImprovement: '+1.8%',
    costAvoidance: '$1.9M',
    tcocImpact: '-2.1%',
  },
  month: {
    signalVolume: 24847,
    highRisk: 3,
    routine: 81,
    medium: 16,
    avgResolution: '49 min',
    autoResolution: 95,
    humanIntervention: 5,
    governanceIntercepts: 58,
    careGapsClosed: 687,
    readmissionsPrevented: 89,
    authCycleTime: '0.4 days',
    hedisImprovement: '+4.7%',
    costAvoidance: '$8.2M',
    tcocImpact: '-8.4%',
  },
};

const SIGNAL_TREND = [
  { label: 'Mon', auth: 142, care: 98, behavioral: 67 },
  { label: 'Tue', auth: 168, care: 112, behavioral: 74 },
  { label: 'Wed', auth: 134, care: 89, behavioral: 81 },
  { label: 'Thu', auth: 187, care: 134, behavioral: 92 },
  { label: 'Fri', auth: 156, care: 108, behavioral: 88 },
  { label: 'Sat', auth: 98, care: 67, behavioral: 54 },
  { label: 'Sun', auth: 84, care: 58, behavioral: 47 },
];

const MAX_TREND = 187 + 134 + 92;

export default function ReportingDashboardPage() {
  const { phaseArcActive, showMiniProfile } = useDemoStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [showMariaReport, setShowMariaReport] = useState(false);
  const d = DATA[timeRange];

  return (
    <ScreenLayout
      screenId="reporting-dashboard"
      showPhaseArc
      phaseArcState={phaseArcActive}
      showMiniProfile={showMiniProfile}
    >
      <div
        className="flex flex-col h-full overflow-hidden"
        style={{ padding: '20px 24px', gap: 16 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="rounded px-3 py-1.5 flex items-center gap-2"
              style={{
                background: 'rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.35)',
              }}
            >
              <div
                className="rounded-full"
                style={{ width: 7, height: 7, background: '#10b981' }}
              />
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '11px', color: '#10b981', letterSpacing: '0.12em' }}
              >
                REPORT AGENT — INTELLIGENCE SUMMARY
              </span>
            </div>
            <span className="text-white font-semibold" style={{ fontSize: '20px' }}>
              Reporting Dashboard
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Time range toggle */}
            <div
              className="flex rounded overflow-hidden"
              style={{ border: '1px solid rgba(57,57,57,0.6)' }}
            >
              {(['today', 'week', 'month'] as TimeRange[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeRange(t)}
                  className="px-3 py-1.5 transition-colors"
                  style={{
                    background: timeRange === t ? 'rgba(120,169,255,0.15)' : 'rgba(28,28,28,0.6)',
                    color: timeRange === t ? '#78a9ff' : '#6f6f6f',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.06em',
                    cursor: 'pointer',
                    borderRight: t !== 'month' ? '1px solid rgba(57,57,57,0.6)' : 'none',
                  }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              className="rounded px-3 py-1.5 flex items-center gap-2 transition-colors"
              style={{
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.3)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '11px', color: '#10b981' }}>↓</span>
              <span
                className="font-mono"
                style={{ fontSize: '10px', color: '#10b981', letterSpacing: '0.08em' }}
              >
                EXPORT PDF
              </span>
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div
          className="grid flex-shrink-0"
          style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}
        >
          {[
            {
              label: 'Signal Volume',
              value: d.signalVolume.toLocaleString(),
              sub: `${d.highRisk}% high · ${d.medium}% medium · ${d.routine}% routine`,
              color: '#78a9ff',
            },
            {
              label: 'Avg Resolution',
              value: d.avgResolution,
              sub: `${d.autoResolution}% automated · ${d.humanIntervention}% human · ${d.governanceIntercepts} intercepts`,
              color: '#42be65',
            },
            {
              label: 'Care Gaps Closed',
              value: d.careGapsClosed.toString(),
              sub: `${d.readmissionsPrevented} readmissions prevented · Auth: ${d.authCycleTime}`,
              color: '#0C55B8',
            },
            {
              label: 'Cost Avoidance',
              value: d.costAvoidance,
              sub: `TCOC impact: ${d.tcocImpact} · HEDIS: ${d.hedisImprovement}`,
              color: '#10b981',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded flex flex-col gap-1.5"
              style={{
                background: `${kpi.color}08`,
                border: `1px solid ${kpi.color}30`,
                padding: '14px 16px',
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.1em' }}
              >
                {kpi.label}
              </span>
              <span className="font-mono font-bold" style={{ fontSize: '24px', color: kpi.color }}>
                {kpi.value}
              </span>
              <span style={{ fontSize: '10px', color: '#6f6f6f', lineHeight: 1.4 }}>{kpi.sub}</span>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div
          className="flex-1 grid overflow-hidden"
          style={{ gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 0 }}
        >
          {/* Left — Signal trend chart */}
          <div className="flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className="rounded-full"
                style={{ width: 6, height: 6, background: '#78a9ff' }}
              />
              <span
                className="font-mono"
                style={{ fontSize: '10px', color: '#78a9ff', letterSpacing: '0.12em' }}
              >
                SIGNAL VOLUME TREND — BY TYPE
              </span>
            </div>

            <div
              className="rounded flex-1 flex flex-col"
              style={{
                background: 'rgba(20,20,20,0.6)',
                border: '1px solid rgba(57,57,57,0.5)',
                padding: '16px',
              }}
            >
              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 flex-shrink-0">
                {[
                  { label: 'AUTH_EXPIRY', color: '#f59e0b' },
                  { label: 'CARE_GAP', color: '#ef4444' },
                  { label: 'BEHAVIORAL', color: '#42be65' },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div
                      className="rounded-full"
                      style={{ width: 6, height: 6, background: l.color }}
                    />
                    <span
                      className="font-mono"
                      style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.06em' }}
                    >
                      {l.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bar chart */}
              <div className="flex-1 flex items-end gap-2">
                {SIGNAL_TREND.map((day) => {
                  const total = day.auth + day.care + day.behavioral;
                  const maxH = 120;
                  return (
                    <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
                      <div className="flex flex-col justify-end w-full" style={{ height: maxH }}>
                        <div
                          className="w-full rounded-t-sm"
                          style={{
                            height: `${(day.behavioral / MAX_TREND) * maxH}px`,
                            background: '#42be65',
                            opacity: 0.7,
                          }}
                        />
                        <div
                          className="w-full"
                          style={{
                            height: `${(day.care / MAX_TREND) * maxH}px`,
                            background: '#ef4444',
                            opacity: 0.7,
                          }}
                        />
                        <div
                          className="w-full"
                          style={{
                            height: `${(day.auth / MAX_TREND) * maxH}px`,
                            background: '#f59e0b',
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className="font-mono" style={{ fontSize: '9px', color: '#4b5563' }}>
                        {day.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Orchestration performance */}
            <div
              className="rounded flex-shrink-0"
              style={{
                background: 'rgba(20,20,20,0.6)',
                border: '1px solid rgba(57,57,57,0.5)',
                padding: '14px 16px',
              }}
            >
              <div
                className="font-mono mb-3"
                style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.1em' }}
              >
                ORCHESTRATION PERFORMANCE
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {[
                  {
                    label: 'Automated Resolution',
                    value: `${d.autoResolution}%`,
                    color: '#42be65',
                  },
                  {
                    label: 'Human Intervention',
                    value: `${d.humanIntervention}%`,
                    color: '#f59e0b',
                  },
                  {
                    label: 'Governance Intercepts',
                    value: d.governanceIntercepts.toString(),
                    color: '#f1c21b',
                  },
                  { label: 'Auth Cycle Time', value: d.authCycleTime, color: '#78a9ff' },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded px-3 py-2"
                    style={{ background: 'rgba(28,28,28,0.6)' }}
                  >
                    <span style={{ fontSize: '10px', color: '#6f6f6f' }}>{row.label}</span>
                    <span
                      className="font-mono font-semibold"
                      style={{ fontSize: '13px', color: row.color }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Clinical outcomes + Maria report */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* Clinical outcomes */}
            <div
              className="rounded flex-shrink-0"
              style={{
                background: 'rgba(20,20,20,0.6)',
                border: '1px solid rgba(57,57,57,0.5)',
                padding: '14px 16px',
              }}
            >
              <div
                className="font-mono mb-3"
                style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.1em' }}
              >
                CLINICAL OUTCOMES
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {[
                  {
                    label: 'Care Gaps Closed',
                    value: d.careGapsClosed.toString(),
                    color: '#42be65',
                  },
                  {
                    label: 'Readmissions Prevented',
                    value: d.readmissionsPrevented.toString(),
                    color: '#0C55B8',
                  },
                  { label: 'HEDIS Improvement', value: d.hedisImprovement, color: '#f1c21b' },
                  { label: 'Cost Avoidance', value: d.costAvoidance, color: '#10b981' },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded px-3 py-2"
                    style={{ background: 'rgba(28,28,28,0.6)' }}
                  >
                    <span style={{ fontSize: '10px', color: '#6f6f6f' }}>{row.label}</span>
                    <span
                      className="font-mono font-semibold"
                      style={{ fontSize: '13px', color: row.color }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Maria individual signal report */}
            <div
              className="rounded flex flex-col gap-3 flex-1 overflow-hidden"
              style={{
                background: 'rgba(12,85,184,0.06)',
                border: '1px solid rgba(12,85,184,0.3)',
                padding: '14px 16px',
              }}
            >
              <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className="rounded-full"
                    style={{ width: 7, height: 7, background: '#78a9ff' }}
                  />
                  <span
                    className="font-mono"
                    style={{ fontSize: '10px', color: '#78a9ff', letterSpacing: '0.1em' }}
                  >
                    INDIVIDUAL SIGNAL REPORT — MARIA REDHAWK
                  </span>
                </div>
                <button
                  onClick={() => setShowMariaReport(!showMariaReport)}
                  className="rounded px-2.5 py-1 transition-colors"
                  style={{
                    background: 'rgba(120,169,255,0.1)',
                    border: '1px solid rgba(120,169,255,0.3)',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.06em' }}
                  >
                    {showMariaReport ? 'COLLAPSE ▲' : 'VIEW ↗'}
                  </span>
                </button>
              </div>

              {/* Summary row */}
              <div
                className="grid flex-shrink-0"
                style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
              >
                {[
                  { label: 'Concurrent Signals', value: '3', color: '#f59e0b' },
                  { label: 'Resolution Time', value: '47 min', color: '#42be65' },
                  { label: 'Decisions Logged', value: '71', color: '#8b5cf6' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded px-3 py-2 flex flex-col gap-0.5"
                    style={{ background: 'rgba(28,28,28,0.6)' }}
                  >
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '16px', color: stat.color }}
                    >
                      {stat.value}
                    </span>
                    <span style={{ fontSize: '9px', color: '#4b5563' }}>{stat.label}</span>
                  </div>
                ))}
              </div>

              {showMariaReport && (
                <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                  {[
                    {
                      section: 'Signal Receipt',
                      detail:
                        '3 concurrent signals — AUTH_EXPIRY + CARE_GAP + BEHAVIORAL — 30s window',
                      color: '#78a9ff',
                    },
                    {
                      section: 'Context Assembled',
                      detail: '14 graph nodes · 17 relationships · Caregiver + Dependent detected',
                      color: '#8b5cf6',
                    },
                    {
                      section: 'Disposition',
                      detail: 'ACT — multi-domain concurrent orchestration — HIGH complexity',
                      color: '#42be65',
                    },
                    {
                      section: 'Agents Activated',
                      detail: '8 agents from 31-agent registry — coalition assembled T+2.1s',
                      color: '#0C55B8',
                    },
                    {
                      section: 'Governance Events',
                      detail: '2 intercepts — CONSENT.PROXY.SCOPE T+19m · CMS.APPEAL.AUTO T+31m',
                      color: '#f1c21b',
                    },
                    {
                      section: 'Human Review',
                      detail: '1 — Dr. K. Patel — appeal clinical necessity determination',
                      color: '#f59e0b',
                    },
                    {
                      section: 'Outcome Status',
                      detail: 'RESOLVED — all 4 conditions addressed — graph updated',
                      color: '#42be65',
                    },
                    {
                      section: 'Graph Write-back',
                      detail: '14 node updates · 3 new relationships · audit ledger committed',
                      color: '#10b981',
                    },
                  ].map((row) => (
                    <div
                      key={row.section}
                      className="rounded px-3 py-2 flex items-start gap-3"
                      style={{
                        background: 'rgba(28,28,28,0.5)',
                        border: '1px solid rgba(57,57,57,0.3)',
                      }}
                    >
                      <div
                        className="rounded px-2 py-0.5 flex-shrink-0"
                        style={{ background: `${row.color}12`, border: `1px solid ${row.color}30` }}
                      >
                        <span
                          className="font-mono"
                          style={{ fontSize: '8px', color: row.color, letterSpacing: '0.06em' }}
                        >
                          {row.section}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', color: '#a8a8a8', lineHeight: 1.5 }}>
                        {row.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!showMariaReport && (
                <div className="flex items-center gap-3 flex-shrink-0">
                  {[
                    { label: 'Governance honored', value: '8/8', color: '#42be65' },
                    { label: 'Graph updates', value: '14', color: '#78a9ff' },
                    { label: 'Compliance score', value: '100%', color: '#f1c21b' },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-center gap-1.5">
                      <span
                        className="font-mono font-semibold"
                        style={{ fontSize: '13px', color: stat.color }}
                      >
                        {stat.value}
                      </span>
                      <span style={{ fontSize: '10px', color: '#4b5563' }}>{stat.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TCOC + Financial */}
            <div
              className="rounded flex-shrink-0"
              style={{
                background: 'rgba(20,20,20,0.6)',
                border: '1px solid rgba(57,57,57,0.5)',
                padding: '14px 16px',
              }}
            >
              <div
                className="font-mono mb-3"
                style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.1em' }}
              >
                FINANCIAL INTELLIGENCE
              </div>
              <div className="flex items-center gap-4">
                {[
                  { label: 'Cost Avoidance', value: d.costAvoidance, color: '#10b981' },
                  { label: 'TCOC Impact', value: d.tcocImpact, color: '#42be65' },
                  { label: 'HEDIS Trajectory', value: d.hedisImprovement, color: '#f1c21b' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="flex flex-col gap-0.5 flex-1 rounded px-3 py-2"
                    style={{ background: 'rgba(28,28,28,0.6)' }}
                  >
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '18px', color: stat.color }}
                    >
                      {stat.value}
                    </span>
                    <span style={{ fontSize: '9px', color: '#4b5563' }}>{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PresenterControls currentScreenId="reporting-dashboard" />
    </ScreenLayout>
  );
}
