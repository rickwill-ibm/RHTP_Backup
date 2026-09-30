'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import MariaStatusStrip from '@/uhg/components/shared/MariaStatusStrip';
import GovernanceBorder from '@/uhg/components/shared/GovernanceBorder';
import { useDemoStore } from '@/uhg/store/demoStore';
import { scenarioFor } from '@/uhg/data/scenarioRegistry';
import { getPatientById, placeholderMember } from '@/lib/patientRegistry';
import { journeyForPatient } from '@/uhg/data/journeys';
import { SignalGeneratorEngine, Signal } from '@/uhg/lib/signalGenerator';
import JourneyStatePanel from '@/uhg/components/shared/JourneyStatePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'idle' | 'activating' | 'active' | 'intercept' | 'complete';
type AgentState = 'idle' | 'processing' | 'resolved';

interface AgentActivity {
  id: string;
  text: string;
  type: 'info' | 'success' | 'warning' | 'critical';
  timestamp: string;
}

interface AgentPanelData {
  id: string;
  name: string;
  role: string;
  roleColor: string;
  owns: number[];
  color: string;
  borderColor: string;
  activities: AgentActivity[];
}

interface AgentRuntimeMetrics {
  state: AgentState;
  queueDepth: number;
  execTimeMs: number;
  tasksCompleted: number;
}

interface LiveStats {
  signalsLastHour: number;
  highRiskAlerts: number;
  membersActive: number;
  orchestrationsToday: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// sc.reasoningLines and sc.agentPanels are now sourced per active citizen from
// scenarioFor(activeCitizenId).reasoningLines / .agentPanels — see scenarioRegistry.ts.

const SCENARIO_SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  HIGH: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', border: 'rgba(239,68,68,0.35)' },
  MEDIUM: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
  CRITICAL: { bg: 'rgba(239,68,68,0.2)', text: '#ff4d4d', border: 'rgba(239,68,68,0.6)' },
  LOW: { bg: 'rgba(107,114,128,0.12)', text: '#6b7280', border: 'rgba(107,114,128,0.3)' },
};

const activityTypeColors: Record<string, string> = {
  info: '#8d8d8d',
  success: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const BASE_LIVE_STATS: LiveStats = {
  signalsLastHour: 847,
  highRiskAlerts: 4,
  membersActive: 2341,
  orchestrationsToday: 1284,
};

// ─── Agent state color map ────────────────────────────────────────────────────

const AGENT_STATE_CONFIG: Record<
  AgentState,
  { color: string; bg: string; border: string; label: string; pulse: boolean }
> = {
  idle: {
    color: '#6b7280',
    bg: 'rgba(107,114,128,0.12)',
    border: 'rgba(107,114,128,0.3)',
    label: 'IDLE',
    pulse: false,
  },
  processing: {
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.45)',
    label: 'PROCESSING',
    pulse: true,
  },
  resolved: {
    color: '#42be65',
    bg: 'rgba(66,190,101,0.12)',
    border: 'rgba(66,190,101,0.35)',
    label: 'RESOLVED',
    pulse: false,
  },
};

// ─── Population Signal Stream ─────────────────────────────────────────────────

const POP_MEMBER_NAMES = [
  'R. Thompson',
  'J. Patel',
  'L. Garcia',
  'M. Johnson',
  'A. Williams',
  'D. Martinez',
  'S. Brown',
  'K. Davis',
  'C. Wilson',
  'N. Anderson',
  'T. Taylor',
  'B. Thomas',
  'H. Jackson',
  'F. White',
  'G. Harris',
  'P. Martin',
  'E. Clark',
  'V. Lewis',
  'I. Robinson',
  'O. Walker',
];

const POP_SIGNAL_TYPES = [
  {
    type: 'ELIGIBILITY',
    color: '#f59e0b',
    details: ['Medicaid renewal T-30', 'WIC lapsed', 'Childcare subsidy due'],
  },
  {
    type: 'CARE_GAP',
    color: '#ef4444',
    details: ['HbA1c gap 30d', 'Well-child overdue', 'PND screening due'],
  },
  {
    type: 'DISCHARGE',
    color: '#8b5cf6',
    details: ['CAH discharge today', 'ED visit x2', 'Postpartum follow-up'],
  },
  {
    type: 'BEHAVIORAL',
    color: '#22c55e',
    details: ['PHQ-9 elevated', 'SMS engagement', 'Adherence 78%'],
  },
  {
    type: 'SDOH',
    color: '#0C55B8',
    details: ['Transport barrier 47mi', 'Food insecurity', 'Housing waitlist'],
  },
];

