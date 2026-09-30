// CONTRACT: C-AUTHORITY
/**
 * The authority lock at LOAD time.
 *
 * WHY A SECOND GATE. The ADL compiler checks agent DEFINITIONS against the lock
 * at build time. That protects the repository and nothing else: a store-backed
 * loader installed by `setProductionManifestLoader` serves manifests the
 * compiler never saw, and `AgentManifestRegistry` has a public constructor. A
 * build-time-only lock is a statement about a git tree, not about a process.
 *
 * WHY IT REBUILDS RATHER THAN INSPECTS. An earlier version called
 * `loaded.list()` and, if that passed, returned `loaded`. `list()` is a virtual
 * method on a caller-supplied object, and the natural shape of a store-backed
 * registry is lazy — `list()` returns a warm cache while `get()` hits the store.
 * The gate would have checked the cache and callers would have used `get()`.
 * So the gate now takes the manifests it verified and builds a NEW registry
 * from them. Whatever a loader declines to list is not merely ungoverned, it is
 * absent: the checked set and the served set are the same object by
 * construction, not by the loader's good behaviour.
 */
import {
  assertWithinAuthorityLock,
  authorityLockData,
  parseAuthorityLockFile,
  type AuthorityLockFile,
} from '@/lib/agents/authority';
import { AgentManifestError, type AgentManifest } from './types';

/**
 * The shipped lock, PARSED and DEEP-FROZEN rather than cast.
 *
 * It is a process-wide singleton read by the registry gate and the preset
 * clamp. Handed out by reference and unfrozen, a single assignment anywhere
 * would permanently raise the ceiling for every later check in the process.
 */
const SHIPPED_LOCK: AuthorityLockFile = parseAuthorityLockFile(
  authorityLockData,
  'src/lib/agents/authority/data/authority-lock.json'
);

/**
 * Assert a set of loaded manifests is within a reviewed authority lock.
 *
 * `lock` defaults to the shipped one. It is a parameter because a deployment
 * may ship its own reviewed lock, and because a test modelling a widened
 * ceiling must widen the LOCK rather than step around the check. It is NOT
 * exported from the module barrel, and tests/agents/authorityWiring.test.ts
 * asserts no application code passes one — a constraint that is checked rather
 * than merely asserted in a comment.
 */
export function assertManifestsWithinLock(
  manifests: readonly AgentManifest[],
  lock: AuthorityLockFile = SHIPPED_LOCK
): void {
  if (manifests.length === 0) {
    // An empty set passes every subset check vacuously. A registry with no
    // agents is a misconfigured store, not a maximally-restricted deployment.
    throw new AgentManifestError(
      'agents',
      'authority lock: the manifest set is empty — an empty set satisfies every ' +
        'authority check vacuously, so it is refused rather than treated as safe'
    );
  }
  assertWithinAuthorityLock(
    manifests,
    lock,
    (path, detail) => new AgentManifestError(path, `authority lock: ${detail}`)
  );
}

/** The lock the running process is governed by. Deep-frozen; safe to hand out. */
export function shippedAuthorityLock(): AuthorityLockFile {
  return SHIPPED_LOCK;
}
