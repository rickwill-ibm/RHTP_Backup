'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientSync } from '@/lib/services/patientService';
import LivePopulationLoad from './LivePopulationLoad';
import {
  PROGRAM,
  STATE_AGENCY,
  PRE_AUTH_CONFIDENCE,
  POST_AUTH_CONFIDENCE,
  IDENTITY_METHOD,
  LOG_LINE_DELAY_MS,
  IDENTITY_SOURCES,
  SURVIVORSHIP_RULES,
  SOURCE_SYSTEMS,
  FORMAT_BADGE,
  COMPLETION_STATS,
  buildLogLines,
  getLineColor,
  getLineFontWeight,
  getCardStatusConfig,
  type CardStatus,
} from './scriptedAssembly';

type ViewMode = 'live' | 'narrative';

export default function CdpAssemblyPage() {
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const patient = getPatientSync(activePatientId);
  const MEMBER_NAME = patient?.name ?? 'Member';
  const MEMBER_ID = patient?.platformId ?? activePatientId;
  const MEMBER_LOCATION = patient?.location ?? '—';
  const MEMBER_ROLES = ['PATIENT', 'PARENT', 'CAREGIVER', 'WORKER'];
  const GOLDEN_RECORD_LABEL = `${MEMBER_ID} · Golden Record Assembled`;
  const COMPLETION_MESSAGE = `✓ Knowledge Graph complete — ${MEMBER_NAME} is now known · 52 nodes · 67 edges`;
  const LOG_LINES = buildLogLines(MEMBER_ID, MEMBER_ROLES, COMPLETION_MESSAGE);

  const [mode, setMode] = useState<ViewMode>('live');
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [cardStatuses, setCardStatuses] = useState<CardStatus[]>(
    SOURCE_SYSTEMS.map(() => 'PENDING')
  );
  const [statsVisible, setStatsVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  // Every scheduled timer (outer tick + the nested card-status transitions) is tracked
  // here so the effect cleanup can cancel ALL of them on unmount or mode switch — no
  // background cascade firing setState after the narrative subtree is gone.
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const clearAllTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  const startAnimation = () => {
    if (running) return;
    clearAllTimers();
    setRunning(true);
    setDone(false);
    setVisibleLines(0);
    setCardStatuses(SOURCE_SYSTEMS.map(() => 'PENDING'));
    setStatsVisible(false);
  };

  useEffect(() => {
    // Only the narrative tab animates; switching to Live halts scheduling and the
    // cleanup below cancels anything already queued.
    if (mode !== 'narrative' || !running) return;
    if (visibleLines >= LOG_LINES.length) {
      setDone(true);
      setStatsVisible(true);
      setRunning(false);
      return;
    }

    const outer = setTimeout(() => {
      const line = LOG_LINES[visibleLines];

      // Handle card triggers
      if (line.cardTrigger !== undefined) {
        const idx = line.cardTrigger - 1;
        setCardStatuses((prev) => {
          const next = [...prev];
          if (next[idx] === 'PENDING') next[idx] = 'INGESTING';
          else if (next[idx] === 'INGESTING') next[idx] = 'NORMALISING';
          else if (next[idx] === 'NORMALISING') next[idx] = 'COMPLETE';
          return next;
        });
        const t1 = setTimeout(() => {
          setCardStatuses((prev) => {
            const next = [...prev];
            if (next[idx] === 'INGESTING') next[idx] = 'NORMALISING';
            return next;
          });
          const t2 = setTimeout(() => {
            setCardStatuses((prev) => {
              const next = [...prev];
              if (next[idx] === 'NORMALISING') next[idx] = 'COMPLETE';
              return next;
            });
          }, 600);
          timersRef.current.push(t2);
        }, 400);
        timersRef.current.push(t1);
      }

      // BH card consent check
      if (line.text.includes('42 CFR Pt 2')) {
        setCardStatuses((prev) => {
          const next = [...prev];
          next[5] = 'CONSENT_CHECK';
          return next;
        });
      }

      setVisibleLines((v) => v + 1);
    }, LOG_LINE_DELAY_MS);
    timersRef.current.push(outer);

    return () => {
      clearAllTimers();
    };
  }, [running, visibleLines, mode]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleLines]);

  // Cancel every timer when the component unmounts.
  useEffect(() => () => clearAllTimers(), []);

  // Determine current phase from visible lines
  const currentPhase = (() => {
    let phase = 0;
    for (let i = 0; i < visibleLines; i++) {
      if (LOG_LINES[i].phase) phase = LOG_LINES[i].phase!;
    }
    return phase;
  })();

  // Tabs read as tabs (underline), distinct from the solid-amber RUN action buttons.
  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    background: 'transparent',
    color: active ? '#F59E0B' : '#94a3b8',
    border: 'none',
    borderBottom: `2px solid ${active ? '#F59E0B' : 'transparent'}`,
    padding: '6px 4px',
    cursor: 'pointer',
  });

  return (
    <AppLayout
      pageTitle="Whole Person Care Record Assembly"
      breadcrumbs={[
        { label: 'CDP & Agentic Automation' },
        { label: 'Whole Person Care Record Assembly' },
      ]}
    >
      {/* Header strip */}
      <div
        className="mb-4 px-5 py-3 flex items-center justify-between"
        style={{ background: '#0a0f1e', border: '1px solid #1e293b', flexWrap: 'wrap', gap: 12 }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
              color: '#F59E0B',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            SD RHTP · WHOLE PERSON CARE RECORD ASSEMBLY
          </p>
          <p
            style={{
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
              color: '#94a3b8',
              fontSize: 11,
            }}
          >
            {mode === 'live'
              ? `${PROGRAM} · ${STATE_AGENCY} · Population data load into the WPC record + knowledge graph`
              : `${PROGRAM} · ${STATE_AGENCY} · Single-member illustration of identity resolution`}
          </p>
        </div>
        {/* Mode toggle (tabs) */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
          <button onClick={() => setMode('live')} style={tabStyle(mode === 'live')}>
            ▶ LIVE LOAD
          </button>
          <button onClick={() => setMode('narrative')} style={tabStyle(mode === 'narrative')}>
            NARRATIVE · 1 MEMBER
          </button>
        </div>
      </div>

      {/* LIVE LOAD — the real population data load */}
      {mode === 'live' && <LivePopulationLoad />}

      {/* NARRATIVE — the scripted single-member illustration */}
      {mode === 'narrative' && (
        <>
          <div
            className="mb-3 px-4 py-2"
            style={{ background: '#1a1200', border: '1px solid #F59E0B' }}
          >
            <p
              style={{
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                color: '#F59E0B',
                fontSize: 11,
              }}
            >
              NARRATIVE WALKTHROUGH · single-member illustration (scripted) — how one member&rsquo;s
              records resolve. For real population counts, switch to LIVE LOAD.
            </p>
          </div>

          <div
            className="mb-3 px-4 py-2 flex items-center justify-between"
            style={{ background: '#0a0f1e', border: '1px solid #1e293b', flexWrap: 'wrap', gap: 8 }}
          >
            <p
              style={{
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                color: '#94a3b8',
                fontSize: 11,
              }}
            >
              {MEMBER_NAME} · {MEMBER_LOCATION}
            </p>
            <div className="flex items-center gap-3">
              {currentPhase > 0 && (
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, Fira Code, monospace',
                    fontSize: 11,
                    color: '#F59E0B',
                    background: '#1a1200',
                    border: '1px solid #F59E0B',
                    padding: '2px 10px',
                  }}
                >
                  PHASE {currentPhase} / 5
                </span>
              )}
              <button
                onClick={startAnimation}
                disabled={running}
                style={{
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                  fontSize: 12,
                  fontWeight: 700,
                  background: running ? '#1e293b' : '#F59E0B',
                  color: running ? '#64748b' : '#0a0f1e',
                  border: 'none',
                  padding: '6px 18px',
                  cursor: running ? 'not-allowed' : 'pointer',
                  letterSpacing: 1,
                }}
              >
                {done ? '↺ REPLAY' : running ? 'RUNNING...' : '▶ RUN WALKTHROUGH'}
              </button>
            </div>
          </div>

          {/* Main two-panel layout */}
          <div className="flex gap-4" style={{ minHeight: 560 }}>
            {/* LEFT — Terminal Log */}
            <div
              className="flex-1"
              style={{
                background: '#0a0f1e',
                border: '1px solid #1e293b',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  background: '#0f172a',
                  borderBottom: '1px solid #1e293b',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#ef4444',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#f59e0b',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#84cc16',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, Fira Code, monospace',
                    color: '#64748b',
                    fontSize: 11,
                    marginLeft: 8,
                  }}
                >
                  sd-rhtp-wpc-assembly — identity-resolution-log
                </span>
              </div>

              <div
                ref={logRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  overflowX: 'auto',
                  padding: '14px 16px',
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                  fontSize: 12,
                  lineHeight: 1.7,
                }}
              >
                {visibleLines === 0 && !running && (
                  <p style={{ color: '#475569', fontStyle: 'italic' }}>
                    {'>'} Press ▶ RUN WALKTHROUGH to begin the identity-resolution illustration...
                  </p>
                )}
                {LOG_LINES.slice(0, visibleLines).map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: getLineColor(line.type),
                      fontWeight: getLineFontWeight(line.type),
                      borderTop: line.type === 'phase' ? '1px solid #1e293b' : undefined,
                      paddingTop: line.type === 'phase' ? 8 : undefined,
                      marginTop: line.type === 'phase' ? 8 : undefined,
                      whiteSpace: 'pre',
                    }}
                  >
                    {line.text}
                  </div>
                ))}
                {running && (
                  <span style={{ color: '#F59E0B', animation: 'blink 1s step-end infinite' }}>
                    █
                  </span>
                )}
              </div>
            </div>

            {/* RIGHT — Source System Cards */}
            <div
              style={{
                width: 340,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                flexShrink: 0,
              }}
            >
              {SOURCE_SYSTEMS.map((src, idx) => {
                const status = cardStatuses[idx];
                const statusCfg = getCardStatusConfig(status);
                const fmtCfg = FORMAT_BADGE[src.formatType];

                return (
                  <div
                    key={src.id}
                    style={{
                      background: '#0f172a',
                      border: src.isBH ? '1px solid #f59e0b' : '1px solid #1e293b',
                      borderLeft: src.isBH ? '3px solid #f59e0b' : '3px solid #1e293b',
                      padding: '10px 12px',
                      transition: 'border-color 0.3s',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <div>
                        <p
                          style={{
                            fontFamily: 'JetBrains Mono, Fira Code, monospace',
                            color: '#f1f5f9',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {src.name}
                        </p>
                        <p
                          style={{
                            fontFamily: 'JetBrains Mono, Fira Code, monospace',
                            color: '#64748b',
                            fontSize: 10,
                          }}
                        >
                          {src.owner}
                        </p>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          gap: 3,
                        }}
                      >
                        <span
                          style={{
                            background: fmtCfg.bg,
                            color: fmtCfg.text,
                            fontSize: 9,
                            fontFamily: 'JetBrains Mono, Fira Code, monospace',
                            padding: '1px 6px',
                            fontWeight: 700,
                          }}
                        >
                          {src.format}
                        </span>
                        {src.isBH && (
                          <span
                            style={{
                              background: '#3b0a0a',
                              color: '#f87171',
                              fontSize: 9,
                              fontFamily: 'JetBrains Mono, Fira Code, monospace',
                              padding: '1px 6px',
                              fontWeight: 700,
                            }}
                          >
                            42 CFR Pt 2 (SUD)
                          </span>
                        )}
                      </div>
                    </div>

                    <p
                      style={{
                        fontFamily: 'JetBrains Mono, Fira Code, monospace',
                        color: '#F59E0B',
                        fontSize: 10,
                        marginBottom: 6,
                      }}
                    >
                      {src.fhir}
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: statusCfg.dot,
                            display: 'inline-block',
                          }}
                        />
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, Fira Code, monospace',
                            color: statusCfg.color,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                      {status === 'COMPLETE' && (
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, Fira Code, monospace',
                            color: '#64748b',
                            fontSize: 9,
                          }}
                        >
                          {src.records}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Identity Stitching Summary */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  padding: '12px',
                  marginTop: 4,
                }}
              >
                <p
                  style={{
                    fontFamily: 'JetBrains Mono, Fira Code, monospace',
                    color: '#F59E0B',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1,
                    marginBottom: 8,
                  }}
                >
                  IDENTITY STITCHING
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  {IDENTITY_SOURCES.map((src) => (
                    <div key={src.label} style={{ background: '#1e293b', padding: '4px 7px' }}>
                      <p
                        style={{
                          fontFamily: 'JetBrains Mono, Fira Code, monospace',
                          color: '#64748b',
                          fontSize: 9,
                        }}
                      >
                        {src.label}
                      </p>
                      <p
                        style={{
                          fontFamily: 'JetBrains Mono, Fira Code, monospace',
                          color: '#e2e8f0',
                          fontSize: 9,
                          fontWeight: 700,
                        }}
                      >
                        {src.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div
                  style={{ textAlign: 'center', color: '#F59E0B', fontSize: 14, marginBottom: 6 }}
                >
                  ↓ ↓ ↓ ↓
                </div>
                <div
                  style={{
                    background: '#1a1200',
                    border: '1px solid #F59E0B',
                    boxShadow: '0 0 8px rgba(245,158,11,0.25)',
                    padding: '6px 10px',
                    textAlign: 'center',
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'JetBrains Mono, Fira Code, monospace',
                      color: '#F59E0B',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {GOLDEN_RECORD_LABEL}
                  </p>
                  <p
                    style={{
                      fontFamily: 'JetBrains Mono, Fira Code, monospace',
                      color: '#94a3b8',
                      fontSize: 9,
                      marginTop: 2,
                    }}
                  >
                    {PRE_AUTH_CONFIDENCE} → {POST_AUTH_CONFIDENCE} · {IDENTITY_METHOD}
                  </p>
                </div>
                <p
                  style={{
                    fontFamily: 'JetBrains Mono, Fira Code, monospace',
                    color: '#475569',
                    fontSize: 9,
                    marginTop: 6,
                    textAlign: 'center',
                  }}
                >
                  {SURVIVORSHIP_RULES[0]}
                </p>
              </div>
            </div>
          </div>

          {/* Completion Stats Strip */}
          {statsVisible && (
            <div
              className="mt-4"
              style={{
                background: '#0a0f1e',
                border: '1px solid #F59E0B',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <p
                style={{
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                  color: '#F59E0B',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {COMPLETION_MESSAGE}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {COMPLETION_STATS.map((stat, i) => (
                  <div
                    key={stat.label}
                    style={{
                      background: '#1a1200',
                      border: '1px solid #F59E0B',
                      padding: '4px 12px',
                      fontFamily: 'JetBrains Mono, Fira Code, monospace',
                      color: '#F59E0B',
                      fontSize: 11,
                      fontWeight: 700,
                      animation: `fadeInUp 0.4s ease ${i * 0.1}s both`,
                    }}
                  >
                    {stat.icon} {stat.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </AppLayout>
  );
}
