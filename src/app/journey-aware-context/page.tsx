'use client';
import React, { useState, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useDemoStore } from '@/uhg/store/demoStore';
import { buildJourneyContext } from '@/lib/wpcGraph/journeyContext';

import { OUTCOME_CONFIG, TYPE_CONFIG } from './journey-aware-context.config';

// Time axis: 24-hour day (0–23)
const HOUR_LABELS = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p', '11p'];
const HOUR_LABEL_POSITIONS = [0, 3, 6, 9, 12, 15, 18, 21, 23]; // hours

function getXPercent(hour: number): number {
  return (hour / 23) * 100;
}

// Interaction shape — matches JourneyInteraction from journeyContext
type Interaction = {
  id: string;
  channel: string;
  dayOffset: number;
  hourOfDay: number;
  type: string;
  outcome: string;
  agent: string;
  note: string;
  timestamp: string;
};

interface TooltipData {
  interaction: Interaction;
  x: number;
  y: number;
}

export default function JourneyAwareContextPage() {
  // ── Patient seam: wire to the shared demo store (same pattern as all uhg screens) ──
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const ctx = buildJourneyContext(activeCitizenId);

  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const suppressionLeft = getXPercent(ctx.suppressionStart);
  const suppressionRight = 100 - getXPercent(ctx.suppressionEnd);
  const activeLeft = getXPercent(ctx.activeWindowStart);
  const activeRight = 100 - getXPercent(ctx.activeWindowEnd);

  const handleDotEnter = (e: React.MouseEvent, interaction: Interaction) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const chartRect = chartRef.current?.getBoundingClientRect();
    if (!chartRect) return;
    setTooltip({
      interaction,
      x: rect.left - chartRect.left + rect.width / 2,
      y: rect.top - chartRect.top,
    });
  };

  const handleDotLeave = () => setTooltip(null);

  return (
    <AppLayout
      pageTitle="Journey-Aware Context"
      breadcrumbs={[{ label: 'CDP & Agentic Automation' }, { label: 'Journey-Aware Context' }]}
    >
      {/* Member Context Banner */}
      <div
        className="mb-6 px-4 py-3 flex items-center gap-4 border"
        style={{ background: '#0f172a', borderColor: '#1e293b' }}
      >
        <div
          className="w-10 h-10 flex items-center justify-center flex-shrink-0"
          style={{ background: '#F59E0B22' }}
        >
          <Icon name="UserIcon" size={18} className="text-[#F59E0B]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{ctx.memberName}</p>
          <p
            className="text-xs"
            style={{ color: '#94a3b8', fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
          >
            {ctx.memberId} · {ctx.memberLocation} · {ctx.memberProgram}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="px-2 py-1 text-xs font-semibold"
            style={{ background: '#F59E0B22', color: '#F59E0B', border: '1px solid #F59E0B44' }}
          >
            ● ACTIVE WINDOW {ctx.activeWindowLabel}
          </span>
          <span
            className="px-2 py-1 text-xs font-semibold"
            style={{ background: '#EF444422', color: '#EF4444', border: '1px solid #EF444444' }}
          >
            ⊘ SUPPRESSED {ctx.suppressionLabel}
          </span>
        </div>
      </div>

      {/* ─── SECTION 1: CHANNEL HISTORY ─────────────────────────────────────── */}
      <div className="mb-6 border" style={{ background: '#0a0f1e', borderColor: '#1e293b' }}>
        <div
          className="px-5 py-3 border-b flex items-center justify-between flex-wrap gap-2"
          style={{ borderColor: '#1e293b' }}
        >
          <div className="flex items-center gap-2">
            <Icon name="ChartBarIcon" size={16} className="text-[#F59E0B]" />
            <span className="text-sm font-semibold text-white uppercase tracking-wide">
              Section 1 — Channel History · Longitudinal Communication Context
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: '#94a3b8' }}>
            {Object.entries(OUTCOME_CONFIG)
              .filter(([k]) => ['engaged', 'converted', 'ignored', 'suppressed'].includes(k))
              .map(([k, v]) => (
                <span key={k} className="flex items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: v.color }}
                  />
                  {v.label}
                </span>
              ))}
          </div>
        </div>

        {/* Band legend */}
        <div
          className="px-5 py-2 flex items-center gap-6 border-b flex-wrap"
          style={{ borderColor: '#1e293b', background: '#0f172a' }}
        >
          <span className="flex items-center gap-2 text-xs" style={{ color: '#F59E0B' }}>
            <span
              className="w-4 h-3 inline-block rounded-sm"
              style={{ background: '#F59E0B20', border: '1px solid #F59E0B55' }}
            />
            Active Window · {ctx.activeWindowLabel} · {ctx.activeWindowSubtext}
          </span>
          <span className="flex items-center gap-2 text-xs" style={{ color: '#EF4444' }}>
            <span
              className="w-4 h-3 inline-block rounded-sm"
              style={{ background: '#EF444415', border: '1px solid #EF444440' }}
            />
            Outreach Suppressed · {ctx.suppressionLabel}
          </span>
          <span className="flex items-center gap-2 text-xs" style={{ color: '#94a3b8' }}>
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ background: '#475569' }}
            />
            Inactive channel (access barrier)
          </span>
        </div>

        {/* Swimlane Chart */}
        <div className="px-5 py-4" ref={chartRef} style={{ position: 'relative' }}>
          {/* Hour axis header */}
          <div className="flex mb-1 pl-28 pr-2">
            {HOUR_LABEL_POSITIONS.map((h, i) => (
              <div
                key={i}
                className="absolute text-xs"
                style={{
                  color: '#475569',
                  left: `calc(7rem + ${getXPercent(h)}% * (100% - 7rem - 0.5rem) / 100)`,
                  top: '1rem',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  transform: 'translateX(-50%)',
                }}
              >
                {HOUR_LABELS[i]}
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2">
            {ctx.channels.map((ch) => {
              const chInteractions = ctx.interactions.filter((i) => i.channel === ch.key);
              return (
                <div key={ch.key} className="flex items-center gap-3">
                  {/* Channel label */}
                  <div className="w-24 flex-shrink-0 flex items-center justify-end gap-1.5 pr-2">
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: ch.inactive ? '#475569' : ch.color,
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      {ch.label}
                    </span>
                    {ch.inactive && (
                      <span
                        className="text-xs px-1"
                        style={{ color: '#475569', background: '#1e293b', fontSize: '9px' }}
                      >
                        OFF
                      </span>
                    )}
                  </div>

                  {/* Lane track */}
                  <div
                    className="flex-1 relative h-9 rounded-sm overflow-hidden"
                    style={{
                      background: ch.inactive ? '#0f172a' : ch.color + '0a',
                      border: `1px solid ${ch.inactive ? '#1e293b' : ch.color + '25'}`,
                      opacity: ch.inactive ? 0.5 : 1,
                    }}
                  >
                    {/* Suppression band (red) */}
                    <div
                      className="absolute inset-y-0 pointer-events-none"
                      style={{
                        left: `${suppressionLeft}%`,
                        right: `${suppressionRight}%`,
                        background: '#EF444410',
                        borderLeft: '1px solid #EF444430',
                        borderRight: '1px solid #EF444430',
                      }}
                    />
                    {/* Active window band (gold) */}
                    <div
                      className="absolute inset-y-0 pointer-events-none"
                      style={{
                        left: `${activeLeft}%`,
                        right: `${activeRight}%`,
                        background: '#F59E0B14',
                        borderLeft: '1px solid #F59E0B50',
                        borderRight: '1px solid #F59E0B50',
                      }}
                    />

                    {/* Interaction dots */}
                    {chInteractions.map((interaction) => {
                      const xPct = getXPercent(interaction.hourOfDay);
                      const outcomeConf = OUTCOME_CONFIG[interaction.outcome];
                      const isInActiveWindow =
                        interaction.hourOfDay >= ctx.activeWindowStart &&
                        interaction.hourOfDay < ctx.activeWindowEnd;
                      const isInSuppression =
                        interaction.hourOfDay >= ctx.suppressionStart &&
                        interaction.hourOfDay < ctx.suppressionEnd;
                      const isHovered = tooltip?.interaction.id === interaction.id;

                      return (
                        <div
                          key={interaction.id}
                          className="absolute top-1/2 cursor-pointer"
                          style={{
                            left: `${xPct}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10,
                          }}
                          onMouseEnter={(e) => handleDotEnter(e, interaction)}
                          onMouseLeave={handleDotLeave}
                        >
                          {/* Pulse ring */}
                          {isHovered && (
                            <div
                              className="absolute rounded-full"
                              style={{
                                width: 22,
                                height: 22,
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: outcomeConf.color + '30',
                                border: `1px solid ${outcomeConf.color}80`,
                                animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite',
                              }}
                            />
                          )}
                          {/* Dot */}
                          <div
                            style={{
                              width: isHovered ? 14 : 10,
                              height: isHovered ? 14 : 10,
                              borderRadius: '50%',
                              background: outcomeConf.color,
                              border: isInActiveWindow
                                ? '2px solid #F59E0B'
                                : isInSuppression
                                  ? '2px solid #EF4444'
                                  : `1.5px solid ${outcomeConf.color}88`,
                              boxShadow: isHovered ? `0 0 8px ${outcomeConf.color}` : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          />
                        </div>
                      );
                    })}

                    {/* Inactive note */}
                    {ch.inactive && ch.note && (
                      <div
                        className="absolute inset-0 flex items-center px-3"
                        style={{
                          color: '#475569',
                          fontSize: '10px',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        {ch.note}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: Math.min(tooltip.x, 520),
                top: tooltip.y - 10,
                transform: 'translate(-50%, -100%)',
                minWidth: 240,
                maxWidth: 300,
              }}
            >
              <div
                className="p-3 border text-xs"
                style={{
                  background: '#0f172a',
                  borderColor: '#334155',
                  boxShadow: '0 8px 32px #00000080',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: OUTCOME_CONFIG[tooltip.interaction.outcome].color }}
                  />
                  <span className="font-semibold text-white">
                    {TYPE_CONFIG[tooltip.interaction.type].label}
                  </span>
                  <span
                    className="ml-auto px-1.5 py-0.5 text-xs font-medium"
                    style={{
                      background: OUTCOME_CONFIG[tooltip.interaction.outcome].bg,
                      color: OUTCOME_CONFIG[tooltip.interaction.outcome].color,
                    }}
                  >
                    {OUTCOME_CONFIG[tooltip.interaction.outcome].label}
                  </span>
                </div>
                <div
                  className="space-y-1"
                  style={{
                    color: '#94a3b8',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '10px',
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b' }}>Time:</span> {tooltip.interaction.timestamp}
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Agent:</span> {tooltip.interaction.agent}
                  </div>
                  <div>
                    <span style={{ color: '#e2e8f0' }}>{tooltip.interaction.note}</span>
                  </div>
                  {tooltip.interaction.hourOfDay >= ctx.activeWindowStart &&
                    tooltip.interaction.hourOfDay < ctx.activeWindowEnd && (
                      <div style={{ color: '#F59E0B' }}>● Within active window</div>
                    )}
                  {tooltip.interaction.hourOfDay >= ctx.suppressionStart &&
                    tooltip.interaction.hourOfDay < ctx.suppressionEnd && (
                      <div style={{ color: '#EF4444' }}>⊘ Within suppression band</div>
                    )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── SECTION 2: ENGAGEMENT INTELLIGENCE PANEL ───────────────────────── */}
      <div className="mb-6 border" style={{ background: '#0a0f1e', borderColor: '#1e293b' }}>
        <div
          className="px-5 py-3 border-b flex items-center gap-2"
          style={{ borderColor: '#1e293b' }}
        >
          <Icon name="LightBulbIcon" size={16} className="text-[#F59E0B]" />
          <span className="text-sm font-semibold text-white uppercase tracking-wide">
            Section 2 — Engagement Intelligence Panel
          </span>
        </div>

        {/* Stat Cards */}
        <div
          className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4 border-b"
          style={{ borderColor: '#1e293b' }}
        >
          {/* Card 1: Preferred Channel */}
          <div className="p-4 border" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 flex items-center justify-center"
                style={{ background: '#84CC1622' }}
              >
                <Icon name="ChatBubbleLeftRightIcon" size={14} className="text-[#84CC16]" />
              </div>
              <span className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>
                Preferred Channel
              </span>
            </div>
            <p
              className="text-2xl font-bold mb-1"
              style={{ color: '#84CC16', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {ctx.preferredChannel}
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              {ctx.preferredChannelSubtext}
            </p>
          </div>

          {/* Card 2: Active Window */}
          <div className="p-4 border" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 flex items-center justify-center"
                style={{ background: '#F59E0B22' }}
              >
                <Icon name="ClockIcon" size={14} className="text-[#F59E0B]" />
              </div>
              <span className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>
                Active Window
              </span>
            </div>
            <p
              className="text-lg font-bold mb-1"
              style={{ color: '#F59E0B', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {ctx.activeWindowStat}
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              {ctx.activeWindowStatSubtext}
            </p>
          </div>

          {/* Card 3: Session Frequency */}
          <div className="p-4 border" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 flex items-center justify-center"
                style={{ background: '#0EA5E922' }}
              >
                <Icon name="ArrowPathIcon" size={14} className="text-[#0EA5E9]" />
              </div>
              <span className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>
                Session Frequency
              </span>
            </div>
            <p
              className="text-2xl font-bold mb-1"
              style={{ color: '#0EA5E9', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {ctx.sessionFrequency}
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              {ctx.sessionFrequencySubtext}
            </p>
          </div>

          {/* Card 4: Last Touchpoint */}
          <div className="p-4 border" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 flex items-center justify-center"
                style={{ background: '#34d39922' }}
              >
                <Icon name="SignalIcon" size={14} className="text-[#34d399]" />
              </div>
              <span className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>
                Last Touchpoint
              </span>
            </div>
            <p
              className="text-2xl font-bold mb-1"
              style={{ color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {ctx.lastTouchpointDays}d ago
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              {ctx.lastTouchpointChannel} · {ctx.lastTouchpointSubtext}
            </p>
          </div>
        </div>

        {/* Suppression Rules Panel */}
        <div className="px-5 py-4 border-b" style={{ borderColor: '#1e293b' }}>
          <div className="flex items-center gap-2 mb-3">
            <Icon name="ShieldExclamationIcon" size={14} className="text-[#EF4444]" />
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: '#94a3b8' }}
            >
              Active Suppression Rules
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ctx.suppressionRules.map((rule) => (
              <span
                key={rule.id}
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  background: rule.bg,
                  color: rule.color,
                  border: `1px solid ${rule.color}44`,
                }}
              >
                {rule.icon} {rule.label}
              </span>
            ))}
          </div>
        </div>

        {/* Conversion Intelligence Strip */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="ChartBarIcon" size={14} className="text-[#F59E0B]" />
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: '#94a3b8' }}
            >
              Conversion Intelligence — Channel Engagement Rates
            </span>
          </div>
          <div className="space-y-3">
            {ctx.conversionData.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div
                  className="w-36 flex-shrink-0 text-xs text-right"
                  style={{ color: item.color, fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {item.label}
                </div>
                <div
                  className="flex-1 relative h-5 rounded-sm overflow-hidden"
                  style={{ background: '#1e293b' }}
                >
                  <div
                    className="h-full rounded-sm transition-all duration-700"
                    style={{ width: `${item.rate}%`, background: item.color + 'cc' }}
                  />
                </div>
                <div
                  className="w-12 text-xs text-right flex-shrink-0"
                  style={{ color: item.color, fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {item.rate}%
                </div>
                {item.note && (
                  <div
                    className="text-xs flex-shrink-0"
                    style={{ color: '#475569', fontStyle: 'italic' }}
                  >
                    ← {item.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes ping {
          75%,
          100% {
            transform: translate(-50%, -50%) scale(1.8);
            opacity: 0;
          }
        }
      `}</style>
    </AppLayout>
  );
}
