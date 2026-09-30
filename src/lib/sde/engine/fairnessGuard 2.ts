// CONTRACT: C-FAIRNESS
/**
 * The §92.210 guard on the disposition engine's real path.
 *
 * WHY IT LIVES HERE AND NOT IN `lib/fairness`. E14 refused the fairness module as "built but reached
 * by no real entry point — do not just unit-test it", and it was right: a lock enforced only by a
 * build gate is a document with a linter. The identification duty attaches to the USE of a patient
 * care decision support tool, and `disposeBatch` is the use. So the assertion runs there.
 *
 * MEMOISED, deliberately. The check is over a frozen list and a frozen lock; running it per fold
 * would be a per-member cost for a per-build fact. It runs once and then the answer cannot change
 * without a reload, which is the same lifetime the authority lock's load-time gate has.
 */
import {
  assertFieldsIdentified,
  ENGINE_READ_FIELDS,
  loadFairnessLock,
  mitigationCurrency,
  type FairnessLockEntry,
} from '@/lib/fairness';

let checked = false;

/**
 * Refuse to dispose over an input variable nobody has reviewed.
 *
 * Throws. A fold that ran anyway would be the platform making member decisions on inputs it has not
 * identified, which is the thing 92.210(b) is about — and a warning would be a control that reports
 * rather than one that binds.
 */
export function assertEngineInputsIdentified(): void {
  if (checked) return;
  assertFieldsIdentified(ENGINE_READ_FIELDS, loadFairnessLock());
  checked = true;
}

/** Test seam: forget the memoised result so a test can drive the assertion again. */
export function resetFairnessGuardForTest(): void {
  checked = false;
}

/**
 * The identified inputs whose mitigation review is out of date AS AT a decision.
 *
 * RETURNS rather than throws, and that is the design. Refusing to run on a stale review would stop
 * the platform on a calendar date — the bug this programme already had to fix once, when a seeded
 * credentialing epoch would have expired every reviewer's licence on a fixed day. "Ongoing duty" in
 * 92.210(b) is satisfied by a live review cadence with an escalation on breach, not by a binary, and
 * it is certainly not violated by declining to brick.
 *
 * The caller's remedy is DEMOTION — surface it, route it to the escalation plane, drop the affected
 * path to human-gated — never process death.
 */
export function staleMitigations(asOfMs: number): FairnessLockEntry[] {
  return loadFairnessLock().entries.filter(
    (e) => e.toolScope !== 'administrative-excluded' && !mitigationCurrency(e, asOfMs).current
  );
}
