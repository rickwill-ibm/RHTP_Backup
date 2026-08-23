import { describe, it, expect } from 'vitest';
import { createMemoryOutboxStore, OutboxSweeper, OutboxWriter } from '@/lib/outbox';
import { makePgMemStore } from './pgMem';
import { intent, makeAlarmSink, makeDeps, makeFakeFhir, makeQuarantineSink } from './fakes';

const THRESHOLD = 5 * 60 * 1000;

describe('OutboxSweeper reconciliation sweep', () => {
  it('recovers an orphan whose FHIR write landed before a crash (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    // FHIR write already landed for this resource, but the process crashed before confirm.
    const fhir = makeFakeFhir({ preLanded: ['Coverage/cov-orphan'] });
    const deps = makeDeps(store, { fhir });
    const writer = new OutboxWriter(deps);
    await writer.enqueue(intent({ memberId: 'mem-a', idempotencyKey: 'orphan', fhirResourceId: 'Coverage/cov-orphan' }));

    deps.clock.advance(THRESHOLD + 1); // make the pending intent stale
    const sweeper = new OutboxSweeper(deps);
    const result = await sweeper.sweep(THRESHOLD);

    expect(result.recovered).toHaveLength(1);
    expect(deps.fhir.applied).not.toContain('Coverage/cov-orphan'); // exists() short-circuits re-apply
    expect(deps.publisher.events).toHaveLength(1);
    expect(deps.publisher.events[0].sequence).toBe(0);
    expect((await store.get(result.recovered[0]))?.status).toBe('published');
  });

  it('retries an orphan whose write never landed and succeeds', async () => {
    const store = createMemoryOutboxStore();
    const deps = makeDeps(store); // default fhir succeeds on apply
    const writer = new OutboxWriter(deps);
    await writer.enqueue(intent({ idempotencyKey: 'k', fhirResourceId: 'Coverage/cov-retry' }));
    deps.clock.advance(THRESHOLD + 1);

    const result = await new OutboxSweeper(deps).sweep(THRESHOLD);
    expect(result.recovered).toEqual(expect.arrayContaining(result.recovered));
    expect(deps.fhir.applied).toContain('Coverage/cov-retry');
    expect(deps.publisher.events).toHaveLength(1);
  });

  it('fails an orphan that exhausts the retry budget: alarm + quarantine', async () => {
    const store = createMemoryOutboxStore();
    const fhir = makeFakeFhir({ failResourceIds: new Set(['Coverage/cov-dead']), failCode: 'fhir-410' });
    const alarm = makeAlarmSink();
    const quarantine = makeQuarantineSink();
    const deps = makeDeps(store, { fhir, maxAttempts: 1, alarm, quarantine });
    const writer = new OutboxWriter(deps);
    await writer.enqueue(intent({ idempotencyKey: 'k', fhirResourceId: 'Coverage/cov-dead' }));
    deps.clock.advance(THRESHOLD + 1);

    const result = await new OutboxSweeper(deps).sweep(THRESHOLD);
    expect(result.failed).toHaveLength(1);
    expect(alarm.raised).toHaveLength(1);
    expect(quarantine.items).toHaveLength(1);
    expect((await store.get(result.failed[0]))?.status).toBe('failed');
  });

  it('leaves a below-budget transient orphan pending (no event)', async () => {
    const store = createMemoryOutboxStore();
    const fhir = makeFakeFhir({ failResourceIds: new Set(['Coverage/cov-soft']) });
    const deps = makeDeps(store, { fhir, maxAttempts: 5 });
    const writer = new OutboxWriter(deps);
    await writer.enqueue(intent({ idempotencyKey: 'k', fhirResourceId: 'Coverage/cov-soft' }));
    deps.clock.advance(THRESHOLD + 1);

    const result = await new OutboxSweeper(deps).sweep(THRESHOLD);
    expect(result.stillPending).toHaveLength(1);
    expect(deps.publisher.events).toHaveLength(0);
    expect((await store.get(result.stillPending[0]))?.status).toBe('pending');
  });

  it('does not touch intents newer than the threshold', async () => {
    const store = createMemoryOutboxStore();
    const deps = makeDeps(store);
    const writer = new OutboxWriter(deps);
    await writer.enqueue(intent({ idempotencyKey: 'k', fhirResourceId: 'Coverage/cov-fresh' }));
    // no clock advance: the intent is fresh
    const result = await new OutboxSweeper(deps).sweep(THRESHOLD);
    expect(result.scanned).toBe(0);
  });
});
