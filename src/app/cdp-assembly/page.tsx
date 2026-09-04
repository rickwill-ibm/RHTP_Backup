'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientSync } from '@/lib/services/patientService';
const DEVICE_FINGERPRINT = 'dv_SD_8821x';
const PRE_AUTH_CONFIDENCE = '87%';
const POST_AUTH_CONFIDENCE = '94%';
const IDENTITY_METHOD = 'DETERMINISTIC_CONFIRMED';
const IDENTITY_STATE_BEFORE = 'FRAGMENTED';
const IDENTITY_STATE_AFTER = 'UNIFIED';
const PROGRAM = 'Medicaid RHTP Track 3';
const STATE_AGENCY = 'SD DHSS';
const LOG_LINE_DELAY_MS = 80;

const IDENTITY_SOURCES = [
  { label: 'SD Medicaid MRN', value: 'SD_MBR_MARIA_001' },
  { label: 'CAH EHR MRN', value: 'MRN-SD-001' },
  { label: 'CHIP Guardian ID', value: 'SD_CHIP_GUARDIAN_001' },
  { label: 'Pharmacy Account', value: 'MARTIN_PHARM_MARIA' },
];

const SURVIVORSHIP_RULES = ['Clinical (EHR) > Claims (Medicaid) > Pharmacy > DSS Benefits'];

function buildGraphNodes(memberId: string): string[] {
  return [
    `Member identity — ${memberId} · 4 roles confirmed`,
    'Insurance — SD Medicaid ACTIVE · CHIP (Sophia) ACTIVE',
    'Care Gaps — 3 clinical · 2 BH · 4 social (9 total)',
    'Episodes — Pre-Diabetic ACTIVE · Postpartum UNMANAGED',
    'Medications — Metformin · Lisinopril (Elena) · Amoxicillin (Sophia)',
    'Provider — Bennett County Health CAH · Sarah Johnson CM',
    'SDOH — Transport HIGH · Childcare HIGH · Food MODERATE',
    'Consent — Layer 1 ACTIVE · Layer 2 ACTIVE · Layer 3 ACTIVE · Layer 4 PENDING',
    'Dependents — Sophia Redhawk (24mo) · Elena Redhawk (58y)',
    'Benefits — WIC LAPSED · Childcare Subsidy ELIGIBLE_NOT_ENROLLED',
    'Pharmacy Intelligence — Martin Pharmacy 2x/month family pickup',
    'Caregiver Burden — Zarit 48 · 18hrs/week · no respite',
  ];
}

interface SourceSystem {
  id: string;
  name: string;
  owner: string;
  format: string;
  formatType: 'edi' | 'hl7' | 'rest' | 'ncpdp' | 'csv' | 'bh';
  fhir: string;
  records: string;
  stream: number;
  isBH?: boolean;
}

const SOURCE_SYSTEMS: SourceSystem[] = [
  {
    id: 'src-1',
    name: 'SD Medicaid MMIS',
    owner: STATE_AGENCY,
    format: 'X12 837 EDI',
    formatType: 'edi',
    fhir: 'FHIR ExplanationOfBenefit + CoverageEligibilityResponse',
    records: '847 claims · eligibility active',
    stream: 1,
  },
  {
    id: 'src-2',
    name: 'Bennett County Health EHR',
    owner: 'Bennett County CAH',
    format: 'HL7 v2.x',
    formatType: 'hl7',
    fhir: 'FHIR Patient + Condition + Observation',
    records: '12 encounters · 3 active conditions',
    stream: 2,
  },
  {
    id: 'src-3',
    name: 'SD CHIP / Dependent Coverage',
    owner: STATE_AGENCY,
    format: 'X12 837 EDI',
    formatType: 'edi',
    fhir: 'FHIR Patient + Coverage (Sophia)',
    records: '34 claims · CHIP active',
    stream: 3,
  },
  {
    id: 'src-4',
    name: 'Martin Pharmacy PMS',
    owner: 'Martin Pharmacy',
    format: 'NCPDP SCRIPT',
    formatType: 'ncpdp',
    fhir: 'FHIR MedicationDispense',
    records: '18 dispenses · cross-family pattern',
    stream: 4,
  },
  {
    id: 'src-5',
    name: 'SD DSS Integrated Benefits',
    owner: 'SD Dept of Social Services',
    format: 'EDI 834 + CSV',
    formatType: 'csv',
    fhir: 'FHIR Coverage + CarePlan + Task',
    records: 'SNAP active · 4 benefit gaps identified',
    stream: 5,
  },
  {
    id: 'src-6',
    name: 'SD Division of Behavioral Health',
    owner: 'SD DHSS BH Division',
    format: 'REST API',
    formatType: 'bh',
    fhir: 'FHIR CarePlan + EpisodeOfCare [42 CFR Pt 2 gated]',
    records: '1 BH episode · consent verified',
    stream: 6,
    isBH: true,
  },
];

