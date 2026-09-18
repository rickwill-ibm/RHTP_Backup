'use client';
import React from 'react';
import type { PatientJourneyPosition, JourneyPhase } from '@/lib/smartFhirTypes';
import Icon from '@/components/ui/AppIcon';

interface PatientJourneyModuleProps {
  journey: PatientJourneyPosition;
}

const PHASES: Array<{ key: JourneyPhase; label: string; icon: string }> = [
  { key: 'stable-management', label: 'Stable Mgmt', icon: 'CheckCircleIcon' },
  { key: 'gap-in-care', label: 'Gap in Care', icon: 'ClockIcon' },
  { key: 'deteriorating', label: 'Deteriorating', icon: 'ArrowTrendingDownIcon' },
  { key: 'high-risk-transition', label: 'High-Risk Transition', icon: 'ExclamationTriangleIcon' },
  { key: 'post-acute-recovery', label: 'Post-Acute Recovery', icon: 'ArrowPathIcon' },
];

const PHASE_CONFIG: Record<
  JourneyPhase,
  { color: string; bg: string; border: string; dot: string }
> = {
  'stable-management': {
    color: 'text-[#0e6027]',
    bg: 'bg-[#defbe6]',
    border: 'border-[#a7f0ba]',
    dot: 'bg-[#24a148]',
  },
  'gap-in-care': {
    color: 'text-[#b45309]',
    bg: 'bg-[#fdf6dd]',
    border: 'border-[#f1c21b]',
    dot: 'bg-[#f1c21b]',
  },
  deteriorating: {
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
    border: 'border-[#ffb3b8]',
    dot: 'bg-[#da1e28]',
  },
  'high-risk-transition': {
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
    border: 'border-[#da1e28]',
    dot: 'bg-[#da1e28]',
  },
  'post-acute-recovery': {
    color: 'text-[#0043ce]',
    bg: 'bg-[#d0e2ff]',
    border: 'border-[#97c1ff]',
    dot: 'bg-[#0043ce]',
  },
};

const TRAJECTORY_CONFIG = {
  improving: { label: 'Improving', color: 'text-[#24a148]', icon: 'ArrowTrendingUpIcon' },
  stable: { label: 'Stable', color: 'text-[#b45309]', icon: 'MinusIcon' },
  worsening: { label: 'Worsening', color: 'text-[#da1e28]', icon: 'ArrowTrendingDownIcon' },
};

export default function PatientJourneyModule({ journey }: PatientJourneyModuleProps) {
  const cfg = PHASE_CONFIG[journey.phase];
  const traj = TRAJECTORY_CONFIG[journey.riskTrajectory];
  const currentPhaseIdx = PHASES.findIndex((p) => p.key === journey.phase);

  return (
    <div className="bg-white border border-carbon-gray-20">
      {/* Header */}
      <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="MapIcon" size={16} className="text-carbon-gray-70" />
          <span className="text-sm font-semibold text-carbon-gray-100">
            Patient Journey Position
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${traj.color}`}>
            <Icon name={traj.icon as any} size={13} />
            <span>{traj.label} trajectory</span>
          </div>
          <span className="text-xs text-carbon-gray-50">{journey.daysInPhase}d in phase</span>
        </div>
      </div>

      <div className="p-5">
        {/* Phase timeline */}
        <div className="flex items-center gap-0 mb-5 overflow-x-auto pb-1">
          {PHASES.map((phase, idx) => {
            const isActive = phase.key === journey.phase;
            const isPast = idx < currentPhaseIdx;
            const pCfg = PHASE_CONFIG[phase.key];

            return (
              <React.Fragment key={phase.key}>
                <div
                  className={`flex flex-col items-center min-w-[90px] ${isActive ? 'opacity-100' : isPast ? 'opacity-60' : 'opacity-30'}`}
                >
                  <div
                    className={`w-8 h-8 flex items-center justify-center border-2 ${
                      isActive
                        ? `${pCfg.bg} ${pCfg.border}`
                        : isPast
                          ? 'bg-carbon-gray-20 border-carbon-gray-30'
                          : 'bg-white border-carbon-gray-20'
                    }`}
                  >
                    <Icon
                      name={phase.icon as any}
                      size={14}
                      className={
                        isActive
                          ? pCfg.color
                          : isPast
                            ? 'text-carbon-gray-50'
                            : 'text-carbon-gray-30'
                      }
                    />
                  </div>
                  <span
                    className={`text-2xs mt-1.5 text-center leading-tight font-medium ${isActive ? pCfg.color : 'text-carbon-gray-50'}`}
                  >
                    {phase.label}
                  </span>
                  {isActive && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${pCfg.dot}`} />}
                </div>
                {idx < PHASES.length - 1 && (
                  <div
                    className={`flex-1 h-px min-w-[20px] ${idx < currentPhaseIdx ? 'bg-carbon-gray-40' : 'bg-carbon-gray-20'}`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Active phase callout */}
        <div className={`${cfg.bg} border ${cfg.border} px-4 py-3 mb-4`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className={`text-sm font-semibold ${cfg.color} mb-1`}>{journey.phaseLabel}</p>
              <p className="text-xs text-carbon-gray-70 leading-relaxed">
                {journey.phaseDescription}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xs text-carbon-gray-50 mb-0.5">Urgency Score</p>
              <p className={`text-2xl font-bold font-mono tabular-nums ${cfg.color}`}>
                {journey.urgencyScore}
              </p>
              <p className="text-2xs text-carbon-gray-50">/100</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-current/10">
            <p className="text-xs text-carbon-gray-70">
              <span className="font-medium">Next milestone:</span> {journey.nextMilestone}
            </p>
          </div>
        </div>

        {/* Signals grid */}
        <div>
          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest mb-2">
            Clinical Signals
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {journey.signals.map((sig, idx) => (
              <div
                key={`sig-${idx}`}
                className={`flex items-start gap-2 px-3 py-2 border ${
                  sig.flagged
                    ? 'bg-[#fff8f8] border-[#ffb3b8]'
                    : 'bg-carbon-gray-10 border-carbon-gray-20'
                }`}
              >
                <div
                  className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${sig.flagged ? 'bg-[#da1e28]' : 'bg-carbon-gray-40'}`}
                />
                <div className="min-w-0">
                  <p className="text-2xs text-carbon-gray-50 truncate">
                    {sig.source} · {sig.label}
                  </p>
                  <p
                    className={`text-xs font-medium truncate ${sig.flagged ? 'text-[#da1e28]' : 'text-carbon-gray-100'}`}
                  >
                    {sig.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
