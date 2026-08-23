/**
 * Property-style tests — Golden Thread financial-clearance state machine
 * (src/lib/goldenThread/financialClearanceMachine.ts). Seeded generation via _prng.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  advance,
  FC_INITIAL,
  type FcContext,
  type FcEvent,
  type FcStage,
} from '@/lib/goldenThread/financialClearanceMachine';
import { bool, forCases, int, pick, type Rng } from './_prng';

const STAGES: FcStage[] = [
  'Launched',
  'Eligibility',
  'MedicalNecessity',
  'PriorAuth',
  'PatientEstimation',
  'Cleared',
  'Blocked',
];

function genEvent(rng: Rng): FcEvent {
  switch (int(rng, 0, 4)) {
    case 0:
      return { type: 'start' };
    case 1:
      return { type: 'eligibility-complete', active: bool(rng, 0.7) };
    case 2:
      return { type: 'med-nec-complete', requiresPA: bool(rng) };
    case 3:
      return { type: 'pa-complete', decision: pick(rng, ['approved', 'denied', 'more-info'] as const) };
    default:
      return { type: 'estimation-complete' };
  }
}

/** The machine's legal (state, event-type) pairs, per the module's documented design. */
const LEGAL: Record<FcStage, FcEvent['type'][]> = {
  Launched: ['start'],
  Eligibility: ['eligibility-complete'],
  MedicalNecessity: ['med-nec-complete'],
  PriorAuth: ['pa-complete'],
  PatientEstimation: ['estimation-complete'],
  Cleared: [],
  Blocked: [],
};

describe('financial clearance machine properties', () => {
  it('property: the machine is total — every state x event either transitions or rejects cleanly, never throws', () => {
    forCases(500, 0x707a1, (rng, i) => {
      const state = pick(rng, STAGES);
      const event = genEvent(rng);
      const context: FcContext = { completed: [], requiresPA: bool(rng) ? bool(rng) : undefined };
      let result!: ReturnType<typeof advance>;
      expect(() => {
        result = advance(state, event, context);
      }, `case ${i}: ${state} x ${event.type} threw`).not.toThrow();
      expect(STAGES).toContain(result.state);
      if (result.error !== undefined) {
        // A rejected transition must be a no-op: same state, untouched context.
        expect(result.state).toBe(state);
        expect(result.context).toBe(context);
        expect(result.error).toContain(event.type);
      }
    });
  });

  it('property: exactly the documented (state, event) pairs are accepted; all others rejected', () => {
    forCases(3, 0xe4a, (rng) => {
      for (const state of STAGES) {
        for (const evType of ['start', 'eligibility-complete', 'med-nec-complete', 'pa-complete', 'estimation-complete'] as const) {
          let event: FcEvent = genEvent(rng);
          while (event.type !== evType) event = genEvent(rng);
          const result = advance(state, event, { completed: [] });
          if (LEGAL[state].includes(evType)) {
            expect(result.error, `${state} x ${evType} should be legal`).toBeUndefined();
          } else {
            expect(result.error, `${state} x ${evType} should be rejected`).toBeDefined();
          }
        }
      }
    });
  });

  it('property: terminal states (Cleared, Blocked) are absorbing — no event escapes them', () => {
    forCases(200, 0xab5, (rng, i) => {
      const state = pick(rng, ['Cleared', 'Blocked'] as const);
      const result = advance(state, genEvent(rng), { completed: [] });
      expect(result.state, `case ${i}`).toBe(state);
      expect(result.error).toBeDefined();
    });
  });

  it('property: no random walk reaches Cleared without passing every human-gated stage in order', () => {
    /** With p=0.5, feed the state its expected event type (random payload) to make walks reach terminals. */
    function biasedEvent(rng: Rng, state: FcStage): FcEvent {
      if (!bool(rng, 0.5)) return genEvent(rng);
      const legal = LEGAL[state];
      if (legal.length === 0) return genEvent(rng);
      let e = genEvent(rng);
      while (e.type !== legal[0]) e = genEvent(rng);
      return e;
    }
    let clearedCount = 0;
    let clearedWithPa = 0;
    forCases(400, 0x9a7e, (rng, walk) => {
      let state: FcStage = FC_INITIAL;
      let context: FcContext = { completed: [] };
      const applied: FcEvent[] = [];
      for (let step = 0; step < 16 && state !== 'Cleared' && state !== 'Blocked'; step++) {
        const event = biasedEvent(rng, state);
        const result = advance(state, event, context);
        if (result.error === undefined) applied.push(event);
        state = result.state;
        context = result.context;
      }
      if (state === 'Cleared') {
        clearedCount++;
        if (context.requiresPA === true) clearedWithPa++;
        // Approved-class terminal state: every gate must have been passed explicitly.
        const types = applied.map((e) => e.type);
        expect(types, `walk ${walk}: skipped eligibility`).toContain('eligibility-complete');
        expect(types, `walk ${walk}: skipped medical necessity`).toContain('med-nec-complete');
        expect(types, `walk ${walk}: skipped estimation`).toContain('estimation-complete');
        expect(context.completed).toContain('Eligibility');
        expect(context.completed).toContain('MedicalNecessity');
        expect(context.completed).toContain('PatientEstimation');
        const elig = applied.find((e) => e.type === 'eligibility-complete');
        expect(elig && elig.type === 'eligibility-complete' && elig.active).toBe(true);
        if (context.requiresPA === true) {
          // The PA human gate can only be exited to Cleared via an explicit approval.
          const paApproved = applied.some(
            (e) => e.type === 'pa-complete' && e.decision === 'approved'
          );
          expect(paApproved, `walk ${walk}: PA required but no explicit approval on path`).toBe(true);
          expect(context.completed).toContain('PriorAuth');
        }
      }
      if (state === 'Blocked') {
        expect(context.blockedReason, `walk ${walk}: Blocked without a reason`).toBeTruthy();
      }
    });
    // Non-vacuity: the walks must actually exercise the approved-class terminal,
    // including the PA-gated route, or the property above proves nothing.
    expect(clearedCount).toBeGreaterThan(0);
    expect(clearedWithPa).toBeGreaterThan(0);
  });

  it('property: pa-complete more-info loops in PriorAuth without granting stage completion', () => {
    forCases(100, 0x10ef, (rng, i) => {
      const context: FcContext = { completed: ['Eligibility', 'MedicalNecessity'], requiresPA: true };
      const result = advance('PriorAuth', { type: 'pa-complete', decision: 'more-info' }, context);
      expect(result.state, `case ${i}`).toBe('PriorAuth');
      expect(result.error).toBeUndefined();
      expect(result.context.completed).not.toContain('PriorAuth');
      // rng consumed to keep the loop honest even though the case is fixed
      void rng();
    });
  });
});
