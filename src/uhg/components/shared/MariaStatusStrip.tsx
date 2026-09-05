'use client';

import React from 'react';
import { useDemoStore } from '@/uhg/store/demoStore';
import { personaFor } from '@/uhg/data/persona';

export type MariaStatusState = 'fragmented' | 'resolving' | 'known' | 'active' | 'resolved';

interface MariaStatusStripProps {
  state?: MariaStatusState;
  authStatus?: string;
  careGapStatus?: string;
  episodeStatus?: string;
  visible?: boolean;
  showMtmAlert?: boolean;
  showSdoh?: boolean;
}

const STATUS_CONFIGS: Record<MariaStatusState, { label: string; color: string; bg: string; border: string }> = {
  fragmented: { label: 'FRAGMENTED', color: '#fa4d56', bg: 'rgba(250,77,86,0.12)', border: 'rgba(250,77,86,0.35)' },
  resolving: { label: 'RESOLVING', color: '#f1c21b', bg: 'rgba(241,194,27,0.12)', border: 'rgba(241,194,27,0.35)' },
  known: { label: 'KNOWN', color: '#42be65', bg: 'rgba(66,190,101,0.12)', border: 'rgba(66,190,101,0.35)' },
  active: { label: 'ORCHESTRATING', color: '#78a9ff', bg: 'rgba(120,169,255,0.15)', border: 'rgba(120,169,255,0.4)' },
  resolved: { label: 'RESOLVED', color: '#42be65', bg: 'rgba(66,190,101,0.15)', border: 'rgba(66,190,101,0.4)' },
};

const cell = { borderRight: '1px solid rgba(57,57,57,0.6)' };
const lbl = { fontSize: '11px', color: '#8d8d8d', letterSpacing: '0.06em' } as const;

export default function MariaStatusStrip({
  state = 'known',
  authStatus,
  careGapStatus,
  episodeStatus,
  visible = true,
  showMtmAlert = true,
  showSdoh = true,
}: MariaStatusStripProps) {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const p = personaFor(activeCitizenId);
  if (!visible) return null;

  const cfg = STATUS_CONFIGS[state];
  // Always reflect the selected citizen (default Maria Redhawk); ignore legacy payer props.
  void authStatus; void careGapStatus; void episodeStatus;
  const bh = p.bhStatus;
  const gap = p.careGap;
  const episode = p.episode;

  return (
    <div className="flex-shrink-0 flex items-center gap-0 overflow-hidden" style={{ borderBottom: '1px solid rgba(57,57,57,0.6)', background: '#262626', height: 36 }}>
      <div className="flex items-center gap-2 px-4 h-full flex-shrink-0" style={{ borderRight: '1px solid rgba(57,57,57,0.6)', background: '#393939' }}>
        <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, background: 'rgba(250,77,86,0.2)', border: '1.5px solid rgba(250,77,86,0.5)', fontSize: '9px', color: 'white', fontWeight: 700 }}>{p.initials}</div>
        <span className="font-semibold text-white" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{p.name}, {p.age}</span>
        <span className="font-mono" style={{ fontSize: '11px', color: '#8d8d8d' }}>{p.id}</span>
      </div>
      <div className="flex items-center gap-2 px-4 h-full flex-shrink-0" style={cell}>
        <span style={lbl}>RISK</span>
        <span className="font-mono font-semibold" style={{ fontSize: '13px', color: p.riskColor }}>{p.riskLabel}</span>
      </div>
      <div className="flex items-center gap-2 px-4 h-full flex-shrink-0" style={cell}>
        <span style={lbl}>BH</span>
        <span className="font-mono" style={{ fontSize: '12px', color: bh.includes('✓') ? '#42be65' : '#f1c21b', whiteSpace: 'nowrap' }}>{bh}</span>
      </div>
      <div className="flex items-center gap-2 px-4 h-full flex-shrink-0" style={cell}>
        <span style={lbl}>CARE GAP</span>
        <span className="font-mono" style={{ fontSize: '12px', color: gap.includes('✓') ? '#42be65' : '#fa4d56', whiteSpace: 'nowrap' }}>{gap}</span>
      </div>
      <div className="flex items-center gap-2 px-4 h-full flex-shrink-0" style={cell}>
        <span style={lbl}>EPISODE</span>
        <span style={{ fontSize: '12px', color: '#c6c6c6', whiteSpace: 'nowrap' }}>{episode}</span>
      </div>
      {showMtmAlert && p.clinicalAlert && (
        <div className="flex items-center gap-1.5 px-3 h-full flex-shrink-0" style={cell}>
          <div className="flex items-center gap-1.5 rounded px-2 py-0.5" style={{ background: 'rgba(250,77,86,0.15)', border: '1px solid rgba(250,77,86,0.45)' }}>
            <span style={{ fontSize: '11px', color: '#fa4d56', lineHeight: 1 }}>⚠</span>
            <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#fa4d56', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{p.clinicalAlert}</span>
          </div>
        </div>
      )}
      {showSdoh && (
        <div className="flex items-center gap-1.5 px-3 h-full flex-shrink-0" style={cell}>
          <div className="flex items-center gap-1.5 rounded px-2 py-0.5" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
            <span style={{ fontSize: '10px', color: '#f59e0b', lineHeight: 1 }}>◈</span>
            <span className="font-mono font-semibold" style={{ fontSize: '10px', color: '#f59e0b', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{p.sdoh}</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 px-4 h-full flex-shrink-0">
        <div className="flex items-center gap-2 rounded px-2.5 py-0.5" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
          <div className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: cfg.color, animation: state === 'active' || state === 'resolving' ? 'authPulse 1.2s ease-in-out infinite' : 'none' }} />
          <span className="font-mono font-semibold" style={{ fontSize: '11px', color: cfg.color, letterSpacing: '0.08em' }}>{cfg.label}</span>
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 px-4 h-full flex-shrink-0" style={{ borderLeft: '1px solid rgba(57,57,57,0.6)' }}>
        <span style={{ fontSize: '12px', color: '#6f6f6f' }}>{p.population}</span>
      </div>
    </div>
  );
}