// ─── Log line definitions ─────────────────────────────────────────────────────
type LogLineType = 'default' | 'amber' | 'lime' | 'red' | 'phase' | 'indent';

interface LogLine {
  text: string;
  type: LogLineType;
  cardTrigger?: number; // triggers card N to advance status
  phase?: number;
}

function buildLogLines(
  memberId: string,
  memberRoles: string[],
  completionMessage: string
): LogLine[] {
  const graphNodes = buildGraphNodes(memberId);
  return [
    // Phase 1
    { text: '── PHASE 1: ANONYMOUS SESSION DETECTION ──────────────────', type: 'phase', phase: 1 },
    { text: `> SD RHTP Platform session initiated`, type: 'default' },
    { text: `> Device fingerprint detected: ${DEVICE_FINGERPRINT}`, type: 'default' },
    { text: `> Identity state: ANONYMOUS`, type: 'default' },
    { text: `> Behavioral pattern cross-reference initiated...`, type: 'default' },
    { text: `> SD Medicaid claims history lookup: RUNNING`, type: 'default' },
    // Phase 2
    { text: '── PHASE 2: PROBABILISTIC IDENTITY MATCH ─────────────────', type: 'phase', phase: 2 },
    { text: `> Cross-reference complete`, type: 'default' },
    { text: `> Candidate match: ${memberId}`, type: 'amber' },
    { text: `> Confidence score: ${PRE_AUTH_CONFIDENCE} [████████░░]`, type: 'amber' },
    { text: `> Identity state: CANDIDATE · held pending authentication`, type: 'default' },
    { text: `> 4 source identifiers queued for resolution:`, type: 'default' },
    { text: `    SD Medicaid MRN: SD_MBR_MARIA_001`, type: 'indent' },
    { text: `    CAH EHR MRN: MRN-SD-001`, type: 'indent' },
    { text: `    CHIP Guardian ID: SD_CHIP_GUARDIAN_001`, type: 'indent' },
    { text: `    Pharmacy Account: MARTIN_PHARM_MARIA`, type: 'indent' },
    // Phase 3
    { text: '── PHASE 3: SIX SOURCE STREAM INGESTION ──────────────────', type: 'phase', phase: 3 },
    {
      text: `> [SD Medicaid MMIS]       X12 837 EDI  → FHIR ExplanationOfBenefit ✓`,
      type: 'lime',
      cardTrigger: 1,
    },
    {
      text: `> [Bennett County EHR]     HL7 v2.x     → FHIR Patient + Condition ✓`,
      type: 'lime',
      cardTrigger: 2,
    },
    {
      text: `> [SD CHIP Coverage]       X12 837 EDI  → FHIR Patient + Coverage ✓`,
      type: 'lime',
      cardTrigger: 3,
    },
    {
      text: `> [Martin Pharmacy PMS]    NCPDP SCRIPT → FHIR MedicationDispense ✓`,
      type: 'lime',
      cardTrigger: 4,
    },
    {
      text: `> [SD DSS Benefits]        EDI 834+CSV  → FHIR Coverage + Task ✓`,
      type: 'lime',
      cardTrigger: 5,
    },
    { text: `> [SD BH Division]         REST API     → FHIR CarePlan ⚠ 42 CFR Pt 2`, type: 'red' },
    { text: `    > BH consent verified: ACTIVE`, type: 'indent' },
    { text: `    > SD BH Division stream: FHIR EpisodeOfCare ✓`, type: 'lime', cardTrigger: 6 },
    { text: `> Survivorship rules applied:`, type: 'default' },
    { text: `    Clinical > Claims > Pharmacy > DSS Benefits`, type: 'indent' },
    // Phase 4
    { text: '── PHASE 4: IDENTITY PROMOTION ───────────────────────────', type: 'phase', phase: 4 },
    { text: `> Authentication event received`, type: 'default' },
    { text: `> ANONYMOUS → KNOWN promotion triggered`, type: 'amber' },
    {
      text: `> Confidence score: ${PRE_AUTH_CONFIDENCE} → ${POST_AUTH_CONFIDENCE} [█████████░]`,
      type: 'amber',
    },
    { text: `> Identity method: ${IDENTITY_METHOD}`, type: 'default' },
    { text: `> Golden ID locked: ${memberId}`, type: 'amber' },
    { text: `> Session promoted: anon_sess_SD_8821x → known_sess_${memberId}`, type: 'default' },
    { text: `> Identity roles confirmed: ${memberRoles.join(' · ')}`, type: 'default' },
    { text: `> Identity state: ${IDENTITY_STATE_BEFORE} → ${IDENTITY_STATE_AFTER}`, type: 'amber' },
    // Phase 5
    { text: '── PHASE 5: KNOWLEDGE GRAPH ASSEMBLY ─────────────────────', type: 'phase', phase: 5 },
    { text: `> Graph population agent activated`, type: 'default' },
    { text: `> Writing nodes:`, type: 'default' },
    ...graphNodes.map((n) => ({ text: `    ✦ ${n}`, type: 'indent' as LogLineType })),
    { text: `> 52 nodes written · 67 edges created`, type: 'default' },
    { text: `> Consent enforcement: 4 layers checked`, type: 'default' },
    { text: `    Layer 4 (Elena caregiver): PENDING — household view partial`, type: 'indent' },
    // Completion
    { text: completionMessage, type: 'amber' },
    { text: `    52 nodes · 67 edges · 4 roles · 14 streams · <3 minutes`, type: 'indent' },
  ];
}

