/**
 * Call-site wiring (NS-01): the pipeline and the outbox now PERSIST the records
 * they used to build then drop. Proves:
 *   - persistPipelineDeadLetters maps quarantine + held-identity records durably;
 *   - runPipeline persists at the call site (a held-identity record lands and is
 *     retrievable, not dropped) — the core of the fix;
 *   - deadLetterQuarantineSink persists an exhausted outbox intent;
 *   - every persisted record is PHI-safe.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as clock from '@/lib/clock';
import {
  createMemoryDeadLetterStore,
  persistPipelineDeadLetters,
  deadLetterQuarantineSink,
  assertDeadLetterPhiSafe,
} from '@/lib/deadLetter';
import { HeldIdentityError, runPipeline, defaultPipelineDeps } from '@/lib/pipeline';
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  QuarantineRecord,
  RawRecord,
} from '@/lib/pipeline/types';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';

beforeEach(() => clock.setClock(() => Date.parse('2026-08-22T12:00:00.000Z')));
afterEach(() => clock.setClock(null));

function quarantineRecord(over: Partial<QuarantineRecord> = {}): QuarantineRecord {
  return {
    quarantineId: 'q-abc',
    batchId: 'batch-1',
    source: { system: 'CBO', feed: 'sdoh', batchId: 'batch-1' },
    sourceRef: 'row-7',
    reasonCodes: ['missing-field'],
    fieldPaths: ['subject'],
    quarantinedAt: '2026-08-22T12:00:00.000Z',
    status: 'quarantined',
    ...over,
  };
}

describe('persistPipelineDeadLetters', () => {
  it('maps a quarantine record durably (kind=quarantine)', async () => {
    const store = createMemoryDeadLetterStore();
    const [rec] = await persistPipelineDeadLetters(store, [quarantineRecord()]);
    expect(rec.kind).toBe('quarantine');
    expect(rec.reasonCode).toBe('missing-field');
    expect(rec.memberRef).toBe('CBO:sdoh');
    expect(await store.list({ kind: 'quarantine' })).toHaveLength(1);
  });

  it('maps a held-identity record (status held-for-review → kind held-identity) with tier/score in the ref', async () => {
    const store = createMemoryDeadLetterStore();
    const held = quarantineRecord({
      quarantineId: 'hold-xyz',
      status: 'held-for-review',
      reasonCodes: ['identity-possible-match'],
      identityHold: { matchTier: 'possible-match', confidence: 72 },
    });
    const [rec] = await persistPipelineDeadLetters(store, [held]);
    expect(rec.kind).toBe('held-identity');
    expect(rec.payloadRef).toContain('tier=possible-match');
    expect(rec.payloadRef).toContain('score=72');
    expect(await store.list({ kind: 'held-identity' })).toHaveLength(1);
  });

  it('does NOT double-append when heldForReview is a subset of quarantined', async () => {
    const store = createMemoryDeadLetterStore();
    const held = quarantineRecord({ quarantineId: 'hold-1', status: 'held-for-review', reasonCodes: ['identity-possible-match'] });
    const plain = quarantineRecord({ quarantineId: 'q-1' });
    await persistPipelineDeadLetters(store, [held, plain]); // pass quarantined (incl held) once
    expect(await store.list()).toHaveLength(2);
  });

  it('persisted records are PHI-safe', async () => {
    const store = createMemoryDeadLetterStore();
    const recs = await persistPipelineDeadLetters(store, [quarantineRecord()]);
    for (const r of recs) {
      assertDeadLetterPhiSafe(r);
      expect(JSON.stringify(r)).not.toMatch(/name|birthDate|ssn|address/i);
    }
  });
});

// An inline adapter that quarantines one record (invalid) and HOLDS another
// (normalize throws HeldIdentityError), proving runPipeline persists both at the
// call site instead of dropping them.
interface Raw { id: string; kind: 'valid' | 'invalid' | 'hold' }
const holdAdapter: DomainAdapter<Raw> = {
  source: { system: 'ADT', feed: 'adt-a08', batchId: undefined },
  domain: 'encounter',
  format: 'hl7v2-adt',
  arrivalMode: 'batch',
  parse: (payload: string) => (JSON.parse(payload) as Raw[]).map((data) => ({ sourceRef: data.id, data })),
  validate: (raw: RawRecord<Raw>) =>
    raw.data.kind === 'invalid'
      ? { ok: false, issues: [{ reasonCode: 'missing-field', fieldPath: 'pid' }] }
      : { ok: true, issues: [] },
  normalize: (raw: RawRecord<Raw>, deps: PipelineDeps): NormalizedRecord => {
    if (raw.data.kind === 'hold') {
      throw new HeldIdentityError({
        reasonCode: 'identity-possible-match',
        reason: 'score 71 in review band',
        matchTier: 'possible-match',
        confidence: 71,
      });
    }
    return {
      domain: 'encounter',
      memberId: deps.resolveIdentity(raw.data.id),
      resourceType: 'Encounter',
      fhirResourceId: `enc-${raw.data.id}`,
      eventType: 'encounter.recorded',
      tier: 'T2',
      idempotencyKey: `k-${raw.data.id}`,
      provenance: 'test',
      consent: { part2Restricted: false, segmentLabels: [] },
      source: holdAdapter.source,
      occurredAt: '2026-08-22T00:00:00.000Z',
      payload: { resourceType: 'Encounter', status: 'finished' },
    };
  },
};

describe('runPipeline call-site persistence (NS-01 core)', () => {
  it('a held-identity record lands in the store and is retrievable, not dropped', async () => {
    const store = createMemoryDeadLetterStore();
    const { store: outboxStore } = await makePgMemStore();
    const writer = new OutboxWriter(makeDeps(outboxStore));
    const payload = JSON.stringify([
      { id: 'v1', kind: 'valid' },
      { id: 'bad', kind: 'invalid' },
      { id: 'h1', kind: 'hold' },
    ]);

    const result = await runPipeline(
      holdAdapter,
      { source: holdAdapter.source, format: 'hl7v2-adt', payload },
      defaultPipelineDeps({ now: () => Date.parse('2026-08-22T12:00:00.000Z') }),
      { writer },
      store, // inject the dead-letter store (else the seam default is used)
    );

    // The pipeline still returns the records (behavior preserved) …
    expect(result.heldForReview).toHaveLength(1);
    expect(result.quarantined).toHaveLength(2); // invalid + held
    // … AND they are now durably persisted rather than dropped.
    const held = await store.list({ kind: 'held-identity' });
    expect(held).toHaveLength(1);
    expect(held[0].reasonCode).toBe('identity-possible-match');
    const quar = await store.list({ kind: 'quarantine' });
    expect(quar).toHaveLength(1);
    expect(quar[0].reasonCode).toBe('missing-field');
  });
});

describe('deadLetterQuarantineSink (outbox failed-intent wiring)', () => {
  it('persists an exhausted intent as a failed-outbox record', async () => {
    const store = createMemoryDeadLetterStore();
    const sink = deadLetterQuarantineSink(store);
    sink.add({ intentId: 'i-42', memberId: 'mem-7', reasonCode: 'fhir-503', attempts: 5 });
    const persisted = await sink.drain();
    expect(sink.errors).toHaveLength(0);
    expect(persisted).toHaveLength(1);
    const items = await store.list({ kind: 'failed-outbox' });
    expect(items).toHaveLength(1);
    expect(items[0].memberRef).toBe('mem-7');
    expect(items[0].payloadRef).toBe('intent:i-42;attempts=5');
    assertDeadLetterPhiSafe(items[0]);
  });
});
