'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  PATIENT_CARE_TEAM,
  FHIR_TASKS,
  PROGRAM_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
} from '@/lib/fhirCareTeamData';
import type { CareTeamRoleCategory, FHIRCareTeamParticipant } from '@/lib/fhirCareTeamData';

const ROLE_CATEGORY_CONFIG: Record<
  CareTeamRoleCategory,
  { color: string; bg: string; border: string; icon: string }
> = {
  Clinical: {
    color: 'text-[#0043ce]',
    bg: 'bg-[#d0e2ff]',
    border: 'border-[#97c1ff]',
    icon: 'HeartIcon',
  },
  'Care Management': {
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
    border: 'border-[#ffb3b8]',
    icon: 'ClipboardDocumentListIcon',
  },
  'Behavioral Health': {
    color: 'text-[#6929c4]',
    bg: 'bg-[#f6f2ff]',
    border: 'border-[#d4bbff]',
    icon: 'UserCircleIcon',
  },
  'Community & Social': {
    color: 'text-[#0e6027]',
    bg: 'bg-[#defbe6]',
    border: 'border-[#a7f0ba]',
    icon: 'UserGroupIcon',
  },
};

const CATEGORY_ORDER: CareTeamRoleCategory[] = [
  'Clinical',
  'Care Management',
  'Behavioral Health',
  'Community & Social',
];

