// CONTRACT: C-FAIRNESS
/**
 * THE §92.210 LOCK — validation of the reviewed identification-and-mitigation record.
 *
 * WHY A SEPARATE LOCK FILE AND NOT A FIELD ON THE AGENT DEFINITION. The first design put a
 * `decisionSupport` block inside each `.agent.json`. Adversarial review killed it on a structural
 * ground worth restating, because it is the same ground `authority-lock.json` stands on. That lock
 * is a control rather than a form because of four properties:
 *
 *   1. it is a SEPARATE file from the definitions it governs;
 *   2. the compiler may only NARROW relative to it;
 *   3. it is re-applied AT LOAD, rebuilding rather than inspecting;
 *   4. an ORPHAN entry is refused, so it cannot rot quietly.
 *
 * A `decisionSupport` block has none of them. It lives inside the artifact it governs, written by
 * that artifact's own author, with nothing to compare against — and no structural check can
 * distinguish a considered declaration from `[]`. OCR's own reasonable-efforts factors include
 * "whether the covered entity has a methodology or process in place for evaluating" its tools. Five
 * agents self-declaring, reviewed by nobody, is the form-someone-filled-in that factor exists to
 * distinguish against.
 *
 * WHY THE LOCK IS KEYED ON FIELDS AND NOT AGENTS. §92.210(b) attaches to "input variables or factors
 * that measure" — the unit of regulation is the input. In this repo those are not the same object:
 * `outreach-agent.agent.json` holds no scoring logic at all, the factors live in `sde/engine/rules.ts`
 * and a policy pack, and all of it can change without touching a single agent definition. A
 * per-agent record stays green while the scoring surface is edited.
 *
 * WHAT FAILS CLOSED, AND WHEN — the half this module gets to enforce.
 *
 * PRESENCE fails closed at load. Whether every field the engine reads has a reviewed entry is a
 * property of the repository: it cannot go stale, so it can never brick the platform on a calendar
 * date — which is the failure this programme has already had to fix once, when a seeded credentialing
 * epoch would have expired every reviewer's licence on 2027-06-01.
 *
 * CURRENCY does NOT fail closed here. A mitigation review has a date and reviews go stale; refusing
 * to load on staleness would stop the platform working on a calendar date, and "ongoing duty" in (b)
 * is satisfied by a live review cadence with an escalation on breach, not by a binary. Staleness is
 * evaluated AS AT the decision instant with an injected clock (see `mitigationCurrency`), and its
 * failure mode is DEMOTION — the tool drops to human-gated — never process death.
 */
import {
  FairnessLockError,
  PROTECTED_BASES,
  type FairnessLockEntry,
  type FairnessLockFile,
  type ProtectedBasis,
} from './types';

/**
 * The evidence reference a mitigation may NOT cite.
 *
 * `goldenThread/flowSim.runFairnessScreen` synthesises its four-fifths ratio from
 * `0.86 - denyRate * 1.2` plus a seeded variance term, and its own header says "the cohort split is
 * modeled, not from real member data". A mitigation record citing it would make a modelled number
 * the evidence for a regulatory claim — the one move here that converts a demo shortcut into a false
 * compliance assertion.
 */
const FORBIDDEN_EVIDENCE = /flowSim|runFairnessScreen|goldenThread\/flowSim/i;

function isBasis(v: unknown): v is ProtectedBasis {
  return typeof v === 'string' && (PROTECTED_BASES as readonly string[]).includes(v);
}

/** Validate one entry's shape and its internal consistency. Throws on the first defect. */
export function assertEntryComplete(e: FairnessLockEntry): void {
  if (!e.field || e.field.trim().length === 0)
    throw new FairnessLockError('(unnamed)', 'an entry with no field names nothing');
  if (!e.basis || e.basis.trim().length < 20)
    throw new FairnessLockError(e.field, 'basis must say WHY, in prose a reviewer can read');
  for (const m of e.measures)
    if (!isBasis(m))
      throw new FairnessLockError(e.field, `"${String(m)}" is not one of the six bases`);

  if (e.toolScope === 'administrative-excluded') {
    // Claiming out of scope costs the same review as claiming a mitigation. That symmetry is the
    // only thing stopping every field from being declared administrative and the artifact empty.
    if (!e.exclusionBasis || e.exclusionBasis.trim().length < 20)
      throw new FairnessLockError(
        e.field,
        'administrative-excluded requires an exclusionBasis — 45 CFR 92.4 reaches tools that support ' +
          'clinical decision-making, and saying a field is outside that is a reviewed claim'
      );
    if (e.measures.length > 0)
      throw new FairnessLockError(
        e.field,
        'declared administrative-excluded while also declaring it MEASURES a protected basis — those ' +
          'cannot both be true, and the combination is how a field gets identified and then ignored'
      );
    return;
  }

  // In scope (or contested): (c) requires a mitigation for each identified tool.
  if (e.measures.length === 0)
    throw new FairnessLockError(
      e.field,
      'in scope but measures nothing — either it measures a basis, or it is administrative-excluded ' +
        'with a stated basis. An in-scope entry measuring nothing is a row that asserts no duty'
    );
  const m = e.mitigation;
  if (!m)
    throw new FairnessLockError(
      e.field,
      '92.210(c) requires a mitigation for each identified input'
    );
  if (!m.measure || m.measure.trim().length < 20)
    throw new FairnessLockError(e.field, 'mitigation must state what was DONE, not an intention');
  if (!m.reviewedBy || m.reviewedBy.trim().length === 0)
    throw new FairnessLockError(
      e.field,
      'mitigation needs an accountable reviewer (see 45 CFR 92.7)'
    );
  if (!Number.isFinite(m.reviewedAtMs) || m.reviewedAtMs <= 0)
    throw new FairnessLockError(
      e.field,
      'mitigation needs a review date — "ongoing duty" has a clock'
    );
  if (!m.evidenceRef || m.evidenceRef.trim().length === 0)
    throw new FairnessLockError(e.field, 'mitigation needs an evidence reference');
  // The prose too, not only the reference. "four-fifths ratio of 0.86 per the fairness screen" in a
  // `measure` or a `basis` would have passed while the `evidenceRef` pointed somewhere respectable.
  for (const [label, text] of [
    ['measure', m.measure],
    ['basis', e.basis],
  ] as const)
    if (FORBIDDEN_EVIDENCE.test(text))
      throw new FairnessLockError(
        e.field,
        `${label} cites the SIMULATED fairness screen. Its ratio is synthesised from a formula plus a ` +
          'seeded variance term; quoting it anywhere in this record makes a modelled number the ' +
          'evidence for a regulatory claim'
      );
  if (FORBIDDEN_EVIDENCE.test(m.evidenceRef))
    throw new FairnessLockError(
      e.field,
      'mitigation cites the SIMULATED fairness screen as evidence. That ratio is synthesised from a ' +
        'formula plus a seeded variance term and its own header says the cohort split is modeled — ' +
        'citing it would make a modelled number the evidence for a regulatory claim'
    );
}

