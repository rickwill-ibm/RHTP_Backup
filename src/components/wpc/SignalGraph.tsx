'use client';
// SignalGraph — the "How you know" member evidence graph for Whole Person Care.
// Full-canvas SVG: silver member + dashed halo; red act / gold watch / grey context
// spheres (tier from the attention engine); teal dependent / violet caregiver people;
// the full relationship mesh with type-pills; pulsing act (BLOCKS) paths; auto-fit.
// Deterministic layout (index-seeded, no Math.random) so it is reproducible.

import React, { useMemo, useState, useEffect } from 'react';
import * as d3 from 'd3';
import type { GraphNode, GraphEdge } from '@/lib/wpcGraph/types';
import { buildLensRegistry, enrichSparseLens } from '@/lib/wpcGraph/lensUtils';
import { scoreAttention, topAttentionGap } from '@/lib/wpcGraph/attention';
import { buildMemberGraphView } from '@/lib/wpcGraph/memberGraphView';

type Tier = 'member' | 'act' | 'watch' | 'context' | 'dependent' | 'caregiver' | 'household';
const RAD: Record<Tier, number> = {
  member: 46,
  act: 26,
  watch: 20,
  dependent: 22,
  caregiver: 22,
  household: 20,
  context: 11,
};
const FILL: Record<Tier, [string, string, string]> = {
  act: ['#ff6b6f', '#e5484d', '#5a1114'],
  watch: ['#f2c94c', '#d6a419', '#5a4406'],
  dependent: ['#3fd0c0', '#2bb3a3', '#0c3c37'],
  caregiver: ['#c39bff', '#a56eff', '#3a1d66'],
  member: ['#ffffff', '#c6cbd6', '#3a3f4b'],
  context: ['#5b6472', '#39404d', '#14171d'],
  household: ['#9fb4d4', '#6d82a6', '#232c3c'],
};
const ECOLOR: Record<string, string> = {
  BLOCKS: '#e5484d',
  UNSATISFIED_CREATES: '#d6a419',
  COMPOUNDS: '#d6a419',
  CAREGIVER_FOR: '#a56eff',
  INFORMAL_CAREGIVER_FOR: '#a56eff',
  PARENT_OF: '#a56eff',
  PICKS_UP: '#2bb3a3',
  DISPOSITIONED_AS: '#5b6472',
};
const PILL = new Set([
  'BLOCKS',
  'CAREGIVER_FOR',
  'INFORMAL_CAREGIVER_FOR',
  'PARENT_OF',
  'UNSATISFIED_CREATES',
]);
const SUBCOL: Partial<Record<Tier, string>> = { act: '#e5484d', watch: '#d6a419' };
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// Wrap a label into up to `maxLines` lines of ~`max` chars, ellipsising the last
// line if it still overflows — so node labels read on two lines instead of one
// truncated line. Full text is always available via the node's hover <title>.
function wrapText(s: string, max = 22, maxLines = 2): string[] {
  if (s.length <= max) return [s];
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (cand.length <= max || !cur) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const shown = lines.join(' ');
  if (shown.length < s.length) {
    let last = lines[lines.length - 1];
    if (last.length > max - 1) last = last.slice(0, max - 1);
    lines[lines.length - 1] = last.replace(/\s*\S*$/, '').trimEnd() + '…';
  }
  return lines;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  activeLens: string;
  /** The viewing member's identity (citizen/platform id) — the engine anchors the
   *  center to it by identity, never by array order. */
  anchorId?: string;
  onNodeClick?: (n: GraphNode) => void;
  onEdgeClick?: (e: GraphEdge, x: number, y: number) => void;
}

interface Sim {
  id: string;
  node: GraphNode;
  tier: Tier;
  signal: boolean;
  x: number;
  y: number;
  fx: number | null;
  fy: number | null;
}

