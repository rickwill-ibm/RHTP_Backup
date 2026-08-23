// CONTRACT: C2  // CONTRACT: C10  // CONTRACT: C6
/**
 * Signal intake: C2 member events -> typed signals, via the taxonomy alone.
 *
 * Idempotent on eventId; per-member ordering preserved from the outbox
 * `sequence` (the memberId partition guarantees it, C6). Part 2 rule (C10.1):
 * a restricted event is dropped at intake by envelope inspection when the
 * deployment is not Part 2-cleared — the SDE never parses restricted payloads.
 */
import type { C2Event } from '@/lib/outbox';
import {
  getIdempotencyStore,
  IDEMPOTENCY_CONSUMERS,
  type IdempotencyStore,
} from '@/lib/idempotency';
import { fillDedupeKey, indexTaxonomy } from '../taxonomy';
import type { Signal, SignalTaxonomy } from '../types';

export interface IntakeOptions {
  /** True when this deployment may carry Part 2-restricted signals. Default false. */
  part2Cleared?: boolean;
}

/** PHI-safe: only known reference/code fields are lifted from the payload. */
const REF_KEYS = ['measure', 'instrument', 'encounter', 'referral', 'claim', 'pa', 'appointment', 'channel', 'gap'];

function payloadStr(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
}

/**
 * Map one C2 event to a signal, or null when the event type is untaxonomized,
 * is source-gated with no feed, or is restricted in a non-cleared deployment.
 */
export function signalFromEvent(
  event: C2Event,
  tax: SignalTaxonomy,
  opts: IntakeOptions = {},
): Signal | null {
  const { bySourceEvent } = indexTaxonomy(tax);
  const entry = bySourceEvent.get(event.eventType);
  if (!entry) return null;
  if (entry.sourceGated) return null; // feed absent: refuse honestly (Tier-B posture)
  const restricted = event.consentContext.part2Restricted === true;
  if (restricted && !opts.part2Cleared) return null;

  const refs: Record<string, string> = {};
  for (const k of REF_KEYS) {
    const v = payloadStr(event.payload, k);
    if (v !== undefined) refs[k] = v;
  }
  const measure = refs.measure;
  const dedupeKey = fillDedupeKey(entry.dedupeKeyTemplate, {
    memberId: event.memberId,
    measure,
    instrument: refs.instrument,
    encounter: refs.encounter,
    referral: refs.referral,
    claim: refs.claim,
    pa: refs.pa,
    appointment: refs.appointment,
    channel: refs.channel,
  });

  const signal: Signal = {
    signalId: event.eventId,
    memberId: event.memberId,
    kind: entry.signalType,
    sourceEventType: event.eventType,
    occurredAtMs: Date.parse(event.occurredAt),
    priority: entry.defaultPriority,
    actionability: entry.actionability,
    foldBehavior: entry.foldBehavior,
    dedupeKey,
    part2Restricted: restricted,
    refs,
  };
  if (entry.defaultChannel) signal.channel = entry.defaultChannel;
  if (entry.consentScope) signal.consentScope = entry.consentScope;
  if (entry.ttlHours !== undefined) signal.ttlHours = entry.ttlHours;
  if (measure) signal.measure = measure;
  if (event.sequence !== undefined) signal.sequence = event.sequence;
  return signal;
}

/**
 * Fold a member's event stream into signals: taxonomy-mapped, eventId-deduped,
 * and ordered by the outbox sequence (fallback occurredAt, then signalId). The
 * per-member ordering the outbox partition guarantees is preserved here.
 *
 * NOTE (NS-04): this synchronous form dedupes within a SINGLE call via a local
 * Set — it protects one fold but NOT a later at-least-once republish. The SDE
 * intake decision path must use `intakeSignalsDurable`, whose dedupe survives
 * across calls in the durable idempotency store. This form is retained for pure
 * taxonomy-mapping (fixtures, explain) where cross-call dedupe is not in play.
 */
export function intakeSignals(
  events: C2Event[],
  tax: SignalTaxonomy,
  opts: IntakeOptions = {},
): Signal[] {
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const ev of events) {
    if (seen.has(ev.eventId)) continue; // idempotent on eventId (this call only)
    seen.add(ev.eventId);
    const sig = signalFromEvent(ev, tax, opts);
    if (sig) out.push(sig);
  }
  return sortByOrder(out);
}

/** Injected deps for the durable intake. Defaults to the configured seam store. */
export interface DurableIntakeDeps {
  /** The durable idempotency store. Defaults to getIdempotencyStore(). */
  store?: IdempotencyStore;
  /** Consumer namespace. Defaults to 'sde-intake'. */
  consumer?: string;
}

/**
 * NS-04 fix: fold an event stream into signals with DURABLE eventId dedupe.
 *
 * Replaces the in-memory per-call Set with an atomic check-and-set against the
 * idempotency store, keyed by eventId under consumer 'sde-intake'. A republished
 * event (outbox at-least-once) whose eventId was already marked is skipped, so
 * the SDE never double-produces a signal across deliveries — not just within one
 * fold. Ordering and taxonomy mapping are byte-identical to `intakeSignals`.
 */
export async function intakeSignalsDurable(
  events: C2Event[],
  tax: SignalTaxonomy,
  deps: DurableIntakeDeps = {},
  opts: IntakeOptions = {},
): Promise<Signal[]> {
  const store = deps.store ?? getIdempotencyStore();
  const consumer = deps.consumer ?? IDEMPOTENCY_CONSUMERS.sdeIntake;
  const out: Signal[] = [];
  for (const ev of events) {
    // Atomic claim: the first delivery of this eventId proceeds; a republish
    // (or an in-batch duplicate) is a no-op. Never a check-then-set race.
    const { firstProcessed } = await store.markProcessed(consumer, ev.eventId);
    if (!firstProcessed) continue;
    const sig = signalFromEvent(ev, tax, opts);
    if (sig) out.push(sig);
  }
  return sortByOrder(out);
}

/** Deterministic per-member order: sequence, then occurredAt, then signalId. */
export function sortByOrder(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    const sa = a.sequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sequence ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    if (a.occurredAtMs !== b.occurredAtMs) return a.occurredAtMs - b.occurredAtMs;
    return a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0;
  });
}
