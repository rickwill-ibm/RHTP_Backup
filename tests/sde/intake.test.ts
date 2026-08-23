import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import {
  intakeSignals,
  signalFromEvent,
  defaultTaxonomy,
  disposeBatch,
  defaultPolicyPack,
  createMemoryAuditSink,
  consentGranted,
  parsePolicyPack,
  parseTaxonomy,
  loadPolicyPack,
  SdeConfigError,
  type MemberContext,
} from '@/lib/sde';

const M = 'sde-demo-member';
const NOW = Date.parse('2026-08-22T08:00:00.000Z');

function ev(
  eventType: string,
  seq: number,
  payload: Record<string, unknown>,
  over: Partial<C2Event> = {},
): C2Event {
  return {
    eventId: `evt-${seq}`,
    eventType,
    eventVersion: '1.0',
    occurredAt: new Date(NOW - (10 - seq) * 60_000).toISOString(),
    recordedAt: new Date(NOW).toISOString(),
    memberId: M,
    partitionKey: M,
    class: 'stream',
    sequence: seq,
    correlationId: 'corr-1',
    idempotencyKey: `idem-${seq}`,
    source: { system: 'ace', feed: 'test' },
    consentContext: { part2Restricted: false },
    payload,
    ...over,
  };
}

// Nine C2 member events that mirror the seeded demo (from real envelopes).
function demoEvents(): C2Event[] {
  return [
    ev('care-gap.opened', 1, { measure: 'GSD', gap: 'CareGap/gsd' }),
    ev('encounter.discharged', 2, { encounter: 'Encounter/77' }),
    ev('assessment.submitted', 3, { instrument: 'PRAPARE' }),
    ev('referral.stalled', 4, { referral: 'ServiceRequest/12' }),
    ev('denial.issued', 5, { claim: 'Claim/9' }),
    ev('care-gap.opened', 6, { measure: 'GSD', gap: 'CareGap/gsd-dup' }), // duplicate of #1
    ev('bh.event.recorded', 7, { instrument: 'EPDS' }), // behavioral-health consent
    ev('care-gap.opened', 8, { measure: 'EED', gap: 'CareGap/eed' }), // superseded (EED closed)
    ev('engagement.window', 9, { channel: 'sms' }), // sms outside window -> delay
  ];
}

function ctx(): MemberContext {
  return {
    memberId: M,
    consentScopesGranted: ['care-outreach'],
    recentlyClosedMeasures: ['EED'],
    recentEdWithinHours: 12,
  };
}

describe('SDE intake — C2 events to signals via the taxonomy', () => {
  it('maps event types to signal kinds and builds dedupe keys from the payload', () => {
    const signals = intakeSignals(demoEvents(), defaultTaxonomy());
    expect(signals).toHaveLength(9);
    expect(signals[0].kind).toBe('care-gap.opened');
    expect(signals[0].dedupeKey).toBe(`care-gap:${M}:GSD`);
    expect(signals[5].dedupeKey).toBe(signals[0].dedupeKey); // duplicate collapses
    // Per-member ordering preserved from the outbox sequence.
    expect(signals.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('is idempotent on eventId (a re-delivered event does not double-count)', () => {
    const events = demoEvents();
    const withDup = [...events, events[0]]; // same eventId re-delivered
    expect(intakeSignals(withDup, defaultTaxonomy())).toHaveLength(9);
  });

  it('the real engine reproduces 5/3/1/one-touchpoint FROM the C2 event stream', () => {
    const signals = intakeSignals(demoEvents(), defaultTaxonomy());
    const batch = disposeBatch(signals, defaultPolicyPack(), ctx(), {
      now: () => NOW,
      audit: createMemoryAuditSink(),
      consentGranted,
    });
    expect(batch.summary).toEqual({ approved: 5, suppressed: 3, delayed: 1, touchpoints: 1 });
  });

  it('source-gated signals refuse honestly until a feed exists (missed.appointment)', () => {
    const e = ev('appointment.missed', 1, { appointment: 'Appt/1' });
    expect(signalFromEvent(e, defaultTaxonomy())).toBeNull();
  });

  it('Part 2 restricted events are dropped at intake unless the deployment is cleared', () => {
    const restricted = ev('bh.event.recorded', 1, { instrument: 'EPDS' }, {
      consentContext: { part2Restricted: true },
    });
    expect(signalFromEvent(restricted, defaultTaxonomy())).toBeNull();
    expect(signalFromEvent(restricted, defaultTaxonomy(), { part2Cleared: true })).not.toBeNull();
  });
});

describe('SDE config — invalid data refuses loudly', () => {
  it('an invalid policy pack throws SdeConfigError at parse', () => {
    expect(() => parsePolicyPack({ packId: 'x' })).toThrow(SdeConfigError);
  });

  it('an invalid taxonomy throws SdeConfigError at parse', () => {
    expect(() => parseTaxonomy({ version: '1', entries: [] })).toThrow(SdeConfigError);
  });

  it('loadPolicyPack retains the last valid pack when handed an invalid one', () => {
    const good = loadPolicyPack(defaultPolicyPack() as unknown);
    const kept = loadPolicyPack({ nonsense: true });
    expect(kept.packId).toBe(good.packId); // fell back to last valid, no throw
  });
});
