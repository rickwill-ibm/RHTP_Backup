// CONTRACT: C10  // SEAM: cdc-relay
/**
 * Reconciliation sweep (amendment §2 step 5). Visits `pending` intents older
 * than a threshold (default 5 minutes) and resolves each orphan:
 *   - the FHIR write LANDED but the process crashed before confirm  -> confirm+publish
 *   - the FHIR write never landed                                   -> retry apply
 *   - the retry budget is exhausted                                 -> fail + alarm + quarantine
 *
 * An orphaned FHIR write with no intent cannot occur because every write path
 * begins at the intent commit (step 1). The sweep runs under the SAME MemberLock
 * as the live writer, so it can never race a live drain for the same member, and
 * it processes each member's stale intents oldest-first to preserve FIFO.
 */
import { MemberLock } from './memberLock';
import { confirmAndPublish, failIntent, reasonOf } from './sequencing';
import type { OutboxDeps, OutboxIntentRow } from './types';

/** Default staleness threshold: 5 minutes (amendment §2 ASSUMPTION). */
export const DEFAULT_SWEEP_THRESHOLD_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

export interface SweepResult {
  scanned: number;
  recovered: string[]; // intent ids confirmed+published this sweep (write had landed or retry succeeded)
  failed: string[]; // intent ids that went terminally failed this sweep
  stillPending: string[]; // intent ids left pending (transient, below budget)
}

export class OutboxSweeper {
  private readonly lock: MemberLock;

  constructor(
    private readonly deps: OutboxDeps,
    lock?: MemberLock,
  ) {
    this.lock = lock ?? new MemberLock();
  }

  /** Sweep intents older than `thresholdMs` (relative to the injected clock). */
  async sweep(thresholdMs: number = DEFAULT_SWEEP_THRESHOLD_MS): Promise<SweepResult> {
    const cutoff = this.deps.now() - thresholdMs;
    const stale = await this.deps.store.stalePending(cutoff);
    const result: SweepResult = { scanned: stale.length, recovered: [], failed: [], stillPending: [] };

    const byMember = new Map<string, OutboxIntentRow[]>();
    for (const row of stale) {
      const list = byMember.get(row.memberId) ?? [];
      list.push(row);
      byMember.set(row.memberId, list);
    }

    for (const [memberId, rows] of byMember) {
      await this.lock.run(memberId, () => this.recoverMember(rows, result));
    }
    return result;
  }

  private async recoverMember(rows: OutboxIntentRow[], result: SweepResult): Promise<void> {
    const max = this.deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    for (const row of rows) {
      // Re-read: an earlier live drain may have moved this row past pending.
      const current = await this.deps.store.get(row.id);
      if (!current || current.status !== 'pending') continue;

      const landed = await this.deps.fhir.exists(current.fhirResourceId);
      if (landed) {
        const seq = await confirmAndPublish(this.deps, current);
        if (seq !== null) result.recovered.push(current.id); // null = writer beat the sweep
        continue;
      }
      const attempts = current.attempts + 1;
      try {
        await this.deps.fhir.apply(current.fhirResourceId, current.envelope);
      } catch (err) {
        await this.deps.store.update(current.id, { attempts, updatedAtMs: this.deps.now() });
        if (attempts >= max) {
          await failIntent(this.deps, current, attempts, reasonOf(err));
          result.failed.push(current.id);
        } else {
          result.stillPending.push(current.id);
          break; // FIFO: hold this member until the earliest orphan clears
        }
        continue;
      }
      await this.deps.store.update(current.id, { attempts, updatedAtMs: this.deps.now() });
      const seq = await confirmAndPublish(this.deps, { ...current, attempts });
      if (seq !== null) result.recovered.push(current.id); // null = writer beat the sweep
    }
  }
}
