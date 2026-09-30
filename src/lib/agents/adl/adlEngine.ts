// CONTRACT: C-ADL
/**
 * The ADL compiler.
 *
 * definitions (+ authority lock) -> canonical manifest + routing bytes.
 *
 * The compile step is pure and deterministic: same definitions in, same bytes
 * out. Three gates run before any output is produced —
 *   1. the authority lock (security): compiled authority must be within the
 *      separately-reviewed lock, so the compiler can only narrow, never widen;
 *   2. stale grants (security): every lock entry must have a definition, so a
 *      grant to a deleted agent cannot sit in the ceiling accumulating;
 *   3. drift (consistency): the committed artifacts must equal the compiled
 *      bytes, so nobody can hand-edit generated authority.
 *
 * Gate 2 lives HERE and nowhere else. This is the only place the FULL ADL
 * definition roster and the lock are both in hand — the load-time manifest gate
 * sees whatever subset a store-backed loader served, against which a correct lock
 * looks full of stale grants. See `@/lib/agents/authority` lockSchema's header.
 */
import { serializeStable } from './canonical';
import { AdlError } from './errors';
import { assertWithinAuthorityLock } from './authorityLock';
import { assertNoOrphanLockEntries } from '@/lib/agents/authority';
import { projectManifest, projectRouting } from './projections';
import { assertUniqueIds } from './schema';
import type { AgentDefinition, AuthorityLockFile } from './types';

/** The generated authority artifacts, as canonical bytes. */
export interface CompiledArtifacts {
  manifestJson: string;
  routingJson: string;
}

/** File versions stamped into the generated artifacts. */
export interface ArtifactVersions {
  manifest: string;
  routing: string;
}

/**
 * Compile a definition set. Refuses duplicates, then enforces the authority lock
 * in both directions — no definition may exceed its grant, and no grant may
 * outlive its definition — then projects. Nothing is emitted if any gate fails.
 */
export function compile(
  defs: readonly AgentDefinition[],
  lock: AuthorityLockFile,
  versions: ArtifactVersions
): CompiledArtifacts {
  assertUniqueIds(defs);
  assertWithinAuthorityLock(defs, lock);
  assertNoOrphanLockEntries(
    lock,
    new Set(defs.map((d) => d.id)),
    (path, detail) => new AdlError('ADL_AUTHORITY_LOCK', path, detail)
  );
  return {
    manifestJson: serializeStable(projectManifest(defs, versions.manifest)),
    routingJson: serializeStable(projectRouting(defs, versions.routing)),
  };
}

/**
 * Assert the committed artifacts equal the compiled output. This catches a
 * hand-edit of a generated file; it is NOT the security control — the authority
 * lock is. Both run, and both must pass.
 */
export function assertNoDrift(compiled: CompiledArtifacts, committed: CompiledArtifacts): void {
  if (compiled.manifestJson !== committed.manifestJson) {
    throw new AdlError(
      'ADL_DRIFT',
      'agent-manifests.json',
      'committed manifest differs from the compiled definitions — regenerate, do not hand-edit'
    );
  }
  if (compiled.routingJson !== committed.routingJson) {
    throw new AdlError(
      'ADL_DRIFT',
      'agent-routing.json',
      'committed routing differs from the compiled definitions — regenerate, do not hand-edit'
    );
  }
}
