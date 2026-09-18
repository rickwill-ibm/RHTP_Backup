/**
 * Legal-hold registry (Wave C). A legal hold pins a subject's data in place: a
 * purge must skip it and a right-to-delete must refuse it (E9 — a purge must not
 * bypass a legal hold). The registry is the single authority both paths consult.
 *
 * Keyed by `subjectRef` (member / patient / record id). At most one ACTIVE hold
 * per subject; releasing it moves it to history (append-only audit of holds).
 * Timestamps come from the injected clock, so tests pin time.
 */
import * as clock from '@/lib/clock';
import { auditHoldPlaced, auditHoldReleased } from './audit';
import type { LegalHold, LifecycleAuditEvent } from './types';

let holdSeq = 0;

export interface PlaceHoldInput {
  subjectRef: string;
  reason: string;
  placedBy: string;
}

export interface LegalHoldRegistry {
  /** Place a hold on a subject. Re-placing on an already-held subject is a no-op
   *  that returns the existing active hold (idempotent). */
  place(input: PlaceHoldInput): { hold: LegalHold; audit: LifecycleAuditEvent };
  /** Release the active hold on a subject. Returns null when none is active. */
  release(
    subjectRef: string,
    releasedBy: string
  ): { hold: LegalHold; audit: LifecycleAuditEvent } | null;
  /** True when the subject currently has an active hold. */
  isHeld(subjectRef: string): boolean;
  /** The active hold for a subject, or null. */
  active(subjectRef: string): LegalHold | null;
  /** Every active hold (for an ops surface). */
  listActive(): LegalHold[];
  /** Full history including released holds (append-only audit). */
  history(): LegalHold[];
}

export function createLegalHoldRegistry(): LegalHoldRegistry {
  // subjectRef -> active hold
  const activeHolds = new Map<string, LegalHold>();
  // append-only log of every hold ever placed (active + released)
  const log: LegalHold[] = [];

  return {
    place({ subjectRef, reason, placedBy }) {
      const existing = activeHolds.get(subjectRef);
      const ts = clock.nowIso();
      if (existing) {
        return { hold: existing, audit: auditHoldPlaced(subjectRef, existing.id, ts, placedBy) };
      }
      holdSeq += 1;
      const hold: LegalHold = {
        id: `hold-${holdSeq}`,
        subjectRef,
        reason,
        placedBy,
        placedAt: ts,
        releasedAt: null,
        releasedBy: null,
      };
      activeHolds.set(subjectRef, hold);
      log.push(hold);
      return { hold, audit: auditHoldPlaced(subjectRef, hold.id, ts, placedBy) };
    },

    release(subjectRef, releasedBy) {
      const existing = activeHolds.get(subjectRef);
      if (!existing) return null;
      const ts = clock.nowIso();
      const released: LegalHold = { ...existing, releasedAt: ts, releasedBy };
      activeHolds.delete(subjectRef);
      // Replace the log entry with its released form (same identity, closed out).
      const idx = log.findIndex((h) => h.id === existing.id);
      if (idx >= 0) log[idx] = released;
      return { hold: released, audit: auditHoldReleased(subjectRef, released.id, ts, releasedBy) };
    },

    isHeld(subjectRef) {
      return activeHolds.has(subjectRef);
    },

    active(subjectRef) {
      return activeHolds.get(subjectRef) ?? null;
    },

    listActive() {
      return [...activeHolds.values()];
    },

    history() {
      return [...log];
    },
  };
}
