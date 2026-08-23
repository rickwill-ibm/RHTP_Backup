// CONTRACT: C2  // CONTRACT: C10  // SEAM: cdc-relay
/**
 * Outbox-intent propagation — the single mechanism by which a domain event is
 * born (ADR-006 + amendment-001 §2). Public surface only; internals stay behind
 * this barrel. Iteration 2's graph projector consumes the events this emits.
 */
export type {
  C2Event,
  IntentStatus,
  OutboxIntentInput,
  OutboxIntentRow,
  OutboxStore,
  FhirApplier,
  EventPublisher,
  AlarmSink,
  QuarantineSink,
  OutboxDeps,
  PgQueryable,
} from './types';

export { buildEnvelope, validateEnvelope, intentRowFrom, uuidV4, EnvelopeValidationError } from './envelope';
export { OutboxWriter, type PumpResult } from './writer';
export { OutboxSweeper, DEFAULT_SWEEP_THRESHOLD_MS, type SweepResult } from './sweep';
export { confirmAndPublish, failIntent } from './sequencing';
export { MemberLock } from './memberLock';
export { createMemoryOutboxStore } from './memoryOutboxStore';
export { createPgOutboxStore, ensureOutboxSchema, OUTBOX_DDL } from './pgOutboxStore';