/** Parse and validate a whole lock file. Refuses duplicates: two reviews of one field is neither. */
export function parseFairnessLock(data: unknown, path: string): FairnessLockFile {
  const o = data as Partial<FairnessLockFile> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.entries))
    throw new FairnessLockError(path, 'not a fairness lock file (expected { version, entries[] })');
  const seen = new Set<string>();
  for (const e of o.entries) {
    assertEntryComplete(e);
    if (seen.has(e.field))
      throw new FairnessLockError(e.field, 'appears twice — two reviews of one field is neither');
    seen.add(e.field);
  }
  return { version: String(o.version ?? '0.0.0'), entries: o.entries };
}

/**
 * THE IDENTIFICATION ASSERTION: every field the engine reads has a reviewed entry.
 *
 * UNLISTED FIELD = REFUSE. This is what makes the artifact identification BY CONSTRUCTION rather
 * than by assertion. A declaration-based design asks an author "which of your inputs measure a
 * protected characteristic", and the answer is `[]` unless they happen to think of `channelPreference`
 * as a disability proxy — which nobody does, which is why all five proxies in this codebase were
 * invisible. Enumerating the fields and refusing the ones nobody has reviewed inverts that: a new
 * input variable cannot reach a member decision until someone has written down what it measures,
 * even if the honest answer is "nothing, and here is why".
 *
 * `orphans` is the other direction, and it matters for the same reason it matters in the authority
 * lock: an entry for a field that no longer exists is a review nobody is doing, sitting in a file
 * that looks complete.
 */
export function assertFieldsIdentified(
  readFields: readonly string[],
  lock: FairnessLockFile
): void {
  // The injected `raise` seam this used to carry was supplied by no caller — the same dead-seam class
  // as a parameter nobody passes. One error type, thrown directly.
  const raise = (f: string, d: string): Error => new FairnessLockError(f, d);
  const byField = new Map(lock.entries.map((e) => [e.field, e]));
  for (const f of readFields) {
    if (!byField.has(f))
      throw raise(
        f,
        'is read by the decision engine and has NO reviewed fairness entry. 45 CFR 92.210(b) is an ' +
          'ongoing duty to identify inputs that measure a protected characteristic; an input nobody ' +
          'has looked at is unidentified by definition. Add an entry saying what it measures — or ' +
          'that it measures nothing, with the basis for saying so'
      );
  }
  const read = new Set(readFields);
  for (const e of lock.entries) {
    if (!read.has(e.field))
      throw raise(
        e.field,
        'has a reviewed fairness entry but is no longer read by the decision engine. An orphan entry ' +
          'is a review nobody is doing, in a file that looks complete'
      );
  }
}

/**
 * Is a mitigation review current AS AT a decision?
 *
 * Returns rather than throws, and the caller DEMOTES on a stale review — drops the tool to
 * human-gated — instead of failing the process. Refusing to run on a stale review would stop the
 * platform on a calendar date, which is the bug this programme fixed in the credentialing seed; and
 * "ongoing duty" is satisfied by a live cadence with an escalation on breach, not by a binary.
 *
 * `MITIGATION_REVIEW_INTERVAL_MS` is a cadence, not a regulatory number: OCR sets no interval. It is
 * deliberately annual so that "reviewed at some point" cannot pass for "reviewed".
 */
export const MITIGATION_REVIEW_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;

export function mitigationCurrency(
  entry: FairnessLockEntry,
  asOfMs: number
): { current: boolean; ageMs: number } {
  const reviewedAtMs = entry.mitigation?.reviewedAtMs ?? 0;
  const ageMs = asOfMs - reviewedAtMs;
  return { current: reviewedAtMs > 0 && ageMs <= MITIGATION_REVIEW_INTERVAL_MS, ageMs };
}
