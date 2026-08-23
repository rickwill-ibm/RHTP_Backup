/**
 * Call-site wiring (NS-01) — the core of the fix: nothing vanishes.
 *
 * Before this module, the pipeline built QuarantineRecord / held-identity records
 * and the outbox built failed-intent items, then RETURNED and DROPPED them. Here
 * are the two PHI-safe mappers that persist each into the durable dead-letter
 * store instead:
 *
 *   persistPipelineDeadLetters — maps a pipeline run's quarantine + held-identity
 *                                records (status 'held-for-review' -> kind
 *                                'held-identity', else 'quarantine') to appends.
 *   deadLetterQuarantineSink   — a QuarantineSink (the outbox's existing seam) that
 *                                persists an exhausted intent as kind
 *                                'failed-outbox' when failIntent fires.
 *
 * Every mapped field is an id / code / reference: member_ref is an anchored member
 * id or a source handle, payload_ref points to where the raw record lives. No raw
 * PHI is copied. assertDeadLetterPhiSafe guards that invariant.
 */
import type { QuarantineSink } from '@/lib/outbox';
import type { QuarantineRecord } from '@/lib/pipeline/types';
import type { DeadLetterRecord, DeadLetterStore } from './types';

/** Keys that commonly carry PHI — a dead-letter record must contain none. */
const PHI_KEYS = [
  'name', 'given', 'family', 'birthDate', 'dob', 'ssn', 'ssnLast4', 'telecom',
  'address', 'phone', 'email', 'gender', 'sex', 'note', 'text', 'valueString',
];

/** Throw if a dead-letter record's serialized form carries a PHI-marked key. */
export function assertDeadLetterPhiSafe(record: DeadLetterRecord): void {
  const serialized = JSON.stringify(record);
  for (const key of PHI_KEYS) {
    if (new RegExp(`"${key}"\\s*:`).test(serialized)) {
      throw new Error(`dead-letter record ${record.id} contains PHI-bearing key "${key}"`);
    }
  }
}

/** A PHI-safe source handle for a quarantine record (no member identity is resolved). */
function sourceHandle(q: QuarantineRecord): string {
  return `${q.source.system}:${q.source.feed}`;
}

export interface PipelineDeadLetterInput {
  quarantined: QuarantineRecord[];
}

/**
 * Persist a pipeline run's quarantine + held-identity records. `heldForReview` is
 * a SUBSET of `quarantined` (status 'held-for-review'), so we iterate `quarantined`
 * ONCE and derive the kind from the status — no double-append. Returns the stored
 * records (each PHI-safe-asserted).
 */
export async function persistPipelineDeadLetters(
  store: DeadLetterStore,
  quarantined: QuarantineRecord[],
): Promise<DeadLetterRecord[]> {
  const out: DeadLetterRecord[] = [];
  for (const q of quarantined) {
    const held = q.status === 'held-for-review';
    const payloadRef = held && q.identityHold
      ? `batch:${q.batchId}#${q.quarantineId};tier=${q.identityHold.matchTier};score=${q.identityHold.confidence}`
      : `batch:${q.batchId}#${q.quarantineId}`;
    const record = await store.append({
      id: `dl-${q.quarantineId}`,
      kind: held ? 'held-identity' : 'quarantine',
      memberRef: sourceHandle(q),
      reasonCode: q.reasonCodes.join('|') || 'unspecified',
      sourceRef: q.sourceRef,
      payloadRef,
      createdAt: q.quarantinedAt,
    });
    assertDeadLetterPhiSafe(record);
    out.push(record);
  }
  return out;
}

/**
 * A QuarantineSink (the outbox's existing terminal-failure seam) that persists an
 * exhausted intent as a durable `failed-outbox` dead-letter record. The sink's
 * `add` is synchronous (the outbox interface), so the append is fire-and-forget;
 * `drain()` awaits every in-flight append for deterministic tests and graceful
 * shutdown. FIDELITY: the sync sink over an async store means an append error is
 * captured on `errors`, not thrown back into the outbox drain (which must not be
 * blocked by the dead-letter write). See FAKE_FIDELITY note in the report.
 */
export interface DeadLetterQuarantineSink extends QuarantineSink {
  /** Await every in-flight append (tests / shutdown). */
  drain(): Promise<DeadLetterRecord[]>;
  /** Append errors captured out-of-band (the sync sink cannot throw). */
  readonly errors: unknown[];
}

export function deadLetterQuarantineSink(store: DeadLetterStore): DeadLetterQuarantineSink {
  const pending: Promise<DeadLetterRecord | null>[] = [];
  const errors: unknown[] = [];
  return {
    add(item: { intentId: string; memberId: string; reasonCode: string; attempts: number }): void {
      const p = store
        .append({
          kind: 'failed-outbox',
          memberRef: item.memberId,
          reasonCode: item.reasonCode,
          sourceRef: item.intentId,
          payloadRef: `intent:${item.intentId};attempts=${item.attempts}`,
        })
        .then((record) => {
          assertDeadLetterPhiSafe(record);
          return record;
        })
        .catch((err) => {
          errors.push(err);
          return null;
        });
      pending.push(p);
    },
    async drain(): Promise<DeadLetterRecord[]> {
      const settled = await Promise.all(pending);
      return settled.filter((r): r is DeadLetterRecord => r !== null);
    },
    errors,
  };
}
