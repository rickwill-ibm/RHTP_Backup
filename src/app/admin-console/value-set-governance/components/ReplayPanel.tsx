'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { replayBinding, type ReplayResult, type ValueSetVersion } from '../governanceApi';

interface ReplayPanelProps {
  versions: ValueSetVersion[];
  /** Injectable read API (defaults to the module fn) so the binding read is testable. */
  replay?: (versionId: string, code: string) => ReplayResult;
}

/**
 * Version replay: pick a historical version, enter a sample code, and re-run the
 * binding as-of that version (reproduce a coding decision / preview a version
 * change). Available in BOTH admin and viewer modes.
 */
export default function ReplayPanel({ versions, replay = replayBinding }: ReplayPanelProps) {
  const [versionId, setVersionId] = useState<string>(versions[0]?.versionId ?? '');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ReplayResult | null>(null);

  function handleReplay(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setResult(replay(versionId, code));
  }

  return (
    <div className="bg-white border border-carbon-gray-20 p-5">
      <h3 className="text-sm font-semibold text-carbon-gray-100 mb-1">Version Replay</h3>
      <p className="text-xs text-carbon-gray-70 mb-4">Reproduce a code&apos;s binding result as-of a chosen historical version.</p>

      <form onSubmit={handleReplay} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold">Version</span>
          <select
            className="text-xs border border-carbon-gray-20 bg-white px-2 py-1.5 focus:outline-none focus:border-carbon-blue"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            aria-label="Replay version"
          >
            {versions.map((v) => <option key={v.versionId} value={v.versionId}>{v.version} ({v.state})</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold">Sample code</span>
          <input
            className="text-xs font-mono border border-carbon-gray-20 bg-white px-2 py-1.5 focus:outline-none focus:border-carbon-blue"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. Z59.41"
            aria-label="Sample code"
          />
        </label>
        <button
          type="submit"
          className="text-xs px-3 py-2 bg-carbon-blue text-white font-semibold hover:bg-[#0043ce] disabled:opacity-50 transition-colors"
          disabled={!code.trim()}
        >
          Replay Binding
        </button>
      </form>

      {result && (
        <div role="status" className="mt-4 p-3 bg-carbon-gray-10 border border-carbon-gray-20 flex items-center gap-3">
          <Icon name={result.member ? 'CheckCircleIcon' : 'XCircleIcon'} size={20} className={result.member ? 'text-[#24a148]' : 'text-[#da1e28]'} />
          <div className="text-xs text-carbon-gray-70">
            <p>
              Code <span className="font-mono font-semibold text-carbon-gray-100">{result.code}</span> against{' '}
              <span className="font-mono font-semibold text-carbon-gray-100">{result.version}</span>:
            </p>
            <p className="mt-1 flex items-center gap-2">
              <StatusBadge
                label={result.member ? 'In value set' : 'Not in value set'}
                variant={result.member ? 'success' : 'danger'}
                size="sm"
              />
              <span className="text-carbon-gray-50">as-of state: {result.asOfState}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
