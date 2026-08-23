import { describe, it, expect } from 'vitest';
import { createMemoryOutboxStore, OutboxWriter } from '@/lib/outbox';
import { makePgMemStore } from './pgMem';
import { intent, makeAlarmSink, makeDeps, makeFakeFhir, makeQuarantineSink } from './fakes';

/**
 * OutboxWriter — the ADR-006 + amendment §2 mechanism. Intent commit -> confirmed
 * FHIR apply -> C2 event published in per-member sequence order; idempotent retry;
 * per-member FIFO. Headline flows run against pg-mem (real SQL).
 */

describe('OutboxWriter intent -> confirm -> event order (pg-mem)', () => {
  it('publishes events only after confirm, in per-member sequence order', async () => {
    const { store } = await makePgMemStore();
    const deps = makeDeps(store);
    const writer = new OutboxWriter(deps);

    for (const n of [1, 2, 3]) {
      await writer.enqueue(
        intent({ memberId: 'mem-a', idempotencyKey: `k-${n}`, fhirResourceId: `Coverage/cov-${n}` }),
      );
    }
    // Before pump: intent committed, but NO event exists yet.
    expect(deps.publisher.events).toHaveLength(0);

    const result = await writer.pump('mem-a');
    expect(result.published).toHaveLength(3);
    expect(deps.publisher.events.map((e) => e.sequence)).toEqual([0, 1, 2]);
    expect(deps.publisher.events.map((e) => e.idempotencyKey)).toEqual(['k-1', 'k-2', 'k-3']);
    expect(deps.fhir.applied).toEqual(['Coverage/cov-1', 'Coverage/cov-2', 'Coverage/cov-3']);
    expect((await store.get(result.published[0]))?.status).toBe('published');
    // Every published event validates against the C2 schema (partitionKey === memberId).
    for (const e of deps.publisher.events) expect(e.partitionKey).toBe(e.memberId);
  });

  it('is idempotent: duplicate enqueue and re-pump publish exactly once (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const deps = makeDeps(store);
    const writer = new OutboxWriter(deps);

    const a = await writer.enqueue(intent({ idempotencyKey: 'k-dup', fhirResourceId: 'Coverage/cov-x' }));
    const b = await writer.enqueue(intent({ idempotencyKey: 'k-dup', fhirResourceId: 'Coverage/cov-x' }));
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(true);

    await writer.pump('mem-a');
    await writer.pump('mem-a'); // re-pump must be a no-op
    expect(deps.publisher.events).toHaveLength(1);
    expect(deps.fhir.applied).toEqual(['Coverage/cov-x']); // FHIR applied once
  });
});

describe('OutboxWriter per-member FIFO', () => {
  it('holds a member on a transient failure; other members proceed', async () => {
    const store = createMemoryOutboxStore();
    const fhir = makeFakeFhir({ failResourceIds: new Set(['Coverage/cov-a1']), failCode: 'fhir-503' });
    const deps = makeDeps(store, { fhir, maxAttempts: 5 });
    const writer = new OutboxWriter(deps);

    await writer.enqueue(intent({ memberId: 'mem-a', idempotencyKey: 'a1', fhirResourceId: 'Coverage/cov-a1' }));
    await writer.enqueue(intent({ memberId: 'mem-a', idempotencyKey: 'a2', fhirResourceId: 'Coverage/cov-a2' }));
    await writer.enqueue(intent({ memberId: 'mem-b', idempotencyKey: 'b1', fhirResourceId: 'Coverage/cov-b1' }));

    const a = await writer.pump('mem-a');
    expect(a.stoppedOnTransient).not.toBeNull();
    expect(a.published).toHaveLength(0);
    // a2 must NOT have been applied before a1 confirms (FIFO).
    expect(deps.fhir.applied).not.toContain('Coverage/cov-a2');

    const b = await writer.pump('mem-b');
    expect(b.published).toHaveLength(1);
    expect(deps.publisher.events.map((e) => e.memberId)).toEqual(['mem-b']);
  });

  it('a terminal failure lets later intents for the member proceed', async () => {
    const store = createMemoryOutboxStore();
    const fhir = makeFakeFhir({ failResourceIds: new Set(['Coverage/cov-a1']) });
    const alarm = makeAlarmSink();
    const quarantine = makeQuarantineSink();
    const deps = makeDeps(store, { fhir, maxAttempts: 1, alarm, quarantine });
    const writer = new OutboxWriter(deps);

    await writer.enqueue(intent({ memberId: 'mem-a', idempotencyKey: 'a1', fhirResourceId: 'Coverage/cov-a1' }));
    await writer.enqueue(intent({ memberId: 'mem-a', idempotencyKey: 'a2', fhirResourceId: 'Coverage/cov-a2' }));

    const r = await writer.pump('mem-a');
    expect(r.failed).toHaveLength(1);
    expect(r.published).toHaveLength(1); // a2 proceeds past a1's terminal failure
    expect(alarm.raised).toHaveLength(1);
    expect(quarantine.items).toHaveLength(1);
    expect(deps.publisher.events[0].idempotencyKey).toBe('a2');
    expect(deps.publisher.events[0].sequence).toBe(0); // a1 never took a sequence
  });
});
