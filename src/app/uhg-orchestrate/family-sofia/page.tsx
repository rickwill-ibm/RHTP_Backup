'use client';

import React, { useState, useEffect, useRef } from 'react';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import MariaStatusStrip from '@/uhg/components/shared/MariaStatusStrip';
import { useDemoStore } from '@/uhg/store/demoStore';
import { contextFor } from '@/uhg/data/citizenContext';
import { getPatientById, placeholderMember } from '@/lib/patientRegistry';

// ─── Care gaps ────────────────────────────────────────────────────────────────

interface CareGap {
  id: string;
  label: string;
  urgency: 'critical' | 'high' | 'due';
  detail: string;
  source: string;
}

// Care pathway is derived from the dependent's age so the whole orchestration response adapts
// to who actually depends on the member — a 2-year-old gets a pediatric well-child path, a
// 20-year-old gets adult primary care, an 80-year-old gets geriatric chronic-care coordination.
type DepPathway = 'pediatric-young' | 'pediatric-school' | 'adult' | 'elder';
function pathwayFor(age: number): DepPathway {
  if (age >= 65) return 'elder';
  if (age >= 18) return 'adult';
  if (age >= 6) return 'pediatric-school';
  return 'pediatric-young';
}
function gapSourceFor(p: DepPathway): string {
  if (p === 'elder') return 'Geriatric / chronic-care schedule';
  if (p === 'adult') return 'Adult HEDIS / chronic-care schedule';
  return 'Pediatric / HEDIS schedule';
}

function buildSofiaGaps(
  dep:
    { gaps: { label: string; urgency: 'critical' | 'high' | 'due'; detail: string }[] } | undefined,
  pathway: DepPathway
): CareGap[] {
  if (!dep) return [];
  const source = gapSourceFor(pathway);
  return dep.gaps.map((g, i) => ({
    id: `sg-${i}`,
    label: g.label,
    urgency: g.urgency,
    detail: g.detail,
    source,
  }));
}

// ─── Orchestration actions ────────────────────────────────────────────────────

interface OrchAction {
  id: string;
  label: string;
  detail: string;
  status: 'complete' | 'pending' | 'active';
  color: string;
}

const GREEN = '#42be65';
const AMBER = '#f59e0b';
const BLUE = '#78a9ff';

