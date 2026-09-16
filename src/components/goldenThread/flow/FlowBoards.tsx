'use client';
/**
 * FlowBoards — the single client child of EditorialShell that owns the view switch
 * (Flow ↔ Operations ↔ Workbench). Keeps the three boards single-responsibility; the
 * server page passes plain serializable props straight through.
 *
 * CLIENT-SAFE: imports only the barrel-free spine + the sibling boards.
 */
import { useState } from 'react';
import type { FlowStage, OpsTicket, ForensicEntry } from '@/lib/goldenThread/e2eFlow';
import type { WorkbenchAnalysis } from '@/components/goldenThread/AnalystWorkbench';
import { ProcessFlowBoard } from '@/components/goldenThread/flow/ProcessFlowBoard';
import { LiveProcessFlowBoard } from '@/components/goldenThread/flow/LiveProcessFlowBoard';
import { OperationsBoard } from '@/components/goldenThread/flow/OperationsBoard';
import { ReconciliationBoard } from '@/components/goldenThread/flow/ReconciliationBoard';
import { SurveillanceConsole } from '@/components/goldenThread/flow/SurveillanceConsole';
import { PartyWorkbench } from '@/components/goldenThread/flow/PartyWorkbench';
import { GainShareBoard } from '@/components/gainShare/GainShareBoard';
import { useOperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { SCENARIOS, scenarioList, type ScenarioId } from '@/lib/goldenThread/scenarios';

type View = 'flow' | 'operations' | 'reconciliation' | 'surveillance' | 'workbench' | 'gainshare';
type Side = 'payer' | 'provider' | 'neutral';

export interface FlowBoardsProps {
  stages: FlowStage[];
  tickets: OpsTicket[];
  forensic: ForensicEntry[];
  recordId: string;
  analyses: WorkbenchAnalysis[];
}

const TABS: Array<{ key: View; label: string }> = [
  { key: 'flow', label: 'Process flow' },
  { key: 'operations', label: 'Operations' },
  { key: 'reconciliation', label: 'Reconciliation' },
  { key: 'surveillance', label: 'Surveillance' },
  { key: 'workbench', label: 'Agent workbench' },
  { key: 'gainshare', label: 'Gain-Share' },
];

export function FlowBoards({
  stages,
  tickets,
  forensic,
  recordId,
  analyses,
}: FlowBoardsProps): React.ReactElement {
  const [view, setView] = useState<View>('flow');
  const [flowMode, setFlowMode] = useState<'live' | 'inspect'>('live');
  const [side, setSide] = useState<Side>('payer');
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [openTicketKey, setOpenTicketKey] = useState<string | null>(null);
  const op = useOperatingSim();

  const openParty = (s: Side): void => {
    setSide(s);
    setView('workbench');
  };

  // The operating loop: a ticket in the flow/Operations routes to its analyst persona's workbench.
  // Opening CLAIMS first — a New ticket is grabbed (New→Assigned, assignedTo sealed) before navigation,
  // so the analyst never lands in the workbench on an unassigned item with no SLA clock started.
  const openWorkbenchForTicket = (ticketId: string, s: Side, liveKey?: string): void => {
    if (liveKey) {
      const t = op.sim.tickets.find((x) => x.key === liveKey);
      if (t && t.status === 'New') op.grab(liveKey, t.operator);
    }
    setOpenTicketId(ticketId);
    setOpenTicketKey(liveKey ?? null);
    setSide(s);
    setView('workbench');
  };
  const clearOpenTicket = (): void => {
    setOpenTicketId(null);
    setOpenTicketKey(null);
  };

  const sc = SCENARIOS[op.scenario];

  return (
    <div className="space-y-4">
      {/* Scenario bar — the operating book's scenario (vocabulary + seed) governs every tab */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-carbon-gray-20 bg-white px-3 py-2">
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Scenario
          <select
            value={op.scenario}
            onChange={(e) => op.setScenario(e.target.value as ScenarioId)}
            className="rounded border border-carbon-gray-30 bg-white px-2 py-1 text-[12px] font-medium normal-case text-carbon-gray-90"
          >
            {scenarioList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="rounded-full bg-carbon-gray-10 px-2 py-0.5 text-[11px] font-medium text-carbon-gray-70">
          {sc.program}
        </span>
        {sc.member && (
          <span className="text-[11px] text-carbon-gray-70">
            <span className="font-semibold text-carbon-gray-90">{sc.member.name}</span> ·{' '}
            {sc.member.note} · clock: <span className="mono">{sc.clockCite}</span>
          </span>
        )}
      </div>
      {sc.fictionalOrgBanner && (
        <div
          className="rounded-lg border px-3 py-2 text-[11px]"
          style={{ borderColor: '#b4530955', background: '#fbf4e9', color: '#7a4a0a' }}
        >
          <span className="font-bold uppercase tracking-wide">⚑ Fictional scenario · </span>
          {sc.fictionalOrgBanner}
        </div>
      )}
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Golden Thread views"
        className="flex flex-wrap gap-1 border-b border-carbon-gray-20"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            onClick={() => setView(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition ${
              view === t.key
                ? 'border-carbon-blue text-carbon-blue'
                : 'border-transparent text-carbon-gray-60 hover:text-carbon-gray-90'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'flow' && (
        <div className="space-y-3">
          {/* Inspect mode renders the WA-Medicaid STAGES editorial (438.x/NABD); it is not yet re-grounded
              per-scenario, so under a non-default scenario the flow is live-only in this step. */}
          {op.scenario === 'wa-medicaid' && (
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                Mode
              </span>
              {(['live', 'inspect'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFlowMode(m)}
                  className={`rounded-full border px-3 py-0.5 text-[11px] font-medium capitalize transition ${
                    flowMode === m
                      ? 'border-carbon-blue bg-carbon-blue text-white'
                      : 'border-carbon-gray-30 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10'
                  }`}
                >
                  {m === 'live' ? 'Live run' : 'Inspect (governance detail)'}
                </button>
              ))}
            </div>
          )}
          {op.scenario === 'wa-medicaid' && flowMode === 'inspect' ? (
            <ProcessFlowBoard stages={stages} onOpenParty={openParty} />
          ) : (
            <LiveProcessFlowBoard op={op} onOpenTicket={openWorkbenchForTicket} />
          )}
        </div>
      )}
      {(view === 'surveillance' || view === 'workbench' || view === 'reconciliation') &&
      op.scenario !== 'wa-medicaid' ? (
        <div className="ed-card p-6 text-center">
          <p className="text-sm font-semibold text-carbon-gray-90">
            This tab is WA-Medicaid reference content.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-carbon-gray-60">
            The Reconciliation, Surveillance and Agent-workbench books are seeded with WA-Medicaid
            claims and analyses. For the <strong>{sc.label}</strong> scenario they are re-grounded
            in a later step. The
            <strong> Operations</strong> tab is live: it carries {sc.member?.name ?? 'the member'}’s
            governed ticket. Switch back to WA Medicaid to see the full reconciliation book.
          </p>
        </div>
      ) : (
        <>
          {view === 'operations' && (
            <OperationsBoard
              op={op}
              tickets={tickets}
              forensic={forensic}
              onOpenParty={openParty}
              onOpenTicket={openWorkbenchForTicket}
            />
          )}
          {view === 'reconciliation' && <ReconciliationBoard op={op} />}
          {view === 'surveillance' && (
            <SurveillanceConsole op={op} onOpenTicket={openWorkbenchForTicket} />
          )}
          {view === 'workbench' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {(['payer', 'provider', 'neutral'] as Side[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className={`rounded-full border px-3 py-0.5 text-[11px] font-medium capitalize transition ${
                      side === s
                        ? 'border-carbon-blue bg-carbon-blue text-white'
                        : 'border-carbon-gray-30 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <PartyWorkbench
                side={side}
                tickets={tickets}
                recordId={recordId}
                analyses={analyses}
                op={op}
                openTicketId={openTicketId}
                openTicketKey={openTicketKey}
                onClearOpenTicket={clearOpenTicket}
                onOpenTicket={openWorkbenchForTicket}
              />
            </div>
          )}
          {view === 'gainshare' && <GainShareBoard key={op.scenario} op={op} />}
        </>
      )}
    </div>
  );
}
