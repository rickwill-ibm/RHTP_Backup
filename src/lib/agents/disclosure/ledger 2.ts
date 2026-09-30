// CONTRACT: C-DISCLOSURE
/**
 * The disclosure ledger: append-only, and it records DENIALS.
 *
 * A control that only logs what it allowed cannot answer the first question a
 * state privacy officer asks — "the member revoked on Tuesday; what had already
 * flowed, to whom, and what was refused after?" Denials are the half that makes
 * revocation answerable, and they are the half usually missing, because a
 * refusal feels like a non-event to the system that refused it.
 *
 * INVARIANT: append-only — entries are never mutated or removed.
 * INVARIANT: reads return DEEP copies, frozen, so a caller cannot edit the record
 *            in place. A shallow spread is not enough: `obligations` is an array,
 *            and a shallow copy shares its reference, so
 *            `(ledger.all()[0].obligations as Obligation[]).length = 0` erased
 *            `part2-redisclosure-prohibited` from the stored decision permanently,
 *            with no new entry and no trace. The same aliasing ran the other way
 *            through `record()`, where a caller keeping its own reference to the
 *            array it passed could empty the stored one afterwards.
 */
import type { DisclosureDecision } from './types';

export interface DisclosureLedger {
  record(decision: DisclosureDecision): void;
  /** Every decision, oldest first. */
  all(): readonly DisclosureDecision[];
  /** One subject's decisions — the query a revocation review starts from. */
  forSubject(subjectId: string): readonly DisclosureDecision[];
  /** Denials only, for the control-effectiveness question. */
  denials(): readonly DisclosureDecision[];
  size(): number;
}

/**
 * An in-memory ledger. Scope it to a run, or to the process for a single node.
 * A multi-node deployment binds this to the same durable store the evidence
 * record uses — a deployment binding, not an authority.
 */
export function createDisclosureLedger(): DisclosureLedger {
  const entries: readonly DisclosureDecision[][] = [[]];
  const store = entries[0] as DisclosureDecision[];
  /** Deep, frozen: the array fields are copied, not aliased. */
  const seal = (d: DisclosureDecision): DisclosureDecision =>
    Object.freeze({ ...d, obligations: Object.freeze([...d.obligations]) });
  return {
    record(decision) {
      store.push(seal(decision));
    },
    // Entries are sealed on the way IN, so reads hand out frozen objects that
    // alias nothing mutable. A caller may still hold the array it receives.
    all: () => [...store],
    forSubject: (subjectId) => store.filter((e) => e.subjectId === subjectId),
    denials: () => store.filter((e) => e.outcome === 'deny'),
    size: () => store.length,
  };
}
