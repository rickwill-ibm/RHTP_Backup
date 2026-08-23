/**
 * Corpus family G — Referrals & network adequacy. Executable scenario driving
 * the REAL adequacy engine (src/lib/networkAdequacy/*) over the bundled GA+SD
 * seed network.
 *
 * Covered runnable-now: UC-32 (specialist desert fails the in-person standard;
 * thresholds are configurable data, not constants — a config change alters the
 * result with no code change). The telehealth candidate-ranking / referral-list
 * clause is deferred to the referral engine and registered pending there.
 *
 * Other G cases (33/34/35/36/37) need referral state machines, closed-loop
 * platform integration, a read API, or provider-directory language data —
 * registered pending in the coverage registry.
 */
import { describe, it, expect } from 'vitest';
import {
  loadMockNetwork,
  computeCell,
  validateCell,
  type AdequacyInput,
  type AdequacyStandard,
} from '@/lib/networkAdequacy';

// A frontier reservation county with a specialist desert (Pine Ridge / Oglala
// Lakota, SD) — the representative "member in a county failing time/distance".
const DESERT = { county: 'Oglala Lakota', specialty: 'Pediatrics', lob: 'Medicaid' as const };

describe('UC-32 | Specialist desert fails the in-person adequacy standard', () => {
  const net = loadMockNetwork();

  it('the desert cell is a gap and is NON-COMPLIANT on the in-person standard', () => {
    const cell = computeCell(net, DESERT)!;
    expect(cell.state).toBe('SD');
    expect(cell.gapStatus).toBe(true);
    expect(cell.adequacyPct).toBeLessThan(50); // critical desert

    const validation = validateCell(net, DESERT)!;
    expect(validation.compliant).toBe(false);
    // The time/distance (in-person) standard is the failing one, and each option
    // is marked with the adequacy standard it satisfies/violates.
    const td = validation.checks.find((c) => c.standard === 'time-distance')!;
    expect(td.pass).toBe(false);
    expect(validation.checks.map((c) => c.standard).sort()).toEqual([
      'adequacy-target',
      'in-network-90',
      'ratio',
      'time-distance',
      'wait-time',
    ]);
  });

  it('thresholds are CONFIG DATA, not constants — a config change alters the result without deploy', () => {
    // Take the shipped Pediatrics standard and relax its time/distance bar far
    // enough that the same network now passes — proving the standard is an input,
    // not a hardcoded constant. No engine code changes between the two calls.
    const pedStd = net.standards.find((s) => s.specialty === 'Pediatrics')!;
    const relaxed: AdequacyStandard = {
      ...pedStd,
      maxDistanceMiles: 100000, // any provider anywhere satisfies distance
      requiredPer100k: 0, // capacity floor removed
      targetAdequacyPct: 0,
      minInNetworkPct: 0,
    };
    const relaxedInput: AdequacyInput = {
      ...net,
      standards: net.standards.map((s) => (s.specialty === 'Pediatrics' ? relaxed : s)),
    };
    const before = validateCell(net, DESERT)!;
    const after = validateCell(relaxedInput, DESERT)!;
    expect(before.compliant).toBe(false);
    expect(after.compliant).toBe(true);

    // And tightening in the OTHER direction changes it back — bidirectional,
    // driven purely by the standards data.
    const strict: AdequacyStandard = { ...pedStd, targetAdequacyPct: 100, minInNetworkPct: 100 };
    const strictInput: AdequacyInput = {
      ...net,
      standards: net.standards.map((s) => (s.specialty === 'Pediatrics' ? strict : s)),
    };
    expect(validateCell(strictInput, DESERT)!.compliant).toBe(false);
  });
});
