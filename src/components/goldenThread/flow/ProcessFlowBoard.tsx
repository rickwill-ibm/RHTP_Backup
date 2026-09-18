'use client';
/**
 * ProcessFlowBoard — the extended Golden-Thread swimlane (client).
 *
 * Six lanes (EMR/Provider · Provider Agent · Payer · Payer Agent · Surveillance/Arbiter ·
 * Shared Evidence Ledger) laid left→right across the 11 extended stages (EMR launch →
 * CRD → gold-card → DTR → PAS → payer-ops → claim → remittance → reconciliation →
 * recovery → surveillance). The ledger is a persistent hash-chained band every step writes to.
 * Selecting a stage opens the step-detail governance panel with the REAL Twin-Ladder verdict.
 *
 * CLIENT-SAFE: imports only the barrel-free `@/lib/goldenThread/e2eFlow` data spine and the
 * presentational Twin-Ladder / StatusBadge components — never the `@/lib/evidence` barrel.
 */
import { useState } from 'react';
import {
  STAGES as ALL_STAGES,
  LANE_LABEL,
  type FlowStage,
  type Lane,
  type StageKey,
} from '@/lib/goldenThread/e2eFlow';
import { TwinLadderBadge } from '@/components/goldenThread/TwinLadderBadge';
import { TwinLadderInterlock } from '@/components/goldenThread/TwinLadderInterlock';
import { PathAWhatIf } from '@/components/goldenThread/flow/PathAWhatIf';
import { ChannelMixChip } from '@/components/goldenThread/flow/ChannelMixChip';
import StatusBadge from '@/components/ui/StatusBadge';

const SWIMLANES: Lane[] = ['emr', 'provider-agent', 'payer', 'payer-agent', 'surveillance'];
const LANE_ACCENT: Record<Lane, string> = {
  emr: '#0f766e',
  'provider-agent': '#0e7490',
  payer: '#24427e',
  'payer-agent': '#5b3fa3',
  surveillance: '#b45309',
  ledger: '#161616',
};

export interface ProcessFlowBoardProps {
  stages?: FlowStage[];
  /** Reach a party workbench from a lane header. */
  onOpenParty?: (side: 'payer' | 'provider' | 'neutral') => void;
}

function laneParty(lane: Lane): 'payer' | 'provider' | 'neutral' | null {
  if (lane === 'payer' || lane === 'payer-agent') return 'payer';
  if (lane === 'emr' || lane === 'provider-agent') return 'provider';
  if (lane === 'surveillance') return 'neutral';
  return null;
}

export function ProcessFlowBoard({
  stages = ALL_STAGES,
  onOpenParty,
}: ProcessFlowBoardProps): React.ReactElement {
  const [selectedKey, setSelectedKey] = useState<StageKey>(stages[0]?.key ?? 'emr-launch');
  const byLaneSeq = new Map<string, FlowStage>();
  for (const s of stages) byLaneSeq.set(`${s.lane}:${s.seq}`, s);
  const selected = stages.find((s) => s.key === selectedKey) ?? stages[0];
  // Derive columns from the data (not a hardcoded 11) so a stages subset renders correctly.
  const seqs = Array.from(new Set(stages.map((s) => s.seq))).sort((a, b) => a - b);
  const nCols = seqs.length;
  const gridCols = `180px repeat(${nCols}, minmax(184px, 1fr))`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-carbon-gray-60">
          Scrub the thread left→right. Every step writes to the append-only hash-chained ledger
          lane; select a stage for its governance detail. Horizontal-scroll preserves the time axis.
        </p>
        <StatusBadge label="Prototype on seed data · mock channel" variant="warning" size="sm" />
      </div>

      {/* Swimlane track — horizontal scroll; vertical scroll stays with the shell */}
      <div className="overflow-x-auto rounded-lg border border-carbon-gray-20 bg-white">
        <div
          style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: 180 + nCols * 184 }}
        >
          {/* Header row: stage sequence numbers */}
          <div className="sticky left-0 z-10 border-b border-r border-carbon-gray-20 bg-carbon-gray-10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Lane / stage
          </div>
          {seqs.map((seq) => (
            <div
              key={`h-${seq}`}
              className="border-b border-carbon-gray-20 bg-carbon-gray-10 px-2 py-2 text-center text-[10px] font-semibold text-carbon-gray-50"
            >
              {seq}
            </div>
          ))}

          {/* One row per swimlane */}
          {SWIMLANES.map((lane) => {
            const party = laneParty(lane);
            return (
              <FlowLaneRow
                key={lane}
                lane={lane}
                party={party}
                accent={LANE_ACCENT[lane]}
                seqs={seqs}
                byLaneSeq={byLaneSeq}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                onOpenParty={onOpenParty}
              />
            );
          })}

          {/* Persistent hash-chained ledger band (spans the full track) */}
          <div
            className="sticky left-0 z-10 flex items-center gap-1 border-t-2 border-r px-3 py-3"
            style={{ background: '#0b1a2b', color: '#d6e4f2', borderTopColor: LANE_ACCENT.ledger }}
          >
            <span className="text-[11px] font-semibold">{LANE_LABEL.ledger}</span>
          </div>
          <div
            className="border-t-2 px-3 py-3"
            style={{
              gridColumn: `2 / span ${nCols}`,
              background: '#0b1a2b',
              borderTopColor: LANE_ACCENT.ledger,
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-[#13324f] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9fc2e0]">
                hash-chained · append-only (re-derivable, illustrative)
              </span>
              <span className="text-[11px] text-[#9fc2e0]">Stage {selected?.seq} writes →</span>
              <span className="mono text-[11px] text-[#eaf2fb]">{selected?.auditEntry}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step-detail governance panel */}
      {selected && <StepDetail stage={selected} accent={LANE_ACCENT[selected.lane]} />}
    </div>
  );
}

