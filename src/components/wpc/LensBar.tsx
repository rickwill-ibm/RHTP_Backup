'use client';
// LensBar — the WPC lens selector row (domain lenses + derived relationship lenses).
//
// Phase 5C: empty domain lenses (only the member anchor present → no active findings
// for this member) are no longer rendered as a row of greyed, non-selectable tabs.
// They collapse into a single "✓ N clear" chip that preserves the checked-&-clear
// signal while killing the clutter (e.g. Robert's Eligibility / Agent domains).
//
// Golden-safe: a member whose domains all have findings (Maria) shows NO chip and an
// identical tab row to before — the chip only appears when at least one domain is clear.
//
// Follows the extracted-component convention: local palette, no import of page DARK.

import React from 'react';
import type { LensDescriptor } from '@/lib/wpcGraph/lensUtils';

type ExtendedLensType = string;
const DARK = { border: '#1a1a2e', borderBright: '#252540', textMuted: '#64748b' };
const CLEAR = '#42be65'; // carbon green-40 — "screened & clear"

export function DarkLensBar({
  activeLens,
  onLensChange,
  onShowCypher,
  registry,
}: {
  activeLens: ExtendedLensType;
  onLensChange: (l: ExtendedLensType) => void;
  onShowCypher: () => void;
  registry: LensDescriptor[];
}) {
  const rels = registry.filter((l) => l.kind === 'relationship');
  const domains = registry.filter((l) => l.kind !== 'relationship');
  // count <= 1 ⇒ member anchor only ⇒ no active findings in this domain for this member.
  const shown = domains.filter((l) => l.id === 'all' || l.count > 1);
  const clear = domains.filter((l) => l.id !== 'all' && l.count <= 1);

  const tab = (ld: LensDescriptor) => {
    const isActive = activeLens === ld.id;
    return (
      <button
        key={ld.id}
        onClick={() => onLensChange(ld.id)}
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-semibold whitespace-nowrap flex-shrink-0 transition-all"
        style={{
          background: isActive ? ld.color + '25' : 'transparent',
          border: `1px solid ${isActive ? ld.color : DARK.border}`,
          color: isActive ? ld.color : DARK.textMuted,
          boxShadow: isActive ? `0 0 10px ${ld.color}44` : 'none',
          cursor: 'pointer',
        }}
      >
        {ld.label}
        <span className="opacity-60 text-xs ml-1">{ld.count}N</span>
      </button>
    );
  };

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 overflow-x-auto flex-shrink-0"
      style={{ background: '#080812', borderBottom: `1px solid ${DARK.border}` }}
    >
      <span
        className="text-xs font-mono font-semibold flex-shrink-0"
        style={{ color: DARK.textMuted }}
      >
        LENS
      </span>
      {shown.map(tab)}
      {clear.length > 0 && (
        <div
          title={`Screened · no active findings for this member: ${clear.map((c) => c.label).join(', ')}`}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-semibold whitespace-nowrap flex-shrink-0"
          style={{
            background: CLEAR + '17',
            border: `1px solid ${CLEAR}55`,
            color: CLEAR,
            cursor: 'default',
          }}
        >
          <span aria-hidden="true">✓</span> {clear.length} clear
        </div>
      )}
      {rels.length > 0 && (
        <div className="w-px h-5 flex-shrink-0" style={{ background: DARK.borderBright }} />
      )}
      {rels.map(tab)}
      <div className="flex-1" />
      <button
        onClick={onShowCypher}
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono whitespace-nowrap flex-shrink-0"
        style={{ background: '#0d0d20', border: `1px solid ${DARK.border}`, color: DARK.textMuted }}
      >
        {'</>'} VIEW CYPHER
      </button>
    </div>
  );
}
