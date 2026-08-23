/**
 * Corpus family J — Agents & HITL. Executable scenario for the one J case whose
 * acceptance is exercisable today: UC-51 graceful degradation without the LLM.
 *
 * The deterministic engines (care planning, financial clearance, adequacy,
 * policy, identity) carry NO dependency on the Tier-B narration backbone. With
 * the model endpoint unconfigured: the deterministic acceptance paths still pass
 * end-to-end, while any attempt to reach the backbone fails LOUD with the named
 * BackboneNotConfiguredError — nothing silently blocks a care action.
 *
 * Other J cases (47/48/49/50) need the agent runtime / model-call capture →
 * registered pending in the coverage registry.
 */
import { describe, it, expect } from 'vitest';
import {
  assertBackbone,
  BackboneNotConfiguredError,
  liveEligibilityClient,
  livePriorAuthBackbone,
} from '@/lib/backbone/clients';
import { isBackboneConfigured, type BackboneConfig } from '@/lib/backbone/config';
import { advance, FC_INITIAL, type FcContext, type FcStage } from '@/lib/goldenThread/financialClearanceMachine';
import { loadMockNetwork, computeCell } from '@/lib/networkAdequacy';

// The outage condition: no backbone endpoints configured.
const OUTAGE: BackboneConfig = {};

describe('UC-51 | Graceful degradation without the LLM', () => {
  it('the narration backbone is reported unconfigured (outage condition)', () => {
    expect(isBackboneConfigured(OUTAGE)).toBe(false);
  });

  it('narration fails LOUD with BackboneNotConfiguredError — never silently', async () => {
    expect(() => assertBackbone('narration', OUTAGE)).toThrow(BackboneNotConfiguredError);
    await expect(
      liveEligibilityClient(OUTAGE).check({ memberId: 'm', payerId: 'p' })
    ).rejects.toThrow(BackboneNotConfiguredError);
    await expect(
      livePriorAuthBackbone(OUTAGE).pasSubmit({ claimBundle: {}, approvedBy: 'x' })
    ).rejects.toThrow(BackboneNotConfiguredError);
  });

  it('deterministic clearance still threads to Cleared with the backbone down', () => {
    let state: FcStage = FC_INITIAL;
    let context: FcContext = { completed: [] };
    for (const e of [
      { type: 'start' } as const,
      { type: 'eligibility-complete', active: true } as const,
      { type: 'med-nec-complete', requiresPA: false } as const,
      { type: 'estimation-complete' } as const,
    ]) {
      const t = advance(state, e, context);
      expect(t.error).toBeUndefined();
      state = t.state;
      context = t.context;
    }
    expect(state).toBe('Cleared'); // care action is NOT blocked by the outage
  });

  it('deterministic adequacy analytics still compute with the backbone down', () => {
    const net = loadMockNetwork();
    const cell = computeCell(net, { county: 'Fulton', specialty: 'Pediatrics', lob: 'Commercial' });
    expect(cell).not.toBeNull();
    expect(typeof cell!.adequacyPct).toBe('number');
  });
});