type CardStatus = 'PENDING' | 'INGESTING' | 'NORMALISING' | 'COMPLETE' | 'CONSENT_CHECK';

const FORMAT_BADGE: Record<string, { bg: string; text: string }> = {
  edi: { bg: '#1e3a5f', text: '#60a5fa' },
  hl7: { bg: '#1a3a2a', text: '#4ade80' },
  rest: { bg: '#2d1b4e', text: '#c084fc' },
  ncpdp: { bg: '#3b1f00', text: '#fb923c' },
  csv: { bg: '#2a2000', text: '#fbbf24' },
  bh: { bg: '#3b0a0a', text: '#f87171' },
};

export default function CdpAssemblyPage() {
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const patient = getPatientSync(activePatientId);
  const MEMBER_NAME = patient?.name ?? 'Maria Redhawk';
  const MEMBER_ID = patient?.platformId ?? 'MARIA_SD_001';
  const MEMBER_LOCATION = patient?.location ?? 'Martin, SD 57551 · Bennett County';
  const MEMBER_ROLES = ['PATIENT', 'PARENT', 'CAREGIVER', 'WORKER'];
  const GOLDEN_RECORD_LABEL = `${MEMBER_ID} · Golden Record Assembled`;
  const COMPLETION_MESSAGE = `✓ Knowledge Graph complete — ${MEMBER_NAME} is now known · 52 nodes · 67 edges`;
  const LOG_LINES = buildLogLines(MEMBER_ID, MEMBER_ROLES, COMPLETION_MESSAGE);

  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [cardStatuses, setCardStatuses] = useState<CardStatus[]>(
    SOURCE_SYSTEMS.map(() => 'PENDING')
  );
  const [statsVisible, setStatsVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAnimation = () => {
    if (running) return;
    setRunning(true);
    setDone(false);
    setVisibleLines(0);
    setCardStatuses(SOURCE_SYSTEMS.map(() => 'PENDING'));
    setStatsVisible(false);
  };

  useEffect(() => {
    if (!running) return;
    if (visibleLines >= LOG_LINES.length) {
      setDone(true);
      setStatsVisible(true);
      setRunning(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      const line = LOG_LINES[visibleLines];

      // Handle card triggers
      if (line.cardTrigger !== undefined) {
        const idx = line.cardTrigger - 1;
        setCardStatuses((prev) => {
          const next = [...prev];
          // Advance through states
          if (next[idx] === 'PENDING') next[idx] = 'INGESTING';
          else if (next[idx] === 'INGESTING') next[idx] = 'NORMALISING';
          else if (next[idx] === 'NORMALISING') next[idx] = 'COMPLETE';
          return next;
        });
        // Schedule NORMALISING → COMPLETE
        setTimeout(() => {
          setCardStatuses((prev) => {
            const next = [...prev];
            if (next[idx] === 'INGESTING') next[idx] = 'NORMALISING';
            return next;
          });
          setTimeout(() => {
            setCardStatuses((prev) => {
              const next = [...prev];
              if (next[idx] === 'NORMALISING') next[idx] = 'COMPLETE';
              return next;
            });
          }, 600);
        }, 400);
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

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [running, visibleLines]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleLines]);

  const getLineColor = (type: LogLineType) => {
    switch (type) {
      case 'amber':
        return '#F59E0B';
      case 'lime':
        return '#84CC16';
      case 'red':
        return '#EF4444';
      case 'phase':
        return '#F59E0B';
      case 'indent':
        return '#94a3b8';
      default:
        return '#e2e8f0';
    }
  };

  const getLineFontWeight = (type: LogLineType) => {
    return type === 'phase' || type === 'amber' ? '700' : '400';
  };

  const getCardStatusConfig = (status: CardStatus) => {
    switch (status) {
      case 'PENDING':
        return { label: 'PENDING', color: '#64748b', bg: '#1e293b', dot: '#475569' };
      case 'INGESTING':
        return { label: 'INGESTING...', color: '#60a5fa', bg: '#1e3a5f', dot: '#3b82f6' };
      case 'NORMALISING':
        return { label: 'NORMALISING', color: '#fbbf24', bg: '#2a1f00', dot: '#f59e0b' };
      case 'COMPLETE':
        return { label: 'COMPLETE ✓', color: '#84CC16', bg: '#1a2e0a', dot: '#84CC16' };
      case 'CONSENT_CHECK':
        return { label: '⚠ CONSENT CHECK', color: '#f87171', bg: '#3b0a0a', dot: '#ef4444' };
    }
  };

  const COMPLETION_STATS = [
    { label: '52 NODES', icon: '◈' },
    { label: '67 EDGES', icon: '⟷' },
    { label: '4 ROLES', icon: '◉' },
    { label: '14 STREAMS', icon: '⇶' },
    { label: '<3 MIN', icon: '◷' },
  ];

  // Determine current phase from visible lines
  const currentPhase = (() => {
    let phase = 0;
    for (let i = 0; i < visibleLines; i++) {
      if (LOG_LINES[i].phase) phase = LOG_LINES[i].phase!;
    }
    return phase;
  })();

  return (
    <AppLayout
      pageTitle="CDP Assembly"
      breadcrumbs={[{ label: 'CDP & Agentic Automation' }, { label: 'CDP Assembly' }]}
    >
      {/* Header strip */}
      <div
        className="mb-5 px-5 py-3 flex items-center justify-between"
        style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}
      >
        <div>
          <p
            style={{
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
              color: '#F59E0B',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            SD RHTP · MEMBER IDENTITY RESOLUTION
          </p>
          <p
            style={{
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
              color: '#94a3b8',
              fontSize: 11,
            }}
          >
            {PROGRAM} · {STATE_AGENCY} · {MEMBER_LOCATION}
          </p>
        </div>
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
            {done ? '↺ REPLAY' : running ? 'RUNNING...' : '▶ RUN ASSEMBLY'}
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
          {/* Terminal title bar */}
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
              sd-rhtp-cdp-assembly — identity-resolution-log
            </span>
          </div>

          {/* Log body */}
          <div
            ref={logRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 16px',
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            {visibleLines === 0 && !running && (
              <p style={{ color: '#475569', fontStyle: 'italic' }}>
                {'>'} Press ▶ RUN ASSEMBLY to begin identity resolution...
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
              <span style={{ color: '#F59E0B', animation: 'blink 1s step-end infinite' }}>█</span>
            )}
          </div>
        </div>

        {/* RIGHT — Source System Cards */}
        <div
          style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}
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
                        42 CFR Pt 2
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
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
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
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}
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
            {/* Converging arrow */}
            <div style={{ textAlign: 'center', color: '#F59E0B', fontSize: 14, marginBottom: 6 }}>
              ↓ ↓ ↓ ↓
            </div>
            {/* Golden record */}
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
