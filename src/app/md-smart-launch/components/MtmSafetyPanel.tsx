'use client';
/**
 * MtmSafetyPanel — displays MTM findings for physician review.
 *
 * Each finding shows as a coloured chip. Contraindicated findings disable
 * the submit button (hardBlock). Advisory findings require explicit
 * acknowledgement before the submit button enables.
 *
 * INVARIANT: this panel never auto-dismisses findings. The physician must
 *            click each acknowledgement checkbox.
 */
import React from 'react';
import type { MtmFinding, MtmSeverity } from '@/lib/agents/mtm/types';

interface Props {
  findings: MtmFinding[];
  acknowledged: Set<number>;
  onAcknowledge: (index: number) => void;
}

const SEVERITY_STYLES: Record<MtmSeverity, { bar: string; label: string; bg: string }> = {
  contraindicated: { bar: 'bg-[#c8102e]', label: 'Contraindicated', bg: 'bg-[#fef2f2]' },
  major: { bar: 'bg-[#ea580c]', label: 'Major', bg: 'bg-[#fff7ed]' },
  moderate: { bar: 'bg-[#ca8a04]', label: 'Moderate', bg: 'bg-[#fefce8]' },
  minor: { bar: 'bg-[#2563eb]', label: 'Minor', bg: 'bg-[#eff6ff]' },
  info: { bar: 'bg-[#6b7280]', label: 'Info', bg: 'bg-[#f9fafb]' },
};

export default function MtmSafetyPanel({ findings, acknowledged, onAcknowledge }: Props) {
  if (findings.length === 0) return null;

  return (
    <div className="mt-3 border border-[#e5e7eb] rounded-sm overflow-hidden">
      <div className="bg-[#1a2e45] text-white text-[11px] font-semibold px-3 py-1.5 tracking-wide uppercase">
        MTM Safety Review — {findings.length} finding{findings.length > 1 ? 's' : ''}
      </div>
      <div className="divide-y divide-[#e5e7eb]">
        {findings.map((f, i) => {
          const style = SEVERITY_STYLES[f.severity];
          const acked = acknowledged.has(i);
          return (
            <div key={i} className={`flex gap-2.5 px-3 py-2 ${style.bg}`}>
              <div className={`w-1 flex-shrink-0 rounded-full self-stretch ${style.bar}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm text-white ${style.bar}`}
                  >
                    {style.label}
                  </span>
                  <span className="text-[12px] font-semibold text-[#1a1a1a]">{f.headline}</span>
                </div>
                <p className="text-[11.5px] text-[#374151] mt-1 leading-snug">{f.detail}</p>
                {f.hardBlock ? (
                  <p className="text-[11px] font-bold text-[#c8102e] mt-1">
                    ⛔ Order blocked — contraindicated combination. Contact clinical pharmacist.
                  </p>
                ) : (
                  <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acked}
                      onChange={() => onAcknowledge(i)}
                      className="accent-[#2d4a63]"
                    />
                    <span className="text-[11px] text-[#5b6770]">
                      I have reviewed this finding and accept clinical responsibility
                    </span>
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
