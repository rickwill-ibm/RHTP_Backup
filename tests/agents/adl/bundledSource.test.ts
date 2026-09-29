/**
 * The bundled (statically imported, no-filesystem) DefinitionSource.
 *
 * What is actually at risk here, and therefore what is pinned:
 *
 *   1. PARITY WITH THE FILESYSTEM SOURCE — the bundled source must load the SAME
 *      definition set the build-time fs source does. If the two diverge (a new
 *      `*.agent.json` added to data/ and not to the bundle), the BFF route would
 *      attest an authority set that is not the one `adl:check` verifies. That is
 *      the exact class of two-sources-of-truth defect the ADL exists to remove,
 *      so it is a test, not a convention.
 *   2. THE SEMANTIC/BYTE DISTINCTION IS REAL — `readTextFile` returns canonical
 *      bytes, not committed bytes. This suite proves the compiled output is
 *      identical either way (so the route's attestation is sound) AND that the
 *      committed text itself is NOT reproduced (so nobody upgrades the route's
 *      'semantic' label to 'byte' on the strength of a passing test).
 *   3. AN UNKNOWN PATH REFUSES — never an empty string, which would surface as a
 *      JSON parse error at a path nobody typed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AdlError,
  compile,
  loadArtifactVersions,
  loadAuthorityLock,
  loadDefinitions,
  serializeStable,
  type DefinitionSource,
} from '@/lib/agents/adl';
import {
  BUNDLED_ARTIFACT_VERSIONS_PATH,
  BUNDLED_AUTHORITY_LOCK_PATH,
  BUNDLED_COMMITTED_ARTIFACTS,
  bundledSource,
} from '@/lib/agents/adl/ingest/bundledSource';

const ROOT = process.cwd();
const ADL_DATA = join(ROOT, 'src/lib/agents/adl/data');
const LOCK_PATH = join(ROOT, 'src/lib/agents/authority/data/authority-lock.json');
const VERSIONS_PATH = join(ADL_DATA, 'artifact-versions.json');

/** The build-time source, for the parity comparison. */
const fsSource: DefinitionSource = {
  listDefinitionFiles: () =>
    readdirSync(ADL_DATA)
      .filter((f) => f.endsWith('.agent.json'))
      .map((f) => join(ADL_DATA, f)),
  readTextFile: (p) => readFileSync(p, 'utf8'),
};

describe('bundledSource — parity with the filesystem source', () => {
  it('lists exactly the committed *.agent.json files (no bundle drift)', () => {
    const bundled = bundledSource
      .listDefinitionFiles()
      .map((p) => p.split('/').pop())
      .sort();
    const onDisk = readdirSync(ADL_DATA)
      .filter((f) => f.endsWith('.agent.json'))
      .sort();
    expect(bundled).toEqual(onDisk);
  });

  it('loads a definition set deep-equal to the filesystem source', () => {
    expect(loadDefinitions(bundledSource)).toEqual(loadDefinitions(fsSource));
  });

  it('parses the authority lock and the artifact versions to the same values', () => {
    expect(loadAuthorityLock(bundledSource, BUNDLED_AUTHORITY_LOCK_PATH)).toEqual(
      loadAuthorityLock(fsSource, LOCK_PATH)
    );
    expect(loadArtifactVersions(bundledSource, BUNDLED_ARTIFACT_VERSIONS_PATH)).toEqual(
      loadArtifactVersions(fsSource, VERSIONS_PATH)
    );
  });

  it('compiles byte-identical artifacts from either source', () => {
    const versions = loadArtifactVersions(bundledSource, BUNDLED_ARTIFACT_VERSIONS_PATH);
    const fromBundle = compile(
      loadDefinitions(bundledSource),
      loadAuthorityLock(bundledSource, BUNDLED_AUTHORITY_LOCK_PATH),
      versions
    );
    const fromDisk = compile(
      loadDefinitions(fsSource),
      loadAuthorityLock(fsSource, LOCK_PATH),
      versions
    );
    expect(fromBundle).toEqual(fromDisk);
  });
});

describe('bundledSource — the semantic/byte distinction is real, not rhetorical', () => {
  it('readTextFile returns CANONICAL text, not the committed bytes', () => {
    const lockOnDisk = readFileSync(LOCK_PATH, 'utf8');
    const lockFromBundle = bundledSource.readTextFile(BUNDLED_AUTHORITY_LOCK_PATH);
    // Same parsed content …
    expect(JSON.parse(lockFromBundle)).toEqual(JSON.parse(lockOnDisk));
    // … and canonical form, which is what makes a BYTE-level drift claim through
    // this source unavailable. The route must therefore label its check 'semantic'.
    expect(lockFromBundle).toBe(serializeStable(JSON.parse(lockOnDisk)));
  });

  it('exposes the committed generated artifacts, and NOT as definition inputs', () => {
    expect(BUNDLED_COMMITTED_ARTIFACTS.manifest).toBeTruthy();
    expect(BUNDLED_COMMITTED_ARTIFACTS.routing).toBeTruthy();
    // A generated artifact must never be offered to the definition parser.
    expect(bundledSource.listDefinitionFiles().join(',')).not.toMatch(
      /agent-manifests|agent-routing/
    );
  });
});

describe('bundledSource — an unknown path refuses', () => {
  it('throws AdlError(ADL_SHAPE) rather than returning an empty string', () => {
    expect(() => bundledSource.readTextFile('adl/data/no-such-agent.agent.json')).toThrow(AdlError);
    try {
      bundledSource.readTextFile('adl/data/no-such-agent.agent.json');
      expect.fail('an unknown path must refuse');
    } catch (err) {
      expect((err as AdlError).code).toBe('ADL_SHAPE');
      expect((err as AdlError).path).toBe('adl/data/no-such-agent.agent.json');
    }
  });

  it('refuses a prototype key, so hasOwnProperty is the real lookup', () => {
    expect(() => bundledSource.readTextFile('toString')).toThrow(AdlError);
    expect(() => bundledSource.readTextFile('constructor')).toThrow(AdlError);
  });
});
