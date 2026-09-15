'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import MariaStatusStrip from '@/uhg/components/shared/MariaStatusStrip';
import { useDemoStore } from '@/uhg/store/demoStore';
import { scenarioFor, type ScNode, type ScEdge } from '@/uhg/data/scenarioRegistry';

// Source records, resolution log, and knowledge-graph subgraph are now sourced per active
// citizen from scenarioFor(activeCitizenId). See src/uhg/data/scenarioRegistry.ts.

// ─── Assembly Graph SVG ───────────────────────────────────────────────────────

function AssemblyGraph({
  nodes,
  edges,
  visibleNodes,
  visibleEdges,
  tick,
}: {
  nodes: ScNode[];
  edges: ScEdge[];
  visibleNodes: Set<string>;
  visibleEdges: Set<string>;
  tick: number;
}) {
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox="0 0 900 560"
      style={{ width: '100%', height: '100%', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <style>{`
          @keyframes dashMove { to { stroke-dashoffset: -20; } }
          .edge-anim { animation: dashMove 1.2s linear infinite; }
          @keyframes nodeIn { from { opacity:0; transform:scale(0.4); } to { opacity:1; transform:scale(1); } }
          .node-in { animation: nodeIn 0.5s ease forwards; }
          @keyframes mariaPulse { 0%,100% { opacity:0.3; } 50% { opacity:0.55; } }
          .maria-pulse { animation: mariaPulse 2.2s ease-in-out infinite; }
        `}</style>
        {nodes.map((n) => (
          <radialGradient key={`g-${n.id}`} id={`g-${n.id}`} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor={n.color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={n.color} stopOpacity="0.1" />
          </radialGradient>
        ))}
      </defs>
      <rect width={900} height={560} fill="#161616" />

      {/* Edges */}
      {edges.map((edge) => {
        if (!visibleEdges.has(edge.id)) return null;
        const fn = nodeMap[edge.from];
        const tn = nodeMap[edge.to];
        if (!fn || !tn) return null;
        const dx = tn.x - fn.x;
        const dy = tn.y - fn.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const x1 = fn.x + ux * fn.r;
        const y1 = fn.y + uy * fn.r;
        const x2 = tn.x - ux * tn.r;
        const y2 = tn.y - uy * tn.r;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        return (
          <g key={edge.id}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={edge.color}
              strokeWidth={2}
              strokeOpacity={0.8}
              strokeDasharray="7 4"
              className="edge-anim"
            />
            <rect
              x={mx - 52}
              y={my - 9}
              width={104}
              height={14}
              rx={3}
              fill="#1a1a1a"
              fillOpacity={0.9}
              stroke={edge.color}
              strokeOpacity={0.3}
              strokeWidth={0.5}
            />
            <text
              x={mx}
              y={my + 2}
              textAnchor="middle"
              fill={edge.color}
              fontSize={8}
              fontFamily='"IBM Plex Mono", monospace'
              fontWeight="600"
              letterSpacing="0.04em"
            >
              {edge.label}
            </text>
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        if (!visibleNodes.has(node.id)) return null;
        const pulseFactor = node.isCenter ? 1 + 0.03 * Math.sin(tick * 0.05) : 1;
        const r = node.r * pulseFactor;
        return (
          <g key={node.id} className="node-in">
            {node.isCenter && (
              <circle
                cx={node.x}
                cy={node.y}
                r={r * 2}
                fill={node.color}
                fillOpacity={0.07}
                className="maria-pulse"
              />
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r={r}
              fill={`url(#g-${node.id})`}
              stroke={node.color}
              strokeWidth={node.isCenter ? 3 : 2}
            />
            {node.isCenter && (
              <circle
                cx={node.x}
                cy={node.y}
                r={r + 8}
                fill="none"
                stroke={node.color}
                strokeWidth={1}
                strokeOpacity={0.3}
                strokeDasharray="4 4"
              />
            )}
            <text
              x={node.x}
              y={node.y + r + (node.isCenter ? 20 : 15)}
              textAnchor="middle"
              fill={node.isCenter ? '#ffffff' : '#f4f4f4'}
              fontSize={node.isCenter ? 15 : 11}
              fontFamily='"IBM Plex Sans", sans-serif'
              fontWeight={node.isCenter ? '700' : '600'}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Instrumentation Tier Data ────────────────────────────────────────────────

const INSTRUMENTATION_TIERS = [
  {
    tier: 'Tier 1',
    label: 'Event-Native',
    pct: '15%',
    color: '#42be65',
    desc: 'Modern APIs · Kafka-ready · low instrumentation cost',
    examples: 'RHTP Care Management portal, Auth API, pharmacy fill events',
    approach: 'Direct Kafka producer, schema registry enrollment',
    latency: '<5 min',
  },
  {
    tier: 'Tier 2',
    label: 'Batch-Extractable',
    pct: '55%',
    color: '#f59e0b',
    desc: 'Legacy systems · nightly/hourly batch · CDC patterns',
    examples: 'Claims adjudication, H1ab care tasks, eligibility',
    approach: 'Debezium CDC → Kafka → FHIR transformation layer',
    latency: '15 min – 4 hr',
  },
  {
    tier: 'Tier 3',
    label: 'Dark Data',
    pct: '30%',
    color: '#fa4d56',
    desc: 'No API · no event stream · paper/fax/manual entry',
    examples: 'Specialist notes, out-of-network claims, provider attestations',
    approach: 'NLP extraction pipeline → structured event',
    latency: '24 – 48 hr',
  },
];

const LATENCY_REQUIREMENTS = [
  {
    signal: 'AUTH_EXPIRY',
    latency: '<5 min',
    reason: 'Operational SLA breach risk',
    color: '#fa4d56',
  },
  {
    signal: 'DUPLICATE_THERAPY',
    latency: '<15 min',
    reason: 'Patient safety threshold',
    color: '#fa4d56',
  },
  {
    signal: 'CARE_GAP',
    latency: '<4 hr',
    reason: 'Clinical coordination window',
    color: '#f59e0b',
  },
  {
    signal: 'SDOH_SIGNAL',
    latency: '<24 hr',
    reason: 'Intervention planning cycle',
    color: '#78a9ff',
  },
  { signal: 'BEHAVIORAL', latency: '<1 hr', reason: 'Engagement window capture', color: '#42be65' },
];

const DATA_PRODUCTS = [
  {
    name: 'auth-expiry-events',
    owner: 'SD Medicaid Auth Domain',
    sla: '<5 min',
    consumers: 'Controller · Governance',
  },
  {
    name: 'care-gap-signals',
    owner: 'Clinical Care Domain',
    sla: '<4 hr',
    consumers: 'Agent Coalition · SD Medicaid quality',
  },
  {
    name: 'claims-episode-events',
    owner: 'SD Medicaid Claims Domain',
    sla: '<15 min',
    consumers: 'CDP · Risk Engine',
  },
  {
    name: 'rx-fill-events',
    owner: 'Pharmacy Network Domain',
    sla: '<15 min',
    consumers: 'Polypharmacy Agent · CDP',
  },
  {
    name: 'sdoh-behavioral-signals',
    owner: 'Behavioral Insight Domain',
    sla: '<1 hr',
    consumers: 'SDOH Agent · Graph',
  },
];

// ─── Practitioner Panel ───────────────────────────────────────────────────────

function PractitionerPanel({ dataProductsLine }: { dataProductsLine: string }) {
  const [activeTab, setActiveTab] = useState<'tiers' | 'latency' | 'products'>('tiers');

  return (
    <div
      className="flex-shrink-0 flex flex-col"
      style={{ height: 260, borderTop: '1px solid rgba(57,57,57,0.5)', background: '#141414' }}
    >
      {/* Tab bar */}
      <div
        className="flex-shrink-0 flex items-center gap-0"
        style={{ borderBottom: '1px solid rgba(57,57,57,0.5)', background: '#1a1a1a' }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2 border-r"
          style={{ borderColor: 'rgba(57,57,57,0.5)' }}
        >
          <div className="rounded-full" style={{ width: 6, height: 6, background: '#f59e0b' }} />
          <span
            className="font-mono uppercase"
            style={{ fontSize: '9px', color: '#f59e0b', letterSpacing: '0.14em' }}
          >
            PRACTITIONER DEPTH
          </span>
        </div>
        {[
          { id: 'tiers' as const, label: 'SOURCE INSTRUMENTATION' },
          { id: 'latency' as const, label: 'LATENCY REQUIREMENTS' },
          { id: 'products' as const, label: 'DATA PRODUCT PATTERN' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 transition-all duration-200"
            style={{
              background: activeTab === tab.id ? 'rgba(245,158,11,0.12)' : 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #f59e0b' : '2px solid transparent',
              color: activeTab === tab.id ? '#f59e0b' : '#6f6f6f',
              fontSize: '10px',
              fontFamily: '"IBM Plex Mono", monospace',
              letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {/* Tier model */}
        {activeTab === 'tiers' && (
          <div className="h-full overflow-y-auto px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-3 mb-1">
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '10px', color: '#f59e0b', letterSpacing: '0.1em' }}
              >
                THE INSTRUMENTATION CHALLENGE — 300+ APPLICATIONS
              </span>
            </div>
            <div className="flex gap-3">
              {INSTRUMENTATION_TIERS.map((tier) => (
                <div
                  key={tier.tier}
                  className="flex-1 rounded p-3 flex flex-col gap-1.5"
                  style={{
                    background: `${tier.color}0a`,
                    border: `1px solid ${tier.color}30`,
                    borderLeft: `3px solid ${tier.color}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '11px', color: tier.color, letterSpacing: '0.08em' }}
                    >
                      {tier.tier} — {tier.label}
                    </span>
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '14px', color: tier.color }}
                    >
                      {tier.pct}
                    </span>
                  </div>
                  <p style={{ fontSize: '10px', color: '#8d8d8d', lineHeight: 1.5 }}>{tier.desc}</p>
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex gap-1.5">
                      <span
                        className="font-mono flex-shrink-0"
                        style={{ fontSize: '9px', color: '#6f6f6f', width: 60 }}
                      >
                        EXAMPLES
                      </span>
                      <span style={{ fontSize: '10px', color: '#c6c6c6', lineHeight: 1.4 }}>
                        {tier.examples}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <span
                        className="font-mono flex-shrink-0"
                        style={{ fontSize: '9px', color: '#6f6f6f', width: 60 }}
                      >
                        APPROACH
                      </span>
                      <span style={{ fontSize: '10px', color: '#c6c6c6', lineHeight: 1.4 }}>
                        {tier.approach}
                      </span>
                    </div>
                    <div className="flex gap-1.5 mt-0.5">
                      <span
                        className="font-mono flex-shrink-0"
                        style={{ fontSize: '9px', color: '#6f6f6f', width: 60 }}
                      >
                        LATENCY
                      </span>
                      <span
                        className="font-mono font-semibold"
                        style={{ fontSize: '10px', color: tier.color }}
                      >
                        {tier.latency}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="rounded px-3 py-2 mt-1"
              style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.25)',
              }}
            >
              <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                Not 300 applications. <strong>{dataProductsLine}</strong> We are not asking you to
                rearchitect your estate — we are asking you to identify the products that matter and
                build from there.
              </span>
            </div>
          </div>
        )}

        {/* Latency requirements */}
        {activeTab === 'latency' && (
          <div className="h-full overflow-y-auto px-4 py-3 flex flex-col gap-2">
            <span
              className="font-mono font-semibold"
              style={{ fontSize: '10px', color: '#f59e0b', letterSpacing: '0.1em' }}
            >
              EVENT LATENCY REQUIREMENTS BY SIGNAL TYPE
            </span>
            <div className="flex flex-col gap-1.5">
              {LATENCY_REQUIREMENTS.map((req) => (
                <div
                  key={req.signal}
                  className="flex items-center gap-4 rounded px-3 py-2"
                  style={{ background: `${req.color}08`, border: `1px solid ${req.color}25` }}
                >
                  <span
                    className="font-mono font-semibold flex-shrink-0"
                    style={{
                      fontSize: '11px',
                      color: req.color,
                      width: 160,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {req.signal}
                  </span>
                  <span
                    className="font-mono font-bold flex-shrink-0"
                    style={{ fontSize: '13px', color: req.color, width: 80 }}
                  >
                    {req.latency}
                  </span>
                  <span style={{ fontSize: '11px', color: '#8d8d8d' }}>— {req.reason}</span>
                </div>
              ))}
            </div>
            <div
              className="rounded px-3 py-2 mt-1"
              style={{
                background: 'rgba(66,190,101,0.08)',
                border: '1px solid rgba(66,190,101,0.25)',
              }}
            >
              <span style={{ fontSize: '11px', color: '#42be65' }}>
                Latency SLAs are contractual commitments per data product — not aspirational
                targets. Each signal type has a named domain owner accountable for SLA adherence.
              </span>
            </div>
          </div>
        )}

        {/* Data product pattern */}
        {activeTab === 'products' && (
          <div className="h-full overflow-y-auto px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '10px', color: '#f59e0b', letterSpacing: '0.1em' }}
              >
                CDP IS NOT A PIPELINE — IT IS A DATA PRODUCT ESTATE
              </span>
              <span className="font-mono" style={{ fontSize: '10px', color: '#6f6f6f' }}>
                14 products in scope · Phase 1
              </span>
            </div>
            <div
              className="rounded px-3 py-2 mb-1"
              style={{
                background: 'rgba(120,169,255,0.08)',
                border: '1px solid rgba(120,169,255,0.25)',
              }}
            >
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'Owner', desc: 'Named domain team' },
                  { label: 'SLA', desc: 'Latency + freshness + quality' },
                  { label: 'Consumer', desc: 'Agent coalition + governance' },
                  { label: 'Schema', desc: 'Versioned Avro in registry' },
                  { label: 'Lineage', desc: 'Full source-to-graph trace' },
                ].map((attr) => (
                  <div key={attr.label} className="flex items-center gap-1.5">
                    <span
                      className="font-mono font-semibold"
                      style={{ fontSize: '10px', color: '#78a9ff' }}
                    >
                      {attr.label}:
                    </span>
                    <span style={{ fontSize: '10px', color: '#8d8d8d' }}>{attr.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {DATA_PRODUCTS.map((dp) => (
                <div
                  key={dp.name}
                  className="flex items-center gap-3 rounded px-3 py-1.5"
                  style={{
                    background: 'rgba(38,38,38,0.8)',
                    border: '1px solid rgba(57,57,57,0.6)',
                  }}
                >
                  <span
                    className="font-mono font-semibold flex-shrink-0"
                    style={{ fontSize: '10px', color: '#42be65', width: 200 }}
                  >
                    {dp.name}
                  </span>
                  <span
                    className="flex-shrink-0"
                    style={{ fontSize: '10px', color: '#8d8d8d', width: 160 }}
                  >
                    {dp.owner}
                  </span>
                  <span
                    className="font-mono font-semibold flex-shrink-0"
                    style={{ fontSize: '10px', color: '#f59e0b', width: 70 }}
                  >
                    {dp.sla}
                  </span>
                  <span style={{ fontSize: '10px', color: '#6f6f6f' }}>{dp.consumers}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CDPAssemblySplit() {
  const setScreen = useDemoStore((s) => s.setScreen);
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const sc = useMemo(() => scenarioFor(activeCitizenId), [activeCitizenId]);
  const [visibleNodes, setVisibleNodes] = useState<Set<string>>(new Set());
  const [visibleEdges, setVisibleEdges] = useState<Set<string>>(new Set());
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [complete, setComplete] = useState(false);
  const [tick, setTick] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    setScreen('cdp-assembly');

    // Reset assembly state whenever the active citizen changes
    setVisibleNodes(new Set());
    setVisibleEdges(new Set());
    setLogEntries([]);
    setComplete(false);

    // Tick for SVG animation
    let t = 0;
    const animate = () => {
      t++;
      setTick(t);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    // Schedule node appearances
    sc.kgNodes.forEach((node) => {
      const timer = setTimeout(() => {
        setVisibleNodes((prev) => new Set([...prev, node.id]));
      }, node.delay);
      timerRefs.current.push(timer);
    });

    // Schedule edge appearances
    sc.kgEdges.forEach((edge) => {
      const timer = setTimeout(() => {
        setVisibleEdges((prev) => new Set([...prev, edge.id]));
      }, edge.delay);
      timerRefs.current.push(timer);
    });

    // Schedule log entries
    sc.resolutionLog.forEach((entry) => {
      const timer = setTimeout(() => {
        setLogEntries((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));
        if (entry.isSuccess) setComplete(true);
      }, entry.delay);
      timerRefs.current.push(timer);
    });

    return () => {
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
      cancelAnimationFrame(animRef.current);
    };
  }, [setScreen, sc]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logEntries]);

  const getLogEntry = (id: string) => sc.resolutionLog.find((e) => e.id === id);

  return (
    <ScreenLayout
      screenId="cdp-assembly"
      showPhaseArc
      phaseArcState={{ foundation: true, orchestration: false, autonomous: false }}
      showMiniProfile
    >
      <PresenterControls currentScreenId="cdp-assembly" />

      <div
        className="flex flex-col"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#161616',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        {/* Maria Status Strip */}
        <MariaStatusStrip
          state="resolving"
          authStatus="⚠ Expiring T-4"
          careGapStatus="⚠ HbA1c 45d"
          episodeStatus="Postpartum Health"
          visible
        />

        {/* Split header */}
        <div
          className="flex-shrink-0 flex flex-col"
          style={{ borderBottom: '1px solid rgba(57,57,57,0.6)', background: '#1c1c1c' }}
        >
          {/* Screen title bar */}
          <div
            className="flex items-center px-5"
            style={{
              height: 32,
              borderBottom: '1px solid rgba(57,57,57,0.4)',
              background: '#141414',
            }}
          >
            <span
              className="font-mono font-bold tracking-widest uppercase"
              style={{ fontSize: '11px', color: '#42be65', letterSpacing: '0.18em' }}
            >
              CDP Assembly
            </span>
          </div>
          {/* Column headers */}
          <div className="flex" style={{ height: 44 }}>
            <div
              className="flex items-center px-5"
              style={{ width: '45%', borderRight: '1px solid rgba(57,57,57,0.6)' }}
            >
              <span className="font-semibold text-white" style={{ fontSize: '14px' }}>
                One Enterprise. <span style={{ color: '#f59e0b' }}>Six Systems.</span>{' '}
                <span style={{ color: '#fa4d56' }}>Zero Shared Understanding.</span>
              </span>
            </div>
            <div className="flex items-center justify-between px-5 flex-1">
              <span className="font-semibold text-white" style={{ fontSize: '14px' }}>
                Knowledge Graph — <span style={{ color: '#42be65' }}>Assembling</span>
              </span>
              {complete && (
                <div
                  className="rounded px-3 py-1 flex items-center gap-2"
                  style={{
                    background: 'rgba(66,190,101,0.15)',
                    border: '1px solid rgba(66,190,101,0.4)',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: '#42be65' }}
                  />
                  <span
                    className="font-mono font-semibold"
                    style={{ fontSize: '10px', color: '#42be65', letterSpacing: '0.1em' }}
                  >
                    IDENTITY RESOLVED · {sc.id}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main split */}
        <div className="flex min-h-0" style={{ flex: 1, overflow: 'hidden' }}>
          {/* ── LEFT: Six conflicting system records ── */}
          <div
            className="flex flex-col overflow-hidden"
            style={{
              width: '45%',
              borderRight: '1px solid rgba(57,57,57,0.5)',
              background: '#1a1a1a',
            }}
          >
            {/* Unresolved conflicts banner */}
            <div
              className="flex-shrink-0 px-4 py-2 flex items-center gap-3"
              style={{
                borderBottom: '1px solid rgba(250,77,86,0.3)',
                background: 'rgba(250,77,86,0.06)',
              }}
            >
              <span
                className="font-mono font-semibold"
                style={{ fontSize: '10px', color: '#fa4d56', letterSpacing: '0.1em' }}
              >
                UNRESOLVED CONFLICTS
              </span>
              <div className="flex items-center gap-3">
                {[
                  { label: 'Risk Score', detail: '4 different values' },
                  { label: 'Consent Status', detail: '3 conflicting scopes' },
                  { label: 'Address', detail: '4 variants' },
                ].map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5">
                    <div
                      className="rounded-full"
                      style={{ width: 5, height: 5, background: '#fa4d56' }}
                    />
                    <span style={{ fontSize: '10px', color: '#fa4d56' }}>{c.label}</span>
                    <span style={{ fontSize: '10px', color: '#6f6f6f' }}>({c.detail})</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0">
              <style>{`@keyframes fadeSlideIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }`}</style>
              {sc.sourceRecords.map((rec, i) => (
                <div
                  key={rec.id}
                  className="rounded overflow-hidden"
                  style={{
                    border: `1px solid ${rec.systemColor}35`,
                    background: rec.systemBg,
                    opacity: 0,
                    animation: `fadeSlideIn 0.4s ease ${i * 120 + 200}ms forwards`,
                  }}
                >
                  {/* System header */}
                  <div
                    className="flex items-center justify-between px-3 py-2"
                    style={{
                      borderBottom: `1px solid ${rec.systemColor}25`,
                      background: `${rec.systemColor}10`,
                    }}
                  >
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '11px', color: rec.systemColor, letterSpacing: '0.1em' }}
                    >
                      {rec.system}
                    </span>
                    <span className="font-mono" style={{ fontSize: '10px', color: '#6f6f6f' }}>
                      {rec.memberId}
                    </span>
                  </div>
                  {/* Record fields */}
                  <div className="px-3 py-2 flex flex-col gap-1">
                    {[
                      { label: 'NAME', value: rec.memberName },
                      { label: 'DOB', value: rec.dob },
                      { label: 'ADDRESS', value: rec.address },
                      { label: 'RISK', value: rec.riskScore },
                      { label: 'CONSENT', value: rec.consentStatus },
                      { label: 'AUTH', value: rec.authStatus },
                    ].map((field) => (
                      <div key={field.label} className="flex items-start gap-2">
                        <span
                          className="font-mono flex-shrink-0"
                          style={{
                            fontSize: '9px',
                            color: '#6f6f6f',
                            letterSpacing: '0.06em',
                            width: 52,
                            paddingTop: 1,
                          }}
                        >
                          {field.label}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color:
                              field.value === 'NOT ON FILE' ||
                              field.value === 'NOT SCORED' ||
                              field.value === 'NOT VERIFIED' ||
                              field.value === 'UNKNOWN'
                                ? '#fa4d56'
                                : '#d4d4d4',
                            lineHeight: 1.3,
                          }}
                        >
                          {field.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Conflict badges */}
                  {rec.conflicts.length > 0 && (
                    <div className="px-3 pb-2 flex flex-wrap gap-1">
                      {rec.conflicts.map((c) => (
                        <div
                          key={c}
                          className="rounded px-1.5 py-0.5"
                          style={{
                            background: 'rgba(250,77,86,0.12)',
                            border: '1px solid rgba(250,77,86,0.3)',
                          }}
                        >
                          <span
                            style={{ fontSize: '9px', color: '#fa4d56', letterSpacing: '0.04em' }}
                          >
                            ⚡ {c}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Graph Assembly + Resolution Log ── */}
          <div className="flex flex-col overflow-hidden" style={{ flex: 1, background: '#161616' }}>
            {/* Graph canvas */}
            <div className="relative overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
              <AssemblyGraph
                nodes={sc.kgNodes}
                edges={sc.kgEdges}
                visibleNodes={visibleNodes}
                visibleEdges={visibleEdges}
                tick={tick}
              />
              {/* Identity confidence badge */}
              {visibleNodes.has('center') && (
                <div
                  className="absolute top-3 right-3 rounded px-3 py-1.5 flex flex-col gap-1"
                  style={{
                    background: 'rgba(22,22,22,0.92)',
                    border: '1px solid rgba(66,190,101,0.4)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono"
                      style={{ fontSize: '10px', color: '#42be65', letterSpacing: '0.08em' }}
                    >
                      IDENTITY CONFIDENCE
                    </span>
                    <span
                      className="font-mono font-bold"
                      style={{ fontSize: '14px', color: '#42be65' }}
                    >
                      97%
                    </span>
                  </div>
                  <div
                    className="rounded-full overflow-hidden"
                    style={{ height: 3, background: 'rgba(57,57,57,0.6)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: complete ? '97%' : '0%',
                        background: '#42be65',
                        transition: 'width 1.5s ease',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '9px', color: '#6f6f6f' }}>
                    6 sources reconciled · Golden record committed
                  </span>
                </div>
              )}
            </div>

            {/* Resolution log */}
            <div
              className="flex-shrink-0 flex flex-col"
              style={{
                height: 180,
                borderTop: '1px solid rgba(57,57,57,0.5)',
                background: '#1a1a1a',
              }}
            >
              <div
                className="flex-shrink-0 px-4 py-2 flex items-center gap-2"
                style={{ borderBottom: '1px solid rgba(57,57,57,0.5)' }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: complete ? '#42be65' : '#f59e0b',
                    boxShadow: `0 0 6px ${complete ? '#42be65' : '#f59e0b'}`,
                  }}
                />
                <span
                  className="font-mono uppercase"
                  style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}
                >
                  RESOLUTION LOG
                </span>
              </div>
              <div
                ref={logRef}
                className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-1 min-h-0"
                style={{ fontFamily: '"IBM Plex Mono", monospace' }}
              >
                <style>{`@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }`}</style>
                {logEntries.map((id, i) => {
                  const entry = getLogEntry(id);
                  if (!entry) return null;
                  return (
                    <div
                      key={`${id}-${i}`}
                      className="flex items-start gap-2"
                      style={{
                        opacity: 0,
                        animation: 'fadeIn 0.3s ease forwards',
                      }}
                    >
                      <span style={{ fontSize: '10px', color: '#4b5563', flexShrink: 0 }}>›</span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: entry.color,
                          fontWeight: entry.isSuccess ? '700' : '400',
                          letterSpacing: entry.isSuccess ? '0.02em' : '0',
                        }}
                      >
                        {entry.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Practitioner depth panel */}
            <PractitionerPanel dataProductsLine={sc.dataProductsLine} />
          </div>
        </div>

        {/* Screen indicator */}
        <div
          className="absolute bottom-4 right-6 z-10 font-mono"
          style={{ color: '#6f6f6f', fontSize: '12px' }}
        >
          04 / 19
        </div>
      </div>
    </ScreenLayout>
  );
}