// Gap-driven and generic: the lead PCP action + closing visit/review action are chosen by care
// pathway, and one orchestration action is generated per identified dependent gap. The response
// adapts to whatever gaps any current or future dependent actually has — no hardcoded conditions.
// Maria's authored Sophia pediatric walkthrough is the one byte-identical special case.
function buildOrchActions(
  pathway: DepPathway,
  firstName: string,
  depName: string,
  depFirst: string,
  org: string,
  gaps: { label: string; detail: string }[],
  outreach?: string
): OrchAction[] {
  if (depName === 'No dependent on file') return [];
  const combined: OrchAction = {
    id: 'oa-outreach',
    label: 'Combined Outreach Sent',
    detail: outreach ?? `${firstName} + ${depFirst} — one message, two members`,
    status: 'active',
    color: BLUE,
  };

  // Authored Maria/Sophia pediatric walkthrough — preserved verbatim.
  if (pathway === 'pediatric-young') {
    return [
      {
        id: 'oa-pcp',
        label: 'Pediatrician Recommended',
        detail: `${org} · Pediatrics · 0 mi · Accepting`,
        status: 'complete',
        color: GREEN,
      },
      {
        id: 'oa-visit',
        label: 'Well Visit Scheduled',
        detail: `Pending ${firstName} confirmation — combined with the open care window`,
        status: 'pending',
        color: AMBER,
      },
      {
        id: 'oa-screen',
        label: 'Screening Bundle Created',
        detail: 'Age-appropriate screenings bundled at a single visit',
        status: 'complete',
        color: GREEN,
      },
      {
        id: 'oa-imm',
        label: 'Immunization Schedule Generated',
        detail: 'Coordinated with the well-visit appointment',
        status: 'complete',
        color: GREEN,
      },
      {
        id: 'oa-outreach',
        label: 'Combined Outreach Sent',
        detail: outreach ?? `${firstName} + ${depName} — one SMS, one outreach`,
        status: 'active',
        color: BLUE,
      },
    ];
  }

  // Lead primary-care action, by pathway.
  const pcp: OrchAction =
    pathway === 'elder'
      ? {
          id: 'oa-pcp',
          label: 'Primary Care Confirmed',
          detail: `${org} · Internal Medicine · Established`,
          status: 'complete',
          color: GREEN,
        }
      : pathway === 'adult'
        ? {
            id: 'oa-pcp',
            label: 'Primary Care Re-established',
            detail: `${org} · Family Medicine · Accepting`,
            status: 'complete',
            color: GREEN,
          }
        : {
            id: 'oa-pcp',
            label: 'Pediatrician Recommended',
            detail: `${org} · Pediatrics · Accepting`,
            status: 'complete',
            color: GREEN,
          };

  // One orchestration action per identified dependent gap (data-driven, future-proof).
  const gapActions: OrchAction[] = gaps.map((g, i) => ({
    id: `oa-gap-${i}`,
    label: g.label,
    detail: g.detail,
    status: 'complete' as const,
    color: GREEN,
  }));

  // Closing scheduling action, by pathway.
  const schedule: OrchAction =
    pathway === 'elder'
      ? {
          id: 'oa-med',
          label: 'Medication Review Scheduled',
          detail: `Polypharmacy reconciliation — caregiver ${firstName} looped in`,
          status: 'pending',
          color: AMBER,
        }
      : pathway === 'adult'
        ? {
            id: 'oa-visit',
            label: 'Annual Wellness Visit Scheduled',
            detail: `Pending ${firstName} confirmation — adult PCP visit`,
            status: 'pending',
            color: AMBER,
          }
        : {
            id: 'oa-visit',
            label: 'Well-Child Visit Scheduled',
            detail: `Pending ${firstName} confirmation — bundled with the open care window`,
            status: 'pending',
            color: AMBER,
          };

  const actions: OrchAction[] = [pcp, ...gapActions, schedule];
  if (pathway === 'elder') {
    actions.push({
      id: 'oa-cg',
      label: 'Caregiver Support Linked',
      detail: `${firstName} enrolled in caregiver support — respite + coordination`,
      status: 'complete',
      color: GREEN,
    });
  }
  actions.push(combined);
  return actions;
}

// ─── Recommended provider (specialty matches the dependent's care pathway) ──────

