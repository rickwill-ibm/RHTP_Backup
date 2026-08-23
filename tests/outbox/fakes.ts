// Shared test doubles for the outbox library. Not a test file itself.
import type {
  AlarmSink,
  C2Event,
  EventPublisher,
  FhirApplier,
  OutboxDeps,
  OutboxIntentInput,
  OutboxStore,
  QuarantineSink,
} from '@/lib/outbox';

/** Seeded PRNG (mulberry32) so event ids are deterministic without global mocks. */
export function seededRng(seed = 0x1234abcd): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A controllable clock. `advance` moves it; `now` reads it. */
export function fakeClock(startMs = 1_700_000_000_000) {
  const state = { t: startMs };
  return { now: () => state.t, advance: (ms: number) => (state.t += ms), set: (ms: number) => (state.t = ms) };
}

export interface FakeFhir extends FhirApplier {
  applied: string[]; // resourceIds applied, in order (duplicates prove idempotency)
  landed: Set<string>;
}

/**
 * Fake FHIR applier. `failResourceIds` throw a coded error on apply; `failTimes`
 * makes each apply throw for the first N calls of a resource (transient). Applied
 * resources are recorded and exist() reflects them (plus any pre-seeded `landed`).
 */
export function makeFakeFhir(opts: {
  failResourceIds?: Set<string>;
  failCode?: string;
  preLanded?: string[];
} = {}): FakeFhir {
  const applied: string[] = [];
  const landed = new Set<string>(opts.preLanded ?? []);
  return {
    id: 'fake-fhir',
    applied,
    landed,
    async apply(resourceId: string) {
      if (opts.failResourceIds?.has(resourceId)) {
        const err = new Error('fhir apply failed') as Error & { code: string };
        err.code = opts.failCode ?? 'fhir-503';
        throw err;
      }
      applied.push(resourceId);
      landed.add(resourceId);
      return { versionId: `v${applied.filter((r) => r === resourceId).length}` };
    },
    async exists(resourceId: string) {
      return landed.has(resourceId);
    },
  };
}

export interface FakePublisher extends EventPublisher {
  events: C2Event[];
}

export function makeFakePublisher(): FakePublisher {
  const events: C2Event[] = [];
  return {
    id: 'fake-publisher',
    events,
    async publish(event: C2Event) {
      events.push(event);
    },
  };
}

export function makeAlarmSink(): AlarmSink & { raised: unknown[] } {
  const raised: unknown[] = [];
  return { raised, raise: (a) => void raised.push(a) };
}

export function makeQuarantineSink(): QuarantineSink & { items: unknown[] } {
  const items: unknown[] = [];
  return { items, add: (i) => void items.push(i) };
}

export function makeDeps(
  store: OutboxStore,
  overrides: Partial<OutboxDeps> = {},
): OutboxDeps & { fhir: FakeFhir; publisher: FakePublisher; clock: ReturnType<typeof fakeClock> } {
  const clock = fakeClock();
  const fhir = (overrides.fhir as FakeFhir) ?? makeFakeFhir();
  const publisher = (overrides.publisher as FakePublisher) ?? makeFakePublisher();
  return {
    store,
    fhir,
    publisher,
    now: overrides.now ?? clock.now,
    rng: overrides.rng ?? seededRng(),
    alarm: overrides.alarm,
    quarantine: overrides.quarantine,
    maxAttempts: overrides.maxAttempts,
    clock,
  };
}

export function intent(overrides: Partial<OutboxIntentInput> = {}): OutboxIntentInput {
  return {
    memberId: overrides.memberId ?? 'mem-a',
    eventType: overrides.eventType ?? 'coverage.enrolled',
    fhirResourceId: overrides.fhirResourceId ?? 'Coverage/cov-1',
    idempotencyKey: overrides.idempotencyKey ?? 'k-1',
    actor: overrides.actor ?? 'test',
    correlationId: overrides.correlationId ?? 'corr-1',
    class: overrides.class ?? 'batch',
    source: overrides.source ?? { system: 'sys', feed: 'feed', tier: 'T1' },
    consentContext: overrides.consentContext ?? { part2Restricted: false, segmentLabels: [] },
    payload: overrides.payload ?? { coverageRef: 'Coverage/cov-1' },
    occurredAt: overrides.occurredAt,
    causationId: overrides.causationId,
    eventVersion: overrides.eventVersion,
  };
}
