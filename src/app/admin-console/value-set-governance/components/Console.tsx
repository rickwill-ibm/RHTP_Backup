'use client';
import React, { useMemo, useState } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import VersionList from './VersionList';
import DiffView from './DiffView';
import WorkflowGates from './WorkflowGates';
import HistoryTimeline from './HistoryTimeline';
import ReplayPanel from './ReplayPanel';
import {
  governanceModeForRole,
  listValueSetVersions,
  getVersionHistory,
  type ConsoleMode,
  type GovernancePrincipal,
  type ReplayResult,
} from '../governanceApi';

interface ConsoleProps {
  principal: GovernancePrincipal;
  /** Injectable replay read API for testing the read seam. */
  replay?: (versionId: string, code: string) => ReplayResult;
}

type Tab = 'versions' | 'diff' | 'history' | 'replay';

/**
 * Dual-mode value-set governance console. Mode is derived from the principal's
 * role (no new auth): admin = full workflow controls; viewer = read + replay only
 * (the submit/approve/reject controls are not rendered).
 */
export default function ValueSetGovernanceConsole({ principal, replay }: ConsoleProps) {
  const mode: ConsoleMode = governanceModeForRole(principal.govRole);
  const versions = useMemo(() => listValueSetVersions(), []);
  const history = useMemo(() => getVersionHistory(), []);

  const [tab, setTab] = useState<Tab>('versions');
  const [selectedId, setSelectedId] = useState<string>(versions[0]?.versionId ?? '');
  const [fromId, setFromId] = useState<string>(versions[versions.length - 1]?.versionId ?? '');
  const [toId, setToId] = useState<string>(versions[0]?.versionId ?? '');

  const selected = versions.find((v) => v.versionId === selectedId) ?? versions[0];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'versions', label: 'Versions' },
    { key: 'diff', label: 'Diff' },
    { key: 'history', label: 'History' },
    { key: 'replay', label: 'Replay' },
  ];

  return (
    <div data-testid="vsg-console" data-mode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-carbon-gray-70">
          Asset: <span className="font-semibold text-carbon-gray-100">{versions[0]?.assetName ?? '—'}</span>
        </p>
        <StatusBadge
          label={mode === 'admin' ? 'Admin mode — full controls' : 'Viewer mode — read + replay'}
          variant={mode === 'admin' ? 'info' : 'neutral'}
          size="sm"
        />
      </div>

      <div className="flex gap-2 mb-4" role="tablist" aria-label="Governance views">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-carbon-blue text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'versions' && (
        <div className="space-y-4">
          <VersionList versions={versions} selectedId={selectedId} onSelect={setSelectedId} />
          {mode === 'admin' && selected && <WorkflowGates version={selected} principal={principal} />}
          {mode === 'viewer' && (
            <p className="text-xs text-carbon-gray-50 italic">
              Viewer mode: approval controls are hidden. Use History and Replay to review governance.
            </p>
          )}
        </div>
      )}

      {tab === 'diff' && (
        <DiffView versions={versions} fromId={fromId} toId={toId} onFromChange={setFromId} onToChange={setToId} />
      )}

      {tab === 'history' && <HistoryTimeline events={history} />}

      {tab === 'replay' && <ReplayPanel versions={versions} replay={replay} />}
    </div>
  );
}
