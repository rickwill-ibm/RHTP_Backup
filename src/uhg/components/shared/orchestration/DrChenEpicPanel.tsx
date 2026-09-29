'use client';
// ─── orchestration/DrChenEpicPanel.tsx ───────────────────────────────────────
// Bennett County Health Epic CDS Hook panel: provider acknowledgement simulation.

import React, { useState, useEffect } from 'react';
import type { HITLStep } from './types';

const DR_CHEN_STEPS: HITLStep[] = [
  { time: '09:58am', label: 'CDS Hook fired to Epic EHR', detail: 'appointment-booked hook delivered — FHIR R4 · <200ms · autonomous push', color: '#42be65', icon: '⚡' },
  { time: '09:58am', label: 'Duplicate therapy surfaced', detail: 'Lisinopril 5mg + Metformin 5mg — same molecule — two active fills — A1C elevated 38 days', color: '#ef4444', icon: '⚠️' },
  { time: '09:59am', label: 'Context brief assembled', detail: 'HbA1c gap, pre-approved auth, SDOH transport barrier, Med review status — all delivered to chart', color: '#78a9ff', icon: '📋' },
  { time: '09:59am', label: 'Bennett County Health opens chart', detail: 'Epic EHR: CDS alert cards rendered — 3 actionable items visible before appointment starts', color: '#f59e0b', icon: '🔍' },
  { time: '10:06am', label: 'Bennett County Health acknowledges', detail: 'Duplicate therapy flagged — Metformin discontinued · HbA1c lab ordered · Postpartum rehab referral placed', color: '#42be65', icon: '✓' },
];

