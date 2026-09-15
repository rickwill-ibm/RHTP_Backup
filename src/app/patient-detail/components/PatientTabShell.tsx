'use client';
import React, { useState } from 'react';
import ClinicalTab from './ClinicalTab';
import RiskQualityTab from './RiskQualityTab';
import FinancialTab from './FinancialTab';
import AttributionTab from './AttributionTab';
import ActionsTasksTab from './ActionsTasksTab';
import ContextualActionPanel from './ContextualActionPanel';
import FHIRCareTeamPanel from './FHIRCareTeamPanel';
import Icon from '@/components/ui/AppIcon';
import { useAppContext } from '@/lib/appContext';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { workflowDefinitions } from '@/lib/actionRegistry';
import type { PatientTab } from '@/lib/actionRegistry';
import WholePersonCarePlanTab from './WholePersonCarePlanTab';
import { usePatientContext } from '@/lib/patientContext';

// ─── AI Copilot Tab Content ───────────────────────────────────────────────────
function AICopilotTab() {
  const { patient } = usePatientContext();
  const [talkTrackOpen, setTalkTrackOpen] = useState(false);
  const openGaps = patient.careGaps.filter((g) => g.status !== 'Closed' && g.status !== 'Waived');
  const clinicalGaps = openGaps.filter((g) => g.domain === 'Clinical');
  const bhGaps = openGaps.filter((g) => g.domain === 'BH');
  const socialGaps = openGaps.filter((g) => g.domain === 'Social');

  // Build patient-specific suggestions from live data
  const suggestions = [
    ...(socialGaps.length > 0
      ? [
          {
            id: 'sug-1',
            priority: 1,
            icon: 'TruckIcon',
            color: '#007d79',
            bg: '#d9fbfb',
            title: `Address ${socialGaps.length} social barrier${socialGaps.length > 1 ? 's' : ''} — unblocks clinical care`,
            detail: `${socialGaps.map((g) => g.name).join(', ')}. Resolving social barriers unblocks ${clinicalGaps.length} clinical gap${clinicalGaps.length !== 1 ? 's' : ''}.`,
            action: 'Address Social Needs',
          },
        ]
      : []),
    ...(clinicalGaps.length > 0
      ? [
          {
            id: 'sug-2',
            priority: 2,
            icon: 'HeartIcon',
            color: '#da1e28',
            bg: '#fff1f1',
            title: `${clinicalGaps.length} open clinical gap${clinicalGaps.length !== 1 ? 's' : ''} — ${clinicalGaps[0]?.daysOpen ?? 0}d overdue`,
            detail: `Priority: ${clinicalGaps.map((g) => `${g.name} (${g.daysOpen}d)`).join(', ')}.`,
            action: 'Close Clinical Gap',
          },
        ]
      : []),
    ...(bhGaps.length > 0
      ? [
          {
            id: 'sug-3',
            priority: 3,
            icon: 'SparklesIcon',
            color: '#6929c4',
            bg: '#f6f2ff',
            title: `BH: ${bhGaps[0]?.name}`,
            detail: `${patient.bhScoreLabel || patient.bhRisk} — ${patient.bhReferralStatus || 'BH follow-up recommended'}.`,
            action: 'Follow Up BH',
          },
        ]
      : []),
    {
      id: 'sug-4',
      priority: bhGaps.length > 0 ? 4 : 3,
      icon: 'ClockIcon',
      color: '#b45309',
      bg: '#fdf6dd',
      title: 'Best outreach window: Tue–Wed morning',
      detail: `${patient.name} — ${openGaps.length} open gaps across ${[clinicalGaps.length > 0 && 'Clinical', bhGaps.length > 0 && 'BH', socialGaps.length > 0 && 'Social'].filter(Boolean).join(', ')}. Last contact: ${patient.lastContact || 'unknown'}.`,
      action: 'Schedule Outreach',
    },
  ];

  // AI summary from registry field, falling back to a generated summary
  const aiSummary =
    patient.aiCopilot ||
    `${patient.name} has ${openGaps.length} open gaps — ${clinicalGaps.length} Clinical, ${bhGaps.length} BH, ${socialGaps.length} Social. ` +
      `RAF ${patient.rafScore.toFixed(2)} · ${patient.riskLabel}. ` +
      (patient.transportStatus ? `Transport: ${patient.transportStatus}. ` : '') +
      (patient.bhScoreLabel ? `BH: ${patient.bhScoreLabel}.` : '');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-carbon-gray-20">
        <Icon name="SparklesIcon" size={16} className="text-[#8a3ffc]" />
        <h3 className="text-sm font-bold text-carbon-gray-100">
          AI Copilot — Whole Person Synthesis
        </h3>
        <span className="text-2xs px-2 py-0.5 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff] font-semibold ml-auto">
          NEW
        </span>
      </div>

      {/* Summary insight */}
      <div className="bg-[#001d3d] border border-[#003a75] p-4">
        <p className="text-sm text-[#c6e2ff] leading-relaxed">{aiSummary}</p>
        <button
          onClick={() => setTalkTrackOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#42be65] hover:text-[#6fdc8c] mt-3 transition-colors"
        >
          <Icon name={talkTrackOpen ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={12} />
          TALK TRACK ›
        </button>
        {talkTrackOpen && (
          <div className="mt-2 border-l-2 border-[#42be65] pl-3">
            <p className="text-sm text-[#a8c8e8] italic leading-relaxed">
              &quot;{patient.name} has {openGaps.length} open gaps across{' '}
              {[
                clinicalGaps.length > 0 && 'Clinical',
                bhGaps.length > 0 && 'BH',
                socialGaps.length > 0 && 'Social',
              ]
                .filter(Boolean)
                .join(', ')}{' '}
              domains. {aiSummary} The AI copilot reads all three columns together and surfaces the
              highest-priority action first.&quot;
            </p>
          </div>
        )}
      </div>

      {/* Prioritized action cards */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
          Prioritized Actions
        </h4>
        {suggestions.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 p-3 border border-carbon-gray-20 hover:bg-carbon-gray-10"
          >
            <div
              className="w-8 h-8 flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: s.bg }}
            >
              <Icon name={s.icon as any} size={16} style={{ color: s.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-2xs font-bold w-5 h-5 flex items-center justify-center border"
                  style={{ background: s.bg, color: s.color, borderColor: s.color }}
                >
                  {s.priority}
                </span>
                <span className="text-sm font-semibold text-carbon-gray-100">{s.title}</span>
              </div>
              <p className="text-xs text-carbon-gray-50 leading-relaxed">{s.detail}</p>
            </div>
            <button className="flex-shrink-0 px-3 py-1.5 text-xs font-medium border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 whitespace-nowrap">
              {s.action}
            </button>
          </div>
        ))}
      </div>

      {/* Gap summary by domain */}
      <div className="border border-carbon-gray-20 p-4">
        <h4 className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-3">
          Open Gaps by Domain
        </h4>
        <div className="grid grid-cols-3 gap-3">
          {(['Clinical', 'BH', 'Social'] as const).map((domain) => {
            const count = openGaps.filter((g) => g.domain === domain).length;
            const colors = {
              Clinical: { bg: '#d0e2ff', text: '#0043ce', border: '#97c1ff' },
              BH: { bg: '#f6f2ff', text: '#6929c4', border: '#d4bbff' },
              Social: { bg: '#d9fbfb', text: '#007d79', border: '#9ef0f0' },
            }[domain];
            return (
              <div
                key={domain}
                className="text-center p-3 border"
                style={{ background: colors.bg, borderColor: colors.border }}
              >
                <p className="text-2xl font-bold tabular-nums" style={{ color: colors.text }}>
                  {count}
                </p>
                <p className="text-xs font-medium mt-0.5" style={{ color: colors.text }}>
                  {domain}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const tabs: {
  key: PatientTab | 'careteam' | 'wholeperson' | 'ai-copilot';
  label: string;
  icon: string;
  badge: number;
}[] = [
  { key: 'wholeperson', label: 'Whole Person Care Plan', icon: 'SparklesIcon', badge: 0 },
  { key: 'ai-copilot', label: 'AI Copilot', icon: 'SparklesIcon', badge: 0 },
  { key: 'clinical', label: 'Clinical', icon: 'HeartIcon', badge: 0 },
  { key: 'risk', label: 'Risk & Quality', icon: 'ShieldExclamationIcon', badge: 3 },
  { key: 'careteam', label: 'Care Team', icon: 'UserGroupIcon', badge: 7 },
  { key: 'financial', label: 'Financial', icon: 'CurrencyDollarIcon', badge: 0 },
  { key: 'attribution', label: 'Attribution & Context', icon: 'DocumentTextIcon', badge: 0 },
  { key: 'actions', label: 'Actions & Tasks', icon: 'ClipboardDocumentListIcon', badge: 5 },
];

// Workflow status pill
function WorkflowStatusPill({
  workflowType,
  entityId,
}: {
  workflowType: string;
  entityId: string;
}) {
  const { getWorkflow, getWorkflowProgress } = useWorkflowMachine();
  const wf = getWorkflow(workflowType as any, entityId);
  if (!wf || wf.status === 'idle') return null;
  const { current, total } = getWorkflowProgress(workflowType as any, entityId);
  const def = workflowDefinitions[workflowType as keyof typeof workflowDefinitions];
  const statusColor =
    wf.status === 'completed'
      ? 'bg-[#defbe6] text-[#0e6027] border-[#24a148]'
      : wf.status === 'rejected'
        ? 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28]'
        : wf.status === 'awaiting-review'
          ? 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]'
          : 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]';

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 border text-2xs font-medium ${statusColor}`}
    >
      <span>{def?.label ?? workflowType}</span>
      {wf.status === 'in-progress' && (
        <span className="font-mono">
          Step {current}/{total}
        </span>
      )}
      {wf.status === 'completed' && <Icon name="CheckCircleIcon" size={12} />}
      {wf.status === 'rejected' && <Icon name="XCircleIcon" size={12} />}
      {wf.status === 'awaiting-review' && <Icon name="ClockIcon" size={12} />}
    </div>
  );
}

export default function PatientTabShell() {
  const [activeTab, setActiveTab] = useState<
    PatientTab | 'careteam' | 'wholeperson' | 'ai-copilot'
  >('wholeperson');
  const { entryContext } = useAppContext();
  const entityId = 'patient-001';

  const renderTab = () => {
    switch (activeTab) {
      case 'clinical':
        return <ClinicalTab />;
      case 'risk':
        return <RiskQualityTab />;
      case 'careteam':
        return <FHIRCareTeamPanel />;
      case 'wholeperson':
        return <WholePersonCarePlanTab />;
      case 'financial':
        return <FinancialTab />;
      case 'attribution':
        return <AttributionTab />;
      case 'actions':
        return <ActionsTasksTab />;
      case 'ai-copilot':
        return <AICopilotTab />;
      default:
        return <RiskQualityTab />;
    }
  };

  return (
    <div className="space-y-3">
      {/* Active workflow status bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['hcc-confirmation', 'care-gap-closure', 'utilization-escalation'] as const).map((wt) => (
          <WorkflowStatusPill key={wt} workflowType={wt} entityId={entityId} />
        ))}
        {entryContext === 'cerner-launch' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f6f2ff] border border-[#8a3ffc] text-2xs font-medium text-[#6929c4]">
            <Icon name="BoltIcon" size={11} />
            Cerner Launch — Clinical context active
          </div>
        )}
      </div>

      <div className="flex gap-4 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Tab nav */}
          <div className="bg-white border border-carbon-gray-20 border-b-0">
            <div className="flex items-stretch overflow-x-auto scrollbar-thin">
              {tabs.map((tab) => (
                <button
                  key={`tab-${tab.key}`}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-150 relative
                    ${
                      activeTab === tab.key
                        ? tab.key === 'ai-copilot'
                          ? 'border-b-[#8a3ffc] text-[#6929c4] bg-[#f6f2ff]'
                          : 'border-b-[#0f62fe] text-[#0f62fe] bg-[#edf5ff]'
                        : 'border-b-transparent text-carbon-gray-70 hover:text-carbon-gray-100 hover:bg-carbon-gray-10'
                    }`}
                >
                  <Icon
                    name={tab.icon as any}
                    size={15}
                    className={
                      tab.key === 'ai-copilot' && activeTab === tab.key ? 'text-[#8a3ffc]' : ''
                    }
                  />
                  {tab.label}
                  {tab.key === 'ai-copilot' && (
                    <span className="text-2xs px-1.5 py-0.5 bg-[#8a3ffc] text-white font-bold">
                      NEW
                    </span>
                  )}
                  {tab.badge > 0 && (
                    <span
                      className={`text-2xs font-bold px-1.5 py-0.5 min-w-[18px] text-center ${activeTab === tab.key ? 'bg-[#0f62fe] text-white' : 'bg-[#da1e28] text-white'}`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="bg-white border border-carbon-gray-20 border-t-0 p-5 animate-fade-in">
            {renderTab()}
          </div>
        </div>

        {/* Contextual action panel — driven by registry */}
        {activeTab !== 'careteam' && activeTab !== 'ai-copilot' && (
          <ContextualActionPanel activeTab={activeTab as PatientTab} />
        )}
      </div>
    </div>
  );
}