interface RecProvider {
  label: string;
  name: string;
  org: string;
  rating: string;
  dist: string;
}
function recommendedProvider(pathway: DepPathway, depName: string, org: string): RecProvider {
  const hash = depName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const pick = (arr: string[]) => arr[hash % arr.length];
  const rating = (4.6 + (hash % 4) * 0.1).toFixed(1);
  const dist = `${(0.4 + (hash % 18) * 0.1).toFixed(1)} mi away`;
  if (pathway === 'elder')
    return {
      label: 'RECOMMENDED PRIMARY CARE',
      name: pick(['Dr. Helen Morris', 'Dr. George Aldridge', 'Dr. Nadia Khan']),
      org,
      rating,
      dist,
    };
  if (pathway === 'adult')
    return {
      label: 'RECOMMENDED PRIMARY CARE',
      name: pick(['Dr. Daniel Cruz', 'Dr. Olivia Reed', 'Dr. Samuel Tate']),
      org,
      rating,
      dist,
    };
  return {
    label: 'RECOMMENDED PEDIATRICIAN',
    name: pick(['Dr. Priya Nair', 'Dr. Marcus Lee', 'Dr. Anna Becker']),
    org,
    rating,
    dist,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FamilySophiaScreen() {
  const setScreen = useDemoStore((s) => s.setScreen);
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const __reg = getPatientById(activeCitizenId) ?? placeholderMember(activeCitizenId);
  const __ctx = contextFor(activeCitizenId);
  const __firstName = __reg.name.split(' ')[0];
  const __dep = __ctx.household.dependents[0];
  const __depName = __dep ? __dep.name : 'No dependent on file';
  const __depInitials = __dep
    ? __dep.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '—';
  const __depRec = __reg.household?.dependents?.[0];
  const __depFirst = __depRec ? __depRec.name.split(' ')[0] : __depName.split(' ')[0];
  const __org = __reg.organization.replace(/ \(.*\)/, '');
  const __pathway = pathwayFor(__depRec?.age ?? 2);
  // Maria's authored Sophia walkthrough stays byte-identical (pediatric pathway + Dr. Amy Patel).
  const __isSophia = __depRec?.name === 'Sophia Redhawk';
  const SOFIA_GAPS = buildSofiaGaps(__depRec, __pathway);
  const ORCH_ACTIONS = buildOrchActions(
    __pathway,
    __firstName,
    __depName,
    __depFirst,
    __org,
    __depRec?.gaps ?? [],
    __depRec?.coordinatedOutreach
  );
  const __recProvider: RecProvider = __isSophia
    ? {
        label: 'RECOMMENDED PEDIATRICIAN',
        name: 'Dr. Amy Patel',
        org: __org,
        rating: '4.8',
        dist: '0.8 mi away',
      }
    : recommendedProvider(__pathway, __depName, __org);
  const [sofiaReveal, setSophiaReveal] = useState(false);
  const [gapsReveal, setGapsReveal] = useState(false);
  const [orchReveal, setOrchReveal] = useState(false);
  const [closingReveal, setClosingReveal] = useState(false);
  const [visibleGaps, setVisibleGaps] = useState(0);
  const [visibleOrch, setVisibleOrch] = useState(0);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setScreen('family-sofia');

    const t1 = setTimeout(() => setSophiaReveal(true), 400);
    const t2 = setTimeout(() => setGapsReveal(true), 1000);

    // Reveal gaps one by one
    SOFIA_GAPS.forEach((_, i) => {
      const t = setTimeout(() => setVisibleGaps(i + 1), 1200 + i * 250);
      timerRefs.current.push(t);
    });

    const t3 = setTimeout(() => setOrchReveal(true), 1200 + SOFIA_GAPS.length * 250 + 200);

    // Reveal orch actions one by one
    ORCH_ACTIONS.forEach((_, i) => {
      const t = setTimeout(
        () => setVisibleOrch(i + 1),
        1200 + SOFIA_GAPS.length * 250 + 500 + i * 300
      );
      timerRefs.current.push(t);
    });

    const t4 = setTimeout(
      () => setClosingReveal(true),
      1200 + SOFIA_GAPS.length * 250 + 500 + ORCH_ACTIONS.length * 300 + 400
    );

    timerRefs.current.push(t1, t2, t3, t4);
    return () => timerRefs.current.forEach(clearTimeout);
  }, [setScreen]);

  const urgencyColor = (u: CareGap['urgency']) =>
    u === 'critical' ? '#fa4d56' : u === 'high' ? '#f59e0b' : '#78a9ff';

  const urgencyLabel = (u: CareGap['urgency']) =>
    u === 'critical' ? 'CRITICAL' : u === 'high' ? 'HIGH' : 'DUE';

  return (
    <ScreenLayout
      screenId="family-sofia"
      showPhaseArc
      phaseArcState={{ foundation: true, orchestration: true, autonomous: true }}
      showMiniProfile
    >
      <PresenterControls currentScreenId="family-sofia" />

      <MariaStatusStrip
        state="resolved"
        authStatus="✓ Submitted"
        careGapStatus="✓ In Progress"
        episodeStatus={__reg.episodeType}
        visible
      />

      <div
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{ top: 36, background: '#161616' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3"
          style={{ borderBottom: '1px solid rgba(57,57,57,0.6)', background: '#1c1c1c' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="rounded px-3 py-1.5 flex items-center gap-2"
              style={{
                background: 'rgba(250,77,86,0.12)',
                border: '1px solid rgba(250,77,86,0.4)',
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: '#fa4d56',
                  animation: 'authPulse 2s ease-in-out infinite',
                }}
              />
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '11px', color: '#fa4d56', letterSpacing: '0.1em' }}
              >
                FAMILY THREAD — DEPENDENT INTELLIGENCE
              </span>
            </div>
            <span className="text-white font-semibold" style={{ fontSize: '20px' }}>
              {__dep
                ? `${__firstName} has a dependent — ${__depName}. The system already found them.`
                : `${__firstName} — household dependent intelligence`}
            </span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">
          {/* Left: Sophia profile + gaps */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ width: '45%', borderRight: '1px solid rgba(57,57,57,0.5)' }}
          >
            {/* Sophia identity card */}
            {sofiaReveal && (
              <div
                className="flex-shrink-0 mx-5 mt-4 mb-3 rounded p-4 flex items-start gap-4 fade-in"
                style={{
                  background: 'rgba(250,77,86,0.06)',
                  border: '1px solid rgba(250,77,86,0.35)',
                  borderLeft: '3px solid #fa4d56',
                }}
              >
                <div
                  className="rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 48,
                    height: 48,
                    background: 'rgba(250,77,86,0.15)',
                    border: '2px solid #fa4d56',
                  }}
                >
                  <span className="font-bold text-white" style={{ fontSize: '16px' }}>
                    {__depInitials}
                  </span>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white" style={{ fontSize: '18px' }}>
                      {__depName}
                    </span>
                    <div
                      className="rounded px-2 py-0.5"
                      style={{
                        background: 'rgba(120,169,255,0.15)',
                        border: '1px solid rgba(120,169,255,0.4)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '10px', color: '#78a9ff' }}>
                        DEPENDENT
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span style={{ fontSize: '12px', color: '#8d8d8d' }}>
                      {__depRec
                        ? `${__depRec.plan} · Age ${__depRec.age} · DOB ${__depRec.dob}`
                        : 'No dependent on file for this member'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      style={{ fontSize: '11px', color: '#fa4d56' }}
                    >{`Dependent of ${__reg.name} (${__reg.platformId})`}</span>
                    <span style={{ fontSize: '11px', color: '#6f6f6f' }}>
                      · Identified via family record
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Gap header */}
            {gapsReveal && (
              <div
                className="flex-shrink-0 px-5 py-2 flex items-center justify-between"
                style={{
                  borderBottom: '1px solid rgba(57,57,57,0.5)',
                  borderTop: '1px solid rgba(57,57,57,0.5)',
                }}
              >
                <span
                  className="font-mono uppercase tracking-wider"
                  style={{ fontSize: '10px', color: '#fa4d56', letterSpacing: '0.12em' }}
                >
                  CARE GAPS IDENTIFIED — {SOFIA_GAPS.length} OPEN
                </span>
                <div
                  className="rounded px-2 py-0.5"
                  style={{
                    background: 'rgba(250,77,86,0.12)',
                    border: '1px solid rgba(250,77,86,0.35)',
                  }}
                >
                  <span className="font-mono" style={{ fontSize: '10px', color: '#fa4d56' }}>
                    PROACTIVE DISCOVERY
                  </span>
                </div>
              </div>
            )}

            {/* Gap list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2 min-h-0">
              {SOFIA_GAPS.slice(0, visibleGaps).map((gap, i) => {
                const col = urgencyColor(gap.urgency);
                return (
                  <div
                    key={gap.id}
                    className="rounded p-3 flex flex-col gap-1.5 transition-all duration-400"
                    style={{
                      background: `${col}08`,
                      border: `1px solid ${col}30`,
                      opacity: 1,
                      transform: 'translateX(0)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="font-semibold"
                        style={{ fontSize: '13px', color: '#f4f4f4' }}
                      >
                        {gap.label}
                      </span>
                      <div
                        className="rounded px-1.5 py-0.5"
                        style={{ background: `${col}15`, border: `1px solid ${col}40` }}
                      >
                        <span
                          className="font-mono"
                          style={{ fontSize: '9px', color: col, letterSpacing: '0.08em' }}
                        >
                          {urgencyLabel(gap.urgency)}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#8d8d8d', lineHeight: 1.4 }}>
                      {gap.detail}
                    </span>
                    <span className="font-mono" style={{ fontSize: '10px', color: '#4b5563' }}>
                      Source: {gap.source}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Orchestration response */}
          <div className="flex flex-col overflow-hidden" style={{ flex: 1 }}>
            {orchReveal && (
              <div
                className="flex-shrink-0 px-5 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(57,57,57,0.5)', background: '#1c1c1c' }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="rounded-full"
                    style={{
                      width: 8,
                      height: 8,
                      background: '#42be65',
                      animation: 'authPulse 2s ease-in-out infinite',
                    }}
                  />
                  <span
                    className="font-mono uppercase tracking-wider"
                    style={{ fontSize: '10px', color: '#42be65', letterSpacing: '0.12em' }}
                  >
                    ORCHESTRATION RESPONSE
                  </span>
                </div>
                <span className="font-mono" style={{ fontSize: '11px', color: '#8d8d8d' }}>
                  Autonomous · No referral needed
                </span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
              {ORCH_ACTIONS.slice(0, visibleOrch).map((action) => {
                const statusIcon =
                  action.status === 'complete' ? '✓' : action.status === 'active' ? '◉' : '◌';
                return (
                  <div
                    key={action.id}
                    className="rounded p-3 flex items-start gap-3 fade-in"
                    style={{
                      background: `${action.color}08`,
                      border: `1px solid ${action.color}30`,
                    }}
                  >
                    <div
                      className="rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        width: 22,
                        height: 22,
                        background: `${action.color}15`,
                        border: `1px solid ${action.color}`,
                      }}
                    >
                      <span style={{ fontSize: '11px', color: action.color }}>{statusIcon}</span>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-semibold"
                          style={{ fontSize: '13px', color: '#f4f4f4' }}
                        >
                          {action.label}
                        </span>
                        <div
                          className="rounded px-1.5 py-0.5"
                          style={{
                            background: `${action.color}15`,
                            border: `1px solid ${action.color}40`,
                          }}
                        >
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '9px',
                              color: action.color,
                              letterSpacing: '0.08em',
                            }}
                          >
                            {action.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#8d8d8d', lineHeight: 1.4 }}>
                        {action.detail}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Recommended provider */}
              {visibleOrch >= 1 && (
                <div
                  className="rounded p-4 flex flex-col gap-2 fade-in"
                  style={{
                    background: 'rgba(66,190,101,0.06)',
                    border: '1px solid rgba(66,190,101,0.3)',
                  }}
                >
                  <span
                    className="font-mono uppercase"
                    style={{ fontSize: '9px', color: '#42be65', letterSpacing: '0.1em' }}
                  >
                    {__recProvider.label}
                  </span>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white" style={{ fontSize: '15px' }}>
                        {__recProvider.name}
                      </span>
                      <span style={{ fontSize: '12px', color: '#42be65' }}>
                        {__recProvider.org}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono" style={{ fontSize: '13px', color: '#f1c21b' }}>
                        ★ {__recProvider.rating}
                      </span>
                      <span style={{ fontSize: '11px', color: '#8d8d8d' }}>
                        {__recProvider.dist}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="rounded px-2 py-0.5"
                      style={{
                        background: 'rgba(66,190,101,0.15)',
                        border: '1px solid rgba(66,190,101,0.4)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '10px', color: '#42be65' }}>
                        IN-NETWORK
                      </span>
                    </div>
                    <div
                      className="rounded px-2 py-0.5"
                      style={{
                        background: 'rgba(66,190,101,0.1)',
                        border: '1px solid rgba(66,190,101,0.3)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: '10px', color: '#42be65' }}>
                        ACCEPTING NEW PATIENTS
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Closing statement */}
              {closingReveal && (
                <div
                  className="rounded p-4 fade-in"
                  style={{
                    background: 'rgba(38,38,38,0.6)',
                    border: '1px solid rgba(57,57,57,0.6)',
                    borderLeft: '3px solid #fa4d56',
                  }}
                >
                  <p
                    style={{
                      fontSize: '15px',
                      color: '#c6c6c6',
                      lineHeight: 1.7,
                      fontStyle: 'italic',
                    }}
                  >
                    {`"The system doesn't just understand ${__firstName}. It understands everyone who depends on them."`}
                  </p>
                  <p
                    className="mt-2"
                    style={{ fontSize: '12px', color: '#6f6f6f', lineHeight: 1.5 }}
                  >
                    Family record traversal · Dependent gap identification · Coordinated outreach —
                    one message for two members.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Screen indicator */}
        <div
          className="absolute bottom-4 right-6 z-10 font-mono"
          style={{ color: '#6f6f6f', fontSize: '12px' }}
        >
          14 / 19
        </div>
      </div>
    </ScreenLayout>
  );
}
