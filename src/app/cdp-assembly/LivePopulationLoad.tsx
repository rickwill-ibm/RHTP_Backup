'use client';
// src/app/cdp-assembly/LivePopulationLoad.tsx — the REAL population data-load view.
//
// This is the answer to "the screen is about load data, not one patient": it POSTs the
// seeded population's source folder through the real pipeline (EMPI, terminology gate,
// projection) and renders AGGREGATE telemetry — members resolved (a count), resources
// admitted per WPC domain, quarantine, source-system rollups, and projected
// knowledge-graph size. No golden record, no member name, no per-member row. Every
// figure is returned by /api/cdp-intake/run; nothing is scripted. Scales narratively
// from 1 to 10,000s of members — the counts just grow.

import React from 'react';
import {
  useLivePopulationLoad,
  type DomainCount,
  type SourceRollup,
} from './useLivePopulationLoad';
import {
  MONO,
  PANEL,
  CARD,
  BORDER,
  AMBER,
  LIME,
  MUTED,
  TEXT,
  n,
  humanizeDomain,
} from './LivePopulationLoad.format';

export function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${accent ? AMBER : BORDER}`,
        padding: '12px 14px',
        minWidth: 0,
        flex: '1 1 120px',
      }}
    >
      <p
        style={{
          fontFamily: MONO,
          color: accent ? AMBER : TEXT,
          fontSize: 26,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
      <p style={{ fontFamily: MONO, color: MUTED, fontSize: 10, letterSpacing: 0.5, marginTop: 4 }}>
        {label}
      </p>
    </div>
  );
}

export function DomainBars({ domains }: { domains: DomainCount[] }) {
  if (domains.length === 0) {
    return (
      <p style={{ fontFamily: MONO, color: MUTED, fontSize: 11, fontStyle: 'italic' }}>
        No resources admitted — every record was held or quarantined.
      </p>
    );
  }
  const max = Math.max(...domains.map((d) => d.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {domains.map((d) => (
        <div key={d.domain} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: MONO,
              color: TEXT,
              fontSize: 11,
              width: 150,
              flexShrink: 0,
              textAlign: 'right',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={humanizeDomain(d.domain)}
          >
            {humanizeDomain(d.domain)}
          </span>
          <div
            style={{
              flex: 1,
              background: '#0a0f1e',
              height: 16,
              position: 'relative',
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: `${(d.count / max) * 100}%`,
                height: '100%',
                background: LIME,
                minWidth: 2,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: MONO,
              color: LIME,
              fontSize: 12,
              fontWeight: 700,
              width: 64,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {n(d.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SourceRows({ sources }: { sources: SourceRollup[] }) {
  if (sources.length === 0) {
    return (
      <p style={{ fontFamily: MONO, color: MUTED, fontSize: 11, fontStyle: 'italic' }}>
        No sources processed.
      </p>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {sources.map((s) => {
        // green = admitted something; amber = held; neutral = processed but nothing admitted
        const accent = s.held > 0 ? AMBER : s.loaded > 0 ? LIME : MUTED;
        return (
          <div key={s.sourceSystem} style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 10 }}>
            <p style={{ fontFamily: MONO, color: TEXT, fontSize: 11, fontWeight: 700 }}>
              {s.sourceSystem}
            </p>
            <p style={{ fontFamily: MONO, color: MUTED, fontSize: 10 }}>
              {n(s.files)} file{s.files === 1 ? '' : 's'} ·{' '}
              <span style={{ color: s.loaded > 0 ? LIME : MUTED }}>{n(s.loaded)} admitted</span>
              {s.quarantined > 0 && (
                <span style={{ color: '#f87171' }}> · {n(s.quarantined)} quarantined</span>
              )}
              {s.held > 0 && <span style={{ color: AMBER }}> · {n(s.held)} held</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: MONO,
        color: AMBER,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  );
}

export default function LivePopulationLoad() {
  const { state, run } = useLivePopulationLoad();
  const running = state.status === 'running';
  const done = state.status === 'done';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Control row */}
      <div
        style={{
          background: PANEL,
          border: `1px solid ${BORDER}`,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: MONO,
              color: AMBER,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            POPULATION DATA LOAD · SEEDED SOURCE FOLDER
          </p>
          <p style={{ fontFamily: MONO, color: MUTED, fontSize: 11, marginTop: 2 }}>
            Real pipeline: intake → EMPI identity resolution → terminology gate → FHIR projection →
            knowledge graph
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          style={{
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
            background: running ? BORDER : AMBER,
            color: running ? MUTED : PANEL,
            border: 'none',
            padding: '8px 20px',
            cursor: running ? 'not-allowed' : 'pointer',
            letterSpacing: 1,
          }}
        >
          {running ? 'LOADING…' : done ? '↺ RUN AGAIN' : '▶ RUN LIVE LOAD'}
        </button>
      </div>

      {/* Idle */}
      {state.status === 'idle' && (
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, padding: '28px 20px' }}>
          <p style={{ fontFamily: MONO, color: TEXT, fontSize: 13, marginBottom: 8 }}>
            Press <span style={{ color: AMBER }}>▶ RUN LIVE LOAD</span> to ingest the seeded
            population.
          </p>
          <p style={{ fontFamily: MONO, color: MUTED, fontSize: 11, lineHeight: 1.7 }}>
            The load reads the source folder verbatim, resolves each record to a member via the EMPI
            seam, runs standardization / normalization / terminology validation, admits conforming
            resources into FHIR, and projects them into the shared knowledge graph. What
            you&rsquo;ll see below are population counts — members, resources by domain, quarantine,
            graph size — not any single member&rsquo;s chart.
          </p>
        </div>
      )}

      {/* Running */}
      {running && (
        <div style={{ background: PANEL, border: `1px solid ${AMBER}`, padding: '24px 20px' }}>
          <p style={{ fontFamily: MONO, color: AMBER, fontSize: 12, fontWeight: 700 }}>
            <span style={{ animation: 'blink 1s step-end infinite' }}>█</span> LOADING POPULATION…
          </p>
          <p style={{ fontFamily: MONO, color: MUTED, fontSize: 11, marginTop: 6 }}>
            Resolving identity, validating terminology, and projecting resources into the graph.
          </p>
        </div>
      )}

      {/* Disabled (flag off) — the honest 404 from the route */}
      {state.status === 'disabled' && (
        <div style={{ background: PANEL, border: `1px solid ${AMBER}`, padding: '20px' }}>
          <p
            style={{
              fontFamily: MONO,
              color: AMBER,
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            LIVE LOAD DISABLED IN THIS ENVIRONMENT
          </p>
          <p style={{ fontFamily: MONO, color: MUTED, fontSize: 11, lineHeight: 1.7 }}>
            The mutating run endpoint is off by default. Start the app with{' '}
            <span style={{ color: TEXT }}>CDP_INTAKE_LIVE=1</span> to enable it. Until then the
            Narrative tab shows the scripted walkthrough. ({state.error})
          </p>
        </div>
      )}

      {/* Error */}
      {state.status === 'error' && (
        <div style={{ background: PANEL, border: '1px solid #ef4444', padding: '20px' }}>
          <p
            style={{
              fontFamily: MONO,
              color: '#f87171',
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            LOAD FAILED
          </p>
          <p style={{ fontFamily: MONO, color: MUTED, fontSize: 11, whiteSpace: 'pre-wrap' }}>
            {state.error}
          </p>
        </div>
      )}

      {/* Results */}
      {done && state.totals && (
        <>
          {/* Metric tiles — MEMBERS RESOLVED is the single population headline */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Metric label="MEMBERS RESOLVED" value={n(state.totals.members)} accent />
            <Metric label="SOURCE FILES" value={n(state.totals.files)} />
            <Metric label="RESOURCES ADMITTED" value={n(state.totals.loaded)} />
            <Metric label="QUARANTINED" value={n(state.totals.quarantined)} />
            <Metric label="HELD · LOW-CONFIDENCE IDENTITY" value={n(state.totals.held)} />
            <Metric label="GRAPH NODES · CUMULATIVE" value={n(state.graph?.nodes ?? 0)} />
            <Metric label="GRAPH EDGES · CUMULATIVE" value={n(state.graph?.edges ?? 0)} />
          </div>

          {/* Two-column: domains + per-source */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                flex: '2 1 340px',
                background: PANEL,
                border: `1px solid ${BORDER}`,
                padding: '16px',
                minWidth: 0,
              }}
            >
              <SectionTitle>RESOURCES ADMITTED BY WPC DOMAIN</SectionTitle>
              <DomainBars domains={state.domains ?? []} />
            </div>

            <div
              style={{
                flex: '1 1 300px',
                background: PANEL,
                border: `1px solid ${BORDER}`,
                padding: '16px',
                minWidth: 0,
              }}
            >
              <SectionTitle>BY SOURCE SYSTEM</SectionTitle>
              <SourceRows sources={state.sources ?? []} />
            </div>
          </div>

          {/* Provenance footer */}
          <div
            style={{
              background: PANEL,
              border: `1px solid ${BORDER}`,
              padding: '10px 16px',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span style={{ fontFamily: MONO, color: MUTED, fontSize: 10 }}>
              RECEIPT <span style={{ color: TEXT }}>{state.receiptId ?? '—'}</span>
            </span>
            <span style={{ fontFamily: MONO, color: MUTED, fontSize: 10 }}>
              {state.receivedAt ? new Date(state.receivedAt).toLocaleString() : ''}
            </span>
            <span style={{ fontFamily: MONO, color: MUTED, fontSize: 10 }}>
              Quarantined = codes failing terminology validation (retired / non-current code sets);
              held = identity below the EMPI auto-match threshold. Graph counts are the shared
              projected graph&rsquo;s cumulative size.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
