/**
 * denialBaselines — drift guard (#501).
 *
 * Pins each cited baseline VALUE and its SOURCE LABEL so the figures can't
 * silently drift away from the verified source. If a value or source tag changes,
 * this test fails and forces a re-verification against the cited source.
 */
import { describe, it, expect } from 'vitest';
import {
  DENIAL_BASELINES,
  CMS_0057F_MILESTONES,
  SHIFT_LEFT_FRAMING,
} from '@/lib/policy/denialBaselines';

describe('denialBaselines (cited, defensible figures)', () => {
  const byId = Object.fromEntries(DENIAL_BASELINES.map((b) => [b.id, b]));

  it('pins the exact cited values and source tags', () => {
    expect(byId['aca-denial-rate']).toMatchObject({ value: '~19%', source: 'KFF 2024' });
    expect(byId['ma-pa-denied']).toMatchObject({ value: '~7.7%', source: 'KFF 2024' });
    expect(byId['ma-pa-appealed']).toMatchObject({ value: '~11.5%', source: 'KFF 2024' });
    expect(byId['ma-pa-appealed'].note).toContain('80.7%');
    expect(byId['pa-cost-manual']).toMatchObject({ value: '~$10.97', source: 'CAQH 2023' });
    expect(byId['pa-cost-electronic']).toMatchObject({ value: '~$5.79', source: 'CAQH 2023' });
    expect(byId['admin-waste']).toMatchObject({ value: '~$265.6B', source: 'JAMA 2019' });
  });

  it('grounds the ACA denial rate context (mostly not medical-necessity)', () => {
    expect(byId['aca-denial-rate'].note).toContain('5%');
    expect(byId['aca-denial-rate'].note?.toLowerCase()).toContain('medical-necessity');
  });

  it('does NOT use the disallowed "$20B admin waste" over-claim', () => {
    const blob = JSON.stringify(DENIAL_BASELINES);
    expect(blob).not.toContain('$20B');
    expect(blob).not.toContain('20 billion');
  });

  it('pins the CMS-0057-F milestones with correct effective dates and scope', () => {
    const cms = Object.fromEntries(CMS_0057F_MILESTONES.map((m) => [m.id, m]));
    expect(cms['process-metrics'].effective).toBe('2026-01-01');
    expect(cms['fhir-pa-api'].effective).toBe('2027-01-01');
    // Scope note: applies to MA/Medicaid/CHIP/QHP (not commercial); Da Vinci IGs recommended.
    expect(cms['fhir-pa-api'].note).toContain('not commercial');
    expect(cms['fhir-pa-api'].note?.toLowerCase()).toContain('recommended');
  });

  it('frames the panel as decision support, not a guarantee', () => {
    expect(SHIFT_LEFT_FRAMING.toLowerCase()).toContain('decision-support');
    expect(SHIFT_LEFT_FRAMING.toLowerCase()).toContain('not a guarantee');
  });

  it('is frozen (immutable at runtime)', () => {
    expect(Object.isFrozen(DENIAL_BASELINES)).toBe(true);
    expect(Object.isFrozen(CMS_0057F_MILESTONES)).toBe(true);
  });
});
