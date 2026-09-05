'use client';
/**
 * PatientSwitcherDropdown — topbar patient picker.
 *
 * Uses fixed positioning so the panel escapes any overflow:hidden on parent
 * containers (the AppLayout header wrapper clips absolute children).
 *
 * Author: Richard Hennessy — TCOC Total Cost of Care Clinical Platform
 */

import React, { useState, useRef, useEffect } from 'react';
import { getAllRegistryPatients } from '@/lib/services/patientService';
import { useDemoStore } from '@/uhg/store/demoStore';

const RISK_STYLES: Record<string, { bg: string; text: string }> = {
  Critical: { bg: '#fff1f1', text: '#da1e28' },
  High: { bg: '#fff8e1', text: '#b45309' },
  Moderate: { bg: '#d0e2ff', text: '#0043ce' },
  Low: { bg: '#defbe6', text: '#0e6027' },
};

export default function PatientSwitcherDropdown() {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const patients = getAllRegistryPatients();
  const active = patients.find((p) => p.platformId === activeCitizenId) ?? null;

  // Position panel using fixed coords derived from button rect
  function openPanel() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
    setOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        btnRef.current &&
        !btnRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const riskStyle = RISK_STYLES[active?.riskTier ?? 'Moderate'];

  return (
    <>
      {/* Trigger button */}
      <button
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex items-center gap-2 px-3 py-1.5 border border-carbon-gray-20 bg-white hover:bg-carbon-gray-10 transition-colors text-sm"
        title="Switch active patient"
      >
        {/* Patient icon */}
        <svg
          className="w-4 h-4 text-carbon-gray-50 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>

        {/* Name + risk */}
        <span className="font-medium text-carbon-gray-100 max-w-[120px] truncate">
          {active?.name ?? 'Select Patient'}
        </span>
        {active && (
          <span
            className="text-2xs font-semibold px-1.5 py-0.5 flex-shrink-0"
            style={{ background: riskStyle.bg, color: riskStyle.text }}
          >
            {active.riskTier}
          </span>
        )}

        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 text-carbon-gray-50 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown panel — fixed so it escapes overflow:hidden on layout wrapper */}
      {open && panelPos && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos.top,
            right: panelPos.right,
            zIndex: 9999,
            width: 288,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: '1px solid #e5e7eb',
            background: '#fff',
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          <p className="px-3 py-1.5 text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wider border-b border-carbon-gray-10">
            Active Patient
          </p>
          {patients.map((p) => {
            const rs = RISK_STYLES[p.riskTier] ?? RISK_STYLES.Moderate;
            const isActive = p.platformId === activeCitizenId;
            return (
              <button
                key={p.platformId}
                onClick={() => {
                  setActiveCitizen(p.platformId);
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: isActive ? '#d0e2ff' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f4f4f4';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = isActive
                    ? '#d0e2ff'
                    : 'transparent';
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: rs.text,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  {p.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#1f2328',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </span>
                    {isActive && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#0043ce',
                          background: '#d0e2ff',
                          padding: '1px 5px',
                          flexShrink: 0,
                        }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 5px',
                        background: rs.bg,
                        color: rs.text,
                      }}
                    >
                      {p.riskTier}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#57606a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.episodeType}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#57606a',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 1,
                    }}
                  >
                    {p.organization}
                  </div>
                </div>

                {/* Gap count */}
                {p.openCareGaps > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#da1e28',
                      background: '#fff1f1',
                      padding: '2px 6px',
                      flexShrink: 0,
                    }}
                  >
                    {p.openCareGaps} gaps
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
