'use client';
// StoryFlowStrip — the adaptive narrative decision-flow row above the WPC graph.
// Renders a member's variable-length story (Finding → Why now → Do this → Who →
// Blocked by, +extras) as compact cards that FIT the allocated width; when they
// overflow it shows a "+N more · click to expand" chip that opens a full overlay
// (X / click-scrim / Esc to return). At very narrow widths it collapses to a pill.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode, GraphEdge } from '@/lib/wpcGraph/types';
import { buildStorySteps, type StoryStep, type StepTone } from '@/lib/wpcGraph/storySteps';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SANS = "'IBM Plex Sans', system-ui, sans-serif";
const C = {
  bg: '#0d0d18',
  border: '#1a1a2e',
  bright: '#252540',
  text: '#e2e8f0',
  muted: '#64748b',
  dim: '#2d3748',
  crit: '#ef4444',
};
const TONE: Record<StepTone, { bar: string; tag: string }> = {
  critical: { bar: '#ef4444', tag: 'rgba(239,68,68,0.85)' },
  warning: { bar: '#f59e0b', tag: 'rgba(245,158,11,0.85)' },
  done: { bar: 'rgba(34,197,94,0.5)', tag: '#64748b' },
  neutral: { bar: '#252540', tag: '#2d3748' },
};

const CARD_MIN = 140,
  CARD_MAX = 240,
  ARROW = 22,
  CHIP = 120,
  PADX = 24,
  NARROW = 340;
const estW = (s: StoryStep): number =>
  Math.max(CARD_MIN, Math.min(CARD_MAX, 46 + (s.value?.length ?? 0) * 5.4));

function fitCount(steps: StoryStep[], avail: number): number {
  if (avail <= 0) return steps.length;
  let full = 0;
  steps.forEach((s, i) => {
    full += estW(s) + (i > 0 ? ARROW : 0);
  });
  if (full <= avail) return steps.length;
  let used = 0,
    k = 0;
  for (let i = 0; i < steps.length; i++) {
    const w = estW(steps[i]) + (i > 0 ? ARROW : 0);
    if (used + w + ARROW + CHIP > avail) break;
    used += w;
    k++;
  }
  return Math.max(1, k);
}

const Arrow = () => (
  <span
    aria-hidden
    style={{ color: C.dim, fontFamily: MONO, fontSize: 12, flex: '0 0 auto', alignSelf: 'center' }}
  >
    →
  </span>
);

function StepCard({ step, active, full }: { step: StoryStep; active: boolean; full?: boolean }) {
  const t = TONE[step.tone];
  return (
    <div
      title={full ? undefined : step.value}
      style={{
        position: 'relative',
        width: full ? undefined : estW(step),
        minWidth: full ? 172 : undefined,
        maxWidth: full ? 240 : undefined,
        minHeight: 44,
        background: C.bg,
        border: `1px solid ${active ? C.crit : C.border}`,
        borderRadius: 4,
        padding: '6px 8px 16px 12px',
        flex: '0 0 auto',
        overflow: 'hidden',
        boxShadow: active
          ? '0 0 0 1px rgba(239,68,68,0.35), 0 0 12px rgba(239,68,68,0.22)'
          : 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: active ? C.crit : t.bar,
          borderRadius: '4px 0 0 4px',
        }}
      />
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: active ? C.crit : C.muted,
          fontFamily: MONO,
          lineHeight: 1,
        }}
      >
        {step.label}
      </div>
      <div
        style={{
          fontSize: 12,
          lineHeight: '14px',
          color: C.text,
          fontFamily: SANS,
          marginTop: 3,
          ...(full
            ? {}
            : ({
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              } as React.CSSProperties)),
        }}
      >
        {step.value}
      </div>
      {step.tag && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            right: 8,
            bottom: 4,
            fontSize: 9,
            color: t.tag,
            fontFamily: MONO,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {step.tag}
        </div>
      )}
    </div>
  );
}

export function StoryFlowStrip({
  nodes,
  edges,
  authored = false,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  authored?: boolean;
}) {
  const steps = useMemo(() => buildStorySteps(nodes, edges, authored), [nodes, edges, authored]);
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.clientWidth);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      setW((prev) => (Math.abs(prev - cw) > 2 ? cw : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const criticalKey = steps.find((s) => s.tone === 'critical')?.key;
  const avail = Math.max(0, w - PADX);
  const narrow = avail > 0 && avail < NARROW;
  const k = narrow ? 0 : fitCount(steps, avail);
  const overflow = narrow || k < steps.length;
  const shown = steps.slice(0, k);
  const hidden = steps.length - k;

  return (
    <div
      ref={ref}
      style={{
        height: 64,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '10px 12px',
        background: '#070710',
        borderBottom: `1px solid ${C.border}`,
        overflow: 'hidden',
        cursor: overflow ? 'pointer' : 'default',
      }}
      onClick={overflow ? () => setExpanded(true) : undefined}
    >
      <span
        style={{
          fontSize: 9,
          letterSpacing: '0.08em',
          color: C.muted,
          fontFamily: MONO,
          flex: '0 0 auto',
          marginRight: 2,
        }}
      >
        STORY
      </span>

      {narrow ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 36,
            padding: '0 14px',
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 18,
          }}
        >
          {criticalKey && (
            <span
              style={{ width: 6, height: 6, borderRadius: 3, background: C.crit, flex: '0 0 auto' }}
            />
          )}
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>Signal story</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>
            · {steps.length} steps · click to view
          </span>
        </div>
      ) : (
        <>
          {shown.map((s, i) => (
            <React.Fragment key={s.key}>
              {i > 0 && <Arrow />}
              <StepCard step={s} active={s.key === criticalKey} />
            </React.Fragment>
          ))}
          {overflow && (
            <>
              <Arrow />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minWidth: 104,
                  minHeight: 44,
                  padding: '4px 12px',
                  background: C.bg,
                  border: `1px dashed ${C.bright}`,
                  borderRadius: 4,
                  flex: '0 0 auto',
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>
                  +{hidden} more
                </span>
                <span style={{ fontFamily: SANS, fontSize: 10, color: C.muted }}>
                  click to expand
                </span>
              </div>
            </>
          )}
        </>
      )}

      {expanded && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setExpanded(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(5,5,8,0.72)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '80px 24px 24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'calc(100% - 48px)',
              maxWidth: 900,
              maxHeight: '80vh',
              overflowY: 'auto',
              background: C.bg,
              border: `1px solid ${C.bright}`,
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span
                style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', color: C.muted }}
              >
                SIGNAL STORY · {steps.length} STEPS
              </span>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Close"
                style={{
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: C.muted,
                  fontFamily: MONO,
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'stretch',
                gap: 10,
                rowGap: 16,
              }}
            >
              {steps.map((s, i) => (
                <React.Fragment key={s.key}>
                  {i > 0 && <Arrow />}
                  <StepCard step={s} active={s.key === criticalKey} full />
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
