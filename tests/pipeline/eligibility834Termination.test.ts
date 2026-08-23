/**
 * 834 INS-3 maintenance-type fidelity (register F1, CRITICAL).
 *
 * Before the fix the adapter ignored INS-3 and hardcoded `status: 'active'`, so a
 * TERMINATION transaction (INS-3 024) re-enrolled the member instead of
 * disenrolling. This pins the add-vs-term distinction:
 *   - an add (021) -> active coverage, coverage.enrolled;
 *   - a termination (024 + DTP*349 end) -> terminated / disenrolled coverage,
 *     coverage.terminated, with the coverage END carried;
 *   - an UNKNOWN INS-3 (999) is fail-closed (quarantined), never silently active.
 */
import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  eligibility834Adapter,
  landStage,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import term from './fixtures/eligibility834-termination.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

describe('834 INS-3 maintenance-type handling', () => {
  const landed = land({
    source: eligibility834Adapter.source,
    format: 'x12-834',
    payload: term.payload,
  });
  const out = batchStep(eligibility834Adapter)(landed, deps);

  it('an add (INS-3 021) yields ACTIVE coverage', () => {
    const add = out.normalized.find((r) => r.idempotencyKey.includes('SUB010'));
    expect(add).toBeDefined();
    expect(add!.eventType).toBe('coverage.enrolled');
    expect(add!.payload).toMatchObject({ status: 'active', disenrolled: false, periodStart: '2026-01-01' });
  });

  it('a termination (INS-3 024 + DTP*349) DISENROLLS, not re-enrolls', () => {
    const t = out.normalized.find((r) => r.idempotencyKey.includes('SUB011'));
    expect(t).toBeDefined();
    // The load-bearing assertion: NOT active.
    expect(t!.payload.status).toBe('terminated');
    expect(t!.payload.disenrolled).toBe(true);
    expect(t!.eventType).toBe('coverage.terminated');
    expect(t!.payload.periodEnd).toBe('2026-06-30');
    // Anchored member id, never the raw subscriber id; no PHI in the payload.
    expect(t!.memberId).toMatch(/^mem-/);
    expect(JSON.stringify(t!.payload)).not.toContain('TERMTWO');
  });

  it('an unknown INS-3 code is fail-closed (quarantined), never silently active', () => {
    const q = out.quarantined.find((r) => r.sourceRef === 'SUB012');
    expect(q).toBeDefined();
    expect(q!.reasonCodes).toContain('unknown-maintenance-type');
    // It must NOT have slipped through as a normalized active coverage.
    expect(out.normalized.some((r) => r.idempotencyKey.includes('SUB012'))).toBe(false);
  });

  it('only the two known transactions normalize; the unknown is rejected', () => {
    expect(out.normalized).toHaveLength(2);
    expect(out.quarantined).toHaveLength(1);
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
  });
});
