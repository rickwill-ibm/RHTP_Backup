'use client';
// ─── orchestration/MemberMobilePanel.tsx ─────────────────────────────────────
// RHTP Member Mobile App panel: channel override + member acknowledgement simulation.

import React, { useState, useEffect } from 'react';
import type { HITLStep } from './types';

const MOBILE_SIM_STEPS: HITLStep[] = [
  { time: '09:47am', label: 'Maria opens RHTP mobile app', detail: 'Authenticated session · Day 34 · within preferred 9–11am window', color: '#10b981', icon: '📱' },
  { time: '09:47am', label: 'Chat query received', detail: '"What\'s going on with my heart medication? I got a message saying something changed."', color: '#78a9ff', icon: '💬' },
  { time: '09:47am', label: 'Longitudinal context projected', detail: 'Query mapped against full record — clinical, relationship, auth, financial, channel context assembled', color: '#f59e0b', icon: '🔍' },
  { time: '09:47am', label: 'Widget payload assembled', detail: '5 widgets in priority order · 2 signals suppressed · CHANNEL_OVERRIDE: PATIENT_SAFETY_THRESHOLD applied', color: '#8b5cf6', icon: '⚙️' },
  { time: '09:48am', label: 'Maria taps GOT IT on safety alert', detail: 'Member acknowledged duplicate therapy resolution — CHANNEL_HISTORY node updated', color: '#42be65', icon: '✓' },
];

const MOBILE_WIDGETS = [
  { priority: 1, icon: '⚠', title: 'Your medication was updated', badge: 'IMPORTANT', badgeColor: '#ef4444', body: 'Metformin has been discontinued. Continue taking Lisinopril 5mg as prescribed.', actions: ['GOT IT'], actionColor: '#ef4444', borderColor: 'rgba(239,68,68,0.5)', bg: 'rgba(239,68,68,0.06)' },
  { priority: 2, icon: '📅', title: 'A1C check scheduled', badge: 'ACTION', badgeColor: '#f59e0b', body: 'Home kit — no travel needed. 7 days from today.', actions: ['CONFIRM', 'RESCHEDULE'], actionColor: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.05)' },
  { priority: 3, icon: '✓', title: 'Updates from Bennett County Health', badge: 'INFO', badgeColor: '#78a9ff', body: 'Postpartum rehab approved. Home lab kit on its way.', actions: ['VIEW'], actionColor: '#78a9ff', borderColor: 'rgba(120,169,255,0.35)', bg: 'rgba(120,169,255,0.05)' },
  { priority: 4, icon: '💊', title: 'Medication review available', badge: 'OPTIONAL', badgeColor: '#8b5cf6', body: 'Martin Pharmacy · 15 min · no cost to you.', actions: ['ENROLL', 'REMIND ME LATER'], actionColor: '#8b5cf6', borderColor: 'rgba(139,92,246,0.3)', bg: 'rgba(139,92,246,0.04)' },
  { priority: 5, icon: '💰', title: 'Your cost summary', badge: 'INFO', badgeColor: '#10b981', body: 'Covered pathway: $340–$480. Savings vs out-of-network: $2,400.', actions: ['VIEW BREAKDOWN'], actionColor: '#10b981', borderColor: 'rgba(16,185,129,0.3)', bg: 'rgba(16,185,129,0.04)' },
];