function ParticipantCard({ participant }: { participant: FHIRCareTeamParticipant }) {
  const cfg = ROLE_CATEGORY_CONFIG[participant.roleCategory];
  const participantTasks = FHIR_TASKS.filter(
    (t) =>
      t.owner.reference.includes(participant.id.replace('ct-p-', '')) ||
      t.owner.display === participant.name
  );
  const activeTasks = participantTasks.filter(
    (t) => t.status !== 'completed' && t.status !== 'cancelled'
  );

  return (
    <div className="bg-white border border-carbon-gray-20 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`w-9 h-9 flex items-center justify-center flex-shrink-0 ${cfg.bg} border ${cfg.border}`}
        >
          <Icon name={cfg.icon as any} size={16} className={cfg.color} />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-carbon-gray-100 leading-tight">
                {participant.name}
              </p>
              <p className={`text-xs font-medium mt-0.5 ${cfg.color}`}>{participant.roleDisplay}</p>
            </div>
            {participant.activeTaskCount > 0 && (
              <span className="flex-shrink-0 text-2xs font-bold px-1.5 py-0.5 bg-[#0043ce] text-white min-w-[20px] text-center">
                {participant.activeTaskCount}
              </span>
            )}
          </div>
          <p className="text-xs text-carbon-gray-50 mt-1 truncate">{participant.organization}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-2xs font-mono text-carbon-gray-30 bg-carbon-gray-10 px-1.5 py-0.5 border border-carbon-gray-20">
              SNOMED: {participant.roleCode}
            </span>
            <span className="text-2xs text-carbon-gray-50">{participant.participantType}</span>
          </div>
          {activeTasks.length > 0 && (
            <div className="mt-2 space-y-1">
              {activeTasks.slice(0, 2).map((t) => {
                const progCfg = PROGRAM_TYPE_CONFIG[t.programType];
                const statusCfg = TASK_STATUS_CONFIG[t.status];
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 px-2 py-1 ${progCfg.bg} border ${progCfg.border}`}
                  >
                    <span className={`text-2xs font-semibold ${progCfg.color}`}>
                      {t.programType}
                    </span>
                    <span className="text-2xs text-carbon-gray-70 truncate flex-1">
                      {t.description.substring(0, 45)}…
                    </span>
                    <span
                      className={`text-2xs font-medium px-1.5 py-0.5 ${statusCfg.bg} ${statusCfg.color}`}
                    >
                      {statusCfg.label}
                    </span>
                  </div>
                );
              })}
              {activeTasks.length > 2 && (
                <p className="text-2xs text-carbon-gray-50">+{activeTasks.length - 2} more tasks</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FHIRCareTeamPanel() {
  const [activeCategory, setActiveCategory] = useState<CareTeamRoleCategory | 'All'>('All');
  const [showFhirResource, setShowFhirResource] = useState(false);

  const participants = PATIENT_CARE_TEAM.participants;
  const filtered =
    activeCategory === 'All'
      ? participants
      : participants.filter((p) => p.roleCategory === activeCategory);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: filtered.filter((p) => p.roleCategory === cat),
  })).filter((g) => g.items.length > 0);

  const totalActive = participants.filter((p) => p.status === 'active').length;
  const totalTasks = FHIR_TASKS.filter(
    (t) => t.status !== 'completed' && t.status !== 'cancelled'
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#0043ce] flex items-center justify-center">
              <Icon name="UserGroupIcon" size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-carbon-gray-100">
                FHIR CareTeam — {PATIENT_CARE_TEAM.name}
              </h3>
              <p className="text-xs text-carbon-gray-50 font-mono">
                CareTeam/{PATIENT_CARE_TEAM.id} · R4 · {PATIENT_CARE_TEAM.managingOrganization}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-carbon-gray-50">{totalActive} Active Members</span>
              <span className="font-semibold text-[#0043ce]">{totalTasks} Open Tasks</span>
            </div>
            <button
              onClick={() => setShowFhirResource(!showFhirResource)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-carbon-gray-20 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
            >
              <Icon name="CodeBracketIcon" size={12} />
              FHIR Resource
            </button>
          </div>
        </div>

        {/* FHIR Resource Preview */}
        {showFhirResource && (
          <div className="mt-4 bg-carbon-gray-100 text-[#42be65] font-mono text-xs p-4 overflow-x-auto border border-carbon-gray-80">
            <pre>
              {JSON.stringify(
                {
                  resourceType: 'CareTeam',
                  id: PATIENT_CARE_TEAM.id,
                  status: PATIENT_CARE_TEAM.status,
                  subject: PATIENT_CARE_TEAM.subject,
                  managingOrganization: [{ display: PATIENT_CARE_TEAM.managingOrganization }],
                  participant: PATIENT_CARE_TEAM.participants.slice(0, 3).map((p) => ({
                    role: [
                      {
                        coding: [
                          {
                            system: 'http://snomed.info/sct',
                            code: p.roleCode,
                            display: p.roleDisplay,
                          },
                        ],
                      },
                    ],
                    member: { reference: `${p.participantType}/${p.id}`, display: p.name },
                    onBehalfOf: { display: p.onBehalfOf },
                    period: p.period,
                  })),
                  '...': `${PATIENT_CARE_TEAM.participants.length - 3} more participants`,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-0.5 bg-carbon-gray-10 p-0.5 border border-carbon-gray-20">
        {(['All', ...CATEGORY_ORDER] as const).map((cat) => {
          const count =
            cat === 'All'
              ? participants.length
              : participants.filter((p) => p.roleCategory === cat).length;
          const cfg = cat !== 'All' ? ROLE_CATEGORY_CONFIG[cat] : null;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-[#0043ce] text-white'
                  : 'text-carbon-gray-70 hover:bg-white hover:text-carbon-gray-100'
              }`}
            >
              {cfg && <Icon name={cfg.icon as any} size={12} />}
              <span className="hidden sm:inline">{cat}</span>
              <span className="text-2xs opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Participants by category */}
      {grouped.map(({ category, items }) => {
        const cfg = ROLE_CATEGORY_CONFIG[category];
        return (
          <div key={category}>
            <div
              className={`flex items-center gap-2 px-4 py-2 ${cfg.bg} border ${cfg.border} mb-2`}
            >
              <Icon name={cfg.icon as any} size={14} className={cfg.color} />
              <span className={`text-xs font-semibold ${cfg.color}`}>{category}</span>
              <span className={`text-2xs ${cfg.color} opacity-75`}>
                — {items.length} member{items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((p) => (
                <ParticipantCard key={p.id} participant={p} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Task summary strip */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-4">
        <h4 className="text-xs font-semibold text-carbon-gray-100 mb-3 flex items-center gap-2">
          <Icon name="ClipboardDocumentListIcon" size={14} className="text-[#0043ce]" />
          Active Tasks by Program
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(PROGRAM_TYPE_CONFIG).map(([prog, cfg]) => {
            const count = FHIR_TASKS.filter(
              (t) => t.programType === prog && t.status !== 'completed' && t.status !== 'cancelled'
            ).length;
            return (
              <div
                key={prog}
                className={`flex items-center justify-between px-3 py-2 ${cfg.bg} border ${cfg.border}`}
              >
                <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                <span className={`text-sm font-bold font-mono ${cfg.color}`}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
