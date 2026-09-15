'use client';
// DorothyStatusBanner — shared patient state indicator for Dorothy Simmons
// Embeds in Care Manager, CHW Workflow, Episodic Analytics, and Crisis Pathway
// to show live episode status, BH risk, social needs flags, and pathway progress.

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { PatientContextProvider, usePatientContext } from '@/lib/patientContext';
import type { EpisodeStatus, BHRiskLevel } from '@/lib/patientContext';

const EPISODE_STATUS_COLORS: Record<EpisodeStatus, { bg: string; text: string; border: string }> = {
  Active: { bg: '#d0e2ff', text: '#0043ce', border: '#97c1ff' },
  Stable: { bg: '#defbe6', text: '#0e6027', border: '#24a148' },
  Closed: { bg: '#f4f4f4', text: '#6f6f6f', border: '#c6c6c6' },
  Escalated: { bg: '#fff1f1', text: '#da1e28', border: '#da1e28' },
};

const BH_RISK_COLORS: Record<BHRiskLevel, { bg: string; text: string; border: string }> = {
  Low: { bg: '#defbe6', text: '#0e6027', border: '#24a148' },
  Moderate: { bg: '#fdf6dd', text: '#b45309', border: '#f1c21b' },
  High: { bg: '#fff1f1', text: '#da1e28', border: '#da1e28' },
  Crisis: { bg: '#2d0000', text: '#ff8389', border: '#da1e28' },
};

