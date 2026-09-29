// CONTRACT: C10  // CONTRACT: C-DISCLOSURE
/**
 * The ONE producer of a signal's data-class floor.
 *
 * WHY THIS EXISTS AS A MODULE AND NOT AS A LAMBDA AT EACH CALL SITE. The
 * disclosure gate needs, per signal kind, the data classes that kind carries at
 * minimum. That answer lives in the reviewed taxonomy (`data/signal-taxonomy.json`
 * → `TaxonomyEntry.dataClassFloor`). Every caller that wrote its own lookup was
 * free to write a DIFFERENT one, and the composition root that shipped wrote
 * none at all — so the gate substituted `demographic` and decided NY MHL §33.13
 * and PHL Art 27-F material under the HIPAA treatment/payment/operations basis,
 * with no consent lookup. A single supplier makes "which floor?" unanswerable in
 * more than one way.
 *
 * It lives in `sde/` because the taxonomy is SDE's data, and it returns plain
 * strings rather than `DataClass` so `sde/` keeps its one-way independence from
 * `agents/` — the gate validates the strings against the disclosure vocabulary,
 * which is where that vocabulary belongs.
 *
 * INVARIANT: pure projection of the parsed taxonomy — no defaults, no fallback.
 *            A kind with no entry, or an entry with no floor, returns `undefined`,
 *            which the gate treats as an UNGOVERNED class and refuses. Absence is
 *            a governance gap, never a safe default.
 * INVARIANT: deterministic — the index is built from the supplied taxonomy at
 *            construction and never mutated; no clock, no I/O, no module state.
 */
import { defaultTaxonomy, indexTaxonomy } from './taxonomy';
import type { SignalTaxonomy } from './types';

/** Looks up the data-class floor for a signal kind. `undefined` = ungoverned. */
export type ClassFloorSupplier = (signalKind: string) => readonly string[] | undefined;

/**
 * Build the class-floor supplier over a taxonomy (the shipped one by default).
 *
 * Bind the result once at a composition root and pass it to the gate; do not
 * re-implement the lookup at a call site.
 */
export function taxonomyClassFloor(tax: SignalTaxonomy = defaultTaxonomy()): ClassFloorSupplier {
  const { bySignalType } = indexTaxonomy(tax);
  return (signalKind: string) => bySignalType.get(signalKind)?.dataClassFloor;
}