function FlowLaneRow({
  lane,
  party,
  accent,
  seqs,
  byLaneSeq,
  selectedKey,
  onSelect,
  onOpenParty,
}: {
  lane: Lane;
  party: 'payer' | 'provider' | 'neutral' | null;
  accent: string;
  seqs: number[];
  byLaneSeq: Map<string, FlowStage>;
  selectedKey: StageKey;
  onSelect: (k: StageKey) => void;
  onOpenParty?: (side: 'payer' | 'provider' | 'neutral') => void;
}): React.ReactElement {
  return (
    <>
      <div
        className="sticky left-0 z-10 border-b border-r border-carbon-gray-20 bg-white px-3 py-3"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <p className="text-[11px] font-semibold text-carbon-gray-90">{LANE_LABEL[lane]}</p>
        {party && onOpenParty && (
          <button
            type="button"
            onClick={() => onOpenParty(party)}
            className="mt-1 text-[10px] font-medium text-carbon-blue hover:underline"
          >
            Open workbench →
          </button>
        )}
      </div>
      {seqs.map((seq) => {
        const stage = byLaneSeq.get(`${lane}:${seq}`);
        if (!stage) {
          return (
            <div
              key={`${lane}-${seq}`}
              className="border-b border-carbon-gray-10 bg-[repeating-linear-gradient(90deg,transparent,transparent_10px,#f4f4f4_10px,#f4f4f4_11px)]"
            />
          );
        }
        const isSel = stage.key === selectedKey;
        const gated = stage.verdict.requiresHuman;
        return (
          <button
            key={`${lane}-${seq}`}
            type="button"
            onClick={() => onSelect(stage.key)}
            className={`m-1 rounded-md border p-2 text-left transition ${
              isSel
                ? 'border-carbon-blue bg-carbon-blue-lighter shadow-carbon'
                : 'border-carbon-gray-20 bg-white hover:border-carbon-blue-hover'
            }`}
          >
            <p className="text-[11px] font-semibold leading-tight text-carbon-gray-100">
              {stage.label}
            </p>
            {stage.emr && <p className="mono mt-0.5 text-[9px] text-carbon-gray-50">{stage.emr}</p>}
            <div className="mt-1 flex items-center gap-1">
              <span className="mono rounded bg-carbon-gray-10 px-1 text-[9px] text-carbon-gray-70">
                {stage.verdict.evidenceTier}→{stage.verdict.permittedRung}
              </span>
              <span
                className={`rounded px-1 text-[9px] font-semibold ${gated ? 'bg-carbon-yellow-light text-[#b45309]' : 'bg-carbon-green-light text-carbon-green'}`}
              >
                {gated ? 'human' : 'agent'}
              </span>
            </div>
          </button>
        );
      })}
    </>
  );
}

function StepDetail({ stage, accent }: { stage: FlowStage; accent: string }): React.ReactElement {
  const v = stage.verdict;
  return (
    <div className="ed-card p-4" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-[10px] uppercase tracking-wide text-carbon-gray-50">
            Stage {stage.seq} · {stage.actor}
          </p>
          <h3 className="text-base">{stage.label}</h3>
        </div>
        <StatusBadge
          label={v.requiresHuman ? 'Human-gated' : 'Agent may act'}
          variant={v.requiresHuman ? 'warning' : 'success'}
        />
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Decision captured">{stage.decision}</Field>
          <Field label="Ledger entry (hash-chained)">
            <span className="mono text-[11px]">{stage.auditEntry}</span>
          </Field>
          {stage.notification && (
            <Field label={`Notification · ${stage.notification.party}`}>
              {stage.notification.text}
            </Field>
          )}
          <Field label="Twin-Ladder verdict">
            <span className="block">{v.reason}</span>
            <div className="mt-1">
              <TwinLadderBadge tier={v.evidenceTier} agent={stage.actor} rung={v.permittedRung} />
            </div>
          </Field>
        </div>
        <div>
          <TwinLadderInterlock
            evidenceTier={v.evidenceTier}
            manifestTier={v.manifestTier}
            grantedRung={v.permittedRung}
            requiresHumanForSubmission={v.requiresHuman}
          />
        </div>
      </div>

      {/* Honest intake-channel mix (intake stages only) + an interactive Twin-Ladder what-if that
          recomputes through the real interlock without touching the governed run. */}
      <ChannelMixChip stage={stage} />
      <PathAWhatIf stage={stage} />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        {label}
      </p>
      <div className="mt-0.5 text-xs text-carbon-gray-90">{children}</div>
    </div>
  );
}
