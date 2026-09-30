import { describe, it, expect } from 'vitest';
import {
  workItemFromEvidence,
  listWorkItems,
  groupByQueue,
} from '@/lib/goldenThread/workQueueView';
import { createInMemoryEvidenceStore } from '@/lib/evidence/evidenceStore';
import { runFinancialClearance } from '@/lib/goldenThread/threadOrchestrator';
import { loadMockLibrary } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';

/** Reviewer UI — derive work items from persisted evidence. */
const lib = loadMockLibrary();
const TS = '2026-07-26T00:00:00.000Z';

async function seedStore() {
  const store = createInMemoryEvidenceStore();
  const mk = (npi: string, evId: string) =>
    runFinancialClearance(
      {
        member: { memberId: 'MARIA_SD_001', diagnoses: [] },
        order: {
          code: '72148',
          codeSystem: 'CPT',
          display: 'MRI',
          providerNpi: npi,
          payer: 'UnitedHealthcare Community Plan',
        },
        coverage: {
          status: 'active',
          payer: 'UnitedHealthcare Community Plan',
          plan: 'Texas STAR',
        },
      },
      {
        library: lib,
        goldCardSource: mockGoldCardDataSource,
        store,
        ts: TS,
        ids: {
          evidence: evId,
          determination: `${evId}-d`,
          goldCard: `${evId}-g`,
          propensity: `${evId}-p`,
          eligibility: `${evId}-e`,
          estimation: `${evId}-x`,
        },
      }
    );
  await mk('1730154782', 'ev-gold'); // gold-carded → auto-cleared
  await mk('1518998765', 'ev-normal'); // not gold-carded → needs PA
  return store;
}

describe('workItemFromEvidence', () => {
  it('reconstructs a WorkItem from a persisted record', async () => {
    const store = await seedStore();
    const rec = await store.get('ev-gold');
    const item = workItemFromEvidence(rec!);
    expect(item.evidenceId).toBe('ev-gold');
    expect(item.code).toBe('72148');
    expect(item.queue).toBe('auto-cleared');
  });
});

describe('listWorkItems + groupByQueue', () => {
  it('lists and groups all persisted evidence into queues', async () => {
    const store = await seedStore();
    const items = await listWorkItems(store);
    expect(items.length).toBe(2);
    const groups = groupByQueue(items);
    expect(groups['auto-cleared'].length).toBe(1);
    // the non-gold order lands in a PA queue (ready or high-risk)
    const paCount = groups['ready-to-submit'].length + groups['high-risk-review'].length;
    expect(paCount).toBe(1);
  });
});
