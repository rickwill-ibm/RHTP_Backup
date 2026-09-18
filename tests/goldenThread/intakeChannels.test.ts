import { describe, it, expect } from 'vitest';
import {
  CHANNELS,
  STAGE_CHANNEL_MIX,
  CMS_0057F_NOTE,
  relabelLaunch,
  type IntakeChannel,
} from '@/lib/goldenThread/intakeChannels';

/**
 * intakeChannels — the honest multi-channel intake model. These lock that every intake stage's mix is
 * a real distribution (sums to 100), every channel has a provenance line, the launch relabel leads
 * with the dominant channel, and the CMS-0057-F timeline note states the 2026-clocks / 2027-API split.
 */
describe('intakeChannels — honest channel mix', () => {
  it('every stage channel mix sums to 100% and only names known channels', () => {
    const known = new Set(Object.keys(CHANNELS) as IntakeChannel[]);
    for (const [stage, mix] of Object.entries(STAGE_CHANNEL_MIX)) {
      const total = mix!.reduce((a, m) => a + m.pct, 0);
      expect(total, `stage ${stage} mix sums to 100`).toBe(100);
      for (const m of mix!) expect(known.has(m.channel)).toBe(true);
    }
  });

  it('every channel carries a label and a provenance line (a faxed intake still seals provenance)', () => {
    for (const meta of Object.values(CHANNELS)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.provenance.length).toBeGreaterThan(0);
    }
    // the point of the model: fax/mail is not FHIR but still writes a sealed provenance record
    expect(CHANNELS['fax-mail'].provenance.toLowerCase()).toContain('provenance');
  });

  it('relabelLaunch leads with the dominant channel share', () => {
    const label = relabelLaunch([
      { channel: 'x12-278-batch', pct: 30 },
      { channel: 'smart-fhir', pct: 55 },
      { channel: 'fax-mail', pct: 15 },
    ]);
    expect(label.startsWith('55%')).toBe(true);
  });

  it('the CMS-0057-F note states the 2026 clocks vs 2027 API split and excludes drug PA', () => {
    expect(CMS_0057F_NOTE).toMatch(/1\/1\/2026/);
    expect(CMS_0057F_NOTE).toMatch(/1\/1\/2027/);
    expect(CMS_0057F_NOTE.toLowerCase()).toContain('drug pa');
  });
});