let _popSigCounter = 0;
function makePopSig() {
  _popSigCounter++;
  const st = POP_SIGNAL_TYPES[_popSigCounter % POP_SIGNAL_TYPES.length];
  const name = POP_MEMBER_NAMES[_popSigCounter % POP_MEMBER_NAMES.length];
  const detail = st.details[_popSigCounter % st.details.length];
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String((now.getSeconds() + _popSigCounter) % 60).padStart(2, '0')}`;
  return {
    id: `ctrl-sig-${_popSigCounter}`,
    member: name,
    type: st.type,
    detail,
    color: st.color,
    ts,
  };
}

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString() : String(n);
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Agent Status Bar (top-level summary) ─────────────────────────────────────

function AgentStatusBar({
  metrics,
  agentStatuses,
  intercepted,
  agents,
}: {
  metrics: Record<string, AgentRuntimeMetrics>;
  agentStatuses: Record<string, AgentStatus>;
  intercepted: boolean;
  agents: { id: string; name: string; roleColor: string }[];
}) {
  return (
    <div
      className="flex-shrink-0 flex items-center gap-0 px-3 py-2"
      style={{ borderBottom: '1px solid rgba(57,57,57,0.6)', background: '#1a1a1a' }}
    >
      <span
        className="font-mono flex-shrink-0 mr-3"
        style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.12em' }}
      >
        AGENT STATUS
      </span>
      <div className="flex items-center gap-2 flex-1">
        {agents.map((a) => {
          const m = metrics[a.id];
          const status = agentStatuses[a.id];
          const isIntercepted = a.id === 'agent-appeals' && intercepted;
          const stateKey: AgentState = isIntercepted ? 'processing' : m.state;
          const cfg = AGENT_STATE_CONFIG[stateKey];
          const isActive = status === 'active' || status === 'activating' || status === 'intercept';

          return (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded px-3 py-1.5 flex-1 transition-all duration-500"
              style={{
                background: isActive ? cfg.bg : 'rgba(38,38,38,0.6)',
                border: `1px solid ${isActive ? cfg.border : 'rgba(57,57,57,0.5)'}`,
              }}
            >
              {/* State dot */}
              <div
                className="rounded-full flex-shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  background: isActive ? cfg.color : '#393939',
                  boxShadow: isActive && cfg.pulse ? `0 0 8px ${cfg.color}` : 'none',
                  animation: isActive && cfg.pulse ? 'authPulse 1s ease-in-out infinite' : 'none',
                  transition: 'background 0.4s, box-shadow 0.4s',
                }}
              />
              {/* Agent name */}
              <span
                className="font-semibold flex-shrink-0"
                style={{ fontSize: '11px', color: isActive ? '#f4f4f4' : '#4b5563' }}
              >
                {a.name}
              </span>
              {/* State badge */}
              <div
                className="rounded px-1.5 py-0.5 flex-shrink-0"
                style={{
                  background: isActive ? `${cfg.color}18` : 'transparent',
                  border: `1px solid ${isActive ? cfg.border : 'rgba(57,57,57,0.4)'}`,
                }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: '8px',
                    color: isActive ? cfg.color : '#4b5563',
                    letterSpacing: '0.08em',
                  }}
                >
                  {isIntercepted ? 'INTERCEPTED' : isActive ? cfg.label : 'IDLE'}
                </span>
              </div>
              {/* Queue depth */}
              {isActive && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Q:</span>
                  <span
                    className="font-mono font-semibold"
                    style={{ fontSize: '11px', color: m.queueDepth > 0 ? '#f59e0b' : '#42be65' }}
                  >
                    {m.queueDepth}
                  </span>
                </div>
              )}
              {/* Exec time */}
              {isActive && m.execTimeMs > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                  <span style={{ fontSize: '9px', color: '#6f6f6f' }}>⏱</span>
                  <span className="font-mono" style={{ fontSize: '10px', color: '#8d8d8d' }}>
                    {fmtMs(m.execTimeMs)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agent Panel ──────────────────────────────────────────────────────────────

function AgentPanel({
  agent,
  status,
  visibleActivities,
  governanceState,
  metrics,
  onOpenDecisionTree,
}: {
  agent: AgentPanelData;
  status: AgentStatus;
  visibleActivities: number;
  governanceState: 'purple' | 'amber';
  metrics: AgentRuntimeMetrics;
  onOpenDecisionTree: (agentId: string) => void;
}) {
  const roleColors: Record<string, { bg: string; text: string }> = {
    PRIMARY: { bg: 'rgba(12,85,184,0.2)', text: '#0C55B8' },
    CONCURRENT: { bg: 'rgba(139,92,246,0.2)', text: '#8b5cf6' },
    SUPPORTING: { bg: 'rgba(245,158,11,0.2)', text: '#f59e0b' },
    COMPLIANCE: { bg: 'rgba(239,68,68,0.2)', text: '#ef4444' },
  };
  const roleStyle = roleColors[agent.role] || roleColors.PRIMARY;
  const isIntercepted = agent.id === 'agent-appeals' && governanceState === 'amber';
  const stateKey: AgentState = isIntercepted ? 'processing' : metrics.state;
  const stateCfg = AGENT_STATE_CONFIG[stateKey];
  const isActive = status === 'active' || status === 'activating' || status === 'intercept';
  const isClickable = status !== 'idle';

  return (
    <div
      className="rounded flex flex-col overflow-hidden transition-all duration-500 group"
      style={{
        background: isIntercepted ? 'rgba(217,119,6,0.08)' : agent.color,
        border: `1px solid ${isIntercepted ? 'rgba(217,119,6,0.5)' : agent.borderColor}`,
        opacity: status === 'idle' ? 0.4 : 1,
        cursor: isClickable ? 'pointer' : 'default',
        position: 'relative',
      }}
      onClick={() => isClickable && onOpenDecisionTree(agent.id)}
    >
      {/* Clickable hint overlay — shown on hover when active */}
      {isClickable && (
        <div
          className="absolute inset-0 rounded pointer-events-none flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ zIndex: 1 }}
        >
          <div
            className="rounded px-2 py-1 flex items-center gap-1"
            style={{ background: 'rgba(0,0,0,0.8)', border: `1px solid ${agent.roleColor}55` }}
          >
            <span
              style={{
                fontSize: '9px',
                color: agent.roleColor,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
              }}
            >
              VIEW DECISION TREE ↗
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{
          borderBottom: `1px solid ${agent.borderColor}`,
          background: 'rgba(0,0,0,0.25)',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="rounded-full transition-all duration-300"
            style={{
              width: 7,
              height: 7,
              background: status === 'active' ? agent.roleColor : '#393939',
              boxShadow: status === 'active' ? `0 0 6px ${agent.roleColor}` : 'none',
              animation: status === 'active' ? 'authPulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
          <span className="font-semibold text-white" style={{ fontSize: '12px' }}>
            {agent.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded px-1.5 py-0.5" style={{ background: roleStyle.bg }}>
            <span
              className="font-mono"
              style={{ fontSize: '8px', color: roleStyle.text, letterSpacing: '0.08em' }}
            >
              {agent.role}
            </span>
          </div>
          {isClickable && (
            <div
              className="rounded px-1.5 py-0.5 flex items-center gap-1"
              style={{
                background: `${agent.roleColor}15`,
                border: `1px solid ${agent.roleColor}35`,
              }}
            >
              <span style={{ fontSize: '9px', color: agent.roleColor }}>⬡</span>
              <span
                className="font-mono"
                style={{ fontSize: '8px', color: agent.roleColor, letterSpacing: '0.06em' }}
              >
                TREE
              </span>
            </div>
          )}
          {isIntercepted && (
            <div
              className="rounded px-1.5 py-0.5 animate-intercept"
              style={{
                background: 'rgba(217,119,6,0.25)',
                border: '1px solid rgba(217,119,6,0.5)',
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: '8px', color: '#f59e0b', letterSpacing: '0.08em' }}
              >
                INTERCEPTED
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Real-time metrics row */}
      {isActive && (
        <div
          className="flex items-center gap-3 px-3 py-1.5 flex-shrink-0 transition-all duration-500"
          style={{ borderBottom: `1px solid ${agent.borderColor}`, background: 'rgba(0,0,0,0.15)' }}
        >
          {/* State transition pill */}
          <div
            className="flex items-center gap-1.5 rounded px-2 py-0.5"
            style={{ background: stateCfg.bg, border: `1px solid ${stateCfg.border}` }}
          >
            <div
              className="rounded-full flex-shrink-0"
              style={{
                width: 6,
                height: 6,
                background: stateCfg.color,
                animation: stateCfg.pulse ? 'authPulse 0.9s ease-in-out infinite' : 'none',
              }}
            />
            <span
              className="font-mono font-semibold"
              style={{ fontSize: '9px', color: stateCfg.color, letterSpacing: '0.1em' }}
            >
              {isIntercepted ? 'INTERCEPTED' : stateCfg.label}
            </span>
          </div>

          {/* Queue depth */}
          <div className="flex items-center gap-1">
            <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Queue:</span>
            <span
              className="font-mono font-semibold"
              style={{
                fontSize: '12px',
                color:
                  metrics.queueDepth > 2
                    ? '#f59e0b'
                    : metrics.queueDepth > 0
                      ? '#f4f4f4'
                      : '#42be65',
                transition: 'color 0.3s',
              }}
            >
              {metrics.queueDepth}
            </span>
          </div>

          {/* Exec time */}
          <div className="flex items-center gap-1">
            <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Exec:</span>
            <span className="font-mono" style={{ fontSize: '11px', color: '#8d8d8d' }}>
              {fmtMs(metrics.execTimeMs)}
            </span>
          </div>

          {/* Tasks completed */}
          <div className="flex items-center gap-1 ml-auto">
            <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Done:</span>
            <span
              className="font-mono font-semibold"
              style={{ fontSize: '11px', color: '#42be65' }}
            >
              {metrics.tasksCompleted}
            </span>
          </div>
        </div>
      )}

      {/* Owns row */}
      <div className="px-3 pt-2 flex items-center gap-1 flex-shrink-0">
        <span style={{ fontSize: '9px', color: '#6b7280' }}>Owns:</span>
        {agent.owns.map((condId) => (
          <div
            key={`own-${agent.id}-${condId}`}
            className="rounded-full flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <span className="font-mono font-semibold" style={{ fontSize: '8px', color: '#c6c6c6' }}>
              {condId}
            </span>
          </div>
        ))}
      </div>

      {/* Activity log */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 min-h-0">
        {status === 'idle' && (
          <div className="flex items-center gap-2 py-2">
            <span style={{ fontSize: '10px', color: '#4b5563' }}>Awaiting dispatch...</span>
          </div>
        )}
        {status === 'activating' && (
          <div className="flex items-center gap-2 py-2">
            <div
              className="rounded-full"
              style={{
                width: 5,
                height: 5,
                background: agent.roleColor,
                animation: 'authPulse 0.8s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: '10px', color: '#8d8d8d' }}>Initializing...</span>
          </div>
        )}
        {(status === 'active' || status === 'intercept' || status === 'complete') &&
          agent.activities.slice(0, visibleActivities).map((activity, i) => (
            <div
              key={activity.id}
              className="flex items-start gap-2 fade-in"
              style={{ animationDelay: `${i * 0.3}s` }}
            >
              <div
                className="rounded-full flex-shrink-0 mt-1"
                style={{ width: 4, height: 4, background: activityTypeColors[activity.type] }}
              />
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span
                  style={{
                    fontSize: '10px',
                    color:
                      activity.type === 'critical'
                        ? '#ef4444'
                        : activity.type === 'warning'
                          ? '#f59e0b'
                          : activity.type === 'success'
                            ? '#22c55e'
                            : '#c6c6c6',
                    lineHeight: 1.4,
                  }}
                >
                  {activity.text}
                </span>
                <span className="font-mono" style={{ fontSize: '8px', color: '#4b5563' }}>
                  {activity.timestamp}
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Decision Tree Data ───────────────────────────────────────────────────────

interface DecisionNode {
  label: string;
  value: string;
  color?: string;
}

interface DecisionTreeData {
  agentName: string;
  agentColor: string;
  inputs: DecisionNode[];
  constraints: DecisionNode[];
  alternativesRejected: DecisionNode[];
  finalAction: { label: string; rationale: string; color: string };
}

const AGENT_DECISION_TREES: Record<string, DecisionTreeData> = {
  'agent-care': {
    agentName: 'Clinical Care Agent',
    agentColor: '#0C55B8',
    inputs: [
      {
        label: 'Signal',
        value: 'AUTH_EXPIRY — CAREGAP_HBA1C expiring T-4 days, HbA1c lab order contested',
        color: '#f1c21b',
      },
      {
        label: 'Signal',
        value: 'CARE_GAP — HbA1c gap CAREGAP_001 open 45 days, diabetes episode active',
        color: '#fa4d56',
      },
      {
        label: 'Signal',
        value: 'BEHAVIORAL — portal engagement 2×/week, high receptivity window',
        color: '#42be65',
      },
      {
        label: 'Member Context',
        value: 'Maria Redhawk — Day 34 of 90-day post-acute postpartum episode',
        color: '#78a9ff',
      },
      {
        label: 'Journey State',
        value: 'Post-acute monitoring phase — auth renewal window critical',
        color: '#78a9ff',
      },
      {
        label: 'Receptivity',
        value: 'Portal engagement elevated — member readiness window open',
        color: '#42be65',
      },
    ],
    constraints: [
      {
        label: 'Sensitivity',
        value: 'HIGH — do not over-communicate at post-acute stage',
        color: '#f59e0b',
      },
      {
        label: 'Channel Constraint',
        value:
          'Portal preferred — evidence: IVR Day 1 · 2 phone attempts unanswered Day 8–11 · Portal self-initiated Day 14 · Portal 2×/week Day 14–34 (20 days behavioral pattern)',
        color: '#8b5cf6',
      },
      {
        label: 'Dependency',
        value: 'Auth renewal blocked until Bennett County Health eligibility resolves',
        color: '#fa4d56',
      },
      {
        label: 'Timing',
        value: 'Q4 SD Medicaid quality window — care gap closure is enterprise priority',
        color: '#f1c21b',
      },
      {
        label: 'Frequency',
        value: 'Combine touchpoints — member fatigue risk if separate outreach',
        color: '#f59e0b',
      },
    ],
    alternativesRejected: [
      {
        label: 'Rejected',
        value:
          'Separate auth outreach + separate care gap outreach → member fatigue, 2 touchpoints unnecessary',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value:
          'Phone outreach → 2 prior unanswered attempts Day 8 + Day 11 · portal engagement pattern confirms digital channel preferred',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value: 'Delay auth renewal workflow → T-4 days is critical window, cannot defer',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value:
          'Immediate auth submission without eligibility check → continuity risk if Bennett County Health lapses',
        color: '#ef4444',
      },
    ],
    finalAction: {
      label: 'ACT NOW — Combined auth + care gap outreach via portal at 10am',
      rationale:
        'Member receptivity window is open. Combining touchpoints preserves member experience. Auth sequenced after eligibility confirmation. HbA1c order placed concurrently. Single coordinated intervention maximizes outcome probability.',
      color: '#42be65',
    },
  },
  'agent-provider': {
    agentName: 'Social / SDOH Agent',
    agentColor: '#8b5cf6',
    inputs: [
      {
        label: 'Provider Record',
        value: 'Bennett County Health — NPI 1234567890 — Attending cardiologist for Maria Redhawk',
        color: '#8b5cf6',
      },
      {
        label: 'Eligibility Status',
        value: 'PROVIDER_001 — eligibility renewal in progress — 21 days remaining',
        color: '#f59e0b',
      },
      {
        label: 'Role Scope',
        value: 'Attending (12 members) · Referring (7 members) · Network (240 members)',
        color: '#78a9ff',
      },
      {
        label: 'Episode Dependency',
        value:
          'Maria postpartum episode continuity requires Bennett County Health active eligibility',
        color: '#fa4d56',
      },
      {
        label: 'Communication Constraint',
        value: 'EHR only — phone outreach suppressed per provider preference',
        color: '#8b5cf6',
      },
    ],
    constraints: [
      {
        label: 'Hard Constraint',
        value:
          'Auth renewal for Maria cannot finalize if eligibility lapses — sequencing dependency',
        color: '#fa4d56',
      },
      {
        label: 'Channel',
        value: 'EHR notification only — phone outreach suppressed',
        color: '#8b5cf6',
      },
      {
        label: 'Scope',
        value: 'Eligibility gap affects 12 active attending episodes — not just Maria',
        color: '#f59e0b',
      },
      {
        label: 'Urgency',
        value: '21-day window — standard renewal timeline is 14 days — margin is thin',
        color: '#f1c21b',
      },
    ],
    alternativesRejected: [
      {
        label: 'Rejected',
        value:
          'Phone outreach to Bennett County Health → suppressed per provider communication preference',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value: 'Escalate to network adequacy review → premature, eligibility still active',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value:
          'Proceed with auth renewal without eligibility check → creates continuity risk for Maria episode',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value: 'Delay eligibility notification → 21-day margin too thin to defer',
        color: '#ef4444',
      },
    ],
    finalAction: {
      label:
        'Initiate eligibility renewal via EHR — notify Bennett County Health — preserve episode continuity',
      rationale:
        "Eligibility renewal initiated through EHR channel per provider preference. Bennett County Health notified. Episode continuity alert issued to ensure Maria's postpartum episode is not disrupted. Auth renewal sequenced to follow eligibility confirmation.",
      color: '#42be65',
    },
  },
  'agent-util': {
    agentName: 'Eligibility Agent',
    agentColor: '#f59e0b',
    inputs: [
      {
        label: 'Auth Record',
        value: 'CAREGAP_HBA1C — HbA1c lab order — contested utilization review',
        color: '#f59e0b',
      },
      {
        label: 'Policy Reference',
        value:
          'SD Medicaid coverage policy — medical necessity criteria for postpartum care procedures',
        color: '#78a9ff',
      },
      {
        label: 'Clinical Record',
        value: 'Postpartum EP study documentation — 3 supporting records available',
        color: '#42be65',
      },
      {
        label: 'integrity Check',
        value: 'Fraud, Waste & Abuse screening — procedure pattern analysis',
        color: '#fa4d56',
      },
      {
        label: 'TCOC Context',
        value: 'Plan TCOC at ceiling — cost-generating actions require leadership flag',
        color: '#f59e0b',
      },
    ],
    constraints: [
      {
        label: 'Policy Boundary',
        value: 'Clinical necessity must be established before auth can proceed',
        color: '#fa4d56',
      },
      {
        label: 'TCOC Constraint',
        value:
          'Cost-generating actions flagged — leadership notification required if threshold exceeded',
        color: '#f59e0b',
      },
      {
        label: 'integrity Requirement',
        value: 'All contested auths require integrity screening before submission',
        color: '#8b5cf6',
      },
      {
        label: 'Timeline',
        value: 'Eligibility review response expected within 4 hours — deadline binding',
        color: '#f1c21b',
      },
    ],
    alternativesRejected: [
      {
        label: 'Rejected',
        value:
          'Submit auth without medical necessity documentation → policy violation, denial risk',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value:
          'Escalate to manual review immediately → clinical criteria met, automation sufficient',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value: 'Defer integrity check → required for all contested auths, cannot skip',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value:
          'Flag for leadership review → total-cost-of-care threshold not exceeded by this single auth',
        color: '#ef4444',
      },
    ],
    finalAction: {
      label:
        'Assemble clinical necessity package — submit utilization review — integrity check passed',
      rationale:
        'Clinical criteria confirmed against SD Medicaid coverage policy. Clinical necessity documentation assembled from 3 supporting records. integrity screening passed. Eligibility review submitted with 4-hour response window. total-cost-of-care threshold not triggered — no leadership escalation required.',
      color: '#42be65',
    },
  },
  'agent-appeals': {
    agentName: 'Behavioral Health Agent',
    agentColor: '#ef4444',
    inputs: [
      {
        label: 'Appeal Condition',
        value: 'Condition 3 — SD Medicaid appeal deadline T-72 hours — CRITICAL',
        color: '#ef4444',
      },
      {
        label: 'SD Medicaid Requirements',
        value: 'Clinical necessity determination required — SD Medicaid appeal standards verified',
        color: '#fa4d56',
      },
      {
        label: 'Supporting Records',
        value: '3 records attached — postpartum EP + HbA1c gap + auth history',
        color: '#42be65',
      },
      {
        label: 'Response Draft',
        value: 'Pre-drafted appeal response — reviewer edits only required',
        color: '#78a9ff',
      },
      {
        label: 'Governance Policy',
        value: 'SD Medicaid.APPEAL.AUTO.THRESHOLD.001 — automated authority limit',
        color: '#8b5cf6',
      },
    ],
    constraints: [
      {
        label: 'Hard Deadline',
        value: 'T-72 hours — state regulatory deadline — non-negotiable',
        color: '#ef4444',
      },
      {
        label: 'Governance Threshold',
        value:
          'Clinical necessity determination exceeds automated authority — human review required',
        color: '#f59e0b',
      },
      {
        label: 'Policy Constraint',
        value:
          'SD Medicaid.APPEAL.AUTO.THRESHOLD.001 — cannot auto-dispatch without clinical sign-off',
        color: '#8b5cf6',
      },
      {
        label: 'Audit Requirement',
        value: 'All appeal decisions must be logged — audit trail initialized',
        color: '#8b5cf6',
      },
    ],
    alternativesRejected: [
      {
        label: 'Rejected',
        value:
          'Auto-dispatch appeal response → exceeds automated authority threshold — governance intercept required',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value:
          'Delay for additional clinical review → T-72h deadline does not permit extended review cycle',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value: 'Escalate to legal review → clinical necessity determination is clinical, not legal',
        color: '#ef4444',
      },
      {
        label: 'Rejected',
        value: 'Request deadline extension from SD Medicaid → not available for this appeal type',
        color: '#ef4444',
      },
    ],
    finalAction: {
      label:
        'GOVERNANCE INTERCEPT — Hold for human clinical reviewer — pre-assembled context ready',
      rationale:
        'Automated authority threshold exceeded. Clinical necessity determination requires human sign-off per SD Medicaid.APPEAL.AUTO.THRESHOLD.001. Reviewer context pre-assembled — appeal summary, 3 supporting records, pre-drafted response. Reviewer notified. Audit trail initialized. 68 hours remaining on deadline.',
      color: '#f59e0b',
    },
  },
};

// ─── Decision Tree Modal ──────────────────────────────────────────────────────

interface DTTokens {
  id: string;
  name: string;
  firstName: string;
  org: string;
  topGapName: string;
  gapId: string;
  episode: string;
  contract: string;
  day: number;
  window: number;
}

function personalizeDT(s: string, t: DTTokens): string {
  return s
    .replace(/Maria Redhawk/g, t.name)
    .replace(/CAREGAP_HBA1C/g, t.gapId)
    .replace(/CAREGAP_001/g, t.gapId)
    .replace(/HbA1c/g, t.topGapName)
    .replace(/Bennett County Health/g, t.org)
    .replace(
      /Day 34 of 90-day post-acute postpartum episode/g,
      `Day ${t.day} of ${t.window}-day ${t.episode} episode`
    )
    .replace(/Day 34 of 90-day/g, `Day ${t.day} of ${t.window}-day`)
    .replace(/Day 34/g, `Day ${t.day}`)
    .replace(/post-acute postpartum/gi, `post-acute ${t.episode}`)
    .replace(/postpartum episode/gi, `${t.episode} episode`)
    .replace(/postpartum/gi, t.episode)
    .replace(/diabetes episode/g, `${t.episode} episode`)
    .replace(/SD Medicaid coverage policy/g, `${t.contract} coverage policy`)
    .replace(/Q4 SD Medicaid/g, t.contract)
    .replace(/\bMaria\b/g, t.firstName);
}

function DecisionTreeModal({ data, onClose }: { data: DecisionTreeData; onClose: () => void }) {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const reg = getPatientById(activeCitizenId) ?? placeholderMember(activeCitizenId);
  const journey = journeyForPatient(reg);
  const topGap =
    (reg.careGaps || []).find((g) => g.domain === 'Clinical' && g.status !== 'Closed') ||
    reg.careGaps?.[0];
  const t: DTTokens = {
    id: reg.platformId,
    name: reg.name,
    firstName: reg.name.split(' ')[0],
    org: reg.organization.replace(/ \(.*\)/, ''),
    topGapName: topGap ? topGap.name.replace(/ \(.*\)/, '') : 'Care gap',
    gapId: topGap
      ? `CAREGAP_${topGap.name
          .replace(/[^A-Za-z0-9]/g, '')
          .toUpperCase()
          .slice(0, 8)}`
      : 'CAREGAP_001',
    episode: reg.episodeType,
    contract: reg.contract,
    day: journey.currentDay,
    window: journey.windowDays,
  };
  const px = (v: string) => personalizeDT(v, t);
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center fade-in"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg flex flex-col fade-in-up overflow-hidden"
        style={{
          background: '#1c1c1c',
          border: `2px solid ${data.agentColor}55`,
          boxShadow: `0 0 60px ${data.agentColor}22`,
          maxWidth: 760,
          width: '92%',
          maxHeight: '88vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{
            borderBottom: `1px solid ${data.agentColor}30`,
            background: `${data.agentColor}0d`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="rounded-full"
              style={{
                width: 10,
                height: 10,
                background: data.agentColor,
                boxShadow: `0 0 8px ${data.agentColor}`,
              }}
            />
            <div>
              <div
                className="font-mono"
                style={{
                  fontSize: '10px',
                  color: data.agentColor,
                  letterSpacing: '0.14em',
                  marginBottom: 2,
                }}
              >
                AGENT DECISION TREE
              </div>
              <div className="text-white font-semibold" style={{ fontSize: '18px' }}>
                {data.agentName}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 transition-all duration-150"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#8d8d8d',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ESC ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5 min-h-0">
          {/* Inputs Considered */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="rounded-full"
                style={{ width: 6, height: 6, background: '#78a9ff' }}
              />
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '11px', color: '#78a9ff', letterSpacing: '0.12em' }}
              >
                INPUTS CONSIDERED
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {data.inputs.map((node, i) => (
                <div
                  key={`inp-${i}`}
                  className="flex items-start gap-3 rounded px-4 py-2.5"
                  style={{
                    background: 'rgba(120,169,255,0.06)',
                    border: '1px solid rgba(120,169,255,0.18)',
                  }}
                >
                  <div
                    className="rounded px-2 py-0.5 flex-shrink-0 mt-0.5"
                    style={{
                      background: `${node.color || '#78a9ff'}18`,
                      border: `1px solid ${node.color || '#78a9ff'}40`,
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '9px',
                        color: node.color || '#78a9ff',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {node.label}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#c6c6c6', lineHeight: 1.5 }}>
                    {px(node.value)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Constraints Evaluated */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="rounded-full"
                style={{ width: 6, height: 6, background: '#f59e0b' }}
              />
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '11px', color: '#f59e0b', letterSpacing: '0.12em' }}
              >
                CONSTRAINTS EVALUATED
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {data.constraints.map((node, i) => (
                <div
                  key={`con-${i}`}
                  className="flex items-start gap-3 rounded px-4 py-2.5"
                  style={{
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.18)',
                  }}
                >
                  <div
                    className="rounded px-2 py-0.5 flex-shrink-0 mt-0.5"
                    style={{
                      background: `${node.color || '#f59e0b'}18`,
                      border: `1px solid ${node.color || '#f59e0b'}40`,
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '9px',
                        color: node.color || '#f59e0b',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {node.label}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#c6c6c6', lineHeight: 1.5 }}>
                    {px(node.value)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Alternatives Rejected */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="rounded-full"
                style={{ width: 6, height: 6, background: '#ef4444' }}
              />
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '11px', color: '#ef4444', letterSpacing: '0.12em' }}
              >
                ALTERNATIVES REJECTED
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {data.alternativesRejected.map((node, i) => (
                <div
                  key={`alt-${i}`}
                  className="flex items-start gap-3 rounded px-4 py-2.5"
                  style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.18)',
                  }}
                >
                  <div className="flex-shrink-0 mt-1">
                    <span style={{ fontSize: '12px', color: '#ef4444' }}>✕</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#8d8d8d', lineHeight: 1.5 }}>
                    {px(node.value)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Final Action Selected */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="rounded-full"
                style={{ width: 6, height: 6, background: data.finalAction.color }}
              />
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '11px', color: data.finalAction.color, letterSpacing: '0.12em' }}
              >
                FINAL ACTION SELECTED
              </span>
            </div>
            <div
              className="rounded px-5 py-4 flex flex-col gap-3"
              style={{
                background: `${data.finalAction.color}0d`,
                border: `1px solid ${data.finalAction.color}40`,
              }}
            >
              <div className="flex items-start gap-3">
                <span style={{ fontSize: '16px', flexShrink: 0 }}>►</span>
                <span
                  className="font-semibold text-white"
                  style={{ fontSize: '14px', lineHeight: 1.4 }}
                >
                  {px(data.finalAction.label)}
                </span>
              </div>
              <div
                className="rounded px-4 py-3"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  className="font-mono mb-1.5"
                  style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.1em' }}
                >
                  RATIONALE
                </div>
                <p style={{ fontSize: '12px', color: '#a8a8a8', lineHeight: 1.65 }}>
                  {px(data.finalAction.rationale)}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3"
          style={{ borderTop: `1px solid ${data.agentColor}20`, background: 'rgba(0,0,0,0.2)' }}
        >
          <span
            className="font-mono"
            style={{ fontSize: '10px', color: '#4b5563', letterSpacing: '0.08em' }}
          >
            DECISION TREE — {data.agentName.toUpperCase()} — {t.id}
          </span>
          <button
            onClick={onClose}
            className="rounded px-4 py-2 transition-all duration-150"
            style={{
              background: `${data.agentColor}18`,
              border: `1px solid ${data.agentColor}40`,
              color: data.agentColor,
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.06em',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const INITIAL_METRICS: Record<string, AgentRuntimeMetrics> = {
  'agent-care': { state: 'idle', queueDepth: 0, execTimeMs: 0, tasksCompleted: 0 },
  'agent-provider': { state: 'idle', queueDepth: 0, execTimeMs: 0, tasksCompleted: 0 },
  'agent-util': { state: 'idle', queueDepth: 0, execTimeMs: 0, tasksCompleted: 0 },
  'agent-appeals': { state: 'idle', queueDepth: 0, execTimeMs: 0, tasksCompleted: 0 },
  'agent-caregiver': { state: 'idle', queueDepth: 0, execTimeMs: 0, tasksCompleted: 0 },
  'agent-financial': { state: 'idle', queueDepth: 0, execTimeMs: 0, tasksCompleted: 0 },
};

// Initial queue depths per agent (tasks to process)
const AGENT_INITIAL_QUEUE: Record<string, number> = {
  'agent-care': 5,
  'agent-provider': 5,
  'agent-util': 4,
  'agent-appeals': 4,
  'agent-caregiver': 4,
  'agent-financial': 4,
};

// ─── Controller 5 Cognitive Functions ────────────────────────────────────────

type CognitiveFn = 'sense' | 'plan' | 'decide' | 'monitor' | 'learn';

const COGNITIVE_FUNCTIONS: { id: CognitiveFn; label: string; sublabel: string; color: string }[] = [
  { id: 'sense', label: 'Sense', sublabel: 'Understand', color: '#78a9ff' },
  { id: 'plan', label: 'Plan', sublabel: 'Decompose', color: '#f1c21b' },
  { id: 'decide', label: 'Decide', sublabel: 'Orchestrate', color: '#FF6310' },
  { id: 'monitor', label: 'Monitor', sublabel: 'Adapt', color: '#8b5cf6' },
  { id: 'learn', label: 'Learn', sublabel: 'Improve', color: '#42be65' },
];

// ─── Strategic Orchestration Agents ──────────────────────────────────────────

const STRATEGIC_AGENTS = [
  {
    id: 'sa-journey',
    label: 'Journey Strategy',
    detail: 'Consumer/Provider/Operational journey context',
    color: '#42be65',
  },
  {
    id: 'sa-population',
    label: 'Population Health',
    detail: 'Risk trends · Population signals · Cohort analysis',
    color: '#78a9ff',
  },
  {
    id: 'sa-value',
    label: 'Value & Quality',
    detail: 'SD Medicaid quality · RHTP measures',
    color: '#f1c21b',
  },
  {
    id: 'sa-network',
    label: 'Network Optimization',
    detail: 'Network adequacy · Provider alignment · Gaps',
    color: '#8b5cf6',
  },
];

function ControllerScreenInner() {
  const setScreen = useDemoStore((s) => s.setScreen);
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const sc = useMemo(() => scenarioFor(activeCitizenId), [activeCitizenId]);
  // Per-citizen tokens for the authored "resolved" caregiver/med-management + consent threads,
  // so they bind to the active patient + their cared-for (caregiverFor) member instead of Maria/Elena.
  const reg = getPatientById(activeCitizenId) ?? placeholderMember(activeCitizenId);
  const firstName = reg.name.split(' ')[0];
  const orgName = reg.organization.replace(/ \(.*\)/, '');
  const pcpName = reg.pcp || orgName;
  const cg = reg.household?.caregiverFor?.[0];
  const cgName = cg?.name ?? 'cared-for member';
  const cgFirst = cg ? cg.name.split(' ')[0] : 'cared-for member';
  const cgMed1 = cg?.meds?.[0]?.name ?? 'Medication A';
  const cgMed2 = cg?.meds?.[1]?.name ?? cg?.meds?.[0]?.name ?? 'Medication B';
  const cgPrescriber = cg?.prescriber ?? orgName;
  const cgPharmacy = cg?.pharmacy ?? 'Pharmacy';
  const careMgrName = reg.careManager || 'Care Manager';
  const governanceInterceptTriggered = useDemoStore((s) => s.governanceInterceptTriggered);
  const [agentStatus, setAgentStatus] = useState<Record<string, AgentStatus>>(() =>
    Object.fromEntries(sc.agentPanels.map((a) => [a.id, 'idle' as AgentStatus]))
  );
  const [visibleReasoningLines, setVisibleReasoningLines] = useState<string[]>([]);
  const [visibleActivities, setVisibleActivities] = useState<Record<string, number>>(() =>
    Object.fromEntries(sc.agentPanels.map((a) => [a.id, 0]))
  );
  const [dispatched, setDispatched] = useState(false);
  const [governanceState, setGovernanceState] = useState<'purple' | 'amber'>('purple');
  const [interceptBanner, setInterceptBanner] = useState(false);
  const [consentInterceptBanner, setConsentInterceptBanner] = useState(false);
  const [mtmInterceptBanner, setMtmInterceptBanner] = useState(false);
  const [showTriggerMoment, setShowTriggerMoment] = useState(false);
  const [triggerDismissed, setTriggerDismissed] = useState(false);
  const [visibleSignalCount, setVisibleSignalCount] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const [showPhase2Header, setShowPhase2Header] = useState(false);
  const [visiblePhase2Count, setVisiblePhase2Count] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [mariaStatus, setMariaStatus] = useState<'active' | 'resolved'>('active');
  const [popSignals, setPopSignals] = useState<ReturnType<typeof makePopSig>[]>([]);
  const [queueCountdown, setQueueCountdown] = useState({
    'SCN-002': '4:32',
    'SCN-003': '7:15',
    'SCN-004': '2:48',
  });
  const [liveStats, setLiveStats] = useState<LiveStats>(BASE_LIVE_STATS);
  // Real-time agent runtime metrics
  const [agentMetrics, setAgentMetrics] = useState<Record<string, AgentRuntimeMetrics>>(() =>
    Object.fromEntries(
      sc.agentPanels.map((a) => [
        a.id,
        { state: 'idle' as AgentState, queueDepth: 0, execTimeMs: 0, tasksCompleted: 0 },
      ])
    )
  );
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const popIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const metricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<SignalGeneratorEngine | null>(null);
  const triggerDismissedRef = useRef(false);
  const agentStatusRef = useRef(agentStatus);
  const [activeCognitiveFn, setActiveCognitiveFn] = useState<CognitiveFn>('sense');
  const [showStrategicAgents, setShowStrategicAgents] = useState(false);
  const [showJourneyPanel, setShowJourneyPanel] = useState(false);
  const [activeDecisionTree, setActiveDecisionTree] = useState<string | null>(null);

  useEffect(() => {
    triggerDismissedRef.current = triggerDismissed;
  }, [triggerDismissed]);
  useEffect(() => {
    agentStatusRef.current = agentStatus;
  }, [agentStatus]);

  // Down arrow handler — dismisses trigger modal if it is showing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && showTriggerMoment && !triggerDismissedRef.current) {
        e.stopPropagation();
        setShowTriggerMoment(false);
        setTriggerDismissed(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [showTriggerMoment]);

  // Live metrics ticker — updates exec time, queue depth, state transitions per active agent
  useEffect(() => {
    metricsIntervalRef.current = setInterval(() => {
      setAgentMetrics((prev) => {
        const next = { ...prev };
        const statuses = agentStatusRef.current;
        sc.agentPanels.forEach((agent) => {
          const status = statuses[agent.id];
          const m = { ...next[agent.id] };
          if (status === 'activating') {
            m.state = 'processing';
            m.queueDepth = AGENT_INITIAL_QUEUE[agent.id];
            m.execTimeMs = 0;
          } else if (status === 'active' || status === 'intercept') {
            // Only increment exec time while still processing — freeze when resolved
            if (m.state !== 'resolved') {
              m.execTimeMs += 120 + Math.floor(Math.random() * 80);
            }
            // Drain queue as tasks complete
            if (m.queueDepth > 0 && Math.random() > 0.6) {
              m.queueDepth = Math.max(0, m.queueDepth - 1);
              m.tasksCompleted += 1;
            }
            // Transition to resolved when queue empty
            if (m.queueDepth === 0 && m.tasksCompleted >= AGENT_INITIAL_QUEUE[agent.id]) {
              m.state =
                agent.id === 'agent-appeals' && statuses[agent.id] === 'intercept'
                  ? 'processing'
                  : 'resolved';
            } else {
              m.state = 'processing';
            }
          } else if (status === 'complete') {
            m.state = 'resolved';
            m.queueDepth = 0;
          } else {
            m.state = 'idle';
          }
          next[agent.id] = m;
        });
        return next;
      });
    }, 600);
    return () => {
      if (metricsIntervalRef.current) clearInterval(metricsIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    setScreen('controller');

    const tTrigger = setTimeout(() => setShowTriggerMoment(true), 400);
    timerRefs.current.push(tTrigger);

    // Show strategic agents layer after brief delay
    const tStrategic = setTimeout(() => setShowStrategicAgents(true), 800);
    const tJourney = setTimeout(() => setShowJourneyPanel(true), 1200);
    timerRefs.current.push(tStrategic, tJourney);

    popIntervalRef.current = setInterval(() => {
      setPopSignals((prev) => [makePopSig(), ...prev].slice(0, 10));
    }, 1100);

    engineRef.current = new SignalGeneratorEngine((signal: Signal) => {
      setLiveStats((prev) => {
        const next = { ...prev };
        next.signalsLastHour = prev.signalsLastHour + 1;
        next.membersActive = Math.min(
          prev.membersActive + (signal.complexity === 'HIGH' ? 2 : 1),
          3200
        );
        if (signal.complexity === 'HIGH') {
          next.highRiskAlerts = Math.min(prev.highRiskAlerts + 1, 20);
        }
        if (signal.complexity === 'ROUTINE') {
          next.orchestrationsToday = prev.orchestrationsToday + 1;
        }
        return next;
      });
    }, 3);
    engineRef.current.start();

    return () => {
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
      if (popIntervalRef.current) clearInterval(popIntervalRef.current);
      if (metricsIntervalRef.current) clearInterval(metricsIntervalRef.current);
      engineRef.current?.stop();
    };
  }, [setScreen]);

  // Sequential signal reveal when trigger modal opens
  useEffect(() => {
    if (!showTriggerMoment) {
      setVisibleSignalCount(0);
      setShowSummary(false);
      setShowContinue(false);
      setShowPhase2Header(false);
      setVisiblePhase2Count(0);
      setShowUpgrade(false);
      return;
    }
    // Phase 1 — trigger signals
    const t1 = setTimeout(() => setVisibleSignalCount(1), 600);
    const t2 = setTimeout(() => setVisibleSignalCount(2), 1500);
    const t3 = setTimeout(() => setVisibleSignalCount(3), 2400);
    const t4 = setTimeout(() => setShowSummary(true), 3400);
    // Phase 2 — graph enrichment
    const t5 = setTimeout(() => setShowPhase2Header(true), 4600);
    const t6 = setTimeout(() => setVisiblePhase2Count(1), 5400);
    const t7 = setTimeout(() => setVisiblePhase2Count(2), 6200);
    const t8 = setTimeout(() => setVisiblePhase2Count(3), 7000);
    const t9 = setTimeout(() => setShowUpgrade(true), 7800);
    const t10 = setTimeout(() => setShowContinue(true), 8600);
    timerRefs.current.push(t1, t2, t3, t4, t5, t6, t7, t8, t9, t10);
    return () => {
      [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10].forEach(clearTimeout);
    };
  }, [showTriggerMoment]);

  // Start reasoning trace only after trigger modal is dismissed
  useEffect(() => {
    if (!triggerDismissed) return;

    sc.reasoningLines.forEach((line) => {
      const t = setTimeout(() => {
        setVisibleReasoningLines((prev) => [...prev, line.id]);
      }, line.delay);
      timerRefs.current.push(t);
    });

    const dispatchTimer = setTimeout(
      () => {
        setDispatched(true);
        sc.agentPanels.forEach((agent) => {
          setAgentStatus((prev) => ({ ...prev, [agent.id]: 'activating' }));
          const activeTimer = setTimeout(() => {
            setAgentStatus((prev) => ({ ...prev, [agent.id]: 'active' }));
            agent.activities.forEach((_, i) => {
              const actTimer = setTimeout(
                () => {
                  setVisibleActivities((prev) => ({ ...prev, [agent.id]: i + 1 }));
                },
                400 + i * 600
              );
              timerRefs.current.push(actTimer);
            });
          }, 300);
          timerRefs.current.push(activeTimer);
        });
      },
      800 + 4600 + 400
    );
    timerRefs.current.push(dispatchTimer);
  }, [triggerDismissed]);

  // Cycle through cognitive functions as agents work
  useEffect(() => {
    if (!dispatched) return;
    const fnOrder: CognitiveFn[] = ['sense', 'plan', 'decide', 'monitor', 'learn'];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % fnOrder.length;
      setActiveCognitiveFn(fnOrder[idx]);
    }, 2200);
    return () => clearInterval(interval);
  }, [dispatched]);

  // Governance intercept
  useEffect(() => {
    if (governanceInterceptTriggered && !interceptBanner) {
      setGovernanceState('amber');
      setInterceptBanner(true);
      setAgentStatus((prev) => ({ ...prev, 'agent-appeals': 'intercept' }));
    }
  }, [governanceInterceptTriggered, interceptBanner]);

  // Queue countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setQueueCountdown((prev) => {
        const tick = (ts: string) => {
          const [m, s] = ts.split(':').map(Number);
          const total = m * 60 + s - 1;
          if (total <= 0) return '0:00';
          return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
        };
        return {
          'SCN-002': tick(prev['SCN-002']),
          'SCN-003': tick(prev['SCN-003']),
          'SCN-004': tick(prev['SCN-004']),
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleGovernanceIntercept = useCallback(() => {
    setGovernanceState('amber');
    setInterceptBanner(true);
    setAgentStatus((prev) => ({ ...prev, 'agent-appeals': 'intercept' }));
  }, []);

  return (
    <ScreenLayout
      screenId="controller"
      showPhaseArc
      phaseArcState={{ foundation: true, orchestration: true, autonomous: false }}
      showMiniProfile
    >
      <PresenterControls
        currentScreenId="controller"
        onGovernanceIntercept={handleGovernanceIntercept}
      />

      {/* Maria Status Strip */}
      <MariaStatusStrip
        state={mariaStatus}
        authStatus={mariaStatus === 'resolved' ? '✓ Submitted' : 'AUTH T-4 days'}
        careGapStatus={mariaStatus === 'resolved' ? '✓ In Progress' : 'HbA1c Gap 45d'}
        visible
      />

      {/* ── MAIN LAYOUT — always rendered so background stays visible ── */}
      <div
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{ top: 32, background: '#161616' }}
      >
        {/* Controller Status Bar with 5 Cognitive Functions */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-2"
          style={{ borderBottom: '1px solid rgba(57,57,57,0.6)', background: '#1c1c1c' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="rounded px-3 py-1.5 flex items-center gap-2"
              style={{ background: 'rgba(12,85,184,0.2)', border: '1px solid rgba(12,85,184,0.4)' }}
            >
              <div
                className="rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: '#0C55B8',
                  animation: 'authPulse 1.2s ease-in-out infinite',
                }}
              />
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '11px', color: '#78a9ff', letterSpacing: '0.1em' }}
              >
                CONTROLLER ACTIVE
              </span>
            </div>
            <span className="text-white font-semibold" style={{ fontSize: '18px' }}>
              Agentic Super Orchestration
            </span>
          </div>

          {/* 5 Cognitive Functions */}
          <div className="flex items-center gap-1">
            {COGNITIVE_FUNCTIONS.map((fn, i) => {
              const isActive = fn.id === activeCognitiveFn && dispatched;
              return (
                <React.Fragment key={fn.id}>
                  <div
                    className="flex flex-col items-center rounded px-2 py-1 transition-all duration-400"
                    style={{
                      background: isActive ? `${fn.color}18` : 'transparent',
                      border: `1px solid ${isActive ? fn.color + '50' : 'rgba(57,57,57,0.4)'}`,
                    }}
                  >
                    <span
                      className="font-mono font-semibold"
                      style={{
                        fontSize: '10px',
                        color: isActive ? fn.color : '#4b5563',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {fn.label}
                    </span>
                    <span
                      style={{ fontSize: '8px', color: isActive ? fn.color + 'aa' : '#374151' }}
                    >
                      {fn.sublabel}
                    </span>
                  </div>
                  {i < COGNITIVE_FUNCTIONS.length - 1 && (
                    <span style={{ fontSize: '10px', color: '#374151' }}>→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-6">
            {[
              {
                id: 'ls1',
                label: 'Signals / hr',
                value: fmt(liveStats.signalsLastHour),
                color: '#42be65',
              },
              {
                id: 'ls2',
                label: 'High-Risk Alerts',
                value: String(liveStats.highRiskAlerts),
                color: '#fa4d56',
              },
              {
                id: 'ls3',
                label: 'Members Active',
                value: fmt(liveStats.membersActive),
                color: '#f4f4f4',
              },
              {
                id: 'ls4',
                label: 'Orchestrations Today',
                value: fmt(liveStats.orchestrationsToday),
                color: '#78a9ff',
              },
            ].map((s) => (
              <div key={s.id} className="flex flex-col items-end gap-0.5">
                <span
                  className="font-mono font-bold text-tabular"
                  style={{ fontSize: '18px', color: s.color, lineHeight: 1 }}
                >
                  {s.value}
                </span>
                <span style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.06em' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono" style={{ fontSize: '11px', color: '#6f6f6f' }}>
              <span style={{ color: '#f4f4f4' }}>I</span> = governance intercept
            </span>
          </div>
        </div>

        {/* Strategic Orchestration Agents Layer */}
        {showStrategicAgents && (
          <div
            className="flex-shrink-0 px-4 py-2 flex items-center gap-3 fade-in"
            style={{
              borderBottom: '1px solid rgba(57,57,57,0.5)',
              background: 'rgba(22,22,22,0.9)',
            }}
          >
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className="rounded-full"
                style={{ width: 6, height: 6, background: '#42be65' }}
              />
              <span
                className="font-mono"
                style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.1em' }}
              >
                STRATEGIC CONTEXT
              </span>
            </div>
            <div className="h-3 w-px" style={{ background: 'rgba(57,57,57,0.8)' }} />
            {STRATEGIC_AGENTS.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 rounded px-2.5 py-1.5"
                style={{ background: `${agent.color}10`, border: `1px solid ${agent.color}30` }}
              >
                <div
                  className="rounded-full"
                  style={{ width: 5, height: 5, background: agent.color, flexShrink: 0 }}
                />
                <div className="flex flex-col gap-0">
                  <span className="font-semibold" style={{ fontSize: '10px', color: agent.color }}>
                    {agent.label}
                  </span>
                  <span style={{ fontSize: '8px', color: '#6f6f6f' }}>{agent.detail}</span>
                </div>
              </div>
            ))}
            <div className="flex-1" />
            <span style={{ fontSize: '9px', color: '#6f6f6f' }}>
              Pre-Controller context layer — feeds journey awareness to orchestration
            </span>
          </div>
        )}

        {/* ── AGENT STATUS BAR — real-time state for all 4 agents ── */}
        <AgentStatusBar
          metrics={agentMetrics}
          agentStatuses={agentStatus}
          intercepted={governanceState === 'amber'}
          agents={sc.agentPanels.map((a) => ({
            id: a.id,
            name: a.name
              .replace(/ (Intelligence )?Agent$/, '')
              .replace('Social / SDOH', 'SDOH')
              .replace('Clinical Care', 'Care')
              .replace('Behavioral Health', 'Behavioral'),
            roleColor: a.roleColor,
          }))}
        />

        {/* Main Layout */}
        <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">
          {/* Left: Scenario Intake + Reasoning Trace */}
          <div
            className="flex flex-col gap-0 overflow-hidden"
            style={{
              width: '38%',
              borderRight: '1px solid rgba(57,57,57,0.5)',
              background: '#1c1c1c',
            }}
          >
            {/* Scenario Intake */}
            <div
              className="flex-shrink-0 px-5 py-4"
              style={{ borderBottom: '1px solid rgba(57,57,57,0.5)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="font-mono uppercase tracking-wider"
                  style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}
                >
                  SCENARIO INTAKE
                </span>
                <div
                  className="rounded px-2 py-0.5"
                  style={{
                    background: 'rgba(250,77,86,0.15)',
                    border: '1px solid rgba(250,77,86,0.35)',
                  }}
                >
                  <span className="font-mono" style={{ fontSize: '10px', color: '#fa4d56' }}>
                    {sc.id}
                  </span>
                </div>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {sc.conditions.map((cond) => {
                  const sevStyle =
                    SCENARIO_SEVERITY_COLORS[cond.severity] || SCENARIO_SEVERITY_COLORS.LOW;
                  return (
                    <div
                      key={`cond-${cond.id}`}
                      className="rounded px-3 py-2.5 flex items-start gap-2"
                      style={{ background: sevStyle.bg, border: `1px solid ${sevStyle.border}` }}
                    >
                      <div
                        className="rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center font-mono font-semibold"
                        style={{
                          width: 20,
                          height: 20,
                          background: sevStyle.border,
                          color: sevStyle.text,
                          fontSize: '10px',
                        }}
                      >
                        {cond.id}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="font-semibold text-white"
                            style={{ fontSize: '12px', lineHeight: 1.3 }}
                          >
                            {cond.label}
                          </span>
                          <span
                            className="font-mono flex-shrink-0"
                            style={{
                              fontSize: '9px',
                              color: sevStyle.text,
                              letterSpacing: '0.06em',
                            }}
                          >
                            {cond.severity}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#8d8d8d', lineHeight: 1.4 }}>
                          {cond.description}
                        </span>
                        {'deadline' in cond && (
                          <span
                            className="font-mono"
                            style={{ fontSize: '10px', color: sevStyle.text }}
                          >
                            Deadline: {(cond as { deadline?: string }).deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trigger moment recap strip */}
            {triggerDismissed && (
              <div
                className="flex-shrink-0 mx-5 mt-4 rounded px-4 py-2.5 flex items-center gap-3 fade-in"
                style={{
                  background: 'rgba(255,99,16,0.07)',
                  border: '1px solid rgba(255,99,16,0.25)',
                }}
              >
                <span style={{ fontSize: '14px' }}>⚡</span>
                <div className="flex-1">
                  <span
                    className="font-mono"
                    style={{ fontSize: '10px', color: '#FF6310', letterSpacing: '0.08em' }}
                  >
                    TRIGGER:{' '}
                  </span>
                  <span style={{ fontSize: '11px', color: '#8d8d8d' }}>
                    3 signals (AUTH + CARE_GAP + BEHAVIORAL) in 30s window → orchestration activated
                  </span>
                </div>
              </div>
            )}

            {/* Reasoning Trace */}
            <div className="flex-1 px-5 py-4 overflow-y-auto flex flex-col gap-0 min-h-0">
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <span
                  className="font-mono uppercase tracking-wider"
                  style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}
                >
                  CONTROLLER REASONING TRACE
                </span>
                {dispatched && (
                  <div
                    className="rounded px-2 py-0.5 fade-in"
                    style={{
                      background: 'rgba(66,190,101,0.12)',
                      border: '1px solid rgba(66,190,101,0.3)',
                    }}
                  >
                    <span className="font-mono" style={{ fontSize: '9px', color: '#42be65' }}>
                      DISPATCHED
                    </span>
                  </div>
                )}
              </div>
              <div className="font-mono flex flex-col gap-2 flex-1">
                {sc.reasoningLines.map((line) => (
                  <div
                    key={line.id}
                    className="transition-all duration-300"
                    style={{
                      opacity: visibleReasoningLines.includes(line.id) ? 1 : 0,
                      transform: visibleReasoningLines.includes(line.id)
                        ? 'translateY(0)'
                        : 'translateY(4px)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        lineHeight: 1.65,
                        color: line.text.startsWith('  ')
                          ? '#8d8d8d'
                          : line.text.includes('DISPATCHING')
                            ? '#42be65'
                            : line.text.includes('GOVERNANCE')
                              ? '#8b5cf6'
                              : line.text.includes('DECOMPOSING') || line.text.includes('INTAKE')
                                ? '#78a9ff'
                                : '#c6c6c6',
                        fontWeight: line.text.includes('DISPATCHING') ? 600 : 400,
                      }}
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
                {visibleReasoningLines.length > 0 &&
                  visibleReasoningLines.length < sc.reasoningLines.length && (
                    <span
                      className="typewriter-cursor font-mono"
                      style={{ fontSize: '12px', color: '#FF6310' }}
                    />
                  )}
              </div>
              {interceptBanner && (
                <div
                  className="rounded p-3 flex items-center gap-2 mt-4 animate-intercept flex-shrink-0"
                  style={{
                    background: 'rgba(217,119,6,0.12)',
                    border: '1px solid rgba(217,119,6,0.4)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 7, height: 7, background: '#f1c21b', flexShrink: 0 }}
                  />
                  <span className="font-mono" style={{ fontSize: '11px', color: '#f1c21b' }}>
                    GOVERNANCE INTERCEPT ACKNOWLEDGED — Behavioral Health Agent HELD — routing to
                    human reviewer — audit trail: 14:31:22
                  </span>
                </div>
              )}

              {/* Care Manager Thread — Active Outcome Tracking */}
              {mariaStatus === 'resolved' && (
                <div
                  className="rounded p-3 flex flex-col gap-2 mt-4 flex-shrink-0 fade-in"
                  style={{
                    background: 'rgba(6,182,212,0.07)',
                    border: '1px solid rgba(6,182,212,0.35)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full"
                        style={{
                          width: 7,
                          height: 7,
                          background: '#06b6d4',
                          animation: 'authPulse 2s ease-in-out infinite',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        className="font-mono font-semibold"
                        style={{ fontSize: '10px', color: '#06b6d4', letterSpacing: '0.1em' }}
                      >
                        CARE MANAGER — {careMgrName.toUpperCase()} · H1ab
                      </span>
                    </div>
                    <div
                      className="rounded px-1.5 py-0.5"
                      style={{
                        background: 'rgba(6,182,212,0.15)',
                        border: '1px solid rgba(6,182,212,0.35)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '8px', color: '#06b6d4' }}>
                        UPDATED ⟳ LIVE
                      </span>
                    </div>
                  </div>

                  {/* Duplicate Therapy Critical Alert */}
                  <div
                    className="rounded px-2.5 py-2 flex items-start gap-2"
                    style={{
                      background: 'rgba(250,77,86,0.12)',
                      border: '1.5px solid rgba(250,77,86,0.55)',
                      boxShadow: '0 0 8px rgba(250,77,86,0.15)',
                    }}
                  >
                    <div
                      className="rounded-full flex-shrink-0 mt-1"
                      style={{
                        width: 6,
                        height: 6,
                        background: '#fa4d56',
                        boxShadow: '0 0 4px #fa4d56',
                        animation: 'authPulse 1s ease-in-out infinite',
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="font-mono font-bold"
                          style={{ fontSize: '9px', color: '#fa4d56', letterSpacing: '0.08em' }}
                        >
                          ⚠ CRITICAL — DUPLICATE THERAPY
                        </span>
                        <div
                          className="rounded px-1.5 py-0.5"
                          style={{
                            background: 'rgba(250,77,86,0.2)',
                            border: '1px solid rgba(250,77,86,0.4)',
                          }}
                        >
                          <span className="font-mono" style={{ fontSize: '7px', color: '#fa4d56' }}>
                            PATIENT SAFETY
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', color: '#f4f4f4', lineHeight: 1.4 }}>
                        {`${cgMed1} (${orgName}) + ${cgMed2} (${cgPrescriber}) — interaction risk — two active fills across prescribers`}
                      </span>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span
                          style={{ fontSize: '9px', color: '#f87171' }}
                        >{`Confirm ${firstName} aware of both prescriptions · Verify monitoring ownership`}</span>
                        <span style={{ fontSize: '9px', color: '#f59e0b' }}>
                          Med review enrolled partial · Prescriber alerts dispatched · Consent
                          expansion pending
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transport Blocker Alert */}
                  <div
                    className="rounded px-2.5 py-2 flex items-start gap-2"
                    style={{
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.4)',
                    }}
                  >
                    <div
                      className="rounded-full flex-shrink-0 mt-1"
                      style={{
                        width: 6,
                        height: 6,
                        background: '#ef4444',
                        boxShadow: '0 0 4px #ef4444',
                        animation: 'authPulse 1.2s ease-in-out infinite',
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="font-mono font-bold"
                          style={{ fontSize: '9px', color: '#ef4444', letterSpacing: '0.08em' }}
                        >
                          ⚠ TRANSPORT BLOCKER FLAGGED
                        </span>
                        <div
                          className="rounded px-1.5 py-0.5"
                          style={{
                            background: 'rgba(239,68,68,0.2)',
                            border: '1px solid rgba(239,68,68,0.4)',
                          }}
                        >
                          <span className="font-mono" style={{ fontSize: '7px', color: '#ef4444' }}>
                            BLOCKER
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', color: '#c6c6c6', lineHeight: 1.4 }}>
                        Home lab kit ordered as alternative — clinic appt would fail
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 22,
                        height: 22,
                        background: 'rgba(6,182,212,0.15)',
                        border: '1px solid rgba(6,182,212,0.4)',
                      }}
                    >
                      <span style={{ fontSize: '9px', color: '#06b6d4', fontWeight: 700 }}>SC</span>
                    </div>
                    <div>
                      <span
                        className="font-semibold"
                        style={{ fontSize: '12px', color: '#f4f4f4' }}
                      >
                        {careMgrName}
                      </span>
                      <span style={{ fontSize: '10px', color: '#8d8d8d', marginLeft: 6 }}>
                        H1ab updated · barrier-aware brief loaded
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {[
                      {
                        label: 'Outreach brief',
                        value: 'Barrier-aware script loaded — transport context included',
                        color: '#42be65',
                      },
                      {
                        label: 'Action at 10am',
                        value: 'Confirm home kit receipt — NOT clinic booking',
                        color: '#ef4444',
                      },
                      { label: 'Context age', value: '47-day gap → real-time', color: '#06b6d4' },
                      {
                        label: 'Re-activates if',
                        value: 'Kit declined → telehealth escalation',
                        color: '#f1c21b',
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-2">
                        <div
                          className="rounded-full flex-shrink-0 mt-1.5"
                          style={{ width: 4, height: 4, background: item.color }}
                        />
                        <div>
                          <span style={{ fontSize: '10px', color: '#6f6f6f' }}>{item.label}: </span>
                          <span style={{ fontSize: '10px', color: item.color }}>{item.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="rounded px-2 py-1.5"
                    style={{
                      background: 'rgba(6,182,212,0.08)',
                      border: '1px solid rgba(6,182,212,0.2)',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: '#8d8d8d', lineHeight: 1.4 }}>
                      Memory: H1ab care plan updated — 47-day gap closed · transport blocker logged
                      · duplicate therapy alert loaded
                    </span>
                  </div>
                </div>
              )}

              {/* Med review Duplicate Therapy Thread — Active Outcome Tracking */}
              {mariaStatus === 'resolved' && (
                <div
                  className="rounded p-3 flex flex-col gap-2 mt-2 flex-shrink-0 fade-in"
                  style={{
                    background: 'rgba(250,77,86,0.07)',
                    border: '1px solid rgba(250,77,86,0.45)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full"
                        style={{
                          width: 7,
                          height: 7,
                          background: '#fa4d56',
                          animation: 'authPulse 1s ease-in-out infinite',
                          flexShrink: 0,
                          boxShadow: '0 0 6px #fa4d56',
                        }}
                      />
                      <span
                        className="font-mono font-semibold"
                        style={{ fontSize: '10px', color: '#fa4d56', letterSpacing: '0.1em' }}
                      >
                        Med review — DUPLICATE THERAPY RESOLUTION
                      </span>
                    </div>
                    <div
                      className="rounded px-1.5 py-0.5"
                      style={{
                        background: 'rgba(250,77,86,0.15)',
                        border: '1px solid rgba(250,77,86,0.45)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '8px', color: '#fa4d56' }}>
                        ACTIVE ⟳
                      </span>
                    </div>
                  </div>
                  <div
                    className="rounded px-2.5 py-2 flex items-start gap-2"
                    style={{
                      background: 'rgba(250,77,86,0.1)',
                      border: '1px solid rgba(250,77,86,0.35)',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: '#fa4d56', flexShrink: 0 }}>⚠</span>
                    <span
                      style={{ fontSize: '10px', color: '#f4f4f4', lineHeight: 1.4 }}
                    >{`${cgMed1} (${orgName} · CVS) + ${cgMed2} (${cgPrescriber} · Walgreens) — interaction risk — two active fills`}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {[
                      {
                        label: `${cgPharmacy} Med review`,
                        value: 'Enrolled — fill history only (partial)',
                        color: '#f59e0b',
                      },
                      {
                        label: 'Prescriber alerts',
                        value: `${orgName} + ${cgPrescriber} — dispatched`,
                        color: '#42be65',
                      },
                      {
                        label: 'Consent expansion',
                        value: `Queued — ${firstName} outreach pending`,
                        color: '#78a9ff',
                      },
                      {
                        label: 'Re-activates if',
                        value: 'Prescriber response not received in 48h',
                        color: '#f1c21b',
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-2">
                        <div
                          className="rounded-full flex-shrink-0 mt-1.5"
                          style={{ width: 4, height: 4, background: item.color }}
                        />
                        <div>
                          <span style={{ fontSize: '10px', color: '#6f6f6f' }}>{item.label}: </span>
                          <span style={{ fontSize: '10px', color: item.color }}>{item.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="rounded px-2 py-1.5 flex items-center justify-between"
                    style={{
                      background: 'rgba(250,77,86,0.06)',
                      border: '1px solid rgba(250,77,86,0.2)',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: '#8d8d8d' }}>
                      CONSENT.DOMAIN.BOUNDARY.002 — intercept logged
                    </span>
                    <button
                      onClick={() => setMtmInterceptBanner(true)}
                      style={{
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '9px',
                        color: '#fa4d56',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.06em',
                        padding: '2px 6px',
                        borderRadius: 3,
                        border: '1px solid rgba(250,77,86,0.35)',
                      }}
                    >
                      VIEW ↗
                    </button>
                  </div>
                </div>
              )}

              {/* Provider Intelligence Thread — Active Outcome Tracking */}
              {mariaStatus === 'resolved' && (
                <div
                  className="rounded p-3 flex flex-col gap-2 mt-2 flex-shrink-0 fade-in"
                  style={{
                    background: 'rgba(139,92,246,0.07)',
                    border: '1px solid rgba(139,92,246,0.4)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full"
                        style={{
                          width: 7,
                          height: 7,
                          background: '#42be65',
                          flexShrink: 0,
                          boxShadow: '0 0 5px #42be65',
                        }}
                      />
                      <span
                        className="font-mono font-semibold"
                        style={{ fontSize: '10px', color: '#8b5cf6', letterSpacing: '0.1em' }}
                      >{`PROVIDER INTELLIGENCE · ${pcpName.toUpperCase()}`}</span>
                    </div>
                    <div
                      className="rounded px-1.5 py-0.5"
                      style={{
                        background: 'rgba(66,190,101,0.12)',
                        border: '1px solid rgba(66,190,101,0.4)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '8px', color: '#42be65' }}>
                        DELIVERED ✓
                      </span>
                    </div>
                  </div>
                  <div
                    className="rounded px-2.5 py-2 flex items-start gap-2"
                    style={{
                      background: 'rgba(66,190,101,0.08)',
                      border: '1px solid rgba(66,190,101,0.3)',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: '#42be65', flexShrink: 0 }}>✓</span>
                    <span
                      style={{ fontSize: '10px', color: '#f4f4f4', lineHeight: 1.4 }}
                    >{`CDS Hook fired — appointment: 2024-11-15 10:00am · FHIR R4 · ${orgName} EHR`}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {[
                      {
                        label: 'Interaction alert',
                        value: `Dispatched to EHR — ${cgMed1} + ${cgMed2} flagged`,
                        color: '#fa4d56',
                      },
                      {
                        label: 'HbA1c care gap',
                        value: 'Prompted — 47-day window flagged in brief',
                        color: '#f1c21b',
                      },
                      {
                        label: 'Auth pre-approval',
                        value: 'Visible in EHR — ready to order at visit',
                        color: '#42be65',
                      },
                      {
                        label: 'SDOH context',
                        value: 'Transport barrier surfaced — clinic referral risk noted',
                        color: '#8b5cf6',
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-2">
                        <div
                          className="rounded-full flex-shrink-0 mt-1.5"
                          style={{ width: 4, height: 4, background: item.color }}
                        />
                        <div>
                          <span style={{ fontSize: '10px', color: '#6f6f6f' }}>{item.label}: </span>
                          <span style={{ fontSize: '10px', color: item.color }}>{item.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="rounded px-2 py-1.5"
                    style={{
                      background: 'rgba(139,92,246,0.06)',
                      border: '1px solid rgba(139,92,246,0.2)',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: '#8d8d8d', lineHeight: 1.4 }}>
                      {`${orgName} opens the EHR at 9:58am — full context pre-assembled before ${firstName} arrives`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center: Agent Grid + Queue */}
          <div
            className="flex flex-col gap-0 overflow-hidden"
            style={{ flex: 1, background: '#161616' }}
          >
            <GovernanceBorder state={governanceState} className="flex-1 m-3 min-h-0">
              <div className="h-full flex flex-col">
                <div
                  className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
                  style={{
                    borderBottom: `1px solid ${governanceState === 'amber' ? 'rgba(217,119,6,0.3)' : 'rgba(139,92,246,0.2)'}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-full"
                      style={{
                        width: 7,
                        height: 7,
                        background: governanceState === 'amber' ? '#f1c21b' : '#8b5cf6',
                        animation: 'authPulse 1.5s ease-in-out infinite',
                      }}
                    />
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '11px',
                        color: governanceState === 'amber' ? '#f1c21b' : '#8b5cf6',
                        letterSpacing: '0.1em',
                      }}
                    >
                      GOVERNANCE BOUNDARY —{' '}
                      {governanceState === 'amber' ? 'INTERCEPT ACTIVE' : 'MONITORING'}
                    </span>
                  </div>
                  {interceptBanner && (
                    <div
                      className="rounded px-2 py-0.5"
                      style={{
                        background: 'rgba(217,119,6,0.2)',
                        border: '1px solid rgba(217,119,6,0.4)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '10px', color: '#f1c21b' }}>
                        SD Medicaid.APPEAL.AUTO.THRESHOLD.001
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className="flex-1 grid gap-2.5 p-3 min-h-0"
                  style={{
                    gridTemplateColumns: `repeat(${sc.agentPanels.length > 4 ? 3 : 2}, 1fr)`,
                    gridTemplateRows: `repeat(${Math.ceil(sc.agentPanels.length / (sc.agentPanels.length > 4 ? 3 : 2))}, 1fr)`,
                  }}
                >
                  {sc.agentPanels.map((agent) => (
                    <AgentPanel
                      key={agent.id}
                      agent={agent}
                      status={agentStatus[agent.id]}
                      visibleActivities={visibleActivities[agent.id]}
                      governanceState={governanceState}
                      metrics={agentMetrics[agent.id]}
                      onOpenDecisionTree={(agentId) => setActiveDecisionTree(agentId)}
                    />
                  ))}
                </div>
              </div>
            </GovernanceBorder>

            {/* Live Scenario Queue */}
            <div
              className="flex-shrink-0 mx-3 mb-3 rounded p-3"
              style={{ background: '#1c1c1c', border: '1px solid rgba(57,57,57,0.7)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="font-mono uppercase tracking-wider"
                  style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}
                >
                  LIVE SCENARIO QUEUE
                </span>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '11px', color: '#6f6f6f' }}>
                    Background auto-resolved:
                  </span>
                  <span
                    className="font-mono font-semibold text-tabular"
                    style={{ fontSize: '14px', color: '#42be65' }}
                  >
                    {sc.backgroundAutoResolved}
                  </span>
                </div>
              </div>
              <div
                className="rounded px-3 py-2 mb-2 flex items-center justify-between"
                style={{
                  background: 'rgba(250,77,86,0.1)',
                  border: '1px solid rgba(250,77,86,0.35)',
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="rounded-full"
                    style={{
                      width: 7,
                      height: 7,
                      background: '#fa4d56',
                      animation: 'authPulse 1s ease-in-out infinite',
                    }}
                  />
                  <span
                    className="font-mono font-semibold"
                    style={{ fontSize: '13px', color: '#fa4d56' }}
                  >
                    {sc.id}
                  </span>
                  <span style={{ fontSize: '12px', color: '#8d8d8d' }}>
                    Complexity HIGH — 4 agents active
                  </span>
                </div>
                <div
                  className="rounded px-2 py-0.5"
                  style={{
                    background: 'rgba(250,77,86,0.2)',
                    border: '1px solid rgba(250,77,86,0.4)',
                  }}
                >
                  <span className="font-mono" style={{ fontSize: '10px', color: '#fa4d56' }}>
                    IN FOCUS
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {sc.otherScenarios.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded"
                    style={{
                      background: 'rgba(57,57,57,0.3)',
                      border: '1px solid rgba(57,57,57,0.5)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full"
                        style={{ width: 5, height: 5, background: '#f1c21b' }}
                      />
                      <span className="font-mono" style={{ fontSize: '11px', color: '#c6c6c6' }}>
                        {s.member}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6f6f6f' }}>{s.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-2 py-0.5 font-mono"
                        style={{
                          fontSize: '10px',
                          color: '#f1c21b',
                          background: 'rgba(241,194,27,0.1)',
                        }}
                      >
                        {s.complexity}
                      </span>
                      <span
                        className="font-mono text-tabular"
                        style={{ fontSize: '11px', color: '#6f6f6f' }}
                      >
                        {queueCountdown[s.id as keyof typeof queueCountdown]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Population Signal Stream */}
          <div
            className="flex-shrink-0 flex flex-col overflow-hidden"
            style={{
              width: 210,
              borderLeft: '1px solid rgba(57,57,57,0.5)',
              background: '#1c1c1c',
            }}
          >
            <div
              className="flex-shrink-0 px-4 py-3"
              style={{ borderBottom: '1px solid rgba(57,57,57,0.5)', background: '#1c1c1c' }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <div
                  className="rounded-full"
                  style={{
                    width: 7,
                    height: 7,
                    background: '#42be65',
                    animation: 'authPulse 1s ease-in-out infinite',
                  }}
                />
                <span className="font-semibold text-white" style={{ fontSize: '13px' }}>
                  Population Stream
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#6f6f6f' }}>
                All members · Enterprise-wide
              </span>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <div className="absolute inset-0 overflow-y-auto p-2 flex flex-col gap-1.5">
                {popSignals.map((sig, i) => (
                  <div
                    key={sig.id}
                    className="rounded px-3 py-2 flex flex-col gap-1 fade-in"
                    style={{
                      background: '#262626',
                      border: '1px solid rgba(57,57,57,0.5)',
                      animationDelay: `${i * 0.04}s`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="rounded-full"
                          style={{ width: 6, height: 6, background: sig.color, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: '12px', color: '#f4f4f4' }}>{sig.member}</span>
                      </div>
                      <span className="font-mono" style={{ fontSize: '9px', color: '#6f6f6f' }}>
                        {sig.ts}
                      </span>
                    </div>
                    <span
                      className="font-mono"
                      style={{ fontSize: '10px', color: sig.color, letterSpacing: '0.04em' }}
                    >
                      {sig.type}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8d8d8d' }}>{sig.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live stats footer */}
            <div
              className="flex-shrink-0 px-4 py-3"
              style={{ borderTop: '1px solid rgba(57,57,57,0.5)', background: '#1c1c1c' }}
            >
              <div className="flex flex-col gap-2.5">
                {[
                  {
                    label: 'Signals / hr',
                    value: fmt(liveStats.signalsLastHour),
                    color: '#42be65',
                  },
                  {
                    label: 'High-Risk Alerts',
                    value: String(liveStats.highRiskAlerts),
                    color: '#fa4d56',
                  },
                  {
                    label: 'Members Active',
                    value: fmt(liveStats.membersActive),
                    color: '#f4f4f4',
                  },
                  {
                    label: 'Orchestrations Today',
                    value: fmt(liveStats.orchestrationsToday),
                    color: '#78a9ff',
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span style={{ fontSize: '11px', color: '#6f6f6f' }}>{item.label}</span>
                    <span
                      className="font-mono font-semibold text-tabular"
                      style={{ fontSize: '15px', color: item.color }}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TRIGGER MOMENT OVERLAY — sits above main layout ── */}
      {showTriggerMoment && !triggerDismissed && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)', top: 32 }}
        >
          <div
            className="rounded-lg flex flex-col fade-in-up"
            style={{
              background: '#1c1c1c',
              border: '2px solid rgba(255,99,16,0.6)',
              boxShadow: '0 0 80px rgba(255,99,16,0.18)',
              padding: '36px 44px',
              maxWidth: 620,
              width: '100%',
              gap: 20,
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  width: 56,
                  height: 56,
                  background: 'rgba(255,99,16,0.15)',
                  border: '1px solid rgba(255,99,16,0.5)',
                }}
              >
                <span style={{ fontSize: '28px' }}>⚡</span>
              </div>
              <div>
                <div
                  className="font-mono font-semibold"
                  style={{
                    fontSize: '11px',
                    color: '#FF6310',
                    letterSpacing: '0.16em',
                    marginBottom: 6,
                  }}
                >
                  TRIGGER DETECTED — 14:31:20
                </div>
                <div
                  className="text-white font-semibold"
                  style={{ fontSize: '26px', lineHeight: 1.2 }}
                >
                  Why Orchestration Activated
                </div>
              </div>
            </div>

            <div className="flex flex-col" style={{ gap: 10 }}>
              <div className="flex items-center gap-3 mb-1">
                <div style={{ flex: 1, height: 1, background: 'rgba(57,57,57,0.8)' }} />
                <span
                  className="font-mono font-semibold"
                  style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.14em' }}
                >
                  PHASE 1 — TRIGGER THRESHOLD CROSSED
                </span>
                <div style={{ flex: 1, height: 1, background: 'rgba(57,57,57,0.8)' }} />
              </div>
              {sc.trigger.signals.map((s, i) =>
                visibleSignalCount > i ? (
                  <div
                    key={s.sig}
                    className="rounded-lg px-5 py-4 flex items-center gap-4 fade-in-up"
                    style={{ background: `${s.color}10`, border: `1px solid ${s.color}35` }}
                  >
                    <div
                      className="rounded-full flex-shrink-0"
                      style={{ width: 11, height: 11, background: s.color }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span
                          className="font-mono font-semibold"
                          style={{ fontSize: '14px', color: s.color, letterSpacing: '0.08em' }}
                        >
                          {s.sig}
                        </span>
                        <span className="font-mono" style={{ fontSize: '12px', color: '#6f6f6f' }}>
                          {s.ts}
                        </span>
                      </div>
                      <span style={{ fontSize: '15px', color: '#c6c6c6', lineHeight: 1.5 }}>
                        {s.detail}
                      </span>
                    </div>
                  </div>
                ) : null
              )}
            </div>

            {showSummary && (
              <div
                className="rounded-lg px-5 py-3 fade-in-up"
                style={{
                  background: 'rgba(255,99,16,0.08)',
                  border: '1px solid rgba(255,99,16,0.3)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="rounded-full flex-shrink-0 mt-1"
                    style={{ width: 10, height: 10, background: '#FF6310' }}
                  />
                  <div style={{ fontSize: '14px', color: '#c6c6c6', lineHeight: 1.6 }}>
                    3 signals · same member · 30-second window. Not three separate workflows.{' '}
                    <span style={{ color: '#FF6310', fontWeight: 700 }}>
                      One coordination window.
                    </span>{' '}
                    Knowledge Graph query initiated.
                  </div>
                </div>
              </div>
            )}

            {/* ── PHASE 2 DIVIDER ── */}
            {showPhase2Header && (
              <div className="fade-in-up" style={{ marginTop: 4 }}>
                <div className="flex items-center gap-3 mb-3">
                  <div style={{ flex: 1, height: 1, background: 'rgba(57,57,57,0.8)' }} />
                  <span
                    className="font-mono font-semibold"
                    style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.14em' }}
                  >
                    PHASE 2
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(57,57,57,0.8)' }} />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 28,
                      height: 28,
                      background: 'rgba(120,169,255,0.12)',
                      border: '1px solid rgba(120,169,255,0.35)',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>◈</span>
                  </div>
                  <div>
                    <div
                      className="font-mono font-semibold"
                      style={{
                        fontSize: '10px',
                        color: '#78a9ff',
                        letterSpacing: '0.14em',
                        marginBottom: 2,
                      }}
                    >
                      GRAPH CONTEXT ENRICHMENT
                    </div>
                    <div style={{ fontSize: '12px', color: '#8d8d8d' }}>
                      Knowledge Graph queried — 14:31:21
                    </div>
                  </div>
                </div>

                <div className="flex flex-col" style={{ gap: 8 }}>
                  {[
                    {
                      icon: '◆',
                      label: 'SDOH PROFILE DISCOVERED',
                      detail: sc.trigger.sdohProfile,
                      color: '#f97316',
                    },
                    {
                      icon: '◆',
                      label: 'FAMILY CONTEXT',
                      detail: sc.trigger.familyContext,
                      color: '#a78bfa',
                    },
                    {
                      icon: '◆',
                      label: 'JOURNEY POSITION',
                      detail: sc.trigger.journeyPosition,
                      color: '#34d399',
                    },
                  ].map((item, i) =>
                    visiblePhase2Count > i ? (
                      <div
                        key={item.label}
                        className="rounded-lg px-4 py-3 flex items-start gap-3 fade-in-up"
                        style={{
                          background: `${item.color}0d`,
                          border: `1px solid ${item.color}30`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            color: item.color,
                            marginTop: 1,
                            flexShrink: 0,
                          }}
                        >
                          {item.icon}
                        </span>
                        <div>
                          <div
                            className="font-mono font-semibold"
                            style={{
                              fontSize: '11px',
                              color: item.color,
                              letterSpacing: '0.08em',
                              marginBottom: 3,
                            }}
                          >
                            {item.label}
                          </div>
                          <div style={{ fontSize: '13px', color: '#c6c6c6', lineHeight: 1.5 }}>
                            {item.detail}
                          </div>
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {showUpgrade && (
              <div
                className="rounded-lg px-5 py-3 fade-in-up"
                style={{
                  background: 'rgba(120,169,255,0.07)',
                  border: '1px solid rgba(120,169,255,0.3)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-full flex-shrink-0"
                    style={{ width: 10, height: 10, background: '#78a9ff' }}
                  />
                  <div style={{ fontSize: '14px', color: '#c6c6c6', lineHeight: 1.6 }}>
                    Standard 4-agent response{' '}
                    <span style={{ color: '#6f6f6f', textDecoration: 'line-through' }}>
                      dispatched
                    </span>{' '}
                    →{' '}
                    <span style={{ color: '#78a9ff', fontWeight: 700 }}>
                      upgraded to 9-agent coalition (SDOH-enriched + Med review pharmacy safety)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {showContinue && (
              <div className="flex items-center justify-between fade-in-up">
                <div
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5"
                  style={{
                    background: 'rgba(12,85,184,0.15)',
                    border: '1px solid rgba(12,85,184,0.4)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: 8,
                      height: 8,
                      background: '#0C55B8',
                      animation: 'authPulse 1s ease-in-out infinite',
                    }}
                  />
                  <span
                    className="font-mono font-semibold"
                    style={{ fontSize: '12px', color: '#78a9ff', letterSpacing: '0.1em' }}
                  >
                    ORCHESTRATION INTELLIGENCE LAYER: ACTIVATED
                  </span>
                </div>
                <button
                  onClick={() => {
                    setShowTriggerMoment(false);
                    setTriggerDismissed(true);
                  }}
                  className="rounded-lg px-5 py-2.5 transition-all duration-200 flex items-center gap-2"
                  style={{
                    background: 'rgba(255,99,16,0.15)',
                    border: '1px solid rgba(255,99,16,0.45)',
                    color: '#FF6310',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                  }}
                >
                  CONTINUE
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>↓</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Journey State Panel — floating overlay */}
      {showJourneyPanel && !showTriggerMoment && (
        <div className="absolute fade-in" style={{ top: 120, right: 230, zIndex: 45 }}>
          <JourneyStatePanel collapsed />
        </div>
      )}

      {/* Governance Intercept Banner */}
      {interceptBanner && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center animate-intercept"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="rounded flex flex-col gap-5 max-w-2xl w-full mx-8"
            style={{
              background: '#1c1c1c',
              border: '2px solid rgba(217,119,6,0.7)',
              boxShadow: '0 0 40px rgba(217,119,6,0.3)',
              padding: '32px',
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 48,
                    height: 48,
                    background: 'rgba(217,119,6,0.2)',
                    border: '1px solid rgba(217,119,6,0.5)',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>⚖</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="font-mono font-semibold"
                      style={{ fontSize: '12px', color: '#f1c21b', letterSpacing: '0.12em' }}
                    >
                      GOVERNANCE INTERCEPT
                    </span>
                    <div
                      className="rounded px-2 py-0.5"
                      style={{
                        background: 'rgba(241,194,27,0.2)',
                        border: '1px solid rgba(241,194,27,0.4)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '10px', color: '#f1c21b' }}>
                        HELD — NOT CANCELLED
                      </span>
                    </div>
                  </div>
                  <h3 className="text-white font-semibold" style={{ fontSize: '20px' }}>
                    Policy Boundary Enforced
                  </h3>
                </div>
              </div>
              <div
                className="rounded px-3 py-1.5"
                style={{
                  background: 'rgba(217,119,6,0.15)',
                  border: '1px solid rgba(217,119,6,0.3)',
                }}
              >
                <span className="font-mono" style={{ fontSize: '12px', color: '#f1c21b' }}>
                  14:31:22
                </span>
              </div>
            </div>
            <div
              className="rounded p-4"
              style={{
                background: 'rgba(217,119,6,0.08)',
                border: '1px solid rgba(217,119,6,0.25)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="font-mono font-semibold"
                  style={{ fontSize: '12px', color: '#f1c21b', letterSpacing: '0.08em' }}
                >
                  SD Medicaid.APPEAL.AUTO.THRESHOLD.001
                </span>
              </div>
              <p style={{ fontSize: '15px', color: '#c6c6c6', lineHeight: 1.6 }}>
                Clinical necessity determination exceeding automated authority threshold. Human
                clinical review required before appeal response can be dispatched.
              </p>
            </div>
            <div
              className="rounded p-4 flex flex-col gap-3"
              style={{ background: '#262626', border: '1px solid rgba(57,57,57,0.8)' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="font-mono uppercase tracking-wider"
                  style={{ fontSize: '11px', color: '#8d8d8d', letterSpacing: '0.1em' }}
                >
                  REVIEWER CONTEXT — PRE-ASSEMBLED
                </span>
                <div
                  className="rounded px-2 py-0.5"
                  style={{
                    background: 'rgba(66,190,101,0.12)',
                    border: '1px solid rgba(66,190,101,0.3)',
                  }}
                >
                  <span className="font-mono" style={{ fontSize: '10px', color: '#42be65' }}>
                    READY
                  </span>
                </div>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                {[
                  {
                    id: 'rc1',
                    label: 'Appeal Summary',
                    value:
                      'Procedure HbA1c — Auth CAREGAP_HBA1C contested — clinical necessity basis',
                    color: '#c6c6c6',
                  },
                  {
                    id: 'rc2',
                    label: '3 Supporting Records',
                    value: 'Postpartum EP + HbA1c gap + Auth history attached',
                    color: '#c6c6c6',
                  },
                  {
                    id: 'rc3',
                    label: 'Response Draft',
                    value: 'Pre-drafted — reviewer edits only — 68h deadline remaining',
                    color: '#f1c21b',
                  },
                ].map((item) => (
                  <div key={item.id} className="flex flex-col gap-1">
                    <span style={{ fontSize: '12px', color: '#8d8d8d' }}>{item.label}</span>
                    <span style={{ fontSize: '13px', color: item.color, lineHeight: 1.4 }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Four-Pillar Governance Framework */}
            <div
              className="rounded p-4 flex flex-col gap-3"
              style={{
                background: '#1a1a1a',
                border: '1px solid rgba(139,92,246,0.3)',
                borderTop: '2px solid rgba(139,92,246,0.5)',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="rounded-full"
                  style={{ width: 6, height: 6, background: '#8b5cf6' }}
                />
                <span
                  className="font-mono uppercase"
                  style={{ fontSize: '9px', color: '#8b5cf6', letterSpacing: '0.12em' }}
                >
                  SUPERVISED AUTONOMY — FOUR-PILLAR FRAMEWORK
                </span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {[
                  {
                    id: 'p1',
                    pillar: 'Every action auditable',
                    detail: 'Agent ID · timestamp · rationale — logged on every decision',
                    color: '#78a9ff',
                    icon: '◈',
                  },
                  {
                    id: 'p2',
                    pillar: 'Policy boundaries enforced',
                    detail: 'Hard stops on 47 configured compliance rules — no exceptions',
                    color: '#f1c21b',
                    icon: '⬡',
                  },
                  {
                    id: 'p3',
                    pillar: 'Human-in-the-loop by design',
                    detail: 'Escalation triggers — reviewer SLA tracked — context pre-assembled',
                    color: '#42be65',
                    icon: '◉',
                  },
                  {
                    id: 'p4',
                    pillar: '100% coverage — not sampled',
                    detail: 'Active on every orchestration — not a statistical sample',
                    color: '#fa4d56',
                    icon: '◆',
                  },
                ].map((p) => (
                  <div
                    key={p.id}
                    className="rounded p-2.5 flex items-start gap-2.5"
                    style={{ background: `${p.color}08`, border: `1px solid ${p.color}25` }}
                  >
                    <span style={{ fontSize: '14px', color: p.color, flexShrink: 0, marginTop: 1 }}>
                      {p.icon}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span
                        className="font-semibold"
                        style={{ fontSize: '12px', color: '#f4f4f4' }}
                      >
                        {p.pillar}
                      </span>
                      <span style={{ fontSize: '10px', color: '#8d8d8d', lineHeight: 1.4 }}>
                        {p.detail}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="rounded px-3 py-1.5 flex items-center gap-2"
                  style={{
                    background: 'rgba(66,190,101,0.12)',
                    border: '1px solid rgba(66,190,101,0.3)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: '#42be65' }}
                  />
                  <span className="font-mono" style={{ fontSize: '12px', color: '#42be65' }}>
                    Reviewer notified — awaiting clinical sign-off
                  </span>
                </div>
                <div
                  className="rounded px-3 py-1.5 flex items-center gap-2"
                  style={{
                    background: 'rgba(139,92,246,0.12)',
                    border: '1px solid rgba(139,92,246,0.3)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: '#8b5cf6' }}
                  />
                  <span className="font-mono" style={{ fontSize: '12px', color: '#8b5cf6' }}>
                    Audit trail initialized — all decisions logged
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setInterceptBanner(false);
                  setMariaStatus('resolved');
                }}
                className="rounded px-5 py-2.5 transition-all duration-200"
                style={{
                  background: 'rgba(217,119,6,0.2)',
                  border: '1px solid rgba(217,119,6,0.5)',
                  color: '#f1c21b',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                ACKNOWLEDGE →
              </button>
              <button
                onClick={() => {
                  setInterceptBanner(false);
                  setConsentInterceptBanner(true);
                  setMariaStatus('resolved');
                }}
                className="rounded px-5 py-2.5 transition-all duration-200"
                style={{
                  background: 'rgba(250,77,86,0.15)',
                  border: '1px solid rgba(250,77,86,0.45)',
                  color: '#fa4d56',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                VIEW CONSENT INTERCEPT →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consent Boundary Intercept Modal */}
      {consentInterceptBanner && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center animate-intercept"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="rounded flex flex-col gap-5 max-w-2xl w-full mx-8"
            style={{
              background: '#1c1c1c',
              border: '2px solid rgba(250,77,86,0.7)',
              boxShadow: '0 0 40px rgba(250,77,86,0.3)',
              padding: '32px',
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 48,
                    height: 48,
                    background: 'rgba(250,77,86,0.2)',
                    border: '1px solid rgba(250,77,86,0.5)',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>⚖</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="font-mono font-semibold"
                      style={{ fontSize: '12px', color: '#fa4d56', letterSpacing: '0.12em' }}
                    >
                      GOVERNANCE INTERCEPT #2
                    </span>
                    <div
                      className="rounded px-2 py-0.5"
                      style={{
                        background: 'rgba(250,77,86,0.2)',
                        border: '1px solid rgba(250,77,86,0.4)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '10px', color: '#fa4d56' }}>
                        CONSENT BOUNDARY — BLOCKED
                      </span>
                    </div>
                  </div>
                  <h3 className="text-white font-semibold" style={{ fontSize: '20px' }}>
                    Proxy Consent Scope Exceeded
                  </h3>
                </div>
              </div>
              <div
                className="rounded px-3 py-1.5"
                style={{
                  background: 'rgba(250,77,86,0.15)',
                  border: '1px solid rgba(250,77,86,0.3)',
                }}
              >
                <span className="font-mono" style={{ fontSize: '12px', color: '#fa4d56' }}>
                  14:38:07
                </span>
              </div>
            </div>
            <div
              className="rounded p-4"
              style={{
                background: 'rgba(250,77,86,0.08)',
                border: '1px solid rgba(250,77,86,0.25)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="font-mono font-semibold"
                  style={{ fontSize: '12px', color: '#fa4d56', letterSpacing: '0.08em' }}
                >
                  CONSENT.PROXY.SCOPE.BOUNDARY.001
                </span>
              </div>
              <p style={{ fontSize: '15px', color: '#c6c6c6', lineHeight: 1.6 }}>
                {`Clinical Care Agent attempted to share ${cgName} medication list with ${firstName}'s care coordinator. ${firstName} holds scoped proxy consent — medication management only. Third-party disclosure is explicitly excluded from consent scope.`}
              </p>
            </div>
            <div
              className="rounded p-4 flex flex-col gap-3"
              style={{ background: '#262626', border: '1px solid rgba(57,57,57,0.8)' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="font-mono uppercase tracking-wider"
                  style={{ fontSize: '11px', color: '#8d8d8d', letterSpacing: '0.1em' }}
                >
                  CONSENT SCOPE ANALYSIS
                </span>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {[
                  {
                    id: 'cs1',
                    label: 'Proxy Holder',
                    value: `${reg.name} (${reg.platformId}) — CAREGIVER_FOR ${cgName}`,
                    color: '#c6c6c6',
                  },
                  {
                    id: 'cs2',
                    label: 'Consent Scope',
                    value:
                      'Medication management · Appointment coordination · Care gap notifications',
                    color: '#42be65',
                  },
                  {
                    id: 'cs3',
                    label: 'Attempted Action',
                    value: 'Share medication list with third-party care coordinator',
                    color: '#fa4d56',
                  },
                  {
                    id: 'cs4',
                    label: 'Scope Verdict',
                    value: `EXCLUDED — third-party disclosure not authorized by ${cgFirst}`,
                    color: '#fa4d56',
                  },
                ].map((item) => (
                  <div key={item.id} className="flex flex-col gap-1">
                    <span style={{ fontSize: '12px', color: '#8d8d8d' }}>{item.label}</span>
                    <span style={{ fontSize: '13px', color: item.color, lineHeight: 1.4 }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Four-Pillar Governance Framework */}
            <div
              className="rounded p-4 flex flex-col gap-3"
              style={{
                background: '#1a1a1a',
                border: '1px solid rgba(139,92,246,0.3)',
                borderTop: '2px solid rgba(139,92,246,0.5)',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="rounded-full"
                  style={{ width: 6, height: 6, background: '#8b5cf6' }}
                />
                <span
                  className="font-mono uppercase"
                  style={{ fontSize: '9px', color: '#8b5cf6', letterSpacing: '0.12em' }}
                >
                  SUPERVISED AUTONOMY — CONSENT ARCHITECTURE
                </span>
              </div>
              <p
                style={{
                  fontSize: '13px',
                  color: '#c6c6c6',
                  lineHeight: 1.65,
                  fontStyle: 'italic',
                }}
              >
                The system didn’t just verify that {firstName} has proxy consent. It verified that{' '}
                <span style={{ color: '#8b5cf6', fontWeight: 600, fontStyle: 'normal' }}>
                  this specific action
                </span>{' '}
                — sharing {cgFirst}&apos;s medication list with a third party — falls outside the
                scope of that consent. That distinction is the difference between compliance theater
                and compliance architecture.
              </p>
              <div className="flex flex-col gap-1.5">
                {[
                  {
                    label: 'Resolution Option A',
                    value: `${cgFirst} must grant expanded scope for third-party disclosure`,
                    color: '#f59e0b',
                  },
                  {
                    label: 'Resolution Option B',
                    value: `Care coordinator contacts ${cgFirst} directly — no proxy required`,
                    color: '#f59e0b',
                  },
                  {
                    label: 'Audit',
                    value: 'Blocked action logged — agent ID, timestamp, scope analysis recorded',
                    color: '#42be65',
                  },
                ].map((r) => (
                  <div key={r.label} className="flex items-start gap-2">
                    <div
                      className="rounded-full flex-shrink-0 mt-1.5"
                      style={{ width: 5, height: 5, background: r.color }}
                    />
                    <div>
                      <span style={{ fontSize: '11px', color: '#6f6f6f' }}>{r.label}: </span>
                      <span style={{ fontSize: '11px', color: r.color }}>{r.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="rounded px-3 py-1.5 flex items-center gap-2"
                  style={{
                    background: 'rgba(250,77,86,0.12)',
                    border: '1px solid rgba(250,77,86,0.3)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: '#fa4d56' }}
                  />
                  <span
                    className="font-mono"
                    style={{ fontSize: '12px', color: '#fa4d56' }}
                  >{`Action blocked — ${cgFirst}'s consent boundary enforced`}</span>
                </div>
                <div
                  className="rounded px-3 py-1.5 flex items-center gap-2"
                  style={{
                    background: 'rgba(139,92,246,0.12)',
                    border: '1px solid rgba(139,92,246,0.3)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: '#8b5cf6' }}
                  />
                  <span className="font-mono" style={{ fontSize: '12px', color: '#8b5cf6' }}>
                    Audit trail updated — intercept #2 logged
                  </span>
                </div>
              </div>
              <button
                onClick={() => setConsentInterceptBanner(false)}
                className="rounded px-5 py-2.5 transition-all duration-200"
                style={{
                  background: 'rgba(250,77,86,0.2)',
                  border: '1px solid rgba(250,77,86,0.5)',
                  color: '#fa4d56',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                ACKNOWLEDGE →
              </button>
              <button
                onClick={() => {
                  setConsentInterceptBanner(false);
                  setMtmInterceptBanner(true);
                }}
                className="rounded px-5 py-2.5 transition-all duration-200"
                style={{
                  background: 'rgba(241,194,27,0.15)',
                  border: '1px solid rgba(241,194,27,0.45)',
                  color: '#f1c21b',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                VIEW Med review INTERCEPT →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Med review Duplicate Therapy Intercept Modal — CONSENT.DOMAIN.BOUNDARY.002 */}
      {mtmInterceptBanner && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center animate-intercept"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="rounded flex flex-col gap-5 max-w-2xl w-full mx-8"
            style={{
              background: '#1c1c1c',
              border: '2px solid rgba(250,77,86,0.7)',
              boxShadow: '0 0 40px rgba(250,77,86,0.3)',
              padding: '32px',
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 48,
                    height: 48,
                    background: 'rgba(250,77,86,0.2)',
                    border: '1px solid rgba(250,77,86,0.5)',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>⚠</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="font-mono font-semibold"
                      style={{ fontSize: '12px', color: '#fa4d56', letterSpacing: '0.12em' }}
                    >
                      GOVERNANCE INTERCEPT #3
                    </span>
                    <div
                      className="rounded px-2 py-0.5"
                      style={{
                        background: 'rgba(250,77,86,0.2)',
                        border: '1px solid rgba(250,77,86,0.4)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '10px', color: '#fa4d56' }}>
                        PATIENT SAFETY — CONSENT BOUNDARY
                      </span>
                    </div>
                  </div>
                  <h3 className="text-white font-semibold" style={{ fontSize: '20px' }}>
                    Duplicate Therapy — Med review Consent Scope Exceeded
                  </h3>
                </div>
              </div>
              <div
                className="rounded px-3 py-1.5"
                style={{
                  background: 'rgba(250,77,86,0.15)',
                  border: '1px solid rgba(250,77,86,0.3)',
                }}
              >
                <span className="font-mono" style={{ fontSize: '12px', color: '#fa4d56' }}>
                  14:44:05
                </span>
              </div>
            </div>

            {/* Policy ID */}
            <div
              className="rounded p-4"
              style={{
                background: 'rgba(250,77,86,0.08)',
                border: '1px solid rgba(250,77,86,0.25)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="font-mono font-semibold"
                  style={{ fontSize: '12px', color: '#fa4d56', letterSpacing: '0.08em' }}
                >
                  CONSENT.DOMAIN.BOUNDARY.002
                </span>
                <div
                  className="rounded px-2 py-0.5"
                  style={{
                    background: 'rgba(241,194,27,0.15)',
                    border: '1px solid rgba(241,194,27,0.4)',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{ fontSize: '9px', color: '#f1c21b' }}
                  >{`AUDIT_20241115_144405_${cgPharmacy.toUpperCase().replace(/ /g, '_')}_CONSENT_001`}</span>
                </div>
              </div>
              <p style={{ fontSize: '15px', color: '#c6c6c6', lineHeight: 1.6 }}>
                A duplicate-therapy condition was identified:{' '}
                <span
                  style={{ color: '#fa4d56', fontWeight: 600 }}
                >{`${cgMed1} (${orgName} · CVS #4821)`}</span>{' '}
                and{' '}
                <span
                  style={{ color: '#f1c21b', fontWeight: 600 }}
                >{`${cgMed2} (${cgPrescriber} · Walgreens #7734)`}</span>{' '}
                — two active fills, two prescribers unaware of each other. Med review enrollment
                requires sharing diagnosis codes and episode context with {cgPharmacy}. {firstName}
                &apos;s {cgPharmacy} consent is{' '}
                <span style={{ color: '#f1c21b', fontWeight: 600 }}>
                  LIMITED — fill history only
                </span>
                . Diagnosis codes are excluded.
              </p>
            </div>

            {/* Patient safety stakes */}
            <div
              className="rounded p-4 flex flex-col gap-3"
              style={{
                background: 'rgba(250,77,86,0.06)',
                border: '1px solid rgba(250,77,86,0.2)',
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: '#fa4d56',
                    animation: 'authPulse 1s ease-in-out infinite',
                  }}
                />
                <span
                  className="font-mono uppercase"
                  style={{ fontSize: '10px', color: '#fa4d56', letterSpacing: '0.1em' }}
                >
                  PATIENT SAFETY STAKES — CONSENT BLOCK CONSEQUENCE
                </span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {[
                  {
                    label: 'INR Stability',
                    value: 'Unpredictable — dual anticoagulant load accumulates',
                    color: '#fa4d56',
                  },
                  {
                    label: 'Bleeding Risk',
                    value: 'ELEVATED — combined Lisinopril Sodium effect',
                    color: '#fa4d56',
                  },
                  {
                    label: 'Prescriber Awareness',
                    value: `${orgName} and ${cgPrescriber} unaware of each other's prescription`,
                    color: '#f1c21b',
                  },
                  {
                    label: 'Med review Effectiveness',
                    value: 'Reduced — reconciliation incomplete without diagnosis context',
                    color: '#f59e0b',
                  },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-0.5">
                    <span style={{ fontSize: '11px', color: '#6f6f6f' }}>{item.label}</span>
                    <span style={{ fontSize: '12px', color: item.color, lineHeight: 1.4 }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Consent domain analysis */}
            <div
              className="rounded p-4 flex flex-col gap-3"
              style={{ background: '#262626', border: '1px solid rgba(57,57,57,0.8)' }}
            >
              <span
                className="font-mono uppercase"
                style={{ fontSize: '10px', color: '#8d8d8d', letterSpacing: '0.1em' }}
              >{`CONSENT DOMAIN ANALYSIS — ${cgPharmacy.toUpperCase()}`}</span>
              <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                {[
                  { label: 'Granted Scope', value: 'FILL_HISTORY', color: '#42be65' },
                  {
                    label: 'Requested Scope',
                    value: 'DIAGNOSIS_CODES · EPISODE_CONTEXT · Med review_ENROLLMENT',
                    color: '#fa4d56',
                  },
                  {
                    label: 'Verdict',
                    value: `BLOCKED — diagnosis codes excluded from ${cgPharmacy} consent scope`,
                    color: '#fa4d56',
                  },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-1">
                    <span style={{ fontSize: '11px', color: '#6f6f6f' }}>{item.label}</span>
                    <span style={{ fontSize: '12px', color: item.color, lineHeight: 1.4 }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Resolution options */}
            <div
              className="rounded p-4 flex flex-col gap-3"
              style={{
                background: '#1a1a1a',
                border: '1px solid rgba(139,92,246,0.3)',
                borderTop: '2px solid rgba(139,92,246,0.5)',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="rounded-full"
                  style={{ width: 6, height: 6, background: '#8b5cf6' }}
                />
                <span
                  className="font-mono uppercase"
                  style={{ fontSize: '9px', color: '#8b5cf6', letterSpacing: '0.12em' }}
                >
                  RESOLUTION OPTIONS — SYSTEM ROUTED
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  {
                    num: '1',
                    label: 'Prescriber alerts dispatched',
                    detail: `${orgName} + ${cgPrescriber} notified — duplicate therapy flag — reconciliation required`,
                    status: 'DISPATCHED',
                    statusColor: '#42be65',
                  },
                  {
                    num: '2',
                    label: 'Med review enrolled — fill history only',
                    detail: `${cgPharmacy} Med review initiated with fill history — flags duplicate, no clinical context — partial effectiveness`,
                    status: 'ACTIVE',
                    statusColor: '#f59e0b',
                  },
                  {
                    num: '3',
                    label: 'Consent expansion request queued',
                    detail: `Member outreach to request expanded ${cgPharmacy} consent — ${careMgrName} 10am outreach includes consent ask`,
                    status: 'QUEUED',
                    statusColor: '#78a9ff',
                  },
                  {
                    num: '4',
                    label: `Care manager briefed — ${careMgrName}`,
                    detail:
                      'H1ab view updated — duplicate therapy critical alert loaded — manual reconciliation option available',
                    status: 'COMPLETE',
                    statusColor: '#42be65',
                  },
                ].map((opt) => (
                  <div
                    key={opt.num}
                    className="flex items-start gap-3 rounded px-3 py-2"
                    style={{
                      background: `${opt.statusColor}08`,
                      border: `1px solid ${opt.statusColor}25`,
                    }}
                  >
                    <div
                      className="rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 20,
                        height: 20,
                        background: `${opt.statusColor}20`,
                        border: `1px solid ${opt.statusColor}50`,
                      }}
                    >
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '10px', color: opt.statusColor }}
                      >
                        {opt.num}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span
                          className="font-semibold"
                          style={{ fontSize: '12px', color: '#f4f4f4' }}
                        >
                          {opt.label}
                        </span>
                        <div
                          className="rounded px-1.5 py-0.5 flex-shrink-0"
                          style={{
                            background: `${opt.statusColor}15`,
                            border: `1px solid ${opt.statusColor}40`,
                          }}
                        >
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '9px',
                              color: opt.statusColor,
                              letterSpacing: '0.06em',
                            }}
                          >
                            {opt.status}
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#8d8d8d', lineHeight: 1.4 }}>
                        {opt.detail}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="rounded px-3 py-1.5 flex items-center gap-2"
                  style={{
                    background: 'rgba(66,190,101,0.12)',
                    border: '1px solid rgba(66,190,101,0.3)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: '#42be65' }}
                  />
                  <span className="font-mono" style={{ fontSize: '12px', color: '#42be65' }}>
                    HIPAA minimum necessary — ENFORCED
                  </span>
                </div>
                <div
                  className="rounded px-3 py-1.5 flex items-center gap-2"
                  style={{
                    background: 'rgba(139,92,246,0.12)',
                    border: '1px solid rgba(139,92,246,0.3)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: '#8b5cf6' }}
                  />
                  <span className="font-mono" style={{ fontSize: '12px', color: '#8b5cf6' }}>
                    Audit trail updated — intercept #3 logged
                  </span>
                </div>
              </div>
              <button
                onClick={() => setMtmInterceptBanner(false)}
                className="rounded px-5 py-2.5 transition-all duration-200"
                style={{
                  background: 'rgba(250,77,86,0.2)',
                  border: '1px solid rgba(250,77,86,0.5)',
                  color: '#fa4d56',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                ACKNOWLEDGE →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision Tree Modal */}
      {activeDecisionTree && AGENT_DECISION_TREES[activeDecisionTree] && (
        <DecisionTreeModal
          data={AGENT_DECISION_TREES[activeDecisionTree]}
          onClose={() => setActiveDecisionTree(null)}
        />
      )}
    </ScreenLayout>
  );
}

export default function ControllerScreen() {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  return <ControllerScreenInner key={activeCitizenId} />;
}
