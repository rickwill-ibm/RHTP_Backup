/**
 * NS-04: the SDE intake no longer double-produces on an outbox republish.
 *
 * `intakeSignalsDurable` replaces the per-call in-memory Set with the durable
 * idempotency store, keyed by eventId under consumer 'sde-intake'. A re-delivered
 * event stream (the at-least-once republish) produces NO new signals, because the
 * store already marked every eventId — across calls, not just within one fold.
 */
import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import { intakeSignals, intakeSignalsDurable, defaultTaxonomy } from '@/lib/sde';
import { createMemoryIdempotencyStore, IDEMPOTENCY_CONSUMERS } from '@/lib/idempotency';

const M = 'sde-demo-member';
const NOW = Date.parse('2026-08-22T08:00:00.000Z');

function ev(eventType: string, seq: number, payload: Record<string, unknown>): C2Event {
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
  };
}

function demoEvents(): C2Event[] {
  return [
    ev('care-gap.opened', 1, { measure: 'GSD', gap: 'CareGap/gsd' }),
    ev('encounter.discharged', 2, { encounter: 'Encounter/77' }),
    ev('assessment.submitted', 3, { instrument: 'PRAPARE' }),
    ev('referral.stalled', 4, { referral: 'ServiceRequest/12' }),
    ev('denial.issued', 5, { claim: 'Claim/9' }),
  ];
}

describe('SDE durable intake (NS-04)', () => {
  it('first delivery produces signals; a full republish produces zero (durable dedupe)', async () => {
    const store = createMemoryIdempotencyStore('t');
    const tax = defaultTaxonomy();
    const first = await intakeSignalsDurable(demoEvents(), tax, { store });
    expect(first).toHaveLength(5);

    // Re-deliver the identical stream (the outbox at-least-once republish).
    const second = await intakeSignalsDurable(demoEvents(), tax, { store });
    expect(second).toHaveLength(0); // every eventId already marked -> no double-produce
  });

  it('a partial republish only re-emits the genuinely new events', async () => {
    const store = createMemoryIdempotencyStore('t');
    const tax = defaultTaxonomy();
    await intakeSignalsDurable(demoEvents(), tax, { store });

    const extended = [...demoEvents(), ev('engagement.window', 9, { channel: 'sms' })];
    const out = await intakeSignalsDurable(extended, tax, { store });
    expect(out).toHaveLength(1); // only evt-9 is new
    expect(out[0].signalId).toBe('evt-9');
  });

  it('an in-batch duplicate eventId collapses to one (same as the sync form)', async () => {
    const store = createMemoryIdempotencyStore('t');
    const events = demoEvents();
    const withDup = [...events, events[0]]; // same eventId twice in one batch
    const out = await intakeSignalsDurable(withDup, defaultTaxonomy(), { store });
    expect(out).toHaveLength(5);
    // Same taxonomy mapping as the sync intake for a single (non-republished) call.
    expect(out.map((s) => s.kind)).toEqual(intakeSignals(events, defaultTaxonomy()).map((s) => s.kind));
  });

  it('uses the sde-intake consumer namespace (agents dedupe independently)', async () => {
    const store = createMemoryIdempotencyStore('t');
    await intakeSignalsDurable(demoEvents(), defaultTaxonomy(), { store });
    // The intake marked evt-1 under 'sde-intake'; an agent claiming the same
    // eventId under its own consumer still sees a FIRST claim.
    expect(await store.isProcessed(IDEMPOTENCY_CONSUMERS.sdeIntake, 'evt-1')).toBe(true);
    expect((await store.markProcessed(IDEMPOTENCY_CONSUMERS.outreachAgent, 'evt-1')).firstProcessed).toBe(true);
  });
});
