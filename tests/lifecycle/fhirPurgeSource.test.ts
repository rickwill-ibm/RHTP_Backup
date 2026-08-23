/**
 * FHIR mutable-store purge adapter — scans via the public store API, purges by
 * policy, and honors a legal hold end to end against the real FHIR store.
 *
 * The FHIR store stamps meta.lastUpdated with the injected clock on create, so
 * these tests set the clock to the intended record age at creation time, then
 * advance it to "now" before purging.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as clock from '@/lib/clock';
import { storeCreate, storeRead, storeSearch } from '@/lib/fhir/store';
import {
  createFhirPurgeSource,
  runPurge,
  createLegalHoldRegistry,
  type RetentionPolicy,
} from '@/lib/lifecycle';

const NOW = Date.parse('2026-08-23T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

interface BundleLike { entry?: Array<{ resource?: { id?: string } }> }

/** Create an Observation whose stamped lastUpdated is `createdAt` (clock-pinned). */
function seedObservation(id: string, patient: string, createdAt: string): void {
  clock.setClock(() => Date.parse(createdAt));
  storeCreate({
    resourceType: 'Observation',
    id,
    status: 'final',
    subject: { reference: `Patient/${patient}` },
  });
  clock.setClock(() => NOW);
}

afterEach(() => clock.setClock(null));

describe('FHIR purge source', () => {
  it('scans observations to PHI-safe items and purges the aged ones', async () => {
    seedObservation('obs-old-1', 'pat-A', '2026-01-01T00:00:00.000Z');
    seedObservation('obs-fresh-1', 'pat-B', '2026-08-22T00:00:00.000Z');

    const src = createFhirPurgeSource({ resourceTypes: ['Observation'] });
    const scanned = await src.scan();
    const old = scanned.find((i) => i.id === 'obs-old-1');
    expect(old).toBeDefined();
    expect(old?.subjectRef).toBe('pat-A');
    expect(old?.category).toBe('Observation');

    const policy: RetentionPolicy = { id: 'obs-30d', description: 'aged observations', maxAgeMs: 30 * DAY, categories: ['Observation'] };
    const registry = createLegalHoldRegistry();
    const result = await runPurge([src], [policy], registry, 'ops:job', NOW);

    expect(result.purged.map((s) => s.item.id)).toContain('obs-old-1');
    expect(storeRead('Observation', 'obs-old-1')).toBeUndefined(); // gone from the store
    expect(storeRead('Observation', 'obs-fresh-1')).toBeDefined(); // fresh survives
  });

  it('a legal hold on the patient blocks the purge of their observation', async () => {
    seedObservation('obs-held-1', 'pat-Held', '2026-01-01T00:00:00.000Z');
    const src = createFhirPurgeSource({ resourceTypes: ['Observation'] });
    const registry = createLegalHoldRegistry();
    registry.place({ subjectRef: 'pat-Held', reason: 'litigation', placedBy: 'legal' });

    const policy: RetentionPolicy = { id: 'obs-30d', description: 'aged', maxAgeMs: 30 * DAY };
    const result = await runPurge([src], [policy], registry, 'ops:job', NOW);

    expect(result.heldBack.map((s) => s.item.id)).toContain('obs-held-1');
    expect(storeRead('Observation', 'obs-held-1')).toBeDefined(); // survived the purge
  });

  it('consent-withdrawal selection uses the injected consent predicate', async () => {
    seedObservation('obs-consent-1', 'pat-Withdrawn', '2026-08-22T00:00:00.000Z');
    const withdrew = new Set(['pat-Withdrawn']);
    const src = createFhirPurgeSource({
      resourceTypes: ['Observation'],
      consentWithdrawnFor: (ref) => withdrew.has(ref),
    });
    const policy: RetentionPolicy = { id: 'consent', description: 'purge on withdrawal', consentWithdrawn: true };
    const registry = createLegalHoldRegistry();
    const result = await runPurge([src], [policy], registry, 'ops:job', NOW);

    expect(result.purged.map((s) => s.item.id)).toContain('obs-consent-1');
    const remaining = storeSearch<BundleLike>('Observation', {});
    expect((remaining.entry ?? []).some((e) => e.resource?.id === 'obs-consent-1')).toBe(false);
  });
});