function BannerContent({ screenContext }: { screenContext: string }) {
  const { patient, updateEpisodeStatus, updateBHRisk } = usePatientContext();
  const [expanded, setExpanded] = useState(false);

  const openGaps = patient.careGaps.filter((g) => g.status !== 'Closed' && g.status !== 'Waived');
  const clinicalGaps = openGaps.filter((g) => g.domain === 'Clinical').length;
  const bhGaps = openGaps.filter((g) => g.domain === 'BH').length;
  const socialGaps = openGaps.filter((g) => g.domain === 'Social').length;

  const epColors = EPISODE_STATUS_COLORS[patient.episodeStatus];
  const bhColors = BH_RISK_COLORS[patient.bhRisk];

  const completedSteps = patient.pathwaySteps.filter((s) => s.completed).length;
  const totalSteps = patient.pathwaySteps.length;

  return (
    <div className="bg-[#001141] border border-[#003a75] mb-4">
      {/* Collapsed header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#001d3d] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-6 h-6 bg-[#007d79] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-2xs font-bold">DS</span>
        </div>
        <span className="text-xs font-semibold text-[#78a9ff]">
          Dorothy Simmons · {patient.mrn}
        </span>
        <span className="text-2xs text-[#a8c8e8] hidden sm:inline">Shared Patient State</span>

        {/* Episode status */}
        <span
          className="text-2xs font-semibold px-2 py-0.5 border ml-2"
          style={{ background: epColors.bg, color: epColors.text, borderColor: epColors.border }}
        >
          {patient.episodeType} · {patient.episodeStatus}
        </span>

        {/* BH risk */}
        <span
          className="text-2xs font-semibold px-2 py-0.5 border"
          style={{ background: bhColors.bg, color: bhColors.text, borderColor: bhColors.border }}
        >
          BH: {patient.bhRisk}
        </span>

        {/* Social needs */}
        {patient.transportStatus === 'Active' && (
          <span className="text-2xs font-semibold px-2 py-0.5 bg-[#d9fbfb] text-[#007d79] border border-[#9ef0f0]">
            🚌 Transport Active
          </span>
        )}
        {patient.snapStatus === 'Active' && (
          <span className="text-2xs font-semibold px-2 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#24a148]">
            SNAP ✓
          </span>
        )}

        {/* Gap count */}
        <span className="text-2xs text-[#a8c8e8] ml-auto">{openGaps.length} open gaps</span>

        {/* Pathway progress */}
        <span className="text-2xs text-[#42be65] font-medium">
          Pathway {completedSteps}/{totalSteps}
        </span>

        <Icon
          name={expanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
          size={14}
          className="text-[#78a9ff] flex-shrink-0"
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#003a75] px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Episode */}
          <div>
            <p className="text-2xs text-[#a8c8e8] uppercase tracking-wide mb-1">Episode</p>
            <p className="text-xs font-semibold text-white">{patient.episodeType}</p>
            <p className="text-2xs text-[#a8c8e8]">{patient.episodeDaysActive} days active</p>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {(['Active', 'Stable', 'Escalated', 'Closed'] as EpisodeStatus[]).map((s) => {
                const c = EPISODE_STATUS_COLORS[s];
                return (
                  <button
                    key={s}
                    onClick={() => updateEpisodeStatus(s)}
                    className="text-2xs px-1.5 py-0.5 border font-medium transition-opacity"
                    style={{
                      background: c.bg,
                      color: c.text,
                      borderColor: c.border,
                      opacity: patient.episodeStatus === s ? 1 : 0.5,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* BH Risk */}
          <div>
            <p className="text-2xs text-[#a8c8e8] uppercase tracking-wide mb-1">BH Risk</p>
            <p className="text-xs font-semibold text-white">
              PHQ-9: {patient.phq9Score} · {patient.phq9Trend}
            </p>
            <p className="text-2xs text-[#a8c8e8]">Provider: {patient.bhProvider}</p>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {(['Low', 'Moderate', 'High', 'Crisis'] as BHRiskLevel[]).map((r) => {
                const c = BH_RISK_COLORS[r];
                return (
                  <button
                    key={r}
                    onClick={() => updateBHRisk(r)}
                    className="text-2xs px-1.5 py-0.5 border font-medium transition-opacity"
                    style={{
                      background: c.bg,
                      color: c.text,
                      borderColor: c.border,
                      opacity: patient.bhRisk === r ? 1 : 0.5,
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Social Needs */}
          <div>
            <p className="text-2xs text-[#a8c8e8] uppercase tracking-wide mb-1">Social Needs</p>
            <div className="space-y-0.5">
              <p className="text-xs text-white">
                Transport: <span className="text-[#42be65]">{patient.transportStatus}</span>
              </p>
              <p className="text-xs text-white">
                SNAP: <span className="text-[#42be65]">{patient.snapStatus}</span>
              </p>
              <p className="text-xs text-white">
                Housing: <span className="text-[#c6e2ff]">{patient.housingStatus}</span>
              </p>
              <p className="text-xs text-white">
                Food: <span className="text-[#c6e2ff]">{patient.foodSecurity}</span>
              </p>
            </div>
          </div>

          {/* Gap summary + Pathway */}
          <div>
            <p className="text-2xs text-[#a8c8e8] uppercase tracking-wide mb-1">Open Gaps</p>
            <div className="flex gap-2 flex-wrap mb-2">
              <span className="text-2xs px-2 py-0.5 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff] font-semibold">
                Clinical {clinicalGaps}
              </span>
              <span className="text-2xs px-2 py-0.5 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff] font-semibold">
                BH {bhGaps}
              </span>
              <span className="text-2xs px-2 py-0.5 bg-[#d9fbfb] text-[#007d79] border border-[#9ef0f0] font-semibold">
                Social {socialGaps}
              </span>
            </div>
            <p className="text-2xs text-[#a8c8e8] uppercase tracking-wide mb-1">Pathway</p>
            <div className="flex items-center gap-1">
              {patient.pathwaySteps.map((step) => (
                <div
                  key={step.id}
                  className={`w-4 h-4 flex items-center justify-center border ${
                    step.completed
                      ? 'bg-[#24a148] border-[#24a148]'
                      : 'bg-transparent border-[#525252]'
                  }`}
                  title={step.label}
                >
                  {step.completed && <Icon name="CheckIcon" size={10} className="text-white" />}
                </div>
              ))}
              <span className="text-2xs text-[#a8c8e8] ml-1">
                {completedSteps}/{totalSteps} complete
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Exported wrapper — wraps in provider if not already wrapped ──────────────
export default function DorothyStatusBanner({ screenContext }: { screenContext: string }) {
  return (
    <PatientContextProvider>
      <BannerContent screenContext={screenContext} />
    </PatientContextProvider>
  );
}
