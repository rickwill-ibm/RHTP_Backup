/**
 * The AUTHORITY LOCK gate at BUILD time — definitions vs the reviewed lock.
 *
 * Byte-equality between a generated manifest and its own previous output proves
 * consistency, not safety: widening a tool allowlist and regenerating satisfies
 * it. The lock is an INDEPENDENT, separately-reviewed record of the authority
 * each agent may hold, so the compiler can only ever NARROW authority.
 *
 * The rules themselves live in @/lib/agents/authority, because the SAME rules
 * are applied again at load time to whatever manifest the process actually got
 * — including one a production loader fetched from a store, which this
 * build-time gate never sees. Two copies of a security rule is one copy too
 * many.
 */
import { assertWithinAuthorityLock as assertShared } from '@/lib/agents/authority';
import { AdlError } from './errors';
import type { AgentDefinition, AuthorityLockFile } from './types';

/**
 * Assert every definition is within its locked authority.
 *
 * The declared data classes are LIFTED OUT of `dataCapability` explicitly. A
 * definition structurally satisfies AuthoritySubject without them — TypeScript
 * would read `dataClasses` as absent and the subset check would pass vacuously,
 * which is the quietest way a gate can fail open.
 */
export function assertWithinAuthorityLock(
  defs: readonly AgentDefinition[],
  lock: AuthorityLockFile
): void {
  const subjects = defs.map((d) => ({
    id: d.id,
    toolAllowlist: d.toolAllowlist,
    autonomyTier: d.autonomyTier,
    phiPosture: d.phiPosture,
    escalationPolicyRef: d.escalationPolicyRef,
    dataClasses: d.dataCapability?.dataClasses ?? [],
  }));
  assertShared(subjects, lock, (path, detail) => new AdlError('ADL_AUTHORITY_LOCK', path, detail));
}
