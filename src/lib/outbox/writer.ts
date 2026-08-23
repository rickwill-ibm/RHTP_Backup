// CONTRACT: C10  // SEAM: cdc-relay
/**
 * The outbox writer: ADR-006 as amended by amendment-001 §2. This is the ONE
 * way a domain event is born (dual-write banned). Both the stage-4 pipeline
 * loader and every internal writer (care-plan, PA, disposition) submit here.
 *
 *   1. enqueue        transactional intent commit (status=pending).
 *   2. pump -> apply  idempotent FHIR PUT to the deterministic id.
 *   3. pump -> confirm assign per-member sequence, publish the C2 event.
 *   4. per-member FIFO a later intent never applies before every earlier intent
 *                      for that member is confirmed or terminally failed.
 *
 * Events emit ONLY after a confirmed FHIR commit; sequence order = confirm order
 * = publish order per member. The MemberLock is the partition-affine single
 * writer that makes the S4 inversion class structurally impossible.
 */
import { buildEnvelope, intentRowFrom, uuidV4 } from './envelope';
import { MemberLock } from './memberLock';
import { confirmAndPublish, failIntent, reasonOf } from './sequencing';
import type { OutboxDeps, OutboxIntentInput } from './types';

export interface PumpResult {
  memberId: string;
  published: string[]; // intent ids published this pump
  failed: string[]; // intent ids that went terminally failed this pump
  stoppedOnTransient: string | null; // intent id that halted the drain, if any
}

const DEFAULT_MAX_ATTEMPTS = 5;

export class OutboxWriter {
  private readonly lock: MemberLock;

  constructor(
    private readonly deps: OutboxDeps,
    lock?: MemberLock,
  ) {
    this.lock = lock ?? new MemberLock();
  }

  /** Step 1: commit a pending intent transactionally. Idempotent on idempotencyKey. */
  async enqueue(input: OutboxIntentInput): Promise<{ intentId: string; deduped: boolean }> {
    const now = this.deps.now();
    const row = intentRowFrom(input, uuidV4(this.deps.rng), now);
    const { row: stored, deduped } = await this.deps.store.enqueue(row);
    return { intentId: stored.id, deduped };
  }

  /** Steps 2-3 for every drainable intent of one member, in FIFO order. */
  async pump(memberId: string): Promise<PumpResult> {
    return this.lock.run(memberId, () => this.drain(memberId));
  }

  /** Convenience: enqueue then pump the member (the common single-writer path). */
  async submit(input: OutboxIntentInput): Promise<{ intentId: string; deduped: boolean } & PumpResult> {
    const { intentId, deduped } = await this.enqueue(input);
    const result = await this.pump(input.memberId);
    return { intentId, deduped, ...result };
  }

  private async drain(memberId: string): Promise<PumpResult> {
    const max = this.deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const out: PumpResult = { memberId, published: [], failed: [], stoppedOnTransient: null };

    // Crash recovery: publish any confirmed-but-unpublished rows first, in order.
    for (const row of await this.deps.store.confirmedForMember(memberId)) {
      await this.deps.publisher.publish(buildEnvelope(row, row.sequence as number, this.deps));
      await this.deps.store.update(row.id, { status: 'published', updatedAtMs: this.deps.now() });
      out.published.push(row.id);
    }

    const pending = await this.deps.store.pendingForMember(memberId);
    for (const row of pending) {
      const attempts = row.attempts + 1;
      try {
        await this.deps.fhir.apply(row.fhirResourceId, row.envelope);
      } catch (err) {
        await this.deps.store.update(row.id, { attempts, updatedAtMs: this.deps.now() });
        if (attempts >= max) {
          await failIntent(this.deps, row, attempts, reasonOf(err));
          out.failed.push(row.id);
          continue; // terminally failed: FIFO lets later intents proceed
        }
        out.stoppedOnTransient = row.id; // transient: hold the line for this member
        break;
      }
      await this.deps.store.update(row.id, { attempts, updatedAtMs: this.deps.now() });
      const seq = await confirmAndPublish(this.deps, { ...row, attempts });
      if (seq !== null) out.published.push(row.id); // null = a concurrent worker claimed it
    }
    return out;
  }
}
