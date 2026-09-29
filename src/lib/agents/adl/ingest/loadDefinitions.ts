/**
 * Load definitions and the authority lock from a directory listing. IO is
 * INJECTED so the engine stays pure and testable (deterministic-engines rule).
 */
import { parseAuthorityLockFile } from '@/lib/agents/authority';
import { parseStable } from '../canonical';
import { parseAgentDefinition } from '../schema';
import { AdlError } from '../errors';
import { CODE_PATTERN } from '../types';
import type { ArtifactVersions } from '../adlEngine';
import type { AgentDefinition, AuthorityLockFile } from '../types';

/** The injected filesystem surface (node fs at the edge, a fake in tests). */
export interface DefinitionSource {
  listDefinitionFiles(): readonly string[];
  readTextFile(path: string): string;
}

/** Parse every `*.agent.json` the source lists, in sorted filename order. */
export function loadDefinitions(source: DefinitionSource): AgentDefinition[] {
  return [...source.listDefinitionFiles()]
    .sort()
    .map((file) => parseAgentDefinition(parseStable(source.readTextFile(file)), file));
}

/**
 * Parse the authority lock through the full hand validator — never a cast. The
 * lock is the security control, so it gets the same scrutiny as a definition.
 *
 * ONE PARSER, TWO GATES. This uses the same `parseAuthorityLockFile` that
 * `manifest/authorityGate.ts` runs at load time, so the build-time gate and the
 * gate that governs the running process cannot disagree about what a valid lock
 * is. Injection keeps this caller's taxonomy: refusals surface as `AdlError`
 * with the `ADL_AUTHORITY_LOCK` code, and the code rule pinned is the definition
 * language's own `CODE_PATTERN` — the same pattern applied to the codes on the
 * other side of the comparison.
 */
export function loadAuthorityLock(source: DefinitionSource, path: string): AuthorityLockFile {
  return parseAuthorityLockFile(parseStable(source.readTextFile(path)), path, {
    raise: (at, detail) => new AdlError('ADL_AUTHORITY_LOCK', at, detail),
    codePattern: CODE_PATTERN,
  });
}

/**
 * Read the artifact versions stamped into the generated files.
 *
 * These are an AUTHORED input to compilation, not something read back out of
 * the artifact being checked. A checker that takes the version from the file it
 * is verifying can never detect a version change — it would be comparing the
 * file to itself on that field.
 */
export function loadArtifactVersions(source: DefinitionSource, path: string): ArtifactVersions {
  const raw = parseStable(source.readTextFile(path));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AdlError('ADL_SHAPE', path, 'expected an object');
  }
  const o = raw as Record<string, unknown>;
  const pick = (key: 'manifest' | 'routing'): string => {
    const v = o[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new AdlError('ADL_SHAPE', `${path}.${key}`, 'expected a non-empty version string');
    }
    return v;
  };
  return { manifest: pick('manifest'), routing: pick('routing') };
}
