// CONTRACT: C2
/**
 * C2 envelope construction + boundary validation.
 *
 * Events are the platform's contract with every downstream projector, so the
 * envelope is validated at the publish boundary (conventions v2 §5 — zod is not
 * a project dependency, so this is a hand validator matching the C2 JSON Schema
 * in contracts.md exactly). Ids are deterministic under an injected rng so the
 * whole outbox is testable without mocking globals.
 */
import type { C2Event, OutboxIntentInput, OutboxIntentRow } from './types';

const EVENT_TYPE_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const EVENT_VERSION_RE = /^\d+\.\d+$/;

export class EnvelopeValidationError extends Error {
  constructor(public readonly field: string, detail: string) {
    super(`C2 envelope invalid at "${field}": ${detail}`);
    this.name = 'EnvelopeValidationError';
  }
}

/** RFC-4122-shaped v4 uuid from an injected rng (deterministic in tests). */
export function uuidV4(rng: () => number): string {
  const b = new Array(16).fill(0).map(() => Math.floor(rng() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10, 16).join('')}`;
}

/**
 * Build the C2 event for a confirmed intent. `sequence` is the per-member value
 * the outbox assigned at confirm time; it is required here because events are
 * only ever built AFTER confirm (amendment §2 step 3).
 */
export function buildEnvelope(
  row: OutboxIntentRow,
  sequence: number,
  deps: { now: () => number; rng: () => number },
): C2Event {
  const input = row.envelope;
  const recordedAt = new Date(deps.now()).toISOString();
  const event: C2Event = {
    eventId: uuidV4(deps.rng),
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? '1.0',
    occurredAt: input.occurredAt ?? recordedAt,
    recordedAt,
    memberId: input.memberId,
    partitionKey: input.memberId,
    class: input.class,
    sequence,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    source: input.source,
    consentContext: {
      part2Restricted: input.consentContext.part2Restricted,
      segmentLabels: input.consentContext.segmentLabels ?? [],
    },
    payload: input.payload,
  };
  if (input.causationId) event.causationId = input.causationId;
  validateEnvelope(event);
  return event;
}

/** Throws EnvelopeValidationError unless the event honors the C2 schema. */
export function validateEnvelope(e: C2Event): void {
  const need = (v: unknown, f: string) => {
    if (v === undefined || v === null || v === '') throw new EnvelopeValidationError(f, 'required');
  };
  need(e.eventId, 'eventId');
  need(e.eventType, 'eventType');
  if (!EVENT_TYPE_RE.test(e.eventType)) throw new EnvelopeValidationError('eventType', 'pattern');
  if (!EVENT_VERSION_RE.test(e.eventVersion))
    throw new EnvelopeValidationError('eventVersion', 'pattern');
  need(e.occurredAt, 'occurredAt');
  need(e.recordedAt, 'recordedAt');
  need(e.memberId, 'memberId');
  if (e.partitionKey !== e.memberId)
    throw new EnvelopeValidationError('partitionKey', 'must equal memberId');
  if (e.class !== 'stream' && e.class !== 'batch')
    throw new EnvelopeValidationError('class', 'enum');
  need(e.correlationId, 'correlationId');
  need(e.idempotencyKey, 'idempotencyKey');
  if (!e.source || !e.source.system || !e.source.feed)
    throw new EnvelopeValidationError('source', 'system+feed required');
  if (typeof e.consentContext?.part2Restricted !== 'boolean')
    throw new EnvelopeValidationError('consentContext.part2Restricted', 'required boolean');
  if (typeof e.payload !== 'object' || e.payload === null)
    throw new EnvelopeValidationError('payload', 'object required');
  if (e.sequence !== undefined && (!Number.isInteger(e.sequence) || e.sequence < 0))
    throw new EnvelopeValidationError('sequence', 'non-negative integer');
}

/** Seed an OutboxIntentRow from a submit input (status pending, no sequence). */
export function intentRowFrom(
  input: OutboxIntentInput,
  id: string,
  nowMs: number,
): OutboxIntentRow {
  return {
    id,
    memberId: input.memberId,
    eventType: input.eventType,
    fhirResourceId: input.fhirResourceId,
    idempotencyKey: input.idempotencyKey,
    status: 'pending',
    sequence: null,
    attempts: 0,
    actor: input.actor,
    correlationId: input.correlationId,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    envelope: input,
  };
}
