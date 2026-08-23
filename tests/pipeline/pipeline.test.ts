import { describe, it, expect } from 'vitest';
import {
  adtEncounterAdapter,
  cboSdohAdapter,
  defaultPipelineDeps,
  eligibility834Adapter,
  runPipeline,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { readFileSync } from 'fs';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import adt from './fixtures/adtEncounter.json';
import x834 from './fixtures/eligibility834.json';

const csv = readFileSync(new URL('./fixtures/cboSdoh.csv', import.meta.url), 'utf8');
const pdeps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

describe('end-to-end pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('834 batch runs all five stages and propagates a coverage event per member (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      eligibility834Adapter,
      { source: eligibility834Adapter.source, format: 'x12-834', payload: x834.payload },
      pdeps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the incomplete INS loop
    expect(result.affectedMembers).toHaveLength(2);
    // Two coverage events published, class=batch, tier carried in source.
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('coverage.enrolled');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });

  it('ADT SUD encounter propagates with the Part 2 label on the envelope', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    await runPipeline(
      adtEncounterAdapter,
      { source: adtEncounterAdapter.source, format: 'hl7v2-adt', payload: adt.sud },
      pdeps,
      { writer },
    );

    expect(odeps.publisher.events).toHaveLength(1);
    const ev = odeps.publisher.events[0];
    expect(ev.eventType).toBe('encounter.admitted');
    expect(ev.class).toBe('stream');
    // Projectors drop Part 2 by envelope inspection alone (C10.1) — the label rides here.
    expect(ev.consentContext.part2Restricted).toBe(true);
    expect(ev.consentContext.segmentLabels).toContain('42-CFR-Part-2');
  });

  it('CBO flat-file batch propagates SDOH events and quarantines the bad row', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      cboSdohAdapter,
      { source: cboSdohAdapter.source, format: 'flat-file-csv', payload: csv },
      pdeps,
      { writer },
    );
    expect(result.loadReconciliation.balanced).toBe(true);
    expect(odeps.publisher.events).toHaveLength(3);
    expect(result.quarantined).toHaveLength(1);
    expect(odeps.publisher.events.every((e) => e.eventType === 'sdoh.screening.completed')).toBe(true);
  });
});
