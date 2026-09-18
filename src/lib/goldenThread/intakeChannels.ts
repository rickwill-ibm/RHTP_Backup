/**
 * intakeChannels — the honest intake-channel model. Prior-auth and claims do NOT all arrive over
 * SMART-on-FHIR: the real mix is Da Vinci FHIR (CDS-Hooks/DTR/PAS), batch X12 278, provider portals,
 * and still fax/phone/mail for some providers for years. This module carries an illustrative channel
 * MIX per intake stage plus each channel's provenance line, so the flow reads "governance is the same
 * regardless of how it arrived" instead of implying an all-FHIR world.
 *
 * PURE + CLIENT-SAFE (type-only import of StageKey; no engine coupling, no barrel, no node). Keyed by
 * StageKey so the frozen FlowStage model is not touched.
 *
 * HONESTY (CMS-0057-F): the decision-time CLOCKS (72h expedited / 7-calendar-day standard prior auth)
 * bind from 1/1/2026, but the Prior Authorization FHIR API is not required until 1/1/2027 — so through
 * 2026 credible payers hit the timeframes over X12 278, portals and manual channels, not the API. The
 * clocks do NOT apply to drug prior authorizations.
 */
import type { StageKey } from '@/lib/goldenThread/e2eFlow';

export type IntakeChannel = 'smart-fhir' | 'x12-278-batch' | 'provider-portal' | 'fax-mail';

export interface ChannelMeta {
  id: IntakeChannel;
  label: string;
  provenance: string; // the provenance line a thread from this channel seals
}

export const CHANNELS: Readonly<Record<IntakeChannel, ChannelMeta>> = Object.freeze({
  'smart-fhir': {
    id: 'smart-fhir',
    label: 'SMART on FHIR / CDS-Hooks',
    provenance:
      'SMART launch captured (iss, patient ref masked, encounter); Da Vinci CRD/DTR context.',
  },
  'x12-278-batch': {
    id: 'x12-278-batch',
    label: 'X12 278 (batch EDI)',
    provenance:
      '278 request received in a batch run; 275 attachments linked; provenance = EDI envelope.',
  },
  'provider-portal': {
    id: 'provider-portal',
    label: 'Provider portal',
    provenance:
      'Portal submission captured (authenticated provider session); keyed entry, no FHIR context.',
  },
  'fax-mail': {
    id: 'fax-mail',
    label: 'Fax / mail',
    provenance:
      'Faxed/mailed request scanned & indexed; a sealed provenance record is written all the same.',
  },
});

export interface ChannelMix {
  channel: IntakeChannel;
  pct: number; // illustrative share; the mix per stage sums to 100
}

/** Illustrative channel mix for the intake stages only (data, not swimlanes). */
export const STAGE_CHANNEL_MIX: Partial<Record<StageKey, ChannelMix[]>> = {
  'emr-launch': [
    { channel: 'smart-fhir', pct: 45 },
    { channel: 'x12-278-batch', pct: 30 },
    { channel: 'provider-portal', pct: 18 },
    { channel: 'fax-mail', pct: 7 },
  ],
  'pas-submit': [
    { channel: 'smart-fhir', pct: 40 },
    { channel: 'x12-278-batch', pct: 38 },
    { channel: 'provider-portal', pct: 15 },
    { channel: 'fax-mail', pct: 7 },
  ],
};

export const CMS_0057F_NOTE =
  'Illustrative channel mix — not all-SMART. CMS-0057-F prior-auth decision clocks (72h expedited / 7 calendar days standard) bind from 1/1/2026; the Prior Authorization FHIR API is not required until 1/1/2027, so 2026 volume still flows largely over X12 278, portals and fax. Clocks do not apply to drug PA.';

/** An honest one-line label for the launch stage given the mix (leads with the dominant channel). */
export function relabelLaunch(mix: ChannelMix[]): string {
  const top = [...mix].sort((a, b) => b.pct - a.pct);
  return top.map((m) => `${m.pct}% ${CHANNELS[m.channel].label}`).join(' · ');
}
