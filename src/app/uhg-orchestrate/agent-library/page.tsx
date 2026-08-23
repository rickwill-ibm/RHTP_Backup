'use client';

import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import React, { useState } from 'react';
import { getPatientById, type RegistryPatient } from '@/lib/patientRegistry';
import { useDemoStore } from '@/uhg/store/demoStore';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';

interface AgentEntry {
  id: string;
  name: string;
  function: string;
  skills: string[];
  matchConditions: string;
  color: string;
  status: 'active' | 'standby' | 'continuous';
}

const TIERS: { id: string; label: string; sublabel: string; color: string; agents: AgentEntry[] }[] = [
  {
    id: 't1', label: 'TIER 1', sublabel: 'FOUNDATION', color: '#78a9ff',
    agents: [
      { id: 'graph-intel', name: 'Graph Intelligence', function: 'Receives signals, executes Cypher query, returns verified subgraph', skills: ['Neo4j Cypher', 'Context Assembly', 'Relationship Traversal'], matchConditions: 'Every scenario — runs first', color: '#78a9ff', status: 'active' },
      { id: 'identity', name: 'Identity Resolution', function: 'Confirms unified member/provider identity via CDP', skills: ['CDP Integration', 'Conflict Resolution', 'Golden Record'], matchConditions: 'Every scenario — runs first', color: '#0C55B8', status: 'active' },
      { id: 'consent', name: 'Consent & Preference', function: 'Validates consent state and channel preferences before any action', skills: ['Consent Store', 'Proxy Scope', 'Channel Preference'], matchConditions: 'Every scenario — runs first', color: '#42be65', status: 'active' },
      { id: 'person-state', name: 'Person State Intelligence', function: 'Derives real-time behavioral, emotional, and situational state from signals', skills: ['Engagement Signals', 'Behavioral Analysis', 'Receptivity Scoring'], matchConditions: 'Every scenario — gates communication timing', color: '#06b6d4', status: 'active' },
    ],
  },
  {
    id: 't2', label: 'TIER 2', sublabel: 'STRATEGIC', color: '#f1c21b',
    agents: [
      { id: 'journey', name: 'Journey Strategy', function: 'Determines journey position, sensitivity, milestones', skills: ['Journey Mapping', 'Milestone Detection', 'Sensitivity Scoring'], matchConditions: 'All scenarios — strategic context', color: '#42be65', status: 'continuous' },
      { id: 'population', name: 'Population Health', function: 'Population-level risk trending, cohort intelligence, SDOH signals', skills: ['Risk Stratification', 'Cohort Analysis', 'SDOH Signals'], matchConditions: 'All scenarios — population context', color: '#78a9ff', status: 'continuous' },
      { id: 'sdoh-intel', name: 'SDOH Intelligence', function: 'Derives social determinant profile from claims, geographic, behavioral, and enrollment signals. Outputs SDOH nodes + AMPLIFIES edges to Knowledge Graph. Modifies intervention type and outreach approach.', skills: ['SDOH Profiling', 'Barrier Detection', 'AMPLIFIES Edge Generation', 'Intervention Modification', '211 / ACS Data Integration'], matchConditions: 'CARE_GAP, missed appointment, Rx abandonment, or caregiver signal detected', color: '#c084fc', status: 'active' },
      { id: 'value-quality', name: 'Value & Quality', function: 'HEDIS, Star Ratings, quality measure optimization', skills: ['HEDIS Engine', 'Star Ratings', 'Quality Measures'], matchConditions: 'HEDIS window active or quality signal', color: '#f1c21b', status: 'active' },
      { id: 'network-opt', name: 'Network Optimization', function: 'Network adequacy, provider alignment, specialty coverage gaps', skills: ['Network Adequacy', 'Provider Alignment', 'Gap Analysis'], matchConditions: 'Network adequacy signal detected', color: '#8b5cf6', status: 'standby' },
    ],
  },
  {
    id: 't3', label: 'TIER 3', sublabel: 'OPERATIONAL', color: '#0C55B8',
    agents: [
      { id: 'care-mgmt', name: 'Care Management', function: 'Care gap closure, intervention protocols, readmission risk', skills: ['Care Gap Engine', 'Protocol Activation', 'Readmission Risk'], matchConditions: 'CARE_GAP or readmission signal', color: '#0C55B8', status: 'active' },
      { id: 'util-mgmt', name: 'Utilization Management', function: 'Prior auth processing, medical necessity review', skills: ['Auth Processing', 'Medical Necessity', 'CMS Guidelines'], matchConditions: 'AUTH_EXPIRY or contested auth', color: '#06b6d4', status: 'active' },
      { id: 'provider-enable', name: 'Provider Enablement', function: 'Credentialing, network alignment, provider outreach', skills: ['Credentialing', 'EHR Integration', 'Episode Continuity'], matchConditions: 'Credentialing gap or provider signal', color: '#8b5cf6', status: 'active' },
      { id: 'claims-intel', name: 'Claims Intelligence', function: 'Claims status, payment integrity, denial patterns', skills: ['Claims Processing', 'FWA Detection', 'Denial Analysis'], matchConditions: 'Active denial or claims signal', color: '#f59e0b', status: 'standby' },
      { id: 'member-engage', name: 'Member Engagement', function: 'Barrier-aware outreach — SDOH-informed channel orchestration, caregiver-sensitive messaging, appointment coordination. Modifies message tone, content, and channel based on financial strain, transportation barriers, and caregiver burden signals.', skills: ['Channel Orchestration', 'SDOH-Aware Messaging', 'Caregiver-Sensitive Outreach', 'Barrier-Informed Scheduling', 'Appointment Mgmt'], matchConditions: 'BEHAVIORAL signal or outreach needed — SDOH profile loaded first', color: '#42be65', status: 'active' },
      { id: 'appeals', name: 'Appeals & Grievances', function: 'Regulatory deadline tracking, appeal drafting, escalation routing', skills: ['CMS Compliance', 'Appeal Drafting', 'Deadline Tracking'], matchConditions: 'Appeal deadline or grievance signal', color: '#ef4444', status: 'active' },
      { id: 'financial-intel', name: 'Financial Intelligence', function: 'Pre-action cost estimation, member cost exposure, benefits engine', skills: ['Benefits Engine', 'Cost Estimation', 'OOP Calculation'], matchConditions: 'Cost exposure risk or auth signal', color: '#10b981', status: 'active' },
      { id: 'caregiver-intel', name: 'Caregiver Intelligence', function: 'Caregiver relationship management, proxy consent gating', skills: ['Proxy Consent', 'Medication Intelligence', 'Caregiver Coordination'], matchConditions: 'CAREGIVER relationship detected', color: '#c084fc', status: 'active' },
      { id: 'finops', name: 'FinOps Agent', function: 'Actual cost capture, TCOC impact tracking, cost avoidance calculation', skills: ['Cost Capture', 'TCOC Tracking', 'Variance Analysis'], matchConditions: 'Post-resolution cost capture', color: '#f59e0b', status: 'standby' },
    ],
  },
  {
    id: 't4', label: 'TIER 4', sublabel: 'GOVERNANCE', color: '#f1c21b',
    agents: [
      { id: 'policy', name: 'Policy Boundary', function: 'Monitors every action against policy constraints, intercepts violations', skills: ['Policy Engine', 'Pre-execution Intercept', 'Authority Thresholds'], matchConditions: 'Continuous — all scenarios', color: '#f1c21b', status: 'continuous' },
      { id: 'compliance', name: 'Compliance & Regulatory', function: 'CMS, HIPAA, state mandates, hard stops on non-compliant actions', skills: ['CMS Rules', 'HIPAA Engine', 'State Mandates'], matchConditions: 'Continuous — all scenarios', color: '#f59e0b', status: 'continuous' },
      { id: 'audit', name: 'Audit & Explainability', function: 'Complete timestamped audit trail, human-readable rationale', skills: ['Audit Ledger', 'Decision Logging', 'Export Engine'], matchConditions: 'Continuous — all scenarios', color: '#78a9ff', status: 'continuous' },
      { id: 'safety', name: 'Safety & Quality', function: 'Clinical safety checks, hard stops, human review routing', skills: ['Clinical Safety', 'Hard Stop Engine', 'Human Routing'], matchConditions: 'Continuous — all scenarios', color: '#42be65', status: 'continuous' },
      { id: 'consent-enforce', name: 'Consent Enforcement', function: 'Real-time consent state monitoring — revokes agent authority mid-orchestration', skills: ['Real-time Consent', 'Authority Revocation', 'Scope Monitoring'], matchConditions: 'Continuous — consent state changes', color: '#ef4444', status: 'continuous' },
      { id: 'data-gov', name: 'Data Governance', function: 'Data residency, minimum necessary use, PII masking before every payload', skills: ['PII Masking', 'Data Residency', 'Minimum Necessary'], matchConditions: 'Continuous — every payload dispatch', color: '#8b5cf6', status: 'continuous' },
      { id: 'bias-fairness', name: 'Bias & Fairness', function: 'Monitors agent decisions for demographic disparity, CMS health equity', skills: ['Disparity Detection', 'Health Equity', 'CMS Compliance'], matchConditions: 'Continuous — all agent decisions', color: '#c084fc', status: 'continuous' },
      { id: 'model-risk', name: 'Model Risk', function: 'LLM confidence thresholds, hallucination risk flagging, low-confidence escalation', skills: ['Confidence Scoring', 'Hallucination Detection', 'Human Escalation'], matchConditions: 'Continuous — all LLM outputs', color: '#06b6d4', status: 'continuous' },
      { id: 'financial-gov', name: 'Financial Governance', function: 'CFO-configured cost thresholds, intercepts cost-generating actions above authority', skills: ['Cost Thresholds', 'CFO Authority', 'Financial Intercept'], matchConditions: 'Cost-generating action above threshold', color: '#f1c21b', status: 'continuous' },
    ],
  },
  {
    id: 't5', label: 'TIER 5', sublabel: 'LEARNING', color: '#42be65',
    agents: [
      { id: 'context-enrich', name: 'Context Enrichment', function: 'Writes resolved outcomes back to Knowledge Graph, enriches nodes', skills: ['Graph Write-back', 'Node Enrichment', 'Outcome Capture'], matchConditions: 'Post-resolution — always', color: '#42be65', status: 'continuous' },
      { id: 'signal-calib', name: 'Signal Calibration', function: 'Refines event classification thresholds from orchestration outcomes', skills: ['Threshold Tuning', 'Classification Feedback', 'Model Update'], matchConditions: 'Post-resolution — always', color: '#78a9ff', status: 'continuous' },
      { id: 'perf-intel', name: 'Performance Intelligence', function: 'Tracks outcomes across all agent activity, feeds metrics layer', skills: ['Metrics Engine', 'Outcome Tracking', 'Dashboard Feed'], matchConditions: 'Continuous — always running', color: '#f1c21b', status: 'continuous' },
      { id: 'finops-capture', name: 'FinOps Capture', function: 'Post-resolution actual cost capture, TCOC enrichment, cost avoidance ledger', skills: ['Cost Capture', 'TCOC Enrichment', 'Avoidance Ledger'], matchConditions: 'Post-resolution — cost scenarios', color: '#f59e0b', status: 'continuous' },
      { id: 'report-agent', name: 'Report Agent', function: 'Individual signal reports + aggregate intelligence across all dimensions', skills: ['Signal Reports', 'Aggregate Analytics', 'PDF Export'], matchConditions: 'Post-resolution + on-demand', color: '#10b981', status: 'continuous' },
    ],
  },
];

