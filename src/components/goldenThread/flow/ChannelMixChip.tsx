'use client';
/**
 * ChannelMixChip — shows, on an intake stage, the honest MIX of channels a prior-auth / claim really
 * arrives through (SMART-on-FHIR, X12 278 batch, provider portal, fax/mail) with each channel's own
 * provenance line, plus a selector that re-labels the stage for a chosen channel so the thread reads
 * honestly for a batch-278 or faxed submission. The governance is channel-agnostic — the point is that
 * a faxed intake still earns a sealed provenance record. Local state only; writes nothing.
 *
 * CLIENT-SAFE: pure intake-channel data; no engine coupling, no barrel, no node.
 */
import { useState } from 'react';
import type { FlowStage } from '@/lib/goldenThread/e2eFlow';
import {
  CHANNELS,
  STAGE_CHANNEL_MIX,
  CMS_0057F_NOTE,
  type IntakeChannel,
} from '@/lib/goldenThread/intakeChannels';

const BAR_COLOR: Record<IntakeChannel, string> = {
  'smart-fhir': '#0f766e',
  'x12-278-batch': '#24427e',
  'provider-portal': '#5b3fa3',
  'fax-mail': '#8d8d8d',
};

export function ChannelMixChip({ stage }: { stage: FlowStage }): React.ReactElement | null {
  const mix = STAGE_CHANNEL_MIX[stage.key];
  const [sel, setSel] = useState<IntakeChannel | null>(null);
  if (!mix) return null;
  const chosen = sel ? CHANNELS[sel] : null;

  return (
    <div className="mt-3 rounded border border-carbon-gray-20 bg-white p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        Intake channel mix — not everything is SMART
      </p>
      <div
        className="mt-1 flex h-3 w-full overflow-hidden rounded-sm"
        title="Illustrative channel mix"
      >
        {mix.map((m) => (
          <span
            key={m.channel}
            style={{ width: `${m.pct}%`, background: BAR_COLOR[m.channel] }}
            title={`${CHANNELS[m.channel].label}: ${m.pct}%`}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {mix.map((m) => (
          <button
            key={m.channel}
            type="button"
            onClick={() => setSel(sel === m.channel ? null : m.channel)}
            className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${sel === m.channel ? 'border-carbon-blue bg-carbon-blue text-white' : 'border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10'}`}
          >
            {m.pct}% {CHANNELS[m.channel].label}
          </button>
        ))}
      </div>
      {chosen && (
        <p className="mt-1 rounded bg-carbon-gray-10 px-2 py-1 text-[10px] text-carbon-gray-80">
          <span className="font-semibold">If this thread arrived via {chosen.label}:</span>{' '}
          {chosen.provenance}
        </p>
      )}
      <p className="mt-1 text-[9px] italic text-carbon-gray-40">{CMS_0057F_NOTE}</p>
    </div>
  );
}
