'use client';

import React, { useEffect, useMemo } from 'react';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import MariaStatusStrip from '@/uhg/components/shared/MariaStatusStrip';
import { useDemoStore } from '@/uhg/store/demoStore';
import { contextFor } from '@/uhg/data/citizenContext';

// All four fragmentation layers are derived per active citizen from contextFor(activeCitizenId)
// inside the component (see buildFragmentation). Default = Maria Redhawk.

const ENTITY_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4', '#f97316'];

function abbrev(system: string): string {
  const head = system.split(' · ')[0];
  return head.toUpperCase().slice(0, 14);
}

function buildFragmentation(citizenId: string) {
  const ctx = contextFor(citizenId);
  const first = ctx.name.split(' ')[0];

  // Layer 1 — internal entities (first 5 fragmented source systems)
  const internalEntities = ctx.sources.slice(0, 5).map((s, i) => ({
    id: `ent-${i}`,
    name: s.system.split(' · ')[0],
    abbr: abbrev(s.system),
    color: s.color || ENTITY_COLORS[i % ENTITY_COLORS.length],
    sees: s.sees.slice(0, 3),
    blindTo: s.blindTo,
  }));

  // Layer 2 — six source systems, six versions of the citizen
  const systems = ctx.sources.slice(0, 6).map((s, i) => {
    const isBH = /behavioral|bh|42 cfr/i.test(s.system);
    const isRx = /pharmacy|rx/i.test(s.system);
    return {
      id: `sys-${i}`,
      name: abbrev(s.system),
      color: s.color || ENTITY_COLORS[i % ENTITY_COLORS.length],
      knows: s.sees.slice(0, 3),
      blindSpot: s.blindTo,
      badge: isBH
        ? '42 CFR PART 2'
        : isRx && ctx.household.dependents.length
          ? 'FAMILY HUB'
          : undefined,
    };
  });

  // Layer 3 — roles / personas (patient + caregiver-for + dependent)
  const roles: {
    id: string;
    label: string;
    subtitle?: string;
    color: string;
    bg: string;
    border: string;
    items: string[];
    livesIn: string;
  }[] = [
    {
      id: 'patient',
      label: 'PATIENT',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.07)',
      border: 'rgba(59,130,246,0.30)',
      items: [
        `${ctx.journey.episode} · Day ${ctx.journey.daysActive}`,
        ctx.signals[0]?.label || 'Open care gap',
        ctx.signals[1]?.label || ctx.barriers[0]?.label || 'Risk-stratified',
      ],
      livesIn: 'CAH EHR + Medicaid claims',
    },
  ];
  ctx.household.caregiverFor.slice(0, 1).forEach((cg) =>
    roles.push({
      id: 'caregiver',
      label: 'CAREGIVER',
      subtitle: cg.name,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.07)',
      border: 'rgba(245,158,11,0.30)',
      items: [`${first} is caregiver`, cg.detail, cg.consent],
      livesIn: 'Separate residence · proxy consent',
    })
  );
  ctx.household.dependents.slice(0, 1).forEach((dep) =>
    roles.push({
      id: 'parent',
      label: 'PARENT',
      subtitle: dep.name,
      color: '#ec4899',
      bg: 'rgba(236,72,153,0.07)',
      border: 'rgba(236,72,153,0.30)',
      items: [dep.detail, 'CHIP active', dep.consent],
      livesIn: 'CHIP enrollment only',
    })
  );

  // Layer 4 — whole-person gaps
  const depNames = ctx.household.dependents.map((d) => d.name).join(' & ');
  const cgName = ctx.household.caregiverFor[0]?.name;
  const gaps = [
    {
      label: 'IDENTITY',
      detail: `Records split across ${ctx.sources
        .slice(0, 4)
        .map((s) => s.system.split(' · ')[0])
        .join(', ')} — no single source`,
    },
    {
      label: 'CONSENT',
      detail: `42 CFR Part 2 gates BH${cgName ? `; ${cgName} proxy consent PENDING` : ''}`,
    },
    {
      label: 'RELATIONSHIPS',
      detail:
        depNames || cgName
          ? `${[depNames, cgName].filter(Boolean).join(' & ')} invisible — no household graph`
          : 'No household graph across systems',
    },
    {
      label: 'PREFERENCES',
      detail: `${ctx.channel.primary} (${ctx.channel.window}) known only to outreach log`,
    },
    {
      label: 'CAREGIVER PROXY',
      detail: cgName
        ? `No system aware ${first} has legal proxy for ${cgName}`
        : 'No proxy/relationship awareness across systems',
    },
    {
      label: 'JOURNEY CONTEXT',
      detail: `No system knows she is Day ${ctx.journey.daysActive} ${ctx.journey.episode} — unmanaged`,
    },
    {
      label: 'ROLES',
      detail: `${roles.map((r) => r.label[0] + r.label.slice(1).toLowerCase()).join(' + ')} — never held simultaneously`,
    },
  ];

  return { first, internalEntities, systems, roles, gaps };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FragmentationScreen() {
  const setScreen = useDemoStore((s) => s?.setScreen);
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const {
    first,
    internalEntities: INTERNAL_ENTITIES,
    systems: SYSTEMS,
    roles: ROLES,
    gaps: GAPS,
  } = useMemo(() => buildFragmentation(activeCitizenId), [activeCitizenId]);

  useEffect(() => {
    setScreen?.('fragmentation');
  }, [setScreen]);

  // Up/Down arrow navigation is handled centrally by PresenterControls (ORCHESTRATE_FLOW).

  return (
    <ScreenLayout
      screenId="fragmentation"
      showPhaseArc
      phaseArcState={{ foundation: true, orchestration: false, autonomous: false }}
      showMiniProfile={false}
    >
      <PresenterControls currentScreenId="fragmentation" />
      <MariaStatusStrip state="fragmented" visible />

      {/* Scrollable content */}
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#161616',
          overflowY: 'auto',
          padding: '16px 28px 16px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* Screen label + headline */}
        <div style={{ marginBottom: 10, flexShrink: 0 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#6f6f6f',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            02 &nbsp;&nbsp; THE FRAGMENTED WORLD
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 300,
              color: '#ffffff',
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
              margin: '0 0 4px',
            }}
          >
            One enterprise. Five entities. Zero coordination.
          </h1>
          <p style={{ fontSize: 12, color: '#8d8d8d', margin: 0, lineHeight: 1.5 }}>
            The enterprise that owns the data cannot connect it — inside its own walls.
          </p>
        </div>

        {/* ── LAYER 1: Fragmented SD systems ── */}
        <div style={{ flexShrink: 0, marginBottom: 10 }}>
          <LayerDivider color="#ef4444" label="LAYER 1 — INTERNAL ENTERPRISE FRAGMENTATION" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {INTERNAL_ENTITIES.map((entity) => (
              <div
                key={entity.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 6,
                  border: `1px solid ${entity.color}33`,
                  borderLeft: `3px solid ${entity.color}`,
                  background: 'rgba(22,22,22,0.95)',
                }}
              >
                <div style={{ padding: '10px 12px 6px' }}>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      fontWeight: 700,
                      color: entity.color,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      marginBottom: 2,
                    }}
                  >
                    {entity.abbr}
                  </div>
                  <div style={{ fontSize: 11, color: '#d4d4d4', fontWeight: 500 }}>
                    {entity.name}
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: '0 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      color: '#6f6f6f',
                      letterSpacing: '0.06em',
                      marginBottom: 2,
                    }}
                  >
                    SEES:
                  </div>
                  {entity.sees.map((item) => (
                    <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                      <span style={{ fontSize: 11, color: '#22c55e', marginTop: 1 }}>·</span>
                      <span style={{ fontSize: 10, color: '#c4c4c4', lineHeight: 1.4 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px 12px 10px' }}>
                  <div
                    style={{
                      borderRadius: 4,
                      padding: '5px 8px',
                      background: 'rgba(180,30,30,0.18)',
                      border: '1px solid rgba(220,50,50,0.40)',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 8,
                        fontWeight: 700,
                        color: '#f87171',
                        letterSpacing: '0.05em',
                        marginBottom: 2,
                      }}
                    >
                      BLIND TO:
                    </div>
                    <div style={{ fontSize: 9, color: '#fca5a5', lineHeight: 1.4 }}>
                      {entity.blindTo}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 8,
              borderRadius: 5,
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.20)',
              borderLeft: '3px solid rgba(239,68,68,0.60)',
              padding: '7px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#f87171',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
              }}
            >
              SAME SD MEDICAID PROGRAM
            </span>
            <span style={{ fontSize: 11, color: '#8d8d8d', lineHeight: 1.5 }}>
              Five systems. Same SD Medicaid residents, 47 miles apart. No shared identity graph, no
              consent framework, no coordination layer.
            </span>
          </div>
        </div>

        {/* ── LAYER 2: Six External Systems ── */}
        <div style={{ flexShrink: 0, marginBottom: 10 }}>
          <LayerDivider
            color="#f59e0b"
            label={`LAYER 2 — SIX MORE SD SYSTEMS — SIX MORE VERSIONS OF ${first.toUpperCase()} `}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {SYSTEMS.map((sys) => (
              <div
                key={sys.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 6,
                  border: `1px solid ${sys.color}44`,
                  borderTop: `3px solid ${sys.color}`,
                  background: 'rgba(22,22,22,0.95)',
                }}
              >
                <div
                  style={{
                    padding: '8px 10px 5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      fontWeight: 700,
                      color: sys.color,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {sys.name}
                  </span>
                  {sys.badge && (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 8,
                        color: sys.color,
                        letterSpacing: '0.06em',
                        background: `${sys.color}1a`,
                        border: `1px solid ${sys.color}4d`,
                        borderRadius: 3,
                        padding: '1px 4px',
                      }}
                    >
                      {sys.badge}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: '0 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  {sys.knows.map((item) => (
                    <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                      <span style={{ fontSize: 11, color: '#6f6f6f', marginTop: 1 }}>·</span>
                      <span style={{ fontSize: 10, color: '#d4d4d4', lineHeight: 1.4 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '6px 10px 8px' }}>
                  <div
                    style={{
                      borderRadius: 4,
                      padding: '5px 7px',
                      background: 'rgba(180,30,30,0.18)',
                      border: '1px solid rgba(220,50,50,0.45)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 8,
                        fontWeight: 700,
                        color: '#f87171',
                        letterSpacing: '0.05em',
                      }}
                    >
                      BLIND SPOT: {sys.blindSpot}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── LAYER 3: Persona / Roles ── */}
        <div style={{ flexShrink: 0, marginBottom: 10 }}>
          <LayerDivider color="#a855f7" label="LAYER 3 — THE FRAGMENTATION RUNS DEEPER THAN DATA" />
          <div style={{ display: 'flex', gap: 10 }}>
            {ROLES.map((role) => (
              <div
                key={role.id}
                style={{
                  flex: 1,
                  borderRadius: 6,
                  border: `1px solid ${role.border}`,
                  borderTop: `3px solid ${role.color}`,
                  background: role.bg,
                  padding: '10px 12px',
                }}
              >
                <div style={{ marginBottom: 5 }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 10,
                      fontWeight: 700,
                      color: role.color,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {role.label}
                  </span>
                  {role.subtitle && (
                    <span style={{ fontSize: 10, color: '#8d8d8d', marginLeft: 7 }}>
                      {role.subtitle}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 7 }}>
                  {role.items.map((item) => (
                    <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                      <span style={{ fontSize: 11, color: '#6f6f6f', marginTop: 1 }}>·</span>
                      <span style={{ fontSize: 11, color: '#c4c4c4', lineHeight: 1.4 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    borderRadius: 4,
                    padding: '4px 7px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <span style={{ fontSize: 10, color: '#6f6f6f' }}>Lives in: </span>
                  <span style={{ fontSize: 10, color: '#a3a3a3' }}>{role.livesIn}</span>
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              marginTop: 8,
              textAlign: 'center',
              fontSize: 12,
              color: '#a3a3a3',
              fontStyle: 'italic',
              lineHeight: 1.6,
              marginBottom: 0,
            }}
          >
            No system understands her roles, her{' '}
            <span style={{ color: '#ffffff', fontStyle: 'normal', fontWeight: 600 }}>Personas</span>
            , her relationships, or how those roles change across contexts.
            <br />
            There is no whole-person identity graph — across the county or the state.
          </p>
        </div>

        {/* ── LAYER 4: Gap Checklist ── */}
        <div style={{ flexShrink: 0, marginBottom: 10 }}>
          <LayerDivider
            color="#6f6f6f"
            label="LAYER 4 — WHAT IS MISSING ACROSS ALL SYSTEMS — ABOUT ONE PERSON"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {GAPS.map((gap) => (
              <div
                key={gap.label}
                style={{
                  borderRadius: 5,
                  background: 'rgba(180,30,30,0.10)',
                  border: '1px solid rgba(220,50,50,0.30)',
                  padding: '8px 9px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#f87171',
                      letterSpacing: '0.07em',
                    }}
                  >
                    {gap.label}
                  </span>
                  <span style={{ fontSize: 13, color: '#ef4444', lineHeight: 1 }}>✗</span>
                </div>
                <p style={{ fontSize: 9, color: '#8d8d8d', lineHeight: 1.4, margin: 0 }}>
                  {gap.detail}
                </p>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 10,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderLeft: '3px solid rgba(255,255,255,0.4)',
              padding: '12px 24px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: 14,
                color: '#e5e5e5',
                fontStyle: 'italic',
                lineHeight: 1.65,
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              &quot;Before any agent can act intelligently —
              <br />
              the system must first know who it&apos;s acting for.&quot;
            </p>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: '#6f6f6f',
                  letterSpacing: '0.10em',
                }}
              >
                ↓ ADVANCE TO SEE HOW
              </span>
            </div>
          </div>
        </div>

        {/* Screen counter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginTop: 'auto',
            paddingTop: 8,
            paddingBottom: 4,
            flexShrink: 0,
          }}
        >
          <div style={{ fontFamily: 'monospace', color: '#6f6f6f', fontSize: 12 }}>03 / 19</div>
        </div>
      </div>
    </ScreenLayout>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function LayerDivider({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          background: `${color}14`,
          border: `1px solid ${color}40`,
          borderRadius: 4,
          padding: '3px 10px',
        }}
      >
        {label}
      </span>
      <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  );
}
