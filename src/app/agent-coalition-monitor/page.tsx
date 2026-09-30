'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const AGENTS = [
  {
    id: 'agt-001',
    name: 'CareGap Sentinel',
    role: 'Gap Detection',
    status: 'RUNNING',
    tasksCompleted: 1842,
    tasksQueued: 23,
    accuracy: 96.4,
    lastAction: 'Flagged HbA1c gap — Maria Redhawk',
    lastActionTime: '2 min ago',
    coalition: 'Clinical Quality',
    priority: 'HIGH',
  },
  {
    id: 'agt-002',
    name: 'SDOH Navigator',
    role: 'Social Needs Routing',
    status: 'RUNNING',
    tasksCompleted: 934,
    tasksQueued: 8,
    accuracy: 91.2,
    lastAction: 'Matched transport benefit — 3 patients',
    lastActionTime: '5 min ago',
    coalition: 'Social Determinants',
    priority: 'HIGH',
  },
  {
    id: 'agt-003',
    name: 'Risk Stratifier',
    role: 'Risk Scoring',
    status: 'RUNNING',
    tasksCompleted: 3201,
    tasksQueued: 0,
    accuracy: 94.8,
    lastAction: 'Recalculated RAF scores — 47 patients',
    lastActionTime: '1 min ago',
    coalition: 'Clinical Quality',
    priority: 'MEDIUM',
  },
  {
    id: 'agt-004',
    name: 'Gainshare Calculator',
    role: 'Financial Attribution',
    status: 'RUNNING',
    tasksCompleted: 412,
    tasksQueued: 2,
    accuracy: 99.1,
    lastAction: 'Attributed $8,100 — HbA1c closure',
    lastActionTime: '18 min ago',
    coalition: 'Financial',
    priority: 'MEDIUM',
  },
  {
    id: 'agt-005',
    name: 'ADT Watcher',
    role: 'Admission/Discharge Alerts',
    status: 'RUNNING',
    tasksCompleted: 2890,
    tasksQueued: 1,
    accuracy: 98.7,
    lastAction: 'ED alert — Jackson County Memorial',
    lastActionTime: '3 min ago',
    coalition: 'Utilization',
    priority: 'HIGH',
  },
  {
    id: 'agt-006',
    name: 'HEDIS Auditor',
    role: 'Measure Compliance',
    status: 'IDLE',
    tasksCompleted: 678,
    tasksQueued: 0,
    accuracy: 97.3,
    lastAction: 'CDC HbA1c measure updated — MET',
    lastActionTime: '22 min ago',
    coalition: 'Clinical Quality',
    priority: 'LOW',
  },
  {
    id: 'agt-007',
    name: 'Consent Enforcer',
    role: 'Data Governance',
    status: 'RUNNING',
    tasksCompleted: 5104,
    tasksQueued: 4,
    accuracy: 100.0,
    lastAction: 'Blocked cross-org share — no consent',
    lastActionTime: '7 min ago',
    coalition: 'Governance',
    priority: 'HIGH',
  },
  {
    id: 'agt-008',
    name: 'Referral Orchestrator',
    role: 'Referral Routing',
    status: 'PAUSED',
    tasksCompleted: 289,
    tasksQueued: 11,
    accuracy: 88.4,
    lastAction: 'Paused — provider directory refresh',
    lastActionTime: '34 min ago',
    coalition: 'Care Coordination',
    priority: 'MEDIUM',
  },
];

const COALITION_ACTIVITY = [
  { coalition: 'Clinical Quality', tasks: 4721, agents: 3 },
  { coalition: 'Social Determinants', tasks: 934, agents: 1 },
  { coalition: 'Utilization', tasks: 2890, agents: 1 },
  { coalition: 'Financial', tasks: 412, agents: 1 },
  { coalition: 'Governance', tasks: 5104, agents: 1 },
  { coalition: 'Care Coordination', tasks: 289, agents: 1 },
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  RUNNING: { bg: '#defbe6', text: '#0e6027', dot: '#198038' },
  IDLE: { bg: '#d0e2ff', text: '#0043ce', dot: '#4589ff' },
  PAUSED: { bg: '#fdf6dd', text: '#b45309', dot: '#f1c21b' },
  ERROR: { bg: '#fff1f1', text: '#da1e28', dot: '#da1e28' },
};

const PRIORITY_CONFIG: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: '#fff1f1', text: '#da1e28' },
  MEDIUM: { bg: '#fdf6dd', text: '#b45309' },
  LOW: { bg: '#d0e2ff', text: '#0043ce' },
};

const COALITION_COLORS: Record<string, string> = {
  'Clinical Quality': '#0043ce',
  'Social Determinants': '#8a3ffc',
  Utilization: '#da1e28',
  Financial: '#198038',
  Governance: '#6929c4',
  'Care Coordination': '#b45309',
};

