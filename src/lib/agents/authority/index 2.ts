/**
 * Authority lock — public surface. One comparison, two callers: the ADL
 * compiler at build time and the manifest registry at load time.
 */
export { assertWithinAuthorityLock, assertUniqueLockEntries } from './assertAuthority';
export {
  parseAuthorityLockFile,
  assertNoOrphanLockEntries,
  AuthorityLockShapeError,
  LOCK_CODE_PATTERN,
  type ParseAuthorityLockOptions,
} from './lockSchema';
export { default as authorityLockData } from './data/authority-lock.json';
export {
  AUTONOMY_ORDER,
  PHI_ORDER,
  type AutonomyTier,
  type PhiPosture,
  type AuthorityLockEntry,
  type AuthorityLockFile,
  type AuthoritySubject,
  type AuthorityViolation,
} from './types';