export function SignalGraph({
  nodes,
  edges,
  activeLens,
  anchorId,
  onNodeClick,
  onEdgeClick,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const model = useMemo(() => {
    // ENGINE: interpret the data — anchor by identity, person roles by relationship
    // edge (care direction), consent disclosure. The UI below only decides how to
    // display this verdict (and whether to show a node at all).
    const gv = buildMemberGraphView(nodes, edges, anchorId);
    const memberId = gv.anchorId;
    const reg = buildLensRegistry(nodes, edges).find((l) => l.id === activeLens);
    const base = reg?.nodeIds ?? (memberId ? [memberId] : []);
    const lensIds = enrichSparseLens(base, nodes, edges);
    const idset = new Set(lensIds);
    // UI: drop consent-suppressed nodes entirely (never render another person's PHI).
    const vns = nodes.filter(
      (n) => idset.has(n.id) && gv.view.get(n.id)?.disclosure !== 'suppress'
    );

    // Roles/consent are graph-global (from the engine); attention TIERS are re-scored
    // over the nodes visible in THIS lens, so tiering + on-track track the active lens.
    const isRole = (t?: string) => t === 'caregiver' || t === 'dependent' || t === 'household';
    const lensFindings = vns.filter((n) => n.id !== memberId && !isRole(gv.view.get(n.id)?.tier));
    const attn = scoreAttention(lensFindings, edges);
    const topGap = topAttentionGap(lensFindings, edges);
    const signalId = topGap && attn.get(topGap.id) === 'act' ? topGap.id : undefined;
    const lensHasAct = [...attn.values()].some((t) => t === 'act');
    const lensHasWatch = [...attn.values()].some((t) => t === 'watch');
    const tierOf = (n: GraphNode): Tier => {
      if (n.id === memberId) return 'member';
      const gvt = gv.view.get(n.id)?.tier;
      if (isRole(gvt)) return gvt as Tier;
      return (attn.get(n.id) ?? 'context') as Tier;
    };

    const W = 1000,
      H = 720,
      cx = W / 2,
      cy = H / 2;
    const nSat = vns.length - 1;
    // Radial banding by attention tier: act ring inner, watch mid, context/persons outer.
    // Keeps sparse graphs centered and dense ones (Maria) legible concentric shells, not a hairball.
    const ringOf = (t: Tier): number =>
      t === 'member' ? 0 : t === 'act' ? 250 : t === 'watch' ? 340 : 410;
    const sim: Sim[] = vns.map((n, i) => {
      const isM = n.id === memberId;
      const tier = tierOf(n);
      const ang = (i / Math.max(vns.length, 1)) * Math.PI * 2;
      const rr = ringOf(tier) || 300;
      return {
        id: n.id,
        node: n,
        tier,
        signal: n.id === signalId,
        x: isM ? cx : cx + Math.cos(ang) * rr,
        y: isM ? cy : cy + Math.sin(ang) * rr,
        fx: isM ? cx : null,
        fy: isM ? cy : null,
      };
    });
    const vset = new Set(sim.map((s) => s.id));
    const links = edges
      .filter((e) => vset.has(e.source) && vset.has(e.target))
      .map((e) => ({ edge: e, source: e.source, target: e.target }));
    const s = d3
      .forceSimulation(sim as unknown as d3.SimulationNodeDatum[])
      .force(
        'link',
        d3
          .forceLink(links as unknown as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
          .id((d) => (d as unknown as Sim).id)
          .distance(150)
          .strength(0.5)
      )
      .force(
        'charge',
        d3
          .forceManyBody()
          .strength(-(900 + 60 * Math.min(nSat, 20)))
          .distanceMax(420)
      )
      .force(
        'collide',
        d3
          .forceCollide()
          .radius(
            (d) =>
              RAD[(d as unknown as Sim).tier] + ((d as unknown as Sim).tier === 'member' ? 28 : 14)
          )
          .strength(0.9)
          .iterations(2)
      )
      .force(
        'radial',
        d3
          .forceRadial((d) => ringOf((d as unknown as Sim).tier), cx, cy)
          .strength((d) => {
            const t = (d as unknown as Sim).tier;
            return t === 'member' ? 0 : t === 'dependent' || t === 'caregiver' ? 0.25 : 0.35;
          })
      )
      .force('x', d3.forceX(cx).strength(0.06))
      .force('y', d3.forceY(cy).strength(0.06))
      .stop();
    for (let i = 0; i < 440; i++) s.tick();

    const pad = 40;
    let x0 = Math.min(...sim.map((d) => d.x - RAD[d.tier] - 62)),
      x1 = Math.max(...sim.map((d) => d.x + RAD[d.tier] + 62));
    let y0 = Math.min(...sim.map((d) => d.y - RAD[d.tier] - 26)),
      y1 = Math.max(...sim.map((d) => d.y + RAD[d.tier] + 40));
    // Sparse graphs: enforce a minimum framed extent around the member so 1-3 nodes stay centered and calm, not magnified.
    if (nSat <= 3) {
      x0 = Math.min(x0, cx - 320);
      x1 = Math.max(x1, cx + 320);
      y0 = Math.min(y0, cy - 270);
      y1 = Math.max(y1, cy + 270);
    }
    const byId = new Map(sim.map((d) => [d.id, d]));
    return {
      sim,
      links,
      byId,
      memberId,
      cy,
      hasAct: lensHasAct,
      hasWatch: lensHasWatch,
      view: gv.view,
      vb: `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`,
    };
  }, [nodes, edges, activeLens, anchorId]);

  const { sim, links, byId, memberId, cy, hasAct, hasWatch, view } = model;

  if (!mounted) return <div style={{ width: '100%', height: '100%', background: '#07080c' }} />;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#07080c' }}>
      <style>{`
        @keyframes sg-flow{to{stroke-dashoffset:-32}}
        @keyframes sg-ph{0%{opacity:.55}70%,100%{opacity:0}}
        .sg-flow{stroke-dasharray:9 7;animation:sg-flow 1.1s linear infinite}
        @media (prefers-reduced-motion:reduce){.sg-flow{animation:none}.sg-halo{animation:none!important}}
      `}</style>
      <svg width="100%" height="100%" viewBox={model.vb} preserveAspectRatio="xMidYMid meet">
        <defs>
          {(Object.keys(FILL) as Tier[]).map((k) => (
            <radialGradient key={k} id={`sg-${k}`} cx="32%" cy="30%" r="75%">
              <stop offset="0%" stopColor={FILL[k][0]} />
              <stop offset="45%" stopColor={FILL[k][1]} />
              <stop offset="100%" stopColor={FILL[k][2]} />
            </radialGradient>
          ))}
        </defs>
        {/* edges */}
        <g>
          {links.map(({ edge }) => {
            const a = byId.get(edge.source),
              b = byId.get(edge.target);
            if (!a || !b) return null;
            const type = (edge.type || '').toUpperCase();
            // An edge is an "act path" if it is a BLOCKS causal link OR it touches an act node,
            // so every connection to a red act node reads red and pulses — never a faint grey line.
            const act = type === 'BLOCKS' || a.tier === 'act' || b.tier === 'act';
            const person = PILL.has(type);
            const conf = edge.edgeProps?.confidence;
            const col = act ? '#e5484d' : person ? ECOLOR[type] || '#a56eff' : '#5a6478';
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={col}
                strokeWidth={act ? 2.6 : person ? 1.8 : 1.4}
                strokeOpacity={
                  act ? 0.95 : person ? 0.85 : conf !== undefined ? Math.max(0.45, conf) : 0.6
                }
                strokeDasharray={edge.dashed && !act ? '4 4' : undefined}
                className={act ? 'sg-flow' : undefined}
                style={{ cursor: onEdgeClick ? 'pointer' : 'default', pointerEvents: 'stroke' }}
                onClick={() => onEdgeClick?.(edge, (a.x + b.x) / 2, (a.y + b.y) / 2)}
              />
            );
          })}
        </g>
        {/* nodes */}
        <g>
          {sim.map((n) => {
            const locked = view.get(n.id)?.disclosure === 'lock';
            const rel = view.get(n.id)?.relation;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
                onClick={() => onNodeClick?.(n.node)}
              >
                {/* consent-gated person: never reveal name/PHI in the hover title either */}
                <title>
                  {locked
                    ? `${rel ?? 'Household member'} \u00b7 consent pending \u2014 details hidden`
                    : `${n.node.label}${n.node.sublabel ? ` \u00b7 ${n.node.sublabel}` : ''}`}
                </title>
                {n.tier === 'act' && (
                  <circle
                    className="sg-halo"
                    r={RAD.act + 14}
                    fill="none"
                    stroke="#e5484d"
                    strokeWidth={2}
                    style={{ animation: 'sg-ph 1.7s ease-out infinite' }}
                  />
                )}
                <circle
                  r={RAD[n.tier]}
                  fill={`url(#sg-${n.tier})`}
                  stroke={n.tier === 'context' ? '#2a2f3a' : FILL[n.tier][1]}
                  strokeOpacity={n.tier === 'context' ? 0.5 : 0.85}
                  strokeWidth={1.2}
                  opacity={locked ? 0.5 : 1}
                />
                {locked && (
                  <circle
                    r={RAD[n.tier] + 5}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    strokeOpacity={0.85}
                  />
                )}
                {n.tier === 'member' && (
                  <circle
                    r={RAD.member + 6}
                    fill="none"
                    stroke="#8892a4"
                    strokeDasharray="3 4"
                    strokeOpacity={0.6}
                  />
                )}
              </g>
            );
          })}
        </g>
        {/* labels (act / watch / people; context stays unlabelled) */}
        <g pointerEvents="none">
          {sim
            .filter((n) => n.tier !== 'context')
            .map((n) => {
              const locked = view.get(n.id)?.disclosure === 'lock';
              // Consent-gated person: label by relationship only (no name/PHI).
              const labelText = locked
                ? (view.get(n.id)?.relation ?? 'Household member')
                : n.node.label;
              const above = n.y < cy && n.tier !== 'member';
              const lines = wrapText(labelText, n.tier === 'member' ? 28 : 22);
              const LINE_H = 14;
              // stack upward when the label sits above the node so extra lines don't collide with it
              const ly = above ? -RAD[n.tier] - 24 - (lines.length - 1) * LINE_H : RAD[n.tier] + 16;
              const rawSub = locked ? 'Consent pending' : n.node.sublabel || '';
              const sub = rawSub.length > 34 ? rawSub.slice(0, 33) + '\u2026' : rawSub;
              const subColor = locked ? '#f59e0b' : SUBCOL[n.tier] || '#7b8494';
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y + ly})`}>
                  {lines.map((ln, i) => (
                    <text
                      key={i}
                      y={i * LINE_H}
                      textAnchor="middle"
                      fontFamily={MONO}
                      fontSize={n.tier === 'member' ? 13.5 : 12}
                      fontWeight={600}
                      fill={n.tier === 'member' ? '#fff' : '#f1f5f9'}
                      stroke="#07080c"
                      strokeWidth={n.tier === 'member' ? 0 : 2.4}
                      paintOrder="stroke"
                    >
                      {ln}
                    </text>
                  ))}
                  {sub && (
                    <text
                      y={lines.length * LINE_H - 1}
                      textAnchor="middle"
                      fontFamily={MONO}
                      fontSize={9}
                      fill={subColor}
                      stroke="#07080c"
                      strokeWidth={2}
                      paintOrder="stroke"
                    >
                      {sub}
                    </text>
                  )}
                </g>
              );
            })}
        </g>
        {/* relationship-type pills (drawn on top), offset off the edge line */}
        <g pointerEvents="none">
          {links
            .filter(({ edge }) => PILL.has((edge.type || '').toUpperCase()))
            .map(({ edge }) => {
              const a = byId.get(edge.source),
                b = byId.get(edge.target);
              if (!a || !b) return null;
              const t = a.id === memberId ? 0.66 : b.id === memberId ? 0.34 : 0.5;
              const dx = b.x - a.x,
                dy = b.y - a.y,
                L = Math.hypot(dx, dy) || 1;
              const px = a.x + dx * t - (dy / L) * 11,
                py = a.y + dy * t + (dx / L) * 11;
              const type = (edge.type || '').toUpperCase(),
                col = ECOLOR[type] || '#8892a4',
                w = type.length * 5.6 + 12;
              return (
                <g key={'p' + edge.id} transform={`translate(${px},${py})`}>
                  <rect
                    x={-w / 2}
                    y={-7}
                    width={w}
                    height={14}
                    rx={3}
                    fill="#0c0e14"
                    stroke={col}
                    strokeOpacity={0.5}
                  />
                  <text
                    textAnchor="middle"
                    dy={3.5}
                    fontFamily={MONO}
                    fontSize={8.5}
                    fill={col}
                    letterSpacing="0.04em"
                  >
                    {type}
                  </text>
                </g>
              );
            })}
        </g>
      </svg>
      {!hasAct &&
        (hasWatch ? (
          // Watch items present but nothing urgent — monitoring, not "all clear".
          <div
            style={{
              position: 'absolute',
              top: 18,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(26,20,6,0.92)',
              border: '1px solid rgba(214,164,25,0.5)',
              fontFamily: MONO,
              fontSize: 12,
              color: '#d6a419',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                background: '#d6a419',
                boxShadow: '0 0 8px #d6a419',
              }}
            />
            No urgent action — monitoring only in this view
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              top: 18,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(9,20,14,0.92)',
              border: '1px solid rgba(66,190,101,0.5)',
              fontFamily: MONO,
              fontSize: 12,
              color: '#42be65',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                background: '#42be65',
                boxShadow: '0 0 8px #42be65',
              }}
            />
            On track — nothing needs action in this view
          </div>
        ))}
      {/* attention legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 16,
          right: 16,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: MONO,
          fontSize: 11,
          color: '#7b8494',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 18 }}>
          <span style={{ letterSpacing: '.12em', color: '#4b5563' }}>ATTENTION</span>
          <span>
            ● <span style={{ color: '#e5484d' }}>Act now</span> (3 max)
          </span>
          <span>
            ● <span style={{ color: '#d6a419' }}>Watch</span> (5 max)
          </span>
          <span>● Context — unlabelled</span>
          <span style={{ color: '#4b5563' }}>· pulsing = live act path</span>
        </div>
        <div style={{ color: '#4b5563' }}>
          dashed = inferred · opacity = confidence · all threads
        </div>
      </div>
    </div>
  );
}