export function DrChenEpicPanel({ onClose }: { onClose: () => void }) {
  const [simulating, setSimulating] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showEpicView, setShowEpicView] = useState(false);
  const [showGraphOverlay, setShowGraphOverlay] = useState(false);
  const [graphPhase, setGraphPhase] = useState(0);

  const startSimulation = () => {
    setSimulating(true);
    setCurrentStep(0);
    DR_CHEN_STEPS.forEach((_, i) => {
      setTimeout(() => {
        setCurrentStep(i);
        if (i === DR_CHEN_STEPS.length - 1) {
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

  if (showEpicView) {
    return (
      <div className="flex flex-col h-full" style={{ background: '#0a1628', borderLeft: '1px solid rgba(6,182,212,0.3)' }}>
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(6,182,212,0.25)', background: '#071020' }}>
          <div className="flex items-center gap-3">
            <div className="rounded px-2 py-1 flex items-center gap-2" style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.5)' }}>
              <div className="rounded-full" style={{ width: 7, height: 7, background: '#06b6d4', boxShadow: '0 0 6px #06b6d4' }} />
              <span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#06b6d4', letterSpacing: '0.1em' }}>EPIC EHR — BENNETT COUNTY HEALTH</span>
            </div>
            <span style={{ fontSize: '11px', color: '#6f6f6f' }}>Cardiology · Chart View</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEpicView(false)} className="rounded px-2 py-1 transition-colors" style={{ background: 'rgba(57,57,57,0.4)', border: '1px solid rgba(57,57,57,0.6)', color: '#8d8d8d', fontSize: '11px', cursor: 'pointer' }}>← Back</button>
            <button onClick={onClose} className="rounded flex items-center justify-center" style={{ width: 24, height: 24, background: 'rgba(57,57,57,0.5)', color: '#8d8d8d', fontSize: 14, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between" style={{ background: '#071828', borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '10px', color: '#4b5563' }}>Patient:</span>
            <span className="font-semibold" style={{ fontSize: '11px', color: '#f4f4f4' }}>Redhawk, Maria</span>
            <span style={{ fontSize: '10px', color: '#6f6f6f' }}>DOB: 1957-03-14 · MRN: 00847291</span>
            <div className="rounded px-1.5 py-0.5" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)' }}><span className="font-mono" style={{ fontSize: '9px', color: '#ef4444', letterSpacing: '0.06em' }}>HIGH RISK</span></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full" style={{ width: 6, height: 6, background: '#42be65', boxShadow: '0 0 5px #42be65' }} />
            <span className="font-mono" style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.08em' }}>3 CDS ALERTS ACTIVE</span>
          </div>
        </div>
        <div className="flex-shrink-0 mx-4 mt-3 rounded px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.3)' }}>
          <div className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: '#06b6d4', boxShadow: '0 0 5px #06b6d4' }} />
          <span className="font-mono" style={{ fontSize: '10px', color: '#06b6d4', letterSpacing: '0.08em' }}>CDS ALERTS — MARIA REDHAWK · Appointment: 2024-11-15 10:00am</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          <div className="rounded" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.45)' }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(239,68,68,0.25)' }}>
              <div className="flex items-center gap-2"><span style={{ fontSize: '12px', color: '#ef4444' }}>⚠</span><span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#ef4444', letterSpacing: '0.08em' }}>DUPLICATE THERAPY</span></div>
              <div className="rounded px-2 py-0.5" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)' }}><span className="font-mono" style={{ fontSize: '9px', color: '#ef4444', letterSpacing: '0.06em' }}>HIGH PRIORITY</span></div>
            </div>
            <div className="px-3 py-2.5 flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <span style={{ fontSize: '10px', color: '#d1d5db' }}>Lisinopril 5mg <span style={{ color: '#6f6f6f' }}>(Bennett County Health · CVS #4821)</span></span>
                <span style={{ fontSize: '10px', color: '#d1d5db' }}>Metformin 5mg <span style={{ color: '#6f6f6f' }}>(Bennett County Health · Walgreens #7734)</span></span>
                <span style={{ fontSize: '9px', color: '#ef4444' }}>Same molecule — two active fills — A1C elevated 38 days</span>
              </div>
              <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Recommend: Discontinue one · Confirm A1C monitoring · Med review enrolled (partial)</span>
              <div className="flex items-center gap-2 mt-1">
                {['ACKNOWLEDGE', 'ORDER A1C', 'DISCONTINUE'].map((action) => (<button key={action} className="rounded px-2 py-1 transition-all" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', fontSize: '9px', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{action}</button>))}
              </div>
            </div>
          </div>
          <div className="rounded" style={{ background: 'rgba(241,194,27,0.06)', border: '1px solid rgba(241,194,27,0.4)' }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(241,194,27,0.2)' }}>
              <div className="flex items-center gap-2"><span style={{ fontSize: '12px', color: '#f1c21b' }}>ⓘ</span><span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#f1c21b', letterSpacing: '0.08em' }}>CARE GAP — HbA1c</span></div>
              <div className="rounded px-2 py-0.5" style={{ background: 'rgba(241,194,27,0.12)', border: '1px solid rgba(241,194,27,0.4)' }}><span className="font-mono" style={{ fontSize: '9px', color: '#f1c21b', letterSpacing: '0.06em' }}>SD Medicaid quality WINDOW</span></div>
            </div>
            <div className="px-3 py-2.5 flex flex-col gap-2">
              <span style={{ fontSize: '10px', color: '#d1d5db' }}>Last value: <span style={{ color: '#f1c21b' }}>9.2%</span> · 47 days remaining in measurement window</span>
              <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Home lab kit available · No transport required · Kit dispatched 2024-11-14</span>
              <div className="flex items-center gap-2 mt-1">
                {['ORDER LAB', 'DEFER'].map((action) => (<button key={action} className="rounded px-2 py-1 transition-all" style={{ background: 'rgba(241,194,27,0.08)', border: '1px solid rgba(241,194,27,0.35)', color: '#f1c21b', fontSize: '9px', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{action}</button>))}
              </div>
            </div>
          </div>
          <div className="rounded" style={{ background: 'rgba(66,190,101,0.06)', border: '1px solid rgba(66,190,101,0.4)' }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(66,190,101,0.2)' }}>
              <div className="flex items-center gap-2"><span style={{ fontSize: '12px', color: '#42be65' }}>✓</span><span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#42be65', letterSpacing: '0.08em' }}>PRIOR AUTH — POSTPARTUM REHAB</span></div>
              <div className="rounded px-2 py-0.5" style={{ background: 'rgba(66,190,101,0.12)', border: '1px solid rgba(66,190,101,0.4)' }}><span className="font-mono" style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.06em' }}>PRE-APPROVED</span></div>
            </div>
            <div className="px-3 py-2.5 flex flex-col gap-2">
              <span style={{ fontSize: '10px', color: '#d1d5db' }}>Authorization pre-assembled by RHTP Orchestrate · Ready to attach to referral</span>
              <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Auth cycle: 0.3 days (vs 8.2d industry avg) · Procedure: HbA1c · SD Medicaid LCD L38779</span>
              <div className="flex items-center gap-2 mt-1"><button className="rounded px-2 py-1 transition-all" style={{ background: 'rgba(66,190,101,0.12)', border: '1px solid rgba(66,190,101,0.4)', color: '#42be65', fontSize: '9px', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.04em' }}>ATTACH TO REFERRAL</button></div>
            </div>
          </div>
          {acknowledged && (
            <div className="rounded p-3 flex flex-col gap-1.5" style={{ background: 'rgba(66,190,101,0.06)', border: '1px solid rgba(66,190,101,0.3)' }}>
              <div className="flex items-center gap-2"><span style={{ fontSize: '10px', color: '#42be65' }}>✓</span><span className="font-mono" style={{ fontSize: '10px', color: '#42be65', letterSpacing: '0.08em' }}>PROVIDER ACKNOWLEDGED — T+8m</span></div>
              <span style={{ fontSize: '10px', color: '#d1d5db' }}>&quot;Duplicate therapy flagged — discontinuing Metformin. HbA1c lab ordered — home kit confirmed. Postpartum rehab referral placed — auth retrieved.&quot;</span>
              <span className="font-mono" style={{ fontSize: '9px', color: '#4b5563' }}>AUDIT_20241115_100600_EPIC_DRPROVIDER_001 · Graph updated</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(6,182,212,0.2)', background: '#071020' }}>
          <button className="flex-1 rounded py-2 font-semibold transition-all" style={{ background: 'rgba(66,190,101,0.15)', border: '1px solid rgba(66,190,101,0.5)', color: '#42be65', fontSize: '11px', cursor: 'pointer' }}>SIGN &amp; CLOSE ENCOUNTER</button>
          <button className="rounded py-2 px-3 transition-all" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.4)', color: '#06b6d4', fontSize: '11px', cursor: 'pointer' }}>PRINT SUMMARY</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d1117', borderLeft: '1px solid rgba(6,182,212,0.3)' }}>
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(57,57,57,0.7)', background: '#161b22' }}>
        <div className="flex items-center gap-2">
          <div className="rounded-full" style={{ width: 8, height: 8, background: '#06b6d4', boxShadow: '0 0 6px #06b6d4' }} />
          <span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#06b6d4', letterSpacing: '0.1em' }}>EPIC CDS HOOK — BENNETT COUNTY HEALTH</span>
        </div>
        <button onClick={onClose} className="rounded flex items-center justify-center" style={{ width: 24, height: 24, background: 'rgba(57,57,57,0.5)', color: '#8d8d8d', fontSize: 14, cursor: 'pointer' }}>×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'rgba(66,190,101,0.06)', border: '1px solid rgba(66,190,101,0.3)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><div className="rounded-full" style={{ width: 7, height: 7, background: '#42be65', boxShadow: '0 0 6px #42be65' }} /><span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#42be65', letterSpacing: '0.1em' }}>CDS HOOK FIRED — COMPLETE</span></div>
            <span className="font-mono" style={{ fontSize: '10px', color: '#4b5563' }}>T+0m</span>
          </div>
          <div className="flex flex-col gap-1 pl-3">
            <div className="flex items-center gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 52, flexShrink: 0 }}>Target:</span><span style={{ fontSize: '10px', color: '#f4f4f4' }}>Bennett County Health · Cardiology · Epic EHR</span></div>
            <div className="flex items-center gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 52, flexShrink: 0 }}>Hook:</span><span style={{ fontSize: '10px', color: '#06b6d4' }}>appointment-booked</span></div>
            <div className="flex items-center gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 52, flexShrink: 0 }}>Delivery:</span><span style={{ fontSize: '10px', color: '#f4f4f4' }}>CDS Hooks FHIR R4 · &lt;200ms</span></div>
            <div className="flex items-center gap-2"><span style={{ fontSize: '9px', color: '#4b5563', width: 52, flexShrink: 0 }}>Method:</span><span style={{ fontSize: '10px', color: '#78a9ff' }}>Autonomous push — no manual assembly required</span></div>
          </div>
        </div>

        <div className="rounded p-3 flex flex-col gap-1.5" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <div className="flex items-center gap-2"><span style={{ fontSize: '11px', color: '#ef4444' }}>⚠</span><span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#ef4444', letterSpacing: '0.08em' }}>DUPLICATE THERAPY SURFACED IN BRIEF</span></div>
          <div className="flex flex-col gap-0.5 pl-1">
            <span style={{ fontSize: '10px', color: '#d1d5db' }}>Lisinopril 5mg <span style={{ color: '#6f6f6f' }}>(Bennett County Health · CVS #4821)</span> + Metformin 5mg <span style={{ color: '#6f6f6f' }}>(Bennett County Health · Walgreens #7734)</span></span>
            <span style={{ fontSize: '9px', color: '#ef4444' }}>Same molecule — two active fills — A1C elevated 38 days</span>
            <span style={{ fontSize: '9px', color: '#6f6f6f' }}>Brief action: Reconcile at today&apos;s visit — Med review enrolled (partial)</span>
          </div>
        </div>

        <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.25)' }}>
          <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#06b6d4', letterSpacing: '0.1em' }}>CONTEXT DELIVERED TO EPIC CHART</span>
          <div className="flex flex-col gap-1.5 pl-1">
            {[
              { label: 'Duplicate therapy alert', color: '#ef4444' },
              { label: 'HbA1c care gap — 47 days remaining in SD Medicaid quality window', color: '#f1c21b' },
              { label: 'Auth pre-approved — postpartum rehab ready to order', color: '#42be65' },
              { label: 'SDOH transport barrier — home lab kit dispatched', color: '#78a9ff' },
              { label: 'Med review status — partial — consent expansion pending', color: '#8b5cf6' },
            ].map((item) => (<div key={item.label} className="flex items-start gap-2"><span style={{ fontSize: '10px', color: item.color, flexShrink: 0, marginTop: 1 }}>✓</span><span style={{ fontSize: '10px', color: '#d1d5db', lineHeight: 1.4 }}>{item.label}</span></div>))}
          </div>
        </div>

        <div className="rounded p-3 flex flex-col gap-3" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.2)' }}>
          <div className="flex items-center justify-between">
            <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#06b6d4', letterSpacing: '0.1em' }}>{acknowledged ? 'PROVIDER ACKNOWLEDGED' : 'AWAITING PROVIDER ACKNOWLEDGEMENT'}</span>
            {acknowledged && (<div className="rounded px-2 py-0.5" style={{ background: 'rgba(66,190,101,0.12)', border: '1px solid rgba(66,190,101,0.4)' }}><span className="font-mono" style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.08em' }}>T+8m</span></div>)}
          </div>
          {(simulating || acknowledged) && (
            <div className="flex flex-col gap-2">
              {DR_CHEN_STEPS.map((step, i) => (
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
            <button onClick={startSimulation} className="rounded py-2.5 font-semibold transition-all duration-200 flex items-center justify-center gap-2" style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.5)', color: '#06b6d4', fontSize: '12px', cursor: 'pointer' }}>
              <span>▶</span><span>{"SIMULATE PROVIDER'S RESPONSE"}</span>
            </button>
          )}
          {simulating && !acknowledged && (
            <div className="flex items-center gap-2"><div className="rounded-full" style={{ width: 6, height: 6, background: '#f59e0b', animation: 'pulse 1s infinite' }} /><span className="font-mono" style={{ fontSize: '10px', color: '#f59e0b', letterSpacing: '0.08em' }}>{"SIMULATING PROVIDER'S REVIEW…"}</span></div>
          )}
        </div>

        {acknowledged && (
          <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'rgba(66,190,101,0.06)', border: '1px solid rgba(66,190,101,0.3)' }}>
            <div className="flex items-center gap-2"><div className="rounded-full" style={{ width: 7, height: 7, background: '#42be65', boxShadow: '0 0 6px #42be65' }} /><span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#42be65', letterSpacing: '0.08em' }}>PROVIDER ACKNOWLEDGED — T+8m</span></div>
            <div className="rounded p-2.5" style={{ background: 'rgba(28,28,28,0.8)', border: '1px solid rgba(57,57,57,0.5)' }}>
              <span style={{ fontSize: '10px', color: '#d1d5db', lineHeight: 1.5, fontStyle: 'italic' }}>&quot;Duplicate therapy flagged — discontinuing Metformin. HbA1c lab ordered — home kit confirmed. Postpartum rehab referral placed — auth retrieved.&quot;</span>
            </div>
            <div className="flex flex-col gap-1 pl-1">
              {[{ label: 'A1C monitoring: Scheduled — 7 days', color: '#42be65' }, { label: 'Metformin: Discontinued in Epic', color: '#42be65' }, { label: 'HbA1c lab: Ordered — home kit active', color: '#42be65' }, { label: 'Postpartum rehab: Referral placed — pre-auth attached', color: '#42be65' }].map((item) => (
                <div key={item.label} className="flex items-center gap-2"><span style={{ fontSize: '9px', color: item.color }}>●</span><span style={{ fontSize: '9px', color: '#d1d5db' }}>{item.label}</span></div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1"><div className="rounded-full" style={{ width: 5, height: 5, background: '#06b6d4' }} /><span className="font-mono" style={{ fontSize: '9px', color: '#06b6d4', letterSpacing: '0.06em' }}>GRAPH UPDATED — Bennett County Health response written back</span></div>
            <span className="font-mono" style={{ fontSize: '8px', color: '#4b5563' }}>AUDIT_20241115_100600_EPIC_DRPROVIDER_001</span>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(57,57,57,0.5)' }}>
        <button onClick={() => setShowEpicView(true)} className="flex-1 rounded py-2.5 font-semibold transition-all duration-200 flex items-center justify-center gap-2" style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.5)', color: '#06b6d4', fontSize: '12px', cursor: 'pointer' }}>
          <span>⊞</span><span>VIEW IN EPIC — BENNETT COUNTY HEALTH</span>
        </button>
        <button onClick={onClose} className="rounded py-2.5 px-3 transition-all" style={{ background: 'rgba(57,57,57,0.3)', border: '1px solid rgba(57,57,57,0.5)', color: '#6f6f6f', fontSize: '11px', cursor: 'pointer' }}>Close</button>
      </div>

      {showGraphOverlay && (
        <div className="absolute inset-0 z-60 flex flex-col" style={{ background: 'rgba(5,10,20,0.97)', backdropFilter: 'blur(2px)' }}>
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(6,182,212,0.35)', background: 'rgba(6,182,212,0.06)' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-full" style={{ width: 8, height: 8, background: '#06b6d4', boxShadow: '0 0 8px #06b6d4', animation: 'pulse 1.5s infinite' }} />
              <span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#06b6d4', letterSpacing: '0.12em' }}>KNOWLEDGE GRAPH — REAL-TIME UPDATE</span>
              <div className="rounded px-2 py-0.5" style={{ background: 'rgba(66,190,101,0.12)', border: '1px solid rgba(66,190,101,0.4)' }}><span className="font-mono" style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.08em' }}>PROVIDER WRITE-BACK</span></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono" style={{ fontSize: '9px', color: '#4b5563', letterSpacing: '0.06em' }}>↓ arrow to dismiss</span>
              <button onClick={() => { setShowGraphOverlay(false); setGraphPhase(0); }} className="rounded flex items-center justify-center" style={{ width: 24, height: 24, background: 'rgba(57,57,57,0.5)', color: '#8d8d8d', fontSize: 14, cursor: 'pointer' }}>×</button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden px-2 py-2">
            <svg width="100%" height="100%" viewBox="0 0 500 420" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
              <line x1="250" y1="52" x2="120" y2="130" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>
              <line x1="250" y1="52" x2="370" y2="130" stroke="rgba(6,182,212,0.5)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>
              {graphPhase >= 2 && <line x1="120" y1="175" x2="120" y2="235" stroke="rgba(239,68,68,0.35)" strokeWidth="1.5" strokeDasharray="3 4" />}
              {graphPhase >= 2 && <line x1="120" y1="280" x2="120" y2="340" stroke="rgba(241,194,27,0.35)" strokeWidth="1.5" strokeDasharray="3 4" />}
              {graphPhase >= 3 && <line x1="370" y1="175" x2="370" y2="250" stroke="rgba(66,190,101,0.5)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>}
              {graphPhase >= 4 && <line x1="370" y1="175" x2="370" y2="330" stroke="rgba(66,190,101,0.5)" strokeWidth="1.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" /></line>}
              <circle cx="250" cy="28" r="26" fill="rgba(120,169,255,0.12)" stroke="rgba(120,169,255,0.6)" strokeWidth="2" filter="url(#glowBlue)" />
              <text x="250" y="24" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#78a9ff" letterSpacing="0.04em">MARIA</text>
              <text x="250" y="35" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#78a9ff" letterSpacing="0.04em">REDHAWK</text>
              <rect x="20" y="130" width="200" height="45" rx="4" fill="rgba(239,68,68,0.08)" stroke={graphPhase >= 1 ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.25)'} strokeWidth="1" opacity={graphPhase >= 1 ? 1 : 0.4} />
              <text x="30" y="148" fontFamily="monospace" fontSize="9" fill="#ef4444" letterSpacing="0.06em">LISINOPRIL 5mg</text>
              <rect x="155" y="135" width="58" height="16" rx="3" fill="rgba(66,190,101,0.12)" stroke="rgba(66,190,101,0.4)" strokeWidth="1" />
              <text x="184" y="147" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#42be65" letterSpacing="0.04em">ACTIVE</text>
              <text x="30" y="165" fontFamily="monospace" fontSize="8" fill="#6f6f6f">Bennett County Health · CVS #4821</text>
              <rect x="20" y="235" width="200" height="45" rx="4" fill="rgba(239,68,68,0.05)" stroke={graphPhase >= 2 ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)'} strokeWidth="1" opacity={graphPhase >= 2 ? 1 : 0.3} />
              <text x="30" y="253" fontFamily="monospace" fontSize="9" fill="#ef4444" letterSpacing="0.06em" textDecoration={graphPhase >= 2 ? 'line-through' : 'none'}>METFORMIN 5mg</text>
              {graphPhase >= 2 && (<><rect x="148" y="238" width="65" height="16" rx="3" fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.5)" strokeWidth="1" /><text x="180" y="250" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#ef4444" letterSpacing="0.04em">DISCONTINUED</text></>)}
              <text x="30" y="268" fontFamily="monospace" fontSize="8" fill="#6f6f6f">Bennett County Health · Walgreens #7734</text>
              {graphPhase >= 2 && <text x="30" y="278" fontFamily="monospace" fontSize="8" fill="#42be65">← Bennett County Health write-back T+8m</text>}
              <rect x="20" y="340" width="200" height="45" rx="4" fill="rgba(241,194,27,0.06)" stroke={graphPhase >= 2 ? 'rgba(241,194,27,0.55)' : 'rgba(241,194,27,0.2)'} strokeWidth="1" opacity={graphPhase >= 2 ? 1 : 0.3} />
              <text x="30" y="358" fontFamily="monospace" fontSize="9" fill="#f1c21b" letterSpacing="0.06em">HbA1c CARE GAP</text>
              {graphPhase >= 2 && (<><rect x="148" y="343" width="65" height="16" rx="3" fill="rgba(66,190,101,0.12)" stroke="rgba(66,190,101,0.4)" strokeWidth="1" /><text x="180" y="355" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#42be65" letterSpacing="0.04em">LAB_ORDERED</text></>)}
              <text x="30" y="373" fontFamily="monospace" fontSize="8" fill="#6f6f6f">9.2% · 47d SD Medicaid quality window</text>
              {graphPhase >= 2 && <text x="30" y="383" fontFamily="monospace" fontSize="8" fill="#42be65">Home kit active ✓</text>}
              <rect x="280" y="130" width="210" height="55" rx="4" fill="rgba(6,182,212,0.08)" stroke={graphPhase >= 1 ? '#06b6d4' : 'rgba(6,182,212,0.3)'} strokeWidth={graphPhase >= 1 ? 2 : 1} opacity={graphPhase >= 1 ? 1 : 0.4} />
              <text x="290" y="148" fontFamily="monospace" fontSize="9" fontWeight="bold" fill="#06b6d4" letterSpacing="0.06em">BENNETT COUNTY HEALTH PCP</text>
              {graphPhase >= 1 && (<><rect x="400" y="133" width="82" height="16" rx="3" fill="rgba(66,190,101,0.15)" stroke="rgba(66,190,101,0.5)" strokeWidth="1" /><circle cx="408" cy="141" r="3" fill="#42be65" /><text x="448" y="145" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#42be65" letterSpacing="0.04em">ACKNOWLEDGED</text></>)}
              <text x="290" y="163" fontFamily="monospace" fontSize="8" fill="#6f6f6f">Cardiology · Epic EHR · NPI: 1234567890</text>
              {graphPhase >= 1 && (<><text x="290" y="175" fontFamily="monospace" fontSize="8" fill="#42be65">CDS_HOOK → appointment-booked ✓</text><text x="290" y="185" fontFamily="monospace" fontSize="8" fill="#4b5563">T+8m · FHIR R4 write-back</text></>)}
              {graphPhase >= 3 && <rect x="280" y="250" width="210" height="40" rx="4" fill="rgba(66,190,101,0.06)" stroke="rgba(66,190,101,0.45)" strokeWidth="1" />}
              {graphPhase >= 3 && (<><text x="290" y="268" fontFamily="monospace" fontSize="9" fill="#42be65" letterSpacing="0.06em">A1C MONITORING</text><text x="455" y="268" textAnchor="end" fontFamily="monospace" fontSize="8" fill="#42be65">NEW</text><text x="290" y="282" fontFamily="monospace" fontSize="8" fill="#6f6f6f">Scheduled — 7 days · Bennett County Health order</text></>)}
              {graphPhase >= 4 && <rect x="280" y="330" width="210" height="40" rx="4" fill="rgba(66,190,101,0.06)" stroke="rgba(66,190,101,0.45)" strokeWidth="1" />}
              {graphPhase >= 4 && (<><text x="290" y="348" fontFamily="monospace" fontSize="9" fill="#42be65" letterSpacing="0.06em">POSTPARTUM REHAB</text><text x="455" y="348" textAnchor="end" fontFamily="monospace" fontSize="8" fill="#42be65">REFERRAL PLACED</text><text x="290" y="362" fontFamily="monospace" fontSize="8" fill="#6f6f6f">Pre-auth attached · Auth cycle 0.3d</text></>)}
              <defs><filter id="glowBlue" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
            </svg>
          </div>
          <div className="flex-shrink-0 px-4 py-2 flex items-center gap-4 flex-wrap" style={{ borderTop: '1px solid rgba(57,57,57,0.4)' }}>
            {[{ color: '#06b6d4', label: 'CDS_HOOK' }, { color: '#ef4444', label: 'DUPLICATE_THERAPY' }, { color: '#42be65', label: 'WRITE_BACK' }, { color: '#f1c21b', label: 'LAB_ORDERED' }].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5"><div style={{ width: 20, height: 1.5, background: color, opacity: 0.7 }} /><span className="font-mono" style={{ fontSize: '8px', color: '#4b5563', letterSpacing: '0.04em' }}>{label}</span></div>
            ))}
            <div className="ml-auto flex items-center gap-1.5"><div className="rounded-full" style={{ width: 5, height: 5, background: '#06b6d4', animation: 'pulse 1.5s infinite' }} /><span className="font-mono" style={{ fontSize: '8px', color: '#06b6d4', letterSpacing: '0.06em' }}>LIVE — nodes updating</span></div>
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