// ─── Agent dispatch engine ──────────────────────────────────────────────────────
// Context-driven dispatch: each member's knowledge-graph context produces a set of active
// trigger codes; the domain coalition is the set of dispatchable agents whose trigger fires.
// Always-on (Tier 1) + governance (Tier 4) run for every scenario. Exported for the controller
// (renders the coalition) and the marketplace drawdown (counts + highlights dispatched agents).

// Coalition types and dispatch logic live in ./coalition (Next.js forbids
// non-framework exports from a page file). Import only what the page renders.
import { dispatchedLibIds } from './coalition';

const STATUS_CONFIG = {
  active: { label: 'ACTIVE', color: '#42be65', bg: 'rgba(66,190,101,0.12)' },
  standby: { label: 'STANDBY', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  continuous: { label: 'CONTINUOUS', color: '#78a9ff', bg: 'rgba(120,169,255,0.12)' },
};

// ── Register Agent Modal ──────────────────────────────────────────────────────
interface RegisterAgentForm {
  name: string;
  tier: string;
  function: string;
  skills: string;
  matchConditions: string;
  modelType: string;
  domain: string;
}

function RegisterAgentModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<RegisterAgentForm>({
    name: '',
    tier: 'TIER 3 — OPERATIONAL',
    function: '',
    skills: '',
    matchConditions: '',
    modelType: 'LLM — GPT-4o',
    domain: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field: keyof RegisterAgentForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
    >
      <div
        className="relative rounded-lg w-full max-w-xl mx-4 overflow-hidden"
        style={{ background: '#0a0f1e', border: '1px solid rgba(120,169,255,0.35)', boxShadow: '0 0 60px rgba(12,85,184,0.4)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(120,169,255,0.2)', background: 'rgba(12,85,184,0.12)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="rounded-full flex items-center justify-center"
              style={{ width: 28, height: 28, background: 'rgba(12,85,184,0.25)', border: '1px solid rgba(120,169,255,0.4)' }}
            >
              <span style={{ fontSize: 14, color: '#78a9ff' }}>+</span>
            </div>
            <div>
              <div className="font-mono font-bold" style={{ fontSize: '11px', color: '#78a9ff', letterSpacing: '0.12em' }}>REGISTER NEW AGENT</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>Agent Marketplace & Capability Registry</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded flex items-center justify-center transition-colors"
            style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 16 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div
                className="rounded-full flex items-center justify-center"
                style={{ width: 56, height: 56, background: 'rgba(66,190,101,0.15)', border: '2px solid #42be65', boxShadow: '0 0 24px rgba(66,190,101,0.3)' }}
              >
                <span style={{ fontSize: 24, color: '#42be65' }}>✓</span>
              </div>
              <div className="text-center">
                <div className="font-mono font-bold" style={{ fontSize: '13px', color: '#42be65', letterSpacing: '0.1em', marginBottom: 6 }}>
                  AGENT REGISTERED
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', maxWidth: 320, lineHeight: 1.6 }}>
                  <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{form.name || 'New Agent'}</span> has been registered in the Agent Marketplace. The Super Orchestration Controller will discover it dynamically on the next relevant signal context match.
                </div>
              </div>
              <div
                className="rounded px-4 py-2 w-full text-center"
                style={{ background: 'rgba(12,85,184,0.1)', border: '1px solid rgba(120,169,255,0.25)', fontSize: '10px', color: '#78a9ff', fontFamily: 'monospace', letterSpacing: '0.06em' }}
              >
                REGISTRY ID: AGT_{(Math.random() * 900000 + 100000).toFixed(0)} · STATUS: STANDBY · DISCOVERY: DYNAMIC
              </div>
              <button
                onClick={onClose}
                className="rounded px-6 py-2 font-mono font-semibold transition-colors"
                style={{ background: 'rgba(12,85,184,0.2)', border: '1px solid rgba(120,169,255,0.4)', fontSize: '11px', color: '#78a9ff', letterSpacing: '0.08em' }}
              >
                CLOSE
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Agent Name */}
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.1em' }}>AGENT NAME *</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => handleChange('name', e.target.value)}
                    placeholder="e.g. Network Optimization Agent"
                    className="rounded px-3 py-2 outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(120,169,255,0.25)', color: '#e5e7eb', fontSize: '12px' }}
                  />
                </div>

                {/* Tier */}
                <div className="flex flex-col gap-1">
                  <label className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.1em' }}>TIER</label>
                  <select
                    value={form.tier}
                    onChange={e => handleChange('tier', e.target.value)}
                    className="rounded px-3 py-2 outline-none"
                    style={{ background: '#0d1526', border: '1px solid rgba(120,169,255,0.25)', color: '#e5e7eb', fontSize: '11px' }}
                  >
                    <option>TIER 1 — FOUNDATION</option>
                    <option>TIER 2 — STRATEGIC</option>
                    <option>TIER 3 — OPERATIONAL</option>
                    <option>TIER 4 — GOVERNANCE</option>
                    <option>TIER 5 — LEARNING</option>
                  </select>
                </div>

                {/* Model Type */}
                <div className="flex flex-col gap-1">
                  <label className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.1em' }}>MODEL TYPE</label>
                  <select
                    value={form.modelType}
                    onChange={e => handleChange('modelType', e.target.value)}
                    className="rounded px-3 py-2 outline-none"
                    style={{ background: '#0d1526', border: '1px solid rgba(120,169,255,0.25)', color: '#e5e7eb', fontSize: '11px' }}
                  >
                    <option>LLM — GPT-4o</option>
                    <option>LLM — Claude 3.5</option>
                    <option>LLM — Gemini 1.5</option>
                    <option>Rule-Based Engine</option>
                    <option>ML Classifier</option>
                    <option>Hybrid LLM + Rules</option>
                  </select>
                </div>

                {/* Domain */}
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.1em' }}>DOMAIN</label>
                  <input
                    value={form.domain}
                    onChange={e => handleChange('domain', e.target.value)}
                    placeholder="e.g. Network Adequacy, Claims Integrity, Member Engagement"
                    className="rounded px-3 py-2 outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(120,169,255,0.25)', color: '#e5e7eb', fontSize: '12px' }}
                  />
                </div>

                {/* Function */}
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.1em' }}>AGENT FUNCTION *</label>
                  <textarea
                    required
                    rows={2}
                    value={form.function}
                    onChange={e => handleChange('function', e.target.value)}
                    placeholder="Describe what this agent does and what decisions it owns"
                    className="rounded px-3 py-2 outline-none resize-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(120,169,255,0.25)', color: '#e5e7eb', fontSize: '12px', lineHeight: 1.5 }}
                  />
                </div>

                {/* Skills */}
                <div className="flex flex-col gap-1">
                  <label className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.1em' }}>SKILLS / TOOLS</label>
                  <input
                    value={form.skills}
                    onChange={e => handleChange('skills', e.target.value)}
                    placeholder="e.g. Network API, Adequacy Scoring"
                    className="rounded px-3 py-2 outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(120,169,255,0.25)', color: '#e5e7eb', fontSize: '12px' }}
                  />
                </div>

                {/* Match Conditions */}
                <div className="flex flex-col gap-1">
                  <label className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.1em' }}>MATCH CONDITIONS</label>
                  <input
                    value={form.matchConditions}
                    onChange={e => handleChange('matchConditions', e.target.value)}
                    placeholder="e.g. Network adequacy signal detected"
                    className="rounded px-3 py-2 outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(120,169,255,0.25)', color: '#e5e7eb', fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* Info note */}
              <div
                className="rounded px-3 py-2"
                style={{ background: 'rgba(12,85,184,0.08)', border: '1px solid rgba(120,169,255,0.15)' }}
              >
                <div style={{ fontSize: '10px', color: '#6b7280', lineHeight: 1.5 }}>
                  Once registered, the Super Orchestration Controller will discover this agent dynamically via the Agent Marketplace query — no hardcoded wiring required.
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded px-4 py-2 font-mono"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', fontSize: '10px', color: '#9ca3af', letterSpacing: '0.08em' }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="rounded px-5 py-2 font-mono font-semibold"
                  style={{ background: 'rgba(12,85,184,0.25)', border: '1px solid rgba(120,169,255,0.5)', fontSize: '10px', color: '#78a9ff', letterSpacing: '0.08em', boxShadow: '0 0 16px rgba(12,85,184,0.3)' }}
                >
                  REGISTER AGENT →
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AgentLibraryPage() {
  // Screen navigation (Up/Down arrows) is handled centrally by PresenterControls.
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const reg = getPatientById(activeCitizenId) || getPatientById(DEMO_MEMBER_ID)!;
  const dispatched = dispatchedLibIds(reg);
  const totalAgents = TIERS.reduce((n, t) => n + t.agents.length, 0);
  const govCount = TIERS.find((t) => t.id === 't4')?.agents.length ?? 0;
  const [selectedAgent, setSelectedAgent] = useState<AgentEntry | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [expandedTier, setExpandedTier] = useState<string | null>('t3');

  return (
    <ScreenLayout
      screenId="agent-library"
    >
      <div className="flex flex-col h-full overflow-hidden" style={{ padding: '20px 24px', gap: 16 }}>

        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="rounded px-3 py-1.5 flex items-center gap-2"
              style={{ background: 'rgba(12,85,184,0.12)', border: '1px solid rgba(12,85,184,0.4)' }}
            >
              <div className="rounded-full" style={{ width: 7, height: 7, background: '#78a9ff' }} />
              <span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#78a9ff', letterSpacing: '0.12em' }}>
                AGENT MARKETPLACE & CAPABILITY REGISTRY
              </span>
            </div>
            <span className="text-white font-semibold" style={{ fontSize: '20px' }}>
              {totalAgents} Agents — {TIERS.length} Tiers
            </span>
          </div>
          <div className="flex items-center gap-3">
            {[
              { label: 'Total Registered', value: String(totalAgents), color: '#f4f4f4' },
              { label: 'Active This Scenario', value: String(dispatched.size), color: '#42be65' },
              { label: 'Governance Overlay', value: String(govCount), color: '#f1c21b' },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-end">
                <span className="font-mono font-bold" style={{ fontSize: '16px', color: stat.color }}>{stat.value}</span>
                <span style={{ fontSize: '9px', color: '#4b5563', letterSpacing: '0.06em' }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex gap-4 overflow-hidden">

          {/* Left — Tier list */}
          <div className="flex flex-col gap-2 overflow-y-auto" style={{ width: 680, flexShrink: 0 }}>
            {TIERS.map((tier) => {
              const isExpanded = expandedTier === tier.id;
              return (
                <div
                  key={tier.id}
                  className="rounded flex flex-col overflow-hidden"
                  style={{ border: `1px solid ${isExpanded ? tier.color + '40' : 'rgba(57,57,57,0.5)'}`, transition: 'border-color 0.3s' }}
                >
                  {/* Tier header */}
                  <button
                    onClick={() => setExpandedTier(isExpanded ? null : tier.id)}
                    className="flex items-center justify-between px-4 py-3 w-full text-left transition-colors"
                    style={{ background: isExpanded ? `${tier.color}08` : 'rgba(28,28,28,0.6)', cursor: 'pointer' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="rounded px-2 py-0.5"
                        style={{ background: `${tier.color}18`, border: `1px solid ${tier.color}40` }}
                      >
                        <span className="font-mono font-semibold" style={{ fontSize: '10px', color: tier.color, letterSpacing: '0.1em' }}>
                          {tier.label} — {tier.sublabel}
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#8d8d8d' }}>{tier.agents.length} agents</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#4b5563' }}>{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {/* Agent grid */}
                  {isExpanded && (
                    <div className="p-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', background: 'rgba(20,20,20,0.4)' }}>
                      {tier.agents.map((agent) => {
                        const statusCfg = STATUS_CONFIG[agent.status];
                        const isSelected = selectedAgent?.id === agent.id;
                        const isDispatched = dispatched.has(agent.id);
                        return (
                          <button
                            key={agent.id}
                            onClick={() => setSelectedAgent(isSelected ? null : agent)}
                            className="rounded flex flex-col gap-1.5 text-left transition-all duration-200"
                            style={{
                              background: isSelected ? `${agent.color}12` : isDispatched ? `${agent.color}0c` : 'rgba(28,28,28,0.7)',
                              border: `1px solid ${isSelected ? agent.color + '50' : isDispatched ? agent.color + '70' : 'rgba(57,57,57,0.5)'}`,
                              boxShadow: isDispatched ? `0 0 10px ${agent.color}40` : 'none',
                              padding: '10px 12px',
                              cursor: 'pointer',
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="rounded-full"
                                  style={{ width: 6, height: 6, background: agent.color, boxShadow: `0 0 4px ${agent.color}60` }}
                                />
                              </div>
                              {isDispatched ? (
                                <div className="rounded px-1.5 py-0.5" style={{ background: `${agent.color}22`, border: `1px solid ${agent.color}55` }}>
                                  <span className="font-mono font-bold" style={{ fontSize: '8px', color: agent.color, letterSpacing: '0.06em' }}>DISPATCHED</span>
                                </div>
                              ) : (
                                <div className="rounded px-1.5 py-0.5" style={{ background: statusCfg.bg }}>
                                  <span className="font-mono" style={{ fontSize: '8px', color: statusCfg.color, letterSpacing: '0.06em' }}>{statusCfg.label}</span>
                                </div>
                              )}
                            </div>
                            <span className="font-semibold" style={{ fontSize: '11px', color: '#f4f4f4', lineHeight: 1.2 }}>{agent.name}</span>
                            <span style={{ fontSize: '9px', color: '#6f6f6f', lineHeight: 1.4 }}>{agent.function.substring(0, 60)}...</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Register new agent CTA */}
            <div
              className="rounded px-4 py-3 flex items-center justify-between cursor-pointer"
              style={{ background: 'rgba(12,85,184,0.06)', border: '1px dashed rgba(12,85,184,0.3)' }}
              onClick={() => setShowRegisterModal(true)}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '16px', color: '#4b5563' }}>+</span>
                <div>
                  <div className="font-semibold" style={{ fontSize: '12px', color: '#6b7280' }}>REGISTER NEW AGENT</div>
                  <div style={{ fontSize: '10px', color: '#4b5563' }}>Extensibility proof — any domain specialist can be registered and discovered dynamically</div>
                </div>
              </div>
              <div
                className="rounded px-3 py-1.5"
                style={{ background: 'rgba(12,85,184,0.1)', border: '1px solid rgba(12,85,184,0.3)' }}
              >
                <span className="font-mono" style={{ fontSize: '10px', color: '#78a9ff', letterSpacing: '0.08em' }}>REGISTER →</span>
              </div>
            </div>
          </div>

          {/* Right — Agent detail panel */}
          <div className="flex-1 overflow-hidden">
            {selectedAgent ? (
              <div
                className="rounded flex flex-col gap-4 h-full overflow-y-auto"
                style={{ background: `${selectedAgent.color}06`, border: `1px solid ${selectedAgent.color}35`, padding: '20px 24px' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-full"
                    style={{ width: 10, height: 10, background: selectedAgent.color, boxShadow: `0 0 10px ${selectedAgent.color}` }}
                  />
                  <div>
                    <div className="font-mono" style={{ fontSize: '9px', color: selectedAgent.color, letterSpacing: '0.12em', marginBottom: 2 }}>
                      AGENT DETAIL
                    </div>
                    <div className="text-white font-semibold" style={{ fontSize: '18px' }}>{selectedAgent.name}</div>
                  </div>
                </div>

                <div
                  className="rounded px-4 py-3"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="font-mono mb-2" style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.1em' }}>FUNCTION</div>
                  <p style={{ fontSize: '13px', color: '#c6c6c6', lineHeight: 1.6 }}>{selectedAgent.function}</p>
                </div>

                <div>
                  <div className="font-mono mb-2" style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.1em' }}>REGISTERED SKILLS</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedAgent.skills.map((skill) => (
                      <div
                        key={skill}
                        className="rounded px-2.5 py-1"
                        style={{ background: `${selectedAgent.color}12`, border: `1px solid ${selectedAgent.color}30` }}
                      >
                        <span style={{ fontSize: '11px', color: selectedAgent.color }}>{skill}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded px-4 py-3"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="font-mono mb-2" style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.1em' }}>MATCH CONDITIONS</div>
                  <p style={{ fontSize: '12px', color: '#a8a8a8', lineHeight: 1.5 }}>{selectedAgent.matchConditions}</p>
                </div>

                <div
                  className="rounded px-3 py-2 flex items-center gap-2"
                  style={{ background: `${STATUS_CONFIG[selectedAgent.status].bg}`, border: `1px solid ${STATUS_CONFIG[selectedAgent.status].color}30` }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: STATUS_CONFIG[selectedAgent.status].color }}
                  />
                  <span className="font-mono" style={{ fontSize: '10px', color: STATUS_CONFIG[selectedAgent.status].color, letterSpacing: '0.08em' }}>
                    STATUS: {STATUS_CONFIG[selectedAgent.status].label}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="rounded flex flex-col items-center justify-center h-full gap-3"
                style={{ background: 'rgba(20,20,20,0.4)', border: '1px solid rgba(57,57,57,0.4)' }}
              >
                <div className="rounded-full" style={{ width: 40, height: 40, background: 'rgba(57,57,57,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '18px', color: '#4b5563' }}>⬡</span>
                </div>
                <span style={{ fontSize: '13px', color: '#4b5563' }}>Select an agent to view details</span>
                <span style={{ fontSize: '11px', color: '#393939' }}>Click any agent card in the registry</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <PresenterControls currentScreenId="agent-library" />
      {showRegisterModal && <RegisterAgentModal onClose={() => setShowRegisterModal(false)} />}
    </ScreenLayout>
  );
}
