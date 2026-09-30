// CONTRACT: C-AUTHORITY
/**
 * The authority comparison. Pure; no IO, no clock, no module dependencies.
 *
 * INVARIANT: a subject's tool set MUST be a subset of the locked tool set.
 * INVARIANT: a subject's autonomy tier MUST NOT exceed the locked maximum.
 * INVARIANT: a subject's PHI posture MUST NOT exceed the locked maximum.
 * INVARIANT: a subject absent from the lock has NO authority — fail closed.
 * INVARIANT: a duplicate lock entry is refused; a second entry for the same
 *            agent would shadow the first and silently widen its ceiling.
 */
import {
  AUTONOMY_ORDER,
  PHI_ORDER,
  type AuthorityLockEntry,
  type AuthorityLockFile,
  type AuthoritySubject,
  type AuthorityViolation,
} from './types';

function rank(
  order: readonly string[],
  value: string,
  path: string,
  raise: AuthorityViolation
): number {
  const i = order.indexOf(value);
  if (i < 0) throw raise(path, `unknown value "${value}"`);
  return i;
}

/** Refuse a lock whose entries are not unique by agent id. */
export function assertUniqueLockEntries(
  entries: readonly AuthorityLockEntry[],
  raise: AuthorityViolation
): void {
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.agentId)) {
      throw raise(
        e.agentId,
        'duplicate lock entry — a second entry would silently shadow the first and widen authority'
      );
    }
    seen.add(e.agentId);
  }
}

function checkOne(s: AuthoritySubject, entry: AuthorityLockEntry, raise: AuthorityViolation): void {
  const locked = new Set(entry.tools);
  const excess = s.toolAllowlist.filter((t) => !locked.has(t));
  if (excess.length > 0) {
    throw raise(
      `${s.id}.toolAllowlist`,
      `tool(s) not permitted by the authority lock: ${excess.join(', ')} — ` +
        'widening an allowlist requires a reviewed authority-lock change'
    );
  }
  if (
    rank(AUTONOMY_ORDER, s.autonomyTier, `${s.id}.autonomyTier`, raise) >
    rank(AUTONOMY_ORDER, entry.maxAutonomyTier, `${s.id}.maxAutonomyTier`, raise)
  ) {
    throw raise(
      `${s.id}.autonomyTier`,
      `tier "${s.autonomyTier}" exceeds locked maximum "${entry.maxAutonomyTier}"`
    );
  }
  if (
    rank(PHI_ORDER, s.phiPosture, `${s.id}.phiPosture`, raise) >
    rank(PHI_ORDER, entry.maxPhiPosture, `${s.id}.maxPhiPosture`, raise)
  ) {
    throw raise(
      `${s.id}.phiPosture`,
      `posture "${s.phiPosture}" exceeds locked maximum "${entry.maxPhiPosture}"`
    );
  }
  // Declared data classes must be a subset of the locked set. An absent lock
  // entry means none are granted: a new class is a reviewed change, never a
  // line an agent adds to its own definition.
  const lockedClasses = new Set(entry.dataClasses ?? []);
  const excessClasses = (s.dataClasses ?? []).filter((c) => !lockedClasses.has(c));
  if (excessClasses.length > 0) {
    throw raise(
      `${s.id}.dataClasses`,
      `data class(es) not permitted by the authority lock: ${excessClasses.join(', ')} — ` +
        'widening the classes an agent may request requires a reviewed authority-lock change'
    );
  }
  if (s.escalationPolicyRef !== entry.escalationPolicyRef) {
    throw raise(
      `${s.id}.escalationPolicyRef`,
      `"${s.escalationPolicyRef}" does not match locked "${entry.escalationPolicyRef}"`
    );
  }
}

/**
 * Assert every subject is within its locked authority. A subject missing from
 * the lock is refused outright — authority is never acquired merely by showing
 * up, whether in a definitions directory at build time or in a manifest blob a
 * production loader returned at runtime.
 */
export function assertWithinAuthorityLock(
  subjects: readonly AuthoritySubject[],
  lock: AuthorityLockFile,
  raise: AuthorityViolation
): void {
  assertUniqueLockEntries(lock.entries, raise);
  const byId = new Map(lock.entries.map((e) => [e.agentId, e]));
  for (const s of subjects) {
    const entry = byId.get(s.id);
    if (!entry) {
      throw raise(
        s.id,
        'agent is not present in the authority lock — an agent holds no authority ' +
          'until a reviewed lock entry grants it'
      );
    }
    checkOne(s, entry, raise);
  }
}
