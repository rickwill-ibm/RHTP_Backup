'use client';
import React from 'react';
import { diffVersions, type ValueSetVersion } from '../governanceApi';

interface DiffViewProps {
  versions: ValueSetVersion[];
  fromId: string;
  toId: string;
  onFromChange: (id: string) => void;
  onToChange: (id: string) => void;
}

/** Member-level diff (added / removed / changed) between two chosen versions. */
export default function DiffView({ versions, fromId, toId, onFromChange, onToChange }: DiffViewProps) {
  const diff = diffVersions(fromId, toId);
  const selectCls = 'text-xs border border-carbon-gray-20 bg-white px-2 py-1 focus:outline-none focus:border-carbon-blue';

  return (
    <div className="bg-white border border-carbon-gray-20 p-5">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold">From version</span>
          <select className={selectCls} value={fromId} onChange={(e) => onFromChange(e.target.value)} aria-label="Diff from version">
            {versions.map((v) => <option key={v.versionId} value={v.versionId}>{v.version} ({v.state})</option>)}
          </select>
        </label>
        <span className="text-carbon-gray-50 pb-1.5" aria-hidden>→</span>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold">To version</span>
          <select className={selectCls} value={toId} onChange={(e) => onToChange(e.target.value)} aria-label="Diff to version">
            {versions.map((v) => <option key={v.versionId} value={v.versionId}>{v.version} ({v.state})</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DiffColumn title="Added" tone="add" codes={diff.added} />
        <DiffColumn title="Removed" tone="remove" codes={diff.removed} />
        <div>
          <p className="text-xs uppercase tracking-wide font-semibold text-carbon-gray-50 mb-2">Changed</p>
          {diff.changed.length === 0 ? (
            <p className="text-xs text-carbon-gray-50">No member display/status changes.</p>
          ) : (
            <ul className="space-y-1">
              {diff.changed.map((c) => (
                <li key={c.code} className="text-xs font-mono text-carbon-gray-70">{c.code}: {c.from} → {c.to}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffColumn({ title, tone, codes }: { title: string; tone: 'add' | 'remove'; codes: string[] }) {
  const pill = tone === 'add' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fff1f1] text-[#da1e28]';
  const sign = tone === 'add' ? '+' : '−';
  return (
    <div>
      <p className="text-xs uppercase tracking-wide font-semibold text-carbon-gray-50 mb-2">{title} ({codes.length})</p>
      {codes.length === 0 ? (
        <p className="text-xs text-carbon-gray-50">None.</p>
      ) : (
        <ul className="space-y-1">
          {codes.map((c) => (
            <li key={c} className={`text-xs font-mono px-2 py-1 inline-flex items-center gap-1 ${pill}`}>
              <span aria-hidden>{sign}</span> {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