export default function AgentCoalitionMonitorPage() {
  const [selectedCoalition, setSelectedCoalition] = useState('All');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const coalitions = ['All', ...Array.from(new Set(AGENTS.map((a) => a.coalition)))];
  const filtered =
    selectedCoalition === 'All' ? AGENTS : AGENTS.filter((a) => a.coalition === selectedCoalition);

  const runningCount = AGENTS.filter((a) => a.status === 'RUNNING').length;
  const totalTasks = AGENTS.reduce((a, c) => a + c.tasksCompleted, 0);
  const totalQueued = AGENTS.reduce((a, c) => a + c.tasksQueued, 0);
  const avgAccuracy = (AGENTS.reduce((a, c) => a + c.accuracy, 0) / AGENTS.length).toFixed(1);

  const selected = AGENTS.find((a) => a.id === selectedAgent);

  return (
    <AppLayout
      pageTitle="Agent Coalition Monitor"
      breadcrumbs={[{ label: 'CDP & Agentic Automation' }, { label: 'Agent Coalition Monitor' }]}
    >
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Active Agents',
            value: `${runningCount}/${AGENTS.length}`,
            icon: 'CpuChipIcon',
            color: 'text-[#198038]',
            bg: 'bg-[#defbe6]',
          },
          {
            label: 'Tasks Completed',
            value: totalTasks.toLocaleString(),
            icon: 'CheckCircleIcon',
            color: 'text-[#0043ce]',
            bg: 'bg-[#d0e2ff]',
          },
          {
            label: 'Tasks Queued',
            value: totalQueued.toString(),
            icon: 'QueueListIcon',
            color: 'text-[#b45309]',
            bg: 'bg-[#fdf6dd]',
          },
          {
            label: 'Avg Accuracy',
            value: `${avgAccuracy}%`,
            icon: 'ShieldCheckIcon',
            color: 'text-[#6929c4]',
            bg: 'bg-[#f6f2ff]',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-carbon-gray-20 p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 ${kpi.bg} flex items-center justify-center flex-shrink-0`}>
              <Icon name={kpi.icon as any} size={20} className={kpi.color} />
            </div>
            <div>
              <p className="text-xs text-carbon-gray-50">{kpi.label}</p>
              <p className="text-xl font-bold text-carbon-gray-100">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Agent Table */}
        <div className="xl:col-span-2 bg-white border border-carbon-gray-20">
          <div className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20">
            <p className="text-sm font-semibold text-carbon-gray-100">Agent Registry</p>
            <div className="flex gap-1">
              {coalitions.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedCoalition(c)}
                  className={`px-2.5 py-1 text-2xs font-semibold transition-colors ${
                    selectedCoalition === c
                      ? 'bg-[#0043ce] text-white'
                      : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-carbon-gray-10">
            {filtered.map((agent) => {
              const sc = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG['ACTIVE'];
              const pc = PRIORITY_CONFIG[agent.priority] ?? PRIORITY_CONFIG['MEDIUM'];
              const isSelected = selectedAgent === agent.id;
              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                  className={`px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-[#d0e2ff]/30' : 'hover:bg-carbon-gray-10'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-[#f6f2ff] flex items-center justify-center flex-shrink-0">
                        <Icon name="CpuChipIcon" size={16} className="text-[#6929c4]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-carbon-gray-100">
                            {agent.name}
                          </span>
                          <span className="text-2xs text-carbon-gray-50">{agent.role}</span>
                          <span
                            className="px-1.5 py-0.5 text-2xs font-semibold"
                            style={{ background: pc.bg, color: pc.text }}
                          >
                            {agent.priority}
                          </span>
                        </div>
                        <p className="text-xs text-carbon-gray-50 mt-0.5 truncate">
                          {agent.lastAction} ·{' '}
                          <span className="text-carbon-gray-30">{agent.lastActionTime}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-carbon-gray-100">
                          {agent.tasksCompleted.toLocaleString()}
                        </p>
                        <p className="text-2xs text-carbon-gray-50">completed</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-carbon-gray-100">
                          {agent.accuracy}%
                        </p>
                        <p className="text-2xs text-carbon-gray-50">accuracy</p>
                      </div>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                        <span
                          className="px-1.5 py-0.5 text-2xs font-semibold"
                          style={{ background: sc.bg, color: sc.text }}
                        >
                          {agent.status}
                        </span>
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-carbon-gray-10 grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-carbon-gray-50">Coalition</span>
                        <p
                          className="font-semibold"
                          style={{ color: COALITION_COLORS[agent.coalition] }}
                        >
                          {agent.coalition}
                        </p>
                      </div>
                      <div>
                        <span className="text-carbon-gray-50">Queued</span>
                        <p className="font-semibold text-carbon-gray-100">
                          {agent.tasksQueued} tasks
                        </p>
                      </div>
                      <div>
                        <span className="text-carbon-gray-50">Agent ID</span>
                        <p className="font-mono text-carbon-gray-70">{agent.id}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Coalition Activity Chart */}
        <div className="bg-white border border-carbon-gray-20 p-5">
          <p className="text-sm font-semibold text-carbon-gray-100 mb-4">Coalition Activity</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={COALITION_ACTIVITY} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              />
              <YAxis type="category" dataKey="coalition" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Tasks']} />
              <Bar dataKey="tasks" fill="#0043ce" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {COALITION_ACTIVITY.map((c) => (
              <div key={c.coalition} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: COALITION_COLORS[c.coalition] }}
                  />
                  <span className="text-carbon-gray-70">{c.coalition}</span>
                </div>
                <span className="font-semibold text-carbon-gray-100">
                  {c.agents} agent{c.agents > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
