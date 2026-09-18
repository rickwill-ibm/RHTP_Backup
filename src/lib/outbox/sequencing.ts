// CONTRACT: C10  // SEAM: cdc-relay
/**
 * The confirm/publish/fail primitives, shared verbatim by the live writer and
 * the reconciliation sweep so there is exactly ONE way an intent is sequenced,
 * published, or failed. Divergence between the live path and the recovery path
 * would be a defect class; sharing these functions bans it by construction.
 */
import { buildEnvelope } from './envelope';
import { deadLetterQuarantineSink, getDeadLetterStore } from '@/lib/deadLetter';
import type { OutboxDeps, OutboxIntentRow } from './types';

/**
 * Step 3: atomically claim the pending row and assign its per-member sequence,
 * then publish the C2 event and mark it published. The claim is a data-layer
 * compare-and-set (store.claimForConfirm): if a concurrent worker — the live
 * writer racing the reconciliation sweep, or a second instance — already claimed
 * this intent, the claim returns null and we publish NOTHING. That is the
 * exactly-once guarantee; it replaces the old read-then-write nextSequence, which
 * left a double-publish window open under real multi-writer Postgres.
 * Returns the assigned sequence, or null when the claim was lost (no publish).
 */
export async function confirmAndPublish(
  deps: OutboxDeps,
  row: OutboxIntentRow
): Promise<number | null> {
  const sequence = await deps.store.claimForConfirm(row.id, row.memberId, deps.now());
  if (sequence === null) return null; // lost the claim: another worker owns this intent
  const event = buildEnvelope({ ...row, sequence, status: 'confirmed' }, sequence, deps);
  await deps.publisher.publish(event);
  await deps.store.update(row.id, { status: 'published', updatedAtMs: deps.now() });
  return sequence;
}

/**
 * Terminal failure: mark failed, raise the alarm, and persist the exhausted intent
 * so it is NEVER dropped (NS-01). The record lands on the injected QuarantineSink
 * when one is wired (tests / explicit composition); otherwise it is persisted to
 * the durable dead-letter store (kind 'failed-outbox') resolved via the seam, so a
 * failed outreach/signal intent always has a durable, reviewable home instead of
 * vanishing. The dead-letter append is awaited here so the failure is durable
 * before the drain proceeds.
 */
export async function failIntent(
  deps: OutboxDeps,
  row: OutboxIntentRow,
  attempts: number,
  reasonCode: string
): Promise<void> {
  await deps.store.update(row.id, { status: 'failed', updatedAtMs: deps.now() });
  deps.alarm?.raise({
    code: 'outbox-intent-failed',
    intentId: row.id,
    memberId: row.memberId,
    detail: `exhausted ${attempts} attempts (${reasonCode})`,
  });
  if (deps.quarantine) {
    deps.quarantine.add({ intentId: row.id, memberId: row.memberId, reasonCode, attempts });
    return;
  }
  const sink = deadLetterQuarantineSink(getDeadLetterStore());
  sink.add({ intentId: row.id, memberId: row.memberId, reasonCode, attempts });
  await sink.drain();
  // R1/NS-01 fail-closed: the sync-sink-over-async-store captures append errors
  // out-of-band instead of throwing. In THIS default single-append path we must
  // surface a capture failure — otherwise a failed-outbox record silently vanishes
  // under a dead-letter store write fault, the exact drop NS-01 forbids. (An
  // explicitly injected deps.quarantine sink owns its own error posture above.)
  if (sink.errors.length > 0) throw sink.errors[0];
}

/** Normalize a thrown FHIR error into a PHI-safe reason code. */
export function reasonOf(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  ) {
    return (err as { code: string }).code;
  }
  return 'fhir-apply-failed';
}
