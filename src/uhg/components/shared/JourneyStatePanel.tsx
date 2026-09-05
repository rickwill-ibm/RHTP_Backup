'use client';

import React, { useState } from 'react';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientById, placeholderMember } from '@/lib/patientRegistry';
import { journeyForPatient } from '@/uhg/data/journeys';

interface JourneyStatePanelProps {
  collapsed?: boolean;
}

// Per-active-citizen "ACTIVE JOURNEYS" context panel. Consumer/Provider/Operational journeys
// are derived from the selected member's registry record + resolved care journey, so this
// works for any patient (mock or production). Maria stays the default.
export default function JourneyStatePanel({ collapsed: initialCollapsed = false }: JourneyStatePanelProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const reg = getPatientById(activeCitizenId) ?? placeholderMember(activeCitizenId);

  const firstName = reg.name.split(' ')[0];
  const org = reg.organization.replace(/ \(.*\)/, '');
  const journey = journeyForPatient(reg);
  const highSensitivity = /crit|high/i.test(reg.riskTier || '');

  // Next clinical milestone — derived from the resolved journey (not hardcoded)
  const nextStep = journey.steps.find((s) => s.day > journey.currentDay);
  const milestoneValue = nextStep
    ? `${nextStep.label} — Day ${nextStep.day} (${nextStep.day - journey.currentDay}d out)`
    : 'Episode close approaching';

  // Provider-network roles — deterministic from the org (varies per provider, stable per provider)
  const orgHash = org.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const providerRoles = [
    { label: `Attending ${8 + (orgHash % 12)}`, color: '#0C55B8' },
    { label: `Referring ${3 + (orgHash % 8)}`, color: '#8b5cf6' },
    { label: `Network ${120 + (orgHash % 220)}`, color: '#42be65' },
  ];

  // Provider channel constraint — derived from the member's digital access
  const phoneLed = /phone only|limited|low/i.test(reg.digitalAccess || '');
  const channelBadge = phoneLed ? 'PHONE PRIMARY' : 'EHR + PORTAL';
  const channelNote = phoneLed ? 'broadband-limited — portal suppressed' : 'multi-channel active';

  // Operational journey — derived from PMPM vs target + ER risk
  const overBudget = (reg.pmpm ?? 0) >= (reg.pmpmTarget ?? 0);
  const star = Math.max(1.5, 5 - (reg.erRiskPct ?? 40) / 30).toFixed(1);

  const consumerRows = [
    { label: 'Stage', value: `${reg.episodeType} — ${journey.currentStage.toLowerCase()} stage`, color: '#c6c6c6' },
    { label: 'Position', value: `Day ${journey.currentDay} of ${journey.windowDays}-day episode window`, color: '#78a9ff' },
    { label: 'Milestone', value: milestoneValue, color: '#f1c21b' },
  ];
  const operationalRows = [
    { label: 'Context', value: `${reg.contract} quality window — ${reg.attribution}`, color: '#f1c21b' },
    { label: 'TCOC', value: overBudget ? `Over target — PMPM $${reg.pmpm} vs $${reg.pmpmTarget}` : `Within budget — PMPM $${reg.pmpm} / $${reg.pmpmTarget}`, color: overBudget ? '#fa4d56' : '#42be65' },
    { label: 'Star Rating', value: `${star} — readmission reduction is board priority`, color: '#78a9ff' },
  ];

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-2 rounded px-3 py-2 transition-all duration-200"
        style={{ background: 'rgba(38,38,38,0.95)', border: '1px solid rgba(57,57,57,0.8)', cursor: 'pointer' }}
      >
        <div className="rounded-full" style={{ width: 7, height: 7, background: '#42be65', animation: 'authPulse 2s ease-in-out infinite' }} />
        <span className="font-mono" style={{ fontSize: '10px', color: '#8d8d8d', letterSpacing: '0.1em' }}>ACTIVE JOURNEYS</span>
        <span style={{ fontSize: '10px', color: '#6f6f6f' }}>▸</span>
      </button>
    );
  }

  return (
    <div
      className="rounded flex flex-col gap-0 overflow-hidden"
      style={{ background: 'rgba(22,22,22,0.97)', border: '1px solid rgba(57,57,57,0.9)', backdropFilter: 'blur(8px)', width: 280 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(57,57,57,0.7)', background: 'rgba(38,38,38,0.8)' }}
      >
        <div className="flex items-center gap-2">
          <div className="rounded-full" style={{ width: 7, height: 7, background: '#42be65', animation: 'authPulse 2s ease-in-out infinite' }} />
          <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#42be65', letterSpacing: '0.12em' }}>ACTIVE JOURNEYS</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '10px', color: '#6f6f6f' }}>{reg.name} + {org}</span>
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6f6f6f', fontSize: '12px', padding: 0 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Consumer Journey */}
      <div className="px-3 py-2.5 flex flex-col gap-1.5" style={{ borderBottom: '1px solid rgba(57,57,57,0.5)' }}>
        <div className="flex items-center gap-2 mb-0.5">
          <div className="rounded px-1.5 py-0.5" style={{ background: 'rgba(250,77,86,0.15)', border: '1px solid rgba(250,77,86,0.35)' }}>
            <span className="font-mono" style={{ fontSize: '8px', color: '#fa4d56', letterSpacing: '0.1em' }}>CONSUMER JOURNEY</span>
          </div>
          <span style={{ fontSize: '10px', color: '#8d8d8d' }}>{firstName}</span>
        </div>
        <div className="flex flex-col gap-1">
          {consumerRows.map((item) => (
            <div key={item.label} className="flex items-start gap-2">
              <span style={{ fontSize: '9px', color: '#6f6f6f', minWidth: 52, paddingTop: 1, letterSpacing: '0.04em' }}>{item.label}</span>
              <span style={{ fontSize: '10px', color: item.color, lineHeight: 1.4 }}>{item.value}</span>
            </div>
          ))}
          {highSensitivity && (
            <div className="flex items-center gap-2 mt-0.5">
              <div className="rounded px-1.5 py-0.5" style={{ background: 'rgba(250,77,86,0.12)', border: '1px solid rgba(250,77,86,0.3)' }}>
                <span className="font-mono" style={{ fontSize: '8px', color: '#fa4d56', letterSpacing: '0.08em' }}>SENSITIVITY: HIGH</span>
              </div>
              <span style={{ fontSize: '9px', color: '#6f6f6f' }}>do not over-communicate</span>
            </div>
          )}
        </div>
      </div>

      {/* Provider Journey */}
      <div className="px-3 py-2.5 flex flex-col gap-1.5" style={{ borderBottom: '1px solid rgba(57,57,57,0.5)' }}>
        <div className="flex items-center gap-2 mb-0.5">
          <div className="rounded px-1.5 py-0.5" style={{ background: 'rgba(12,85,184,0.15)', border: '1px solid rgba(12,85,184,0.35)' }}>
            <span className="font-mono" style={{ fontSize: '8px', color: '#78a9ff', letterSpacing: '0.1em' }}>PROVIDER JOURNEY</span>
          </div>
          <span style={{ fontSize: '10px', color: '#8d8d8d' }}>{org}</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <span style={{ fontSize: '9px', color: '#6f6f6f', minWidth: 52, paddingTop: 1 }}>Roles</span>
            <div className="flex flex-wrap gap-1">
              {providerRoles.map((r) => (
                <span key={r.label} className="rounded px-1.5 py-0.5 font-mono" style={{ fontSize: '8px', color: r.color, background: `${r.color}18`, border: `1px solid ${r.color}35` }}>{r.label}</span>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span style={{ fontSize: '9px', color: '#6f6f6f', minWidth: 52, paddingTop: 1 }}>Constraint</span>
            <span style={{ fontSize: '10px', color: '#f1c21b', lineHeight: 1.4 }}>Eligibility {reg.attribution}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="rounded px-1.5 py-0.5" style={{ background: 'rgba(12,85,184,0.12)', border: '1px solid rgba(12,85,184,0.3)' }}>
              <span className="font-mono" style={{ fontSize: '8px', color: '#78a9ff', letterSpacing: '0.08em' }}>{channelBadge}</span>
            </div>
            <span style={{ fontSize: '9px', color: '#6f6f6f' }}>{channelNote}</span>
          </div>
        </div>
      </div>

      {/* Operational Journey */}
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="rounded px-1.5 py-0.5" style={{ background: 'rgba(66,190,101,0.15)', border: '1px solid rgba(66,190,101,0.35)' }}>
            <span className="font-mono" style={{ fontSize: '8px', color: '#42be65', letterSpacing: '0.1em' }}>OPERATIONAL JOURNEY</span>
          </div>
          <span style={{ fontSize: '10px', color: '#8d8d8d' }}>Plan</span>
        </div>
        <div className="flex flex-col gap-1">
          {operationalRows.map((item) => (
            <div key={item.label} className="flex items-start gap-2">
              <span style={{ fontSize: '9px', color: '#6f6f6f', minWidth: 52, paddingTop: 1 }}>{item.label}</span>
              <span style={{ fontSize: '10px', color: item.color, lineHeight: 1.4 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