export function MemberMobilePanel({ onClose }: { onClose: () => void }) {
  const [simulating, setSimulating] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showMobileUI, setShowMobileUI] = useState(false);
  const [showGraphOverlay, setShowGraphOverlay] = useState(false);
  const [graphPhase, setGraphPhase] = useState(0);
  const [followOnVisible, setFollowOnVisible] = useState(false);
  const [widgetAcknowledged, setWidgetAcknowledged] = useState(false);
  const [mobileAcknowledgedBanner, setMobileAcknowledgedBanner] = useState(false);

  const triggerGraphOverlay = () => {
    setShowMobileUI(false);
    setAcknowledged(true);
    setShowGraphOverlay(true);
    setGraphPhase(1);
    setTimeout(() => setGraphPhase(2), 600);
    setTimeout(() => setGraphPhase(3), 1200);
    setTimeout(() => setGraphPhase(4), 1800);
  };

  const startSimulation = () => {
    setSimulating(true);
    setCurrentStep(0);
    MOBILE_SIM_STEPS.forEach((_, i) => {
      setTimeout(() => {
        setCurrentStep(i);
        if (i === MOBILE_SIM_STEPS.length - 1) {
          setTimeout(() => {
            setAcknowledged(true);
            setTimeout(() => {
              setShowGraphOverlay(true);
              setGraphPhase(1);
              setTimeout(() => setGraphPhase(2), 600);
              setTimeout(() => setGraphPhase(3), 1200);
              setTimeout(() => setGraphPhase(4), 1800);
            }, 800);
          }, 600);
        }
      }, i * 1100);
    });
  };

  useEffect(() => {
    if (!showGraphOverlay) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { setShowGraphOverlay(false); setGraphPhase(0); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showGraphOverlay]);

  if (showMobileUI) {
    return (
      <div className="flex flex-col h-full" style={{ width: '100%', background: '#0a1628', borderLeft: 'none' }}>
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(16,185,129,0.25)', background: '#071020' }}>
          <div className="flex items-center gap-3">
            <div className="rounded px-2 py-1 flex items-center gap-2" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.5)' }}>
              <div className="rounded-full" style={{ width: 7, height: 7, background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#10b981', letterSpacing: '0.1em' }}>RHTP CARE MANAGEMENT — MARIA REDHAWK</span>
            </div>
            <span style={{ fontSize: '11px', color: '#6f6f6f' }}>Authenticated · Day 34</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowMobileUI(false)} className="rounded px-2 py-1 transition-colors" style={{ background: 'rgba(57,57,57,0.4)', border: '1px solid rgba(57,57,57,0.6)', color: '#8d8d8d', fontSize: '11px', cursor: 'pointer' }}>← Back</button>
            <button onClick={onClose} className="rounded flex items-center justify-center" style={{ width: 24, height: 24, background: 'rgba(57,57,57,0.5)', color: '#8d8d8d', fontSize: 14, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        <div className="flex-shrink-0 mx-4 mt-3 rounded p-2.5 flex flex-col gap-1" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.4)' }}>
          <div className="flex items-center gap-2"><span style={{ fontSize: '10px', color: '#f59e0b' }}>⚡</span><span className="font-mono font-semibold" style={{ fontSize: '9px', color: '#f59e0b', letterSpacing: '0.08em' }}>CHANNEL_OVERRIDE: PATIENT_SAFETY_THRESHOLD</span></div>
          <span style={{ fontSize: '9px', color: '#6f6f6f', lineHeight: 1.4 }}>{"Standard portal routing superseded — safety alert cannot wait for next portal login. Mobile push within Maria's digital channel family. Preference honored, clinical urgency not compromised."}</span>
        </div>
        {mobileAcknowledgedBanner && (
          <div className="flex-shrink-0 mx-4 mt-3 rounded-xl p-3 flex flex-col gap-2" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.6)', boxShadow: '0 0 16px rgba(16,185,129,0.15)' }}>
            <div className="flex items-center gap-2">
              <div className="rounded-full flex items-center justify-center" style={{ width: 20, height: 20, background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.7)', flexShrink: 0 }}><span style={{ fontSize: '11px', color: '#10b981' }}>✓</span></div>
              <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#10b981', letterSpacing: '0.08em' }}>MEMBER ACKNOWLEDGED — T+1m</span>
            </div>
            <div className="flex flex-col gap-1 pl-1">
              {['Safety alert confirmed — duplicate therapy resolution logged', 'CHANNEL_HISTORY node updated — Mobile engagement Day 34', 'METFORMIN: MEMBER_ACKNOWLEDGED write-back complete'].map((line) => (
                <div key={line} className="flex items-start gap-1.5"><span style={{ fontSize: '9px', color: '#42be65', flexShrink: 0, marginTop: 1 }}>●</span><span style={{ fontSize: '9px', color: '#d1d5db', lineHeight: 1.4 }}>{line}</span></div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-0.5"><div className="rounded-full" style={{ width: 5, height: 5, background: '#10b981', boxShadow: '0 0 4px #10b981' }} /><span className="font-mono" style={{ fontSize: '8px', color: '#10b981', letterSpacing: '0.06em' }}>Knowledge graph updating — view overlay →</span></div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          <div className="rounded-2xl overflow-hidden mx-auto" style={{ width: 340, background: '#111827', border: '2px solid rgba(57,57,57,0.8)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between px-4 py-2" style={{ background: '#0f172a', borderBottom: '1px solid rgba(57,57,57,0.5)' }}>
              <span className="font-mono" style={{ fontSize: '9px', color: '#6f6f6f' }}>9:47 AM</span>
              <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#10b981', letterSpacing: '0.06em' }}>RHTP Care Management</span>
              <span style={{ fontSize: '9px', color: '#6f6f6f' }}>●●●</span>
            </div>
            <div className="px-3 py-3 flex flex-col gap-2">
              <div className="flex justify-end"><div className="rounded-2xl rounded-tr-sm px-3 py-2 max-w-xs" style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)' }}><span style={{ fontSize: '10px', color: '#d1d5db', lineHeight: 1.5 }}>What&apos;s going on with my heart medication? I got a message saying something changed.</span></div></div>
              <div className="flex justify-start"><div className="rounded-2xl rounded-tl-sm px-3 py-2 max-w-xs" style={{ background: 'rgba(28,28,28,0.9)', border: '1px solid rgba(57,57,57,0.5)' }}><span style={{ fontSize: '10px', color: '#d1d5db', lineHeight: 1.5 }}>Hi Maria — I have important updates about your medications. Here&apos;s what you need to know:</span></div></div>
            </div>
            <div className="mx-3 mb-2" style={{ height: 1, background: 'rgba(57,57,57,0.5)' }} />
            <div className="px-3 pb-3 flex flex-col gap-2">
              {MOBILE_WIDGETS.map((w) => (
                <div key={w.priority} className="rounded-xl p-3 flex flex-col gap-2 transition-all duration-300" style={{ background: w.priority === 1 && widgetAcknowledged ? 'rgba(16,185,129,0.1)' : w.bg, border: w.priority === 1 && widgetAcknowledged ? '1px solid rgba(16,185,129,0.6)' : `1px solid ${w.borderColor}` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><span style={{ fontSize: '12px' }}>{w.priority === 1 && widgetAcknowledged ? '✓' : w.icon}</span><span style={{ fontSize: '10px', color: w.priority === 1 && widgetAcknowledged ? '#10b981' : '#f4f4f4', fontWeight: 600 }}>{w.title}</span></div>
                    <div className="rounded-full px-2 py-0.5" style={{ background: w.priority === 1 && widgetAcknowledged ? 'rgba(16,185,129,0.2)' : `${w.badgeColor}20`, border: w.priority === 1 && widgetAcknowledged ? '1px solid rgba(16,185,129,0.6)' : `1px solid ${w.badgeColor}60` }}>
                      <span className="font-mono" style={{ fontSize: '8px', color: w.priority === 1 && widgetAcknowledged ? '#10b981' : w.badgeColor, letterSpacing: '0.06em' }}>{w.priority === 1 && widgetAcknowledged ? 'CONFIRMED' : w.badge}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '9px', color: '#9ca3af', lineHeight: 1.4 }}>{w.body}</span>
                  {w.priority === 1 && widgetAcknowledged ? (
                    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)' }}>
                      <div className="rounded-full" style={{ width: 5, height: 5, background: '#10b981', boxShadow: '0 0 4px #10b981' }} />
                      <span className="font-mono" style={{ fontSize: '8px', color: '#10b981', letterSpacing: '0.04em' }}>Acknowledged · CHANNEL_HISTORY updated · T+1m</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {w.actions.map((action) => (
                        <button key={action} onClick={() => { if (action === 'GOT IT' && w.priority === 1) { setWidgetAcknowledged(true); setMobileAcknowledgedBanner(true); setTimeout(() => triggerGraphOverlay(), 1800); } }} className="rounded-full px-3 py-1 transition-all" style={{ background: `${w.actionColor}18`, border: `1px solid ${w.actionColor}50`, color: w.actionColor, fontSize: '9px', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.04em', fontWeight: 600 }}>{action}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="rounded-xl p-2.5 flex flex-col gap-1.5" style={{ background: 'rgba(28,28,28,0.8)', border: '1px solid rgba(57,57,57,0.5)' }}>
                <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Maria types:</span>
                <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(57,57,57,0.4)', border: '1px solid rgba(57,57,57,0.6)' }}>
                  <span style={{ fontSize: '9px', color: '#9ca3af', fontStyle: 'italic' }}>&quot;Thank you, when will I get the kit?&quot;</span>
                  <button onClick={() => setFollowOnVisible(true)} className="ml-auto rounded-full flex items-center justify-center" style={{ width: 20, height: 20, background: 'rgba(16,185,129,0.3)', border: '1px solid rgba(16,185,129,0.6)', color: '#10b981', fontSize: '10px', cursor: 'pointer' }}>↑</button>
                </div>
                {followOnVisible && (
                  <div className="rounded-xl rounded-tl-sm px-3 py-2 mt-1" style={{ background: 'rgba(28,28,28,0.9)', border: '1px solid rgba(57,57,57,0.5)' }}>
                    <span style={{ fontSize: '9px', color: '#d1d5db', lineHeight: 1.5 }}>Your home lab kit ships tomorrow — arrives in 2 days. We&apos;ll send a reminder when it&apos;s delivered.</span>
                    <div className="mt-1 flex items-center gap-1"><div className="rounded-full" style={{ width: 4, height: 4, background: '#10b981' }} /><span className="font-mono" style={{ fontSize: '8px', color: '#10b981' }}>Widget 3 updated · no new widget</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="rounded p-2.5 flex flex-col gap-1" style={{ background: 'rgba(57,57,57,0.2)', border: '1px solid rgba(57,57,57,0.4)' }}>
            <span className="font-mono" style={{ fontSize: '9px', color: '#4b5563', letterSpacing: '0.08em' }}>SUPPRESSED (2 signals — frequency limit)</span>
            <span style={{ fontSize: '9px', color: '#4b5563' }}>× Auth renewal reminder — already seen</span>
            <span style={{ fontSize: '9px', color: '#4b5563' }}>× Caregiver coordination prompt — Elena notified separately</span>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(16,185,129,0.2)', background: '#071020' }}>
          <button onClick={() => { setWidgetAcknowledged(true); setMobileAcknowledgedBanner(true); setTimeout(() => triggerGraphOverlay(), 1800); }} className="flex-1 rounded py-2 font-semibold transition-all" style={{ background: mobileAcknowledgedBanner ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.15)', border: mobileAcknowledgedBanner ? '1px solid rgba(16,185,129,0.8)' : '1px solid rgba(16,185,129,0.5)', color: '#10b981', fontSize: '11px', cursor: 'pointer' }}>
            {mobileAcknowledgedBanner ? '✓ ACKNOWLEDGED — UPDATING GRAPH…' : 'MEMBER ACKNOWLEDGED'}
          </button>
          <button className="rounded py-2 px-3 transition-all" style={{ background: 'rgba(120,169,255,0.1)', border: '1px solid rgba(120,169,255,0.4)', color: '#78a9ff', fontSize: '11px', cursor: 'pointer' }}>VIEW AUDIT</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ width: '100%', background: '#0d1117', borderLeft: 'none' }}>
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(57,57,57,0.7)', background: '#161b22' }}>
        <div className="flex items-center gap-2">
          <div className="rounded-full" style={{ width: 8, height: 8, background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
          <span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#10b981', letterSpacing: '0.1em' }}>RHTP MOBILE PUSH — MEMBER SIMULATION</span>
        </div>
        <button onClick={onClose} className="rounded flex items-center justify-center" style={{ width: 24, height: 24, background: 'rgba(57,57,57,0.5)', color: '#8d8d8d', fontSize: 14, cursor: 'pointer' }}>×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.45)' }}>
          <div className="flex items-center gap-2"><span style={{ fontSize: '11px', color: '#f59e0b' }}>⚡</span><span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#f59e0b', letterSpacing: '0.08em' }}>CHANNEL_OVERRIDE: PATIENT_SAFETY_THRESHOLD</span></div>
          <div className="flex flex-col gap-1 pl-1">
            <div className="flex items-start gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 90, flexShrink: 0 }}>Standard routing:</span><span style={{ fontSize: '9px', color: '#d1d5db' }}>{"PORTAL_WEB · weekdays 9–11am (Maria's learned preference)"}</span></div>
            <div className="flex items-start gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 90, flexShrink: 0 }}>Override channel:</span><span style={{ fontSize: '9px', color: '#10b981' }}>MOBILE_PUSH · RHTP Care Management app</span></div>
            <div className="flex items-start gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 90, flexShrink: 0 }}>Override reason:</span><span style={{ fontSize: '9px', color: '#f59e0b' }}>DUPLICATE_THERAPY signal · &lt;15min latency requirement</span></div>
            <div className="flex items-start gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 90, flexShrink: 0 }}>Policy ref:</span><span className="font-mono" style={{ fontSize: '9px', color: '#4b5563' }}>CHANNEL_INTEL.SAFETY.OVERRIDE.001</span></div>
          </div>
          <div className="rounded p-2 mt-1" style={{ background: 'rgba(28,28,28,0.7)', border: '1px solid rgba(57,57,57,0.5)' }}>
            <span style={{ fontSize: '9px', color: '#9ca3af', lineHeight: 1.5, fontStyle: 'italic' }}>&quot;The system knows Maria prefers portal. But it also knows this is a safety alert that can&apos;t wait for her next login. Mobile push within the digital channel family she trusts — preference honored, clinical urgency not compromised.&quot;</span>
          </div>
        </div>

        <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><div className="rounded-full" style={{ width: 7, height: 7, background: '#10b981', boxShadow: '0 0 6px #10b981' }} /><span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#10b981', letterSpacing: '0.1em' }}>RHTP MOBILE PUSH — DISPATCHED</span></div>
            <span className="font-mono" style={{ fontSize: '10px', color: '#4b5563' }}>T+8m</span>
          </div>
          <div className="flex flex-col gap-1 pl-3">
            <div className="flex items-center gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 52, flexShrink: 0 }}>Target:</span><span style={{ fontSize: '10px', color: '#f4f4f4' }}>Maria Redhawk · RHTP Care Management mobile app</span></div>
            <div className="flex items-center gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 52, flexShrink: 0 }}>Session:</span><span style={{ fontSize: '10px', color: '#10b981' }}>Day 34 · 9:47am · within preferred window ✓</span></div>
            <div className="flex items-center gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 52, flexShrink: 0 }}>Method:</span><span style={{ fontSize: '10px', color: '#78a9ff' }}>Autonomous push · widget payload · priority-ordered</span></div>
          </div>
        </div>

        <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'rgba(120,169,255,0.05)', border: '1px solid rgba(120,169,255,0.25)' }}>
          <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#78a9ff', letterSpacing: '0.1em' }}>PHASE 2 — LONGITUDINAL CONTEXT PROJECTION</span>
          <div className="flex flex-col gap-1.5 pl-1">
            {[
              { label: 'Clinical context', value: '⚠ Lisinopril + Metformin RESOLVED · A1C scheduled · HbA1c gap 47d', color: '#ef4444' },
              { label: 'Relationship context', value: 'Elena aware · Bennett County Health acknowledged · chart updated', color: '#c084fc' },
              { label: 'Auth context', value: 'Postpartum rehab pre-approved · auth cycle 0.3d', color: '#42be65' },
              { label: 'Financial context', value: 'OOP $340–$480 · covered pathway available', color: '#10b981' },
              { label: 'Channel context', value: 'Preferred: Portal/Mobile · 9–11am ✓ · suppression: CLEAR', color: '#f59e0b' },
            ].map((item) => (<div key={item.label} className="flex items-start gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 110, flexShrink: 0 }}>{item.label}</span><span style={{ fontSize: '9px', color: item.color, lineHeight: 1.4 }}>{item.value}</span></div>))}
          </div>
          <div className="flex items-center gap-2 mt-1"><div className="rounded-full" style={{ width: 5, height: 5, background: '#78a9ff' }} /><span className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.06em' }}>5 NEXT BEST ACTIONS IDENTIFIED — widget payload queued</span></div>
        </div>

        <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.25)' }}>
          <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#8b5cf6', letterSpacing: '0.1em' }}>PHASE 3 — WIDGET PAYLOAD — PRIORITY ORDER</span>
          <div className="flex flex-col gap-1.5 pl-1">
            {MOBILE_WIDGETS.map((w) => (
              <div key={w.priority} className="flex items-center gap-2">
                <div className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, background: w.badgeColor }} />
                <span className="font-mono" style={{ fontSize: '9px', color: '#4b5563', width: 18 }}>W{w.priority}</span>
                <div className="rounded px-1.5 py-0.5 flex-shrink-0" style={{ background: `${w.badgeColor}15`, border: `1px solid ${w.badgeColor}40` }}>
                  <span className="font-mono" style={{ fontSize: '8px', color: w.badgeColor, letterSpacing: '0.04em' }}>{w.badge}</span>
                </div>
                <span style={{ fontSize: '9px', color: '#d1d5db', lineHeight: 1.3 }}>{w.title}</span>
              </div>
            ))}
            <div className="mt-1 pt-1.5" style={{ borderTop: '1px solid rgba(57,57,57,0.4)' }}>
              <span style={{ fontSize: '9px', color: '#4b5563' }}>SUPPRESSED (2): Auth renewal reminder · Caregiver coordination prompt — frequency limit</span>
            </div>
          </div>
        </div>

        <div className="rounded p-3 flex flex-col gap-3" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div className="flex items-center justify-between">
            <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#10b981', letterSpacing: '0.1em' }}>{acknowledged ? 'MARIA ACKNOWLEDGED' : 'AWAITING MEMBER ACKNOWLEDGEMENT'}</span>
            {acknowledged && (<div className="rounded px-2 py-0.5" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)' }}><span className="font-mono" style={{ fontSize: '9px', color: '#10b981', letterSpacing: '0.08em' }}>T+1m</span></div>)}
          </div>
          {(simulating || acknowledged) && (
            <div className="flex flex-col gap-2">
              {MOBILE_SIM_STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5 transition-all duration-500" style={{ opacity: currentStep >= i ? 1 : 0.2 }}>
                  <div className="rounded-full flex-shrink-0 mt-0.5" style={{ width: 7, height: 7, background: currentStep >= i ? step.color : '#393939', boxShadow: currentStep >= i ? `0 0 5px ${step.color}` : 'none', transition: 'all 0.4s' }} />
                  <div className="flex flex-col gap-0.5 flex-1">
                    <div className="flex items-center gap-2"><span className="font-mono" style={{ fontSize: '9px', color: '#4b5563' }}>{step.time}</span><span style={{ fontSize: '10px', color: currentStep >= i ? '#f4f4f4' : '#4b5563', fontWeight: 500 }}>{step.label}</span></div>
                    <span style={{ fontSize: '9px', color: '#6f6f6f', lineHeight: 1.4 }}>{step.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!simulating && !acknowledged && (
            <button onClick={startSimulation} className="rounded py-2.5 font-semibold transition-all duration-200 flex items-center justify-center gap-2" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.5)', color: '#10b981', fontSize: '12px', cursor: 'pointer' }}>
              <span>▶</span><span>{"SIMULATE MARIA'S RESPONSE"}</span>
            </button>
          )}
          {simulating && !acknowledged && (<div className="flex items-center gap-2"><div className="rounded-full" style={{ width: 6, height: 6, background: '#f59e0b', animation: 'pulse 1s infinite' }} /><span className="font-mono" style={{ fontSize: '10px', color: '#f59e0b', letterSpacing: '0.08em' }}>{"SIMULATING MARIA'S SESSION…"}</span></div>)}
        </div>

        {acknowledged && (
          <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <div className="flex items-center gap-2"><div className="rounded-full" style={{ width: 7, height: 7, background: '#10b981', boxShadow: '0 0 6px #10b981' }} /><span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#10b981', letterSpacing: '0.08em' }}>MARIA ACKNOWLEDGED — T+1m</span></div>
            <div className="flex flex-col gap-1 pl-1">
              {[{ label: 'Safety alert: GOT IT — duplicate therapy resolution confirmed', color: '#42be65' }, { label: 'A1C appointment: CONFIRM tapped', color: '#42be65' }, { label: 'Follow-on query: "when will I get the kit?" — widget 3 updated', color: '#78a9ff' }, { label: 'CHANNEL_HISTORY: Mobile engagement Day 34 logged', color: '#10b981' }].map((item) => (
                <div key={item.label} className="flex items-start gap-2"><span style={{ fontSize: '9px', color: item.color, flexShrink: 0, marginTop: 1 }}>●</span><span style={{ fontSize: '9px', color: '#d1d5db', lineHeight: 1.4 }}>{item.label}</span></div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1"><div className="rounded-full" style={{ width: 5, height: 5, background: '#10b981' }} /><span className="font-mono" style={{ fontSize: '9px', color: '#10b981', letterSpacing: '0.06em' }}>GRAPH UPDATED — CHANNEL_HISTORY node write-back</span></div>
            <span className="font-mono" style={{ fontSize: '8px', color: '#4b5563' }}>AUDIT_20241115_094812_RHTP_MOBILE_ACK_001</span>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(57,57,57,0.5)' }}>
        <button onClick={() => setShowMobileUI(true)} className="flex-1 rounded py-2.5 font-semibold transition-all duration-200 flex items-center justify-center gap-2" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.5)', color: '#10b981', fontSize: '12px', cursor: 'pointer' }}>
          <span>📱</span><span>{"VIEW IN RHTP MOBILE — MARIA'S APP"}</span>
        </button>
        <button onClick={onClose} className="rounded py-2.5 px-3 transition-all" style={{ background: 'rgba(57,57,57,0.3)', border: '1px solid rgba(57,57,57,0.5)', color: '#6f6f6f', fontSize: '11px', cursor: 'pointer' }}>Close</button>
      </div>

      {showGraphOverlay && (
        <div className="absolute inset-0 z-60 flex flex-col" style={{ background: 'rgba(5,10,20,0.97)', backdropFilter: 'blur(2px)' }}>
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.06)' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-full" style={{ width: 8, height: 8, background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'pulse 1.5s infinite' }} />
              <span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#10b981', letterSpacing: '0.12em' }}>KNOWLEDGE GRAPH — REAL-TIME UPDATE</span>
              <div className="rounded px-2 py-0.5" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)' }}><span className="font-mono" style={{ fontSize: '9px', color: '#10b981', letterSpacing: '0.08em' }}>MEMBER ACKNOWLEDGEMENT WRITE-BACK</span></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono" style={{ fontSize: '9px', color: '#4b5563', letterSpacing: '0.06em' }}>↓ arrow to dismiss</span>
              <button onClick={() => { setShowGraphOverlay(false); setGraphPhase(0); }} className="rounded flex items-center justify-center" style={{ width: 24, height: 24, background: 'rgba(57,57,57,0.5)', color: '#8d8d8d', fontSize: 14, cursor: 'pointer' }}>×</button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden px-2 py-2">
            <svg width="100%" height="100%" viewBox="0 0 500 420" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
              <line x1="250" y1="52" x2="120" y2="130" stroke="rgba(16,185,129,0.5)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>
              <line x1="250" y1="52" x2="370" y2="130" stroke="rgba(120,169,255,0.4)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>
              {graphPhase >= 2 && <line x1="120" y1="185" x2="120" y2="245" stroke="rgba(66,190,101,0.5)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>}
              {graphPhase >= 3 && <line x1="120" y1="295" x2="120" y2="345" stroke="rgba(66,190,101,0.5)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>}
              {graphPhase >= 4 && <line x1="370" y1="190" x2="370" y2="280" stroke="rgba(139,92,246,0.4)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>}
              <circle cx="250" cy="28" r="26" fill="rgba(120,169,255,0.12)" stroke="rgba(120,169,255,0.6)" strokeWidth="2" />
              <text x="250" y="24" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#78a9ff" letterSpacing="0.04em">MARIA</text>
              <text x="250" y="35" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#78a9ff" letterSpacing="0.04em">REDHAWK</text>
              <rect x="20" y="130" width="200" height="55" rx="4" fill="rgba(16,185,129,0.08)" stroke={graphPhase >= 1 ? '#10b981' : 'rgba(16,185,129,0.3)'} strokeWidth={graphPhase >= 1 ? 2 : 1} opacity={graphPhase >= 1 ? 1 : 0.4} />
              <text x="30" y="149" fontFamily="monospace" fontSize="9" fontWeight="bold" fill="#10b981" letterSpacing="0.06em">CHANNEL_HISTORY</text>
              {graphPhase >= 1 && (<><rect x="148" y="133" width="64" height="16" rx="3" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.5)" strokeWidth="1" /><circle cx="156" cy="141" r="3" fill="#10b981" /><text x="180" y="145" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#42be65" letterSpacing="0.04em">ACKNOWLEDGED</text></>)}
              <text x="30" y="163" fontFamily="monospace" fontSize="8" fill="#6f6f6f">Care Manager · CM_SARAH_JOHNSON</text>
              {graphPhase >= 1 && (<><text x="30" y="175" fontFamily="monospace" fontSize="8" fill="#42be65">H1ab brief reviewed · approach confirmed ✓</text><text x="30" y="185" fontFamily="monospace" fontSize="8" fill="#4b5563">T+8h32m · no override · script locked</text></>)}
              {graphPhase >= 2 && <rect x="20" y="245" width="200" height="50" rx="4" fill="rgba(239,68,68,0.07)" stroke="rgba(239,68,68,0.5)" strokeWidth="1" />}
              {graphPhase >= 2 && (<><text x="30" y="263" fontFamily="monospace" fontSize="9" fill="#ef4444" letterSpacing="0.06em">TRANSPORT_BARRIER</text><rect x="148" y="248" width="65" height="16" rx="3" fill="rgba(66,190,101,0.12)" stroke="rgba(66,190,101,0.4)" strokeWidth="1" /><text x="180" y="260" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#42be65" letterSpacing="0.04em">PRE-RESOLVED</text><text x="30" y="277" fontFamily="monospace" fontSize="8" fill="#6f6f6f">2 missed appts · same zip · PROBABLE</text><text x="30" y="289" fontFamily="monospace" fontSize="8" fill="#42be65">← Sarah confirmed barrier-aware script</text></>)}
              {graphPhase >= 3 && <rect x="20" y="345" width="200" height="40" rx="4" fill="rgba(66,190,101,0.06)" stroke="rgba(66,190,101,0.45)" strokeWidth="1" />}
              {graphPhase >= 3 && (<><text x="30" y="363" fontFamily="monospace" fontSize="9" fill="#42be65" letterSpacing="0.06em">HOME LAB KIT</text><text x="175" y="363" textAnchor="end" fontFamily="monospace" fontSize="8" fill="#42be65">DISPATCHED</text><text x="30" y="377" fontFamily="monospace" fontSize="8" fill="#6f6f6f">HbA1c gap · no clinic visit required</text></>)}
              <rect x="280" y="130" width="210" height="55" rx="4" fill="rgba(241,194,27,0.06)" stroke={graphPhase >= 1 ? 'rgba(241,194,27,0.6)' : 'rgba(241,194,27,0.2)'} strokeWidth={graphPhase >= 1 ? 2 : 1} opacity={graphPhase >= 1 ? 1 : 0.4} />
              <text x="290" y="149" fontFamily="monospace" fontSize="9" fontWeight="bold" fill="#f1c21b" letterSpacing="0.06em">HbA1c CARE GAP</text>
              {graphPhase >= 1 && (<><rect x="400" y="133" width="82" height="16" rx="3" fill="rgba(66,190,101,0.12)" stroke="rgba(66,190,101,0.4)" strokeWidth="1" /><text x="441" y="145" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#42be65" letterSpacing="0.04em">ADDRESSED</text></>)}
              <text x="290" y="163" fontFamily="monospace" fontSize="8" fill="#6f6f6f">9.2% · 47d SD Medicaid quality window · Q4 active</text>
              {graphPhase >= 1 && (<><text x="290" y="175" fontFamily="monospace" fontSize="8" fill="#42be65">Home kit dispatched 2024-11-14 ✓</text><text x="290" y="185" fontFamily="monospace" fontSize="8" fill="#4b5563">Closure projected 14 days</text></>)}
              {graphPhase >= 4 && <rect x="280" y="280" width="210" height="50" rx="4" fill="rgba(66,190,101,0.06)" stroke="rgba(66,190,101,0.45)" strokeWidth="1" />}
              {graphPhase >= 4 && (<><text x="290" y="298" fontFamily="monospace" fontSize="9" fill="#42be65" letterSpacing="0.06em">CAREGAP_HBA1C RENEWAL</text><text x="455" y="298" textAnchor="end" fontFamily="monospace" fontSize="8" fill="#42be65">SUBMITTED</text><text x="290" y="312" fontFamily="monospace" fontSize="8" fill="#6f6f6f">Procedure HbA1c · cycle time 0.3d</text><text x="290" y="322" fontFamily="monospace" fontSize="8" fill="#42be65">Sarah notified — no action required</text></>)}
              <defs><filter id="glowBlueH1abM" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
            </svg>
          </div>
          <div className="flex-shrink-0 px-4 py-2 flex items-center gap-4 flex-wrap" style={{ borderTop: '1px solid rgba(57,57,57,0.4)' }}>
            {[{ color: '#78a9ff', label: 'H1ab_ACKNOWLEDGED' }, { color: '#ef4444', label: 'TRANSPORT_BARRIER' }, { color: '#42be65', label: 'CARE_GAP_ADDRESSED' }, { color: '#f1c21b', label: 'AUTH_SUBMITTED' }].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5"><div style={{ width: 20, height: 1.5, background: color, opacity: 0.7 }} /><span className="font-mono" style={{ fontSize: '8px', color: '#4b5563', letterSpacing: '0.04em' }}>{label}</span></div>
            ))}
            <div className="ml-auto flex items-center gap-1.5"><div className="rounded-full" style={{ width: 5, height: 5, background: '#78a9ff', animation: 'pulse 1.5s infinite' }} /><span className="font-mono" style={{ fontSize: '8px', color: '#78a9ff', letterSpacing: '0.06em' }}>LIVE — nodes updating</span></div>
          </div>
          <div className="flex-shrink-0 px-4 py-2 flex items-center justify-center gap-2" style={{ borderTop: '1px solid rgba(57,57,57,0.4)', background: 'rgba(0,0,0,0.3)' }}>
            <div className="rounded px-3 py-1 flex items-center gap-2" style={{ background: 'rgba(57,57,57,0.3)', border: '1px solid rgba(57,57,57,0.5)' }}>
              <span style={{ fontSize: '12px', color: '#6f6f6f' }}>↓</span>
              <span className="font-mono" style={{ fontSize: '9px', color: '#6f6f6f', letterSpacing: '0.06em' }}>PRESS DOWN ARROW TO RETURN TO PANEL</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

